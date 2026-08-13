import { DETERMINISTIC_LOCATION_DB } from './geographicData';
import { normalizeGeographicQuery } from './geographicNormalization';
import { resolveAlias } from './geographicAliases';
import { 
  EXACT_MATCH_BONUS, ADDRESS_RANK_BONUS, LOW_PRECISION_PENALTY, 
  LOW_CONFIDENCE_THRESHOLD, AMBIGUITY_THRESHOLD, CATCH_ALL_PENALTY,
  ConfidenceDescriptions 
} from './geographicConfidence';
import { recordResolution, recordAliasMatch, recordValidationFailure } from './geographicMetrics';
import { validateGeographicResolution } from './geographicValidation';

export const GeographicSource = {
  CACHE: "cache",
  NOMINATIM: "nominatim",
  AI_FALLBACK: "ai-fallback",
  MANUAL: "manual"
} as const;

export type GeographicSourceType = typeof GeographicSource[keyof typeof GeographicSource];

export interface ConfidenceAdjustment {
  rule: string;
  delta: number;
  description: string;
}

export interface GeographicDiagnostics {
  resolverVersion: number;
  matchedName: string;
  confidenceAdjustments: ConfidenceAdjustment[];
  warnings: string[];
  ambiguity: {
      detected: boolean;
      candidates: Array<{ name: string; confidence: number }>;
  };
  rawImportance?: number;
  addressRank?: number;
}

/**
 * GeographicResolution — the result of provider-independent geographic resolution.
 */
export interface GeographicResolution {
  name: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  entityType?: string;
  source: GeographicSourceType;
  confidence?: number;
  suggestedZoom?: number;
  normalizedQuery: string;
  context?: {
    country?: string;
    state?: string;
    city?: string;
  };
  diagnostics: GeographicDiagnostics;
}

const nominatimCache = new Map<string, GeographicResolution>();

export function _clearNominatimCache(): void {
  nominatimCache.clear();
}

