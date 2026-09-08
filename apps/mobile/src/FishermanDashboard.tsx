import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { openDB, type DBSchema } from 'idb';

import {
  Ship,
  Wifi,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Navigation,
  MapPin,
  Waves,
  Shield,
  Siren,
  Compass,
  LocateFixed,
  Locate,
  AlertTriangle,
  RefreshCw,
  Database,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  Gauge,
  HelpCircle,
  ArrowRight,
  Play,
  Square,
  History,
  Route,
  X,
  Radio,
  Clock,
  Eye,
  ClipboardCheck,
  AlertOctagon,
  Activity,
  Trash2,
  FileText,
  Bell,
  BellRing,
  Check,
} from 'lucide-react';

/**
 * Safety status types
 */
export type SafetyLevel = 'SAFE' | 'CAUTION' | 'DANGER' | 'UNAVAILABLE';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNAVAILABLE';

export type GpsStatus = 'SEARCHING' | 'CONNECTED' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED';

export type SyncState = 'IDLE' | 'SYNCING' | 'SYNC_SUCCESS' | 'SYNC_ERROR' | 'OFFLINE_ATTEMPT';

export type TripStatus = 'IDLE' | 'ACTIVE' | 'COMPLETED';

export type SosStatus = 'RECORDED_OFFLINE' | 'RECORDED_ONLINE' | 'READY_TO_SHARE';

export type ReadinessStatus = 'READY' | 'CHECK_REQUIRED';

export type GuidanceMode = 'PFZ' | 'RETURN' | 'SAFETY';

export type ReturnStatus = 'RETURN_AVAILABLE' | 'RETURN_CAUTION' | 'RETURN_PRIORITY' | 'RETURN_UNAVAILABLE';

export type RouteRiskLevel = 'ROUTE_SAFE' | 'ROUTE_CAUTION' | 'ROUTE_HIGH_RISK' | 'ROUTE_UNAVAILABLE';

export type VoyageSafetyStatus = 'VOYAGE_SAFE' | 'VOYAGE_CAUTION' | 'VOYAGE_HIGH_RISK' | 'VOYAGE_DATA_INCOMPLETE';

export type AlertCategory =
  | 'SAFETY_TRANSITION'
  | 'GPS_STATUS'
  | 'BORDER_WARNING'
  | 'RISK_WARNING'
  | 'TRIP_WARNING'
  | 'SOS_EVENT'
  | 'DATA_WARNING';

export type AlertPriority = 'INFO' | 'ADVISORY' | 'HIGH' | 'CRITICAL';

export type DataFreshnessState = 'AVAILABLE' | 'FRESH' | 'AGING' | 'STALE' | 'MISSING';

export type OverallCacheHealth = 'CACHE_READY' | 'CACHE_WARNING' | 'CACHE_INCOMPLETE';

export interface DatasetHealthInfo {
  name: string;
  tamilName: string;
  state: DataFreshnessState;
  stateLabel: string;
  stateLabelTamil: string;
  badgeBg: string;
  lastUpdatedFormatted: string;
  ageFormatted: string;
  details: string;
  isMissing: boolean;
  isStale: boolean;
}

export interface CacheHealthSummary {
  overallHealth: OverallCacheHealth;
  overallLabel: string;
  overallTamilLabel: string;
  overallBadge: string;
  recommendation: string;
  recommendationTamil: string;
  waveHealth: DatasetHealthInfo;
  pfzHealth: DatasetHealthInfo;
  borderHealth: DatasetHealthInfo;
  syncHealth: DatasetHealthInfo;
  allFresh: boolean;
  hasStale: boolean;
  hasMissing: boolean;
}

// --- Phase 17: Offline Data Package Integrity & Pre-Departure Validation Types ---

export type DataIntegrityStatus = 'VALID' | 'CHECK_REQUIRED' | 'INVALID' | 'UNAVAILABLE';

export type DataPackageOverallStatus = 'DATA_PACKAGE_VALID' | 'DATA_PACKAGE_CHECK_REQUIRED' | 'DATA_PACKAGE_INCOMPLETE';

export interface DatasetIntegrityInfo {
  name: string;
  tamilName: string;
  status: DataIntegrityStatus;
  statusLabel: string;
  isValid: boolean;
  reason: string;
  reasonTamil: string;
  badgeBg: string;
}

export interface DataPackageValidationSummary {
  overallStatus: DataPackageOverallStatus;
  overallLabel: string;
  overallTamilLabel: string;
  overallBadge: string;
  recommendation: string;
  recommendationTamil: string;
  waveValidation: DatasetIntegrityInfo;
  pfzValidation: DatasetIntegrityInfo;
  borderValidation: DatasetIntegrityInfo;
  syncValidation: DatasetIntegrityInfo;
  isPackageValid: boolean;
  isCheckRequired: boolean;
  isIncomplete: boolean;
}

export interface SafetyAlertItem {
  alertId: string;
  tripId?: string | null;
  timestamp: number;
  formattedTime: string;
  type: AlertCategory;
  priority: AlertPriority;
  title: string;
  tamilTitle: string;
  message: string;
  tamilMessage: string;
  action: string;
  tamilAction: string;
  riskScore?: number | null;
  safetyLevel?: SafetyLevel;
  latitude?: number | null;
  longitude?: number | null;
  acknowledged: boolean;
}

// --- IndexedDB Data Schema Types ---

export interface WaveThresholdData {
  id: string;
  safeLimit: number;
  cautionLimit: number;
  dangerLimit: number;
  unit: string;
  note: string;
}

export interface PfzHotspotData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
}

export interface BorderCoord {
  latitude: number;
  longitude: number;
}

export interface BorderLineData {
  id: string;
  name: string;
  coordinates: BorderCoord[];
  description: string;
}

export interface SyncMetadata {
  id: string;
  timestamp: string;
  timestampMs?: number;
  status: 'success' | 'error';
  itemCount: number;
}

export interface TripSession {
  tripId: string;
  startTime: number;
  endTime: number | null;
  status: 'ACTIVE' | 'COMPLETED';
  totalDistanceNm: number;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastUpdated: number;
  // Phase 11 Trip Analytics extensions
  startLatitude?: number | null;
  startLongitude?: number | null;
  maxSpeedKnots?: number | null;
  avgSpeedKnots?: number | null;
  pointCount?: number;
  safeTimeMs?: number;
  cautionTimeMs?: number;
  dangerTimeMs?: number;
}

export interface TripTrackPoint {
  pointId: string;
  tripId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
}

export interface SafetyEvent {
  eventId: string;
  timestamp: number;
  formattedTime: string;
  tripId?: string | null;
  eventType:
    | 'SAFETY_STATE_CHANGED'
    | 'GPS_LOST'
    | 'GPS_RESTORED'
    | 'OFFLINE_MODE_ENTERED'
    | 'ONLINE_MODE_RESTORED'
    | 'TRIP_STARTED'
    | 'TRIP_COMPLETED'
    | 'SOS_TRIGGERED'
    | 'READINESS_CHECK_FAILED'
    | 'TRIP_STARTED_WITH_WARNINGS';
  safetyLevel: SafetyLevel | 'OFFLINE' | 'ONLINE' | 'INFO';
  message: string;
}

export interface EmergencyEvent {
  emergencyId: string;
  timestamp: number;
  formattedTime: string;
  latitude: number | null;
  longitude: number | null;
  gpsAvailable: boolean;
  tripId: string | null;
  tripStatus: 'ACTIVE' | 'COMPLETED' | 'NO_ACTIVE_TRIP';
  tripDuration: string;
  tripDistanceNm: number | null;
  riskScore: number | null;
  riskLevel: RiskLevel;
  safetyLevel: SafetyLevel;
  waveHeight: number | null;
  borderDistanceNm: number | null;
  onlineStatus: boolean;
  sosStatus: SosStatus;
  lastUpdated: number;
}

interface VarunaDBSchema extends DBSchema {
  waveThresholds: {
    key: string;
    value: WaveThresholdData;
  };
  pfzHotspots: {
    key: string;
    value: PfzHotspotData;
  };
  borderLines: {
    key: string;
    value: BorderLineData;
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
  tripSessions: {
    key: string;
    value: TripSession;
  };
  safetyEvents: {
    key: string;
    value: SafetyEvent;
  };
  emergencyEvents: {
    key: string;
    value: EmergencyEvent;
  };
  tripTrackPoints: {
    key: string;
    value: TripTrackPoint;
    indexes: { 'by-trip': string };
  };
  safetyAlerts: {
    key: string;
    value: SafetyAlertItem;
    indexes: { 'by-trip': string; 'by-timestamp': number };
  };
}

const DB_NAME = 'varuna-fisherman-db';
const DB_VERSION = 5;
const MAX_TRACK_POINTS_PER_TRIP = 300;

/**
 * Demonstration / Prototype Sync Payload
 * Note: Prototype demonstration data - not official government/INCOIS advisory.
 */
const MOCK_PRE_DEPARTURE_WAVE_THRESHOLDS: WaveThresholdData = {
  id: 'default',
  safeLimit: 2.5,
  cautionLimit: 3.5,
  dangerLimit: 4.5,
  unit: 'meters',
  note: 'Demonstration threshold model for coastal fishing vessels',
};

const MOCK_PRE_DEPARTURE_PFZ_HOTSPOTS: PfzHotspotData[] = [
  {
    id: 'pfz-001',
    name: 'PFZ HOTSPOT 01 (POINT CALIMERE)',
    latitude: 10.150000,
    longitude: 80.600000,
    source: 'DEMO PFZ ADVISORY (NOT LIVE)',
  },
  {
    id: 'pfz-002',
    name: 'PFZ HOTSPOT 02 (NAGAPATTINAM OFFSHORE)',
    latitude: 10.220000,
    longitude: 80.750000,
    source: 'DEMO PFZ ADVISORY (NOT LIVE)',
  },
  {
    id: 'pfz-003',
    name: 'PFZ HOTSPOT 03 (VEDARANYAM SOUTH)',
    latitude: 10.080000,
    longitude: 80.450000,
    source: 'DEMO PFZ ADVISORY (NOT LIVE)',
  },
];

const MOCK_PRE_DEPARTURE_BORDER_LINES: BorderLineData[] = [
  {
    id: 'border-001',
    name: 'MARITIME REFERENCE LINE (DEMO)',
    coordinates: [
      { latitude: 10.050000, longitude: 80.850000 },
      { latitude: 10.350000, longitude: 80.950000 },
    ],
    description: 'Prototype maritime reference baseline for demo distance calculations',
  },
];

interface SafetyConfig {
  title: string;
  tamilTitle: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
  badgeBg: string;
}

const SAFETY_LEVEL_CONFIG: Record<SafetyLevel, SafetyConfig> = {
  SAFE: {
    title: 'SAFE',
    tamilTitle: 'பாதுகாப்பானது',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-950/40',
    textColor: 'text-green-400',
    badgeBg: 'bg-green-500/20 text-green-300 border-green-500',
  },
  CAUTION: {
    title: 'CAUTION',
    tamilTitle: 'எச்சரிக்கை',
    borderColor: 'border-amber-500',
    bgColor: 'bg-amber-950/40',
    textColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500',
  },
  DANGER: {
    title: 'DANGER',
    tamilTitle: 'ஆபத்து',
    borderColor: 'border-red-600',
    bgColor: 'bg-red-950/50',
    textColor: 'text-red-500',
    badgeBg: 'bg-red-600/20 text-red-300 border-red-600',
  },
  UNAVAILABLE: {
    title: 'DATA UNAVAILABLE',
    tamilTitle: 'தரவு கிடைக்கவில்லை',
    borderColor: 'border-neutral-700',
    bgColor: 'bg-neutral-900/60',
    textColor: 'text-neutral-400',
    badgeBg: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  },
};

async function getDB() {
  return openDB<VarunaDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('waveThresholds')) {
          db.createObjectStore('waveThresholds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pfzHotspots')) {
          db.createObjectStore('pfzHotspots', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('borderLines')) {
          db.createObjectStore('borderLines', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'id' });
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('tripSessions')) {
          db.createObjectStore('tripSessions', { keyPath: 'tripId' });
        }
        if (!db.objectStoreNames.contains('safetyEvents')) {
          db.createObjectStore('safetyEvents', { keyPath: 'eventId' });
        }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('emergencyEvents')) {
          db.createObjectStore('emergencyEvents', { keyPath: 'emergencyId' });
        }
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('tripTrackPoints')) {
          const trackStore = db.createObjectStore('tripTrackPoints', { keyPath: 'pointId' });
          trackStore.createIndex('by-trip', 'tripId');
        }
      }
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('safetyAlerts')) {
          const alertStore = db.createObjectStore('safetyAlerts', { keyPath: 'alertId' });
          alertStore.createIndex('by-trip', 'tripId');
          alertStore.createIndex('by-timestamp', 'timestamp');
        }
      }
    },
  });
}

function formatLatitude(lat: number | null): string {
  if (lat === null || isNaN(lat)) return '--.------';
  const hemisphere = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(6)}° ${hemisphere}`;
}

function formatLongitude(lon: number | null): string {
  if (lon === null || isNaN(lon)) return '--.------';
  const hemisphere = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lon).toFixed(6)}° ${hemisphere}`;
}

function formatSpeedKnots(speedMps: number | null): string {
  if (speedMps === null || speedMps === undefined || isNaN(speedMps)) {
    return '-- knots';
  }
  const knots = speedMps * 1.94384;
  return `${knots.toFixed(1)} knots`;
}

function formatDuration(ms: number): string {
  if (ms < 0 || isNaN(ms)) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeHHMM(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Phase 16: Helper to format data age in human-readable local format
 */
function formatDataAge(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined || isNaN(ageMs) || ageMs < 0) {
    return 'DATA AGE UNKNOWN';
  }
  const minutes = Math.floor(ageMs / 60000);
  const hours = Math.floor(ageMs / 3600000);
  const days = Math.floor(ageMs / 86400000);

  if (days >= 1) {
    return days === 1 ? 'UPDATED: 1 DAY AGO' : `UPDATED: ${days} DAYS AGO`;
  }
  if (hours >= 1) {
    return hours === 1 ? 'UPDATED: 1 HOUR AGO' : `UPDATED: ${hours} HOURS AGO`;
  }
  if (minutes >= 1) {
    return minutes === 1 ? 'UPDATED: 1 MINUTE AGO' : `UPDATED: ${minutes} MINUTES AGO`;
  }
  return 'UPDATED: JUST NOW';
}

/**
 * Phase 16: Helper to determine dataset freshness state based on prototype windows:
 * FRESH: 0–6 hours
 * AGING: > 6 hours and <= 24 hours
 * STALE: > 24 hours
 * MISSING: No timestamp / data or future-dated beyond tolerance
 */
function evaluateDataFreshness(
  timestampMs: number | null | undefined,
  hasData: boolean
): {
  state: DataFreshnessState;
  stateLabel: string;
  stateLabelTamil: string;
  badgeBg: string;
  ageFormatted: string;
  lastUpdatedFormatted: string;
} {
  if (!hasData || timestampMs === null || timestampMs === undefined || isNaN(timestampMs)) {
    return {
      state: 'MISSING',
      stateLabel: 'MISSING',
      stateLabelTamil: 'தரவு கிடைக்கவில்லை',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
      ageFormatted: 'NOT SYNCED',
      lastUpdatedFormatted: 'NOT SYNCED',
    };
  }

  const now = Date.now();
  const ageMs = now - timestampMs;

  // Invalid future-dated tolerance: 1 minute
  if (ageMs < -60000) {
    return {
      state: 'MISSING',
      stateLabel: 'DATA AGE UNKNOWN',
      stateLabelTamil: 'தரவு வயது தெரியவில்லை',
      badgeBg: 'border-neutral-700 bg-neutral-900 text-neutral-400',
      ageFormatted: 'INVALID TIMESTAMP',
      lastUpdatedFormatted: 'TIMESTAMP UNAVAILABLE',
    };
  }

  const dateObj = new Date(timestampMs);
  const lastUpdatedFormatted = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const ageFormatted = formatDataAge(Math.max(0, ageMs));

  // 6 hours = 21,600,000 ms; 24 hours = 86,400,000 ms
  if (ageMs <= 6 * 3600 * 1000) {
    return {
      state: 'FRESH',
      stateLabel: 'FRESH',
      stateLabelTamil: 'புதியது',
      badgeBg: 'border-green-500/60 bg-green-950/60 text-green-400',
      ageFormatted,
      lastUpdatedFormatted,
    };
  } else if (ageMs <= 24 * 3600 * 1000) {
    return {
      state: 'AGING',
      stateLabel: 'AGING',
      stateLabelTamil: 'பழையதாகிறது',
      badgeBg: 'border-amber-500/60 bg-amber-950/60 text-amber-300',
      ageFormatted,
      lastUpdatedFormatted,
    };
  } else {
    return {
      state: 'STALE',
      stateLabel: 'STALE',
      stateLabelTamil: 'காலாவதியானது',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
      ageFormatted,
      lastUpdatedFormatted,
    };
  }
}

/**
 * Phase 17: Validate Wave Threshold dataset integrity
 */
function validateWaveThresholdData(data: WaveThresholdData | null): DatasetIntegrityInfo {
  if (!data) {
    return {
      name: 'WAVE THRESHOLDS',
      tamilName: 'அலை உயர வரம்பு',
      status: 'UNAVAILABLE',
      statusLabel: 'CHECK REQUIRED',
      isValid: false,
      reason: 'WAVE DATA UNAVAILABLE',
      reasonTamil: 'அலை தரவு கிடைக்கவில்லை',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
    };
  }

  const isSafeFinite = typeof data.safeLimit === 'number' && Number.isFinite(data.safeLimit);
  const isCautionFinite = typeof data.cautionLimit === 'number' && Number.isFinite(data.cautionLimit);
  const isSafePositive = isSafeFinite && data.safeLimit > 0;
  const isCautionGreater = isCautionFinite && isSafePositive && data.cautionLimit > data.safeLimit;

  if (isSafePositive && isCautionGreater) {
    return {
      name: 'WAVE THRESHOLDS',
      tamilName: 'அலை உயர வரம்பு',
      status: 'VALID',
      statusLabel: 'PASS',
      isValid: true,
      reason: `VALID • SAFE ${data.safeLimit.toFixed(1)}m / CAUTION ${data.cautionLimit.toFixed(1)}m`,
      reasonTamil: `சரியானது • பாதுகாப்பு ${data.safeLimit.toFixed(1)}m / எச்சரிக்கை ${data.cautionLimit.toFixed(1)}m`,
      badgeBg: 'border-green-500/60 bg-green-950/60 text-green-400',
    };
  }

  return {
    name: 'WAVE THRESHOLDS',
    tamilName: 'அலை உயர வரம்பு',
    status: 'INVALID',
    statusLabel: 'CHECK REQUIRED',
    isValid: false,
    reason: 'WAVE THRESHOLDS INVALID',
    reasonTamil: 'அலை வரம்பு தரவு தவறானது',
    badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
  };
}

/**
 * Phase 17: Validate PFZ Hotspots dataset integrity & coordinates
 */
function validatePfzHotspotData(hotspots: PfzHotspotData[]): DatasetIntegrityInfo {
  if (!hotspots || hotspots.length === 0) {
    return {
      name: 'PFZ HOTSPOTS',
      tamilName: 'PFZ மீன்பிடி பகுதிகள்',
      status: 'UNAVAILABLE',
      statusLabel: 'CHECK REQUIRED',
      isValid: false,
      reason: 'PFZ DATA UNAVAILABLE',
      reasonTamil: 'PFZ தரவு கிடைக்கவில்லை',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
    };
  }

  const allValid = hotspots.every(
    (h) =>
      typeof h.id === 'string' &&
      h.id.trim().length > 0 &&
      typeof h.latitude === 'number' &&
      Number.isFinite(h.latitude) &&
      h.latitude >= -90 &&
      h.latitude <= 90 &&
      typeof h.longitude === 'number' &&
      Number.isFinite(h.longitude) &&
      h.longitude >= -180 &&
      h.longitude <= 180
  );

  if (allValid) {
    return {
      name: 'PFZ HOTSPOTS',
      tamilName: 'PFZ மீன்பிடி பகுதிகள்',
      status: 'VALID',
      statusLabel: 'PASS',
      isValid: true,
      reason: `VALID • ${hotspots.length} HOTSPOTS`,
      reasonTamil: `சரியானது • ${hotspots.length} மீன்பிடி பகுதிகள்`,
      badgeBg: 'border-green-500/60 bg-green-950/60 text-green-400',
    };
  }

  return {
    name: 'PFZ HOTSPOTS',
    tamilName: 'PFZ மீன்பிடி பகுதிகள்',
    status: 'INVALID',
    statusLabel: 'CHECK REQUIRED',
    isValid: false,
    reason: 'PFZ DATA INVALID',
    reasonTamil: 'PFZ ஒருங்கிணைப்புகள் தவறானது',
    badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
  };
}

/**
 * Phase 17: Validate Border Reference Lines integrity & coordinate polyline
 */
function validateBorderLineData(borderLines: BorderLineData[]): DatasetIntegrityInfo {
  if (!borderLines || borderLines.length === 0) {
    return {
      name: 'BORDER REFERENCE',
      tamilName: 'எல்லை குறிப்பு',
      status: 'UNAVAILABLE',
      statusLabel: 'CHECK REQUIRED',
      isValid: false,
      reason: 'BORDER DATA UNAVAILABLE',
      reasonTamil: 'எல்லை தரவு கிடைக்கவில்லை',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
    };
  }

  let totalPoints = 0;
  let allLinesValid = true;

  for (const line of borderLines) {
    if (!line.coordinates || !Array.isArray(line.coordinates) || line.coordinates.length < 2) {
      allLinesValid = false;
      break;
    }
    for (const c of line.coordinates) {
      if (
        typeof c.latitude !== 'number' ||
        !Number.isFinite(c.latitude) ||
        c.latitude < -90 ||
        c.latitude > 90 ||
        typeof c.longitude !== 'number' ||
        !Number.isFinite(c.longitude) ||
        c.longitude < -180 ||
        c.longitude > 180
      ) {
        allLinesValid = false;
        break;
      }
      totalPoints++;
    }
    if (!allLinesValid) break;
  }

  if (allLinesValid && totalPoints >= 2) {
    return {
      name: 'BORDER REFERENCE',
      tamilName: 'எல்லை குறிப்பு',
      status: 'VALID',
      statusLabel: 'PASS',
      isValid: true,
      reason: `VALID • ${totalPoints} REFERENCE POINTS`,
      reasonTamil: `சரியானது • ${totalPoints} எல்லை புள்ளிகள்`,
      badgeBg: 'border-green-500/60 bg-green-950/60 text-green-400',
    };
  }

  return {
    name: 'BORDER REFERENCE',
    tamilName: 'எல்லை குறிப்பு',
    status: 'INVALID',
    statusLabel: 'CHECK REQUIRED',
    isValid: false,
    reason: 'BORDER DATA INVALID',
    reasonTamil: 'எல்லை ஒருங்கிணைப்புகள் தவறானது',
    badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
  };
}

/**
 * Phase 17: Validate Sync Metadata structure & timestamp freshness
 */
function validateSyncMetadataRecord(meta: SyncMetadata | null): DatasetIntegrityInfo {
  if (!meta) {
    return {
      name: 'SYNC METADATA',
      tamilName: 'ஒத்திசைவு தகவல்',
      status: 'UNAVAILABLE',
      statusLabel: 'CHECK REQUIRED',
      isValid: false,
      reason: 'SYNC METADATA MISSING',
      reasonTamil: 'ஒத்திசைவு தகவல் இல்லை',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
    };
  }

  const timestampMs = meta.timestampMs;
  if (
    typeof timestampMs !== 'number' ||
    !Number.isFinite(timestampMs) ||
    timestampMs <= 0 ||
    Date.now() - timestampMs < -60000
  ) {
    return {
      name: 'SYNC METADATA',
      tamilName: 'ஒத்திசைவு தகவல்',
      status: 'INVALID',
      statusLabel: 'CHECK REQUIRED',
      isValid: false,
      reason: 'SYNC METADATA INVALID',
      reasonTamil: 'ஒத்திசைவு முத்திரை தவறானது',
      badgeBg: 'border-red-500/60 bg-red-950/60 text-red-400',
    };
  }

  const ageMs = Math.max(0, Date.now() - timestampMs);
  return {
    name: 'SYNC METADATA',
    tamilName: 'ஒத்திசைவு தகவல்',
    status: 'VALID',
    statusLabel: 'PASS',
    isValid: true,
    reason: `VALID • ${formatDataAge(ageMs)}`,
    reasonTamil: `சரியானது • ${formatDataAge(ageMs)}`,
    badgeBg: 'border-green-500/60 bg-green-950/60 text-green-400',
  };
}

function calculateDistanceNM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const distKm = R * c;
  const distNM = distKm / 1.852;
  
  return Math.max(0, distNM);
}

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  const bearing = (toDeg(theta) + 360) % 360;
  
  return (bearing + 360) % 360;
}

