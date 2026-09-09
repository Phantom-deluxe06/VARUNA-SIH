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

/** Dashboard role selector labels mapped to backend roles. */
export const DASHBOARD_ROLES: { label: string; labelTa: string; value: UserRole }[] = [
  { label: "Fisherman", labelTa: "மீனவர்", value: "fisherman" },
  { label: "Port Pilot", labelTa: "துறைமுக வழிகாட்டி", value: "port_pilot" },
  { label: "Coast Guard", labelTa: "கடலோர காவல்", value: "disaster_officer" },
];

export type MapPoint = {
  lat: number;
  lon: number;
  kind: "user" | "hotspot" | "port" | "hazard";
  label: string;
  status?: UserStatus;
};

/** Legacy Palk Bay IMBL ring (kept for compatibility). */
export const IMBL_PALK_BAY: [number, number][] = [
  [10.08, 79.86],
  [9.98, 79.58],
  [9.67, 79.38],
  [9.16, 79.53],
  [9.0, 79.32],
];

/** IMBL demarcation line used by the fisherman dashboard map. */
export const IMBL_DASHBOARD_LINE: [number, number][] = [
  [9.5, 79.8],
  [9.7, 80.1],
  [9.9, 80.3],
  [10.2, 80.5],
  [10.5, 80.7],
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

/** Default vessel position — Rameswaram. */
export const RAMESWARAM = { lat: 9.9252, lon: 79.3129 } as const;

export type VesselStatus = {
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  imbl_distance_nm: number;
  wave_height_m: number;
  wind_knots: number;
  source?: string;
};

/** True when a data source string denotes genuine live external data. */
export function isLiveSource(source?: string): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return s.includes("open-meteo") || s.includes("open_meteo") || s.includes("live");
}

export type PfzZone = {
  lat: number;
  lon: number;
  confidence: number;
  bearing: number;
  distance_nm: number;
  radius?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "varuna";
  text: string;
  advisory_ta?: string;
  advisory_en?: string;
  status?: UserStatus;
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_VARUNA_API_URL ?? "http://127.0.0.1:8000";