export function _getNominatimCacheSize(): number {
  return nominatimCache.size;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  class: string;
  type: string;
  importance: number;
  address_rank?: number;
  place_rank?: number;
  address?: {
    country?: string;
    state?: string;
    region?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
}

export function normalizeNominatimEntityType(osmClass: string, osmType: string): string {
  if (osmClass === 'place') {
    switch (osmType) {
      case 'city': case 'town': case 'village': case 'hamlet': return 'city';
      case 'country': return 'country';
      case 'state': case 'region': case 'province': return 'state';
      case 'continent': case 'island': return 'natural_feature';
      case 'ocean': case 'sea': return 'ocean';
      default: return 'landmark';
    }
  }
  if (osmClass === 'natural') {
    switch (osmType) {
      case 'peak': case 'volcano': case 'mountain_range': return 'mountain';
      case 'water': case 'bay': case 'strait': case 'cape': case 'coastline': case 'cliff': case 'ridge': return 'natural_feature';
      default: return 'natural_feature';
    }
  }
  if (osmClass === 'waterway') return 'natural_feature';
  if (osmClass === 'tourism') {
    switch (osmType) {
      case 'museum': return 'museum';
      case 'attraction': case 'viewpoint': case 'gallery': return 'landmark';
      default: return 'landmark';
    }
  }
  if (osmClass === 'historic') {
    switch (osmType) {
      case 'castle': case 'fort': case 'ruins': case 'monument': case 'memorial': case 'archaeological_site': return 'archaeological_site';
      case 'battlefield': return 'battlefield';
      case 'museum': return 'museum';
      default: return 'historical_event_site';
    }
  }
  if (osmClass === 'amenity' && osmType === 'museum') return 'museum';
  if (osmClass === 'boundary') return 'state';
  return 'landmark';
}

export function calculateNominatimConfidence(result: NominatimResult, query: string): { score: number, reasons: ConfidenceAdjustment[] } {
  let score = Math.max(result.importance, 0.05);
  const reasons: ConfidenceAdjustment[] = [];

  const normalizedQuery = normalizeGeographicQuery(query);
  const normalizedName = normalizeGeographicQuery(result.name || '');
  const normalizedDisplay = normalizeGeographicQuery(result.display_name || '');
  
  if (normalizedName === normalizedQuery || normalizedDisplay.startsWith(normalizedQuery)) {
    score += EXACT_MATCH_BONUS;
    reasons.push({ rule: 'exact-name-match', delta: EXACT_MATCH_BONUS, description: ConfidenceDescriptions.EXACT_MATCH });
  }

  if (result.address_rank !== undefined && result.address_rank <= 16) {
    score += ADDRESS_RANK_BONUS;
    reasons.push({ rule: 'address-rank-bonus', delta: ADDRESS_RANK_BONUS, description: ConfidenceDescriptions.ADDRESS_RANK });
  }

  const lowPrecisionTypes = ['neighbourhood', 'suburb', 'locality', 'quarter', 'borough', 'city_block'];
  if (lowPrecisionTypes.includes(result.type)) {
    score += LOW_PRECISION_PENALTY;
    reasons.push({ rule: 'low-precision-penalty', delta: LOW_PRECISION_PENALTY, description: ConfidenceDescriptions.LOW_PRECISION });
  }

  if (result.type === 'yes' || (result.class === 'boundary' && !['administrative', 'political'].includes(result.type))) {
    score += CATCH_ALL_PENALTY;
    reasons.push({ rule: 'catch-all-penalty', delta: CATCH_ALL_PENALTY, description: ConfidenceDescriptions.CATCH_ALL });
  }

  return { score: Math.min(Math.max(score, 0.0), 1.0), reasons };
}

function suggestZoomFromNominatim(result: NominatimResult): number {
  const rank = result.address_rank ?? result.place_rank ?? 30;
  if (rank <= 8) return 4;
  if (rank <= 12) return 5;
  if (rank <= 14) return 6;
  if (rank <= 16) return 8;
  if (rank <= 18) return 9;
  if (rank <= 22) return 11;
  if (result.class === 'natural' || result.class === 'historic' || result.class === 'tourism') return 9;
  return 10;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'TerraExplorer/1.0 (educational globe application)';
const NOMINATIM_TIMEOUT_MS = 5000;

function logDiagnostics(res: GeographicResolution) {
  if (process.env.GEOGRAPHIC_DEBUG_LOGGING === 'true') {
    console.log(`[Geo]\nQuery:\n"${res.normalizedQuery}"\nMatched:\n"${res.diagnostics.matchedName}"\nSource:\n${res.source}\nConfidence:\n${res.confidence?.toFixed(2)}\nWarnings:\n${res.diagnostics.warnings.length ? res.diagnostics.warnings.join(', ') : 'none'}`);
  }
}

let lastNominatimRequestTime = 0;
const pendingRequests = new Map<string, Promise<any>>();

async function fetchNominatimThrottled(url: string): Promise<any> {
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url);
  }

  const reqPromise = (async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastNominatimRequestTime;
    if (timeSinceLastRequest < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
    }
    lastNominatimRequestTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    
    let response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      return null;
    }
    
    clearTimeout(timeoutId);
    
    if (response.status === 429) {
      return { _rate_limited: true };
    }
    
    if (!response.ok) return null;
    
    return await response.json();
  })();

  pendingRequests.set(url, reqPromise);
  
  try {
    const result = await reqPromise;
    return result;
  } finally {
    pendingRequests.delete(url);
  }
}