function getCardinalDirection(bearing: number | null): string {
  if (bearing === null || isNaN(bearing)) return '---';
  const directions = [
    'NORTH',
    'NORTHEAST',
    'EAST',
    'SOUTHEAST',
    'SOUTH',
    'SOUTHWEST',
    'WEST',
    'NORTHWEST',
  ];
  const normalized = (bearing % 360 + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

function formatBearing(bearing: number | null): string {
  if (bearing === null || isNaN(bearing)) return '---°';
  const rounded = Math.round(bearing) % 360;
  return `${rounded.toString().padStart(3, '0')}°`;
}

function formatDistance(distNM: number | null): string {
  if (distNM === null || isNaN(distNM)) return '--.- NM';
  return `${distNM.toFixed(1)} NM`;
}

function pointToSegmentDistanceNM(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number
): number {
  const midLatRad = ((pLat + aLat + bLat) / 3 * Math.PI) / 180;
  const cosLat = Math.cos(midLatRad);

  const px = pLon * cosLat;
  const py = pLat;
  const ax = aLon * cosLat;
  const ay = aLat;
  const bx = bLon * cosLat;
  const by = bLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }

  const nearestLat = aLat + t * (bLat - aLat);
  const nearestLon = aLon + t * (bLon - aLon);

  return calculateDistanceNM(pLat, pLon, nearestLat, nearestLon);
}

function calculateMinDistanceToBorderLines(
  pLat: number,
  pLon: number,
  borderLines: BorderLineData[]
): number | null {
  if (borderLines.length === 0) return null;

  let overallMin = Infinity;

  for (const line of borderLines) {
    const coords = line.coordinates;
    if (!coords || coords.length === 0) continue;

    if (coords.length === 1) {
      const d = calculateDistanceNM(pLat, pLon, coords[0].latitude, coords[0].longitude);
      if (d < overallMin) overallMin = d;
      continue;
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const d = pointToSegmentDistanceNM(
        pLat, pLon,
        coords[i].latitude, coords[i].longitude,
        coords[i + 1].latitude, coords[i + 1].longitude
      );
      if (d < overallMin) overallMin = d;
    }
  }

  return overallMin === Infinity ? null : overallMin;
}

function calculateWaveRiskScore(
  waveHeight: number,
  safeLimit: number,
  cautionLimit: number
): { contribution: number; status: SafetyLevel } {
  if (waveHeight < safeLimit) {
    const ratio = Math.max(0, waveHeight / safeLimit);
    const contribution = Math.round(ratio * 14.5);
    return { contribution: Math.min(14, contribution), status: 'SAFE' };
  } else if (waveHeight < cautionLimit) {
    const ratio = (waveHeight - safeLimit) / Math.max(0.1, cautionLimit - safeLimit);
    const contribution = Math.round(15 + ratio * 14.5);
    return { contribution: Math.min(29, contribution), status: 'CAUTION' };
  } else {
    const excess = (waveHeight - cautionLimit) / 1.5;
    const contribution = Math.round(30 + Math.min(20, excess * 20));
    return { contribution: Math.min(50, contribution), status: 'DANGER' };
  }
}

function calculateBorderRiskScore(
  distanceNM: number | null
): { contribution: number | null; status: SafetyLevel } {
  if (distanceNM === null || isNaN(distanceNM)) {
    return { contribution: null, status: 'UNAVAILABLE' };
  }

  if (distanceNM > 10.0) {
    const buffer = Math.min(10.0, distanceNM - 10.0);
    const contribution = Math.round(Math.max(0, 14.5 - (buffer / 10.0) * 14.5));
    return { contribution: Math.min(14, contribution), status: 'SAFE' };
  } else if (distanceNM > 5.0) {
    const ratio = (10.0 - distanceNM) / 5.0;
    const contribution = Math.round(15 + ratio * 14.5);
    return { contribution: Math.min(29, contribution), status: 'CAUTION' };
  } else {
    const proximity = (5.0 - Math.max(0, distanceNM)) / 5.0;
    const contribution = Math.round(30 + Math.min(20, proximity * 20));
    return { contribution: Math.min(50, contribution), status: 'DANGER' };
  }
}

function calculateOverallRiskScore(
  waveContrib: number | null,
  borderContrib: number | null,
  waveStatus: SafetyLevel,
  borderStatus: SafetyLevel
): { score: number | null; level: RiskLevel } {
  if (waveContrib === null && borderContrib === null) {
    return { score: null, level: 'UNAVAILABLE' };
  }

  if (waveContrib !== null && borderContrib !== null) {
    const baseScore = waveContrib + borderContrib;
    let finalScore = baseScore;

    if (waveStatus === 'DANGER' || borderStatus === 'DANGER') {
      finalScore = Math.max(60, Math.min(100, baseScore));
    } else if (waveStatus === 'CAUTION' || borderStatus === 'CAUTION') {
      finalScore = Math.max(30, Math.min(59, baseScore));
    } else {
      finalScore = Math.min(29, Math.max(0, baseScore));
    }

    let level: RiskLevel = 'LOW';
    if (finalScore >= 60) level = 'HIGH';
    else if (finalScore >= 30) level = 'MODERATE';

    return { score: finalScore, level };
  }

  const singleContrib = (waveContrib ?? borderContrib)! * 2;
  const activeStatus = waveContrib !== null ? waveStatus : borderStatus;
  let finalScore = singleContrib;

  if (activeStatus === 'DANGER') finalScore = Math.max(60, singleContrib);
  else if (activeStatus === 'CAUTION') finalScore = Math.max(30, Math.min(59, singleContrib));

  let level: RiskLevel = 'LOW';
  if (finalScore >= 60) level = 'HIGH';
  else if (finalScore >= 30) level = 'MODERATE';

  return { score: finalScore, level };
}

function getActionGuidance(
  overallStatus: SafetyLevel,
  waveStatus: SafetyLevel,
  borderStatus: SafetyLevel
): { primary: string; secondary: string; bullets: string[] } {
  if (overallStatus === 'UNAVAILABLE') {
    return {
      primary: 'WAIT FOR REQUIRED DATA',
      secondary: 'தேவையான தரவுக்காக காத்திருக்கவும்',
      bullets: [
        'Ensure GPS location access is enabled',
        'Perform pre-departure data sync before leaving shore',
      ],
    };
  }

  if (overallStatus === 'DANGER') {
    if (waveStatus === 'DANGER' && borderStatus === 'DANGER') {
      return {
        primary: 'HIGH MARINE RISK',
        secondary: 'அதிக கடல் ஆபத்து — பாதுகாப்பான பகுதிக்கு திரும்பவும்',
        bullets: [
          'Move toward a safer area immediately',
          'Reduce speed and avoid further exposure to rough water',
          'Move away from maritime reference border',
        ],
      };
    } else if (waveStatus === 'DANGER') {
      return {
        primary: 'HIGH WAVE RISK',
        secondary: 'அதிக அலை ஆபத்து — வேகத்தை குறைக்கவும்',
        bullets: [
          'Reduce vessel speed immediately',
          'Seek sheltered or calmer water',
          'Do not proceed further into high-risk wave conditions',
        ],
      };
    } else {
      return {
        primary: 'CRITICAL BORDER PROXIMITY',
        secondary: 'எல்லைக்கு மிக அருகில் — உடனடியாக விலகிச் செல்லவும்',
        bullets: [
          'Move away from border reference immediately if safe to do so',
          'Set heading toward safe domestic fishing zones',
          'Maintain continuous GPS position awareness',
        ],
      };
    }
  }

  if (overallStatus === 'CAUTION') {
    if (waveStatus === 'CAUTION' && borderStatus === 'CAUTION') {
      return {
        primary: 'ADVISORY LEVEL CONDITIONS',
        secondary: 'எச்சரிக்கை நிலை — கவனத்துடன் செல்லவும்',
        bullets: [
          'Reduce speed and monitor wave height trends',
          'Maintain safe standoff distance from reference line',
          'Avoid drifting further offshore',
        ],
      };
    } else if (waveStatus === 'CAUTION') {
      return {
        primary: 'ELEVATED SEA CONDITIONS',
        secondary: 'அலை நிலை அதிகரிப்பு — வேகம் குறைக்கவும்',
        bullets: [
          'Reduce speed to maintain vessel stability',
          'Monitor wave conditions continuously',
          'Avoid moving into rougher open water',
        ],
      };
    } else {
      return {
        primary: 'BORDER ADVISORY PROXIMITY',
        secondary: 'எல்லை எச்சரிக்கை பகுதி — பாதுகாப்பான தூரத்தை பராமரிக்கவும்',
        bullets: [
          'Maintain safe distance from maritime border',
          'Move away from border if practical and safe',
          'Verify heading toward authorized fishing grounds',
        ],
      };
    }
  }

  return {
    primary: 'CONDITIONS WITHIN PROTOTYPE LIMITS',
    secondary: 'நிலைமைகள் இயல்பான வரம்பிற்குள் உள்ளன',
    bullets: [
      'Continue navigation with normal maritime caution',
      'Maintain continuous GPS tracking and watch',
      'Follow standard pre-departure safety protocols',
    ],
  };
}

export const FishermanDashboard: React.FC = () => {
  // --- Phase 3: Real-Time Live GPS State ---
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('SEARCHING');
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);

  // --- Phase 3: Real-Time Network Connectivity State ---
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // --- Phase 4: IndexedDB Offline Cache State ---
  const [cachedWaveThreshold, setCachedWaveThreshold] = useState<WaveThresholdData | null>(null);
  const [cachedHotspots, setCachedHotspots] = useState<PfzHotspotData[]>([]);
  const [cachedBorderLines, setCachedBorderLines] = useState<BorderLineData[]>([]);
  const [lastSyncMetadata, setLastSyncMetadata] = useState<SyncMetadata | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('IDLE');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // --- Phase 5: Selected PFZ Hotspot State ---
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('');

  // --- Phase 8: Trip Monitoring State ---
  const [activeTrip, setActiveTrip] = useState<TripSession | null>(null);
  const [completedTripSummary, setCompletedTripSummary] = useState<TripSession | null>(null);
  const [tripElapsedMs, setTripElapsedMs] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<SafetyEvent[]>([]);

  // --- Phase 9: Emergency SOS State ---
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [sosCooldownSec, setSosCooldownSec] = useState<number>(0);
  const [recentEmergencyEvents, setRecentEmergencyEvents] = useState<EmergencyEvent[]>([]);
  const [activeEmergencySnapshot, setActiveEmergencySnapshot] = useState<EmergencyEvent | null>(null);
  const [isViewingSnapshotModal, setIsViewingSnapshotModal] = useState<boolean>(false);

  // --- Phase 10: Pre-Departure Readiness Warning Modal ---
  const [isReadinessWarningModalOpen, setIsReadinessWarningModalOpen] = useState<boolean>(false);

  // --- Phase 11: Local Voyage Track & Analytics State ---
  const [activeTripTrackPoints, setActiveTripTrackPoints] = useState<TripTrackPoint[]>([]);
  const [isDownsampled, setIsDownsampled] = useState<boolean>(false);
  const [isClearTrackModalOpen, setIsClearTrackModalOpen] = useState<boolean>(false);
  const [tripExposureTimes, setTripExposureTimes] = useState<{ safeMs: number; cautionMs: number; dangerMs: number }>({
    safeMs: 0,
    cautionMs: 0,
    dangerMs: 0,
  });

  // --- Phase 12: Route Planning & Safe Return Guidance State ---
  const [activeGuidanceMode, setActiveGuidanceMode] = useState<GuidanceMode>('PFZ');

  // --- Phase 14: Offline Voyage Safety Advisory & Trip Reporting State ---
  const [completedTripsList, setCompletedTripsList] = useState<TripSession[]>([]);
  const [selectedReportTripId, setSelectedReportTripId] = useState<string | null>(null);
  const [selectedTripTrackPoints, setSelectedTripTrackPoints] = useState<TripTrackPoint[]>([]);
  const [allDbSafetyEvents, setAllDbSafetyEvents] = useState<SafetyEvent[]>([]);
  const [allDbEmergencyEvents, setAllDbEmergencyEvents] = useState<EmergencyEvent[]>([]);

  // --- Phase 15: Offline Safety Alerts & Notification Engine State ---
  const [localAlerts, setLocalAlerts] = useState<SafetyAlertItem[]>([]);
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<string>>(new Set());

  // Refs for tracking transitions without extra renders
  const prevOverallStatusRef = useRef<SafetyLevel | null>(null);
  const prevGpsStatusRef = useRef<GpsStatus | null>(null);
  const prevIsOnlineRef = useRef<boolean>(isOnline);
  const latestRiskScoreRef = useRef<number | null>(null);
  const latestRiskLevelRef = useRef<RiskLevel>('LOW');
  const latestSafetyLevelRef = useRef<SafetyLevel>('SAFE');
  const lastTrackPointRef = useRef<{ timestamp: number; lat: number; lon: number } | null>(null);
  const prevSafetyStateRef = useRef<SafetyLevel | null>(null);
  const prevBorderStateRef = useRef<SafetyLevel | null>(null);
  const prevRiskTierRef = useRef<number>(0);
  const prevGpsStateForAlertRef = useRef<GpsStatus | null>(null);
  const prevFreshnessStateRef = useRef<OverallCacheHealth | null>(null);
  const prevDataPackageStatusRef = useRef<DataPackageOverallStatus | null>(null);

  const currentWaveHeightM = 1.8;

  // Helper to log Safety Events to IndexedDB
  const recordSafetyEvent = useCallback(async (
    eventType: SafetyEvent['eventType'],
    safetyLevel: SafetyEvent['safetyLevel'],
    message: string,
    associatedTripId?: string | null
  ) => {
    const now = Date.now();
    const event: SafetyEvent = {
      eventId: `evt-${now}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      formattedTime: formatTimeHHMM(now),
      tripId: associatedTripId,
      eventType,
      safetyLevel,
      message,
    };

    try {
      const db = await getDB();
      await db.put('safetyEvents', event);
      setRecentEvents((prev) => [event, ...prev.filter((e) => e.eventId !== event.eventId)].slice(0, 5));
      setAllDbSafetyEvents((prev) => [event, ...prev.filter((e) => e.eventId !== event.eventId)]);
    } catch (err) {
      console.error('Failed to log safety event to IndexedDB:', err);
    }
  }, []);

  // 1. Connectivity Event Listeners (Online / Offline) + Event Logging
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncState((prev) => (prev === 'OFFLINE_ATTEMPT' ? 'IDLE' : prev));
      if (!prevIsOnlineRef.current) {
        prevIsOnlineRef.current = true;
        recordSafetyEvent('ONLINE_MODE_RESTORED', 'ONLINE', 'Online connectivity restored');
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (prevIsOnlineRef.current) {
        prevIsOnlineRef.current = false;
        recordSafetyEvent('OFFLINE_MODE_ENTERED', 'OFFLINE', 'Offline mode entered — using local storage');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [recordSafetyEvent]);

  // 2. Real-Time Geolocation Watcher (Independent of Network Status)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('UNSUPPORTED');
      setGpsErrorMessage('Geolocation is not supported by your browser or device.');
      return;
    }

    setGpsStatus('SEARCHING');
    setGpsErrorMessage(null);

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    };

    const handleSuccess = (position: GeolocationPosition) => {
      const newLat = position.coords.latitude;
      const newLon = position.coords.longitude;
      setLatitude(newLat);
      setLongitude(newLon);
      setSpeedMps(position.coords.speed);
      setGpsStatus('CONNECTED');
      setGpsErrorMessage(null);

      if (prevGpsStatusRef.current !== null && prevGpsStatusRef.current !== 'CONNECTED') {
        recordSafetyEvent('GPS_RESTORED', 'SAFE', 'GPS satellite lock restored');
      }
      prevGpsStatusRef.current = 'CONNECTED';

      setActiveTrip((prevTrip) => {
        if (!prevTrip || prevTrip.status !== 'ACTIVE') return prevTrip;

        let addedDistance = 0;
        if (
          prevTrip.lastLatitude !== null &&
          prevTrip.lastLongitude !== null &&
          !isNaN(prevTrip.lastLatitude) &&
          !isNaN(prevTrip.lastLongitude)
        ) {
          const incNM = calculateDistanceNM(
            prevTrip.lastLatitude,
            prevTrip.lastLongitude,
            newLat,
            newLon
          );

          if (incNM > 0 && incNM <= 2.0 && !isNaN(incNM) && isFinite(incNM)) {
            addedDistance = incNM;
          }
        }

        const updatedTrip: TripSession = {
          ...prevTrip,
          totalDistanceNm: Number((prevTrip.totalDistanceNm + addedDistance).toFixed(2)),
          lastLatitude: newLat,
          lastLongitude: newLon,
          lastUpdated: Date.now(),
        };

        getDB().then((db) => db.put('tripSessions', updatedTrip)).catch(console.error);

        // Phase 11: Record Track Point with Sensible Filtering & Downsampling
        const now = Date.now();
        const lastPt = lastTrackPointRef.current;
        let shouldRecord = false;

        if (!lastPt) {
          shouldRecord = true;
        } else {
          const timeDiff = now - lastPt.timestamp;
          const distMoved = calculateDistanceNM(lastPt.lat, lastPt.lon, newLat, newLon);
          // Meaningful movement: at least ~3.7m (0.002 NM) or >= 10s elapsed, reject impossible jumps > 2.0 NM
          if (timeDiff >= 3000 && distMoved <= 2.0 && (distMoved >= 0.002 || timeDiff >= 10000)) {
            shouldRecord = true;
          }
        }

        if (shouldRecord) {
          lastTrackPointRef.current = { timestamp: now, lat: newLat, lon: newLon };
          const speedKnots = (position.coords.speed !== null && !isNaN(position.coords.speed) && position.coords.speed >= 0)
            ? Number((position.coords.speed * 1.94384).toFixed(1))
            : null;

          const newTrackPoint: TripTrackPoint = {
            pointId: `pt-${now}-${Math.floor(Math.random() * 1000)}`,
            tripId: prevTrip.tripId,
            timestamp: now,
            latitude: newLat,
            longitude: newLon,
            speedKnots,
            riskScore: latestRiskScoreRef.current,
            riskLevel: latestRiskLevelRef.current,
          };

          getDB().then((db) => db.put('tripTrackPoints', newTrackPoint)).catch(console.error);

          setActiveTripTrackPoints((prevPoints) => {
            const next = [...prevPoints, newTrackPoint];
            if (next.length > MAX_TRACK_POINTS_PER_TRIP) {
              setIsDownsampled(true);
              // Downsample: retain start point, every 2nd point, and latest point
              return [
                next[0],
                ...next.slice(1, -1).filter((_, idx) => idx % 2 === 0),
                next[next.length - 1],
              ];
            }
            return next;
          });
        }

        return updatedTrip;
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      let status: GpsStatus = 'UNAVAILABLE';
      let msg = 'GPS ERROR — Unable to retrieve current position.';

      switch (error.code) {
        case error.PERMISSION_DENIED:
          status = 'PERMISSION_DENIED';
          msg = 'GPS PERMISSION DENIED — Enable location access in settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          status = 'UNAVAILABLE';
          msg = 'GPS SIGNAL UNAVAILABLE — Searching for satellite lock...';
          break;
        case error.TIMEOUT:
          status = 'TIMEOUT';
          msg = 'GPS SIGNAL TIMEOUT — Retrying position fix...';
          break;
      }

      setGpsStatus(status);
      setGpsErrorMessage(msg);

      if (prevGpsStatusRef.current === 'CONNECTED') {
        recordSafetyEvent('GPS_LOST', 'UNAVAILABLE', 'GPS satellite signal lost');
      }
      prevGpsStatusRef.current = status;
    };

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      geoOptions
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [recordSafetyEvent]);

  // 3. Load Cached Data, Active Trip, Track Points, Safety Events & Emergency Events on Mount
  const loadLocalCache = useCallback(async () => {
    try {
      const db = await getDB();

      const [waveData, hotspots, borderLines, syncMeta, trips, events, emergencies] = await Promise.all([
        db.get('waveThresholds', 'default'),
        db.getAll('pfzHotspots'),
        db.getAll('borderLines'),
        db.get('syncMetadata', 'last-sync'),
        db.getAll('tripSessions'),
        db.getAll('safetyEvents'),
        db.getAll('emergencyEvents'),
      ]);

      if (waveData) setCachedWaveThreshold(waveData);
      if (hotspots && hotspots.length > 0) {
        setCachedHotspots(hotspots);
        setSelectedHotspotId((prev) => prev || hotspots[0].id);
      }
      if (borderLines && borderLines.length > 0) setCachedBorderLines(borderLines);
      if (syncMeta) {
        if (!syncMeta.timestampMs) {
          syncMeta.timestampMs = Date.now();
        }
        setLastSyncMetadata(syncMeta);
      }

      const foundActive = trips.find((t) => t.status === 'ACTIVE');
      if (foundActive) {
        setActiveTrip(foundActive);
        setTripElapsedMs(Date.now() - foundActive.startTime);
        try {
          const trackPts = await db.getAllFromIndex('tripTrackPoints', 'by-trip', foundActive.tripId);
          if (trackPts && trackPts.length > 0) {
            const sorted = trackPts.sort((a, b) => a.timestamp - b.timestamp);
            setActiveTripTrackPoints(sorted);
            lastTrackPointRef.current = {
              timestamp: sorted[sorted.length - 1].timestamp,
              lat: sorted[sorted.length - 1].latitude,
              lon: sorted[sorted.length - 1].longitude,
            };
          }
        } catch (e) {
          console.error('Failed to restore active track points from DB:', e);
        }
      }

      if (events && events.length > 0) {
        const sorted = events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
        setRecentEvents(sorted);
        setAllDbSafetyEvents(events);
      }

      if (emergencies && emergencies.length > 0) {
        const sorted = emergencies.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
        setRecentEmergencyEvents(sorted);
        setAllDbEmergencyEvents(emergencies);
      }

      if (trips && trips.length > 0) {
        const completed = trips.filter((t) => t.status === 'COMPLETED').sort((a, b) => b.startTime - a.startTime);
        setCompletedTripsList(completed);
        if (completed.length > 0) {
          setSelectedReportTripId((prev) => prev || completed[0].tripId);
        }
      }

      // Phase 15: Restore safety alerts
      try {
        const dbAlerts = await db.getAll('safetyAlerts');
        if (dbAlerts && dbAlerts.length > 0) {
          const sorted = dbAlerts.sort((a, b) => b.timestamp - a.timestamp);
          setLocalAlerts(sorted);
          const acked = new Set(sorted.filter((a) => a.acknowledged).map((a) => a.alertId));
          setAcknowledgedAlertIds(acked);
        }
      } catch (err) {
        console.warn('Safety alerts store empty or uninitialized:', err);
      }
    } catch (err) {
      console.error('Failed to load local cache from IndexedDB:', err);
      setSyncMessage('LOCAL STORAGE UNAVAILABLE');
    }
  }, []);

  useEffect(() => {
    loadLocalCache();
  }, [loadLocalCache]);

  // 4. Drift-Free Trip Duration Timer & Risk Exposure Time Accumulator
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'ACTIVE') {
      return;
    }

    const interval = setInterval(() => {
      setTripElapsedMs(Date.now() - activeTrip.startTime);
      setTripExposureTimes((prev) => {
        const currentSafety = latestSafetyLevelRef.current;
        if (currentSafety === 'DANGER') {
          return { ...prev, dangerMs: prev.dangerMs + 1000 };
        } else if (currentSafety === 'CAUTION') {
          return { ...prev, cautionMs: prev.cautionMs + 1000 };
        } else if (currentSafety === 'SAFE') {
          return { ...prev, safeMs: prev.safeMs + 1000 };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrip]);

  // 5. SOS Cooldown Timer
  useEffect(() => {
    if (sosCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setSosCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [sosCooldownSec]);

  // 6. Pre-Departure Data Synchronization Handler
  const handlePreDepartureSync = async () => {
    if (!navigator.onLine) {
      setSyncState('OFFLINE_ATTEMPT');
      setSyncMessage('SYNC UNAVAILABLE — Connect to Internet before shore departure.');
      return;
    }

    setSyncState('SYNCING');
    setSyncMessage('Synchronizing pre-departure marine data...');

    try {
      const db = await getDB();
      const tx = db.transaction(
        ['waveThresholds', 'pfzHotspots', 'borderLines', 'syncMetadata'],
        'readwrite'
      );

      await tx.objectStore('waveThresholds').put(MOCK_PRE_DEPARTURE_WAVE_THRESHOLDS);

      await tx.objectStore('pfzHotspots').clear();
      for (const hotspot of MOCK_PRE_DEPARTURE_PFZ_HOTSPOTS) {
        await tx.objectStore('pfzHotspots').put(hotspot);
      }

      await tx.objectStore('borderLines').clear();
      for (const border of MOCK_PRE_DEPARTURE_BORDER_LINES) {
        await tx.objectStore('borderLines').put(border);
      }

      const now = new Date();
      const formattedTimestamp = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const newSyncMeta: SyncMetadata = {
        id: 'last-sync',
        timestamp: formattedTimestamp,
        timestampMs: now.getTime(),
        status: 'success',
        itemCount: MOCK_PRE_DEPARTURE_PFZ_HOTSPOTS.length + MOCK_PRE_DEPARTURE_BORDER_LINES.length + 1,
      };

      await tx.objectStore('syncMetadata').put(newSyncMeta);
      await tx.done;

      setCachedWaveThreshold(MOCK_PRE_DEPARTURE_WAVE_THRESHOLDS);
      setCachedHotspots(MOCK_PRE_DEPARTURE_PFZ_HOTSPOTS);
      setSelectedHotspotId(MOCK_PRE_DEPARTURE_PFZ_HOTSPOTS[0].id);
      setCachedBorderLines(MOCK_PRE_DEPARTURE_BORDER_LINES);
      setLastSyncMetadata(newSyncMeta);

      setSyncState('SYNC_SUCCESS');
      setSyncMessage('✓ SYNC COMPLETE — All offline datasets stored locally.');

      setTimeout(() => {
        setSyncState('IDLE');
        setSyncMessage(null);
      }, 4000);
    } catch (err) {
      console.error('IndexedDB Sync Error:', err);
      setSyncState('SYNC_ERROR');
      setSyncMessage('SYNC ERROR — Local storage write failure.');
    }
  };

  // --- Phase 5: Dynamic Navigation Computations ---

  const activeHotspot: PfzHotspotData | null = useMemo(() => {
    if (cachedHotspots.length === 0) return null;
    const found = cachedHotspots.find((h) => h.id === selectedHotspotId);
    return found || cachedHotspots[0];
  }, [cachedHotspots, selectedHotspotId]);

  const hasGpsFix = latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude);

  const navigationData = useMemo(() => {
    if (!hasGpsFix || !activeHotspot) {
      return {
        bearing: null,
        distanceNM: null,
        cardinalDirection: '---',
        arrowRotation: 0,
      };
    }

    const calculatedBearing = calculateBearing(
      latitude!,
      longitude!,
      activeHotspot.latitude,
      activeHotspot.longitude
    );

    const calculatedDistance = calculateDistanceNM(
      latitude!,
      longitude!,
      activeHotspot.latitude,
      activeHotspot.longitude
    );

    const cardinal = getCardinalDirection(calculatedBearing);

    return {
      bearing: calculatedBearing,
      distanceNM: calculatedDistance,
      cardinalDirection: cardinal,
      arrowRotation: calculatedBearing,
    };
  }, [hasGpsFix, latitude, longitude, activeHotspot]);

  const navStatusBadge = useMemo(() => {
    if (hasGpsFix && activeHotspot) {
      return {
        label: 'NAVIGATION READY',
        bg: 'border-green-500 bg-green-950/60 text-green-400',
      };
    }
    if (!hasGpsFix && activeHotspot) {
      return {
        label: 'WAITING FOR GPS',
        bg: 'border-amber-500 bg-amber-950/60 text-amber-300',
      };
    }
    if (hasGpsFix && !activeHotspot) {
      return {
        label: 'NO PFZ DATA',
        bg: 'border-amber-500 bg-amber-950/60 text-amber-300',
      };
    }
    return {
      label: 'NAVIGATION UNAVAILABLE',
      bg: 'border-red-500 bg-red-950/60 text-red-400',
    };
  }, [hasGpsFix, activeHotspot]);

  // --- Phase 6 & 7: Marine Safety Engine & Risk Score Computations ---

  const waveSafetyAnalysis = useMemo(() => {
    if (!cachedWaveThreshold) {
      return {
        status: 'UNAVAILABLE' as SafetyLevel,
        safeLimit: 2.5,
        cautionLimit: 3.5,
        label: 'THRESHOLD UNAVAILABLE',
        contribution: null,
      };
    }

    const { safeLimit, cautionLimit } = cachedWaveThreshold;
    const { contribution, status } = calculateWaveRiskScore(currentWaveHeightM, safeLimit, cautionLimit);

    return {
      status,
      safeLimit,
      cautionLimit,
      label: status,
      contribution,
    };
  }, [cachedWaveThreshold, currentWaveHeightM]);

  const borderSafetyAnalysis = useMemo(() => {
    if (cachedBorderLines.length === 0) {
      return {
        distanceNM: null,
        status: 'UNAVAILABLE' as SafetyLevel,
        label: 'NO BORDER DATA',
        explanation: 'BORDER DATA NOT SYNCED',
        contribution: null,
      };
    }

    if (!hasGpsFix) {
      return {
        distanceNM: null,
        status: 'UNAVAILABLE' as SafetyLevel,
        label: 'WAITING FOR GPS',
        explanation: 'GPS FIX REQUIRED FOR BORDER PROXIMITY',
        contribution: null,
      };
    }

    const distNM = calculateMinDistanceToBorderLines(latitude!, longitude!, cachedBorderLines);

    if (distNM === null || isNaN(distNM)) {
      return {
        distanceNM: null,
        status: 'UNAVAILABLE' as SafetyLevel,
        label: 'UNAVAILABLE',
        explanation: 'UNABLE TO CALCULATE BORDER DISTANCE',
        contribution: null,
      };
    }

    const { contribution, status } = calculateBorderRiskScore(distNM);
    let explanation = 'WITHIN SAFE OPERATING AREA';
    if (status === 'DANGER') {
      explanation = 'CRITICAL PROXIMITY TO BORDER REFERENCE';
    } else if (status === 'CAUTION') {
      explanation = 'APPROACHING BORDER ADVISORY LIMIT';
    }

    return {
      distanceNM: distNM,
      status,
      label: status,
      explanation,
      contribution,
    };
  }, [cachedBorderLines, hasGpsFix, latitude, longitude]);

  const combinedSafetyAnalysis = useMemo(() => {
    const waveStatus = waveSafetyAnalysis.status;
    const borderStatus = borderSafetyAnalysis.status;

    if (waveStatus === 'UNAVAILABLE' && borderStatus === 'UNAVAILABLE') {
      return {
        overallStatus: 'UNAVAILABLE' as SafetyLevel,
        subtitle: 'SAFETY DATA UNAVAILABLE — SYNC / GPS REQUIRED',
        waveFactor: 'UNAVAILABLE' as SafetyLevel,
        borderFactor: 'UNAVAILABLE' as SafetyLevel,
        riskScore: null,
        riskLevel: 'UNAVAILABLE' as RiskLevel,
      };
    }

    let overallStatus: SafetyLevel = 'SAFE';

    if (waveStatus === 'DANGER' || borderStatus === 'DANGER') {
      overallStatus = 'DANGER';
    } else if (waveStatus === 'CAUTION' || borderStatus === 'CAUTION') {
      overallStatus = 'CAUTION';
    } else if (waveStatus === 'SAFE' && borderStatus === 'SAFE') {
      overallStatus = 'SAFE';
    } else if (waveStatus === 'SAFE' && borderStatus === 'UNAVAILABLE') {
      overallStatus = 'SAFE';
    } else if (borderStatus === 'SAFE' && waveStatus === 'UNAVAILABLE') {
      overallStatus = 'SAFE';
    }

    let subtitle = 'ALL CHECKS WITHIN PROTOTYPE LIMITS';

    if (overallStatus === 'DANGER') {
      if (waveStatus === 'DANGER' && borderStatus === 'DANGER') {
        subtitle = 'HIGH WAVE RISK + CRITICAL BORDER PROXIMITY';
      } else if (waveStatus === 'DANGER') {
        subtitle = 'WAVE CONDITIONS EXCEED SAFE LIMIT';
      } else {
        subtitle = 'TOO CLOSE TO BORDER REFERENCE';
      }
    } else if (overallStatus === 'CAUTION') {
      if (waveStatus === 'CAUTION' && borderStatus === 'CAUTION') {
        subtitle = 'WAVE + BORDER CONDITIONS AT ADVISORY LEVEL';
      } else if (waveStatus === 'CAUTION') {
        subtitle = `WAVE CONDITIONS APPROACHING LIMIT (${currentWaveHeightM.toFixed(1)}m)`;
      } else {
        subtitle = 'BORDER DISTANCE REQUIRES ATTENTION';
      }
    } else if (overallStatus === 'SAFE') {
      if (borderStatus === 'UNAVAILABLE') {
        subtitle = 'WAVE WITHIN LIMIT • BORDER DATA UNAVAILABLE';
      } else if (waveStatus === 'UNAVAILABLE') {
        subtitle = 'BORDER SAFE • WAVE THRESHOLD UNAVAILABLE';
      } else {
        subtitle = 'ALL CHECKS WITHIN PROTOTYPE LIMITS';
      }
    }

    const { score, level } = calculateOverallRiskScore(
      waveSafetyAnalysis.contribution,
      borderSafetyAnalysis.contribution,
      waveStatus,
      borderStatus
    );

    // Sync latest safety references for real-time track point recording
    latestRiskScoreRef.current = score;
    latestRiskLevelRef.current = level;
    latestSafetyLevelRef.current = overallStatus;

    return {
      overallStatus,
      subtitle,
      waveFactor: waveStatus,
      borderFactor: borderStatus,
      riskScore: score,
      riskLevel: level,
    };
  }, [waveSafetyAnalysis, borderSafetyAnalysis, currentWaveHeightM]);

  // --- Phase 15: Local Safety Alert Engine Handlers & Transitions ---

  // Trigger typed deterministic local alert and store in IndexedDB
  const triggerLocalAlert = useCallback(async (
    category: AlertCategory,
    priority: AlertPriority,
    title: string,
    tamilTitle: string,
    message: string,
    tamilMessage: string,
    action: string,
    tamilAction: string,
    customTripId?: string | null
  ) => {
    const now = Date.now();
    const alertId = `alert-${now}-${Math.floor(Math.random() * 1000)}`;
    const item: SafetyAlertItem = {
      alertId,
      tripId: customTripId !== undefined ? customTripId : (activeTrip ? activeTrip.tripId : null),
      timestamp: now,
      formattedTime: formatTimeHHMM(now),
      type: category,
      priority,
      title,
      tamilTitle,
      message,
      tamilMessage,
      action,
      tamilAction,
      riskScore: latestRiskScoreRef.current,
      safetyLevel: latestSafetyLevelRef.current,
      latitude: latitude !== null && !isNaN(latitude) ? latitude : null,
      longitude: longitude !== null && !isNaN(longitude) ? longitude : null,
      acknowledged: false,
    };

    try {
      const db = await getDB();
      await db.put('safetyAlerts', item);
      setLocalAlerts((prev) => [item, ...prev.filter((a) => a.alertId !== item.alertId)]);
    } catch (err) {
      console.error('Failed to store safety alert in IndexedDB:', err);
      setLocalAlerts((prev) => [item, ...prev.filter((a) => a.alertId !== item.alertId)]);
    }
  }, [activeTrip, latitude, longitude]);

  // Acknowledge alert (dismisses from active display without deleting history or altering safety calculations)
  const handleAcknowledgeAlert = useCallback(async (alertId: string) => {
    setAcknowledgedAlertIds((prev) => {
      const updated = new Set(prev);
      updated.add(alertId);
      return updated;
    });

    try {
      const db = await getDB();
      const existing = await db.get('safetyAlerts', alertId);
      if (existing) {
        existing.acknowledged = true;
        await db.put('safetyAlerts', existing);
      }
      setLocalAlerts((prev) =>
        prev.map((a) => (a.alertId === alertId ? { ...a, acknowledged: true } : a))
      );
    } catch (err) {
      console.error('Failed to update alert acknowledgement in IndexedDB:', err);
    }
  }, []);

  // 1. Safety State Transition Alert Detection (SAFE -> CAUTION, CAUTION -> DANGER, SAFE -> DANGER, DANGER -> IMPROVED)
  useEffect(() => {
    const current = combinedSafetyAnalysis.overallStatus;
    const prev = prevSafetyStateRef.current;

    if (prev !== null && prev !== current && current !== 'UNAVAILABLE' && prev !== 'UNAVAILABLE') {
      if (prev === 'SAFE' && current === 'CAUTION') {
        triggerLocalAlert(
          'SAFETY_TRANSITION',
          'ADVISORY',
          'MARINE SAFETY CONDITION CHANGED',
          'எச்சரிக்கை நிலை ஏற்பட்டுள்ளது',
          'Marine conditions have reached CAUTION level.',
          'கடல் நிலை எச்சரிக்கை நிலையை அடைந்துள்ளது.',
          'REASSESS MARINE CONDITIONS.',
          'கடல் நிலைகளை மீண்டும் மதிப்பாய்வு செய்யவும்.'
        );
      } else if (prev === 'CAUTION' && current === 'DANGER') {
        triggerLocalAlert(
          'SAFETY_TRANSITION',
          'HIGH',
          'HIGH-RISK MARINE CONDITION DETECTED',
          'அதிக ஆபத்து கடல் நிலை கண்டறியப்பட்டது',
          'Marine conditions have escalated to DANGER level.',
          'கடல் நிலை ஆபத்தான நிலையை அடைந்துள்ளது.',
          'FOLLOW SAFETY GUIDANCE.',
          'பாதுகாப்பு வழிகாட்டுதலைப் பின்பற்றவும்.'
        );
      } else if (prev === 'SAFE' && current === 'DANGER') {
        triggerLocalAlert(
          'SAFETY_TRANSITION',
          'CRITICAL',
          'CRITICAL SAFETY CONDITION DETECTED',
          'முக்கியமான பாதுகாப்பு ஆபத்து கண்டறியப்பட்டது',
          'Immediate escalation to DANGER safety condition.',
          'உடனடி அதிக ஆபத்து கடல் நிலை கண்டறியப்பட்டது.',
          'FOLLOW SAFETY GUIDANCE.',
          'பாதுகாப்பு வழிகாட்டுதலைப் பின்பற்றவும்.'
        );
      } else if (prev === 'DANGER' && (current === 'CAUTION' || current === 'SAFE')) {
        triggerLocalAlert(
          'SAFETY_TRANSITION',
          'INFO',
          'SAFETY CONDITIONS IMPROVED',
          'பாதுகாப்பு நிலை சீரடைந்துள்ளது',
          `Marine conditions returned from DANGER to ${current}.`,
          `கடல் நிலை ஆபத்து நிலையிலிருந்து ${current === 'SAFE' ? 'பாதுகாப்பானது' : 'எச்சரிக்கை'} நிலைக்கு மாறியுள்ளது.`,
          'CONTINUE TO MONITOR CONDITIONS.',
          'தொடர்ந்து நிலைமையை கண்காணிக்கவும்.'
        );
      }
    }
    prevSafetyStateRef.current = current;
  }, [combinedSafetyAnalysis.overallStatus, triggerLocalAlert]);

  // Log Safety State Transition Event (Phase 8 event log)
  useEffect(() => {
    const current = combinedSafetyAnalysis.overallStatus;
    const prev = prevOverallStatusRef.current;

    if (prev !== null && prev !== current && current !== 'UNAVAILABLE') {
      let msg = `Safety state changed to ${current}`;
      if (prev === 'DANGER' && current === 'CAUTION') {
        msg = 'Safety state improved to CAUTION';
      } else if ((prev === 'CAUTION' || prev === 'DANGER') && current === 'SAFE') {
        msg = 'Safety state returned to SAFE';
      }
      recordSafetyEvent('SAFETY_STATE_CHANGED', current, msg, activeTrip?.tripId);
    }
    prevOverallStatusRef.current = current;
  }, [combinedSafetyAnalysis.overallStatus, activeTrip, recordSafetyEvent]);

  // 2. Border State Transition Alert Detection & Critical Border Proximity during PFZ
  useEffect(() => {
    const current = borderSafetyAnalysis.status;
    const prev = prevBorderStateRef.current;

    if (prev !== null && prev !== current && current !== 'UNAVAILABLE') {
      if (current === 'DANGER') {
        if (activeGuidanceMode === 'PFZ') {
          triggerLocalAlert(
            'BORDER_WARNING',
            'CRITICAL',
            'CRITICAL BORDER PROXIMITY',
            'முக்கியமான எல்லை அருகாமை ஆபத்து',
            `Vessel is within ${formatDistance(borderSafetyAnalysis.distanceNM)} of maritime border reference during PFZ navigation.`,
            'PFZ வழிசெலுத்தலின் போது படகு சர்வதேச எல்லை குறிப்புக்கு மிக அருகில் உள்ளது.',
            'MOVE AWAY FROM BORDER BEFORE CONTINUING TO PFZ.',
            'PFZ நோக்கி தொடர்வதற்கு முன் எல்லையிலிருந்து விலகவும்.'
          );
        } else {
          triggerLocalAlert(
            'BORDER_WARNING',
            'HIGH',
            'BORDER DANGER',
            'எல்லைக்கு மிக அருகில் ஆபத்து',
            `Vessel is ${formatDistance(borderSafetyAnalysis.distanceNM)} from border baseline (<= 5 NM).`,
            'படகு எல்லை குறிப்புக்கு 5 NM அல்லது அதற்கும் குறைவான தூரத்தில் உள்ளது.',
            'MOVE AWAY FROM BORDER.',
            'எல்லையிலிருந்து விலகவும்.'
          );
        }
      } else if (current === 'CAUTION' && prev === 'SAFE') {
        triggerLocalAlert(
          'BORDER_WARNING',
          'ADVISORY',
          'BORDER CAUTION',
          'எல்லை அருகாமையில் எச்சரிக்கை',
          `Vessel is ${formatDistance(borderSafetyAnalysis.distanceNM)} from border baseline (<= 10 NM).`,
          'படகு எல்லை எச்சரிக்கை வரம்பிற்குள் (<= 10 NM) உள்ளது.',
          'MAINTAIN SAFE STANDOFF DISTANCE.',
          'பாதுகாப்பான இடைவெளியைப் பராமரிக்கவும்.'
        );
      }
    }
    prevBorderStateRef.current = current;
  }, [borderSafetyAnalysis.status, borderSafetyAnalysis.distanceNM, activeGuidanceMode, triggerLocalAlert]);

  // 3. Risk Score Threshold Alert Detection (>= 60 HIGH, >= 80 CRITICAL) with Tier Crossing
  useEffect(() => {
    const score = combinedSafetyAnalysis.riskScore;
    if (score === null || isNaN(score)) {
      prevRiskTierRef.current = 0;
      return;
    }

    let currentTier = 0;
    if (score >= 80) currentTier = 2;
    else if (score >= 60) currentTier = 1;
    else currentTier = 0;

    const prevTier = prevRiskTierRef.current;
    if (currentTier > prevTier) {
      if (currentTier === 2) {
        triggerLocalAlert(
          'RISK_WARNING',
          'CRITICAL',
          'CRITICAL RISK ALERT',
          'முக்கியமான ஆபத்து எச்சரிக்கை',
          `Marine risk score escalated to ${score} / 100 (>= 80).`,
          `கடல் ஆபத்து குறியீடு ${score} / 100 ஐ எட்டியுள்ளது (>= 80).`,
          'REDUCE EXPOSURE AND FOLLOW SAFETY GUIDANCE.',
          'ஆபத்து வெளிப்பாட்டைக் குறைத்து பாதுகாப்பு வழிகாட்டுதலைப் பின்பற்றவும்.'
        );
      } else if (currentTier === 1 && prevTier === 0) {
        triggerLocalAlert(
          'RISK_WARNING',
          'HIGH',
          'HIGH RISK ALERT',
          'அதிக ஆபத்து எச்சரிக்கை',
          `Marine risk score increased to ${score} / 100 (>= 60).`,
          `கடல் ஆபத்து குறியீடு ${score} / 100 ஆக உயர்ந்துள்ளது (>= 60).`,
          'REDUCE EXPOSURE AND FOLLOW SAFETY GUIDANCE.',
          'ஆபத்து வெளிப்பாட்டைக் குறைத்து பாதுகாப்பு வழிகாட்டுதலைப் பின்பற்றவும்.'
        );
      }
    }
    prevRiskTierRef.current = currentTier;
  }, [combinedSafetyAnalysis.riskScore, triggerLocalAlert]);

  // 4. GPS Signal Lost / Recovered Alerts during Active Trip
  useEffect(() => {
    const current = gpsStatus;
    const prev = prevGpsStateForAlertRef.current;

    if (activeTrip && activeTrip.status === 'ACTIVE' && prev !== null && prev !== current) {
      if (prev === 'CONNECTED' && (current === 'UNAVAILABLE' || current === 'TIMEOUT' || current === 'PERMISSION_DENIED')) {
        triggerLocalAlert(
          'GPS_STATUS',
          'HIGH',
          'GPS SIGNAL LOST',
          'GPS சிக்னல் இல்லை',
          'Valid GPS satellite lock lost during active voyage.',
          'பயணத்தின் போது GPS செயற்கைக்கோள் சிக்னல் துண்டிக்கப்பட்டது.',
          'WAIT FOR GPS FIX.',
          'GPS சிக்னலுக்காக காத்திருக்கவும்.'
        );
      } else if (prev !== 'CONNECTED' && current === 'CONNECTED') {
        triggerLocalAlert(
          'GPS_STATUS',
          'INFO',
          'GPS SIGNAL RECOVERED',
          'GPS சிக்னல் மீண்டும் கிடைத்தது',
          'GPS satellite lock successfully re-established.',
          'GPS செயற்கைக்கோள் இணைப்பு மீண்டும் பெறப்பட்டது.',
          'RESUME NORMAL TRACKING.',
          'சாதாரண கண்காணிப்பைத் தொடரவும்.'
        );
      }
    }
    prevGpsStateForAlertRef.current = current;
  }, [gpsStatus, activeTrip, triggerLocalAlert]);

  // Top Active Alert Determination (CRITICAL > HIGH > ADVISORY > INFO, most recent)
  const activeAlert: SafetyAlertItem | null = useMemo(() => {
    const priorityWeight: Record<AlertPriority, number> = {
      CRITICAL: 4,
      HIGH: 3,
      ADVISORY: 2,
      INFO: 1,
    };

    const unacked = localAlerts.filter((a) => !acknowledgedAlertIds.has(a.alertId));
    if (unacked.length === 0) return null;

    const sorted = [...unacked].sort((a, b) => {
      const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (pDiff !== 0) return pDiff;
      return b.timestamp - a.timestamp;
    });

    return sorted[0];
  }, [localAlerts, acknowledgedAlertIds]);

  // Phase 12/15 Route Guidance Mode Priority Integration (DANGER + CRITICAL Alert prioritizes SAFETY mode)
  useEffect(() => {
    if (activeAlert?.priority === 'CRITICAL' && combinedSafetyAnalysis.overallStatus === 'DANGER') {
      if (activeGuidanceMode === 'PFZ') {
        setActiveGuidanceMode('SAFETY');
      }
    }
  }, [activeAlert, combinedSafetyAnalysis.overallStatus, activeGuidanceMode]);

  const actionableGuidance = useMemo(() => {
    return getActionGuidance(
      combinedSafetyAnalysis.overallStatus,
      waveSafetyAnalysis.status,
      borderSafetyAnalysis.status
    );
  }, [combinedSafetyAnalysis.overallStatus, waveSafetyAnalysis.status, borderSafetyAnalysis.status]);

  const safetyConfig = SAFETY_LEVEL_CONFIG[combinedSafetyAnalysis.overallStatus];

  // --- Phase 16: Offline Data Freshness & Cache Health Engine ---
  const cacheHealthSummary: CacheHealthSummary = useMemo(() => {
    const syncTimeMs = lastSyncMetadata?.timestampMs ?? null;

    // 1. Wave Threshold Freshness
    const waveFreshness = evaluateDataFreshness(syncTimeMs, cachedWaveThreshold !== null);
    const waveHealth: DatasetHealthInfo = {
      name: 'WAVE THRESHOLD',
      tamilName: 'அலை உயர வரம்பு',
      state: waveFreshness.state,
      stateLabel: waveFreshness.stateLabel,
      stateLabelTamil: waveFreshness.stateLabelTamil,
      badgeBg: waveFreshness.badgeBg,
      lastUpdatedFormatted: waveFreshness.lastUpdatedFormatted,
      ageFormatted: waveFreshness.ageFormatted,
      details: cachedWaveThreshold
        ? `SAFE: ${cachedWaveThreshold.safeLimit}m • CAUTION: ${cachedWaveThreshold.cautionLimit}m`
        : 'WAVE THRESHOLD DATA UNAVAILABLE',
      isMissing: cachedWaveThreshold === null,
      isStale: waveFreshness.state === 'STALE',
    };

    // 2. PFZ Hotspots Freshness
    const pfzFreshness = evaluateDataFreshness(syncTimeMs, cachedHotspots.length > 0);
    const pfzHealth: DatasetHealthInfo = {
      name: 'PFZ HOTSPOTS',
      tamilName: 'PFZ மீன்பிடி பகுதிகள்',
      state: pfzFreshness.state,
      stateLabel: pfzFreshness.stateLabel,
      stateLabelTamil: pfzFreshness.stateLabelTamil,
      badgeBg: pfzFreshness.badgeBg,
      lastUpdatedFormatted: pfzFreshness.lastUpdatedFormatted,
      ageFormatted: pfzFreshness.ageFormatted,
      details: cachedHotspots.length > 0
        ? `${cachedHotspots.length} HOTSPOTS AVAILABLE`
        : 'PFZ DATA UNAVAILABLE',
      isMissing: cachedHotspots.length === 0,
      isStale: pfzFreshness.state === 'STALE',
    };

    // 3. Border Reference Freshness
    const borderFreshness = evaluateDataFreshness(syncTimeMs, cachedBorderLines.length > 0);
    const borderHealth: DatasetHealthInfo = {
      name: 'BORDER REFERENCE',
      tamilName: 'எல்லை குறிப்பு',
      state: borderFreshness.state,
      stateLabel: borderFreshness.stateLabel,
      stateLabelTamil: borderFreshness.stateLabelTamil,
      badgeBg: borderFreshness.badgeBg,
      lastUpdatedFormatted: borderFreshness.lastUpdatedFormatted,
      ageFormatted: borderFreshness.ageFormatted,
      details: cachedBorderLines.length > 0
        ? `${cachedBorderLines.length} REFERENCE BASELINE (1 LINE)`
        : 'BORDER DATA UNAVAILABLE',
      isMissing: cachedBorderLines.length === 0,
      isStale: borderFreshness.state === 'STALE',
    };

    // 4. Sync Metadata Health
    const syncFreshness = evaluateDataFreshness(syncTimeMs, lastSyncMetadata !== null);
    const syncHealth: DatasetHealthInfo = {
      name: 'LOCAL DATA SYNC',
      tamilName: 'கடைசி தரவு ஒத்திசைவு',
      state: syncFreshness.state,
      stateLabel: lastSyncMetadata ? syncFreshness.stateLabel : 'NOT SYNCED',
      stateLabelTamil: lastSyncMetadata ? syncFreshness.stateLabelTamil : 'ஒத்திசைக்கப்படவில்லை',
      badgeBg: lastSyncMetadata ? syncFreshness.badgeBg : 'border-neutral-700 bg-neutral-900 text-neutral-400',
      lastUpdatedFormatted: lastSyncMetadata ? lastSyncMetadata.timestamp : 'NOT SYNCED',
      ageFormatted: syncFreshness.ageFormatted,
      details: lastSyncMetadata
        ? `${lastSyncMetadata.itemCount} ITEMS STORED LOCALLY`
        : 'NO PRE-DEPARTURE SYNC PERFORMED',
      isMissing: lastSyncMetadata === null,
      isStale: syncFreshness.state === 'STALE',
    };

    // Overall Cache Health Evaluation
    const hasMissing = waveHealth.isMissing || pfzHealth.isMissing || borderHealth.isMissing;
    const hasStale = waveHealth.isStale || pfzHealth.isStale || borderHealth.isStale;
    const hasAging = waveHealth.state === 'AGING' || pfzHealth.state === 'AGING' || borderHealth.state === 'AGING';
    const allFresh = waveHealth.state === 'FRESH' && pfzHealth.state === 'FRESH' && borderHealth.state === 'FRESH';

    let overallHealth: OverallCacheHealth = 'CACHE_READY';
    let overallLabel = 'CACHE READY';
    let overallTamilLabel = 'தரவு தயாராக உள்ளது';
    let overallBadge = 'border-green-500 bg-green-950/70 text-green-400';
    let recommendation = 'ALL CACHED DATASETS ARE FRESH AND READY FOR DEPARTURE.';
    let recommendationTamil = 'அனைத்து தரவுகளும் புதுப்பிக்கப்பட்டு புறப்பட தயாராக உள்ளன.';

    if (hasMissing) {
      overallHealth = 'CACHE_INCOMPLETE';
      overallLabel = 'CACHE INCOMPLETE';
      overallTamilLabel = 'தரவு முழுமையற்றது';
      overallBadge = 'border-red-500 bg-red-950/70 text-red-400';
      recommendation = 'REQUIRED DATA MISSING. PERFORM PRE-DEPARTURE SYNC BEFORE SAILING.';
      recommendationTamil = 'தேவையான தரவு இல்லை. புறப்படுவதற்கு முன் ஒத்திசைவை இயக்கவும்.';
    } else if (hasStale) {
      overallHealth = 'CACHE_WARNING';
      overallLabel = 'CACHE WARNING (STALE)';
      overallTamilLabel = 'தரவு புதுப்பிப்பு தேவை (காலாவதியானது)';
      overallBadge = 'border-amber-500 bg-amber-950/70 text-amber-300 animate-pulse';
      recommendation = 'CACHED DATA IS OLDER THAN 24 HOURS. REFRESH DATA BEFORE DEPARTURE.';
      recommendationTamil = 'தரவு 24 மணி நேரத்திற்கு மேலானது. புறப்படுவதற்கு முன் புதுப்பிக்கவும்.';
    } else if (hasAging) {
      overallHealth = 'CACHE_WARNING';
      overallLabel = 'CACHE WARNING (AGING)';
      overallTamilLabel = 'தரவு புதுப்பிப்பு பரிந்துரைக்கப்படுகிறது';
      overallBadge = 'border-amber-500/80 bg-amber-950/60 text-amber-300';
      recommendation = 'CACHED DATA IS AGING (> 6 HOURS). REFRESH RECOMMENDED BEFORE LONG VOYAGES.';
      recommendationTamil = 'தரவு 6 மணி நேரத்திற்கு மேலானது. நீண்ட பயணங்களுக்கு முன் புதுப்பிக்கவும்.';
    }

    return {
      overallHealth,
      overallLabel,
      overallTamilLabel,
      overallBadge,
      recommendation,
      recommendationTamil,
      waveHealth,
      pfzHealth,
      borderHealth,
      syncHealth,
      allFresh,
      hasStale,
      hasMissing,
    };
  }, [lastSyncMetadata, cachedWaveThreshold, cachedHotspots, cachedBorderLines]);

  // Phase 16: Data Freshness Alert Engine Integration (Fires on AGING -> STALE or CRITICAL DATA INCOMPLETE)
  useEffect(() => {
    const current = cacheHealthSummary.overallHealth;
    const prev = prevFreshnessStateRef.current;

    if (prev !== null && prev !== current) {
      if (current === 'CACHE_INCOMPLETE' && (cachedWaveThreshold === null || cachedBorderLines.length === 0)) {
        triggerLocalAlert(
          'DATA_WARNING',
          'CRITICAL',
          'CRITICAL DATA INCOMPLETE',
          'முக்கியமான தரவு முழுமையற்றது',
          'Essential marine safety data (wave/border) is missing from local cache.',
          'அத்தியாவசிய கடல் பாதுகாப்பு தரவு உள்ளூர் நினைவகத்தில் இல்லை.',
          'DO NOT RELY ON LOCAL DATA FOR SAFETY DECISIONS.',
          'பாதுகாப்பு முடிவுகளுக்கு உள்ளூர் தரவை மட்டும் நம்ப வேண்டாம்.'
        );
      } else if (current === 'CACHE_WARNING' && cacheHealthSummary.hasStale) {
        triggerLocalAlert(
          'DATA_WARNING',
          'HIGH',
          'DATA FRESHNESS WARNING',
          'தரவு புதுப்பிப்பு எச்சரிக்கை',
          'Locally cached marine safety data is older than 24 hours (STALE).',
          'உள்ளூரில் சேமிக்கப்பட்ட கடல் பாதுகாப்பு தரவு 24 மணி நேரத்திற்கு மேலானது (காலாவதியானது).',
          'REFRESH DATA BEFORE NEXT DEPARTURE.',
          'புறப்படுவதற்கு முன் தரவைப் புதுப்பிக்கவும்.'
        );
      } else if (current === 'CACHE_WARNING' && !cacheHealthSummary.hasStale) {
        triggerLocalAlert(
          'DATA_WARNING',
          'ADVISORY',
          'DATA AGING ADVISORY',
          'தரவு பழையதாகிறது',
          'Locally cached marine safety data is older than 6 hours.',
          'உள்ளூர் கடல் தரவு 6 மணி நேரத்திற்கு மேலானது.',
          'REFRESH DATA BEFORE DEPARTURE.',
          'புறப்படுவதற்கு முன் தரவை புதுப்பிக்கவும்.'
        );
      }
    }
    prevFreshnessStateRef.current = current;
  }, [cacheHealthSummary.overallHealth, cacheHealthSummary.hasStale, cachedWaveThreshold, cachedBorderLines, triggerLocalAlert]);

  // --- Phase 17: Offline Data Package Integrity & Pre-Departure Cache Validation Engine ---
  const dataPackageValidationSummary: DataPackageValidationSummary = useMemo(() => {
    const waveValidation = validateWaveThresholdData(cachedWaveThreshold);
    const pfzValidation = validatePfzHotspotData(cachedHotspots);
    const borderValidation = validateBorderLineData(cachedBorderLines);
    const syncValidation = validateSyncMetadataRecord(lastSyncMetadata);

    const hasMissingOrInvalid =
      !waveValidation.isValid ||
      !pfzValidation.isValid ||
      !borderValidation.isValid ||
      !syncValidation.isValid;

    const hasStaleOrAging =
      cacheHealthSummary.hasStale ||
      cacheHealthSummary.overallHealth === 'CACHE_WARNING';

    let overallStatus: DataPackageOverallStatus = 'DATA_PACKAGE_VALID';
    let overallLabel = 'DATA PACKAGE VALID';
    let overallTamilLabel = 'தரவு தொகுப்பு சரியானது';
    let overallBadge = 'border-green-500 bg-green-950/70 text-green-400';
    let recommendation = 'OFFLINE DATA PACKAGE IS STRUCTURALLY COMPLETE AND VALID FOR DEPARTURE.';
    let recommendationTamil = 'உள்ளூர் தரவு தொகுப்பு முழுமையானது மற்றும் புறப்பட சரியானது.';

    if (hasMissingOrInvalid) {
      overallStatus = 'DATA_PACKAGE_INCOMPLETE';
      overallLabel = 'DATA PACKAGE INCOMPLETE';
      overallTamilLabel = 'தரவு தொகுப்பு முழுமையற்றது';
      overallBadge = 'border-red-500 bg-red-950/70 text-red-400 animate-pulse';
      recommendation = 'REQUIRED OFFLINE DATA IS MISSING OR CORRUPT. PERFORM PRE-DEPARTURE SYNC.';
      recommendationTamil = 'தேவையான உள்ளூர் தரவு இல்லை அல்லது தவறானது. புறப்படுவதற்கு முன் ஒத்திசைக்கவும்.';
    } else if (hasStaleOrAging) {
      overallStatus = 'DATA_PACKAGE_CHECK_REQUIRED';
      overallLabel = 'DATA PACKAGE CHECK REQUIRED';
      overallTamilLabel = 'தரவு சரிபார்ப்பு தேவை';
      overallBadge = 'border-amber-500 bg-amber-950/70 text-amber-300';
      recommendation = 'DATA PACKAGE IS STRUCTURALLY VALID BUT AGING/STALE. REFRESH RECOMMENDED.';
      recommendationTamil = 'தரவு தொகுப்பு சரியானது ஆனால் பழையதாக உள்ளது. புதுப்பிப்பது பரிந்துரைக்கப்படுகிறது.';
    }

    return {
      overallStatus,
      overallLabel,
      overallTamilLabel,
      overallBadge,
      recommendation,
      recommendationTamil,
      waveValidation,
      pfzValidation,
      borderValidation,
      syncValidation,
      isPackageValid: overallStatus === 'DATA_PACKAGE_VALID',
      isCheckRequired: overallStatus === 'DATA_PACKAGE_CHECK_REQUIRED',
      isIncomplete: overallStatus === 'DATA_PACKAGE_INCOMPLETE',
    };
  }, [
    cachedWaveThreshold,
    cachedHotspots,
    cachedBorderLines,
    lastSyncMetadata,
    cacheHealthSummary,
  ]);

  // Phase 17: Data Package Validation Alert Engine Integration
  useEffect(() => {
    const current = dataPackageValidationSummary.overallStatus;
    const prev = prevDataPackageStatusRef.current;

    if (prev !== null && prev !== current) {
      if (current === 'DATA_PACKAGE_INCOMPLETE') {
        triggerLocalAlert(
          'DATA_WARNING',
          'HIGH',
          'DATA PACKAGE INCOMPLETE',
          'தரவு தொகுப்பு முழுமையற்றது',
          'One or more required offline data packages failed integrity validation.',
          'ஒன்று அல்லது அதற்கு மேற்பட்ட உள்ளூர் தரவு தொகுப்புகள் சரிபார்ப்பில் தோல்வியடைந்தன.',
          'PERFORM DATA SYNC BEFORE DEPARTURE.',
          'புறப்படுவதற்கு முன் தரவை ஒத்திசைக்கவும்.'
        );
      } else if (current === 'DATA_PACKAGE_CHECK_REQUIRED') {
        triggerLocalAlert(
          'DATA_WARNING',
          'ADVISORY',
          'DATA PACKAGE WARNING',
          'தரவு சரிபார்ப்பு தேவை',
          'Local offline safety data package is aging or requires validation review.',
          'உள்ளூர் பாதுகாப்பு தரவு தொகுப்பு பழையதாக உள்ளது அல்லது மறுஆய்வு தேவை.',
          'REVIEW DATA PACKAGE BEFORE DEPARTURE.',
          'புறப்படுவதற்கு முன் தரவு தொகுப்பை மதிப்பாய்வு செய்யவும்.'
        );
      } else if (current === 'DATA_PACKAGE_VALID') {
        triggerLocalAlert(
          'DATA_WARNING',
          'INFO',
          'DATA PACKAGE VALIDATED',
          'தரவு தொகுப்பு சரிபார்க்கப்பட்டது',
          'Offline safety data package passed structural and completeness validation.',
          'உள்ளூர் பாதுகாப்பு தரவு தொகுப்பு முழுமை மற்றும் கட்டமைப்பு சோதனைகளில் தேர்ச்சி பெற்றது.',
          'DATA PACKAGE READY FOR OFFLINE USE.',
          'உள்ளூர் பயன்பாட்டிற்கு தரவு தொகுப்பு தயாராக உள்ளது.'
        );
      }
    }
    prevDataPackageStatusRef.current = current;
  }, [dataPackageValidationSummary.overallStatus, triggerLocalAlert]);

  // --- Phase 10: Pre-Departure Readiness System (Extended with Phase 16 & 17 Validation) ---

  const preDepartureChecklist = useMemo(() => {
    const items = [
      {
        id: 'gps',
        name: 'GPS SATELLITE FIX',
        icon: MapPin,
        isReady: hasGpsFix,
        statusText: hasGpsFix ? 'READY' : 'WAITING',
        detail: hasGpsFix
          ? `${formatLatitude(latitude)}, ${formatLongitude(longitude)}`
          : 'WAITING FOR GPS SATELLITE LOCK',
      },
      {
        id: 'wave',
        name: 'WAVE THRESHOLD CACHE',
        icon: Waves,
        isReady: dataPackageValidationSummary.waveValidation.isValid,
        statusText: dataPackageValidationSummary.waveValidation.isValid ? 'READY' : 'UNAVAILABLE',
        detail: dataPackageValidationSummary.waveValidation.reason,
      },
      {
        id: 'border',
        name: 'BORDER REFERENCE CACHE',
        icon: Shield,
        isReady: dataPackageValidationSummary.borderValidation.isValid,
        statusText: dataPackageValidationSummary.borderValidation.isValid ? 'READY' : 'UNAVAILABLE',
        detail: dataPackageValidationSummary.borderValidation.reason,
      },
      {
        id: 'pfz',
        name: 'PFZ HOTSPOT CACHE',
        icon: Navigation,
        isReady: dataPackageValidationSummary.pfzValidation.isValid,
        statusText: dataPackageValidationSummary.pfzValidation.isValid ? 'READY' : 'UNAVAILABLE',
        detail: dataPackageValidationSummary.pfzValidation.reason,
      },
      {
        id: 'sync',
        name: 'DATA SYNC STATUS',
        icon: RefreshCw,
        isReady: dataPackageValidationSummary.syncValidation.isValid,
        statusText: lastSyncMetadata !== null ? 'SYNCED' : cachedHotspots.length > 0 ? 'LOCAL CACHE' : 'NOT SYNCED',
        detail: dataPackageValidationSummary.syncValidation.reason,
      },
      {
        id: 'freshness',
        name: 'DATA PACKAGE & FRESHNESS',
        icon: Clock,
        isReady: dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_VALID',
        statusText: dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_VALID'
          ? 'PASS'
          : dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_CHECK_REQUIRED'
            ? 'WARNING'
            : 'FAIL',
        detail: dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_VALID'
          ? 'DATA PACKAGE READY & FRESH (< 6H)'
          : dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_CHECK_REQUIRED'
            ? 'DATA PACKAGE NEEDS REVIEW (AGING/STALE)'
            : 'DATA PACKAGE INCOMPLETE',
      },
      {
        id: 'safety',
        name: 'CURRENT MARINE SAFETY',
        icon: ShieldCheck,
        isReady: combinedSafetyAnalysis.overallStatus === 'SAFE',
        statusText: combinedSafetyAnalysis.overallStatus,
        detail: combinedSafetyAnalysis.overallStatus === 'SAFE'
          ? 'CONDITIONS WITHIN PROTOTYPE LIMITS'
          : combinedSafetyAnalysis.overallStatus === 'CAUTION'
            ? 'CURRENT CONDITIONS REQUIRE ATTENTION'
            : combinedSafetyAnalysis.overallStatus === 'DANGER'
              ? 'HIGH-RISK CONDITIONS DETECTED'
              : 'SAFETY ASSESSMENT INCOMPLETE',
      },
      {
        id: 'offline',
        name: 'OFFLINE READINESS',
        icon: isOnline ? Wifi : WifiOff,
        isReady: dataPackageValidationSummary.isPackageValid,
        statusText: dataPackageValidationSummary.isPackageValid ? 'OFFLINE READY' : 'INCOMPLETE',
        detail: dataPackageValidationSummary.isPackageValid
          ? 'ALL OFFLINE DATASETS VALID & PRESENT'
          : 'ONE OR MORE LOCAL DATASETS MISSING / INVALID',
      },
    ];

    const unfulfilledItems = items.filter((item) => !item.isReady);
    const isOverallReady = unfulfilledItems.length === 0;

    // Reason calculation
    let primaryReason = 'ALL REQUIRED LOCAL CHECKS PASSED';
    let nextAction = 'PROCEED WITH VOYAGE UNDER NORMAL CAUTION';

    if (!hasGpsFix) {
      primaryReason = 'GPS POSITION NOT AVAILABLE';
      nextAction = 'WAIT FOR GPS FIX';
    } else if (dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_INCOMPLETE') {
      primaryReason = 'OFFLINE DATA PACKAGE INCOMPLETE';
      nextAction = 'SYNC REQUIRED DATA BEFORE DEPARTURE';
    } else if (!dataPackageValidationSummary.waveValidation.isValid) {
      primaryReason = 'WAVE THRESHOLD DATA INVALID / UNAVAILABLE';
      nextAction = 'SYNC REQUIRED DATA BEFORE DEPARTURE';
    } else if (!dataPackageValidationSummary.borderValidation.isValid) {
      primaryReason = 'MARITIME BORDER DATA INVALID / UNAVAILABLE';
      nextAction = 'SYNC BORDER DATA BEFORE DEPARTURE';
    } else if (!dataPackageValidationSummary.pfzValidation.isValid) {
      primaryReason = 'PFZ HOTSPOT DATA INVALID / UNAVAILABLE';
      nextAction = 'SYNC PFZ DATA BEFORE DEPARTURE';
    } else if (dataPackageValidationSummary.overallStatus === 'DATA_PACKAGE_CHECK_REQUIRED') {
      primaryReason = 'CACHED DATA SHOULD BE REFRESHED';
      nextAction = 'REFRESH DATA BEFORE DEPARTURE';
    } else if (combinedSafetyAnalysis.overallStatus === 'DANGER') {
      primaryReason = 'HIGH-RISK CONDITIONS DETECTED';
      nextAction = 'DO NOT PROCEED INTO HIGH-RISK CONDITIONS';
    } else if (combinedSafetyAnalysis.overallStatus === 'CAUTION') {
      primaryReason = 'CURRENT CONDITIONS REQUIRE ATTENTION';
      nextAction = 'REVIEW SAFETY CONDITIONS BEFORE DEPARTURE';
    } else if (combinedSafetyAnalysis.overallStatus === 'UNAVAILABLE') {
      primaryReason = 'SAFETY ASSESSMENT CANNOT BE COMPLETED';
      nextAction = 'CONNECT AND RUN SYNC DATA';
    }

    return {
      items,
      unfulfilledItems,
      readinessStatus: (isOverallReady ? 'READY' : 'CHECK_REQUIRED') as ReadinessStatus,
      primaryReason,
      nextAction,
    };
  }, [
    hasGpsFix,
    latitude,
    longitude,
    dataPackageValidationSummary,
    lastSyncMetadata,
    cachedHotspots,
    combinedSafetyAnalysis.overallStatus,
    isOnline,
  ]);

  // --- Phase 12: Return Guidance Computations ---
  const returnGuidanceData = useMemo(() => {
    if (!activeTrip || activeTrip.status !== 'ACTIVE') {
      return {
        status: 'RETURN_UNAVAILABLE' as ReturnStatus,
        statusLabel: 'RETURN INACTIVE',
        statusBadge: 'border-neutral-700 bg-neutral-900 text-neutral-400',
        bearing: null,
        distanceNM: null,
        cardinalDirection: '---',
        startLat: activeTrip?.startLatitude ?? null,
        startLon: activeTrip?.startLongitude ?? null,
        reason: 'NO ACTIVE TRIP',
      };
    }

    const startLat = activeTrip.startLatitude;
    const startLon = activeTrip.startLongitude;

    if (
      startLat === null ||
      startLat === undefined ||
      startLon === null ||
      startLon === undefined ||
      isNaN(startLat) ||
      isNaN(startLon)
    ) {
      return {
        status: 'RETURN_UNAVAILABLE' as ReturnStatus,
        statusLabel: 'RETURN POINT UNAVAILABLE',
        statusBadge: 'border-amber-500 bg-amber-950/60 text-amber-300',
        bearing: null,
        distanceNM: null,
        cardinalDirection: '---',
        startLat: null,
        startLon: null,
        reason: 'NO GPS FIX RECORDED AT TRIP START',
      };
    }

    if (!hasGpsFix || latitude === null || longitude === null) {
      return {
        status: 'RETURN_UNAVAILABLE' as ReturnStatus,
        statusLabel: 'WAITING FOR GPS',
        statusBadge: 'border-amber-500 bg-amber-950/60 text-amber-300',
        bearing: null,
        distanceNM: null,
        cardinalDirection: '---',
        startLat,
        startLon,
        reason: 'GPS FIX REQUIRED FOR RETURN VECTOR',
      };
    }

    // Direct distance and forward azimuth to start position
    const calculatedBearing = calculateBearing(latitude, longitude, startLat, startLon);
    const calculatedDistance = calculateDistanceNM(latitude, longitude, startLat, startLon);
    const cardinal = getCardinalDirection(calculatedBearing);

    let status: ReturnStatus = 'RETURN_AVAILABLE';
    let statusLabel = 'RETURN AVAILABLE';
    let statusBadge = 'border-green-500 bg-green-950/60 text-green-400';
    let reason = 'DIRECT VECTOR TO RECORDED TRIP START';

    if (combinedSafetyAnalysis.overallStatus === 'DANGER') {
      status = 'RETURN_PRIORITY';
      statusLabel = 'RETURN PRIORITY';
      statusBadge = 'border-red-500 bg-red-950/60 text-red-400 animate-pulse';
      reason = 'HIGH RISK CONDITIONS — SAFE RETURN RECOMMENDED';
    } else if (combinedSafetyAnalysis.overallStatus === 'CAUTION') {
      status = 'RETURN_CAUTION';
      statusLabel = 'RETURN CAUTION';
      statusBadge = 'border-amber-500 bg-amber-950/60 text-amber-300';
      reason = 'ADVISORY LEVEL CONDITIONS — PROCEED WITH CAUTION';
    }

    return {
      status,
      statusLabel,
      statusBadge,
      bearing: calculatedBearing,
      distanceNM: calculatedDistance,
      cardinalDirection: cardinal,
      startLat,
      startLon,
      reason,
    };
  }, [activeTrip, hasGpsFix, latitude, longitude, combinedSafetyAnalysis.overallStatus]);

  // --- Phase 13: Local Safety Zones & Route Risk Analysis ---
  const safetyZonesData = useMemo(() => {
    // Border Safety Zone (Phase 6 derived: SAFE > 10 NM, CAUTION 5-10 NM, DANGER <= 5 NM)
    const borderDist = borderSafetyAnalysis.distanceNM;
    let borderZone: SafetyLevel = 'UNAVAILABLE';
    let borderZoneText = 'BORDER DATA UNAVAILABLE';
    let borderZoneTamil = 'எல்லை தரவு கிடைக்கவில்லை';

    if (borderDist !== null) {
      if (borderDist > 10) {
        borderZone = 'SAFE';
        borderZoneText = 'SAFE BORDER ZONE (> 10 NM)';
        borderZoneTamil = 'பாதுகாப்பான எல்லை பகுதி (> 10 NM)';
      } else if (borderDist > 5) {
        borderZone = 'CAUTION';
        borderZoneText = 'CAUTION BORDER ZONE (5–10 NM)';
        borderZoneTamil = 'எச்சரிக்கை எல்லை பகுதி (5–10 NM)';
      } else {
        borderZone = 'DANGER';
        borderZoneText = 'DANGER BORDER ZONE (<= 5 NM)';
        borderZoneTamil = 'ஆபத்து எல்லை பகுதி (<= 5 NM)';
      }
    }

    // Wave Risk Zone (Reuses Phase 6 thresholds)
    const waveZone: SafetyLevel = waveSafetyAnalysis.status;
    let waveZoneText = 'WAVE DATA UNAVAILABLE';
    let waveZoneTamil = 'அலை தரவு கிடைக்கவில்லை';

    if (waveZone === 'SAFE') {
      waveZoneText = `SAFE WAVE ZONE (< ${cachedWaveThreshold?.safeLimit ?? 2.0}m)`;
      waveZoneTamil = 'பாதுகாப்பான அலை பகுதி';
    } else if (waveZone === 'CAUTION') {
      waveZoneText = `CAUTION WAVE ZONE (${cachedWaveThreshold?.safeLimit ?? 2.0}–${cachedWaveThreshold?.cautionLimit ?? 3.5}m)`;
      waveZoneTamil = 'எச்சரிக்கை அலை பகுதி';
    } else if (waveZone === 'DANGER') {
      waveZoneText = `DANGER WAVE ZONE (>= ${cachedWaveThreshold?.cautionLimit ?? 3.5}m)`;
      waveZoneTamil = 'ஆபத்து அலை பகுதி';
    }

    return {
      borderZone,
      borderZoneText,
      borderZoneTamil,
      waveZone,
      waveZoneText,
      waveZoneTamil,
    };
  }, [borderSafetyAnalysis.distanceNM, waveSafetyAnalysis.status, cachedWaveThreshold]);

  // --- Phase 13: Deterministic Combined Route Risk State ---
  const routeRiskAnalysis = useMemo(() => {
    // Missing GPS Check
    if (!hasGpsFix || latitude === null || longitude === null) {
      return {
        status: 'ROUTE_UNAVAILABLE' as RouteRiskLevel,
        statusLabel: 'ROUTE UNAVAILABLE',
        statusLabelTamil: 'பாதை கிடைக்கவில்லை',
        statusBadge: 'border-neutral-700 bg-neutral-900 text-neutral-400',
        riskText: 'GPS POSITION UNAVAILABLE',
        riskTextTamil: 'GPS இடம் கிடைக்கவில்லை',
        actionText: 'WAITING FOR GPS SATELLITE FIX BEFORE COMPUTING ROUTE RISK.',
        actionTextTamil: 'பாதை ஆபத்தை கணக்கிடுவதற்கு முன் GPS சிக்னலுக்காக காத்திருக்கிறது.',
        riskColor: '#9ca3af',
        isDanger: false,
        isCaution: false,
        isSafe: false,
      };
    }

    // Missing Safety Data Check
    if (cachedWaveThreshold === null && cachedBorderLines.length === 0) {
      return {
        status: 'ROUTE_UNAVAILABLE' as RouteRiskLevel,
        statusLabel: 'ROUTE UNAVAILABLE',
        statusLabelTamil: 'பாதை கிடைக்கவில்லை',
        statusBadge: 'border-neutral-700 bg-neutral-900 text-neutral-400',
        riskText: 'SAFETY DATA UNAVAILABLE',
        riskTextTamil: 'பாதுகாப்பு தரவு கிடைக்கவில்லை',
        actionText: 'SAFETY STATUS: WAITING FOR DATA. RUN PRE-DEPARTURE SYNC.',
        actionTextTamil: 'பாதுகாப்பு நிலை: தரவுக்காக காத்திருக்கிறது. ஒத்திசைவை இயக்கவும்.',
        riskColor: '#9ca3af',
        isDanger: false,
        isCaution: false,
        isSafe: false,
      };
    }

    const overall = combinedSafetyAnalysis.overallStatus;
    const wave = waveSafetyAnalysis.status;
    const border = borderSafetyAnalysis.status;

    // Priority: DANGER > CAUTION > SAFE
    if (overall === 'DANGER' || wave === 'DANGER' || border === 'DANGER') {
      return {
        status: 'ROUTE_HIGH_RISK' as RouteRiskLevel,
        statusLabel: 'ROUTE HIGH RISK',
        statusLabelTamil: 'பாதையில் அதிக ஆபத்து',
        statusBadge: 'border-red-500 bg-red-950/70 text-red-400 animate-pulse',
        riskText: 'ROUTE RISK: HIGH',
        riskTextTamil: 'பாதை ஆபத்து: அதிகம்',
        actionText: 'ACTION: FOLLOW SAFETY GUIDANCE BEFORE CONTINUING.',
        actionTextTamil: 'செயல்: தொடர்வதற்கு முன் பாதுகாப்பு வழிகாட்டுதலைப் பின்பற்றவும்.',
        riskColor: '#EF4444',
        isDanger: true,
        isCaution: false,
        isSafe: false,
      };
    }

    if (overall === 'CAUTION' || wave === 'CAUTION' || border === 'CAUTION') {
      return {
        status: 'ROUTE_CAUTION' as RouteRiskLevel,
        statusLabel: 'ROUTE CAUTION',
        statusLabelTamil: 'பாதையில் எச்சரிக்கை',
        statusBadge: 'border-amber-500 bg-amber-950/70 text-amber-300',
        riskText: 'ROUTE RISK: MODERATE',
        riskTextTamil: 'பாதை ஆபத்து: மிதமானது',
        actionText: 'ACTION: PROCEED WITH CAUTION AND MAINTAIN MARITIME WATCH.',
        actionTextTamil: 'செயல்: எச்சரிக்கையுடனும் தொடர்ச்சியான கண்காணிப்புடனும் செல்லவும்.',
        riskColor: '#F59E0B',
        isDanger: false,
        isCaution: true,
        isSafe: false,
      };
    }

    if (overall === 'SAFE' || (wave === 'SAFE' && border === 'SAFE')) {
      return {
        status: 'ROUTE_SAFE' as RouteRiskLevel,
        statusLabel: 'ROUTE SAFE',
        statusLabelTamil: 'பாதை பாதுகாப்பானது',
        statusBadge: 'border-green-500 bg-green-950/70 text-green-400',
        riskText: 'ROUTE RISK: LOW',
        riskTextTamil: 'பாதை ஆபத்து: குறைவு',
        actionText: 'ACTION: DIRECT ROUTE WITHIN LOCAL SAFE OPERATING LIMITS.',
        actionTextTamil: 'செயல்: நேரடி பாதை உள்ளூர் பாதுகாப்பான வரம்பிற்குள் உள்ளது.',
        riskColor: '#22C55E',
        isDanger: false,
        isCaution: false,
        isSafe: true,
      };
    }

    return {
      status: 'ROUTE_UNAVAILABLE' as RouteRiskLevel,
      statusLabel: 'ROUTE UNAVAILABLE',
      statusLabelTamil: 'பாதை கிடைக்கவில்லை',
      statusBadge: 'border-neutral-700 bg-neutral-900 text-neutral-400',
      riskText: 'SAFETY STATUS: WAITING FOR DATA',
      riskTextTamil: 'பாதுகாப்பு நிலை: தரவுக்காக காத்திருக்கிறது',
      actionText: 'REQUIRED SAFETY DATA INCOMPLETE.',
      actionTextTamil: 'தேவையான பாதுகாப்பு தரவு முழுமையடையவில்லை.',
      riskColor: '#9ca3af',
      isDanger: false,
      isCaution: false,
      isSafe: false,
    };
  }, [
    hasGpsFix,
    latitude,
    longitude,
    cachedWaveThreshold,
    cachedBorderLines,
    combinedSafetyAnalysis.overallStatus,
    waveSafetyAnalysis.status,
    borderSafetyAnalysis.status,
  ]);

  // --- Phase 13: Local Safety Map SVG Bounds & Projection Data ---
  const safetyMapSvgData = useMemo(() => {
    const points: { lat: number; lon: number }[] = [];

    // 1. Current Vessel Position
    if (hasGpsFix && latitude !== null && longitude !== null) {
      points.push({ lat: latitude, lon: longitude });
    }

    // 2. Trip Start Position
    if (
      activeTrip &&
      activeTrip.startLatitude !== null &&
      activeTrip.startLatitude !== undefined &&
      activeTrip.startLongitude !== null &&
      activeTrip.startLongitude !== undefined &&
      !isNaN(activeTrip.startLatitude) &&
      !isNaN(activeTrip.startLongitude)
    ) {
      points.push({ lat: activeTrip.startLatitude, lon: activeTrip.startLongitude });
    }

    // 3. Selected PFZ Hotspot
    if (activeHotspot) {
      points.push({ lat: activeHotspot.latitude, lon: activeHotspot.longitude });
    }

    // 4. Cached Border Coordinates
    if (cachedBorderLines && cachedBorderLines.length > 0) {
      for (const border of cachedBorderLines) {
        for (const coord of border.coordinates) {
          points.push({ lat: coord.latitude, lon: coord.longitude });
        }
      }
    }

    if (points.length === 0) {
      return null;
    }

    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);

    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLon = Math.min(...lons);
    let maxLon = Math.max(...lons);

    // Ensure minimum span of 0.08 degrees (~5 NM) to avoid singular/cramped scaling
    const minSpan = 0.08;
    if (maxLat - minLat < minSpan) {
      const mid = (maxLat + minLat) / 2;
      minLat = mid - minSpan / 2;
      maxLat = mid + minSpan / 2;
    }
    if (maxLon - minLon < minSpan) {
      const mid = (maxLon + minLon) / 2;
      minLon = mid - minSpan / 2;
      maxLon = mid + minSpan / 2;
    }

    // Add 15% margins for aesthetic layout
    const latMargin = (maxLat - minLat) * 0.15;
    const lonMargin = (maxLon - minLon) * 0.15;
    minLat -= latMargin;
    maxLat += latMargin;
    minLon -= lonMargin;
    maxLon += lonMargin;

    const svgWidth = 360;
    const svgHeight = 260;
    const padX = 35;
    const padY = 30;

    const latSpan = maxLat - minLat || 0.001;
    const lonSpan = maxLon - minLon || 0.001;

    // Geographic mapping: North = TOP, East = RIGHT, South = BOTTOM, West = LEFT
    const project = (lat: number, lon: number) => {
      const y = (svgHeight - padY) - ((lat - minLat) / latSpan) * (svgHeight - 2 * padY);
      const x = padX + ((lon - minLon) / lonSpan) * (svgWidth - 2 * padX);
      return { x, y };
    };

    const vesselPt = hasGpsFix && latitude !== null && longitude !== null
      ? project(latitude, longitude)
      : null;

    const tripStartPt = activeTrip && activeTrip.startLatitude != null && activeTrip.startLongitude != null
      ? project(activeTrip.startLatitude, activeTrip.startLongitude)
      : null;

    const pfzPt = activeHotspot
      ? project(activeHotspot.latitude, activeHotspot.longitude)
      : null;

    const borderPaths = (cachedBorderLines || []).map((border) => {
      const coords = border.coordinates.map((c) => project(c.latitude, c.longitude));
      const pathD = coords.reduce((acc, pt, idx) => {
        return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }, '');
      return { name: border.name, coords, pathD };
    });

    return {
      svgWidth,
      svgHeight,
      vesselPt,
      tripStartPt,
      pfzPt,
      borderPaths,
      bounds: { minLat, maxLat, minLon, maxLon },
    };
  }, [hasGpsFix, latitude, longitude, activeTrip, activeHotspot, cachedBorderLines]);

  // --- Phase 14: Load Track Points for Selected Completed Trip in Report ---
  useEffect(() => {
    if (!selectedReportTripId) {
      setSelectedTripTrackPoints([]);
      return;
    }
    if (activeTrip && selectedReportTripId === activeTrip.tripId) {
      setSelectedTripTrackPoints(activeTripTrackPoints);
      return;
    }
    let isMounted = true;
    getDB()
      .then(async (db) => {
        const pts = await db.getAllFromIndex('tripTrackPoints', 'by-trip', selectedReportTripId);
        if (isMounted) {
          const sorted = (pts || []).sort((a, b) => a.timestamp - b.timestamp);
          setSelectedTripTrackPoints(sorted);
        }
      })
      .catch((err) => {
        console.error('Failed to load track points for report trip:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedReportTripId, activeTrip, activeTripTrackPoints]);

  // --- Phase 14: Offline Voyage Safety Report Computations ---
  const voyageSafetyReportData = useMemo(() => {
    // 1. Is a trip active?
    const isTripActive = activeTrip !== null && activeTrip.status === 'ACTIVE';

    // 2. Select target completed trip session
    const completedTrips = completedTripsList.filter((t) => t.status === 'COMPLETED');
    const selectedSession =
      completedTrips.find((t) => t.tripId === selectedReportTripId) ||
      (completedTripSummary?.status === 'COMPLETED' ? completedTripSummary : null) ||
      completedTrips[0] ||
      null;

    // Phase 15: Alerts associated with this voyage
    const tripAlerts = localAlerts.filter((a) => {
      if (isTripActive && activeTrip) {
        return a.tripId === activeTrip.tripId || (a.timestamp >= activeTrip.startTime);
      }
      if (selectedSession) {
        if (a.tripId && a.tripId === selectedSession.tripId) return true;
        if (selectedSession.startTime && a.timestamp >= selectedSession.startTime) {
          if (!selectedSession.endTime || a.timestamp <= selectedSession.endTime + 5000) {
            return true;
          }
        }
      }
      return false;
    });

    const alertSummary = {
      total: tripAlerts.length,
      critical: tripAlerts.filter((a) => a.priority === 'CRITICAL').length,
      high: tripAlerts.filter((a) => a.priority === 'HIGH').length,
      advisory: tripAlerts.filter((a) => a.priority === 'ADVISORY').length,
      info: tripAlerts.filter((a) => a.priority === 'INFO').length,
    };

    if (isTripActive) {
      // Live Voyage Summary for Active Trip
      const durationMs = tripElapsedMs;
      const validSpeeds = activeTripTrackPoints
        .map((p) => p.speedKnots)
        .filter((s): s is number => s !== null && !isNaN(s) && isFinite(s) && s >= 0);
      const avgSpeed = validSpeeds.length > 0
        ? (validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length).toFixed(1)
        : '--';
      const maxSpeed = validSpeeds.length > 0
        ? Math.max(...validSpeeds).toFixed(1)
        : '--';
      
      const riskScores = activeTripTrackPoints
        .map((p) => p.riskScore)
        .filter((s): s is number => s !== null && !isNaN(s) && isFinite(s));
      const highestScore = riskScores.length > 0
        ? Math.max(...riskScores)
        : combinedSafetyAnalysis.riskScore;

      const activeTripEvents = allDbSafetyEvents.filter(
        (e) => e.tripId === activeTrip.tripId || (e.timestamp >= activeTrip.startTime)
      );

      return {
        isTripActive: true,
        selectedSession: activeTrip,
        completedTrips,
        durationFormatted: formatDuration(durationMs),
        distanceFormatted: `${activeTrip.totalDistanceNm.toFixed(1)} NM`,
        avgSpeed: avgSpeed !== '--' ? `${avgSpeed} KTS` : '-- KTS',
        maxSpeed: maxSpeed !== '--' ? `${maxSpeed} KTS` : '-- KTS',
        pointCount: activeTripTrackPoints.length,
        safeExposure: formatDuration(tripExposureTimes.safeMs),
        cautionExposure: formatDuration(tripExposureTimes.cautionMs),
        dangerExposure: formatDuration(tripExposureTimes.dangerMs),
        highestRiskScore: highestScore !== null ? `${highestScore} / 100` : '-- / 100',
        safetyEventCount: activeTripEvents.length,
        alertSummary,
        dataHealth: {
          waveData: cacheHealthSummary.waveHealth.stateLabel,
          pfzData: cacheHealthSummary.pfzHealth.stateLabel,
          borderData: cacheHealthSummary.borderHealth.stateLabel,
          syncStatus: cacheHealthSummary.syncHealth.stateLabel,
        },
        dataPackageValidation: {
          packageStatus: dataPackageValidationSummary.overallStatus,
          packageLabel: dataPackageValidationSummary.overallLabel,
          packageLabelTamil: dataPackageValidationSummary.overallTamilLabel,
          waveStatus: dataPackageValidationSummary.waveValidation.statusLabel,
          pfzStatus: dataPackageValidationSummary.pfzValidation.statusLabel,
          borderStatus: dataPackageValidationSummary.borderValidation.statusLabel,
          syncStatus: dataPackageValidationSummary.syncValidation.statusLabel,
          isValid: dataPackageValidationSummary.isPackageValid,
        },
        overallStatus: 'VOYAGE_IN_PROGRESS' as const,
        overallStatusLabel: 'VOYAGE IN PROGRESS',
        overallStatusTamil: 'பயணம் நடைபெறுகிறது',
        overallBadge: 'border-green-500 bg-green-950/70 text-green-400 animate-pulse',
        timeline: [] as { time: string; label: string; type: 'INFO' | 'SAFE' | 'CAUTION' | 'DANGER' }[],
        dangerCount: 0,
        cautionCount: 0,
        gpsLossCount: 0,
        sosCount: 0,
        lastSosFormatted: null as string | null,
        borderStatus: 'BORDER DATA UNAVAILABLE',
        closestBorderDist: 'DATA UNAVAILABLE',
        gpsReliability: 'TRACK RECORDED',
        advisoryPrimary: 'VOYAGE IN PROGRESS — REAL-TIME MONITORING ACTIVE.',
        advisoryTamil: 'பயணம் நடைபெறுகிறது — நேரலை கண்காணிப்பு செயலில் உள்ளது.',
        nextRecommendations: [] as string[],
      };
    }

    if (!selectedSession) {
      return {
        isTripActive: false,
        selectedSession: null,
        completedTrips: [],
        durationFormatted: '--:--:--',
        distanceFormatted: '--.- NM',
        avgSpeed: '-- KTS',
        maxSpeed: '-- KTS',
        pointCount: 0,
        safeExposure: '00:00:00',
        cautionExposure: '00:00:00',
        dangerExposure: '00:00:00',
        highestRiskScore: '-- / 100',
        safetyEventCount: 0,
        alertSummary: { total: 0, critical: 0, high: 0, advisory: 0, info: 0 },
        dataHealth: {
          waveData: cacheHealthSummary.waveHealth.stateLabel,
          pfzData: cacheHealthSummary.pfzHealth.stateLabel,
          borderData: cacheHealthSummary.borderHealth.stateLabel,
          syncStatus: cacheHealthSummary.syncHealth.stateLabel,
        },
        dataPackageValidation: {
          packageStatus: dataPackageValidationSummary.overallStatus,
          packageLabel: dataPackageValidationSummary.overallLabel,
          packageLabelTamil: dataPackageValidationSummary.overallTamilLabel,
          waveStatus: dataPackageValidationSummary.waveValidation.statusLabel,
          pfzStatus: dataPackageValidationSummary.pfzValidation.statusLabel,
          borderStatus: dataPackageValidationSummary.borderValidation.statusLabel,
          syncStatus: dataPackageValidationSummary.syncValidation.statusLabel,
          isValid: dataPackageValidationSummary.isPackageValid,
        },
        overallStatus: 'VOYAGE_DATA_INCOMPLETE' as VoyageSafetyStatus,
        overallStatusLabel: 'NO COMPLETED VOYAGES',
        overallStatusTamil: 'முடிக்கப்பட்ட பயணங்கள் இல்லை',
        overallBadge: 'border-neutral-700 bg-neutral-900 text-neutral-400',
        timeline: [] as { time: string; label: string; type: 'INFO' | 'SAFE' | 'CAUTION' | 'DANGER' }[],
        dangerCount: 0,
        cautionCount: 0,
        gpsLossCount: 0,
        sosCount: 0,
        lastSosFormatted: null as string | null,
        borderStatus: 'BORDER DATA UNAVAILABLE',
        closestBorderDist: 'DATA UNAVAILABLE',
        gpsReliability: 'TRACK DATA INCOMPLETE',
        advisoryPrimary: 'NO COMPLETED VOYAGES RECORDED LOCALLY.',
        advisoryTamil: 'சாதனத்தில் முடிக்கப்பட்ட பயணங்கள் பதிவு செய்யப்படவில்லை.',
        nextRecommendations: ['RUN PRE-DEPARTURE SYNC AND GPS CHECK BEFORE SAILING.'],
      };
    }

    // Process selected completed session
    const durationMs = selectedSession.endTime
      ? selectedSession.endTime - selectedSession.startTime
      : 0;

    // Track points for this session
    const pts = selectedTripTrackPoints;
    const validSpeeds = pts
      .map((p) => p.speedKnots)
      .filter((s): s is number => s !== null && !isNaN(s) && isFinite(s) && s >= 0);
    const avgSpeed = validSpeeds.length > 0
      ? (validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length).toFixed(1)
      : selectedSession.avgSpeedKnots != null
        ? selectedSession.avgSpeedKnots.toFixed(1)
        : '--';
    const maxSpeed = validSpeeds.length > 0
      ? Math.max(...validSpeeds).toFixed(1)
      : selectedSession.maxSpeedKnots != null
        ? selectedSession.maxSpeedKnots.toFixed(1)
        : '--';

    const pointCount = pts.length > 0 ? pts.length : selectedSession.pointCount || 0;

    // Risk Scores
    const ptScores = pts
      .map((p) => p.riskScore)
      .filter((s): s is number => s !== null && !isNaN(s) && isFinite(s));
    const highestScore = ptScores.length > 0 ? Math.max(...ptScores) : null;

    // Safety Events associated with this trip
    const tripSafetyEvents = allDbSafetyEvents.filter((e) => {
      if (e.tripId && e.tripId === selectedSession.tripId) return true;
      if (selectedSession.startTime && e.timestamp >= selectedSession.startTime) {
        if (!selectedSession.endTime || e.timestamp <= selectedSession.endTime + 5000) {
          return true;
        }
      }
      return false;
    });

    const dangerCount = tripSafetyEvents.filter(
      (e) => e.safetyLevel === 'DANGER' || e.message.toUpperCase().includes('DANGER')
    ).length;
    const cautionCount = tripSafetyEvents.filter(
      (e) => e.safetyLevel === 'CAUTION' || e.message.toUpperCase().includes('CAUTION')
    ).length;
    const gpsLossCount = tripSafetyEvents.filter((e) => e.eventType === 'GPS_LOST').length;
    const startedWithWarnings = tripSafetyEvents.some((e) => e.eventType === 'TRIP_STARTED_WITH_WARNINGS');

    // SOS events associated with this trip
    const tripSosEvents = allDbEmergencyEvents.filter((e) => {
      if (e.tripId && e.tripId === selectedSession.tripId) return true;
      if (selectedSession.startTime && e.timestamp >= selectedSession.startTime) {
        if (!selectedSession.endTime || e.timestamp <= selectedSession.endTime + 5000) {
          return true;
        }
      }
      return false;
    });
    const sosCount = tripSosEvents.length;
    const lastSosFormatted = tripSosEvents.length > 0 ? tripSosEvents[0].formattedTime : null;

    // Border safety distance calculation along track points
    let closestBorderDist: number | null = null;
    if (pts.length > 0 && cachedBorderLines.length > 0) {
      const distances = pts
        .map((p) => calculateMinDistanceToBorderLines(p.latitude, p.longitude, cachedBorderLines))
        .filter((d): d is number => d !== null && !isNaN(d));
      if (distances.length > 0) {
        closestBorderDist = Math.min(...distances);
      }
    }
    let borderStatus = 'BORDER DATA UNAVAILABLE';
    if (closestBorderDist !== null) {
      if (closestBorderDist <= 5) {
        borderStatus = 'DANGER (CRITICAL PROXIMITY)';
      } else if (closestBorderDist <= 10) {
        borderStatus = 'CAUTION (ADVISORY PROXIMITY)';
      } else {
        borderStatus = 'SAFE (> 10 NM)';
      }
    }

    // Deterministic Overall Voyage Safety Status
    let overallStatus: VoyageSafetyStatus = 'VOYAGE_SAFE';
    let overallStatusLabel = 'VOYAGE SAFE';
    let overallStatusTamil = 'பயணம் பாதுகாப்பானது';
    let overallBadge = 'border-green-500 bg-green-950/70 text-green-400';

    const hasDangerExposure = (selectedSession.dangerTimeMs ?? 0) > 0;
    const hasCautionExposure = (selectedSession.cautionTimeMs ?? 0) > 0;

    if (dangerCount > 0 || hasDangerExposure || (highestScore !== null && highestScore >= 60) || sosCount > 0 || (closestBorderDist !== null && closestBorderDist <= 5)) {
      overallStatus = 'VOYAGE_HIGH_RISK';
      overallStatusLabel = 'VOYAGE HIGH RISK';
      overallStatusTamil = 'பயணத்தில் அதிக ஆபத்து';
      overallBadge = 'border-red-500 bg-red-950/70 text-red-400 animate-pulse';
    } else if (cautionCount > 0 || hasCautionExposure || (highestScore !== null && highestScore >= 30) || (closestBorderDist !== null && closestBorderDist <= 10) || startedWithWarnings) {
      overallStatus = 'VOYAGE_CAUTION';
      overallStatusLabel = 'VOYAGE CAUTION';
      overallStatusTamil = 'பயணத்தில் எச்சரிக்கை';
      overallBadge = 'border-amber-500 bg-amber-950/70 text-amber-300';
    } else if (pointCount === 0 && durationMs === 0) {
      overallStatus = 'VOYAGE_DATA_INCOMPLETE';
      overallStatusLabel = 'VOYAGE DATA INCOMPLETE';
      overallStatusTamil = 'பயண தரவு முழுமையற்றது';
      overallBadge = 'border-neutral-700 bg-neutral-900 text-neutral-400';
    }

    // Safety Advisory
    let advisoryPrimary = 'NO RECORDED PROTOTYPE SAFETY VIOLATIONS.';
    let advisoryTamil = 'பதிவுசெய்யப்பட்ட முன்மாதிரி பாதுகாப்பு மீறல்கள் இல்லை.';

    if (overallStatus === 'VOYAGE_HIGH_RISK') {
      advisoryPrimary = 'HIGH-RISK CONDITIONS WERE RECORDED DURING THIS VOYAGE. REVIEW THE RISK EVENTS BEFORE THE NEXT DEPARTURE.';
      advisoryTamil = 'இந்த பயணத்தில் அதிக ஆபத்து நிலைகள் பதிவாகியுள்ளன. அடுத்த பயணத்திற்கு முன் ஆபத்து நிகழ்வுகளை மதிப்பாய்வு செய்யவும்.';
    } else if (overallStatus === 'VOYAGE_CAUTION') {
      advisoryPrimary = 'ADVISORY CONDITIONS WERE RECORDED. REVIEW WEATHER/MARINE CONDITIONS BEFORE THE NEXT VOYAGE.';
      advisoryTamil = 'எச்சரிக்கை நிலைகள் பதிவாகியுள்ளன. அடுத்த பயணத்திற்கு முன் கடல் நிலைகளை சரிபார்க்கவும்.';
    }

    // Next Departure Recommendations
    const nextRecommendations: string[] = [];
    if (gpsLossCount > 0) {
      nextRecommendations.push('VERIFY GPS FIX BEFORE DEPARTURE.');
    }
    if (closestBorderDist !== null && closestBorderDist <= 5) {
      nextRecommendations.push('REVIEW BORDER SAFETY LIMITS.');
    }
    if (dangerCount > 0 || hasDangerExposure) {
      nextRecommendations.push('REVIEW CURRENT MARINE CONDITIONS.');
    }
    if (startedWithWarnings) {
      nextRecommendations.push('COMPLETE PRE-DEPARTURE CHECK BEFORE NEXT VOYAGE.');
    }
    if (sosCount > 0) {
      nextRecommendations.push('REVIEW EMERGENCY PREPAREDNESS.');
    }
    if (nextRecommendations.length === 0) {
      nextRecommendations.push('RUN PRE-DEPARTURE SYNC AND GPS CHECK BEFORE SAILING.');
    }

    // Chronological Timeline items
    const timelineItems: { time: string; label: string; type: 'INFO' | 'SAFE' | 'CAUTION' | 'DANGER' }[] = [];
    
    // Start item
    timelineItems.push({
      time: formatTimeHHMM(selectedSession.startTime),
      label: startedWithWarnings ? 'TRIP STARTED (WITH WARNINGS)' : 'TRIP STARTED',
      type: startedWithWarnings ? 'CAUTION' : 'SAFE',
    });

    // Event items
    const sortedEvents = [...tripSafetyEvents].sort((a, b) => a.timestamp - b.timestamp);
    for (const evt of sortedEvents) {
      if (evt.eventType === 'TRIP_STARTED' || evt.eventType === 'TRIP_STARTED_WITH_WARNINGS' || evt.eventType === 'TRIP_COMPLETED') {
        continue;
      }
      let type: 'INFO' | 'SAFE' | 'CAUTION' | 'DANGER' = 'INFO';
      if (evt.safetyLevel === 'DANGER' || evt.message.includes('DANGER')) type = 'DANGER';
      else if (evt.safetyLevel === 'CAUTION' || evt.message.includes('CAUTION') || evt.eventType === 'GPS_LOST') type = 'CAUTION';
      else if (evt.safetyLevel === 'SAFE' || evt.eventType === 'GPS_RESTORED') type = 'SAFE';

      timelineItems.push({
        time: evt.formattedTime,
        label: evt.message,
        type,
      });
    }

    // SOS items
    for (const em of tripSosEvents) {
      timelineItems.push({
        time: em.formattedTime,
        label: 'EMERGENCY SOS RECORDED LOCALLY',
        type: 'DANGER',
      });
    }

    // End item
    if (selectedSession.endTime) {
      timelineItems.push({
        time: formatTimeHHMM(selectedSession.endTime),
        label: `TRIP ENDED (${selectedSession.totalDistanceNm.toFixed(1)} NM)`,
        type: 'INFO',
      });
    }

    // Sort all timeline items chronologically and slice max 8
    const displayTimeline = timelineItems.slice(-8);

    return {
      isTripActive: false,
      selectedSession,
      completedTrips,
      durationFormatted: formatDuration(durationMs),
      distanceFormatted: `${selectedSession.totalDistanceNm.toFixed(1)} NM`,
      avgSpeed: avgSpeed !== '--' ? `${avgSpeed} KTS` : '-- KTS',
      maxSpeed: maxSpeed !== '--' ? `${maxSpeed} KTS` : '-- KTS',
      pointCount,
      safeExposure: formatDuration(selectedSession.safeTimeMs ?? 0),
      cautionExposure: formatDuration(selectedSession.cautionTimeMs ?? 0),
      dangerExposure: formatDuration(selectedSession.dangerTimeMs ?? 0),
      highestRiskScore: highestScore !== null ? `${highestScore} / 100` : '-- / 100',
      safetyEventCount: tripSafetyEvents.length,
      alertSummary,
      dataHealth: {
        waveData: cacheHealthSummary.waveHealth.stateLabel,
        pfzData: cacheHealthSummary.pfzHealth.stateLabel,
        borderData: cacheHealthSummary.borderHealth.stateLabel,
        syncStatus: cacheHealthSummary.syncHealth.stateLabel,
      },
      dataPackageValidation: {
        packageStatus: dataPackageValidationSummary.overallStatus,
        packageLabel: dataPackageValidationSummary.overallLabel,
        packageLabelTamil: dataPackageValidationSummary.overallTamilLabel,
        waveStatus: dataPackageValidationSummary.waveValidation.statusLabel,
        pfzStatus: dataPackageValidationSummary.pfzValidation.statusLabel,
        borderStatus: dataPackageValidationSummary.borderValidation.statusLabel,
        syncStatus: dataPackageValidationSummary.syncValidation.statusLabel,
        isValid: dataPackageValidationSummary.isPackageValid,
      },
      overallStatus,
      overallStatusLabel,
      overallStatusTamil,
      overallBadge,
      timeline: displayTimeline,
      dangerCount,
      cautionCount,
      gpsLossCount,
      sosCount,
      lastSosFormatted,
      borderStatus,
      closestBorderDist: closestBorderDist !== null ? `${closestBorderDist.toFixed(1)} NM` : 'DATA UNAVAILABLE',
      gpsReliability: pointCount > 0 ? 'TRACK RECORDED' : 'TRACK DATA INCOMPLETE',
      advisoryPrimary,
      advisoryTamil,
      nextRecommendations,
    };
  }, [
    activeTrip,
    completedTripSummary,
    completedTripsList,
    selectedReportTripId,
    selectedTripTrackPoints,
    allDbSafetyEvents,
    allDbEmergencyEvents,
    tripElapsedMs,
    tripExposureTimes,
    activeTripTrackPoints,
    combinedSafetyAnalysis.riskScore,
    cachedBorderLines,
    localAlerts,
    cacheHealthSummary,
    dataPackageValidationSummary,
  ]);

  // --- Phase 11: Trip Analytics Computations ---
  const tripAnalytics = useMemo(() => {
    const validSpeeds = activeTripTrackPoints
      .map((p) => p.speedKnots)
      .filter((s): s is number => s !== null && !isNaN(s) && isFinite(s) && s >= 0);

    const avgSpeed = validSpeeds.length > 0
      ? (validSpeeds.reduce((acc, s) => acc + s, 0) / validSpeeds.length).toFixed(1)
      : null;

    const maxSpeed = validSpeeds.length > 0
      ? Math.max(...validSpeeds).toFixed(1)
      : null;

    const activeOrCompleted = activeTrip || completedTripSummary;
    const distanceNm = activeOrCompleted ? activeOrCompleted.totalDistanceNm.toFixed(1) : '0.0';
    const totalDurationMs = activeTrip
      ? tripElapsedMs
      : completedTripSummary && completedTripSummary.endTime
        ? completedTripSummary.endTime - completedTripSummary.startTime
        : 0;

    return {
      distanceNm,
      durationFormatted: formatDuration(totalDurationMs),
      pointCount: activeTripTrackPoints.length,
      avgSpeed: avgSpeed !== null ? `${avgSpeed} KTS` : '-- KTS',
      maxSpeed: maxSpeed !== null ? `${maxSpeed} KTS` : '-- KTS',
      safeExposure: formatDuration(tripExposureTimes.safeMs),
      cautionExposure: formatDuration(tripExposureTimes.cautionMs),
      dangerExposure: formatDuration(tripExposureTimes.dangerMs),
    };
  }, [activeTripTrackPoints, activeTrip, completedTripSummary, tripElapsedMs, tripExposureTimes]);

  // --- Phase 11: SVG Track Bounds & Scaling ---
  const trackSvgData = useMemo(() => {
    if (activeTripTrackPoints.length === 0) {
      return null;
    }

    const lats = activeTripTrackPoints.map((p) => p.latitude);
    const lons = activeTripTrackPoints.map((p) => p.longitude);

    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLon = Math.min(...lons);
    let maxLon = Math.max(...lons);

    // Minimum span of 0.002 degrees (~220 meters) to avoid singular point scaling
    const minSpan = 0.002;
    if (maxLat - minLat < minSpan) {
      const mid = (maxLat + minLat) / 2;
      minLat = mid - minSpan / 2;
      maxLat = mid + minSpan / 2;
    }
    if (maxLon - minLon < minSpan) {
      const mid = (maxLon + minLon) / 2;
      minLon = mid - minSpan / 2;
      maxLon = mid + minSpan / 2;
    }

    const svgWidth = 360;
    const svgHeight = 220;
    const paddingX = 35;
    const paddingY = 30;

    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;

    const pointsScaled = activeTripTrackPoints.map((p) => {
      // North is UP -> maxLat maps to paddingY, minLat maps to svgHeight - paddingY
      const y = (svgHeight - paddingY) - ((p.latitude - minLat) / latSpan) * (svgHeight - 2 * paddingY);
      // East is RIGHT -> minLon maps to paddingX, maxLon maps to svgWidth - paddingX
      const x = paddingX + ((p.longitude - minLon) / lonSpan) * (svgWidth - 2 * paddingX);
      return { x, y, raw: p };
    });

    const pathD = pointsScaled.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    const startPt = pointsScaled[0];
    const latestPt = pointsScaled[pointsScaled.length - 1];

    return {
      pointsScaled,
      pathD,
      startPt,
      latestPt,
      bounds: { minLat, maxLat, minLon, maxLon },
      svgWidth,
      svgHeight,
    };
  }, [activeTripTrackPoints]);

  // --- Phase 8, 10 & 11: Trip Action Handlers with Track Recording & Readiness Gate ---

  const executeStartTrip = async (withWarnings: boolean = false) => {
    const now = Date.now();
    const newTrip: TripSession = {
      tripId: `trip-${now}`,
      startTime: now,
      endTime: null,
      status: 'ACTIVE',
      totalDistanceNm: 0,
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastUpdated: now,
      startLatitude: latitude,
      startLongitude: longitude,
    };

    try {
      const db = await getDB();
      await db.put('tripSessions', newTrip);
      setActiveTrip(newTrip);
      setCompletedTripSummary(null);
      setTripElapsedMs(0);
      setActiveTripTrackPoints([]);
      setIsDownsampled(false);
      setTripExposureTimes({ safeMs: 0, cautionMs: 0, dangerMs: 0 });
      lastTrackPointRef.current = null;

      // If valid GPS fix exists, record first track point immediately
      if (hasGpsFix && latitude !== null && longitude !== null) {
        const speedKnots = (speedMps !== null && !isNaN(speedMps) && speedMps >= 0)
          ? Number((speedMps * 1.94384).toFixed(1))
          : null;
        const firstPt: TripTrackPoint = {
          pointId: `pt-${now}-0`,
          tripId: newTrip.tripId,
          timestamp: now,
          latitude,
          longitude,
          speedKnots,
          riskScore: latestRiskScoreRef.current,
          riskLevel: latestRiskLevelRef.current,
        };
        lastTrackPointRef.current = { timestamp: now, lat: latitude, lon: longitude };
        await db.put('tripTrackPoints', firstPt);
        setActiveTripTrackPoints([firstPt]);
      }

      if (withWarnings) {
        recordSafetyEvent(
          'TRIP_STARTED_WITH_WARNINGS',
          'CAUTION',
          `Trip started with warnings: ${preDepartureChecklist.primaryReason}`,
          newTrip.tripId
        );
        triggerLocalAlert(
          'TRIP_WARNING',
          'ADVISORY',
          'TRIP STARTED WITH WARNINGS',
          'எச்சரிக்கையுடன் பயணம் தொடங்கப்பட்டது',
          `Pre-departure check warning: ${preDepartureChecklist.primaryReason}`,
          `புறப்படுவதற்கு முன் எச்சரிக்கை: ${preDepartureChecklist.primaryReason}`,
          'REVIEW PRE-DEPARTURE CHECKS.',
          'புறப்படும் முன் சரிபார்ப்பை மதிப்பாய்வு செய்யவும்.',
          newTrip.tripId
        );
      } else {
        recordSafetyEvent('TRIP_STARTED', 'INFO', `Trip started at ${formatTimeHHMM(now)}`, newTrip.tripId);
        triggerLocalAlert(
          'TRIP_WARNING',
          'INFO',
          'TRIP STARTED',
          'பயணம் தொடங்கப்பட்டது',
          `Voyage started at ${formatTimeHHMM(now)}. Real-time tracking active.`,
          `${formatTimeHHMM(now)} மணிக்கு பயணம் தொடங்கப்பட்டது. நேரலை கண்காணிப்பு செயலில் உள்ளது.`,
          'MAINTAIN NORMAL MARITIME WATCH.',
          'சாதாரண கடல் கண்காணிப்பைத் தொடரவும்.',
          newTrip.tripId
        );
      }
    } catch (err) {
      console.error('Failed to start trip:', err);
    }
  };

  const handleStartTripClick = () => {
    if (preDepartureChecklist.readinessStatus === 'READY') {
      executeStartTrip(false);
    } else {
      setIsReadinessWarningModalOpen(true);
    }
  };

  const handleStartAnyway = () => {
    setIsReadinessWarningModalOpen(false);
    executeStartTrip(true);
  };

  const handleReviewChecks = () => {
    setIsReadinessWarningModalOpen(false);
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    const now = Date.now();
    const completedTrip: TripSession = {
      ...activeTrip,
      endTime: now,
      status: 'COMPLETED',
      lastUpdated: now,
      safeTimeMs: tripExposureTimes.safeMs,
      cautionTimeMs: tripExposureTimes.cautionMs,
      dangerTimeMs: tripExposureTimes.dangerMs,
      pointCount: activeTripTrackPoints.length,
    };

    try {
      const db = await getDB();
      await db.put('tripSessions', completedTrip);
      setCompletedTripSummary(completedTrip);
      setActiveTrip(null);
      setCompletedTripsList((prev) => [completedTrip, ...prev.filter((t) => t.tripId !== completedTrip.tripId)]);
      setSelectedReportTripId(completedTrip.tripId);
      recordSafetyEvent(
        'TRIP_COMPLETED',
        'INFO',
        `Trip ended: ${completedTrip.totalDistanceNm.toFixed(1)} NM travelled in ${formatDuration(now - completedTrip.startTime)}`,
        completedTrip.tripId
      );
    } catch (err) {
      console.error('Failed to end trip:', err);
    }
  };

  const handleNewTrip = () => {
    setCompletedTripSummary(null);
    setActiveTrip(null);
    setTripElapsedMs(0);
    setActiveTripTrackPoints([]);
    setIsDownsampled(false);
    setTripExposureTimes({ safeMs: 0, cautionMs: 0, dangerMs: 0 });
    lastTrackPointRef.current = null;
  };

  const handleClearTrackClick = () => {
    if (activeTrip?.status === 'ACTIVE') return;
    setIsClearTrackModalOpen(true);
  };

  const handleConfirmClearTrack = async () => {
    setIsClearTrackModalOpen(false);
    const targetTripId = activeTrip?.tripId || completedTripSummary?.tripId;
    if (!targetTripId) {
      setActiveTripTrackPoints([]);
      return;
    }

    try {
      const db = await getDB();
      const allPts = await db.getAllFromIndex('tripTrackPoints', 'by-trip', targetTripId);
      const tx = db.transaction('tripTrackPoints', 'readwrite');
      for (const pt of allPts) {
        await tx.objectStore('tripTrackPoints').delete(pt.pointId);
      }
      await tx.done;
      setActiveTripTrackPoints([]);
      setIsDownsampled(false);
    } catch (err) {
      console.error('Failed to clear track from IndexedDB:', err);
    }
  };

  // --- Phase 9: Emergency SOS Handlers ---

  const handleOpenSosModal = () => {
    if (sosCooldownSec > 0) return;
    setIsSosModalOpen(true);
  };

  const handleCancelSos = () => {
    setIsSosModalOpen(false);
  };

  const handleConfirmSos = async () => {
    setIsSosModalOpen(false);
    const now = Date.now();

    const emergencyRecord: EmergencyEvent = {
      emergencyId: `sos-${now}`,
      timestamp: now,
      formattedTime: formatTimeHHMM(now),
      latitude: hasGpsFix ? latitude : null,
      longitude: hasGpsFix ? longitude : null,
      gpsAvailable: hasGpsFix,
      tripId: activeTrip ? activeTrip.tripId : null,
      tripStatus: activeTrip ? (activeTrip.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED') : 'NO_ACTIVE_TRIP',
      tripDuration: activeTrip ? formatDuration(tripElapsedMs) : '00:00:00',
      tripDistanceNm: activeTrip ? activeTrip.totalDistanceNm : null,
      riskScore: combinedSafetyAnalysis.riskScore,
      riskLevel: combinedSafetyAnalysis.riskLevel,
      safetyLevel: combinedSafetyAnalysis.overallStatus,
      waveHeight: currentWaveHeightM,
      borderDistanceNm: borderSafetyAnalysis.distanceNM,
      onlineStatus: isOnline,
      sosStatus: isOnline ? 'RECORDED_ONLINE' : 'RECORDED_OFFLINE',
      lastUpdated: now,
    };

    try {
      const db = await getDB();
      await db.put('emergencyEvents', emergencyRecord);
      
      setRecentEmergencyEvents((prev) => [emergencyRecord, ...prev.filter((e) => e.emergencyId !== emergencyRecord.emergencyId)].slice(0, 3));
      setAllDbEmergencyEvents((prev) => [emergencyRecord, ...prev.filter((e) => e.emergencyId !== emergencyRecord.emergencyId)]);
      setActiveEmergencySnapshot(emergencyRecord);
      setIsViewingSnapshotModal(true);
      setSosCooldownSec(30);

      recordSafetyEvent('SOS_TRIGGERED', 'DANGER', 'Emergency SOS recorded locally', activeTrip?.tripId);
      triggerLocalAlert(
        'SOS_EVENT',
        'CRITICAL',
        'SOS RECORDED LOCALLY',
        'அவசர பதிவு சாதனத்தில் சேமிக்கப்பட்டது',
        'Emergency SOS snapshot saved locally. NO REMOTE TRANSMISSION HAS BEEN PERFORMED.',
        'அவசர நிலை சாதனத்தில் சேமிக்கப்பட்டது. தொலைநிலை அனுப்புதல் செய்யப்படவில்லை.',
        'USE AVAILABLE EMERGENCY PROCEDURES.',
        'கிடைக்கக்கூடிய அவசர நடைமுறைகளைப் பயன்படுத்தவும்.',
        activeTrip ? activeTrip.tripId : null
      );
    } catch (err) {
      console.error('Failed to store emergency event in IndexedDB:', err);
    }
  };

  const handleViewLastSos = () => {
    if (recentEmergencyEvents.length > 0) {
      setActiveEmergencySnapshot(recentEmergencyEvents[0]);
      setIsViewingSnapshotModal(true);
    }
  };

  const hasLocalData = cachedHotspots.length > 0 || cachedWaveThreshold !== null || cachedBorderLines.length > 0;
  const safeLimitDisplay = cachedWaveThreshold ? `${cachedWaveThreshold.safeLimit} m` : '2.5 m';
  const waveSourceLabel = cachedWaveThreshold ? 'LOCAL CACHE' : 'DEFAULT';

  return (
    <main className="min-h-screen w-full bg-black text-white font-sans selection:bg-green-500 selection:text-black overflow-x-hidden antialiased">
      {/* Mobile constrained container (360px - 430px) */}
      <div className="mx-auto w-full max-w-md px-3.5 py-3 flex flex-col gap-3 pb-8">
        
        {/* A. HEADER */}
        <header className="flex items-center justify-between border-b border-neutral-800 pb-2.5 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-900 border border-neutral-700 text-green-400">
              <Ship className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-wider text-white uppercase leading-tight">
                VARUNA
              </h1>
              <p className="text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">
                MARINE SAFETY
              </p>
            </div>
          </div>

          {/* Dynamic Real-Time Connectivity Badge */}
          {isOnline ? (
            <div 
              className="flex items-center gap-1.5 rounded-full border border-green-500/60 bg-green-950/40 px-3 py-1 text-xs font-bold text-green-400"
              aria-label="Connectivity status: Online"
            >
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="tracking-wide font-black">ONLINE</span>
            </div>
          ) : (
            <div 
              className="flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-950/50 px-3 py-1 text-xs font-bold text-amber-400"
              aria-label="Connectivity status: Offline"
            >
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              <span className="tracking-wide font-black">OFFLINE</span>
            </div>
          )}
        </header>

        {/* B. OFFLINE / ONLINE CACHE STATUS & DATA SOURCE AREA */}
        <section 
          aria-label="Network and Synchronization Mode"
          className={`rounded-lg border p-2.5 text-center transition-colors ${
            !isOnline
              ? hasLocalData
                ? 'border-green-800/80 bg-green-950/20'
                : 'border-amber-800/80 bg-amber-950/30'
              : 'border-neutral-800 bg-neutral-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span 
                className={`h-2.5 w-2.5 rounded-full ${
                  isOnline 
                    ? 'bg-green-500' 
                    : hasLocalData 
                      ? 'bg-green-400' 
                      : 'bg-amber-400'
                }`} 
              />
              <span className="text-xs font-black tracking-wider text-white uppercase">
                {isOnline 
                  ? 'ONLINE MODE' 
                  : hasLocalData 
                    ? 'OFFLINE MODE' 
                    : 'OFFLINE (NO CACHE)'}
              </span>
            </div>
            <span 
              className={`text-[11px] font-bold uppercase tracking-wide ${
                isOnline 
                  ? 'text-green-400' 
                  : hasLocalData 
                    ? 'text-green-300' 
                    : 'text-amber-400'
              }`}
            >
              {isOnline 
                ? 'DATA SYNC AVAILABLE' 
                : hasLocalData 
                  ? 'USING LOCAL CACHE' 
                  : 'SYNC BEFORE DEPARTURE'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-neutral-800/70 pt-2 text-[10px] text-neutral-400 font-bold uppercase">
            <span>
              DATA SOURCE: <strong className="text-neutral-200">{isOnline ? 'SYNCED / LIVE' : 'LOCAL CACHE'}</strong>
            </span>
            <span>
              LAST SYNC: <strong className="text-neutral-200">{lastSyncMetadata ? lastSyncMetadata.timestamp : 'NOT SYNCED'}</strong>
            </span>
          </div>
        </section>

        {/* PRE-DEPARTURE SYNC ACTION CARD */}
        <section 
          aria-label="Pre-departure data sync control"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h3 className="text-xs font-black tracking-wider text-white uppercase">
                  PRE-DEPARTURE SYNC
                </h3>
                <p className="text-[10px] font-semibold text-neutral-400">
                  {hasLocalData ? 'LOCAL DATA READY' : 'NO LOCAL DATA — SYNC BEFORE DEPARTURE'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePreDepartureSync}
              disabled={syncState === 'SYNCING'}
              className="flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-600 px-3 py-2 text-xs font-black text-black uppercase tracking-wider transition-all hover:bg-green-500 active:scale-95 disabled:opacity-50 cursor-pointer"
              aria-label="Sync marine data before departure"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-black ${syncState === 'SYNCING' ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{syncState === 'SYNCING' ? 'SYNCING...' : 'SYNC DATA'}</span>
            </button>
          </div>

          {/* Sync Status Banner */}
          {syncMessage && (
            <div className={`mt-2.5 rounded border p-2 text-left text-xs font-bold ${
              syncState === 'SYNC_SUCCESS' 
                ? 'border-green-600/50 bg-green-950/40 text-green-300'
                : syncState === 'OFFLINE_ATTEMPT' || syncState === 'SYNC_ERROR'
                  ? 'border-amber-600/50 bg-amber-950/40 text-amber-300'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-200'
            }`}>
              <div className="flex items-center gap-1.5">
                {syncState === 'SYNC_SUCCESS' && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}
                {syncState === 'OFFLINE_ATTEMPT' && <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                {syncState === 'SYNC_ERROR' && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                <span>{syncMessage}</span>
              </div>
            </div>
          )}

          {/* Cache Summary Badges */}
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-center text-[10px] font-bold uppercase">
            <div className="rounded border border-neutral-800 bg-neutral-900 p-1.5">
              <span className="text-neutral-400 block">PFZ HOTSPOTS</span>
              <span className="text-green-400 font-black text-xs mt-0.5 block">
                {cachedHotspots.length > 0 ? `${cachedHotspots.length} AVAILABLE` : 'NOT SYNCED'}
              </span>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900 p-1.5">
              <span className="text-neutral-400 block">BORDER DATA</span>
              <span className="text-green-400 font-black text-xs mt-0.5 block">
                {cachedBorderLines.length > 0 ? 'AVAILABLE (1 LINE)' : 'NOT SYNCED'}
              </span>
            </div>
          </div>
        </section>

        {/* PHASE 16: OFFLINE DATA HEALTH & CACHE STATUS SECTION */}
        <section
          aria-label="Offline Data Health and Cache Freshness"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Database className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  OFFLINE DATA HEALTH
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  உள்ளூர் தரவு நிலை
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className={`inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase border ${cacheHealthSummary.overallBadge}`}>
                {cacheHealthSummary.overallLabel}
              </span>
              <span className="block text-[8px] font-bold text-neutral-400 mt-0.5">
                {cacheHealthSummary.overallTamilLabel}
              </span>
            </div>
          </div>

          {/* Mode banner */}
          <div className="flex items-center justify-between rounded bg-neutral-900 px-2.5 py-1.5 border border-neutral-800 text-[10px] font-bold uppercase mb-2.5">
            <span className="text-neutral-400">
              STATUS: <strong className="text-white">{isOnline ? 'ONLINE' : 'OFFLINE'}</strong>
            </span>
            <span className="text-green-400">
              USING LOCALLY CACHED DATA
            </span>
          </div>

          {/* Dataset Freshness Breakdown Rows */}
          <div className="space-y-2">
            {/* 1. WAVE THRESHOLD */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-neutral-200 block">
                    WAVE THRESHOLD
                  </span>
                  <span className="text-[8px] font-bold text-neutral-400">
                    அலை உயர வரம்பு
                  </span>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${cacheHealthSummary.waveHealth.badgeBg}`}>
                  {cacheHealthSummary.waveHealth.stateLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-300">
                <span>{cacheHealthSummary.waveHealth.details}</span>
                <span className="text-neutral-400">{cacheHealthSummary.waveHealth.ageFormatted}</span>
              </div>
            </div>

            {/* 2. PFZ HOTSPOTS */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-neutral-200 block">
                    PFZ HOTSPOTS
                  </span>
                  <span className="text-[8px] font-bold text-neutral-400">
                    PFZ மீன்பிடி பகுதிகள்
                  </span>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${cacheHealthSummary.pfzHealth.badgeBg}`}>
                  {cacheHealthSummary.pfzHealth.stateLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-300">
                <span>{cacheHealthSummary.pfzHealth.details}</span>
                <span className="text-neutral-400">{cacheHealthSummary.pfzHealth.ageFormatted}</span>
              </div>
            </div>

            {/* 3. BORDER REFERENCE */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-neutral-200 block">
                    BORDER REFERENCE
                  </span>
                  <span className="text-[8px] font-bold text-neutral-400">
                    எல்லை குறிப்பு
                  </span>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${cacheHealthSummary.borderHealth.badgeBg}`}>
                  {cacheHealthSummary.borderHealth.stateLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-300">
                <span>{cacheHealthSummary.borderHealth.details}</span>
                <span className="text-neutral-400">{cacheHealthSummary.borderHealth.ageFormatted}</span>
              </div>
            </div>

            {/* 4. LAST DATA SYNC */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-neutral-200 block">
                    LAST DATA SYNC
                  </span>
                  <span className="text-[8px] font-bold text-neutral-400">
                    கடைசி தரவு ஒத்திசைவு
                  </span>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${cacheHealthSummary.syncHealth.badgeBg}`}>
                  {cacheHealthSummary.syncHealth.stateLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-neutral-300">
                <span>UPDATED: {cacheHealthSummary.syncHealth.lastUpdatedFormatted}</span>
                <span className="text-neutral-400">{cacheHealthSummary.syncHealth.ageFormatted}</span>
              </div>
            </div>
          </div>

          {/* Action Recommendation Banner */}
          <div className={`mt-3 rounded-lg border p-2 text-center ${
            cacheHealthSummary.overallHealth === 'CACHE_READY'
              ? 'border-green-500/40 bg-green-950/30 text-green-300'
              : cacheHealthSummary.overallHealth === 'CACHE_WARNING'
                ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                : 'border-red-500/50 bg-red-950/40 text-red-300'
          }`}>
            <p className="text-[10px] font-black uppercase">
              {cacheHealthSummary.recommendation}
            </p>
            <p className="text-[9px] font-semibold mt-0.5 opacity-90">
              {cacheHealthSummary.recommendationTamil}
            </p>
          </div>

          {/* Prototype Freshness Rule Disclaimer */}
          <div className="mt-2 text-center">
            <p className="text-[8px] font-medium text-neutral-400 leading-tight">
              DATA FRESHNESS WINDOWS ARE PROTOTYPE RULES.
              <br />
              <span>தரவு புதுப்பிப்பு காலவரம்புகள் முன்மாதிரி விதிகள் மட்டுமே.</span>
            </p>
          </div>
        </section>

        {/* PHASE 17: OFFLINE DATA PACKAGE INTEGRITY & VALIDATION SECTION */}
        <section
          aria-label="Offline Data Package Integrity and Pre-Departure Validation"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  OFFLINE DATA PACKAGE
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  உள்ளூர் தரவு தொகுப்பு
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className={`inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase border ${dataPackageValidationSummary.overallBadge}`}>
                {dataPackageValidationSummary.overallLabel}
              </span>
              <span className="block text-[8px] font-bold text-neutral-400 mt-0.5">
                {dataPackageValidationSummary.overallTamilLabel}
              </span>
            </div>
          </div>

          {/* Validation Breakdown Rows */}
          <div className="space-y-2">
            {/* 1. WAVE DATA */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={dataPackageValidationSummary.waveValidation.isValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {dataPackageValidationSummary.waveValidation.isValid ? '✓' : '✕'}
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-200 block">
                      WAVE THRESHOLDS
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      அலை உயர வரம்பு
                    </span>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${dataPackageValidationSummary.waveValidation.badgeBg}`}>
                  {dataPackageValidationSummary.waveValidation.statusLabel}
                </span>
              </div>
              <div className="mt-1.5 text-[9px] font-mono text-neutral-300">
                <span>{dataPackageValidationSummary.waveValidation.reason}</span>
              </div>
            </div>

            {/* 2. PFZ DATA */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={dataPackageValidationSummary.pfzValidation.isValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {dataPackageValidationSummary.pfzValidation.isValid ? '✓' : '✕'}
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-200 block">
                      PFZ HOTSPOTS
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      PFZ மீன்பிடி பகுதிகள்
                    </span>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${dataPackageValidationSummary.pfzValidation.badgeBg}`}>
                  {dataPackageValidationSummary.pfzValidation.statusLabel}
                </span>
              </div>
              <div className="mt-1.5 text-[9px] font-mono text-neutral-300">
                <span>{dataPackageValidationSummary.pfzValidation.reason}</span>
              </div>
            </div>

            {/* 3. BORDER DATA */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={dataPackageValidationSummary.borderValidation.isValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {dataPackageValidationSummary.borderValidation.isValid ? '✓' : '✕'}
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-200 block">
                      BORDER REFERENCE
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      எல்லை குறிப்பு
                    </span>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${dataPackageValidationSummary.borderValidation.badgeBg}`}>
                  {dataPackageValidationSummary.borderValidation.statusLabel}
                </span>
              </div>
              <div className="mt-1.5 text-[9px] font-mono text-neutral-300">
                <span>{dataPackageValidationSummary.borderValidation.reason}</span>
              </div>
            </div>

            {/* 4. SYNC METADATA */}
            <div className="rounded-lg border border-neutral-800/90 bg-neutral-900 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={dataPackageValidationSummary.syncValidation.isValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    {dataPackageValidationSummary.syncValidation.isValid ? '✓' : '✕'}
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase text-neutral-200 block">
                      SYNC METADATA
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      ஒத்திசைவு தகவல்
                    </span>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${dataPackageValidationSummary.syncValidation.badgeBg}`}>
                  {dataPackageValidationSummary.syncValidation.statusLabel}
                </span>
              </div>
              <div className="mt-1.5 text-[9px] font-mono text-neutral-300">
                <span>{dataPackageValidationSummary.syncValidation.reason}</span>
              </div>
            </div>
          </div>

          {/* Action Recommendation Banner */}
          <div className={`mt-3 rounded-lg border p-2 text-center ${
            dataPackageValidationSummary.isPackageValid
              ? 'border-green-500/40 bg-green-950/30 text-green-300'
              : dataPackageValidationSummary.isCheckRequired
                ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                : 'border-red-500/50 bg-red-950/40 text-red-300'
          }`}>
            <p className="text-[10px] font-black uppercase">
              {dataPackageValidationSummary.recommendation}
            </p>
            <p className="text-[9px] font-semibold mt-0.5 opacity-90">
              {dataPackageValidationSummary.recommendationTamil}
            </p>
          </div>

          {/* Prototype Validation Disclaimer */}
          <div className="mt-2 text-center">
            <p className="text-[8px] font-medium text-neutral-400 leading-tight">
              OFFLINE DATA VALIDATION CHECKS DATA STRUCTURE AND LOCAL COMPLETENESS ONLY — IT DOES NOT GUARANTEE MARINE SAFETY.
              <br />
              <span>உள்ளூர் தரவு சரிபார்ப்பு தரவின் அமைப்பு மற்றும் முழுமையை மட்டுமே சரிபார்க்கிறது — இது கடல் பாதுகாப்பை உறுதி செய்யாது.</span>
            </p>
          </div>
        </section>

        {/* C. MAIN DYNAMIC SAFETY STATUS CARD */}
        <section 
          aria-label="Primary Marine Safety Status"
          className={`relative rounded-xl border-2 ${safetyConfig.borderColor} ${safetyConfig.bgColor} p-4 text-center transition-all shadow-none`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            {combinedSafetyAnalysis.overallStatus === 'SAFE' && (
              <ShieldCheck className="h-8 w-8 text-green-400" aria-hidden="true" />
            )}
            {combinedSafetyAnalysis.overallStatus === 'CAUTION' && (
              <ShieldAlert className="h-8 w-8 text-amber-400" aria-hidden="true" />
            )}
            {combinedSafetyAnalysis.overallStatus === 'DANGER' && (
              <ShieldX className="h-8 w-8 text-red-500 animate-pulse" aria-hidden="true" />
            )}
            {combinedSafetyAnalysis.overallStatus === 'UNAVAILABLE' && (
              <AlertTriangle className="h-8 w-8 text-neutral-400" aria-hidden="true" />
            )}

            <span className={`text-3xl font-black tracking-widest ${safetyConfig.textColor}`}>
              {safetyConfig.title}
            </span>
          </div>

          {/* Tamil Status Translation */}
          <div className="my-1">
            <span className={`inline-block rounded-md border px-3 py-0.5 text-lg font-bold text-white tracking-wide ${
              combinedSafetyAnalysis.overallStatus === 'SAFE' 
                ? 'bg-green-950/80 border-green-500/50' 
                : combinedSafetyAnalysis.overallStatus === 'CAUTION'
                  ? 'bg-amber-950/80 border-amber-500/50'
                  : combinedSafetyAnalysis.overallStatus === 'DANGER'
                    ? 'bg-red-950/80 border-red-500/50'
                    : 'bg-neutral-950/80 border-neutral-700'
            }`}>
              {safetyConfig.tamilTitle}
            </span>
          </div>

          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-neutral-300">
            CURRENT CONDITIONS: <span className={safetyConfig.textColor}>{combinedSafetyAnalysis.subtitle}</span>
          </p>

          {/* SAFETY FACTORS BREAKDOWN */}
          <div className="mt-3 pt-2.5 border-t border-neutral-800/80 grid grid-cols-2 gap-2 text-center text-[10px] font-black uppercase">
            <div className="rounded bg-black/40 border border-neutral-800 p-1.5">
              <span className="text-neutral-400 block text-[9px]">WAVE FACTOR</span>
              <span className={`mt-0.5 block ${
                combinedSafetyAnalysis.waveFactor === 'SAFE' 
                  ? 'text-green-400' 
                  : combinedSafetyAnalysis.waveFactor === 'CAUTION' 
                    ? 'text-amber-400' 
                    : combinedSafetyAnalysis.waveFactor === 'DANGER'
                      ? 'text-red-500'
                      : 'text-neutral-400'
              }`}>
                {combinedSafetyAnalysis.waveFactor} ({currentWaveHeightM.toFixed(1)}m)
              </span>
            </div>

            <div className="rounded bg-black/40 border border-neutral-800 p-1.5">
              <span className="text-neutral-400 block text-[9px]">BORDER FACTOR</span>
              <span className={`mt-0.5 block ${
                combinedSafetyAnalysis.borderFactor === 'SAFE' 
                  ? 'text-green-400' 
                  : combinedSafetyAnalysis.borderFactor === 'CAUTION' 
                    ? 'text-amber-400' 
                    : combinedSafetyAnalysis.borderFactor === 'DANGER'
                      ? 'text-red-500'
                      : 'text-neutral-400'
              }`}>
                {combinedSafetyAnalysis.borderFactor}
              </span>
            </div>
          </div>
        </section>

        {/* EXPLAINABLE RISK SCORE & CONTRIBUTION BREAKDOWN */}
        <section 
          aria-label="Explainable Marine Risk Score"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                MARINE RISK SCORE
              </h2>
            </div>
            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${
              combinedSafetyAnalysis.riskLevel === 'LOW'
                ? 'border-green-500 bg-green-950/60 text-green-400'
                : combinedSafetyAnalysis.riskLevel === 'MODERATE'
                  ? 'border-amber-500 bg-amber-950/60 text-amber-300'
                  : combinedSafetyAnalysis.riskLevel === 'HIGH'
                    ? 'border-red-500 bg-red-950/60 text-red-400'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-400'
            }`}>
              {combinedSafetyAnalysis.riskLevel === 'UNAVAILABLE' 
                ? 'CALCULATING...' 
                : `${combinedSafetyAnalysis.riskLevel} RISK`}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                TOTAL RISK INDEX
              </span>
              <span className="text-2xl font-black tracking-tight text-white font-mono mt-0.5 block">
                {combinedSafetyAnalysis.riskScore !== null 
                  ? `${combinedSafetyAnalysis.riskScore} / 100` 
                  : '-- / 100'}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                EVALUATION
              </span>
              <span className={`text-xs font-black uppercase tracking-wider block mt-1 ${
                combinedSafetyAnalysis.riskLevel === 'LOW' 
                  ? 'text-green-400' 
                  : combinedSafetyAnalysis.riskLevel === 'MODERATE' 
                    ? 'text-amber-400' 
                    : combinedSafetyAnalysis.riskLevel === 'HIGH'
                      ? 'text-red-400'
                      : 'text-neutral-400'
              }`}>
                {combinedSafetyAnalysis.riskLevel === 'LOW' && '0–29 • LOW RISK'}
                {combinedSafetyAnalysis.riskLevel === 'MODERATE' && '30–59 • MODERATE RISK'}
                {combinedSafetyAnalysis.riskLevel === 'HIGH' && '60–100 • HIGH RISK'}
                {combinedSafetyAnalysis.riskLevel === 'UNAVAILABLE' && 'INSUFFICIENT DATA'}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 uppercase mb-1.5">
              <span>CONTRIBUTING FACTORS</span>
              <span>WAVE (50) + BORDER (50)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
              <div className="rounded border border-neutral-800 bg-neutral-900/90 p-2 text-left">
                <div className="flex items-center justify-between font-black uppercase">
                  <span className="text-neutral-300">WAVE RISK</span>
                  <span className={
                    waveSafetyAnalysis.status === 'SAFE' 
                      ? 'text-green-400' 
                      : waveSafetyAnalysis.status === 'CAUTION' 
                        ? 'text-amber-400' 
                        : waveSafetyAnalysis.status === 'DANGER'
                          ? 'text-red-400'
                          : 'text-neutral-400'
                  }>
                    {waveSafetyAnalysis.contribution !== null ? `${waveSafetyAnalysis.contribution}/50` : '--/50'}
                  </span>
                </div>
                <div className="mt-1 text-[9px] text-neutral-400 leading-tight">
                  Height: <strong className="text-neutral-200">{currentWaveHeightM.toFixed(1)}m</strong>
                  <br />
                  Limit: <strong className="text-neutral-200">{safeLimitDisplay}</strong>
                </div>
              </div>

              <div className="rounded border border-neutral-800 bg-neutral-900/90 p-2 text-left">
                <div className="flex items-center justify-between font-black uppercase">
                  <span className="text-neutral-300">BORDER RISK</span>
                  <span className={
                    borderSafetyAnalysis.status === 'SAFE' 
                      ? 'text-green-400' 
                      : borderSafetyAnalysis.status === 'CAUTION' 
                        ? 'text-amber-400' 
                        : borderSafetyAnalysis.status === 'DANGER'
                          ? 'text-red-400'
                          : 'text-neutral-400'
                  }>
                    {borderSafetyAnalysis.contribution !== null ? `${borderSafetyAnalysis.contribution}/50` : '--/50'}
                  </span>
                </div>
                <div className="mt-1 text-[9px] text-neutral-400 leading-tight">
                  Distance: <strong className="text-neutral-200">{formatDistance(borderSafetyAnalysis.distanceNM)}</strong>
                  <br />
                  Zone: <strong className="text-neutral-200">{borderSafetyAnalysis.label}</strong>
                </div>
              </div>
            </div>

            {/* Phase 16 & 17: Risk Score Data Freshness & Quality Note */}
            <div className="mt-2.5 flex items-center justify-between border-t border-neutral-800/80 pt-2 text-[10px] text-neutral-400 font-bold uppercase">
              <span>RISK DATA QUALITY:</span>
              <span className={dataPackageValidationSummary.isPackageValid ? 'text-green-400 font-black' : dataPackageValidationSummary.isCheckRequired ? 'text-amber-300 font-black' : 'text-red-400 font-black'}>
                {dataPackageValidationSummary.isPackageValid ? 'VALID' : dataPackageValidationSummary.isCheckRequired ? 'CHECK REQUIRED' : 'INCOMPLETE'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] text-neutral-400 font-bold uppercase">
              <span>DATA FRESHNESS:</span>
              <span className={cacheHealthSummary.hasStale ? 'text-red-400 font-black' : cacheHealthSummary.waveHealth.state === 'AGING' ? 'text-amber-300 font-black' : 'text-green-400 font-black'}>
                {cacheHealthSummary.waveHealth.stateLabel}
              </span>
            </div>
          </div>
        </section>

        {/* ACTIONABLE FISHERMAN GUIDANCE ("WHAT SHOULD I DO?") */}
        <section 
          aria-label="Actionable Navigation and Safety Guidance"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-2 mb-2.5">
            <HelpCircle className="h-4 w-4 text-green-400" aria-hidden="true" />
            <div className="flex items-center justify-between w-full">
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                WHAT SHOULD I DO?
              </h2>
              <span className="text-[10px] font-bold text-neutral-400">
                என்ன செய்ய வேண்டும்?
              </span>
            </div>
          </div>

          <div className={`rounded-lg border p-3 ${
            combinedSafetyAnalysis.overallStatus === 'SAFE'
              ? 'border-green-500/40 bg-green-950/20'
              : combinedSafetyAnalysis.overallStatus === 'CAUTION'
                ? 'border-amber-500/40 bg-amber-950/20'
                : combinedSafetyAnalysis.overallStatus === 'DANGER'
                  ? 'border-red-500/40 bg-red-950/25'
                  : 'border-neutral-800 bg-neutral-900/60'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-black tracking-wide uppercase ${
                combinedSafetyAnalysis.overallStatus === 'SAFE' 
                  ? 'text-green-400' 
                  : combinedSafetyAnalysis.overallStatus === 'CAUTION' 
                    ? 'text-amber-400' 
                    : combinedSafetyAnalysis.overallStatus === 'DANGER'
                      ? 'text-red-400'
                      : 'text-neutral-300'
              }`}>
                {actionableGuidance.primary}
              </span>
            </div>

            <p className="text-xs font-bold text-neutral-300 mt-1">
              {actionableGuidance.secondary}
            </p>

            <ul className="mt-2.5 space-y-1.5 border-t border-neutral-800/80 pt-2 text-[11px] font-medium text-neutral-200">
              {actionableGuidance.bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-1.5 leading-snug">
                  <ArrowRight className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* PHASE 15: LOCAL SAFETY ALERTS & NOTIFICATION ENGINE */}
        <section 
          aria-label="Local Safety Alerts and Active Notification Engine"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <BellRing className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  LOCAL SAFETY ALERTS
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  உள்ளூர் பாதுகாப்பு எச்சரிக்கைகள்
                </span>
              </div>
            </div>

            {activeAlert ? (
              <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${
                activeAlert.priority === 'CRITICAL'
                  ? 'border-red-500 bg-red-950/70 text-red-400 animate-pulse'
                  : activeAlert.priority === 'HIGH'
                    ? 'border-amber-500 bg-amber-950/70 text-amber-300'
                    : activeAlert.priority === 'ADVISORY'
                      ? 'border-amber-500/60 bg-neutral-900 text-amber-300'
                      : 'border-green-500/60 bg-green-950/50 text-green-400'
              }`}>
                ● {activeAlert.priority} ACTIVE
              </span>
            ) : (
              <span className="rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] font-black uppercase text-neutral-400">
                ALL CLEAR
              </span>
            )}
          </div>

          {/* Active Alert Card */}
          {activeAlert ? (
            <div 
              role="alert"
              aria-live={activeAlert.priority === 'CRITICAL' || activeAlert.priority === 'HIGH' ? 'assertive' : 'polite'}
              className={`rounded-xl border-2 p-3.5 transition-all ${
                activeAlert.priority === 'CRITICAL'
                  ? 'border-red-500 bg-red-950/40 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                  : activeAlert.priority === 'HIGH'
                    ? 'border-amber-500 bg-amber-950/40'
                    : activeAlert.priority === 'ADVISORY'
                      ? 'border-amber-500/50 bg-amber-950/20'
                      : 'border-green-500/50 bg-green-950/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${
                    activeAlert.priority === 'CRITICAL'
                      ? 'border-red-500 bg-red-900 text-white'
                      : activeAlert.priority === 'HIGH'
                        ? 'border-amber-500 bg-amber-900 text-white'
                        : activeAlert.priority === 'ADVISORY'
                          ? 'border-amber-600 bg-amber-950 text-amber-300'
                          : 'border-green-600 bg-green-950 text-green-300'
                  }`}>
                    {activeAlert.priority}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 font-bold">
                    {activeAlert.formattedTime}
                  </span>
                </div>

                {activeAlert.riskScore !== null && activeAlert.riskScore !== undefined && (
                  <span className="text-[10px] font-mono font-bold text-neutral-300 bg-black/40 border border-neutral-800 rounded px-1.5 py-0.5">
                    RISK: {activeAlert.riskScore}/100
                  </span>
                )}
              </div>

              <div className="mt-2">
                <h3 className={`text-sm font-black uppercase tracking-wide leading-tight ${
                  activeAlert.priority === 'CRITICAL' ? 'text-red-400' : activeAlert.priority === 'HIGH' ? 'text-amber-300' : 'text-white'
                }`}>
                  {activeAlert.title}
                </h3>
                <p className="text-xs font-bold text-white mt-0.5">
                  {activeAlert.tamilTitle}
                </p>
              </div>

              <div className="mt-2 text-xs text-neutral-300 leading-snug">
                <p>{activeAlert.message}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{activeAlert.tamilMessage}</p>
              </div>

              {/* Recommended Action */}
              <div className="mt-3 rounded-lg border border-neutral-800 bg-black/60 p-2.5">
                <div className="text-[10px] font-bold text-neutral-400 uppercase">
                  ACTION / செயல்:
                </div>
                <div className="text-xs font-black text-white mt-0.5 uppercase">
                  {activeAlert.action}
                </div>
                <div className="text-[11px] font-bold text-neutral-300 mt-0.5">
                  {activeAlert.tamilAction}
                </div>
              </div>

              {/* Acknowledge Button */}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleAcknowledgeAlert(activeAlert.alertId)}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-white uppercase tracking-wider hover:bg-neutral-800 active:scale-95 cursor-pointer"
                  aria-label={`Acknowledge alert: ${activeAlert.title}`}
                >
                  <Check className="h-3.5 w-3.5 text-green-400" />
                  <span>ACKNOWLEDGE • ஒப்புக்கொள்</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 text-center">
              <ShieldCheck className="h-6 w-6 text-green-400 mx-auto mb-1" />
              <span className="text-xs font-black uppercase text-neutral-300 block">
                NO ACTIVE LOCAL ALERTS
              </span>
              <span className="text-[10px] text-neutral-400 block mt-0.5">
                செயலில் உள்ள எச்சரிக்கைகள் எதுவும் இல்லை
              </span>
            </div>
          )}

          {/* Alert History Section */}
          <div className="mt-3.5 border-t border-neutral-800 pt-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-neutral-400">
                <History className="h-3.5 w-3.5 text-green-400" />
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-300">
                  ALERT HISTORY
                </span>
              </div>
              <span className="text-[9px] font-bold text-neutral-400">
                எச்சரிக்கை வரலாறு
              </span>
            </div>

            {localAlerts.length > 0 ? (
              <div className="space-y-1.5">
                {localAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.alertId}
                    className="flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-900/70 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                      <span className="font-mono text-[10px] text-neutral-400 shrink-0 font-bold">
                        {alert.formattedTime}
                      </span>
                      <span className="truncate text-[10px] font-bold text-neutral-200 uppercase">
                        {alert.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase border ${
                        alert.priority === 'CRITICAL'
                          ? 'border-red-500/60 bg-red-950/60 text-red-400'
                          : alert.priority === 'HIGH'
                            ? 'border-amber-500/60 bg-amber-950/60 text-amber-300'
                            : alert.priority === 'ADVISORY'
                              ? 'border-amber-500/40 bg-neutral-950 text-amber-300'
                              : 'border-green-500/40 bg-green-950 text-green-400'
                      }`}>
                        {alert.priority}
                      </span>
                      {alert.acknowledged && (
                        <span className="text-[8px] text-neutral-400 font-semibold">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800/50 bg-neutral-900/30 p-2 text-center text-[10px] text-neutral-400">
                No local alerts generated yet.
              </div>
            )}
          </div>

          {/* Prototype Disclaimer */}
          <div className="mt-2 text-center">
            <p className="text-[8px] font-bold text-neutral-400 leading-tight">
              LOCAL ALERTS ARE BASED ON CACHED AND LOCALLY RECORDED PROTOTYPE DATA.
              <br />
              <span className="text-neutral-400">
                உள்ளூர் எச்சரிக்கைகள் சேமிக்கப்பட்ட மற்றும் சாதனத்தில் பதிவுசெய்யப்பட்ட முன்மாதிரி தரவை அடிப்படையாகக் கொண்டவை.
              </span>
            </p>
          </div>
        </section>

        {/* PHASE 10: PRE-DEPARTURE READINESS + SAFETY CHECKLIST */}
        <section 
          aria-label="Pre-departure Readiness and Safety Checklist"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  PRE-DEPARTURE CHECK
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  புறப்படுவதற்கு முன் சரிபார்ப்பு
                </span>
              </div>
            </div>

            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${
              activeTrip?.status === 'ACTIVE'
                ? 'border-neutral-700 bg-neutral-900 text-neutral-300'
                : preDepartureChecklist.readinessStatus === 'READY'
                  ? 'border-green-500 bg-green-950/60 text-green-400'
                  : 'border-amber-500 bg-amber-950/60 text-amber-300'
            }`}>
              {activeTrip?.status === 'ACTIVE'
                ? 'TRIP ACTIVE • CHECK RECORDED'
                : preDepartureChecklist.readinessStatus === 'READY'
                  ? '✓ READY TO START'
                  : '● CHECK REQUIRED'}
            </span>
          </div>

          {/* If Trip is ACTIVE: Display compact summary */}
          {activeTrip?.status === 'ACTIVE' ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5 text-center text-xs text-neutral-300">
              <span className="font-bold text-green-400 text-[11px] block">
                PRE-DEPARTURE CHECK COMPLETED
              </span>
              <span className="text-[10px] text-neutral-400 mt-0.5 block">
                Active trip monitoring in progress. Marine safety conditions continuously assessed below.
              </span>
            </div>
          ) : (
            <div>
              {/* Individual Checklist Items */}
              <div className="space-y-1.5">
                {preDepartureChecklist.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-lg border p-2 text-xs transition-colors ${
                        item.isReady
                          ? 'border-neutral-800/80 bg-neutral-900/80'
                          : 'border-amber-900/60 bg-amber-950/25'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden pr-2">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                          item.isReady ? 'bg-green-950/60 text-green-400' : 'bg-amber-950/60 text-amber-400'
                        }`}>
                          <ItemIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="truncate">
                          <span className="text-[10px] font-black uppercase text-white block truncate">
                            {item.name}
                          </span>
                          <span className="text-[9px] font-medium text-neutral-400 block truncate">
                            {item.detail}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {item.isReady ? (
                          <span className="rounded bg-green-950/60 border border-green-500/50 px-1.5 py-0.5 text-[9px] font-black text-green-400 uppercase">
                            {item.statusText}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-950/60 border border-amber-500/50 px-1.5 py-0.5 text-[9px] font-black text-amber-300 uppercase">
                            {item.statusText}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Explanation and Next Action Box */}
              <div className={`mt-3 rounded-lg border p-2.5 ${
                preDepartureChecklist.readinessStatus === 'READY'
                  ? 'border-green-500/40 bg-green-950/20 text-green-300'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
              }`}>
                <div className="flex items-start gap-1.5 text-xs font-bold">
                  {preDepartureChecklist.readinessStatus === 'READY' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-black uppercase text-[11px] block text-white">
                      {preDepartureChecklist.primaryReason}
                    </span>
                    <span className="text-[10px] font-semibold text-neutral-300 block mt-0.5">
                      NEXT ACTION: <strong className="text-white">{preDepartureChecklist.nextAction}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* OFFLINE TRIP MONITOR */}
        <section 
          aria-label="Offline Trip Tracking and Distance Monitor"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Route className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                TRIP MONITOR
              </h2>
            </div>
            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${
              activeTrip?.status === 'ACTIVE'
                ? 'border-green-500 bg-green-950/60 text-green-400 animate-pulse'
                : completedTripSummary
                  ? 'border-neutral-700 bg-neutral-900 text-neutral-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400'
            }`}>
              {activeTrip?.status === 'ACTIVE'
                ? '● ACTIVE TRIP'
                : completedTripSummary
                  ? 'TRIP COMPLETED'
                  : 'READY TO START'}
            </span>
          </div>

          {activeTrip && activeTrip.status === 'ACTIVE' ? (
            <div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                    STARTED
                  </span>
                  <span className="text-xs font-black text-white mt-1 block font-mono">
                    {formatTimeHHMM(activeTrip.startTime)}
                  </span>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                    DURATION
                  </span>
                  <span className="text-xs font-black text-green-400 mt-1 block font-mono">
                    {formatDuration(tripElapsedMs)}
                  </span>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                    DISTANCE
                  </span>
                  <span className="text-xs font-black text-white mt-1 block font-mono">
                    {hasGpsFix ? `${activeTrip.totalDistanceNm.toFixed(1)} NM` : '-- NM'}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-[10px] font-bold uppercase">
                <span>
                  CURRENT RISK: <strong className={
                    combinedSafetyAnalysis.riskLevel === 'LOW' 
                      ? 'text-green-400' 
                      : combinedSafetyAnalysis.riskLevel === 'MODERATE' 
                        ? 'text-amber-400' 
                        : combinedSafetyAnalysis.riskLevel === 'HIGH' 
                          ? 'text-red-400' 
                          : 'text-neutral-400'
                  }>{combinedSafetyAnalysis.riskLevel === 'UNAVAILABLE' ? 'DATA UNAVAILABLE' : combinedSafetyAnalysis.riskLevel}</strong>
                </span>
                <span>
                  RISK SCORE: <strong className="text-white font-mono">{combinedSafetyAnalysis.riskScore !== null ? `${combinedSafetyAnalysis.riskScore}/100` : '--/100'}</strong>
                </span>
              </div>

              {/* Phase 16 & 17: Active Voyage Data Freshness & Package Quality Indicator */}
              <div className="mt-2 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 text-[10px] font-bold uppercase">
                <span className="text-neutral-400">DATA PACKAGE:</span>
                <span className={dataPackageValidationSummary.isPackageValid ? 'text-green-400 font-black' : dataPackageValidationSummary.isCheckRequired ? 'text-amber-300 font-black' : 'text-red-400 font-black'}>
                  {dataPackageValidationSummary.isPackageValid ? 'DATA PACKAGE: VALID' : dataPackageValidationSummary.isCheckRequired ? 'DATA PACKAGE: CHECK REQUIRED' : 'DATA PACKAGE: INCOMPLETE'}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-mono px-1 text-neutral-400 font-bold uppercase">
                <span>FRESHNESS:</span>
                <span className={cacheHealthSummary.overallHealth === 'CACHE_READY' ? 'text-green-400' : cacheHealthSummary.overallHealth === 'CACHE_WARNING' ? (cacheHealthSummary.hasStale ? 'text-red-400' : 'text-amber-300') : 'text-red-400'}>
                  {cacheHealthSummary.overallHealth === 'CACHE_READY' ? 'FRESH' : cacheHealthSummary.overallHealth === 'CACHE_WARNING' ? (cacheHealthSummary.hasStale ? 'STALE' : 'AGING') : 'MISSING'}
                </span>
              </div>

              {!hasGpsFix && (
                <div className="mt-2 text-center rounded border border-amber-900/60 bg-amber-950/30 p-1.5">
                  <p className="text-[10px] font-bold text-amber-300">
                    GPS SIGNAL LOST — Distance accumulation paused until lock restored
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleEndTrip}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500 bg-red-600/90 px-4 py-2.5 text-xs font-black text-white uppercase tracking-wider transition-all hover:bg-red-500 active:scale-98 cursor-pointer"
                aria-label="End active fishing trip"
              >
                <Square className="h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
                <span>END TRIP</span>
              </button>
            </div>
          ) : completedTripSummary ? (
            <div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-green-400 text-xs font-black uppercase mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>TRIP SUMMARY COMPLETED</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                      TOTAL DURATION
                    </span>
                    <span className="text-sm font-black text-white font-mono mt-0.5 block">
                      {formatDuration(completedTripSummary.endTime! - completedTripSummary.startTime)}
                    </span>
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                      TOTAL DISTANCE
                    </span>
                    <span className="text-sm font-black text-green-400 font-mono mt-0.5 block">
                      {completedTripSummary.totalDistanceNm.toFixed(1)} NM
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNewTrip}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-green-500 bg-green-600 px-4 py-2.5 text-xs font-black text-black uppercase tracking-wider transition-all hover:bg-green-500 active:scale-98 cursor-pointer"
                aria-label="Start new trip"
              >
                <Play className="h-3.5 w-3.5 fill-black text-black" aria-hidden="true" />
                <span>START NEW TRIP</span>
              </button>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-neutral-400 leading-snug mb-3">
                Track local trip duration and distance travelled via GPS updates directly on your device.
              </p>
              <button
                type="button"
                onClick={handleStartTripClick}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all active:scale-98 cursor-pointer ${
                  preDepartureChecklist.readinessStatus === 'READY'
                    ? 'border-green-500 bg-green-600 text-black hover:bg-green-500'
                    : 'border-amber-500 bg-amber-600 text-black hover:bg-amber-500'
                }`}
                aria-label="Start fishing trip"
              >
                <Play className="h-3.5 w-3.5 fill-black text-black" aria-hidden="true" />
                <span>
                  {preDepartureChecklist.readinessStatus === 'READY' ? 'START TRIP' : 'START TRIP (CHECKS PENDING)'}
                </span>
              </button>
            </div>
          )}
        </section>

        {/* PHASE 11: VOYAGE TRACK & TRIP ANALYTICS */}
        <section 
          aria-label="Local Voyage Track and Trip Analytics"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  VOYAGE TRACK
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  பயண பாதை
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isDownsampled && (
                <span className="rounded bg-amber-950/60 border border-amber-500/50 px-1.5 py-0.5 text-[8px] font-black text-amber-300 uppercase">
                  DOWNSAMPLED
                </span>
              )}
              <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${
                activeTrip?.status === 'ACTIVE'
                  ? 'border-green-500 bg-green-950/60 text-green-400 animate-pulse'
                  : completedTripSummary
                    ? 'border-neutral-700 bg-neutral-900 text-neutral-300'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400'
              }`}>
                {activeTrip?.status === 'ACTIVE'
                  ? '● RECORDING'
                  : completedTripSummary
                    ? 'TRACK SAVED'
                    : 'NO ACTIVE VOYAGE'}
              </span>
            </div>
          </div>

          {/* SVG 2D Local Track Visualization */}
          <div className="relative w-full h-60 rounded-xl border border-neutral-800 bg-neutral-900/90 overflow-hidden flex items-center justify-center">
            {trackSvgData ? (
              <svg
                viewBox={`0 0 ${trackSvgData.svgWidth} ${trackSvgData.svgHeight}`}
                className="w-full h-full"
                aria-label="Local 2D voyage track plot showing vessel path"
              >
                {/* Subtle Background Grid */}
                <line x1="35" y1="30" x2="325" y2="30" stroke="#262626" strokeDasharray="3 3" />
                <line x1="35" y1="110" x2="325" y2="110" stroke="#262626" strokeDasharray="3 3" />
                <line x1="35" y1="190" x2="325" y2="190" stroke="#262626" strokeDasharray="3 3" />
                <line x1="35" y1="30" x2="35" y2="190" stroke="#262626" strokeDasharray="3 3" />
                <line x1="180" y1="30" x2="180" y2="190" stroke="#262626" strokeDasharray="3 3" />
                <line x1="325" y1="30" x2="325" y2="190" stroke="#262626" strokeDasharray="3 3" />

                {/* Cardinal Directions */}
                <text x="180" y="18" fill="#22c55e" fontSize="10" fontWeight="900" textAnchor="middle">N ▲</text>
                <text x="345" y="113" fill="#737373" fontSize="9" fontWeight="700" textAnchor="middle">E</text>
                <text x="180" y="210" fill="#737373" fontSize="9" fontWeight="700" textAnchor="middle">S</text>
                <text x="15" y="113" fill="#737373" fontSize="9" fontWeight="700" textAnchor="middle">W</text>

                {/* Recorded Path Polyline */}
                {trackSvgData.pathD && (
                  <path
                    d={trackSvgData.pathD}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Start Marker */}
                {trackSvgData.startPt && (
                  <g>
                    <circle
                      cx={trackSvgData.startPt.x}
                      cy={trackSvgData.startPt.y}
                      r="5"
                      fill="#22c55e"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={trackSvgData.startPt.x}
                      y={trackSvgData.startPt.y - 8}
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      START
                    </text>
                  </g>
                )}

                {/* Latest/Current/End Marker */}
                {trackSvgData.latestPt && (
                  <g>
                    <circle
                      cx={trackSvgData.latestPt.x}
                      cy={trackSvgData.latestPt.y}
                      r="9"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={trackSvgData.latestPt.x}
                      cy={trackSvgData.latestPt.y}
                      r="5"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={trackSvgData.latestPt.x}
                      y={trackSvgData.latestPt.y + 16}
                      fill="#38bdf8"
                      fontSize="9"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      {activeTrip?.status === 'ACTIVE' ? 'CURRENT' : 'END'}
                    </text>
                  </g>
                )}
              </svg>
            ) : (
              <div className="text-center p-4">
                {activeTrip?.status === 'ACTIVE' ? (
                  <div>
                    <Locate className="h-7 w-7 text-amber-400 mx-auto animate-spin mb-1.5" />
                    <span className="text-xs font-black text-amber-300 uppercase block">
                      WAITING FOR GPS SATELLITE FIX
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      Local track plotting begins as soon as position coordinates are locked.
                    </span>
                  </div>
                ) : (
                  <div>
                    <Route className="h-7 w-7 text-neutral-600 mx-auto mb-1.5" />
                    <span className="text-xs font-black text-neutral-400 uppercase block">
                      NO ACTIVE VOYAGE
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      Start a trip to record your local track and motion history.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accessible Text Summary of Recorded Track */}
          {activeTripTrackPoints.length > 0 && (
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-neutral-400 bg-neutral-900/60 rounded px-2 py-1">
              <span>START: {formatLatitude(activeTripTrackPoints[0].latitude)}, {formatLongitude(activeTripTrackPoints[0].longitude)}</span>
              <span>PTS: {activeTripTrackPoints.length}</span>
            </div>
          )}

          <div className="mt-1 text-center">
            <p className="text-[9px] font-semibold text-neutral-400 leading-tight">
              LOCAL TRACK IS FOR RECORDING ONLY — NOT A NAVIGATION CHART
              <br />
              <span className="text-neutral-400">உள்ளூர் பயணப் பதிவு மட்டுமே — வழிசெலுத்தல் வரைபடம் அல்ல.</span>
            </p>
          </div>

          {/* TRIP ANALYTICS SECTION */}
          <div className="mt-3 border-t border-neutral-800 pt-3">
            <h3 className="text-[11px] font-black uppercase text-neutral-300 tracking-wider mb-2 flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-green-400" />
              <span>TRIP ANALYTICS</span>
            </h3>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  AVG SPEED
                </span>
                <span className="text-xs font-black text-white mt-0.5 block font-mono">
                  {tripAnalytics.avgSpeed}
                </span>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  MAX SPEED
                </span>
                <span className="text-xs font-black text-green-400 mt-0.5 block font-mono">
                  {tripAnalytics.maxSpeed}
                </span>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                  GPS POINTS
                </span>
                <span className="text-xs font-black text-white mt-0.5 block font-mono">
                  {tripAnalytics.pointCount}
                </span>
              </div>
            </div>

            {/* Risk Exposure Breakdown */}
            <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/80 p-2 text-xs">
              <span className="block text-[9px] font-bold text-neutral-400 uppercase mb-1">
                RISK EXPOSURE SUMMARY (LOCAL TIME)
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono font-bold">
                <div className="rounded bg-green-950/40 border border-green-500/40 py-1 text-green-400">
                  <span className="block text-[8px] uppercase">SAFE</span>
                  <span>{tripAnalytics.safeExposure}</span>
                </div>
                <div className="rounded bg-amber-950/40 border border-amber-500/40 py-1 text-amber-300">
                  <span className="block text-[8px] uppercase">CAUTION</span>
                  <span>{tripAnalytics.cautionExposure}</span>
                </div>
                <div className="rounded bg-red-950/40 border border-red-500/40 py-1 text-red-400">
                  <span className="block text-[8px] uppercase">DANGER</span>
                  <span>{tripAnalytics.dangerExposure}</span>
                </div>
              </div>
            </div>

            {/* Clear Track Action Button */}
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={handleClearTrackClick}
                disabled={activeTrip?.status === 'ACTIVE' || activeTripTrackPoints.length === 0}
                className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[10px] font-bold uppercase text-neutral-400 hover:text-red-400 hover:border-red-800/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Clear local track data"
              >
                <Trash2 className="h-3 w-3" />
                <span>CLEAR LOCAL TRACK</span>
              </button>
            </div>
          </div>
        </section>

        {/* PHASE 12: LOCAL ROUTE PLANNING + SAFE RETURN GUIDANCE */}
        <section 
          aria-label="Navigation Route Planning and Safe Return Guidance"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  NAVIGATION GUIDANCE
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  வழிசெலுத்தல் வழிகாட்டி
                </span>
              </div>
            </div>

            {/* Guidance Mode Selector Tabs */}
            <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-[9px] font-black uppercase">
              <button
                type="button"
                onClick={() => setActiveGuidanceMode('PFZ')}
                className={`rounded px-2 py-1 transition-all cursor-pointer ${
                  activeGuidanceMode === 'PFZ'
                    ? 'bg-green-600 text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
                aria-label="PFZ Navigation Mode"
              >
                TO PFZ
              </button>
              <button
                type="button"
                onClick={() => setActiveGuidanceMode('RETURN')}
                className={`rounded px-2 py-1 transition-all cursor-pointer ${
                  activeGuidanceMode === 'RETURN'
                    ? 'bg-green-600 text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
                aria-label="Safe Return Guidance Mode"
              >
                RETURN
              </button>
              <button
                type="button"
                onClick={() => setActiveGuidanceMode('SAFETY')}
                className={`rounded px-2 py-1 transition-all cursor-pointer ${
                  activeGuidanceMode === 'SAFETY'
                    ? combinedSafetyAnalysis.overallStatus === 'DANGER'
                      ? 'bg-red-600 text-white shadow animate-pulse'
                      : combinedSafetyAnalysis.overallStatus === 'CAUTION'
                        ? 'bg-amber-600 text-black shadow'
                        : 'bg-green-600 text-black shadow'
                    : combinedSafetyAnalysis.overallStatus === 'DANGER'
                      ? 'text-red-400 animate-pulse font-black'
                      : 'text-neutral-400 hover:text-white'
                }`}
                aria-label="Safety Priority Mode"
              >
                SAFETY
              </button>
            </div>
          </div>

          {/* Mode 1: PFZ GUIDANCE */}
          {activeGuidanceMode === 'PFZ' && (
            <div>
              {/* Conflict banner if Border is DANGER while navigating to PFZ */}
              {borderSafetyAnalysis.status === 'DANGER' && (
                <div className="mb-2.5 rounded-lg border-2 border-red-500 bg-red-950/60 p-2.5 text-center animate-pulse">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase text-red-300">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>SAFETY PRIORITY: CRITICAL BORDER PROXIMITY</span>
                  </div>
                  <p className="text-[10px] font-bold text-white mt-0.5">
                    ACTION: MOVE AWAY FROM BORDER BEFORE CONTINUING TO PFZ
                  </p>
                </div>
              )}

              {/* PFZ Target Information Card */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                {/* Phase 17: PFZ Data Invalid Banner */}
                {!dataPackageValidationSummary.pfzValidation.isValid && (
                  <div className="mb-2.5 rounded border border-red-500/60 bg-red-950/40 p-2 text-center">
                    <span className="text-[10px] font-black uppercase text-red-300">
                      PFZ DATA INVALID • NAVIGATION TARGET UNAVAILABLE
                    </span>
                    <span className="block text-[8px] text-red-400/90 mt-0.5">
                      {dataPackageValidationSummary.pfzValidation.reason}
                    </span>
                  </div>
                )}

                {/* Phase 16: PFZ Data Freshness Indicator */}
                {cacheHealthSummary.pfzHealth.state !== 'FRESH' && (
                  <div className={`mb-2.5 rounded border p-1.5 text-center ${
                    cacheHealthSummary.pfzHealth.state === 'STALE'
                      ? 'border-red-500/50 bg-red-950/40 text-red-300'
                      : cacheHealthSummary.pfzHealth.state === 'AGING'
                        ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                        : 'border-neutral-700 bg-neutral-950 text-neutral-400'
                  }`}>
                    <span className="text-[10px] font-black uppercase">
                      {cacheHealthSummary.pfzHealth.state === 'STALE' ? 'PFZ DATA STALE' : cacheHealthSummary.pfzHealth.state === 'AGING' ? 'PFZ DATA AGING' : 'PFZ DATA UNAVAILABLE'}
                    </span>
                    <span className="block text-[8px] opacity-80 mt-0.5">
                      {cacheHealthSummary.pfzHealth.ageFormatted}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">
                    PFZ TARGET HOTSPOT
                  </span>
                  <span className="text-[10px] font-black text-green-400 truncate max-w-[180px]">
                    {activeHotspot ? activeHotspot.name : 'NO PFZ SELECTED'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      BEARING
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block font-mono">
                      {formatBearing(navigationData.bearing)}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      DIRECTION
                    </span>
                    <span className="text-xs font-black text-green-400 mt-1 block uppercase truncate">
                      {navigationData.cardinalDirection}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      DISTANCE
                    </span>
                    <span className="text-base font-black text-white mt-0.5 block font-mono">
                      {formatDistance(navigationData.distanceNM)}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[10px] font-bold uppercase rounded bg-neutral-950 px-2 py-1.5 border border-neutral-800">
                  <span className="text-neutral-400">
                    BORDER: <strong className={
                      borderSafetyAnalysis.status === 'SAFE' 
                        ? 'text-green-400' 
                        : borderSafetyAnalysis.status === 'CAUTION' 
                          ? 'text-amber-400' 
                          : borderSafetyAnalysis.status === 'DANGER'
                            ? 'text-red-400'
                            : 'text-neutral-400'
                    }>{borderSafetyAnalysis.status === 'SAFE' ? 'SAFE DISTANCE' : borderSafetyAnalysis.status === 'CAUTION' ? 'MAINTAIN DISTANCE' : borderSafetyAnalysis.status === 'DANGER' ? 'CRITICAL PROXIMITY' : 'UNAVAILABLE'}</strong>
                  </span>
                  <span className="text-neutral-400">
                    WAVE: <strong className={
                      waveSafetyAnalysis.status === 'SAFE' 
                        ? 'text-green-400' 
                        : waveSafetyAnalysis.status === 'CAUTION' 
                          ? 'text-amber-400' 
                          : waveSafetyAnalysis.status === 'DANGER'
                            ? 'text-red-400'
                            : 'text-neutral-400'
                    }>{waveSafetyAnalysis.status}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: RETURN GUIDANCE */}
          {activeGuidanceMode === 'RETURN' && (
            <div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                  <div>
                    <span className="text-[10px] font-black text-neutral-300 uppercase block">
                      RETURN TO START
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      தொடக்க இடத்திற்குத் திரும்பு
                    </span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase border ${returnGuidanceData.statusBadge}`}>
                    {returnGuidanceData.statusLabel}
                  </span>
                </div>

                {activeTrip && activeTrip.status === 'ACTIVE' && returnGuidanceData.bearing !== null ? (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          BEARING
                        </span>
                        <span className="text-base font-black text-white mt-0.5 block font-mono">
                          {formatBearing(returnGuidanceData.bearing)}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          DIRECTION
                        </span>
                        <span className="text-xs font-black text-green-400 mt-1 block uppercase truncate">
                          {returnGuidanceData.cardinalDirection}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          DISTANCE
                        </span>
                        <span className="text-base font-black text-white mt-0.5 block font-mono">
                          {formatDistance(returnGuidanceData.distanceNM)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 rounded bg-neutral-950 p-2 border border-neutral-800 text-[10px]">
                      <div className="flex items-center justify-between text-neutral-400 mb-1">
                        <span>START POINT:</span>
                        <span className="font-mono text-neutral-200">
                          {formatLatitude(returnGuidanceData.startLat ?? null)}, {formatLongitude(returnGuidanceData.startLon ?? null)}
                        </span>
                      </div>
                      <div className="text-[9px] font-bold text-neutral-300">
                        GUIDANCE: <span className={
                          returnGuidanceData.status === 'RETURN_PRIORITY'
                            ? 'text-red-400'
                            : returnGuidanceData.status === 'RETURN_CAUTION'
                              ? 'text-amber-300'
                              : 'text-green-400'
                        }>{returnGuidanceData.reason}</span>
                      </div>
                    </div>
                  </div>
                ) : completedTripSummary ? (
                  <div className="rounded bg-neutral-950 p-3 text-center">
                    <span className="text-xs font-bold text-neutral-300 uppercase block">
                      TRIP COMPLETED
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      Return guidance is inactive for completed trips.
                    </span>
                  </div>
                ) : !hasGpsFix ? (
                  <div className="rounded bg-neutral-950 p-3 text-center">
                    <Locate className="h-5 w-5 text-amber-400 mx-auto animate-spin mb-1" />
                    <span className="text-xs font-bold text-amber-300 uppercase block">
                      WAITING FOR GPS SATELLITE FIX
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      Return bearing will calculate once satellite position is established.
                    </span>
                  </div>
                ) : (
                  <div className="rounded bg-neutral-950 p-3 text-center">
                    <Route className="h-5 w-5 text-neutral-600 mx-auto mb-1" />
                    <span className="text-xs font-bold text-neutral-400 uppercase block">
                      RETURN GUIDANCE UNAVAILABLE
                    </span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      Start a trip to record your departure coordinate for safe return navigation.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode 3: SAFETY PRIORITY MODE */}
          {activeGuidanceMode === 'SAFETY' && (
            <div>
              <div className={`rounded-lg border p-3 ${
                combinedSafetyAnalysis.overallStatus === 'SAFE'
                  ? 'border-green-500/40 bg-green-950/20'
                  : combinedSafetyAnalysis.overallStatus === 'CAUTION'
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : combinedSafetyAnalysis.overallStatus === 'DANGER'
                      ? 'border-red-500/40 bg-red-950/30'
                      : 'border-neutral-800 bg-neutral-900'
              }`}>
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5 mb-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-neutral-300 block">
                      SAFETY STATUS GUIDANCE
                    </span>
                    <span className="text-[8px] font-bold text-neutral-400">
                      பாதுகாப்பு முன்னுரிமை
                    </span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase border ${safetyConfig.badgeBg}`}>
                    {combinedSafetyAnalysis.overallStatus}
                  </span>
                </div>

                <div className="text-xs font-black uppercase text-white mb-1">
                  {actionableGuidance.primary}
                </div>
                <div className="text-[11px] font-bold text-neutral-300 mb-2">
                  {actionableGuidance.secondary}
                </div>

                <div className="rounded bg-neutral-950/90 border border-neutral-800 p-2 text-[10px] mb-2">
                  <div className="flex items-center justify-between font-bold uppercase mb-1">
                    <span className="text-neutral-400">CURRENT RISK:</span>
                    <span className={
                      combinedSafetyAnalysis.riskLevel === 'LOW'
                        ? 'text-green-400'
                        : combinedSafetyAnalysis.riskLevel === 'MODERATE'
                          ? 'text-amber-400'
                          : combinedSafetyAnalysis.riskLevel === 'HIGH'
                            ? 'text-red-400'
                            : 'text-neutral-400'
                    }>
                      {combinedSafetyAnalysis.riskScore !== null ? `${combinedSafetyAnalysis.riskScore}/100 • ${combinedSafetyAnalysis.riskLevel}` : 'UNAVAILABLE'}
                    </span>
                  </div>
                  <div className="text-neutral-300 leading-tight">
                    <strong>BORDER ACTION:</strong> {borderSafetyAnalysis.explanation}
                  </div>
                </div>

                <ul className="space-y-1 text-[10px] text-neutral-300">
                  {actionableGuidance.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-1 leading-snug">
                      <ArrowRight className="h-3 w-3 text-neutral-400 shrink-0 mt-0.5" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Route Safety Warning & Prototype Disclaimer */}
          <div className="mt-2.5 rounded border border-amber-900/60 bg-amber-950/25 px-2.5 py-1.5 text-center">
            <p className="text-[9px] font-bold text-amber-300 leading-tight">
              ⚠ DIRECT BEARING DOES NOT GUARANTEE A SAFE ROUTE.
              <br />
              <span className="text-[8px] text-amber-400/90">நேரடி திசை பாதுகாப்பான பாதைக்கு உத்தரவாதமல்ல.</span>
            </p>
          </div>

          <div className="mt-1 text-center">
            <p className="text-[8px] font-medium text-neutral-400 leading-tight">
              THIS IS PROTOTYPE LOCAL GUIDANCE — NOT CERTIFIED MARINE NAVIGATION.
              <br />
              <span>இது முன்மாதிரி உள்ளூர் வழிகாட்டுதல் மட்டுமே — அதிகாரப்பூர்வ கடல் வழிசெலுத்தல் அல்ல.</span>
            </p>
          </div>
        </section>

        {/* PHASE 13: LOCAL SAFETY ZONES + ROUTE RISK VISUALIZATION */}
        <section
          aria-label="Local Safety Map and Route Risk Visualization"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  LOCAL SAFETY MAP
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  உள்ளூர் பாதுகாப்பு நிலை
                </span>
              </div>
            </div>

            {/* Quick Risk Indicator Pill */}
            <div className="flex items-center gap-1.5">
              <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase border ${routeRiskAnalysis.statusBadge}`}>
                {routeRiskAnalysis.statusLabel}
              </span>
            </div>
          </div>

          {/* Border + PFZ Critical Conflict Banner */}
          {borderSafetyAnalysis.status === 'DANGER' && activeGuidanceMode === 'PFZ' && (
            <div className="mb-2.5 rounded-lg border-2 border-red-500 bg-red-950/70 p-2.5 text-center animate-pulse">
              <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase text-red-300">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span>SAFETY PRIORITY: CRITICAL BORDER PROXIMITY</span>
              </div>
              <p className="text-[10px] font-bold text-white mt-0.5">
                ACTION: MOVE AWAY FROM BORDER BEFORE CONTINUING TO PFZ.
              </p>
              <p className="text-[9px] font-bold text-red-300/90 mt-0.5">
                பாதுகாப்பு முன்னுரிமை: எல்லைக்கு மிக அருகில் ஆபத்து
                <br />
                செயல்: PFZ நோக்கி தொடர்வதற்கு முன் எல்லையிலிருந்து விலகவும்.
              </p>
            </div>
          )}

          {/* Phase 17: Offline Data Validation Warning on Map */}
          {dataPackageValidationSummary.isIncomplete && (
            <div className="mb-2.5 rounded border border-red-500/50 bg-red-950/40 p-2 text-center">
              <span className="text-[10px] font-black uppercase text-red-300">
                OFFLINE DATA VALIDATION WARNING — REQUIRED CACHE DATA INCOMPLETE
              </span>
              <span className="block text-[8px] text-red-400/90 mt-0.5">
                உள்ளூர் தரவு சரிபார்ப்பு எச்சரிக்கை — தேவையான தரவு முழுமையற்றது
              </span>
            </div>
          )}

          {/* Phase 16: Data Freshness Warning on Map */}
          {cacheHealthSummary.hasStale && (
            <div className="mb-2.5 rounded border border-amber-500/50 bg-amber-950/40 p-2 text-center">
              <span className="text-[10px] font-black uppercase text-amber-300">
                DATA AGE WARNING — MAP RELIES ON LOCALLY CACHED DATA (&gt; 24H OLD)
              </span>
              <span className="block text-[8px] text-amber-400/90 mt-0.5">
                தரவு காலாவதியானது — வரைபடம் பழைய தரவைப் பயன்படுத்துகிறது
              </span>
            </div>
          )}

          {/* SVG Visual Canvas */}
          <div className="relative rounded-lg border border-neutral-800 bg-neutral-900/90 p-2 overflow-hidden flex items-center justify-center min-h-[260px]">
            {safetyMapSvgData ? (
              <svg
                viewBox={`0 0 ${safetyMapSvgData.svgWidth} ${safetyMapSvgData.svgHeight}`}
                className="w-full h-auto select-none"
                aria-label="Local Safety Diagram"
                role="img"
              >
                {/* Background Radar / Marine Grid Pattern */}
                <defs>
                  <radialGradient id="vesselHaloGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={routeRiskAnalysis.riskColor} stopOpacity="0.4" />
                    <stop offset="100%" stopColor={routeRiskAnalysis.riskColor} stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="dangerZoneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="20" y1="65" x2="340" y2="65" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="20" y1="130" x2="340" y2="130" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="20" y1="195" x2="340" y2="195" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="90" y1="20" x2="90" y2="240" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="180" y1="20" x2="180" y2="240" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="270" y1="20" x2="270" y2="240" stroke="#262626" strokeWidth="1" strokeDasharray="3 3" />

                {/* Cardinal Direction Indicators */}
                <g className="font-mono text-[9px] font-black" fill="#525252">
                  <text x="180" y="14" textAnchor="middle" fill="#22c55e">N ▲</text>
                  <text x="350" y="133" textAnchor="end">E ▶</text>
                  <text x="180" y="254" textAnchor="middle">S ▼</text>
                  <text x="10" y="133" textAnchor="start">◀ W</text>
                </g>

                {/* Border Reference Lines */}
                {safetyMapSvgData.borderPaths.map((bp, idx) => (
                  <g key={`border-path-${idx}`}>
                    {/* Border Danger Buffer Zone */}
                    <path
                      d={bp.pathD}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="14"
                      strokeOpacity="0.12"
                      strokeLinecap="round"
                    />
                    {/* Border Reference Core Line */}
                    <path
                      d={bp.pathD}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                    {bp.coords.length > 0 && (
                      <text
                        x={bp.coords[Math.floor(bp.coords.length / 2)].x}
                        y={bp.coords[Math.floor(bp.coords.length / 2)].y - 6}
                        fill="#f87171"
                        fontSize="8"
                        fontWeight="900"
                        textAnchor="middle"
                        className="font-sans"
                      >
                        BORDER REFERENCE
                      </text>
                    )}
                  </g>
                ))}

                {/* Direct Guidance Route Line (PFZ or RETURN) */}
                {safetyMapSvgData.vesselPt && (
                  <>
                    {/* Mode: PFZ GUIDANCE LINE */}
                    {activeGuidanceMode === 'PFZ' && safetyMapSvgData.pfzPt && (
                      <g>
                        <line
                          x1={safetyMapSvgData.vesselPt.x}
                          y1={safetyMapSvgData.vesselPt.y}
                          x2={safetyMapSvgData.pfzPt.x}
                          y2={safetyMapSvgData.pfzPt.y}
                          stroke={routeRiskAnalysis.isDanger ? '#ef4444' : routeRiskAnalysis.isCaution ? '#f59e0b' : '#22c55e'}
                          strokeWidth="2"
                          strokeDasharray="4 3"
                        />
                        {/* Midpoint Bearing Badge */}
                        <text
                          x={(safetyMapSvgData.vesselPt.x + safetyMapSvgData.pfzPt.x) / 2}
                          y={(safetyMapSvgData.vesselPt.y + safetyMapSvgData.pfzPt.y) / 2 - 4}
                          fill={routeRiskAnalysis.isDanger ? '#f87171' : routeRiskAnalysis.isCaution ? '#fcd34d' : '#4ade80'}
                          fontSize="7.5"
                          fontWeight="900"
                          textAnchor="middle"
                        >
                          {routeRiskAnalysis.isDanger ? 'SAFETY PRIORITY' : 'PFZ GUIDANCE'}
                        </text>
                      </g>
                    )}

                    {/* Mode: RETURN GUIDANCE LINE */}
                    {activeGuidanceMode === 'RETURN' && safetyMapSvgData.tripStartPt && (
                      <g>
                        <line
                          x1={safetyMapSvgData.vesselPt.x}
                          y1={safetyMapSvgData.vesselPt.y}
                          x2={safetyMapSvgData.tripStartPt.x}
                          y2={safetyMapSvgData.tripStartPt.y}
                          stroke={routeRiskAnalysis.isDanger ? '#ef4444' : '#a855f7'}
                          strokeWidth="2"
                          strokeDasharray="4 3"
                        />
                        <text
                          x={(safetyMapSvgData.vesselPt.x + safetyMapSvgData.tripStartPt.x) / 2}
                          y={(safetyMapSvgData.vesselPt.y + safetyMapSvgData.tripStartPt.y) / 2 - 4}
                          fill={routeRiskAnalysis.isDanger ? '#f87171' : '#c084fc'}
                          fontSize="7.5"
                          fontWeight="900"
                          textAnchor="middle"
                        >
                          {routeRiskAnalysis.isDanger ? 'SAFETY PRIORITY' : 'RETURN GUIDANCE'}
                        </text>
                      </g>
                    )}
                  </>
                )}

                {/* TRIP START MARKER */}
                {safetyMapSvgData.tripStartPt && (
                  <g>
                    <circle
                      cx={safetyMapSvgData.tripStartPt.x}
                      cy={safetyMapSvgData.tripStartPt.y}
                      r="10"
                      fill="#581c87"
                      fillOpacity="0.4"
                    />
                    <circle
                      cx={safetyMapSvgData.tripStartPt.x}
                      cy={safetyMapSvgData.tripStartPt.y}
                      r="5"
                      fill="#a855f7"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={safetyMapSvgData.tripStartPt.x}
                      y={safetyMapSvgData.tripStartPt.y + 14}
                      fill="#d8b4fe"
                      fontSize="8"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      TRIP START
                    </text>
                  </g>
                )}

                {/* PFZ HOTSPOT MARKER */}
                {safetyMapSvgData.pfzPt && (
                  <g>
                    <circle
                      cx={safetyMapSvgData.pfzPt.x}
                      cy={safetyMapSvgData.pfzPt.y}
                      r="12"
                      fill="#14532d"
                      fillOpacity="0.5"
                      stroke="#22c55e"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={safetyMapSvgData.pfzPt.x}
                      cy={safetyMapSvgData.pfzPt.y}
                      r="5"
                      fill="#22c55e"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <text
                      x={safetyMapSvgData.pfzPt.x}
                      y={safetyMapSvgData.pfzPt.y - 8}
                      fill="#86efac"
                      fontSize="8"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      PFZ HOTSPOT
                    </text>
                  </g>
                )}

                {/* CURRENT VESSEL POSITION MARKER */}
                {safetyMapSvgData.vesselPt ? (
                  <g>
                    {/* Risk Halo Ring */}
                    <circle
                      cx={safetyMapSvgData.vesselPt.x}
                      cy={safetyMapSvgData.vesselPt.y}
                      r="15"
                      fill="url(#vesselHaloGrad)"
                    />
                    <circle
                      cx={safetyMapSvgData.vesselPt.x}
                      cy={safetyMapSvgData.vesselPt.y}
                      r="10"
                      fill="none"
                      stroke={routeRiskAnalysis.riskColor}
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    {/* Vessel Core Circle */}
                    <circle
                      cx={safetyMapSvgData.vesselPt.x}
                      cy={safetyMapSvgData.vesselPt.y}
                      r="5.5"
                      fill={routeRiskAnalysis.riskColor}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={safetyMapSvgData.vesselPt.x}
                      y={safetyMapSvgData.vesselPt.y + 16}
                      fill="#ffffff"
                      fontSize="8.5"
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      CURRENT POSITION
                    </text>
                  </g>
                ) : (
                  /* GPS Lost / Searching Overlay in SVG */
                  <g>
                    <rect x="50" y="95" width="260" height="70" rx="8" fill="#171717" fillOpacity="0.9" stroke="#f59e0b" strokeWidth="1" />
                    <text x="180" y="125" fill="#fcd34d" fontSize="10" fontWeight="900" textAnchor="middle">
                      GPS SIGNAL LOST • GPS சிக்னல் இல்லை
                    </text>
                    <text x="180" y="145" fill="#9ca3af" fontSize="8.5" fontWeight="bold" textAnchor="middle">
                      WAITING FOR GPS FIX • WAITING FOR SATELLITE LOCK
                    </text>
                  </g>
                )}
              </svg>
            ) : (
              <div className="text-center p-4">
                <Locate className="h-6 w-6 text-neutral-500 mx-auto mb-1 animate-spin" />
                <span className="text-xs font-black text-neutral-400 uppercase block">
                  SAFETY MAP DATA UNAVAILABLE
                </span>
                <span className="text-[10px] text-neutral-400 mt-0.5 block">
                  Pre-departure cache or GPS lock required for local safety visualization.
                </span>
              </div>
            )}
          </div>

          {/* Map Legend / Coordinate Summary */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] font-mono font-bold">
            <div className="flex items-center justify-between rounded bg-neutral-900 px-2 py-1 border border-neutral-800 text-neutral-300">
              <span className="text-neutral-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: routeRiskAnalysis.riskColor }}></span>
                CURRENT:
              </span>
              <span>{hasGpsFix && latitude !== null && longitude !== null ? `${formatLatitude(latitude)}, ${formatLongitude(longitude)}` : 'NO GPS FIX'}</span>
            </div>

            <div className="flex items-center justify-between rounded bg-neutral-900 px-2 py-1 border border-neutral-800 text-neutral-300">
              <span className="text-neutral-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-purple-500 inline-block"></span>
                TRIP START:
              </span>
              <span>
                {activeTrip && activeTrip.startLatitude != null && activeTrip.startLongitude != null
                  ? `${formatLatitude(activeTrip.startLatitude)}, ${formatLongitude(activeTrip.startLongitude)}`
                  : 'NO ACTIVE TRIP'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded bg-neutral-900 px-2 py-1 border border-neutral-800 text-neutral-300">
              <span className="text-neutral-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
                PFZ HOTSPOT:
              </span>
              <span className="truncate max-w-[100px]">{activeHotspot ? activeHotspot.name : 'NO PFZ'}</span>
            </div>

            <div className="flex items-center justify-between rounded bg-neutral-900 px-2 py-1 border border-neutral-800 text-neutral-300">
              <span className="text-neutral-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500 inline-block"></span>
                BORDER:
              </span>
              <span className={
                borderSafetyAnalysis.status === 'SAFE' 
                  ? 'text-green-400' 
                  : borderSafetyAnalysis.status === 'CAUTION' 
                    ? 'text-amber-400' 
                    : borderSafetyAnalysis.status === 'DANGER'
                      ? 'text-red-400'
                      : 'text-neutral-400'
              }>
                {formatDistance(borderSafetyAnalysis.distanceNM)}
              </span>
            </div>
          </div>

          {/* LOCAL ROUTE STATUS SUMMARY CARD */}
          <div className="mt-3 border-t border-neutral-800 pt-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                <div>
                  <h3 className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                    LOCAL ROUTE STATUS
                  </h3>
                  <span className="text-[8px] font-bold text-neutral-400">
                    உள்ளூர் பாதை நிலை
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase border ${routeRiskAnalysis.statusBadge}`}>
                    {routeRiskAnalysis.statusLabel}
                  </span>
                </div>
              </div>

              {/* Status Action & Risk Score */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black uppercase">
                  <span className="text-white flex items-center gap-1">
                    {routeRiskAnalysis.riskText}
                  </span>
                  <span className={
                    combinedSafetyAnalysis.riskLevel === 'LOW'
                      ? 'text-green-400'
                      : combinedSafetyAnalysis.riskLevel === 'MODERATE'
                        ? 'text-amber-400'
                        : combinedSafetyAnalysis.riskLevel === 'HIGH'
                          ? 'text-red-400'
                          : 'text-neutral-400'
                  }>
                    RISK SCORE {combinedSafetyAnalysis.riskScore !== null ? `${combinedSafetyAnalysis.riskScore} / 100` : '-- / 100'}
                  </span>
                </div>

                <p className="text-[10px] font-bold text-neutral-300 leading-snug">
                  {routeRiskAnalysis.actionText}
                </p>
                <p className="text-[9px] font-semibold text-neutral-400 leading-snug">
                  {routeRiskAnalysis.actionTextTamil}
                </p>
              </div>

              {/* Zone Breakdown Pills */}
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-center text-[9px] font-bold">
                <div className={`rounded p-1.5 border ${
                  safetyZonesData.borderZone === 'SAFE'
                    ? 'border-green-800/60 bg-green-950/40 text-green-400'
                    : safetyZonesData.borderZone === 'CAUTION'
                      ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                      : safetyZonesData.borderZone === 'DANGER'
                        ? 'border-red-800/60 bg-red-950/40 text-red-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                }`}>
                  <span className="block text-[8px] text-neutral-400 uppercase">BORDER SAFETY ZONE</span>
                  <span className="block mt-0.5">{safetyZonesData.borderZoneText}</span>
                </div>

                <div className={`rounded p-1.5 border ${
                  safetyZonesData.waveZone === 'SAFE'
                    ? 'border-green-800/60 bg-green-950/40 text-green-400'
                    : safetyZonesData.waveZone === 'CAUTION'
                      ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                      : safetyZonesData.waveZone === 'DANGER'
                        ? 'border-red-800/60 bg-red-950/40 text-red-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                }`}>
                  <span className="block text-[8px] text-neutral-400 uppercase">WAVE RISK ZONE</span>
                  <span className="block mt-0.5">{safetyZonesData.waveZoneText}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Prototype Guidance Warnings */}
          <div className="mt-2.5 rounded border border-amber-900/60 bg-amber-950/25 px-2.5 py-1.5 text-center">
            <p className="text-[9px] font-bold text-amber-300 leading-tight">
              ⚠ DIRECT BEARING DOES NOT GUARANTEE A SAFE ROUTE.
              <br />
              <span className="text-[8px] text-amber-400/90">நேரடி திசை பாதுகாப்பான பாதைக்கு உத்தரவாதமல்ல.</span>
            </p>
          </div>

          <div className="mt-1 text-center">
            <p className="text-[8px] font-medium text-neutral-400 leading-tight">
              THIS IS PROTOTYPE LOCAL GUIDANCE — NOT CERTIFIED MARINE NAVIGATION.
              <br />
              <span>இது முன்மாதிரி உள்ளூர் வழிகாட்டுதல் மட்டுமே — அதிகாரப்பூர்வ கடல் வழிசெலுத்தல் அல்ல.</span>
            </p>
          </div>
        </section>

        {/* PHASE 14: OFFLINE VOYAGE SAFETY ADVISORY + TRIP REPORTING */}
        <section
          aria-label="Offline Voyage Safety Report and Advisory"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-green-400" aria-hidden="true" />
              <div>
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase leading-none">
                  VOYAGE SAFETY REPORT
                </h2>
                <span className="text-[9px] font-bold text-neutral-400">
                  பயண பாதுகாப்பு அறிக்கை
                </span>
              </div>
            </div>

            {/* Overall Voyage Safety Status Badge */}
            <div className="flex items-center gap-1.5">
              <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase border ${voyageSafetyReportData.overallBadge}`}>
                {voyageSafetyReportData.overallStatusLabel}
              </span>
            </div>
          </div>

          {/* ACTIVE TRIP LIVE SUMMARY VIEW */}
          {voyageSafetyReportData.isTripActive ? (
            <div>
              <div className="rounded-lg border border-green-500/40 bg-green-950/20 p-3 mb-3">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5 mb-2">
                  <div className="flex items-center gap-1.5 text-green-400">
                    <Activity className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      LIVE VOYAGE SUMMARY
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-neutral-400">
                    நடப்பு பயண சுருக்கம்
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      DURATION
                    </span>
                    <span className="text-xs font-black text-green-400 mt-0.5 block font-mono">
                      {voyageSafetyReportData.durationFormatted}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      DISTANCE
                    </span>
                    <span className="text-xs font-black text-white mt-0.5 block font-mono">
                      {voyageSafetyReportData.distanceFormatted}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      GPS POINTS
                    </span>
                    <span className="text-xs font-black text-white mt-0.5 block font-mono">
                      {voyageSafetyReportData.pointCount}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      AVG SPEED
                    </span>
                    <span className="text-xs font-black text-white mt-0.5 block font-mono">
                      {voyageSafetyReportData.avgSpeed}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      MAX SPEED
                    </span>
                    <span className="text-xs font-black text-green-400 mt-0.5 block font-mono">
                      {voyageSafetyReportData.maxSpeed}
                    </span>
                  </div>

                  <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
                    <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                      PEAK RISK
                    </span>
                    <span className="text-xs font-black text-white mt-0.5 block font-mono">
                      {voyageSafetyReportData.highestRiskScore}
                    </span>
                  </div>
                </div>

                {/* Risk Exposure Breakdown in Live Mode */}
                <div className="mt-2.5 rounded bg-neutral-900 p-2 border border-neutral-800">
                  <span className="block text-[9px] font-bold text-neutral-400 uppercase mb-1">
                    LIVE RISK EXPOSURE (LOCAL TIME)
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono font-bold">
                    <div className="rounded bg-green-950/40 border border-green-500/40 py-1 text-green-400">
                      <span className="block text-[8px] uppercase">SAFE</span>
                      <span>{voyageSafetyReportData.safeExposure}</span>
                    </div>
                    <div className="rounded bg-amber-950/40 border border-amber-500/40 py-1 text-amber-300">
                      <span className="block text-[8px] uppercase">CAUTION</span>
                      <span>{voyageSafetyReportData.cautionExposure}</span>
                    </div>
                    <div className="rounded bg-red-950/40 border border-red-500/40 py-1 text-red-400">
                      <span className="block text-[8px] uppercase">DANGER</span>
                      <span>{voyageSafetyReportData.dangerExposure}</span>
                    </div>
                  </div>
                </div>

                {/* Phase 15: Local Alert Summary in Live Mode */}
                <div className="mt-2.5 rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Bell className="h-3 w-3 text-green-400" />
                      <span className="text-[9px] font-black uppercase text-neutral-300 tracking-wider">
                        LOCAL ALERT SUMMARY
                      </span>
                    </div>
                    <span className="text-[8px] font-bold text-neutral-400">
                      உள்ளூர் எச்சரிக்கை சுருக்கம்
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1 text-center font-bold">
                    <div className="rounded border border-neutral-800 bg-neutral-950 p-1">
                      <span className="block text-[7px] uppercase text-neutral-400">TOTAL</span>
                      <span className="text-[11px] font-mono font-black text-white block">
                        {voyageSafetyReportData.alertSummary.total}
                      </span>
                    </div>
                    <div className="rounded border border-red-500/40 bg-red-950/30 p-1">
                      <span className="block text-[7px] uppercase text-red-300">CRITICAL</span>
                      <span className="text-[11px] font-mono font-black text-red-400 block">
                        {voyageSafetyReportData.alertSummary.critical}
                      </span>
                    </div>
                    <div className="rounded border border-amber-500/40 bg-amber-950/30 p-1">
                      <span className="block text-[7px] uppercase text-amber-300">HIGH</span>
                      <span className="text-[11px] font-mono font-black text-amber-400 block">
                        {voyageSafetyReportData.alertSummary.high}
                      </span>
                    </div>
                    <div className="rounded border border-amber-500/30 bg-neutral-950 p-1">
                      <span className="block text-[7px] uppercase text-amber-300/80">ADVISORY</span>
                      <span className="text-[11px] font-mono font-black text-amber-300 block">
                        {voyageSafetyReportData.alertSummary.advisory}
                      </span>
                    </div>
                    <div className="rounded border border-green-500/30 bg-neutral-950 p-1">
                      <span className="block text-[7px] uppercase text-green-400">INFO</span>
                      <span className="text-[11px] font-mono font-black text-green-400 block">
                        {voyageSafetyReportData.alertSummary.info}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-center text-[10px] text-neutral-400 font-medium">
                  Voyage is in progress. Complete trip via Trip Monitor to generate final safety advisory & report.
                </div>
              </div>
            </div>
          ) : (
            /* COMPLETED VOYAGES REPORT VIEW */
            <div>
              {/* Trip Selector */}
              {voyageSafetyReportData.completedTrips.length > 0 ? (
                <div className="mb-3">
                  <label htmlFor="report-trip-select" className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">
                    SELECT COMPLETED VOYAGE
                  </label>
                  <div className="relative">
                    <select
                      id="report-trip-select"
                      value={selectedReportTripId || voyageSafetyReportData.selectedSession?.tripId || ''}
                      onChange={(e) => setSelectedReportTripId(e.target.value)}
                      className="w-full appearance-none rounded border border-neutral-700 bg-neutral-900 px-3 py-2 pr-8 text-xs font-black text-green-400 uppercase tracking-wide focus:border-green-500 focus:outline-none cursor-pointer"
                      aria-label="Select completed voyage to review safety report"
                    >
                      {voyageSafetyReportData.completedTrips.map((trip, idx) => {
                        const dateStr = new Date(trip.startTime).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                        const timeStr = formatTimeHHMM(trip.startTime);
                        return (
                          <option key={trip.tripId} value={trip.tripId}>
                            VOYAGE {String(voyageSafetyReportData.completedTrips.length - idx).padStart(3, '0')} • {dateStr} {timeStr} ({trip.totalDistanceNm.toFixed(1)} NM)
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                  </div>
                </div>
              ) : null}

              {voyageSafetyReportData.selectedSession ? (
                <div className="space-y-3">
                  {/* 1. VOYAGE SUMMARY METRICS */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                        VOYAGE SUMMARY
                      </span>
                      <span className="text-[8px] font-bold text-neutral-400">
                        பயண சுருக்கம்
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          DURATION
                        </span>
                        <span className="text-xs font-black text-white mt-0.5 block font-mono">
                          {voyageSafetyReportData.durationFormatted}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          DISTANCE
                        </span>
                        <span className="text-xs font-black text-green-400 mt-0.5 block font-mono">
                          {voyageSafetyReportData.distanceFormatted}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          GPS POINTS
                        </span>
                        <span className="text-xs font-black text-white mt-0.5 block font-mono">
                          {voyageSafetyReportData.pointCount}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          AVG SPEED
                        </span>
                        <span className="text-xs font-black text-white mt-0.5 block font-mono">
                          {voyageSafetyReportData.avgSpeed}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          MAX SPEED
                        </span>
                        <span className="text-xs font-black text-green-400 mt-0.5 block font-mono">
                          {voyageSafetyReportData.maxSpeed}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                        <span className="block text-[9px] font-bold text-neutral-400 uppercase">
                          PEAK RISK
                        </span>
                        <span className="text-xs font-black text-white mt-0.5 block font-mono">
                          {voyageSafetyReportData.highestRiskScore}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. RISK EXPOSURE BREAKDOWN */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                        RISK EXPOSURE
                      </span>
                      <span className="text-[8px] font-bold text-neutral-400">
                        ஆபத்து நிலை கால அளவு
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono font-bold">
                      <div className="rounded border border-green-500/40 bg-green-950/30 p-2 text-green-400">
                        <span className="block text-[9px] uppercase font-sans text-green-300">SAFE</span>
                        <span className="text-xs block mt-0.5">{voyageSafetyReportData.safeExposure}</span>
                      </div>

                      <div className="rounded border border-amber-500/40 bg-amber-950/30 p-2 text-amber-300">
                        <span className="block text-[9px] uppercase font-sans text-amber-200">CAUTION</span>
                        <span className="text-xs block mt-0.5">{voyageSafetyReportData.cautionExposure}</span>
                      </div>

                      <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-red-400">
                        <span className="block text-[9px] uppercase font-sans text-red-300">DANGER</span>
                        <span className="text-xs block mt-0.5">{voyageSafetyReportData.dangerExposure}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. SAFETY EVENT SUMMARY & RELIABILITY */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                        SAFETY EVENTS & RELIABILITY
                      </span>
                      <span className="text-[8px] font-bold text-neutral-400">
                        பாதுகாப்பு நிகழ்வுகள்
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-between">
                        <span className="text-neutral-400 uppercase">DANGER EVENTS</span>
                        <span className={voyageSafetyReportData.dangerCount > 0 ? 'text-red-400 font-mono text-xs' : 'text-neutral-300 font-mono'}>
                          {voyageSafetyReportData.dangerCount}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-between">
                        <span className="text-neutral-400 uppercase">CAUTION EVENTS</span>
                        <span className={voyageSafetyReportData.cautionCount > 0 ? 'text-amber-300 font-mono text-xs' : 'text-neutral-300 font-mono'}>
                          {voyageSafetyReportData.cautionCount}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-between">
                        <span className="text-neutral-400 uppercase">GPS LOSS EVENTS</span>
                        <span className={voyageSafetyReportData.gpsLossCount > 0 ? 'text-amber-300 font-mono text-xs' : 'text-neutral-300 font-mono'}>
                          {voyageSafetyReportData.gpsLossCount}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-2 flex items-center justify-between">
                        <div>
                          <span className="text-neutral-400 uppercase block">SOS EVENTS</span>
                          <span className="text-[8px] text-neutral-400 block">சாதனத்தில் பதிவு</span>
                        </div>
                        <span className={voyageSafetyReportData.sosCount > 0 ? 'text-red-400 font-mono text-xs' : 'text-neutral-300 font-mono'}>
                          {voyageSafetyReportData.sosCount}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded bg-neutral-950 p-2 border border-neutral-800">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">BORDER SAFETY</span>
                        <span className="text-[10px] font-black text-white block mt-0.5">{voyageSafetyReportData.borderStatus}</span>
                        <span className="text-[8px] text-neutral-400 block mt-0.5">CLOSEST: {voyageSafetyReportData.closestBorderDist}</span>
                      </div>

                      <div className="rounded bg-neutral-950 p-2 border border-neutral-800">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">GPS RELIABILITY</span>
                        <span className="text-[10px] font-black text-green-400 block mt-0.5">{voyageSafetyReportData.gpsReliability}</span>
                        <span className="text-[8px] text-neutral-400 block mt-0.5">{voyageSafetyReportData.pointCount} TRACK POINTS</span>
                      </div>
                    </div>
                  </div>

                  {/* Phase 15: LOCAL ALERT SUMMARY */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Bell className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                          LOCAL ALERT SUMMARY
                        </span>
                      </div>
                      <span className="text-[8px] font-bold text-neutral-400">
                        உள்ளூர் எச்சரிக்கை சுருக்கம்
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 text-center font-bold">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">TOTAL</span>
                        <span className="text-xs font-mono font-black text-white mt-0.5 block">
                          {voyageSafetyReportData.alertSummary.total}
                        </span>
                      </div>
                      <div className="rounded border border-red-500/40 bg-red-950/30 p-1.5">
                        <span className="block text-[8px] uppercase text-red-300">CRITICAL</span>
                        <span className="text-xs font-mono font-black text-red-400 mt-0.5 block">
                          {voyageSafetyReportData.alertSummary.critical}
                        </span>
                      </div>
                      <div className="rounded border border-amber-500/40 bg-amber-950/30 p-1.5">
                        <span className="block text-[8px] uppercase text-amber-300">HIGH</span>
                        <span className="text-xs font-mono font-black text-amber-400 mt-0.5 block">
                          {voyageSafetyReportData.alertSummary.high}
                        </span>
                      </div>
                      <div className="rounded border border-amber-500/30 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-amber-300/80">ADVISORY</span>
                        <span className="text-xs font-mono font-black text-amber-300 mt-0.5 block">
                          {voyageSafetyReportData.alertSummary.advisory}
                        </span>
                      </div>
                      <div className="rounded border border-green-500/30 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-green-400">INFO</span>
                        <span className="text-xs font-mono font-black text-green-400 mt-0.5 block">
                          {voyageSafetyReportData.alertSummary.info}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Phase 16: DATA HEALTH SUMMARY */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                          DATA HEALTH SUMMARY
                        </span>
                      </div>
                      <span className="text-[8px] font-bold text-neutral-400">
                        தரவு நிலை சுருக்கம்
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center font-bold">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">WAVE DATA</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataHealth.waveData === 'FRESH'
                            ? 'text-green-400'
                            : voyageSafetyReportData.dataHealth.waveData === 'AGING'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataHealth.waveData}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">PFZ DATA</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataHealth.pfzData === 'FRESH'
                            ? 'text-green-400'
                            : voyageSafetyReportData.dataHealth.pfzData === 'AGING'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataHealth.pfzData}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">BORDER DATA</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataHealth.borderData === 'FRESH'
                            ? 'text-green-400'
                            : voyageSafetyReportData.dataHealth.borderData === 'AGING'
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataHealth.borderData}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Phase 17: DATA PACKAGE VALIDATION SUMMARY */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <div className="flex items-center gap-1.5">
                        <ClipboardCheck className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                          DATA PACKAGE VALIDATION SUMMARY
                        </span>
                      </div>
                      <span className="text-[8px] font-bold text-neutral-400">
                        தரவு தொகுப்பு சரிபார்ப்பு சுருக்கம்
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center font-bold">
                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">WAVE</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataPackageValidation.waveStatus === 'PASS'
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataPackageValidation.waveStatus}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">PFZ</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataPackageValidation.pfzStatus === 'PASS'
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataPackageValidation.pfzStatus}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">BORDER</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataPackageValidation.borderStatus === 'PASS'
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataPackageValidation.borderStatus}
                        </span>
                      </div>

                      <div className="rounded border border-neutral-800 bg-neutral-950 p-1.5">
                        <span className="block text-[8px] uppercase text-neutral-400">SYNC</span>
                        <span className={`text-[9px] font-black block mt-0.5 ${
                          voyageSafetyReportData.dataPackageValidation.syncStatus === 'PASS'
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {voyageSafetyReportData.dataPackageValidation.syncStatus}
                        </span>
                      </div>
                    </div>

                    {!voyageSafetyReportData.dataPackageValidation.isValid && (
                      <div className="mt-2 text-center rounded border border-amber-900/60 bg-amber-950/30 p-1.5">
                        <p className="text-[9px] font-bold text-amber-300 uppercase">
                          DATA QUALITY WAS INCOMPLETE DURING THIS VOYAGE
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 4. SAFETY EVENT TIMELINE */}
                  {voyageSafetyReportData.timeline && voyageSafetyReportData.timeline.length > 0 && (
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                        <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                          SAFETY EVENT TIMELINE
                        </span>
                        <span className="text-[8px] font-bold text-neutral-400">
                          நிகழ்வு காலவரிசை
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {voyageSafetyReportData.timeline.map((item, idx) => (
                          <div
                            key={`report-timeline-${idx}`}
                            className="flex items-center justify-between rounded border border-neutral-800/80 bg-neutral-950 px-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-2 overflow-hidden pr-2">
                              <span className="font-mono text-[9px] text-neutral-400 shrink-0 font-bold">
                                {item.time}
                              </span>
                              <span className="truncate text-[10px] font-semibold text-neutral-200">
                                {item.label}
                              </span>
                            </div>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase border ${
                              item.type === 'DANGER'
                                ? 'border-red-500/50 bg-red-950/60 text-red-400'
                                : item.type === 'CAUTION'
                                  ? 'border-amber-500/50 bg-amber-950/60 text-amber-300'
                                  : item.type === 'SAFE'
                                    ? 'border-green-500/50 bg-green-950/60 text-green-400'
                                    : 'border-neutral-700 bg-neutral-800 text-neutral-400'
                            }`}>
                              {item.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 5. VOYAGE SAFETY ADVISORY */}
                  <div className={`rounded-lg border p-3 ${
                    voyageSafetyReportData.overallStatus === 'VOYAGE_HIGH_RISK'
                      ? 'border-red-500/50 bg-red-950/25'
                      : voyageSafetyReportData.overallStatus === 'VOYAGE_CAUTION'
                        ? 'border-amber-500/50 bg-amber-950/25'
                        : 'border-green-500/50 bg-green-950/20'
                  }`}>
                    <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-300">
                        SAFETY ADVISORY
                      </span>
                      <span className="text-[8px] font-bold text-neutral-400">
                        பாதுகாப்பு ஆலோசனை
                      </span>
                    </div>

                    <p className="text-xs font-black uppercase text-white leading-snug mb-1">
                      {voyageSafetyReportData.advisoryPrimary}
                    </p>
                    <p className="text-[10px] font-semibold text-neutral-300 leading-snug">
                      {voyageSafetyReportData.advisoryTamil}
                    </p>
                  </div>

                  {/* 6. BEFORE NEXT DEPARTURE RECOMMENDATIONS */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase text-neutral-300 tracking-wider">
                        BEFORE NEXT DEPARTURE
                      </span>
                      <span className="text-[8px] font-bold text-neutral-400">
                        அடுத்த புறப்பாட்டிற்கு முன்
                      </span>
                    </div>

                    <ul className="space-y-1.5 text-[10px] text-neutral-200">
                      {voyageSafetyReportData.nextRecommendations.map((rec, idx) => (
                        <li key={`next-rec-${idx}`} className="flex items-start gap-1.5 leading-snug">
                          <ArrowRight className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                          <span className="font-bold">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                /* NO COMPLETED VOYAGES PLACEHOLDER */
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-center">
                  <FileText className="h-7 w-7 text-neutral-600 mx-auto mb-1.5" />
                  <span className="text-xs font-black text-neutral-300 uppercase block">
                    NO COMPLETED VOYAGES
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5">
                    முடிக்கப்பட்ட பயணங்கள் இல்லை
                  </span>
                  <p className="text-[10px] text-neutral-400 mt-2 leading-tight">
                    Start and complete a trip using the Trip Monitor above to record your voyage metrics and generate a full local safety advisory.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Prototype Report Disclaimer */}
          <div className="mt-3 rounded border border-neutral-800 bg-neutral-900/50 p-2 text-center">
            <p className="text-[8px] font-bold text-neutral-400 leading-tight">
              THIS REPORT IS BASED ON LOCALLY RECORDED PROTOTYPE DATA.
              <br />
              <span className="text-neutral-400">இந்த அறிக்கை சாதனத்தில் பதிவுசெய்யப்பட்ட முன்மாதிரி தரவை அடிப்படையாகக் கொண்டது.</span>
            </p>
          </div>
        </section>

        {/* RECENT SAFETY EVENTS */}
        <section 
          aria-label="Recent Safety Event Log"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                RECENT SAFETY EVENTS
              </h2>
            </div>
            <span className="text-[10px] font-bold text-neutral-400 uppercase">
              LOCAL EVENT LOG
            </span>
          </div>

          {recentEvents.length > 0 ? (
            <div className="space-y-1.5">
              {recentEvents.map((evt) => (
                <div
                  key={evt.eventId}
                  className="flex items-center justify-between rounded-lg border border-neutral-800/80 bg-neutral-900/90 px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden pr-2">
                    <span className="font-mono text-[10px] text-neutral-400 shrink-0 font-bold">
                      {evt.formattedTime}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-neutral-200">
                      {evt.message}
                    </span>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${
                    evt.safetyLevel === 'SAFE' || evt.safetyLevel === 'ONLINE'
                      ? 'border-green-500/50 bg-green-950/60 text-green-400'
                      : evt.safetyLevel === 'CAUTION' || evt.safetyLevel === 'OFFLINE'
                        ? 'border-amber-500/50 bg-amber-950/60 text-amber-300'
                        : evt.safetyLevel === 'DANGER'
                          ? 'border-red-500/50 bg-red-950/60 text-red-400'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-300'
                  }`}>
                    {evt.safetyLevel}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3 text-center">
              <span className="text-[11px] font-medium text-neutral-400">
                No safety events logged yet. Active trip & state changes will be recorded here locally.
              </span>
            </div>
          )}
        </section>

        {/* EMERGENCY SOS HISTORY & LAST SOS SNAPSHOT VIEWER */}
        {recentEmergencyEvents.length > 0 && (
          <section 
            aria-label="Local Emergency History"
            className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-red-400">
                <Radio className="h-4 w-4" aria-hidden="true" />
                <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                  EMERGENCY HISTORY
                </h2>
              </div>
              <button
                type="button"
                onClick={handleViewLastSos}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-red-400 hover:text-red-300 underline cursor-pointer"
                aria-label="View last recorded emergency snapshot"
              >
                <Eye className="h-3 w-3" />
                <span>VIEW LAST SOS</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {recentEmergencyEvents.map((emergency) => (
                <div
                  key={emergency.emergencyId}
                  className="flex items-center justify-between rounded-lg border border-red-900/40 bg-red-950/20 px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-400 font-bold">
                      {emergency.formattedTime}
                    </span>
                    <span className="text-[11px] font-bold text-white">
                      {emergency.gpsAvailable ? 'GPS AVAILABLE' : 'LOCATION UNAVAILABLE'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-neutral-900 border border-neutral-700 px-1.5 py-0.5 text-[9px] font-black text-neutral-300">
                      {emergency.riskLevel === 'UNAVAILABLE' ? 'DATA UNAVAILABLE' : `${emergency.riskLevel} RISK`}
                    </span>
                    <span className="rounded bg-neutral-900 border border-neutral-700 px-1.5 py-0.5 text-[9px] font-black text-neutral-400">
                      {emergency.tripStatus === 'ACTIVE' ? 'ACTIVE TRIP' : emergency.tripStatus === 'COMPLETED' ? 'COMPLETED' : 'NO TRIP'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* D. DYNAMIC COMPASS / FISHING HOTSPOT NAVIGATION SECTION */}
        <section 
          aria-label="Dynamic Compass and Fishing Hotspot Navigation"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                PFZ NAVIGATION COMPASS
              </h2>
            </div>
            <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border ${navStatusBadge.bg}`}>
              {navStatusBadge.label}
            </span>
          </div>

          {/* Compass Dial Visual */}
          <div className="relative mx-auto my-2 flex h-48 w-48 items-center justify-center rounded-full border-2 border-neutral-700 bg-neutral-900 shadow-inner">
            <div className="absolute inset-1 rounded-full border border-dashed border-neutral-700 pointer-events-none" />

            {/* Cardinal Direction: NORTH */}
            <div className="absolute top-2 flex flex-col items-center">
              <span className="text-xs font-black text-green-400">N</span>
              <span className="text-[10px] text-green-400">▲</span>
            </div>

            {/* Cardinal Direction: EAST */}
            <div className="absolute right-2.5 flex items-center">
              <span className="text-xs font-black text-neutral-300">E</span>
            </div>

            {/* Cardinal Direction: SOUTH */}
            <div className="absolute bottom-2 flex flex-col items-center">
              <span className="text-xs font-black text-neutral-300">S</span>
            </div>

            {/* Cardinal Direction: WEST */}
            <div className="absolute left-2.5 flex items-center">
              <span className="text-xs font-black text-neutral-300">W</span>
            </div>

            {/* Central Dynamic Navigation Pointer Arrow */}
            <div 
              className="relative flex flex-col items-center justify-center transition-transform duration-500 ease-out"
              style={{ transform: `rotate(${navigationData.arrowRotation}deg)` }}
              aria-label={`Target bearing arrow ${formatBearing(navigationData.bearing)}`}
            >
              <Navigation 
                className={`h-16 w-16 transition-colors ${
                  navigationData.bearing !== null 
                    ? 'text-green-400 fill-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.7)]' 
                    : 'text-neutral-600 fill-neutral-700 opacity-60'
                }`}
                aria-hidden="true"
              />
              <div className="absolute h-3 w-3 rounded-full bg-white border-2 border-black" />
            </div>
          </div>

          {/* Target Hotspot Selector & Information */}
          <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/90 p-3">
            <div className="flex flex-col gap-1.5 border-b border-neutral-800 pb-2.5">
              <label htmlFor="hotspot-select" className="text-[10px] font-bold text-neutral-400 uppercase">
                TARGET PFZ HOTSPOT
              </label>

              {cachedHotspots.length > 0 ? (
                <div className="relative">
                  <select
                    id="hotspot-select"
                    value={activeHotspot?.id || ''}
                    onChange={(e) => setSelectedHotspotId(e.target.value)}
                    className="w-full appearance-none rounded border border-neutral-700 bg-neutral-950 px-3 py-2 pr-8 text-xs font-black text-green-400 uppercase tracking-wide focus:border-green-500 focus:outline-none cursor-pointer"
                    aria-label="Select Target PFZ Hotspot"
                  >
                    {cachedHotspots.map((hotspot) => (
                      <option key={hotspot.id} value={hotspot.id}>
                        {hotspot.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                </div>
              ) : (
                <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-center">
                  <span className="text-xs font-black text-amber-400">
                    NO PFZ DATA — SYNC BEFORE DEPARTURE
                  </span>
                </div>
              )}

              {activeHotspot && (
                <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-neutral-400">
                  <span>TARGET COORDS:</span>
                  <span className="font-mono text-neutral-200">
                    {formatLatitude(activeHotspot.latitude)}, {formatLongitude(activeHotspot.longitude)}
                  </span>
                </div>
              )}
            </div>

            {/* Dynamic Bearing, Direction, and Distance Cards */}
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                  BEARING
                </span>
                <span className="text-base font-black tracking-wider text-white mt-0.5 block font-mono">
                  {formatBearing(navigationData.bearing)}
                </span>
              </div>

              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                  DIRECTION
                </span>
                <span className="text-xs font-black tracking-tight text-green-400 mt-1 block uppercase truncate">
                  {navigationData.cardinalDirection}
                </span>
              </div>

              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                  DISTANCE
                </span>
                <span className="text-base font-black tracking-wider text-white mt-0.5 block font-mono">
                  {formatDistance(navigationData.distanceNM)}
                </span>
              </div>
            </div>

            <div className="mt-2 text-center">
              <p className="text-[9px] font-medium text-neutral-400">
                BEARING TO TARGET (NOT PHYSICAL HEADING) • DEMO PFZ DATA
              </p>
            </div>
          </div>
        </section>

        {/* E. LIVE GPS LOCATION SECTION */}
        <section 
          aria-label="Current GPS Location and Vessel Speed"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                YOUR LOCATION
              </h2>
            </div>

            {/* Real-Time GPS Status Indicator */}
            {gpsStatus === 'CONNECTED' && (
              <div className="flex items-center gap-1 rounded bg-green-950/60 border border-green-500/50 px-2 py-0.5 text-[10px] font-bold text-green-400">
                <LocateFixed className="h-3 w-3 text-green-400" aria-hidden="true" />
                <span>GPS CONNECTED</span>
              </div>
            )}

            {gpsStatus === 'SEARCHING' && (
              <div className="flex items-center gap-1 rounded bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <Locate className="h-3 w-3 animate-spin text-amber-400" aria-hidden="true" />
                <span>GPS SEARCHING...</span>
              </div>
            )}

            {(gpsStatus === 'PERMISSION_DENIED' || gpsStatus === 'UNAVAILABLE' || gpsStatus === 'TIMEOUT' || gpsStatus === 'UNSUPPORTED') && (
              <div className="flex items-center gap-1 rounded bg-red-950/60 border border-red-500/50 px-2 py-0.5 text-[10px] font-bold text-red-400">
                <AlertTriangle className="h-3 w-3 text-red-400" aria-hidden="true" />
                <span>
                  {gpsStatus === 'PERMISSION_DENIED' ? 'PERMISSION DENIED' : 'GPS ERROR'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                LATITUDE
              </span>
              <span className="text-xs font-black tracking-tight text-white mt-1 block font-mono">
                {formatLatitude(latitude)}
              </span>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                LONGITUDE
              </span>
              <span className="text-xs font-black tracking-tight text-white mt-1 block font-mono">
                {formatLongitude(longitude)}
              </span>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                SPEED
              </span>
              <span className="text-xs font-black tracking-tight text-green-400 mt-1 block font-mono">
                {formatSpeedKnots(speedMps)}
              </span>
            </div>
          </div>

          {gpsErrorMessage && (
            <div className="mt-2.5 rounded border border-neutral-800 bg-neutral-900/90 p-2 text-left">
              <p className="text-[11px] font-medium text-neutral-300 leading-tight">
                {gpsErrorMessage}
              </p>
            </div>
          )}
        </section>

        {/* F. MARINE CONDITIONS SECTION */}
        <section 
          aria-label="Marine Weather and Wave Conditions"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Waves className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                MARINE CONDITIONS
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                SOURCE: <strong className="text-neutral-300">{waveSourceLabel}</strong>
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                waveSafetyAnalysis.status === 'SAFE'
                  ? 'border-green-500 bg-green-950/60 text-green-400'
                  : waveSafetyAnalysis.status === 'CAUTION'
                    ? 'border-amber-500 bg-amber-950/60 text-amber-300'
                    : waveSafetyAnalysis.status === 'DANGER'
                      ? 'border-red-500 bg-red-950/60 text-red-400'
                      : 'border-neutral-700 bg-neutral-900 text-neutral-400'
              }`}>
                STATUS: {waveSafetyAnalysis.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className={`rounded-lg border p-2.5 ${
              waveSafetyAnalysis.status === 'SAFE' 
                ? 'border-green-500/40 bg-neutral-900' 
                : waveSafetyAnalysis.status === 'CAUTION'
                  ? 'border-amber-500/40 bg-neutral-900'
                  : 'border-red-500/40 bg-neutral-900'
            }`}>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                CURRENT WAVE HEIGHT
              </span>
              <span className={`text-2xl font-black tracking-tight mt-0.5 block ${
                waveSafetyAnalysis.status === 'SAFE' 
                  ? 'text-green-400' 
                  : waveSafetyAnalysis.status === 'CAUTION'
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}>
                {currentWaveHeightM.toFixed(1)} m
              </span>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                SAFE LIMIT (CACHE)
              </span>
              <span className="text-2xl font-black tracking-tight text-white mt-0.5 block">
                {safeLimitDisplay}
              </span>
            </div>
          </div>
        </section>

        {/* G. BORDER SAFETY SECTION */}
        <section 
          aria-label="International Maritime Border Proximity"
          className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-green-400" aria-hidden="true" />
              <h2 className="text-xs font-black tracking-widest text-neutral-300 uppercase">
                BORDER SAFETY
              </h2>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
              borderSafetyAnalysis.status === 'SAFE'
                ? 'border-green-500 bg-green-950/60 text-green-400'
                : borderSafetyAnalysis.status === 'CAUTION'
                  ? 'border-amber-500 bg-amber-950/60 text-amber-300'
                  : borderSafetyAnalysis.status === 'DANGER'
                    ? 'border-red-500 bg-red-950/60 text-red-400'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-400'
            }`}>
              STATUS: {borderSafetyAnalysis.label}
            </span>
          </div>

          {/* Phase 17: Border Data Invalid Banner */}
          {!dataPackageValidationSummary.borderValidation.isValid && (
            <div className="mb-2 rounded border border-red-500/60 bg-red-950/40 p-2 text-center">
              <span className="text-[10px] font-black uppercase text-red-300">
                BORDER DATA UNAVAILABLE • SAFETY DISTANCE CANNOT BE VERIFIED
              </span>
              <span className="block text-[8px] text-red-400/90 mt-0.5">
                {dataPackageValidationSummary.borderValidation.reason}
              </span>
            </div>
          )}

          {/* Phase 16: Border Data Freshness Indicator */}
          {cacheHealthSummary.borderHealth.state !== 'FRESH' && (
            <div className={`mb-2 rounded border p-1.5 text-center ${
              cacheHealthSummary.borderHealth.state === 'STALE'
                ? 'border-red-500/50 bg-red-950/40 text-red-300'
                : cacheHealthSummary.borderHealth.state === 'AGING'
                  ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                  : 'border-neutral-700 bg-neutral-950 text-neutral-400'
            }`}>
              <span className="text-[10px] font-black uppercase">
                {cacheHealthSummary.borderHealth.state === 'STALE' ? 'BORDER DATA STALE' : cacheHealthSummary.borderHealth.state === 'AGING' ? 'BORDER DATA AGING' : 'BORDER SAFETY DATA UNAVAILABLE'}
              </span>
              <span className="block text-[8px] opacity-80 mt-0.5">
                {cacheHealthSummary.borderHealth.ageFormatted}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div>
              <span className="block text-[10px] font-bold text-neutral-400 uppercase">
                DISTANCE TO BORDER
              </span>
              <span className="text-xl font-black tracking-wider text-white font-mono">
                {formatDistance(borderSafetyAnalysis.distanceNM)}
              </span>
            </div>
            <div className="text-right">
              <span className={`inline-block rounded border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                borderSafetyAnalysis.status === 'SAFE'
                  ? 'border-green-500/40 bg-green-950/40 text-green-300'
                  : borderSafetyAnalysis.status === 'CAUTION'
                    ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                    : borderSafetyAnalysis.status === 'DANGER'
                      ? 'border-red-500/40 bg-red-950/40 text-red-300'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-400'
              }`}>
                {borderSafetyAnalysis.explanation}
              </span>
            </div>
          </div>
        </section>

        {/* DEMO PROTOTYPE DISCLAIMER BANNER */}
        <div className="rounded-lg border border-neutral-800/80 bg-neutral-950/80 px-3 py-2 text-center flex items-center justify-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
          <p className="text-[10px] font-semibold text-neutral-400 leading-tight">
            PROTOTYPE SAFETY LOGIC — Pre-departure checklist, risk scores, and SOS are local demonstration tools and do not represent official maritime clearance or guaranteed rescue transmission.
          </p>
        </div>

        {/* H. EMERGENCY SOS BUTTON */}
        <section 
          aria-label="Emergency Distress System" 
          className="mt-1"
        >
          <button
            type="button"
            onClick={handleOpenSosModal}
            disabled={sosCooldownSec > 0}
            className="w-full rounded-xl border-4 border-red-500 bg-red-600 px-4 py-4 text-center text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Trigger Emergency SOS confirmation"
          >
            <Siren className="h-9 w-9 text-white animate-pulse shrink-0" aria-hidden="true" />
            <div className="flex flex-col items-center justify-center leading-none">
              <span className="text-3xl font-black tracking-widest uppercase">
                SOS
              </span>
              <span className="text-base font-bold text-white tracking-wider mt-1">
                அவசர உதவி
              </span>
              <span className="text-[10px] font-black tracking-widest text-red-100 uppercase mt-0.5">
                {sosCooldownSec > 0 ? `SOS RECORDED (COOLDOWN ${sosCooldownSec}s)` : 'EMERGENCY DISTRESS'}
              </span>
            </div>
          </button>
        </section>

      </div>

      {/* --- PHASE 10 MODAL: PRE-DEPARTURE READINESS WARNING MODAL --- */}
      {isReadinessWarningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border-4 border-amber-500 bg-neutral-950 p-5 text-center shadow-[0_0_30px_rgba(245,158,11,0.6)] text-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 border-2 border-amber-400 mb-3">
              <AlertOctagon className="h-8 w-8 text-black" />
            </div>

            <h3 className="text-xl font-black tracking-wider text-amber-400 uppercase">
              PRE-DEPARTURE CHECK
            </h3>
            <p className="text-sm font-bold text-white mt-0.5">
              CHECKS ARE NOT COMPLETE
            </p>

            {/* Phase 17: Incomplete Data Package Banner */}
            {dataPackageValidationSummary.isIncomplete && (
              <div className="mt-3 rounded-lg border border-red-500/60 bg-red-950/60 p-2 text-center">
                <span className="text-xs font-black uppercase text-red-300">
                  OFFLINE DATA PACKAGE INCOMPLETE
                </span>
                <p className="text-[10px] text-red-200 mt-0.5">
                  Some required local safety data cannot be validated.
                  <br />
                  <span className="text-red-300">புறப்படுவதற்கு முன் தேவையான தரவைப் பெறவும்.</span>
                </p>
              </div>
            )}

            <div className="my-4 rounded-xl border border-amber-800/80 bg-amber-950/40 p-3 text-left text-xs text-neutral-200">
              <p className="font-bold text-amber-300 text-center mb-2">
                UNFULFILLED PRE-DEPARTURE ITEMS:
              </p>
              <ul className="space-y-1 text-[11px] text-neutral-300">
                {preDepartureChecklist.unfulfilledItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-1.5 leading-tight">
                    <XCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>{item.name}:</strong> {item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleReviewChecks}
                className="rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-xs font-black text-neutral-300 uppercase tracking-wider hover:bg-neutral-800 active:scale-95 cursor-pointer"
              >
                REVIEW CHECKS
              </button>

              <button
                type="button"
                onClick={handleStartAnyway}
                className="rounded-xl border-2 border-amber-400 bg-amber-600 py-3 text-xs font-black text-black uppercase tracking-wider shadow-lg hover:bg-amber-500 active:scale-95 cursor-pointer"
              >
                START ANYWAY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PHASE 9 MODAL 1: EMERGENCY SOS CONFIRMATION MODAL --- */}
      {isSosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border-4 border-red-500 bg-neutral-950 p-5 text-center shadow-[0_0_30px_rgba(239,68,68,0.7)] text-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-600 border-2 border-red-400 mb-3 animate-bounce">
              <Siren className="h-8 w-8 text-white" />
            </div>

            <h3 className="text-2xl font-black tracking-wider text-red-500 uppercase">
              EMERGENCY SOS
            </h3>
            <p className="text-lg font-bold text-white mt-0.5">
              அவசர உதவி
            </p>

            <div className="my-4 rounded-xl border border-red-800/80 bg-red-950/40 p-3 text-left text-xs font-semibold text-neutral-200">
              <p className="font-black text-white text-sm text-center mb-1">
                ARE YOU IN AN EMERGENCY?
              </p>
              <p className="text-[11px] text-neutral-300 text-center leading-tight">
                This will create a local emergency timestamp and lock your latest GPS position and safety status on this device.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCancelSos}
                className="rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-xs font-black text-neutral-300 uppercase tracking-wider hover:bg-neutral-800 active:scale-95 cursor-pointer"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleConfirmSos}
                className="rounded-xl border-2 border-red-400 bg-red-600 py-3 text-xs font-black text-white uppercase tracking-wider shadow-lg hover:bg-red-500 active:scale-95 cursor-pointer"
              >
                CONFIRM SOS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PHASE 9 MODAL 2: EMERGENCY SNAPSHOT VIEWER MODAL --- */}
      {isViewingSnapshotModal && activeEmergencySnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border-2 border-red-500 bg-neutral-950 p-4 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
              <div className="flex items-center gap-1.5 text-red-400">
                <Siren className="h-5 w-5" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  EMERGENCY RECORD
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsViewingSnapshotModal(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white bg-neutral-900 cursor-pointer"
                aria-label="Close emergency snapshot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`mb-3 rounded-xl border p-3 text-center ${
              activeEmergencySnapshot.onlineStatus
                ? 'border-green-600/50 bg-green-950/30 text-green-300'
                : 'border-amber-600/50 bg-amber-950/30 text-amber-300'
            }`}>
              <div className="flex items-center justify-center gap-1.5 font-black text-xs uppercase">
                {activeEmergencySnapshot.onlineStatus ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
                <span>
                  {activeEmergencySnapshot.onlineStatus ? 'SOS RECORDED (NETWORK AVAILABLE)' : 'SOS RECORDED LOCALLY'}
                </span>
              </div>
              <p className="text-[10px] font-bold mt-1 text-neutral-200 leading-tight">
                {activeEmergencySnapshot.onlineStatus
                  ? 'Ready for future transmission when service connected.'
                  : 'NO NETWORK CONNECTION — Emergency information is saved on this device.'}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                அவசர பதிவு சாதனத்தில் சேமிக்கப்பட்டது
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-neutral-400 uppercase flex items-center gap-1">
                  <Clock className="h-3 w-3" /> EMERGENCY TIME
                </span>
                <span className="font-mono font-black text-white">
                  {activeEmergencySnapshot.formattedTime}
                </span>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                  GPS LOCATION
                </span>
                {activeEmergencySnapshot.gpsAvailable ? (
                  <div className="font-mono text-xs font-black text-green-400">
                    LAT: {formatLatitude(activeEmergencySnapshot.latitude)}
                    <br />
                    LON: {formatLongitude(activeEmergencySnapshot.longitude)}
                  </div>
                ) : (
                  <span className="font-black text-red-400">LOCATION UNAVAILABLE</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-center font-bold">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="text-[9px] text-neutral-400 uppercase block">RISK SCORE</span>
                  <span className="text-sm font-black text-white mt-0.5 block font-mono">
                    {activeEmergencySnapshot.riskScore !== null ? `${activeEmergencySnapshot.riskScore}/100` : '--/100'}
                  </span>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="text-[9px] text-neutral-400 uppercase block">SAFETY STATUS</span>
                  <span className="text-xs font-black text-red-400 mt-0.5 block uppercase">
                    {activeEmergencySnapshot.safetyLevel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center font-bold">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="text-[9px] text-neutral-400 uppercase block">WAVE HEIGHT</span>
                  <span className="text-xs font-black text-white mt-0.5 block">
                    {activeEmergencySnapshot.waveHeight !== null ? `${activeEmergencySnapshot.waveHeight.toFixed(1)} m` : 'UNAVAILABLE'}
                  </span>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
                  <span className="text-[9px] text-neutral-400 uppercase block">BORDER DISTANCE</span>
                  <span className="text-xs font-black text-white mt-0.5 block font-mono">
                    {formatDistance(activeEmergencySnapshot.borderDistanceNm)}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 flex items-center justify-between text-[11px]">
                <span className="text-neutral-400 font-bold uppercase">TRIP STATUS</span>
                <span className="font-black text-white uppercase">
                  {activeEmergencySnapshot.tripStatus === 'ACTIVE' 
                    ? `ACTIVE (${activeEmergencySnapshot.tripDuration})` 
                    : activeEmergencySnapshot.tripStatus}
                </span>
              </div>
            </div>

            <div className="mt-3 text-center">
              <p className="text-[9px] font-semibold text-neutral-400 leading-tight">
                SOS IS RECORDED LOCALLY. THIS PROTOTYPE DOES NOT GUARANTEE EMERGENCY TRANSMISSION.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsViewingSnapshotModal(false)}
              className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 text-xs font-black text-white uppercase tracking-wider hover:bg-neutral-800 active:scale-95 cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* --- PHASE 11 MODAL: CLEAR LOCAL TRACK CONFIRMATION MODAL --- */}
      {isClearTrackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border-4 border-neutral-700 bg-neutral-950 p-5 text-center shadow-2xl text-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 border-2 border-neutral-700 mb-3">
              <Trash2 className="h-7 w-7 text-red-400" />
            </div>

            <h3 className="text-xl font-black tracking-wider text-white uppercase">
              CLEAR TRACK?
            </h3>
            <p className="text-sm font-bold text-neutral-400 mt-0.5">
              உள்ளூர் பாதையை அழிக்கவா?
            </p>

            <div className="my-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-center text-xs text-neutral-300">
              <p className="font-semibold text-neutral-300 leading-tight">
                This will remove the locally recorded track and GPS points for this trip from your device.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsClearTrackModalOpen(false)}
                className="rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-xs font-black text-neutral-300 uppercase tracking-wider hover:bg-neutral-800 active:scale-95 cursor-pointer"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleConfirmClearTrack}
                className="rounded-xl border-2 border-red-500 bg-red-600 py-3 text-xs font-black text-white uppercase tracking-wider shadow-lg hover:bg-red-500 active:scale-95 cursor-pointer"
              >
                CLEAR
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default FishermanDashboard;
