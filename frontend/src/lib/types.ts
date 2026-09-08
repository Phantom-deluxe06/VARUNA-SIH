export type UserStatus = "SAFE" | "CAUTION" | "CRITICAL";

export type BearingVector = {
  from: [number, number];
  to: [number, number];
  bearing_degrees: number;
  distance_km: number;
};

export type AgentDecision = {
  status: UserStatus;
  agent_name: string;
  advisory_en: string;
  advisory_ta: string;
  metrics: Record<string, string | number | boolean | null>;
  bearing_vector: BearingVector | null;
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

export const IMBL_PALK_BAY: [number, number][] = [
  [10.08, 79.86],
  [9.98, 79.58],
  [9.67, 79.38],
  [9.16, 79.53],
  [9.0, 79.32],
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