async function queryNominatim(query: string, normalizedQuery: string): Promise<GeographicResolution | null | { status: 'rate_limited', result: null }> {
  const params = new URLSearchParams({
    q: query, format: 'jsonv2', limit: '3', 'accept-language': 'en', addressdetails: '1',
  });

  const url = `${NOMINATIM_BASE_URL}?${params.toString()}`;
  
  const results = await fetchNominatimThrottled(url);
  
  if (results && results._rate_limited) {
    return { status: 'rate_limited', result: null };
  }

  if (!Array.isArray(results) || results.length === 0) return null;

  const scored = results.map(r => {
    const conf = calculateNominatimConfidence(r, query);
    return { result: r, confidence: conf.score, reasons: conf.reasons };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (best.confidence < LOW_CONFIDENCE_THRESHOLD) return null;

  const r = best.result;
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const entityType = normalizeNominatimEntityType(r.class, r.type);
  const suggestedZoom = suggestZoomFromNominatim(r);

  const warnings: string[] = [];
  const ambiguityCandidates = [];
  let isAmbiguous = false;
  
  if (scored.length > 1) {
    for (let i = 1; i < scored.length; i++) {
      if (best.confidence - scored[i].confidence <= AMBIGUITY_THRESHOLD) {
        isAmbiguous = true;
        ambiguityCandidates.push({ name: scored[i].result.display_name, confidence: scored[i].confidence });
      }
    }
  }
  
  if (isAmbiguous) {
    warnings.push("Ambiguous geographic match");
    ambiguityCandidates.unshift({ name: best.result.display_name, confidence: best.confidence });
  }

  const diagnostics: GeographicDiagnostics = {
    resolverVersion: 1,
    matchedName: r.display_name,
    confidenceAdjustments: best.reasons,
    warnings,
    ambiguity: { detected: isAmbiguous, candidates: ambiguityCandidates },
    rawImportance: r.importance,
    addressRank: r.address_rank
  };

  const context = {
    country: r.address?.country,
    state: r.address?.state || r.address?.region,
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.county
  };

  return {
    name: r.display_name,
    coordinates: { lat, lng },
    entityType,
    source: GeographicSource.NOMINATIM,
    confidence: best.confidence,
    suggestedZoom,
    normalizedQuery,
    context,
    diagnostics
  };
}

export interface ReverseGeocodeContext {
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  region?: string;
  feature?: string;
  displayName?: string;
}

const reverseCache = new Map<string, ReverseGeocodeContext>();

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeContext | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey) || null;
  }

  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'jsonv2',
    'accept-language': 'en'
  });
  
  const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
  
  const result = await fetchNominatimThrottled(url);
  
  if (result && result._rate_limited) {
    return null; // Rate limiting gracefully fails reverse geocoding
  }

  if (!result || (!result.address && !result.display_name)) return null;

  const addr = result.address;
  const context: ReverseGeocodeContext = {
    country: addr?.country,
    state: addr?.state,
    county: addr?.county,
    city: addr?.city,
    town: addr?.town,
    village: addr?.village,
    municipality: addr?.municipality,
    region: addr?.region,
    feature: addr?.natural || addr?.waterway || addr?.park || addr?.landmark || addr?.leisure || addr?.aeroway || addr?.tourism || addr?.historic,
    displayName: result.display_name
  };

  console.log("[REVERSE GEOCODE NORMALIZED]", JSON.stringify({
    original: result.display_name,
    normalized: context
  }, null, 2));

  if (process.env.GEOGRAPHIC_DEBUG_LOGGING === 'true') {
    console.log(`[Geo Reverse Lookup]\nCoordinates:\nlat: ${lat}\nlng: ${lng}\nResolved:\ncountry: ${context.country || 'N/A'}\nstate: ${context.state || 'N/A'}\ncity: ${context.city || 'N/A'}`);
  }

  reverseCache.set(cacheKey, context);
  return context;
}


