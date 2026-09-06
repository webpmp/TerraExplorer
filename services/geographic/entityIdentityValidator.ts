import { getHistoricalEntityKnowledge } from './historicalCoordinateValidator';

export interface EntityIdentityMatchOptions {
  rawQuery?: string;
  intent?: string;
  entityType?: string;
  recoveredEntityType?: string;
  candidateEntityType?: string;
  candidateCanonicalName?: string;
  coordinatesValid?: boolean;
}

export interface EntityIdentityMatchResult {
  matches: boolean;
  rejectionReason: 'NONE' | 'ENTITY_IDENTITY_MISMATCH' | 'COORDINATE_INVALID' | 'UNRESOLVED_ENTITY' | 'SEMANTIC_INTENT_MISMATCH' | 'AMBIGUOUS_GENERIC_ENTITY';
  requestedEntity: string;
  recoveredEntity: string;
  details?: string;
}

// Stop words and generic prefix phrases to ignore during core token extraction
const GENERIC_STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'at', 'on', 'for', 'to', 'from', 'by', 'with', 'and', 'or',
  'is', 'was', 'are', 'were', 'where', 'what', 'show', 'tell', 'find', 'locate', 'take',
  'about', 'me', 'here', 'site', 'no', 'number', 'location', 'place', 'area', 'point',
  'interest', 'poi', 'discovery', 'recovery', 'expedition', 'shipwreck', 'wreck', 'sunken',
  'sinking', 'vessel', 'ship', 'boat', 'plane', 'aircraft', 'ruins'
]);

// Administrative entity qualifiers that narrow a generic entity name
const ADMINISTRATIVE_QUALIFIERS = new Set([
  'county', 'parish', 'borough', 'district', 'municipality', 'township',
  'province', 'department', 'prefecture', 'canton', 'governorate'
]);

// Natural feature qualifiers
const NATURAL_QUALIFIERS = new Set([
  'park', 'national park', 'national forest', 'forest', 'river', 'lake', 'mountain',
  'mount', 'canyon', 'valley', 'caldera', 'volcano', 'bay', 'gulf', 'island', 'falls',
  'waterfall', 'sea', 'ocean', 'glacier', 'desert', 'reef', 'cave', 'caves'
]);

/**
 * Normalizes text and extracts significant distinctive tokens for entity comparison.
 */
export function extractDistinctiveEntityTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  
  // Replace punctuation with spaces, convert to lowercase
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  const distinctive = words.filter(w => !GENERIC_STOP_WORDS.has(w) && w.length >= 2);
  
  // Fallback: if all words were filtered out (e.g. "The Ship"), return non-empty words
  if (distinctive.length === 0) {
    return words.filter(w => w.length >= 2);
  }
  
  return distinctive;
}

/**
 * Validates that a recovered entity refers to the same underlying entity as the requested entity.
 * 
 * Strict protection against AI entity substitution and semantic geocoder mismatch.
 */
