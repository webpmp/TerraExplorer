import 'react';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface ResolvedCoordinates {
  lat: number;
  lng: number;
  source: "deterministic" | "geocoder" | "ai_recovery";
  confidence?: "high" | "medium" | "low";
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

export type QueryIntent = 'DIRECT' | 'NATURAL_LOCATION' | 'EXPLORATORY' | 'HISTORICAL_EVENT' | 'DISCOVERY_LOCATION' | 'DISCOVERY_OBJECT_LOCATION' | 'exploration' | 'specific_location' | 'historical_event' | 'route';

export enum LocationType {
  CONTINENT = 'Continent',
  COUNTRY = 'Country',
  STATE = 'State',
  CITY = 'City',
  OCEAN = 'Ocean',
  POI = 'Point of Interest'
}

export type { EntityType } from './domain';

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
  source: 'deterministic' | 'historical_llm' | 'structural_validation';
}

export interface NotableItem {
  title: string;
  summary: string;
  entityType: string;
  wikipediaUrl?: string;
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
  notable?: NotableItem[];
  contextNotes?: string[];
  locationString?: string;
  imageCaption?: string;
  imageSearchTerm?: string;
  discoverySignals?: string[];
  relatedEntities?: any[];
  metadataMode?: 'historical_site' | 'modern_place' | 'natural_feature';
  coordinates: GeoCoordinates;
  boundary?: GeoCoordinates[];
  pipelineVersion?: number;
  status?: "loading" | "success" | "error";
  errorMessage?: string;
  news: NewsItem[];
  routeContext?: {
    title: string;
    text: string;
  };
  defaultNote?: string;
  provenance?: ProvenanceRecord[];
  newsError?: string;
  waypoint?: Waypoint;
  sectionState?: {
    description: "loading" | "ready" | "failed";
    news: "loading" | "ready" | "failed";
    images: "loading" | "ready" | "failed";
    nearby: "loading" | "ready" | "failed";
  };
}

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  populationClass: 'large' | 'medium' | 'small'; // Affects dot size
  type?: string;
  country?: string;
  state?: string;
  discoverySignals?: string[];
  city?: string;
  metadataMode?: string;
  population?: any;
  climate?: any;
  funFacts?: string[];
  isAnchor?: boolean;
  provenance?: string;
  wikidataId?: string;
  populationStatus?: string;
  populationSource?: string;
}

export interface Candidate {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  type: string;
  isAnchor?: boolean;
  providers: string[];
  rawProviders: Record<string, any>;
  
  importanceScore?: number;
  confidenceScore?: number;
  scoreBreakdown?: any;

  pipelineStatus: "collected" | "normalized" | "merged" | "scored" | "quality_gated" | "selected" | "rejected";
  rejectionReason?: string;
  
  tier?: number;
  entityClass?: string;
  distanceBand?: 'local' | 'regional' | 'extended';
  distanceKm?: number;
  settlementConfidence?: number;
  population?: any;
  populationClass?: 'large' | 'medium' | 'small';
  country?: string;
  state?: string;
  city?: string;
  discoverySignals?: string[];
  identifiers?: {
    wikipediaId?: string;
    wikidataId?: string;
    osmId?: string;
    [key: string]: string | undefined;
  };
}
export interface SearchResult {
  locationInfo?: LocationInfo | Partial<LocationInfo>;
  suggestedZoom?: number;
  error?: "NOT_FOUND" | "AMBIGUOUS" | "TEMP_FAILURE" | "NO_GEOGRAPHIC_DATA" | "UNABLE_TO_RESOLVE" | "LOCATION_SYSTEM_UNAVAILABLE";
}

export interface ResolverResult {
    strategy: string;
    confidence: number;
    subjectType: string;
    canonicalName: string;
    resolvedName: string;
    displayName: string;
    coordinates: { lat: number; lng: number };
    geographicSource?: string;
    originalEntityType?: string;
    suggestedZoom?: number;
    metadataMode?: string;
    diagnostics: any;
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

export interface Route {
  title?: string;
  routeType?: 'single_location' | 'regional_event' | 'multi_location_campaign' | 'fixed_path' | 'network' | 'conceptual' | 'point';
  waypoints: Waypoint[];
  routeConfidence?: {
    level: 'high' | 'medium' | 'low';
    reasoning: string;
  };
}

export interface Waypoint {
  id: string;
  name: string;
  canonicalName?: string;
  historicalRegion?: string;
  modernLocation?: string;
  lat: number;
  lng: number;
  context: string;
  entityType?: string;
  discoverySignals?: string[];
  role?: "primary" | "related" | "administrative" | "historical_context";
  parentId?: string;
  sequence?: number;
  alternateNames?: string[];
  routeTitle?: string;
  description?: string;
  significance?: string;
  highlights?: string[];
  historicalPeriod?: string;
  entities?: string[];
  notable?: NotableItem[];
  historicalConfidence?: {
    level: 'high' | 'medium' | 'low';
    reasoning: string;
  };
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

import { ResolvedEntity } from './domain';

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