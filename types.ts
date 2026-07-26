import 'react';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export const isValidCoordinates = (coords: any): boolean => {
  if (!coords || typeof coords !== 'object') return false;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);

  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;

  // Check sentinel coordinates (997, 998, 999)
  if (Math.abs(lat) >= 990 || Math.abs(lng) >= 990) return false;

  // Check invalid 0,0 unless specifically Gulf of Guinea region
  if (lat === 0 && lng === 0) return false;

  return true;
};

export type QueryIntent = 'DIRECT' | 'NATURAL_LOCATION' | 'EXPLORATORY' | 'HISTORICAL_EVENT' | 'DISCOVERY_LOCATION';

export enum LocationType {
  CONTINENT = 'Continent',
  COUNTRY = 'Country',
  STATE = 'State',
  CITY = 'City',
  OCEAN = 'Ocean',
  POI = 'Point of Interest'
}

export type EntityType = 
  | 'city'
  | 'country'
  | 'state'
  | 'ocean'
  | 'natural_feature'
  | 'mountain'
  | 'landmark'
  | 'museum'
  | 'historical_event_site'
  | 'archaeological_site'
  | 'discovery_site'
  | 'shipwreck_site'
  | 'artifact'
  | 'battlefield'
  | 'festival_site';

export interface NewsItem {
  title: string;
  source: string;
  url?: string;
  publishedAt?: string;
  summary?: string;
}

export interface PopulationInfo {
  value?: number;
  formattedValue: string;
  timeframe: string;
  description: string;
  sourceType?: "census" | "estimate" | "historical_record" | "ai_inference";
}

export interface ClimateInfo {
  name: string;
  description: string;
  koppenCode?: string;
}

export interface RelatedEntity {
  name: string;
  type: "person" | "group" | "place" | "institution" | "artifact" | "event";
}

export interface ProvenanceRecord {
  stage: 'route_generation' | 'normalization' | 'structural_validation' | 'deterministic_repair' | 'historical_validation' | 'patch' | 'recovery';
  source: 'ai' | 'deterministic' | 'llm';
  timestamp: string;
  confidence?: number;
  summary?: string;
}

export interface HistoricalIssue {
  waypointId: string;
  operation: 'replace' | 'insert' | 'remove';
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  field: string;
  originalValue: unknown;
  replacement: unknown;
  reason: string;
  source: 'deterministic' | 'historical_llm';
}

export interface LocationInfo {
  name: string;
  type: LocationType;
  entityType?: string;
  description: string;
  population?: {
    current?: PopulationInfo;
    historical?: PopulationInfo;
  } | null;
  climate?: ClimateInfo | null;
  relatedEntities?: RelatedEntity[];
  contextNotes?: string[];
  coordinates: GeoCoordinates;
  boundary?: GeoCoordinates[];
  news: NewsItem[];
  routeContext?: {
    title: string;
    text: string;
  };
  defaultNote?: string;
  provenance?: ProvenanceRecord[];
  newsError?: string;
  waypoint?: Waypoint;
}

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  populationClass: 'large' | 'medium' | 'small'; // Affects dot size
  type?: string;
}

export interface SearchResult {
  locationInfo?: LocationInfo | Partial<LocationInfo>;
  suggestedZoom?: number;
  error?: "NOT_FOUND" | "AMBIGUOUS" | "TEMP_FAILURE" | "NO_GEOGRAPHIC_DATA" | "UNABLE_TO_RESOLVE" | "LOCATION_SYSTEM_UNAVAILABLE";
}

export type AIProvider = 'gemini' | 'lmstudio';
export type NewsProvider = 'gemini' | 'newsapi' | 'newsdata' | 'nyt';

export interface UserSettings {
  aiProvider: AIProvider;
  lmStudioUrl: string;
  lmStudioModel: string;
  newsProvider: NewsProvider;
  newsApiKey: string;
  nytApiKey: string;
  newsDataApiKey: string;
}

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  context: string;
  routeTitle?: string;
  description?: string;
  significance?: string;
  highlights?: string[];
  historicalPeriod?: string;
  entities?: string[];
  relatedEntities?: RelatedEntity[];
  metadata?: any;
  provenance?: ProvenanceRecord[];
}

export interface FavoriteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'location' | 'route';
  waypoints?: Waypoint[];
  notes?: string;
}

export type SkinType = 'modern' | 'retro-green' | 'retro-amber' | 'parchment';

// Fix for React Three Fiber elements not being recognized in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshPhongMaterial: any;
      meshStandardMaterial: any;
      primitive: any;
      directionalLight: any;
      ambientLight: any;
      pointLight: any;
      object3D: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshPhongMaterial: any;
      meshStandardMaterial: any;
      primitive: any;
      directionalLight: any;
      ambientLight: any;
      pointLight: any;
      object3D: any;
    }
  }
}