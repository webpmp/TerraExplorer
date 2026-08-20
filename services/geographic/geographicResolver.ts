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
import { isLowSignificancePoi } from './classification';
import { CoordinateSource, GeographicIdentityStatus } from '../../types';

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
    source?: CoordinateSource;
  };
  entityType?: string;
  source: GeographicSourceType;
  identityStatus?: GeographicIdentityStatus;
  confidence?: number;
  suggestedZoom?: number;
  normalizedQuery: string;
  osmId?: string;
  osmType?: string;
  wikidataId?: string;
  wikipedia?: string;
  context?: {
    country?: string;
    state?: string;
    city?: string;
    county?: string;
    region?: string;
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
  osm_id?: number | string;
  osm_type?: string;
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
    natural?: string;
    waterway?: string;
    park?: string;
    landmark?: string;
    leisure?: string;
    aeroway?: string;
    tourism?: string;
    historic?: string;
  };
  extratags?: Record<string, string>;
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
    q: query, format: 'jsonv2', limit: '3', 'accept-language': 'en', addressdetails: '1', extratags: '1'
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
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.county,
    county: r.address?.county,
    region: r.address?.region
  };

  return {
    name: r.display_name,
    coordinates: { lat, lng, source: "geocoder" },
    entityType,
    source: GeographicSource.NOMINATIM,
    identityStatus: isAmbiguous ? "ambiguous" : "verified",
    confidence: best.confidence,
    suggestedZoom,
    normalizedQuery,
    osmId: r.osm_id !== undefined ? String(r.osm_id) : undefined,
    osmType: r.osm_type ? String(r.osm_type) : undefined,
    wikidataId: r.extratags?.wikidata,
    wikipedia: r.extratags?.wikipedia,
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
  island?: string;
  type?: string;
  displayName?: string;
  osmId?: string;
  osmType?: string;
  wikidataId?: string;
  wikipedia?: string;
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
    'accept-language': 'en',
    addressdetails: '1',
    extratags: '1'
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
    displayName: result.display_name,
    osmId: result.osm_id !== undefined ? String(result.osm_id) : undefined,
    osmType: result.osm_type ? String(result.osm_type) : undefined,
    wikidataId: result.extratags?.wikidata,
    wikipedia: result.extratags?.wikipedia
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

export interface PrimaryEntityResult {
  name: string;
  lat: number;
  lng: number;
  type: string;
  source: 'cache' | 'reverse_geocoder' | 'osm_boundary';
  confidence: 'high' | 'medium';
  reason: string;
  populationClass?: 'large' | 'medium' | 'small';
}export function isAdministrativeContainer(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (/\b(municipality|local municipality|district municipality|regional municipality|metropolitan municipality|regional district|county|county subdivision|ward|parish|township|census area|electoral district|administrative region|governorate|prefecture|canton|subdivision)\b/i.test(n)) {
    return true;
  }
  if (/^(municipality of|regional district of|county of|district of)\s/i.test(n)) {
    return true;
  }
  return false;
}

export function cleanSettlementName(name: string): string {
  if (!name) return '';
  return name.replace(/^(city of|town of|village of)\s+/i, '').trim();
}

export async function resolvePrimaryGeographicEntity(
  lat: number,
  lng: number,
  geoContext?: ReverseGeocodeContext | null
): Promise<PrimaryEntityResult | null> {
  // 1. Fast deterministic DB spatial check for well-known canonical points
  for (const [key, entry] of Object.entries(DETERMINISTIC_LOCATION_DB)) {
    const latDiff = Math.abs(entry.lat - lat);
    const lngDiff = Math.abs(entry.lng - lng);
    const distKm = Math.sqrt(Math.pow(latDiff * 111, 2) + Math.pow(lngDiff * 111, 2));

    let maxDistKm = 15;
    if (entry.entityType === 'national_park' || entry.entityType === 'island' || entry.entityType === 'water_body' || entry.entityType === 'mountain' || entry.entityType === 'natural_feature') {
      maxDistKm = 30;
    }

    if (distKm <= maxDistKm) {
      const cleanName = entry.name.split(',')[0].trim();
      const isFeature = ['national_park', 'mountain', 'water_body', 'natural_feature', 'island'].includes(entry.entityType);
      return {
        name: cleanName,
        lat: entry.lat,
        lng: entry.lng,
        type: entry.entityType,
        source: 'cache',
        confidence: 'high',
        reason: isFeature 
          ? `${cleanName} selected because the clicked coordinate is on a major geographic feature.`
          : `${cleanName} selected because the clicked coordinate is inside the recognized city boundary.`,
        populationClass: entry.population && entry.population > 100000 ? 'large' : (entry.population && entry.population > 25000 ? 'medium' : 'small')
      };
    }
  }

  // 2. If no geoContext or geoContext is completely empty, return null
  if (!geoContext) return null;
  const hasContext = Boolean(
    geoContext.city || geoContext.town || 
    geoContext.feature || geoContext.country || geoContext.state || geoContext.island
  );
  if (!hasContext) return null;

  // 3. Check feature (National Park / Major Landmark / Mountain / Lake / Island)
  if (geoContext.feature && !isLowSignificancePoi(geoContext.feature) && !isAdministrativeContainer(geoContext.feature)) {
    const fName = geoContext.feature;
    const isCountyOrAdmin = isAdministrativeContainer(fName) ||
                           (geoContext.county && fName.toLowerCase() === geoContext.county.toLowerCase()) ||
                           (geoContext.state && fName.toLowerCase() === geoContext.state.toLowerCase());
    if (!isCountyOrAdmin) {
      let fType = 'natural_feature';
      const fLower = fName.toLowerCase();
      if (fLower.includes('national park') || fLower.includes('state park')) fType = 'national_park';
      else if (fLower.includes('lake')) fType = 'water_body';
      else if (fLower.includes('mountain') || fLower.includes('mount') || fLower.includes('peak')) fType = 'mountain';

      return {
        name: fName,
        lat,
        lng,
        type: fType,
        source: 'reverse_geocoder',
        confidence: 'high',
        reason: `${fName} selected because the clicked coordinate is on a major geographic feature.`,
        populationClass: 'small'
      };
    }
  }

  const minorSettlementPattern = /^(nimrod|atwell|chesaw|bard|molson|harder|starbuck|ʻōʻōkala|o'okala|ookala|paʻauilo|paauilo|kahlotus|birdsville)\b/i;

  // 4. Check Major City (ONLY genuinely significant metropolitan cities / capitals)
  if (geoContext.city && !isLowSignificancePoi(geoContext.city) && !isAdministrativeContainer(geoContext.city) && !minorSettlementPattern.test(geoContext.city)) {
    const cityName = cleanSettlementName(geoContext.city);
    const isKnownMajorCity = cityName.match(/^(paris|london|new york|tokyo|cairo|vancouver|seattle|san francisco|los angeles|toronto|montreal|rome|berlin|sydney|melbourne|brisbane|perth|adelaide|beijing|delhi|mumbai|austin|dallas|houston|san antonio|honolulu|hilo|portland|chicago|san diego|cape town|johannesburg)$/i) !== null;

    if (isKnownMajorCity) {
      return {
        name: cityName,
        lat,
        lng,
        type: 'city',
        source: 'reverse_geocoder',
        confidence: 'high',
        reason: `${cityName} selected because the clicked coordinate is inside the recognized city boundary.`,
        populationClass: 'large'
      };
    }
  }

  // 5. Check Major Island
  if (geoContext.island || (geoContext.state === 'Hawaii' && (geoContext.county?.includes('Hawaiʻi') || geoContext.county?.includes('Hawaii')))) {
    const name = geoContext.island || 'Island of Hawaii';
    return {
      name,
      lat,
      lng,
      type: 'island',
      source: 'reverse_geocoder',
      confidence: 'high',
      reason: `${name} selected because the clicked coordinate is on a recognized major island.`,
      populationClass: 'medium'
    };
  }

  // Ordinary towns, villages, and minor settlements return null to continue to regional candidate discovery
  return null;
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
      context: match.context,
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
      return null;
    }

    nominatimCache.set(cacheKey, nominatimResult);
    logDiagnostics(nominatimResult);
    recordResolution({ source: nominatimResult.source, confidence: nominatimResult.confidence || 1.0, ambiguous: nominatimResult.diagnostics.ambiguity.detected, durationMs: Date.now() - startMs });
    return nominatimResult;
  }

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

  result.populationStatus = "pending";

  console.log(`[Entity] Resolving ${marker.name}`);
  
  // 1. Reverse Geocoder (OSM Nominatim)
  const geocodeResult = await reverseGeocode(marker.lat, marker.lng);
  let resolvedProvider = "DeterministicDB"; // default if we had to use the marker's existing data
  
  if (geocodeResult) {
    resolvedProvider = "Nominatim";
    
    // Nominatim takes precedence. Existing values supplement missing fields.
    result.country = geocodeResult.country ?? result.country;
    result.state = geocodeResult.state ?? result.state;
    result.city = geocodeResult.city ?? result.city;
  } else {
    // We rely on whatever deterministic data was passed in the marker.
    if (result.country || result.state || result.city) {
      resolvedProvider = "DeterministicDB";
    } else {
      resolvedProvider = "AI_Fallback";
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

  // 3. Population & notable facts
  await enrichSettlementPopulation(result, marker, originalType);

  // 4. Climate Data Resolution
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
          climateFound = true;
      }
      
      if (!climateFound) {
          result.climate = undefined;
      }
  }

  // 5. Wikipedia (Description and Image)
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
     // Wikipedia lookup error handled gracefully
  }
  
  console.log(`[Entity] ${result.name} resolved`);

  return result;
}

