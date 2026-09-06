import type { FeatureCollection } from "geojson";
import type { HazardPoint } from "../types/marine";

/**
 * ============================================================================
 * VARUNA DEMO / MOCK DATASET
 * NOTE: For demonstration & simulation purposes only.
 * Official production data should be supplied via props or backend APIs.
 * ============================================================================
 */

/**
 * Mock wave hazard, sea-state risk, and maritime operational risk points
 * focused on the Palk Bay, Gulf of Mannar, and Adams Bridge corridors.
 */
export const DEMO_HAZARD_POINTS: HazardPoint[] = [
  // High Risk Sector: Palk Strait Shallows & Rough Sea Corridor
  { lat: 9.38, lon: 79.45, risk_level: 8.8, wave_height_m: 2.9, wind_speed_knots: 24, hazard_type: "wave_hazard", description: "Severe swell and shallow shoals near channel entry" },
  { lat: 9.39, lon: 79.47, risk_level: 8.5, wave_height_m: 2.7, wind_speed_knots: 22, hazard_type: "wave_hazard", description: "High wave shoaling zone" },
  { lat: 9.42, lon: 79.52, risk_level: 9.2, wave_height_m: 3.1, wind_speed_knots: 26, hazard_type: "sea_state_risk", description: "Critical wave convergence zone with breaking waves" },
  { lat: 9.40, lon: 79.50, risk_level: 8.9, wave_height_m: 2.8, wind_speed_knots: 25, hazard_type: "wave_hazard", description: "Extreme rough sea state" },
  { lat: 9.35, lon: 79.42, risk_level: 7.9, wave_height_m: 2.4, wind_speed_knots: 21, hazard_type: "maritime_operational_risk", description: "Submerged sandbar navigation risk" },
  { lat: 9.32, lon: 79.38, risk_level: 7.4, wave_height_m: 2.2, wind_speed_knots: 19, hazard_type: "sea_state_risk", description: "Tidal cross-current turbulence" },

  // Moderate to Elevated Risk: Rameswaram Island & Dhanushkodi waters
  { lat: 9.25, lon: 79.30, risk_level: 6.2, wave_height_m: 1.8, wind_speed_knots: 16, hazard_type: "maritime_operational_risk", description: "Narrow navigation fairway with trawler congestion" },
  { lat: 9.28, lon: 79.31, risk_level: 6.8, wave_height_m: 2.0, wind_speed_knots: 18, hazard_type: "wave_hazard", description: "Moderate chop with 8s period swell" },
  { lat: 9.22, lon: 79.25, risk_level: 5.5, wave_height_m: 1.5, wind_speed_knots: 14, hazard_type: "sea_state_risk", description: "Moderate coastal chop" },
  { lat: 9.18, lon: 79.35, risk_level: 6.9, wave_height_m: 2.1, wind_speed_knots: 17, hazard_type: "shallow_water", description: "Coral reef heads and shifting shoals" },
  { lat: 9.15, lon: 79.40, risk_level: 7.1, wave_height_m: 2.3, wind_speed_knots: 20, hazard_type: "sea_state_risk", description: "Open sea swell ingress" },

  // Severe Risk Cluster: Adams Bridge / Ram Setu reef shoals
  { lat: 9.12, lon: 79.52, risk_level: 9.5, wave_height_m: 3.4, wind_speed_knots: 28, hazard_type: "shallow_water", description: "Dangerous submerged limestone ridge; non-navigable for deep draft" },
  { lat: 9.10, lon: 79.58, risk_level: 9.0, wave_height_m: 3.2, wind_speed_knots: 27, hazard_type: "maritime_operational_risk", description: "High collision risk on coral chain" },
  { lat: 9.08, lon: 79.65, risk_level: 8.7, wave_height_m: 2.9, wind_speed_knots: 24, hazard_type: "wave_hazard", description: "Breaking surf on shoals" },

  // Northern Palk Bay Corridor (Point Calimere approach)
  { lat: 9.75, lon: 79.60, risk_level: 5.8, wave_height_m: 1.7, wind_speed_knots: 15, hazard_type: "wave_hazard", description: "Moderate wind-driven swell" },
  { lat: 9.85, lon: 79.72, risk_level: 6.4, wave_height_m: 1.9, wind_speed_knots: 17, hazard_type: "maritime_operational_risk", description: "Cross-traffic shipping lanes" },
  { lat: 10.05, lon: 79.88, risk_level: 7.8, wave_height_m: 2.5, wind_speed_knots: 22, hazard_type: "sea_state_risk", description: "Monsoonal sea-state disturbance" },
  { lat: 10.15, lon: 79.92, risk_level: 8.1, wave_height_m: 2.6, wind_speed_knots: 23, hazard_type: "wave_hazard", description: "Point Calimere headland wave refraction" },
  { lat: 9.95, lon: 79.80, risk_level: 6.0, wave_height_m: 1.8, wind_speed_knots: 16, hazard_type: "maritime_operational_risk", description: "High density artisanal fishing zone" },

  // Gulf of Mannar Biosphere & Deep Water Entry (South)
  { lat: 8.95, lon: 78.95, risk_level: 4.2, wave_height_m: 1.2, wind_speed_knots: 12, hazard_type: "sea_state_risk", description: "Mild sea condition; good visibility" },
  { lat: 8.85, lon: 78.80, risk_level: 3.5, wave_height_m: 1.0, wind_speed_knots: 10, hazard_type: "sea_state_risk", description: "Calm sheltered bay waters" },
  { lat: 8.75, lon: 78.60, risk_level: 3.0, wave_height_m: 0.9, wind_speed_knots: 9, hazard_type: "sea_state_risk", description: "Nearshore calm zone, Tuticorin approach" },
  { lat: 8.80, lon: 79.15, risk_level: 5.0, wave_height_m: 1.5, wind_speed_knots: 14, hazard_type: "wave_hazard", description: "Moderate oceanic rollers" },
  { lat: 8.65, lon: 79.35, risk_level: 6.5, wave_height_m: 2.0, wind_speed_knots: 18, hazard_type: "wave_hazard", description: "Gulf of Mannar deep water swell" },

  // Jaffna / Northern Sri Lankan coast approach (Eastern Palk Bay)
  { lat: 9.60, lon: 80.05, risk_level: 7.2, wave_height_m: 2.2, wind_speed_knots: 19, hazard_type: "maritime_operational_risk", description: "Proximity to restricted maritime perimeter" },
  { lat: 9.50, lon: 79.95, risk_level: 6.7, wave_height_m: 2.0, wind_speed_knots: 17, hazard_type: "wave_hazard", description: "Shallow bank wave steepening" },
  { lat: 9.70, lon: 80.15, risk_level: 5.9, wave_height_m: 1.7, wind_speed_knots: 15, hazard_type: "sea_state_risk", description: "Open shelf sea state" },
  { lat: 9.20, lon: 79.75, risk_level: 7.6, wave_height_m: 2.3, wind_speed_knots: 20, hazard_type: "shallow_water", description: "Delft Island reef hazards" },
  { lat: 9.05, lon: 79.85, risk_level: 8.2, wave_height_m: 2.6, wind_speed_knots: 22, hazard_type: "maritime_operational_risk", description: "Mannar channel narrow passage" },
];

