
export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export enum LocationType {
  CONTINENT = 'Continent',
  COUNTRY = 'Country',
  STATE = 'State',
  CITY = 'City',
  OCEAN = 'Ocean',
  POI = 'Point of Interest'
}

export interface NewsItem {
  headline: string;
  source: string;
  url?: string;
}

export interface NotableItem {
  name: string;
  significance: string;
  category?: string; // e.g. "Literature", "Space", "Sports", "Music"
}

export interface LocationInfo {
  name: string;
  type: LocationType;
  description: string;
  population?: string;
  climate?: string;
  funFacts: string[];
  coordinates: GeoCoordinates;
  boundary?: GeoCoordinates[];
  news: NewsItem[];
  notable: NotableItem[];
}

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  populationClass: 'large' | 'medium' | 'small'; // Affects dot size
}

export interface SearchResult {
  locationInfo: LocationInfo;
  suggestedZoom: number;
}

export interface FavoriteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export type SkinType = 'modern' | 'retro-green' | 'retro-amber';
