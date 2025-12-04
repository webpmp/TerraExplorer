import 'react';

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
  summary?: string;
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
  routeContext?: {
    title: string;
    text: string;
  };
  defaultNote?: string;
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

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  context: string;
  routeTitle?: string;
}

export interface FavoriteLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'location' | 'route';
  waypoints?: Waypoint[];
}

export type SkinType = 'modern' | 'retro-green' | 'retro-amber';

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