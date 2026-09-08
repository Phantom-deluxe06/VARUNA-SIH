import logging

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

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


@app.post("/api/v1/query", response_model=AgentDecisionResponse)
def handle_query(req: UserQueryRequest) -> AgentDecisionResponse:
    return route_query(req)


@app.post("/query", response_model=AgentDecisionResponse)
def handle_simple_query(req: SimpleQueryRequest) -> AgentDecisionResponse:
    """Demo-friendly alias of /api/v1/query (Rameswaram defaults)."""
    return route_query(req.to_user_query())


@app.get("/pfz/latest")
def pfz_latest() -> dict:
    """Latest potential-fishing-zone probes, ranked by ML/gradient confidence."""
    v_lat, v_lon = _DEFAULT_VESSEL
    zones: list[dict] = []
    source = "synthetic_model"
    try:
        for lat, lon in _PFZ_CANDIDATES:
            ocean = RASTER.extract_ocean_data(lat, lon)
            source = ocean.get("source", source)
            vector = RASTER.calculate_safe_vector(v_lat, v_lon, lat, lon)
            conf = ocean.get("ml_confidence")
            if conf is None:
                grad = abs(float(ocean.get("sst_gradient_c_per_deg", 0.0)))
                base = 0.86 if ocean.get("is_pfz_gradient") else 0.6
                conf = min(0.95, base + min(0.09, grad * 0.05))
            zones.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "confidence": round(float(conf), 2),
                    "bearing": round(vector["bearing_degrees"]),
                    "distance_nm": round(vector["distance_nm"], 1),
                }
            )
        zones.sort(key=lambda z: z["confidence"], reverse=True)
    except Exception:
        logger.exception("pfz/latest raster path failed - using demo zones")
        zones = demo_mode.demo_pfz_zones()
        source = "DEMO_FALLBACK"
    return {"zones": zones, "source": source}


@app.get("/vessel/status")
def vessel_status() -> dict:
    """Vessel telemetry for the dashboard, enriched from live engine data."""
    v_lat, v_lon = _DEFAULT_VESSEL
    status = demo_mode.demo_vessel_status()
    status["source"] = "DEMO_FALLBACK"

    def _ask(q: str) -> dict:
        return (
            route_query(
                UserQueryRequest(query=q, user_role="fisherman", lat=v_lat, lon=v_lon, draft=2.5)
            ).metrics
            or {}
        )

    try:
        sea = _ask("what is the current sea state, wave height and wind")
        if sea.get("wave_height_m") is not None:
            status["wave_height_m"] = sea["wave_height_m"]
        if sea.get("wind_speed_knots") is not None:
            status["wind_knots"] = sea["wind_speed_knots"]
        if sea.get("sea_state_source"):
            status["source"] = sea["sea_state_source"]
    except Exception:
        logger.exception("vessel/status sea-state enrichment failed")
    try:
        border = _ask("how far am I from the maritime border IMBL boundary")
        if border.get("nearest_imbl_distance_nm") is not None:
            status["imbl_distance_nm"] = border["nearest_imbl_distance_nm"]
    except Exception:
        logger.exception("vessel/status border enrichment failed")
    return status


@app.post("/whatsapp/webhook")
def whatsapp_webhook(Body: str = Form("")) -> Response:
    """Twilio WhatsApp webhook (same logic as the standalone Flask bot)."""
    reply = whatsapp_core.handle_message(Body)
    return Response(content=whatsapp_core.twiml(reply), media_type="application/xml")
