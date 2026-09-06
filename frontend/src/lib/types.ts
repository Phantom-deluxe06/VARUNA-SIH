export type UserStatus = "SAFE" | "CAUTION" | "CRITICAL";

export type AgentDecision = {
  active_agent: string;
  status: UserStatus;
  advisory_tamil: string;
  advisory_english: string;
  metrics: Record<string, string | number | boolean | null>;
  evidence_trace: string[];
};

export type UserRole = "fisherman" | "port_pilot" | "disaster_officer";

export type MapPoint = {
  lat: number;
  lon: number;
  kind: "user" | "hotspot" | "port" | "hazard";
  label: string;
  status?: UserStatus;
};

export type BearingVector = {
  from: [number, number];
  to: [number, number];
  bearing_degrees: number;
  distance_km: number;
};

export const IMBL_PALK_BAY: [number, number][] = [
  [9.0, 79.2],
  [9.5, 79.6],
  [10.0, 79.9],
];

export const PORT_CHENNAI: MapPoint = {
  lat: 13.0827,
  lon: 80.2707,
  kind: "port",
  label: "Port of Chennai",
};

export const PFZ_HOTSPOT = {
  lat: 9.28,
  lon: 79.31,
  species: "Tuna / Mackerel",
  bearing_degrees: 115,
  distance_km: 32,
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_VARUNA_API_URL ?? "http://127.0.0.1:8000";
