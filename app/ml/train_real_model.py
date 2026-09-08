"""Retrain the VARUNA PFZ classifier on REAL Open-Meteo + NOAA data.

Why this file exists
--------------------
``pfz_model.joblib`` was pickled with an older scikit-learn and now raises
``No module named '_loss'`` on load. This script rebuilds the model from live
data with the *currently installed* scikit-learn, so there is no version skew.

Data sources (all key-less, free)
---------------------------------
* Open-Meteo Marine API  -> sea_surface_temperature, wave_height,
  ocean_current_velocity, swell_wave_height  (48 hourly steps per grid point)
* NOAA CoastWatch ERDDAP  -> chlorophyll-a and its spatial gradient, via
  :class:`app.services.raster_service.RasterEngine`
* Real spatial SST gradient computed from adjacent grid cells (thermal fronts)

Feature vector (unchanged 5-feature contract used across the app)
----------------------------------------------------------------
    [sst, chlorophyll, sst_gradient, chl_gradient, distance_to_shore_km]

Label (INCOIS-style Potential Fishing Zone)
-------------------------------------------
    SST in 26.0-30.5 degC  AND  wave_height < 1.5 m  AND
    (thermal-front gradient present OR measurable current)

Run:  python -m app.ml.train_real_model
Out:  app/ml/pfz_model_v2.joblib  +  app/ml/pfz_model_v2_meta.json
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

from app.services.raster_service import RasterEngine

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "pfz_model_v2.joblib"
META_PATH = HERE / "pfz_model_v2_meta.json"

FEATURE_NAMES = ["sst", "chlorophyll", "sst_gradient", "chl_gradient", "distance_to_shore"]

GRID_LATS = [8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0]
GRID_LONS = [78.0, 78.5, 79.0, 79.5, 80.0, 80.5, 81.0, 81.5, 82.0]
HOUR_STEP = 3  # sample every 3rd forecast hour -> ~16 temporal samples / point

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

# Coastline anchors (Tamil Nadu / Sri Lanka) for a distance-to-shore feature.
_COAST = [
    (13.08, 80.27), (11.93, 79.83), (10.77, 79.84), (9.28, 79.31),
    (8.80, 78.15), (8.08, 77.55), (9.66, 80.02), (9.82, 80.25),
]

_RASTER = RasterEngine()


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))


def _distance_to_shore_km(lat, lon) -> float:
    return round(min(_haversine_km(lat, lon, c[0], c[1]) for c in _COAST), 1)


def _fetch_marine(lat: float, lon: float) -> dict:
    params = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "hourly": "sea_surface_temperature,wave_height,ocean_current_velocity,swell_wave_height",
            "forecast_days": 2,
        }
    )
    req = urllib.request.Request(f"{MARINE_URL}?{params}", headers={"User-Agent": "VARUNA-train/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))["hourly"]


def collect_real_training_data():
    """Return (X, y, stats) built entirely from live Open-Meteo + NOAA data."""
    # First pass: one SST value per grid point (hour 0) for the spatial gradient.
    sst_grid: dict[tuple[int, int], float] = {}
    marine_cache: dict[tuple[float, float], dict] = {}

    print(f"Downloading Open-Meteo marine data for {len(GRID_LATS) * len(GRID_LONS)} grid points...")
    for i, lat in enumerate(GRID_LATS):
        for j, lon in enumerate(GRID_LONS):
            try:
                hourly = _fetch_marine(lat, lon)
                marine_cache[(lat, lon)] = hourly
                s0 = hourly["sea_surface_temperature"][0]
                if s0 is not None:
                    sst_grid[(i, j)] = float(s0)
                print(f"  grid {lat:>4},{lon:>5}: SST0={s0} wave0={hourly['wave_height'][0]}")
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {lat},{lon}: {exc}")
            time.sleep(0.15)

    def spatial_sst_gradient(i: int, j: int) -> float:
        here = sst_grid.get((i, j))
        if here is None:
            return 0.0
        diffs = []
        for di, dj, deg in ((1, 0, 0.5), (-1, 0, 0.5), (0, 1, 0.5), (0, -1, 0.5)):
            nb = sst_grid.get((i + di, j + dj))
            if nb is not None:
                diffs.append(abs(here - nb) / deg)
        return round(float(np.mean(diffs)), 4) if diffs else 0.0

    features: list[list[float]] = []
    labels: list[int] = []

    print("\nBuilding feature matrix (Open-Meteo hours x NOAA chlorophyll)...")
    for i, lat in enumerate(GRID_LATS):
        for j, lon in enumerate(GRID_LONS):
            hourly = marine_cache.get((lat, lon))
            if not hourly:
                continue

            # Real chlorophyll + chl gradient from NOAA ERDDAP raster.
            ocean = _RASTER.extract_ocean_data(lat, lon)
            chl = float(ocean["chlorophyll_mg_m3"])
            chl_grad = float(ocean.get("chl_gradient_mg_m3_per_deg", 0.0))
            raster_sst_grad = float(ocean.get("sst_gradient_c_per_deg", 0.0))
            dist_shore = _distance_to_shore_km(lat, lon)
            sp_grad = spatial_sst_gradient(i, j)
            # Blend the raster-derived and grid-derived thermal fronts.
            sst_gradient = round(max(sp_grad, raster_sst_grad), 4)

            n = len(hourly["sea_surface_temperature"])
            for h in range(0, n, HOUR_STEP):
                sst = hourly["sea_surface_temperature"][h]
                wave = hourly["wave_height"][h]
                cur = hourly["ocean_current_velocity"][h]
                if sst is None or wave is None:
                    continue
                sst = float(sst)
                wave = float(wave)
                cur = float(cur) if cur is not None else 0.0

                features.append([sst, chl, sst_gradient, chl_grad, dist_shore])

                is_pfz = (
                    26.0 <= sst <= 30.5
                    and wave < 1.5
                    and (sst_gradient > 0.25 or cur > 0.10)
                )
                labels.append(1 if is_pfz else 0)

    X = np.asarray(features, dtype=float)
    y = np.asarray(labels, dtype=int)
    stats = {
        "grid_points_ok": len(marine_cache),
        "samples": int(len(y)),
        "pfz_positive": int(y.sum()),
        "pfz_negative": int(len(y) - y.sum()),
    }
    return X, y, stats


def train_and_save() -> None:
    X, y, stats = collect_real_training_data()
    print(f"\nSamples: {stats['samples']}  PFZ+: {stats['pfz_positive']}  PFZ-: {stats['pfz_negative']}")

    if stats["samples"] < 50 or stats["pfz_positive"] < 5 or stats["pfz_negative"] < 5:
        raise SystemExit(
            "Not enough class balance from live data to train "
            f"({stats}). Re-run when Open-Meteo coverage is better."
        )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.9,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    auc = float(roc_auc_score(y_test, y_prob)) if len(set(y_test)) > 1 else None

    print("\n" + classification_report(y_test, y_pred, zero_division=0))
    if auc is not None:
        print(f"AUC-ROC: {auc:.4f}")

    joblib.dump({"model": model, "feature_names": FEATURE_NAMES}, MODEL_PATH)

    meta = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "estimator": "GradientBoostingClassifier",
        "sklearn_trained_with": __import__("sklearn").__version__,
        "data_sources": ["Open-Meteo Marine API", "NOAA CoastWatch ERDDAP (chlorophyll)"],
        "grid": {"lats": GRID_LATS, "lons": GRID_LONS, "hour_step": HOUR_STEP},
        "feature_names": FEATURE_NAMES,
        "label_rule": "SST 26-30.5C AND wave<1.5m AND (sst_gradient>0.25 OR current>0.10)",
        "n_samples": stats["samples"],
        "positive_rate": round(stats["pfz_positive"] / max(stats["samples"], 1), 4),
        "accuracy": round(report.get("accuracy", 0.0), 4),
        "roc_auc": round(auc, 4) if auc is not None else None,
    }
    META_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    test = np.array([[29.5, 0.9, 0.4, 0.2, 12.0]])
    print(f"\nTest [(sst 29.5, chl 0.9, sstgrad 0.4, chlgrad 0.2, shore 12km)] "
          f"-> P(PFZ)={model.predict_proba(test)[0][1]:.3f}")
    print(f"Saved: {MODEL_PATH}")
    print(f"Saved: {META_PATH}")
    print("ML MODEL TRAINING COMPLETE")


if __name__ == "__main__":
    train_and_save()
