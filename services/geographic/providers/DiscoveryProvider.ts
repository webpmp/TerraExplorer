import { MapMarker, Candidate } from '../../../types';

export type ProviderExecutionStatus = 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'RATE_LIMITED' | 'TIMEOUT' | 'FAILED';

export interface DiscoveryContext {
  lat: number;
  lng: number;
  radiusKm: number;
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  region?: string;
  displayName?: string;
}

export interface DiscoveryProvider {
  name: string;
  lastStatus?: ProviderExecutionStatus;
  lastStatusMessage?: string;
  searchNearby(context: DiscoveryContext): Promise<MapMarker[] | Candidate[]>;
}