/**
 * Sample GeoJSON for the International Maritime Boundary Line (IMBL) in the Palk Bay area.
 * DISCLAIMER: This is a representative mock representation for UI/GIS visualization demonstration.
 * In production, an official gazetted GeoJSON dataset should be supplied to the component.
 */
export const SAMPLE_PALK_BAY_IMBL_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "IMBL-PALK-BAY-DEMO",
        name: "International Maritime Boundary Line (Palk Bay Segment)",
        description: "Official India - Sri Lanka Maritime Boundary demarcation (Demo Representation)",
        status: "Active Demarcation",
        color: "#ff2244",
        alertLevel: "HIGH_SECURITY_PERIMETER"
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [79.050, 9.010],
          [79.180, 9.110],
          [79.320, 9.220],
          [79.480, 9.350],
          [79.620, 9.520],
          [79.780, 9.720],
          [79.950, 9.920],
          [80.080, 10.080],
          [80.220, 10.250]
        ]
      }
    },
    {
      type: "Feature",
      properties: {
        id: "IMBL-ADAMS-BRIDGE-DEMO",
        name: "IMBL Palk Strait / Adams Bridge Transition",
        status: "Buffer Zone",
        color: "#ff0055"
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [79.320, 9.220],
          [79.410, 9.150],
          [79.520, 9.080]
        ]
      }
    }
  ]
};

/**
 * Standard default initial viewport configuration
 */
export const DEFAULT_MARINE_VIEWPORT = {
  latitude: 9.28,
  longitude: 79.31,
  zoom: 8,
  pitch: 45,
  bearing: -15,
  maxZoom: 16,
  minZoom: 4,
  maxPitch: 60,
  minPitch: 0
};
