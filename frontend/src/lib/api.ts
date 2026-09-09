export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://varuna-sih-production.up.railway.app";

export type AlertLevel = "SAFE" | "CAUTION" | "CRITICAL";
export type UserRole = "fisherman" | "coast_guard" | "port_pilot";

export interface VesselStatus {
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  imbl_distance_nm: number;
  wave_height_m: number;
  wind_knots: number;
  gust_knots: number;
  wave_period_s: number;
  sst_celsius: number;
  ocean_current_ms: number;
  source: string;
  status?: AlertLevel;
}

export interface PfzZone {
  lat: number;
  lon: number;
  confidence: number;
  bearing: number;
  distance_nm: number;
}

export interface PfzResponse {
  zones: PfzZone[];
  source: string;
}

export interface QueryResponse {
  advisory_en: string;
  advisory_ta: string;
  alert_level: AlertLevel;
  intent?: string;
  marine_data?: {
    sst_celsius?: number;
    wave_height_m?: number;
    wind_knots?: number;
    [k: string]: unknown;
  };
  safety_data?: {
    imbl_distance_nm?: number;
    imbl_status?: string;
  };
  evidence?: string[];
  agent_name?: string;
  confidence?: number;
}

export class ApiError extends Error {}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach VARUNA servers");
  }
  if (!res.ok) {
    throw new ApiError(`VARUNA API error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function deriveStatus(s: VesselStatus): AlertLevel {
  if (s.wave_height_m >= 2.5 || s.wind_knots >= 25 || s.imbl_distance_nm < 2) {
    return "CRITICAL";
  }
  if (s.wave_height_m >= 1.5 || s.wind_knots >= 15 || s.imbl_distance_nm < 5) {
    return "CAUTION";
  }
  return "SAFE";
}

export async function getVesselStatus(): Promise<VesselStatus> {
  const data = await fetchJson<VesselStatus>("/vessel/status");
  return { ...data, status: deriveStatus(data) };
}

export async function getPfzLatest(): Promise<PfzResponse> {
  return fetchJson<PfzResponse>("/pfz/latest");
}

export async function postQuery(
  query: string,
  role: string = "fisherman",
  vesselLat?: number,
  vesselLon?: number,
  draft?: number,
): Promise<QueryResponse> {
  const body: Record<string, unknown> = { query, role };
  if (vesselLat != null && vesselLon != null) {
    body.vessel_lat = vesselLat;
    body.vessel_lon = vesselLon;
  }
  if (draft != null) body.vessel_draft = draft;
  return fetchJson<QueryResponse>("/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Haversine distance in nautical miles. */
export function distanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065; // Earth radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Simplified IMBL polyline segments over Palk Strait / Bay of Bengal. */
export const IMBL_COORDS: [number, number][] = [
  [10.05, 80.15],
  [9.75, 79.85],
  [9.35, 79.55],
  [9.0, 79.25],
  [8.6, 78.95],
  [8.1, 78.6],
  [7.6, 78.2],
];

export function distanceToImblNm(lat: number, lon: number): number {
  let min = Infinity;
  for (let i = 0; i < IMBL_COORDS.length - 1; i++) {
    const [la1, lo1] = IMBL_COORDS[i];
    const [la2, lo2] = IMBL_COORDS[i + 1];
    // segment-project in simple planar approx (fine at these scales)
    const kx = Math.cos(((lat + (la1 + la2) / 2) * Math.PI) / 180);
    const px = (lon - lo1) * kx;
    const py = lat - la1;
    const vx = (lo2 - lo1) * kx;
    const vy = la2 - la1;
    const vv = vx * vx + vy * vy;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy) / vv));
    const cx = lo1 + (t * (lo2 - lo1));
    const cy = la1 + t * (la2 - la1);
    min = Math.min(min, distanceNm(lat, lon, cy, cx));
  }
  return min;
}
