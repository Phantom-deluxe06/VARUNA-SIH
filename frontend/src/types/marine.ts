import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Standard hazard data point for 2.5D hexagonal aggregation visualization
 */
export interface HazardPoint {
  lat: number;
  lon: number;
  risk_level: number; // Quantitative risk score (e.g., 0.0 to 10.0 scale)
  wave_height_m?: number;
  wind_speed_knots?: number;
  hazard_type?: "wave_hazard" | "sea_state_risk" | "maritime_operational_risk" | "shallow_water";
  description?: string;
}

/**
 * Coordinate payload returned on map click / location selection
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
  /** Array of hazard points for 2.5D hexagon layer visualization */
  hazardData?: HazardPoint[];
  /** Optional custom GeoJSON for the International Maritime Boundary Line */
  imblData?: FeatureCollection | Feature | Geometry | string;
  /** Initial camera viewport override */
  initialViewState?: Partial<MarineMapViewState>;
  /** Callback fired when a geographic point on the map is clicked/selected */
  onLocationSelect?: (coordinates: MarineCoordinates) => void;
  /** Whether to show the legend overlay */
  showLegend?: boolean;
  /** Whether to show HUD telemetry and view controls */
  showControls?: boolean;
  /** Custom MapLibre style JSON URL or StyleSpecification object */
  mapStyle?: string | Record<string, unknown>;
  /** Custom class name for the wrapper container */
  className?: string;
  /** Radius of hexagon columns in meters (default: 3200m) */
  hexagonRadius?: number;
  /** Elevation multiplier for hexagon columns (default: 120) */
  elevationScale?: number;
  /** Selected coordinate to display a highlight ping on the map */
  selectedLocation?: MarineCoordinates | null;
}
