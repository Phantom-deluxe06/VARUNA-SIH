"""Train the VARUNA Potential Fishing Zone (PFZ) classifier.

The model is an offline gradient-boosting ensemble (scikit-learn) trained on a
physics-informed synthetic dataset derived from real oceanographic front
mechanics, so VARUNA never depends on a cloud ML API:

* Thermal-front aggregation: pelagic fish concentrate along thermal gradients
  (|grad SST|) where nutrient-rich upwelling meets warm oligotrophic water.
* Chlorophyll banding: productive waters show chlorophyll-a in the 0.2-2.0
  mg/m3 band with measurable frontal gradients (|grad chl|).
* Bathymetric prior: PFZ activity peaks on the continental shelf (5-60 km
  from shore) and decays in deep offshore water.

The label function encodes these smooth priors with realistic noise, and the
classifier generalises them to real satellite feature vectors at inference.

Features : [sst, chlorophyll, sst_gradient, chl_gradient, distance_to_shore]
Target   : is_pfz (1 = High PFZ, 0 = Low/Dispersed)
Export   : app/ml/pfz_model.joblib
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

logger = logging.getLogger("varuna.ml.train")

MODEL_PATH = Path(__file__).resolve().parent / "pfz_model.joblib"
META_PATH = Path(__file__).resolve().parent / "pfz_model_meta.json"
FEATURE_NAMES = ["sst", "chlorophyll", "sst_gradient", "chl_gradient", "distance_to_shore"]
N_SAMPLES = 40000
RANDOM_SEED = 42


def _pfz_label_function(
    sst: np.ndarray,
    chl: np.ndarray,
    sst_grad: np.ndarray,
    chl_grad: np.ndarray,
    dist_shore: np.ndarray,
) -> np.ndarray:
    """Smooth oceanographic prior P(PFZ | features) in [0, 1]."""
    # 1. Thermal window: tropical fish activity peaks between 26-30.5 degC.
    thermal = np.exp(-((sst - 28.2) ** 2) / (2.0 * 1.6 ** 2))

    # 2. Productivity band: chlorophyll sweet spot around 0.2-2.0 mg/m3
    #    (log-normal shape centred at ~0.7, penalising bloom/haze extremes).
    productivity = np.exp(-((np.log(np.clip(chl, 0.05, 10.0) / 0.7)) ** 2) / (2.0 * 0.75 ** 2))

    # 3. Front strength: thermal fronts are the dominant PFZ precursor.
    front = 1.0 - np.exp(-1.6 * sst_grad) * np.exp(-0.9 * chl_grad)

    # 4. Bathymetric prior: continental shelf (5-60 km) is the fishing band.
    shelf = np.exp(-((np.log(np.clip(dist_shore, 1.0, 200.0) / 25.0)) ** 2) / (2.0 * 0.9 ** 2))

    score = 0.38 * front + 0.27 * productivity + 0.23 * thermal + 0.12 * shelf
    return score


def build_training_set(n_samples: int = N_SAMPLES, seed: int = RANDOM_SEED):
    """Generate the physics-informed feature matrix and binary labels."""
    rng = np.random.default_rng(seed)
    sst = rng.uniform(24.0, 31.5, n_samples)                                   # degC
    chl = np.exp(rng.uniform(np.log(0.05), np.log(6.0), n_samples))            # mg/m3 (log-normal)
    sst_grad = rng.gamma(shape=2.0, scale=0.28, size=n_samples)                   # degC/deg
    chl_grad = rng.gamma(shape=2.0, scale=0.14, size=n_samples)                   # mg/m3/deg
    dist_shore = np.exp(rng.uniform(np.log(1.0), np.log(200.0), n_samples))    # km

    score = _pfz_label_function(sst, chl, sst_grad, chl_grad, dist_shore)
    noise = rng.normal(0.0, 0.035, n_samples)                                  # label noise
    is_pfz = (score + noise > 0.5).astype(int)

    X = np.column_stack([sst, chl, sst_grad, chl_grad, dist_shore])
    return X, is_pfz


def train() -> dict:
    """Train, evaluate, and export the PFZ classifier. Returns training meta."""
    X, y = build_training_set()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y,
    )

    model = GradientBoostingClassifier(
        n_estimators=300,
        learning_rate=0.06,
        max_depth=3,
        subsample=0.85,
        random_state=RANDOM_SEED,
    )
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    y_pred = (proba >= 0.5).astype(int)
    accuracy = float((y_pred == y_test).mean())
    auc = float(roc_auc_score(y_test, proba))
    report = classification_report(y_test, y_pred, output_dict=True)

    joblib.dump(
        {
            "model": model,
            "feature_names": FEATURE_NAMES,
        },
        MODEL_PATH,
    )
    meta = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "estimator": "GradientBoostingClassifier",
        "n_samples": int(len(y)),
        "feature_names": FEATURE_NAMES,
        "accuracy": round(accuracy, 4),
        "roc_auc": round(auc, 4),
        "f1_pfz": round(float(report["1"]["f1-score"]), 4),
        "positive_rate": round(float(y.mean()), 4),
    }
    META_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    logger.info("Model exported to %s | accuracy=%.4f auc=%.4f", MODEL_PATH, accuracy, auc)
    return meta


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    print("=" * 64)
    print("VARUNA PFZ Model Trainer (offline, physics-informed)")
    print("=" * 64)
    info = train()
    for key, value in info.items():
        print(f"  {key:>16}: {value}")
    print(f"  {'model_file':>16}: {MODEL_PATH}")

    # Sanity-check inference on representative feature vectors.
    from app.ml.predictor import predict_pfz

    probes = [
        ("Classic front PFZ", 28.4, 0.85, 0.62, 0.30, 22.0),
        ("Warm stratified",   30.8, 0.25, 0.05, 0.02, 120.0),
        ("Cool bloom",        25.5, 3.80, 0.10, 0.45, 8.0),
        ("Shelf front edge",  27.9, 1.40, 0.48, 0.22, 12.0),
    ]
    for label, s, c, sg, cg, d in probes:
        flag, conf = predict_pfz(s, c, sg, cg, d)
        print(f"  {label:<20}: is_pfz={flag} confidence={conf:.3f}")
    print("=" * 64)
