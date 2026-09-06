from typing import Literal, Optional

from pydantic import BaseModel, Field

UserRole = Literal["fisherman", "port_pilot", "disaster_officer"]
Status = Literal["SAFE", "CAUTION", "CRITICAL"]


class UserQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language query from the user")
    user_role: UserRole = Field(..., description="Role: fisherman, port_pilot, disaster_officer")
    lat: float = Field(..., ge=-90, le=90, description="User latitude")
    lon: float = Field(..., ge=-180, le=180, description="User longitude")
    draft: Optional[float] = Field(
        default=None,
        gt=0,
        description="Vessel draft in metres (required for UKC calculations)",
    )


class AgentDecisionResponse(BaseModel):
    active_agent: str = Field(..., description="Agent that handled the query")
    status: Status = Field(..., description="SAFE | CAUTION | CRITICAL")
    advisory_tamil: str = Field(..., description="Advisory text in Tamil")
    advisory_english: str = Field(..., description="Advisory text in English")
    metrics: dict = Field(default_factory=dict, description="Computed decision metrics")
    evidence_trace: list[str] = Field(
        default_factory=list, description="Step-by-step evidence used by the agent"
    )
