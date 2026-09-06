import logging

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("varuna.main")

from app.db.database import init_db
from app.services import data_fetcher
from app.schemas import AgentDecisionResponse, UserQueryRequest
from app.services.intelligence_engine import route_query


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


@app.post("/api/v1/query", response_model=AgentDecisionResponse)
def handle_query(req: UserQueryRequest) -> AgentDecisionResponse:
    return route_query(req)
