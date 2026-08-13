import { MapMarker, Candidate } from '../../../types';

export interface DiscoveryContext {
  lat: number;
  lng: number;
  radiusKm: number;
  country?: string;
  state?: string;
  county?: string;
  municipality?: string;
}

export interface DiscoveryProvider {
  name: string;
  searchNearby(context: DiscoveryContext): Promise<MapMarker[] | Candidate[]>;
}
