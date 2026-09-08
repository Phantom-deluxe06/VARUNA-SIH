import json
import logging
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

logger = logging.getLogger("varuna.main")

from app.db.database import init_db
from app.services import data_fetcher
from app.schemas import AgentDecisionResponse, SimpleQueryRequest, UserQueryRequest
from app.services.intelligence_engine import route_query
from app.services.raster_service import RasterEngine
from app import demo_mode, whatsapp_core

# Shared stateless raster engine (mirrors app.agents.RASTER).
RASTER = RasterEngine()

# Candidate PFZ probe points around Palk Bay / Gulf of Mannar.
_PFZ_CANDIDATES = [(9.28, 79.31), (9.50, 80.20), (9.20, 80.50)]
_DEFAULT_VESSEL = (9.9252, 79.3129)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise the embedded SQLite database on startup (idempotent)."""
    init_db()
    # Best-effort live satellite ingestion in a daemon thread so startup is
    # never blocked by the network; stale/absent rasters degrade gracefully
    # inside RasterEngine (synthetic last-resort).
    import threading

    def _refresh_satellite_rasters() -> None:
        try:
            result = data_fetcher.fetch_all()
            for key, info in result.items():
                state = "ok" if info.get("ok") else f"failed: {info.get('error')}"
                logger.info("Satellite ingestion [%s]: %s", key, state)
        except Exception as exc:  # pragma: no cover
            logger.warning("Satellite ingestion thread error: %s", exc)

    threading.Thread(target=_refresh_satellite_rasters, daemon=True, name="varuna-satellite-fetch").start()
    yield


app = FastAPI(
    title="VARUNA Core Engine",
    description="Offline-first hybrid intelligence engine - Marine Operational System (MOS)",
    version="3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"status": "VARUNA Core Engine Online", "version": "3.0"}


@app.get("/health")
def health() -> dict:
    return {
        "status": "VARUNA Online",
        "version": "1.0.0",
        "agents": ["Fisherman", "PortPilot", "CoastGuard"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/query")
def handle_query(req: UserQueryRequest):
    decision = route_query(req)
    if decision.sst_celsius is None or decision.wave_height_m is None:
        from app.data.open_meteo import get_all_marine_data
        m = get_all_marine_data(req.lat, req.lon)
        decision.sst_celsius = m["sst_celsius"]
        decision.wave_height_m = m["wave_height_m"]
        decision.ocean_current_ms = m["ocean_current_ms"]
        decision.data_source = m["source"]
    if not decision.data_timestamp:
        decision.data_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not decision.alert_level:
        decision.alert_level = decision.status
    result = decision.model_dump(by_alias=True)
    return JSONResponse(
        content=json.loads(
            json.dumps(result, ensure_ascii=False)
        )
    )


@app.post("/query")
def handle_simple_query(req: SimpleQueryRequest = SimpleQueryRequest()):
    """Live marine query endpoint (Rameswaram defaults)."""
    user_req = req.to_user_query()
    decision = route_query(user_req)
    if decision.sst_celsius is None or decision.wave_height_m is None:
        from app.data.open_meteo import get_all_marine_data
        m = get_all_marine_data(user_req.lat, user_req.lon)
        decision.sst_celsius = m["sst_celsius"]
        decision.wave_height_m = m["wave_height_m"]
        decision.ocean_current_ms = m["ocean_current_ms"]
        decision.data_source = m["source"]
    if not decision.data_timestamp:
        decision.data_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not decision.alert_level:
        decision.alert_level = decision.status
    result = decision.model_dump(by_alias=True)
    return JSONResponse(
        content=json.loads(
            json.dumps(result, ensure_ascii=False)
        )
    )


@app.get("/pfz/latest")
def pfz_latest() -> dict:
    """Latest potential-fishing-zone probes, ranked by live confidence."""
    v_lat, v_lon = _DEFAULT_VESSEL
    zones: list[dict] = []
    source = "OPEN_METEO_MARINE_LIVE"
    try:
        from app.data.open_meteo import get_all_marine_data
        m = get_all_marine_data(v_lat, v_lon)
        sst = m["sst_celsius"]
        # 26-30C: 0.95 conf, 30-32C: 0.85 conf, >32C: 0.65 conf
        base_conf = 0.95 if 26.0 <= sst <= 30.0 else (0.85 if sst <= 32.0 else 0.65)
        for lat, lon in _PFZ_CANDIDATES:
            vector = RASTER.calculate_safe_vector(v_lat, v_lon, lat, lon)
            zones.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "confidence": base_conf,
                    "bearing": round(vector["bearing_degrees"]),
                    "distance_nm": round(vector["distance_nm"], 1),
                }
            )
        zones.sort(key=lambda z: z["confidence"], reverse=True)
    except Exception:
        logger.exception("pfz/latest failed")
    return {"zones": zones, "source": source}


@app.get("/vessel/status")
def vessel_status() -> dict:
    """Vessel telemetry for the dashboard, enriched from live Open-Meteo data."""
    v_lat, v_lon = _DEFAULT_VESSEL
    from app.data.open_meteo import get_all_marine_data
    from app.agents import _nearest_imbl_segment_nm
    from app.db.database import get_geofence_ring

    marine = get_all_marine_data(v_lat, v_lon)
    ring = get_geofence_ring()
    imbl_nm, _ = _nearest_imbl_segment_nm(v_lat, v_lon, ring)

    return {
        "lat": v_lat,
        "lon": v_lon,
        "speed": 0,
        "heading": 115,
        "imbl_distance_nm": round(imbl_nm, 2),
        "wave_height_m": marine["wave_height_m"],
        "wind_knots": marine.get("wind_knots") or marine.get("wind_speed_knots"),
        "gust_knots": marine.get("gust_knots"),
        "wave_period_s": marine.get("wave_period_s"),
        "sst_celsius": marine["sst_celsius"],
        "ocean_current_ms": marine["ocean_current_ms"],
        "source": marine["source"],
    }


@app.post("/whatsapp/webhook")
def whatsapp_webhook(Body: str = Form(""), From: str = Form("default")) -> Response:
    """Twilio WhatsApp webhook (same logic as the standalone Flask bot)."""
    reply = whatsapp_core.handle_message(Body, phone=From)
    return Response(content=whatsapp_core.twiml(reply), media_type="application/xml")