export async function resolveGeographicEntity(query: string): Promise<GeographicResolution | null | { status: 'rate_limited', result: null }> {
  if (!query || typeof query !== 'string') return null;
  const startMs = Date.now();

  const normalizedQuery = normalizeGeographicQuery(query);
  const aliasInfo = resolveAlias(normalizedQuery);
  const cacheKey = aliasInfo.canonical;

  if (aliasInfo.aliasApplied) {
    recordAliasMatch();
  }

  const match = DETERMINISTIC_LOCATION_DB[cacheKey];

  if (match) {
    const res: GeographicResolution = {
      name: match.name,
      coordinates: { lat: match.lat, lng: match.lng },
      entityType: match.entityType,
      source: GeographicSource.CACHE,
      confidence: 1.0,
      suggestedZoom: match.suggestedZoom,
      normalizedQuery,
      diagnostics: {
        resolverVersion: 1,
        matchedName: match.name,
        confidenceAdjustments: [],
        warnings: [],
        ambiguity: { detected: false, candidates: [] }
      }
    };
    if (aliasInfo.aliasApplied) res.diagnostics.warnings.push(`Alias applied: ${aliasInfo.original} -> ${aliasInfo.canonical}`);
    
    const validation = validateGeographicResolution(res);
    if (!validation.valid) {
      recordValidationFailure();
      res.diagnostics.warnings.push(...validation.warnings);
      logDiagnostics(res);
      recordResolution({ source: res.source, confidence: res.confidence || 1.0, ambiguous: false, durationMs: Date.now() - startMs });
      return null;
    }

    logDiagnostics(res);
    recordResolution({ source: res.source, confidence: res.confidence || 1.0, ambiguous: false, durationMs: Date.now() - startMs });
    return res;
  }

  const cached = nominatimCache.get(cacheKey);
  if (cached !== undefined) {
    if (cached === null) return null;
    const validation = validateGeographicResolution(cached);
    if (!validation.valid) {
      recordValidationFailure();
      return null;
    }
    logDiagnostics(cached);
    recordResolution({ source: cached.source, confidence: cached.confidence || 1.0, ambiguous: cached.diagnostics.ambiguity.detected, durationMs: Date.now() - startMs });
    return cached;
  }

  const nominatimResult = await queryNominatim(aliasInfo.canonical, normalizedQuery);
  
  if (nominatimResult && 'status' in nominatimResult && nominatimResult.status === 'rate_limited') {
    return nominatimResult;
  }
  
  if (nominatimResult && !('status' in nominatimResult)) {
    if (aliasInfo.aliasApplied) nominatimResult.diagnostics.warnings.push(`Alias applied: ${aliasInfo.original} -> ${aliasInfo.canonical}`);
    
    const validation = validateGeographicResolution(nominatimResult);
    if (!validation.valid) {
      recordValidationFailure();
      nominatimResult.diagnostics.warnings.push(...validation.warnings);
      logDiagnostics(nominatimResult);
      recordResolution({ source: nominatimResult.source, confidence: nominatimResult.confidence || 1.0, ambiguous: nominatimResult.diagnostics.ambiguity.detected, durationMs: Date.now() - startMs });
      nominatimCache.set(cacheKey, null);
      return null;
    }

    nominatimCache.set(cacheKey, nominatimResult);
    logDiagnostics(nominatimResult);
    recordResolution({ source: nominatimResult.source, confidence: nominatimResult.confidence || 1.0, ambiguous: nominatimResult.diagnostics.ambiguity.detected, durationMs: Date.now() - startMs });
    return nominatimResult;
  }

  nominatimCache.set(cacheKey, null);
  return null;
}

export async function resolveWithContext(
  query: string,
  context?: {
    country?: string;
    state?: string;
    city?: string;
  }
): Promise<{ resolution: GeographicResolution | null, queryUsed: string, rateLimited?: boolean }> {
  let primaryResolution = await resolveGeographicEntity(query);
  if (primaryResolution && 'status' in primaryResolution && primaryResolution.status === 'rate_limited') {
    return { resolution: null, queryUsed: query, rateLimited: true };
  }
  
  if (primaryResolution && !('status' in primaryResolution)) {
    return { resolution: primaryResolution, queryUsed: query };
  }

  if (!context || (!context.country && !context.state && !context.city)) {
    return { resolution: null, queryUsed: query };
  }

  // 2. Full context
  const fullContextParts = [query];
  if (context.city) fullContextParts.push(context.city);
  if (context.state) fullContextParts.push(context.state);
  if (context.country) fullContextParts.push(context.country);
  
  const fullContextQuery = fullContextParts.join(', ');
  if (fullContextQuery !== query) {
    let fullResult = await resolveGeographicEntity(fullContextQuery);
    if (fullResult && 'status' in fullResult && fullResult.status === 'rate_limited') {
        return { resolution: null, queryUsed: fullContextQuery, rateLimited: true };
    }
    if (fullResult && !('status' in fullResult)) {
       return { resolution: fullResult, queryUsed: fullContextQuery };
    }
  }

  // 3. Country only fallback
  if (context.country && context.country !== context.state && context.country !== context.city) {
    const countryContextQuery = `${query}, ${context.country}`;
    if (countryContextQuery !== fullContextQuery && countryContextQuery !== query) {
      let contextResolution = await resolveGeographicEntity(countryContextQuery);
      if (contextResolution && 'status' in contextResolution && contextResolution.status === 'rate_limited') {
        return { resolution: null, queryUsed: countryContextQuery, rateLimited: true };
      }
      if (contextResolution && !('status' in contextResolution) && contextResolution.confidence !== undefined && contextResolution.confidence >= LOW_CONFIDENCE_THRESHOLD) {
        return { resolution: contextResolution, queryUsed: countryContextQuery };
      }
    }
  }

  return { resolution: null, queryUsed: query };
}

