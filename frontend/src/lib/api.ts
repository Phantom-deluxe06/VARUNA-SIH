import {
  API_BASE_URL,
  type AgentDecision,
  type PfzZone,
  type UserRole,
  type VesselStatus,
} from "./types";

const TIMEOUT_MS = 8000;

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[VARUNA api] falling back for", path, err);
    return fallback;
  }
}

export async function getHealth() {
  return getJSON<{ status: string; version: string }>("/health", {
    status: "offline",
    version: "0",
  });
}

export const FALLBACK_VESSEL: VesselStatus = {
  lat: 9.9252,
  lon: 79.3129,
  speed: 0,
  heading: 0,
  imbl_distance_nm: 8.4,
  wave_height_m: 1.8,
  wind_knots: 12,
  source: "offline",
};

export async function getVesselStatus(): Promise<VesselStatus> {
  return getJSON<VesselStatus>("/vessel/status", FALLBACK_VESSEL);
}

export const FALLBACK_ZONES: PfzZone[] = [
  { lat: 9.28, lon: 79.31, confidence: 0.91, bearing: 115, distance_nm: 12.3 },
  { lat: 9.5, lon: 80.2, confidence: 0.78, bearing: 88, distance_nm: 24.7 },
];

export async function getPfzLatest(): Promise<PfzZone[]> {
  const data = await getJSON<{ zones: PfzZone[] }>("/pfz/latest", {
    zones: FALLBACK_ZONES,
  });
  return data.zones?.length ? data.zones : FALLBACK_ZONES;
}

export async function postQuery(args: {
  query: string;
  role: UserRole;
  vessel_lat?: number;
  vessel_lon?: number;
  vessel_draft?: number;
}): Promise<AgentDecision> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${API_BASE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`/query -> ${res.status}`);
    const data = await res.json();
    const rawStatus = (data.status || data.alert_level || "SAFE").toString().toUpperCase();
    const normalizedStatus =
      rawStatus === "CRITICAL" ? "CRITICAL" : rawStatus === "CAUTION" ? "CAUTION" : "SAFE";
    return {
      ...data,
      status: normalizedStatus,
    } as AgentDecision;
  } catch (err) {
    console.warn("[VARUNA api] /query failed", err);
    return {
      status: "CAUTION",
      agent_name: "VARUNA (offline)",
      advisory_en:
        "The VARUNA engine is unreachable. Showing cached guidance: check local sea state before sailing and stay well inside the maritime boundary.",
      advisory_ta:
        "வருணா இணைப்பு கிடைக்கவில்லை. சேமித்த ஆலோசனை: புறப்படும் முன் கடல் நிலையைச் சரிபார்க்கவும், எல்லைக்கோட்டிற்குள் பாதுகாப்பாக இருங்கள்.",
      metrics: {},
      bearing_vector: null,
      evidence_trace: [],
    };
  }
}