export function validateEntityIdentity(
  requestedEntity: string,
  recoveredEntity: string,
  options: EntityIdentityMatchOptions = {}
): EntityIdentityMatchResult {
  const reqStr = (requestedEntity || '').trim();
  const recStr = (recoveredEntity || '').trim();

  // If requested entity is empty
  if (!reqStr) {
    return {
      matches: false,
      rejectionReason: 'UNRESOLVED_ENTITY',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: 'Requested entity is empty'
    };
  }

  // If recovered entity is empty
  if (!recStr) {
    return {
      matches: false,
      rejectionReason: 'ENTITY_IDENTITY_MISMATCH',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: 'Recovered entity is empty'
    };
  }

  const reqLower = reqStr.toLowerCase();
  const recLower = recStr.toLowerCase();
  const rawQueryLower = (options.rawQuery || '').toLowerCase();
  const intent = options.intent || '';
  const candidateEntityType = (options.candidateEntityType || options.recoveredEntityType || '').toLowerCase();

  // Semantic Guard: If user query or intent is NATURAL_LOCATION (or generic query without administrative qualifiers),
  // but geocoder returned an administrative region that appends a qualifier (e.g., "Yellowstone" -> "Yellowstone County"),
  // verify whether the user actually asked for an administrative division.
  const recWords = recLower.split(/[\s,]+/);
  const recHasAdminQualifier = recWords.some(w => ADMINISTRATIVE_QUALIFIERS.has(w));
  const reqHasAdminQualifier = reqLower.split(/[\s,]+/).some(w => ADMINISTRATIVE_QUALIFIERS.has(w)) ||
                               rawQueryLower.split(/[\s,]+/).some(w => ADMINISTRATIVE_QUALIFIERS.has(w));

  if (recHasAdminQualifier && !reqHasAdminQualifier) {
    const isNaturalOrGenericIntent = intent === 'NATURAL_LOCATION' || intent === 'EXPLORATORY' || intent === 'GENERAL_LOCATION' || !intent;
    const isAdministrativeCandidate = candidateEntityType === 'administrative_region' || 
                                     candidateEntityType === 'county' || 
                                     candidateEntityType === 'state' || 
                                     candidateEntityType === 'region';

    if (isNaturalOrGenericIntent || isAdministrativeCandidate) {
      return {
        matches: false,
        rejectionReason: 'SEMANTIC_INTENT_MISMATCH',
        requestedEntity: reqStr,
        recoveredEntity: recStr,
        details: `Requested generic/natural entity "${reqStr}" cannot resolve to administrative region "${recStr}" without explicit user qualification.`
      };
    }
  }

  // 1. Exact match
  if (reqLower === recLower) {
    return {
      matches: true,
      rejectionReason: 'NONE',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: 'Exact match'
    };
  }

  // 2. Check historical knowledge base aliases
  const reqKnowledge = getHistoricalEntityKnowledge(reqStr);
  if (reqKnowledge) {
    const canonicalKnowledgeName = reqKnowledge.entity.toLowerCase();
    if (recLower === canonicalKnowledgeName || recLower.includes(canonicalKnowledgeName) || canonicalKnowledgeName.includes(recLower)) {
      return {
        matches: true,
        rejectionReason: 'NONE',
        requestedEntity: reqStr,
        recoveredEntity: recStr,
        details: 'Matched known historical entity alias'
      };
    }
  }

  // 3. Substring matching with qualification preservation
  if (reqLower.includes(recLower) || recLower.includes(reqLower)) {
    // If requested contains recovered (e.g. "Yellowstone National Park" contains "Yellowstone National Park, WY")
    return {
      matches: true,
      rejectionReason: 'NONE',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: 'Substring match'
    };
  }

  // 4. Token-based overlap and conflict detection
  const reqTokens = extractDistinctiveEntityTokens(reqStr);
  const recTokens = extractDistinctiveEntityTokens(recStr);

  if (reqTokens.length === 0 || recTokens.length === 0) {
    const simpleMatch = reqLower === recLower;
    return {
      matches: simpleMatch,
      rejectionReason: simpleMatch ? 'NONE' : 'ENTITY_IDENTITY_MISMATCH',
      requestedEntity: reqStr,
      recoveredEntity: recStr
    };
  }

  const reqTokenSet = new Set(reqTokens);
  const recTokenSet = new Set(recTokens);

  // Count matching tokens
  const matchingTokens = reqTokens.filter(t => recTokenSet.has(t));
  const overlapRatioReq = matchingTokens.length / reqTokens.length;
  const overlapRatioRec = matchingTokens.length / recTokens.length;

  // If there are zero matching distinctive tokens (e.g. "el faro" vs "eldorado"), strictly reject
  if (matchingTokens.length === 0) {
    return {
      matches: false,
      rejectionReason: 'ENTITY_IDENTITY_MISMATCH',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: `Zero distinctive token overlap between requested [${reqTokens.join(', ')}] and recovered [${recTokens.join(', ')}]`
    };
  }

  // Significant overlap (e.g. "SS El Faro" vs "El Faro" -> matching "el", "faro")
  if (overlapRatioReq >= 0.5 || overlapRatioRec >= 0.5 || matchingTokens.length >= 2) {
    return {
      matches: true,
      rejectionReason: 'NONE',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: `Distinctive token overlap: ${matchingTokens.join(', ')}`
    };
  }

  return {
    matches: false,
    rejectionReason: 'ENTITY_IDENTITY_MISMATCH',
    requestedEntity: reqStr,
    recoveredEntity: recStr,
    details: `Insufficient token overlap (${matchingTokens.length}/${reqTokens.length})`
  };
}

/**
 * Emits the required structured log block for coordinate recovery identity checks.
 */