import { MapMarker } from '../../types';

export function isPopulationBearingEntity(entityType?: string, entityName?: string): boolean {
  if (!entityType) return false;
  const eligibleTypes = ['city', 'town', 'village', 'municipality', 'county', 'district', 'settlement', 'major_city'];
  
  if (!eligibleTypes.includes(entityType)) return false;
  
  if (entityName) {
      const lowerName = entityName.toLowerCase();
      const landmarkKeywords = ['courthouse', 'cathedral', 'museum', 'bridge', 'park', 'monument', 'trail', 'memorial', 'church', 'castle', 'temple', 'stadium', 'lighthouse', 'visitor center'];
      if (landmarkKeywords.some(keyword => lowerName.includes(keyword))) {
          return false;
      }
  }
  return true;
}


export async function resolveGeographicMetadata(marker: MapMarker): Promise<MapMarker> {
  const result = { ...marker };
  
  result.populationStatus = "pending";

  // 1. Reverse Geocoder (OSM Nominatim)
  const geocodeResult = await reverseGeocode(marker.lat, marker.lng);
  if (geocodeResult) {
    result.country = result.country ?? geocodeResult.country;
    result.state = result.state ?? geocodeResult.state;
    result.city = result.city ?? geocodeResult.city;
    if (!result.type && geocodeResult.type) {
      result.type = geocodeResult.type; // Fallback feature type
    }
  }

  // 2. Validate Entity Classification First
  const originalType = result.type || 'unknown';
  
  let resolvedMetadataMode: 'modern_place' | 'natural_feature' | 'historical_site' | 'country' | 'point_of_interest' = 'point_of_interest';
  
  if (originalType === 'historical_waypoint' || originalType === 'historic_site' || originalType === 'historical_event_site') {
      // Historical places can still have modern metadata if they resolve to a modern place.
      if (['city', 'town', 'village', 'municipality', 'county', 'district', 'settlement', 'major_city'].includes(result.type as string)) {
          resolvedMetadataMode = 'modern_place';
      } else {
          resolvedMetadataMode = 'historical_site';
      }
  } else if (originalType === 'country' || result.type === 'country') {
      resolvedMetadataMode = 'country';
  } else if (['mountain', 'natural_feature', 'river', 'body_of_water', 'protected_area'].includes(originalType) || ['mountain', 'natural_feature', 'river', 'water', 'forest'].includes(result.type || '')) {
      resolvedMetadataMode = 'natural_feature';
  } else if (['major_city', 'city', 'town', 'village', 'municipality', 'settlement'].includes(originalType) || ['major_city', 'city', 'town', 'village', 'municipality', 'settlement'].includes(result.type || '')) {
      resolvedMetadataMode = 'modern_place';
  } else {
      resolvedMetadataMode = 'point_of_interest';
  }
  
  result.metadataMode = resolvedMetadataMode;

  if (result.type === 'major_city' || result.type === 'city' || !result.type) {
      const lowerName = result.name.toLowerCase();
      const landmarkKeywords = ['courthouse', 'cathedral', 'museum', 'bridge', 'park', 'monument', 'trail', 'memorial', 'church', 'castle', 'temple', 'stadium', 'lighthouse', 'visitor center'];
      if (landmarkKeywords.some(keyword => lowerName.includes(keyword))) {
          result.type = 'landmark';
          result.metadataMode = 'point_of_interest';
      }
  }

  // 3. Wikidata & Fallbacks (Population, notable facts)
  console.log("POPULATION_LOOKUP_STARTED");
  const isEligible = isPopulationBearingEntity(result.type, result.name);
  console.log(`POPULATION_ENTITY_CLASSIFIED\n{\n name: "${result.name}",\n originalType: "${originalType}",\n normalizedType: "${result.type}",\n eligible: ${isEligible}\n}`);
  
  if (!isEligible) {
      delete (result as any).populationStatus;
      delete (result as any).populationSource;
      delete (result as any).populationData;
      result.population = { value: null, source: null, status: "not_applicable" };
      console.log(`POPULATION_NOT_AVAILABLE\n{\n entity: "${result.name}",\n attemptedSources: []\n}`);
  } else {
      let popFound = false;
      const attemptedSources: string[] = [];

      // 3.1 Wikidata P1082
      attemptedSources.push("Wikidata P1082");
      console.log(`POPULATION_SOURCE_ATTEMPT\n{\n source: "Wikidata P1082",\n entity: "${result.name}"\n}`);
      try {
         const searchRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(marker.name)}&language=en&format=json&origin=*`);
         if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.search && searchData.search.length > 0) {
                const entityId = searchData.search[0].id;
                result.wikidataId = entityId;
                
                const entityRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&property=P1082&format=json&origin=*`);
                if (entityRes.ok) {
                    const entityData = await entityRes.json();
                    const claims = entityData.claims;
                    if (claims && claims.P1082 && claims.P1082.length > 0) {
                        const popValue = claims.P1082[0].mainsnak?.datavalue?.value?.amount;
                        if (popValue !== undefined) {
                            const popNum = parseInt(popValue.replace('+', ''), 10);
                            if (!isNaN(popNum)) {
                                result.population = { value: popNum, source: "Wikidata P1082", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                                console.log(`POPULATION_FOUND\n{\n source: "Wikidata P1082",\n value: ${popNum}\n}`);
                                popFound = true;
                            }
                        }
                    }
                }
            }
         }
      } catch (e) {
         console.warn("Wikidata lookup failed", e);
      }
      
      // 3.2 Wikipedia infobox population field
      if (!popFound) {
          attemptedSources.push("Wikipedia Infobox");
          console.log(`POPULATION_SOURCE_ATTEMPT\n{\n source: "Wikipedia Infobox",\n entity: "${result.name}"\n}`);
          try {
             const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(marker.name)}&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&redirects=1`);
             if (wikiRes.ok) {
                 const wikiData = await wikiRes.json();
                 const pages = wikiData.query?.pages;
                 if (pages) {
                     const pageId = Object.keys(pages)[0];
                     if (pageId !== "-1") {
                         const content = pages[pageId].revisions?.[0]?.slots?.main?.["*"];
                         if (content) {
                             const popMatch = content.match(/population_total\s*=\s*([\d,]+)/i);
                             if (popMatch && popMatch[1]) {
                                 const popNum = parseInt(popMatch[1].replace(/,/g, ''), 10);
                                 if (!isNaN(popNum)) {
                                     result.population = { value: popNum, source: "Wikipedia Infobox", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                                     console.log(`POPULATION_FOUND\n{\n source: "Wikipedia Infobox",\n value: ${popNum}\n}`);
                                     popFound = true;
                                 }
                             }
                         }
                     }
                 }
             }
          } catch (e) {
             console.warn("Wikipedia lookup failed", e);
          }
      }

      // 3.3 Major City Dataset Fallback
      if (!popFound) {
          attemptedSources.push("Major City Dataset");
          console.log(`POPULATION_SOURCE_ATTEMPT\n{\n source: "Major City Dataset",\n entity: "${result.name}"\n}`);
          
          const searchName = result.name.toLowerCase().split(',')[0].trim();
          const dbEntry = DETERMINISTIC_LOCATION_DB[searchName];
          
          if (dbEntry && dbEntry.population) {
              result.population = { value: dbEntry.population, source: "Deterministic DB", status: "available", current: { formattedValue: dbEntry.population.toLocaleString(), description: `Known major city dataset` } };
              console.log(`POPULATION_FOUND\n{\n source: "Major City Dataset",\n value: ${dbEntry.population}\n}`);
              popFound = true;
          }
      }
      // (Removed malformed double Wikipedia block)

      // 3.3 OpenStreetMap place metadata
      if (!popFound) {
          attemptedSources.push("OSM Place Metadata");
          console.log(`POPULATION_SOURCE_ATTEMPT\n{\n source: "OSM Place Metadata",\n entity: "${result.name}"\n}`);
          try {
              const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(marker.name)}&format=jsonv2&extratags=1&limit=1`);
              if (osmRes.ok) {
                  const osmDataList = await osmRes.json();
                  if (osmDataList && osmDataList.length > 0) {
                      const place = osmDataList[0];
                      if (place.extratags && place.extratags.population) {
                          const popNum = parseInt(place.extratags.population, 10);
                          if (!isNaN(popNum)) {
                              result.population = { value: popNum, source: "OSM Place Metadata", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                              console.log(`POPULATION_FOUND\n{\n source: "OSM Place Metadata",\n value: ${popNum}\n}`);
                              popFound = true;
                          }
                      }
                  }
              }
          } catch(e) {
              console.warn("OSM Place Metadata lookup failed", e);
          }
      }

      // 3.4 Coordinate-based settlement lookup
      if (!popFound) {
          attemptedSources.push("Reverse Geocoding Settlement");
          console.log(`POPULATION_SOURCE_ATTEMPT\n{\n source: "Reverse Geocoding Settlement",\n entity: "${result.name}"\n}`);
          try {
              const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${marker.lat}&lon=${marker.lng}&format=jsonv2&zoom=10&extratags=1`);
              if (revRes.ok) {
                  const revData = await revRes.json();
                  if (revData && revData.extratags && revData.extratags.population) {
                      const popNum = parseInt(revData.extratags.population, 10);
                      if (!isNaN(popNum)) {
                          result.population = { value: popNum, source: "Reverse Geocoding Settlement", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                          console.log(`POPULATION_FOUND\n{\n source: "Reverse Geocoding Settlement",\n value: ${popNum}\n}`);
                          popFound = true;
                      }
                  }
              }
          } catch(e) {
              console.warn("Reverse geocoding settlement lookup failed", e);
          }
      }
      
      if (!popFound) {
          result.population = { value: null, source: null, status: "lookup_failed" };
          console.log(`POPULATION_NOT_AVAILABLE\n{\n entity: "${result.name}",\n attemptedSources: ${JSON.stringify(attemptedSources)}\n}`);
      }
      
      delete (result as any).populationStatus;
      delete (result as any).populationSource;
      delete (result as any).populationData;
  }

  // 4. Climate Data Resolution
  console.log("CLIMATE_LOOKUP_STARTED");
  if (resolvedMetadataMode === 'modern_place' || resolvedMetadataMode === 'country' || resolvedMetadataMode === 'natural_feature') {
      let climateFound = false;
      const searchName = result.name.toLowerCase().split(',')[0].trim();
      const dbEntry = DETERMINISTIC_LOCATION_DB[searchName];
      
      if (dbEntry && dbEntry.climate) {
          result.climate = { 
              value: dbEntry.climate.koppenCode,
              description: dbEntry.climate.description,
              source: "Major City Dataset"
          };
          console.log(`CLIMATE_FOUND\n{\n source: "Major City Dataset",\n koppenCode: "${dbEntry.climate.koppenCode}",\n description: "${dbEntry.climate.description}"\n}`);
          climateFound = true;
      }
      
      if (!climateFound) {
          // If we can't find it in our fast DB, default to unavailable, but don't crash
          console.log(`CLIMATE_NOT_AVAILABLE\n{\n entity: "${result.name}"\n}`);
          result.climate = undefined;
      }
  }


  // 3. Wikipedia (Description and Image)
  try {
     const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(marker.name)}&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=400&format=json&origin=*&redirects=1`);
     if (wikiRes.ok) {
         const wikiData = await wikiRes.json();
         const pages = wikiData.query?.pages;
         if (pages) {
             const pageId = Object.keys(pages)[0];
             if (pageId !== "-1") {
                 const page = pages[pageId];
                 if (page.extract) {
                     (result as any).description = (result as any).description ?? page.extract;
                 }
                 if (page.thumbnail?.source) {
                     (result as any).image = (result as any).image ?? page.thumbnail.source;
                 }
             }
         }
     }
  } catch (e) {
     console.warn("Wikipedia lookup failed", e);
  }
  


  return result;
}
