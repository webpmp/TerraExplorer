import { MapMarker } from '../../../types';

export interface NearbyPlacesResult {
  places: MapMarker[];
  status: "complete" | "partial" | "error";
  error?: string;
}

export interface GeographicProvider {
  name: string;
  getNearbyPlaces(lat: number, lng: number, radiusKm: number): Promise<NearbyPlacesResult>;
}
