import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Standard marine hazard data point with coordinates and risk level
 */
export interface SeaHazard {
  lat: number;
  lon: number;
  risk_level: number; // Quantitative risk score (e.g. 0.0 to 1.0 or 0.0 to 10.0)
}

/**
 * Extended hazard data point for maritime telemetry
 */
export interface HazardPoint extends SeaHazard {
  wave_height_m?: number;
  wind_speed_knots?: number;
  hazard_type?: "wave_hazard" | "sea_state_risk" | "maritime_operational_risk" | "shallow_water";
  description?: string;
}

/**
 * Coordinate payload returned on map location selection
 */
export interface MarineCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Viewport camera configuration for the 2.5D maritime map
 */
export interface MarineMapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  maxZoom?: number;
  minZoom?: number;
  maxPitch?: number;
  minPitch?: number;
}

/**
 * Props for the production-grade MarineMap component
 */
export interface MarineMapProps {
  /** Array of hazard points for 2.5D HexagonLayer visualization */
  hazardData?: SeaHazard[] | HazardPoint[];
  /** Alias for hazardData */
  hazards?: SeaHazard[] | HazardPoint[];
  /** Custom GeoJSON for the International Maritime Boundary Line */
  boundaryGeoJson?: FeatureCollection | Feature | Geometry | string;
  /** Alias for boundaryGeoJson */
  imblData?: FeatureCollection | Feature | Geometry | string;
  /** Initial camera viewport override */
  initialViewState?: Partial<MarineMapViewState>;
  /** Callback fired when a geographic point on the map is clicked/selected */
  onLocationSelect?: (location: { lat: number; lon: number }) => void;
  /** Whether to show the legend overlay */
  showLegend?: boolean;
  /** Whether to show HUD telemetry and view controls */
  showControls?: boolean;
  /** Custom MapLibre style JSON URL or StyleSpecification object */
  mapStyle?: string | Record<string, unknown>;
  /** Custom class name for the wrapper container */
  className?: string;
  /** Radius of hexagon columns in meters (default: 3000m) */
  hexagonRadius?: number;
  /** Elevation multiplier for hexagon columns (default: 120) */
  elevationScale?: number;
  /** Selected coordinate to display a highlight ping on the map */
  selectedLocation?: MarineCoordinates | null;
}


