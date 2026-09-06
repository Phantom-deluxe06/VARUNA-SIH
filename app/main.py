from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents import route_to_agent
from app.schemas import AgentDecisionResponse, UserQueryRequest

app = FastAPI(
    title="VARUNA Core Engine",
    description="Minimal mock-data foundation for SIH26176 - Marine decision support",
    version="2.0",
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
    return {"status": "VARUNA Core Engine Online", "version": "2.0"}


@app.post("/api/v1/query", response_model=AgentDecisionResponse)
def handle_query(req: UserQueryRequest) -> AgentDecisionResponse:
    return route_to_agent(req)
