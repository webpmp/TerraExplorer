import { Candidate } from '../../types';
import { calculateDistanceKm } from './geographicDistance';

export interface ScanOrigin {
  lat: number;
  lng: number;
}

export interface DisplayRelevanceResult {
  accepted: Candidate[];
  rejected: { candidate: Candidate; reason: string; distanceKm: number; displayRadiusKm: number }[];
}

/**
 * Returns the maximum display radius in km for a candidate based on its classification and tier.
 */
export function getCategoryDisplayRadius(candidate: Candidate): number {
  if (candidate.isAnchor) {
    return 100;
  }

  const rankingClass = candidate.rankingClass || 
    (candidate.entityClass === 'settlement' ? 'POPULATED_PLACE' : 
     candidate.entityClass === 'geographic_feature' ? 'GEOGRAPHIC_FEATURE' : 'OTHER');
  
  const tier = candidate.tier ?? 3;

  if (rankingClass === 'POPULATED_PLACE') {
    // Populated places:
    // Tier 1: Major city / regional capital (e.g. Siak Sri Indrapura, Abilene) -> 100 km
    // Tier 2: Town / intermediate municipality (e.g. Eugene, Cottage Grove, Pangkalan Kerinci) -> 80 km
    // Tier 3: Small town / village / hamlet (e.g. Dorena, Pangkalan Bunut) -> 50 km
    if (tier === 1) return 100;
    if (tier === 2) return 80;
    return 50;
  }

  if (rankingClass === 'GEOGRAPHIC_FEATURE') {
    // Geographic features:
    // Tier 1: Prominent national park, major mountain, lake, etc. (e.g. Zamrud NP, Tesso Nilo NP) -> 110 km
    // Tier 2: Regional park / natural feature -> 75 km
    // Tier 3: Local landmark / hill / stream -> 50 km
    if (tier === 1) return 110;
    if (tier === 2) return 75;
    return 50;
  }

  if (rankingClass === 'POI') {
    return 35;
  }

  // Generic fallback
  return 50;
}

/**
 * Validates coordinates and filters candidates against the display radius measured from the original scanOrigin.
 * Outputs the required diagnostic logs.
 */
export function filterCandidatesByDisplayRelevance(
  candidates: Candidate[],
  scanOrigin: ScanOrigin
): DisplayRelevanceResult {
  const originLat = scanOrigin.lat;
  const originLng = scanOrigin.lng;

  console.log(`[Geographic Relevance] ORIGIN lat=${originLat.toFixed(4)} lng=${originLng.toFixed(4)}`);

  const accepted: Candidate[] = [];
  const rejected: { candidate: Candidate; reason: string; distanceKm: number; displayRadiusKm: number }[] = [];

  for (const candidate of candidates) {
    const lat = candidate.coordinates?.lat;
    const lng = candidate.coordinates?.lng;

    // 1. Coordinate validity check
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      console.log(`[Geographic Relevance] CANDIDATE name="${candidate.name}" distance=NaNkm displayRadius=0km decision=REJECT reason=INVALID_COORDINATES`);
      rejected.push({ candidate, reason: 'INVALID_COORDINATES', distanceKm: NaN, displayRadiusKm: 0 });
      continue;
    }

    // 2. Accurate Great-Circle Distance from Scan Origin
    const distanceKm = calculateDistanceKm(originLat, originLng, lat, lng);
    candidate.distanceKm = distanceKm;

    // 3. Category-specific display radius
    const displayRadiusKm = getCategoryDisplayRadius(candidate);

    if (distanceKm <= displayRadiusKm) {
      console.log(`[Geographic Relevance] CANDIDATE name="${candidate.name}" distance=${distanceKm.toFixed(1)}km displayRadius=${displayRadiusKm}km decision=ACCEPT`);
      accepted.push(candidate);
    } else {
      console.log(`[Geographic Relevance] CANDIDATE name="${candidate.name}" distance=${distanceKm.toFixed(1)}km displayRadius=${displayRadiusKm}km decision=REJECT reason=OUTSIDE_DISPLAY_RADIUS`);
      rejected.push({ candidate, reason: 'OUTSIDE_DISPLAY_RADIUS', distanceKm, displayRadiusKm });
    }
  }

  console.log(`[Geographic Relevance] FINAL accepted=${accepted.length} rejected=${rejected.length}`);

  return { accepted, rejected };
}
