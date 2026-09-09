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


SimpleRole = Literal["Fisherman", "Coast Guard", "Port Pilot"]


class SimpleQueryRequest(BaseModel):
    """Demo-friendly payload for ``POST /query`` with strict input validation.

    Accepts the shape used by the dashboard / demo tooling and adapts it to the
    canonical :class:`UserQueryRequest`. Vessel context defaults to Rameswaram
    so a bare ``{"query": "..."}`` still works during a live demo.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    query: str = Field(default="can I go fishing", max_length=500, description="User natural language query")
    role: SimpleRole = Field(default="Fisherman", description="Role: Fisherman, Coast Guard, Port Pilot")
    vessel_lat: Optional[float] = Field(default=None, ge=-90, le=90, description="Vessel latitude between -90 and 90")
    vessel_lon: Optional[float] = Field(default=None, ge=-180, le=180, description="Vessel longitude between -180 and 180")
    lat: Optional[float] = Field(default=None, ge=-90, le=90, description="Alias for latitude")
    lon: Optional[float] = Field(default=None, ge=-180, le=180, description="Alias for longitude")
    vessel_draft: Optional[float] = Field(default=None, ge=0, le=30, description="Vessel draft between 0 and 30 meters")
    draft: Optional[float] = Field(default=None, ge=0, le=30, description="Alias for vessel draft")

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data = dict(data)
            # Map role casing/aliases to the SimpleRole Literal
            raw_role = data.get("role")
            if isinstance(raw_role, str):
                cleaned = raw_role.strip().lower()
                if cleaned in ("fisherman", "fishermen"):
                    data["role"] = "Fisherman"
                elif cleaned in ("coast guard", "coastguard", "disaster_officer", "disaster officer", "disaster"):
                    data["role"] = "Coast Guard"
                elif cleaned in ("port pilot", "port_pilot", "pilot", "port"):
                    data["role"] = "Port Pilot"

            coords = data.get("coordinates")
            if isinstance(coords, dict):
                if "lat" not in data and "vessel_lat" not in data:
                    data["lat"] = coords.get("lat")
                if "lon" not in data and "vessel_lon" not in data:
                    data["lon"] = coords.get("lon")
            if "vessel_lat" not in data and "lat" in data:
                data["vessel_lat"] = data.get("lat")
            if "vessel_lon" not in data and "lon" in data:
                data["vessel_lon"] = data.get("lon")
            if "vessel_draft" not in data and "draft" in data:
                data["vessel_draft"] = data.get("draft")
        return data

    def to_user_query(self) -> "UserQueryRequest":
        effective_lat = self.lat if self.lat is not None else (self.vessel_lat if self.vessel_lat is not None else 9.9252)
        effective_lon = self.lon if self.lon is not None else (self.vessel_lon if self.vessel_lon is not None else 79.3129)
        effective_draft = self.draft if self.draft is not None else (self.vessel_draft if self.vessel_draft is not None else 2.5)
        return UserQueryRequest(
            query=self.query,
            user_role=ROLE_ALIASES.get(self.role.strip().lower(), "fisherman"),
            lat=effective_lat,
            lon=effective_lon,
            draft=effective_draft,
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
    """Response contract — mirrors frontend types and contains live marine telemetry."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    status: Status = Field(..., description="SAFE | CAUTION | CRITICAL")
    alert_level: Optional[Status] = Field(default=None, description="SAFE | CAUTION | CRITICAL")
    agent_name: str = Field(..., description="Agent that handled the query")
    advisory_en: str = Field(..., description="Advisory text in English")
    advisory_ta: str = Field(..., description="Advisory text in Tamil")
    sst_celsius: Optional[float] = Field(default=None, description="Sea surface temperature in Celsius")
    wave_height_m: Optional[float] = Field(default=None, description="Wave height in metres")
    ocean_current_ms: Optional[float] = Field(default=None, description="Ocean current velocity in m/s")
    data_source: Optional[str] = Field(default="OPEN_METEO_MARINE_LIVE", description="Data source")
    data_timestamp: Optional[str] = Field(default=None, description="Data timestamp in ISO format")
    evidence: list[str] = Field(default_factory=list, description="Step-by-step evidence list")
    metrics: dict = Field(
        default_factory=dict, description="Computed decision metrics"
    )
    bearing_vector: Optional[BearingVector] = Field(
        default=None,
        description="Compass vector to the target hotspot (when applicable)",
    )
    evidence_trace: list[str] = Field(
        default_factory=list, description="Step-by-step evidence trace"
    )

    @model_validator(mode="after")
    def _sync_fields(self) -> "AgentDecisionResponse":
        if self.alert_level is None:
            self.alert_level = self.status
        if not self.evidence and self.evidence_trace:
            self.evidence = list(self.evidence_trace)
        elif self.evidence and not self.evidence_trace:
            self.evidence_trace = list(self.evidence)
        return self