export function logCoordinateRecoveryIdentityCheck(params: {
  requestedEntity: string;
  recoveredEntity: string;
  entityIdentityMatch: boolean;
  coordinateValidity: boolean;
  recoveryAccepted: boolean;
  rejectionReason: string;
}): void {
  console.log(`[COORDINATE RECOVERY IDENTITY CHECK]
requestedEntity: ${params.requestedEntity}
recoveredEntity: ${params.recoveredEntity}
entityIdentityMatch: ${params.entityIdentityMatch}
coordinateValidity: ${params.coordinateValidity}
recoveryAccepted: ${params.recoveryAccepted}
rejectionReason: ${params.rejectionReason}`);
}

/**
 * Known historical entity conflation pairs that must never be treated as valid aliases.
 */
const KNOWN_ENTITY_CONFLATIONS: Array<[RegExp, RegExp]> = [
  // Fort Gibson (OK) vs Fort Osage (MO)
  [/\bfort\s+gibson\b/i, /\bfort\s+osage\b/i],
  [/\bfort\s+osage\b/i, /\bfort\s+gibson\b/i],

  // Fort Jackson (AL) vs Fort Osage (MO)
  [/\bfort\s+jackson\b/i, /\bfort\s+osage\b/i],
  [/\bfort\s+osage\b/i, /\bfort\s+jackson\b/i],

  // Fort Jackson (AL) vs Fort Franklin (TN/PA)
  [/\bfort\s+jackson\b/i, /\bfort\s+franklin\b/i],
  [/\bfort\s+franklin\b/i, /\bfort\s+jackson\b/i],

  // Fort Gibson (OK) vs Fort Franklin
  [/\bfort\s+gibson\b/i, /\bfort\s+franklin\b/i],
  [/\bfort\s+franklin\b/i, /\bfort\s+gibson\b/i],

  // Fort Gibson (OK) vs Fort Jackson (AL)
  [/\bfort\s+gibson\b/i, /\bfort\s+jackson\b/i],
  [/\bfort\s+jackson\b/i, /\bfort\s+gibson\b/i],

  // Fort Cass (TN) vs Fort Osage / Fort Jackson
  [/\bfort\s+cass\b/i, /\bfort\s+osage\b/i],
  [/\bfort\s+cass\b/i, /\bfort\s+jackson\b/i],
  [/\bfort\s+cass\b/i, /\bfort\s+gibson\b/i],

  // Oklahoma City (Central OK) vs Fort Coffee (Eastern OK)
  [/\boklahoma\s+city\b/i, /\bfort\s+coffee\b/i],
  [/\bfort\s+coffee\b/i, /\boklahoma\s+city\b/i],

  // Gunter's Landing (AL) vs Gunter Island (or unrelated Gunter features)
  [/\bgunter'?s?\s+landing\b/i, /\bgunter\s+island\b/i],
  [/\bgunter\s+island\b/i, /\bgunter'?s?\s+landing\b/i],

  // Memphis (TN) vs Fort Pillow (TN)
  [/\bmemphis\b/i, /\bfort\s+pillow\b/i],
  [/\bfort\s+pillow\b/i, /\bmemphis\b/i]
];

/**
 * Validates whether candidateAlias is a historically valid alias for canonicalName.
 *
 * Strictly rejects:
 * - Known historical entity conflations (e.g. Fort Gibson = Fort Osage).
 * - Distinct entities that merely share generic descriptors ("Fort", "Camp", "Mount", "Battle").
 * - Entities in contradictory geographic/historical contexts.
 */
export function validateEntityAlias(
  canonicalName: string,
  candidateAlias: string
): boolean {
  const cName = (canonicalName || '').trim();
  const cAlias = (candidateAlias || '').trim();

  if (!cName || !cAlias) return false;

  const nameLower = cName.toLowerCase();
  const aliasLower = cAlias.toLowerCase();

  if (nameLower === aliasLower) return true;

  // 1. Check known entity conflation rules
  for (const [patternA, patternB] of KNOWN_ENTITY_CONFLATIONS) {
    if (patternA.test(nameLower) && patternB.test(aliasLower)) {
      console.warn(`[ENTITY ALIAS REJECTED] Known conflation between "${canonicalName}" and proposed alias "${candidateAlias}".`);
      return false;
    }
  }

  // 2. Check if candidate alias conflicts with another known knowledge-base entity
  const targetKnowledge = getHistoricalEntityKnowledge(nameLower);
  const aliasKnowledge = getHistoricalEntityKnowledge(aliasLower);

  if (targetKnowledge && aliasKnowledge) {
    if (targetKnowledge.entity.toLowerCase() !== aliasKnowledge.entity.toLowerCase()) {
      console.warn(`[ENTITY ALIAS REJECTED] Proposed alias "${candidateAlias}" resolves to distinct known historical entity "${aliasKnowledge.entity}" rather than "${targetKnowledge.entity}".`);
      return false;
    }
  }

  // 3. Reject if the core distinctive name tokens (excluding generic "Fort", "Site", "Point", etc.) have zero overlap
  const nameTokens = extractDistinctiveEntityTokens(cName).filter(t => t !== 'fort' && t !== 'camp' && t !== 'post' && t !== 'site');
  const aliasTokens = extractDistinctiveEntityTokens(cAlias).filter(t => t !== 'fort' && t !== 'camp' && t !== 'post' && t !== 'site');

  if (nameTokens.length > 0 && aliasTokens.length > 0) {
    const aliasTokenSet = new Set(aliasTokens);
    const hasOverlap = nameTokens.some(t => aliasTokenSet.has(t));
    if (!hasOverlap) {
      // Check if one is a translation/historical alias of the other in knowledge base
      if (targetKnowledge && (targetKnowledge.historicalContext?.toLowerCase().includes(aliasLower) || targetKnowledge.sourceRationale?.toLowerCase().includes(aliasLower))) {
        return true;
      }
      // Zero distinctive token overlap and not in knowledge context -> reject alias
      return false;
    }
  }

  return true;
}

/**
 * Emits the required structured log block for candidate entity identity validation.
 */
export function logEntityIdentityValidation(params: {
  requestedEntity: string;
  candidateName: string;
  candidateEntityType?: string;
  intent?: string;
  identityValid: boolean;
  identityStatus: string;
  rejectionReason?: string;
}): void {
  console.log(`[ENTITY_IDENTITY_VALIDATION]
requestedEntity: "${params.requestedEntity}"
candidateName: "${params.candidateName}"
candidateEntityType: "${params.candidateEntityType || 'unknown'}"
intent: "${params.intent || 'unknown'}"
identityStatus: "${params.identityStatus}"
valid: ${params.identityValid}
rejectionReason: ${params.rejectionReason || 'none'}`);
}

export type CoordinateTrustLevel = 'verified' | 'provisional' | 'unverified';

export interface EntityCoordinateValidationOptions {
  requestedEntity: string;
  recoveredEntity?: string;
  coordinates: { lat: number; lng: number };
  reverseGeographicContext?: {
    country?: string;
    state?: string;
    county?: string;
    city?: string;
    region?: string;
    [key: string]: any;
  } | null;
  authoritativeEntityContext?: {
    country?: string;
    state?: string;
    county?: string;
    city?: string;
    region?: string;
    lat?: number;
    lng?: number;
    [key: string]: any;
  } | null;
}

export interface EntityCoordinateValidationResult {
  consistent: boolean;
  result: 'MATCH' | 'ENTITY_COORDINATE_MISMATCH' | 'COORDINATE_INVALID' | 'UNVERIFIED';
  coordinateTrust: CoordinateTrustLevel;
  rejectionReason?: string;
}

/**
 * Validates candidate coordinates against authoritative regional context and reverse geocoding.
 * 
 * Geographic hierarchy:
 * - country/state: strong constraint
 * - county/municipality/known locality: contextual constraint
 */
export function validateEntityCoordinates(
  params: EntityCoordinateValidationOptions
): EntityCoordinateValidationResult {
  const { coordinates, reverseGeographicContext, authoritativeEntityContext, requestedEntity } = params;

  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number' || isNaN(coordinates.lat) || isNaN(coordinates.lng)) {
    return {
      consistent: false,
      result: 'COORDINATE_INVALID',
      coordinateTrust: 'unverified',
      rejectionReason: 'Invalid numeric coordinates'
    };
  }

  // If no authoritative context is available to corroborate or contradict
  if (!authoritativeEntityContext) {
    return {
      consistent: true,
      result: 'UNVERIFIED',
      coordinateTrust: 'provisional',
      rejectionReason: undefined
    };
  }

  // If reverse geocoding is unavailable
  if (!reverseGeographicContext) {
    return {
      consistent: true,
      result: 'UNVERIFIED',
      coordinateTrust: 'provisional',
      rejectionReason: undefined
    };
  }

  const clean = (val?: string) => (val || '').trim().toLowerCase();

  const authCountry = clean(authoritativeEntityContext.country);
  const revCountry = clean(reverseGeographicContext.country);

  // 1. Country match (strong constraint)
  if (authCountry && revCountry) {
    const normAuthCountry = authCountry === 'usa' ? 'united states' : authCountry;
    const normRevCountry = revCountry === 'usa' ? 'united states' : revCountry;

    if (normAuthCountry !== normRevCountry && !normAuthCountry.includes(normRevCountry) && !normRevCountry.includes(normAuthCountry)) {
      return {
        consistent: false,
        result: 'ENTITY_COORDINATE_MISMATCH',
        coordinateTrust: 'unverified',
        rejectionReason: `Country mismatch: candidate coordinates in "${reverseGeographicContext.country}" conflict with authoritative "${authoritativeEntityContext.country}"`
      };
    }
  }

  // 2. State / Province match (strong constraint)
  const authState = clean(authoritativeEntityContext.state);
  const revState = clean(reverseGeographicContext.state || reverseGeographicContext.region);

  if (authState && revState) {
    if (authState !== revState && !authState.includes(revState) && !revState.includes(authState)) {
      return {
        consistent: false,
        result: 'ENTITY_COORDINATE_MISMATCH',
        coordinateTrust: 'unverified',
        rejectionReason: `State/Region mismatch: candidate coordinates in "${reverseGeographicContext.state || reverseGeographicContext.region}" conflict with authoritative "${authoritativeEntityContext.state}"`
      };
    }
  }

  // 3. County / Municipality / Known Locality match (contextual constraint)
  const authCounty = clean(authoritativeEntityContext.county);
  const revCounty = clean(reverseGeographicContext.county);

  if (authCounty && revCounty) {
    const stripCountyWord = (s: string) => s.replace(/\s+county$/i, '').trim();
    const cAuth = stripCountyWord(authCounty);
    const cRev = stripCountyWord(revCounty);

    if (cAuth && cRev && cAuth !== cRev) {
      return {
        consistent: false,
        result: 'ENTITY_COORDINATE_MISMATCH',
        coordinateTrust: 'unverified',
        rejectionReason: `County mismatch: candidate coordinates in "${reverseGeographicContext.county}" conflict with authoritative "${authoritativeEntityContext.county}"`
      };
    }
  }

  // 4. City / Known Locality check if authoritative city exists
  const authCity = clean(authoritativeEntityContext.city);
  const revCity = clean(reverseGeographicContext.city || reverseGeographicContext.town || reverseGeographicContext.village);

  // If coordinates also have authoritative coordinates, check distance as a sanity fallback
  if (typeof authoritativeEntityContext.lat === 'number' && typeof authoritativeEntityContext.lng === 'number') {
    const R = 6371; // km
    const dLat = (coordinates.lat - authoritativeEntityContext.lat) * Math.PI / 180;
    const dLon = (coordinates.lng - authoritativeEntityContext.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(authoritativeEntityContext.lat * Math.PI / 180) * Math.cos(coordinates.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = R * c;

    // If more than 150km away from authoritative point in same state, consider mismatch
    if (distKm > 150) {
      return {
        consistent: false,
        result: 'ENTITY_COORDINATE_MISMATCH',
        coordinateTrust: 'unverified',
        rejectionReason: `Distance mismatch: candidate coordinates are ${Math.round(distKm)}km away from authoritative location`
      };
    }
  }

  // Corroborated!
  return {
    consistent: true,
    result: 'MATCH',
    coordinateTrust: 'verified',
    rejectionReason: undefined
  };
}

/**
 * Emits the required structured log block for AI coordinate trust.
 */
export function logAiCoordinateTrust(params: {
  coordinateSource: string;
  coordinateTrust: string;
  reason: string;
}): void {
  console.log(`[AI COORDINATE TRUST]
coordinateSource=${params.coordinateSource}
coordinateTrust=${params.coordinateTrust}
reason=${params.reason}`);
}

/**
 * Emits the required structured log block for entity coordinate validation.
 */
export function logEntityCoordinateValidation(params: {
  entity: string;
  consistent: boolean;
  result: string;
  reason: string;
}): void {
  console.log(`[ENTITY COORDINATE VALIDATION]
entity=${params.entity}
consistent=${params.consistent}
result=${params.result}
reason=${params.reason}`);
}