export async function enrichSettlementPopulation(result: any, marker: any, originalType: string): Promise<void> {
  const isEligible = isPopulationBearingEntity(result.type, result.name);
  
  if (!isEligible) {
      delete (result as any).populationStatus;
      delete (result as any).populationSource;
      delete (result as any).populationData;
      result.population = { value: null, source: null, status: "not_applicable" };
  } else {
      let popFound = false;
      const attemptedSources: string[] = [];

      // 1. Explicit marker population (e.g. from Overpass place tags)
      if (marker && marker.population && typeof marker.population === 'number' && marker.population > 0) {
          result.population = { value: marker.population, source: "Overpass OSM", status: "available", current: { formattedValue: marker.population.toLocaleString(), description: `Population as of latest census` } };
          popFound = true;
      }

      // 2. Direct Overpass/Nominatim Place Lookup for the exact settlement
      if (!popFound) {
          attemptedSources.push("OSM Place Metadata");
          try {
              const query = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(result.name)}&format=jsonv2&extratags=1&limit=5`;
              const res = await fetch(query);
              if (res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data)) {
                      for (const place of data) {
                          const pType = (place.type || '').toLowerCase();
                          const pCategory = (place.category || '').toLowerCase();
                          const pAddressType = (place.addresstype || '').toLowerCase();
                          
                          // STRICT SCOPING: Must be a populated settlement, NEVER an administrative container / district / province / state / county
                          const isAdministrative = pCategory === 'boundary' || pType === 'administrative' || ['district', 'county', 'state', 'province', 'region', 'country', 'state_district'].includes(pType) || ['district', 'county', 'state', 'province', 'region', 'country', 'state_district'].includes(pAddressType);
                          const isSettlement = ['city', 'town', 'village', 'municipality', 'hamlet'].includes(pType) || (pCategory === 'place' && !isAdministrative);

                          const cleanPlaceName = (place.name || place.display_name?.split(',')[0] || '').toLowerCase().trim();
                          const cleanResultName = result.name.toLowerCase().split(',')[0].trim();

                          if (!isAdministrative && isSettlement && cleanPlaceName === cleanResultName && place.extratags && place.extratags.population) {
                              const popNum = parseInt(place.extratags.population, 10);
                              if (!isNaN(popNum) && popNum > 0) {
                                  result.population = { value: popNum, source: "OSM Place Metadata", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                                  popFound = true;
                                  break;
                              }
                          }
                      }
                  }
              }
          } catch(e) {
              // Handled gracefully
          }
      }

      // 3. Coordinate-based settlement lookup
      if (!popFound) {
          attemptedSources.push("Reverse Geocoding Settlement");
          try {
              // Use zoom=18 for exact settlement/place level, not zoom=10 (which is state/region level)
              const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${marker.lat}&lon=${marker.lng}&format=jsonv2&zoom=18&extratags=1`);
              if (revRes.ok) {
                  const revData = await revRes.json();
                  const revType = (revData.type || revData.category || revData.addresstype || '').toLowerCase();
                  const isAdministrative = revData.category === 'boundary' || revType === 'administrative' || ['district', 'county', 'state', 'province', 'region', 'country', 'state_district'].includes(revType) || ['district', 'county', 'state', 'province', 'region', 'country', 'state_district'].includes(revData.addresstype || '');
                  const isSettlement = !isAdministrative && ['city', 'town', 'village', 'hamlet', 'municipality'].includes(revType);
                  const cleanRevName = (revData.name || '').toLowerCase().replace(/,\s*[a-z\s]+$/i, '').trim();
                  const cleanResultName = result.name.toLowerCase().replace(/,\s*[a-z\s]+$/i, '').trim();
                  
                  // Only accept if reverse geocoded entity actually matches the settlement name and is a settlement
                  if (isSettlement && cleanRevName === cleanResultName && revData.extratags && revData.extratags.population) {
                      const popNum = parseInt(revData.extratags.population, 10);
                      if (!isNaN(popNum) && popNum > 0) {
                          result.population = { value: popNum, source: "Reverse Geocoding Settlement", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                          popFound = true;
                      }
                  }
              }
          } catch(e) {
              // Handled gracefully
          }
      }

      // 4. Wikidata P1082 (with strict entity description disambiguation)
      if (!popFound) {
          attemptedSources.push("Wikidata P1082");
          try {
             const searchRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(marker.name)}&language=en&format=json&origin=*`);
             if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.search && searchData.search.length > 0) {
                    const validEntity = searchData.search.find((item: any) => {
                        const desc = (item.description || '').toLowerCase();
                        const isDistrictOrRegion = /\b(district|division|province|state|county|region|administrative|tehsil|taluka|department)\b/i.test(desc);
                        return !isDistrictOrRegion;
                    });
                    if (validEntity) {
                        const entityId = validEntity.id;
                        result.wikidataId = entityId;
                        
                        const entityRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&property=P1082&format=json&origin=*`);
                        if (entityRes.ok) {
                            const entityData = await entityRes.json();
                            const claims = entityData.claims;
                            if (claims && claims.P1082 && claims.P1082.length > 0) {
                                const popValue = claims.P1082[0].mainsnak?.datavalue?.value?.amount;
                                if (popValue !== undefined) {
                                    const popNum = parseInt(popValue.replace('+', ''), 10);
                                    if (!isNaN(popNum) && popNum > 0) {
                                        result.population = { value: popNum, source: "Wikidata P1082", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                                        popFound = true;
                                    }
                                }
                            }
                        }
                    }
                }
             }
          } catch (e) {
             // Handled gracefully
          }
      }
      
      // 5. Wikipedia infobox population field
      if (!popFound) {
          attemptedSources.push("Wikipedia Infobox");
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
                             const isDistrictArticle = /subdivision_type\s*=\s*(?:District|Division|County|Province)/i.test(content) && !/settlement_type\s*=\s*(?:City|Town|Village)/i.test(content);
                             if (!isDistrictArticle) {
                                 const popMatch = content.match(/(?:population_total|population_urban|population_city)\s*=\s*([\d,]+)/i);
                                 if (popMatch && popMatch[1]) {
                                     const popNum = parseInt(popMatch[1].replace(/,/g, ''), 10);
                                     if (!isNaN(popNum) && popNum > 0) {
                                         result.population = { value: popNum, source: "Wikipedia Infobox", status: "available", current: { formattedValue: popNum.toLocaleString(), description: `Population as of latest census` } };
                                         popFound = true;
                                     }
                                 }
                             }
                         }
                     }
                 }
             }
          } catch (e) {
             // Handled gracefully
          }
      }

      // 6. Major City Dataset Fallback
      if (!popFound) {
          attemptedSources.push("Major City Dataset");
          
          const searchName = result.name.toLowerCase().split(',')[0].trim();
          const dbEntry = DETERMINISTIC_LOCATION_DB[searchName];
          
          if (dbEntry && dbEntry.population) {
              result.population = { value: dbEntry.population, source: "Deterministic DB", status: "available", current: { formattedValue: dbEntry.population.toLocaleString(), description: `Known major city dataset` } };
              popFound = true;
          }
      }
      
      if (!popFound) {
          result.population = { value: null, source: null, status: "lookup_failed" };
      }
      
      delete (result as any).populationStatus;
      delete (result as any).populationSource;
      delete (result as any).populationData;
  }
}
