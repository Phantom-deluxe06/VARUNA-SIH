"""Pydantic v2 request/response contracts for the VARUNA Core Engine."""

from typing import Any, Literal, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, model_validator

UserRole = Literal["fisherman", "port_pilot", "disaster_officer"]
Status = Literal["SAFE", "CAUTION", "CRITICAL"]

ROLE_ALIASES: dict[str, UserRole] = {
    "fisherman": "fisherman",
    "fishermen": "fisherman",
    "fish.": "fisherman",
    "port_pilot": "port_pilot",
    "port pilot": "port_pilot",
    "port": "port_pilot",
    "pilot": "port_pilot",
    "disaster_officer": "disaster_officer",
    "disaster officer": "disaster_officer",
    "disaster": "disaster_officer",
    "officer": "disaster_officer",
}


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

    @model_validator(mode="before")
    @classmethod
    def _normalise_payload(cls, data: Any) -> Any:
        """Accept both the canonical and documented (curl tester) payload shapes.

        Canonical:      {"query", "user_role", "lat", "lon", "draft"}
        Documentation:  {"query", "role": "Fisherman", "coordinates": {"lat", "lon"}}
        """
        if isinstance(data, dict):
            data = dict(data)
            # Flatten nested coordinates into top-level lat/lon.
            coords = data.get("coordinates")
            if isinstance(coords, dict) and "lat" not in data and "lon" not in data:
                data["lat"] = coords.get("lat")
                data["lon"] = coords.get("lon")
            # Map role aliases (case-insensitive) to the canonical user_role.
            if "user_role" not in data or data.get("user_role") in (None, ""):
                raw_role = data.get("role")
                if isinstance(raw_role, str):
                    data["user_role"] = ROLE_ALIASES.get(raw_role.strip().lower())
        return data


class SimpleQueryRequest(BaseModel):
    """Demo-friendly payload for ``POST /query``.

    Accepts the shape used by the dashboard / demo tooling and adapts it to the
    canonical :class:`UserQueryRequest`.  Vessel context defaults to Rameswaram
    so a bare ``{"query": "..."}`` still works during a live demo.
    """

    query: str
    role: str = "fisherman"
    vessel_lat: float = 9.9252
    vessel_lon: float = 79.3129
    vessel_draft: Optional[float] = 2.5

    def to_user_query(self) -> "UserQueryRequest":
        return UserQueryRequest(
            query=self.query,
            user_role=ROLE_ALIASES.get(self.role.strip().lower(), "fisherman"),
            lat=self.vessel_lat,
            lon=self.vessel_lon,
            draft=self.vessel_draft,
        )


class BearingVector(BaseModel):
    """Compass navigation vector between two geographic points."""

    model_config = ConfigDict(populate_by_name=True)

    from_: Tuple[float, float] = Field(
        alias="from",
        description="Origin [lat, lon]",
    )
    to: Tuple[float, float] = Field(..., description="Target [lat, lon]")
    bearing_degrees: float = Field(
        ..., ge=0, le=360,
        description="Forward azimuth compass bearing, 0-360 degrees clockwise from true north",
    )
    distance_km: float = Field(
        ..., ge=0, description="Great-circle distance in kilometres to the target",
    )


class AgentDecisionResponse(BaseModel):
    """Response contract — exactly mirrors ``frontend/src/lib/types.ts``."""

    status: Status = Field(..., description="SAFE | CAUTION | CRITICAL")
    agent_name: str = Field(..., description="Agent that handled the query")
    advisory_en: str = Field(..., description="Advisory text in English")
    advisory_ta: str = Field(..., description="Advisory text in Tamil")
    metrics: dict = Field(
        default_factory=dict, description="Computed decision metrics"
    )
    bearing_vector: Optional[BearingVector] = Field(
        default=None,
        description="Compass vector to the target hotspot (when applicable)",
    )
    evidence_trace: list[str] = Field(
        default_factory=list, description="Step-by-step evidence used by the agent"
    )
