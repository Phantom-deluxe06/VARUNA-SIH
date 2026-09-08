"""VARUNA PFZ inference module.

Loads the offline-trained gradient-boosting classifier and exposes a single
deterministic inference entry point used by the ``RasterEngine``.

Model resolution order:
1. ``pfz_model_v2.joblib`` — retrained on live Open-Meteo + NOAA data with the
   currently installed scikit-learn (:mod:`app.ml.train_real_model`).
2. ``pfz_model.joblib``    — legacy artefact (:mod:`app.ml.train_pfz_model`).
When neither loads, inference degrades gracefully to ``(False, 0.0)``.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

logger = logging.getLogger("varuna.ml.predictor")

_MODEL_DIR = Path(__file__).resolve().parent
_MODEL_CANDIDATES = (_MODEL_DIR / "pfz_model_v2.joblib", _MODEL_DIR / "pfz_model.joblib")


def _resolve_model_path() -> Path:
    for path in _MODEL_CANDIDATES:
        if path.exists():
            return path
    return _MODEL_CANDIDATES[0]


MODEL_PATH = _resolve_model_path()

# Feature vector layout expected by the trained estimator (order matters).
FEATURE_NAMES = ["sst", "chlorophyll", "sst_gradient", "chl_gradient", "distance_to_shore"]

# Confidence below which a positive prediction is treated as "not confident".
CONFIDENCE_FLOOR = 0.60

_lock = threading.Lock()
_model = None
_model_meta: dict = {}


def _load_model():
    """Lazily load (and cache) the trained estimator. Returns None when absent."""
    global _model, _model_meta, MODEL_PATH
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        MODEL_PATH = _resolve_model_path()
        if not MODEL_PATH.exists():
            logger.warning("PFZ model not found at %s - run python -m app.ml.train_real_model", MODEL_PATH)
            return None
        import joblib

        bundle = joblib.load(MODEL_PATH)
        _model = bundle["model"] if isinstance(bundle, dict) and "model" in bundle else bundle
        _model_meta = bundle.get("meta", {}) if isinstance(bundle, dict) else {}
        meta_file = MODEL_PATH.with_name(MODEL_PATH.stem + "_meta.json")
        if not meta_file.exists():
            meta_file = MODEL_PATH.with_name("pfz_model_meta.json")
        if meta_file.exists():
            try:
                import json as _json

                _model_meta = _json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        logger.info("PFZ model loaded from %s (meta=%s)", MODEL_PATH, _model_meta)
        return _model


def reload_model() -> bool:
    """Force-reload the estimator from disk. Returns True when available."""
    global _model
    with _lock:
        _model = None
    return _load_model() is not None


def model_info() -> dict:
    """Diagnostics: model availability + training metadata."""
    return {
        "model_path": str(MODEL_PATH),
        "loaded": _model is not None,
        "exists": MODEL_PATH.exists(),
        "meta": _model_meta,
        "confidence_floor": CONFIDENCE_FLOOR,
    }


def predict_pfz(
    sst: float,
    chl: float,
    sst_grad: float,
    chl_grad: float,
    distance_to_shore_km: float = 10.0,
) -> tuple[bool, float]:
    """
    Classify a cell as a Potential Fishing Zone using the offline ML model.

    Parameters
    ----------
    sst:
        Sea surface temperature (degC).
    chl:
        Chlorophyll-a concentration (mg/m3).
    sst_grad:
        Thermal front magnitude |grad SST| (degC per degree).
    chl_grad:
        Chlorophyll front magnitude |grad chl| (mg/m3 per degree).
    distance_to_shore_km:
        Distance from shore in km (defaults to typical coastal band 10 km).

    Returns
    -------
    ``(is_pfz, confidence_score)`` where ``confidence_score`` is the predicted
    probability of the winning class in [0, 1]. When the model file is missing
    the method degrades gracefully to ``(False, 0.0)`` so callers never crash.
    """
    model = _load_model()
    if model is None:
        return False, 0.0

    features = [
        [float(sst), float(chl), float(sst_grad), float(chl_grad), float(distance_to_shore_km)]
    ]
    try:
        proba = model.predict_proba(features)[0]
        classes = list(getattr(model, "classes_", [0, 1]))
        paired = dict(zip(classes, proba))
        is_pfz = bool(paired.get(1, 0.0) >= paired.get(0, 0.0))
        confidence = float(max(paired.values()))
        # Suppress low-confidence positives to avoid noisy advisories.
        if is_pfz and confidence < CONFIDENCE_FLOOR:
            is_pfz = False
        return is_pfz, round(confidence, 4)
    except Exception as exc:  # noqa: BLE001 - inference must never crash the engine
        logger.error("PFZ inference failed: %s", exc)
        return False, 0.0
