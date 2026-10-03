import { getHistoricalEntityKnowledge, toCanonicalTitleCase } from './historicalCoordinateValidator';
import { resolveAlias } from './geographicAliases';
import { stripDiacritics, areEntitiesMatchingWithDiacritics, getUnicodeNormalizedForms } from './geographicNormalization';

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
 * Strips diacritics and non-alphanumeric punctuation while retaining distinct Unicode tokens.
 */
export function extractDistinctiveEntityTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  
  // Replace punctuation with spaces, strip diacritics, and convert to lowercase
  const diacriticStripped = stripDiacritics(text);
  const cleaned = diacriticStripped.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  const distinctive = words.filter(w => !GENERIC_STOP_WORDS.has(w) && w.length >= 2);
  
  // Fallback: if all words were filtered out (e.g. "The Ship"), return non-empty words
  if (distinctive.length === 0) {
    return words.filter(w => w.length >= 2);
  }
  
  return distinctive;
}

/**
 * Detects if an entity name is an invalid natural-language question or command.
 * A natural-language question must never become the authoritative canonical geographic name.
 */
export function isInvalidCanonicalName(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed.length === 0) return true;

  // Ends with question mark
  if (trimmed.endsWith('?')) {
    return true;
  }

  const lower = trimmed.toLowerCase();

  // Interrogative / command / scaffolding prefixes
  const invalidPrefixPatterns = [
    /^(?:where|when|why|how)\s+(?:is|are|was|were|did|do|does|can|to)\b/i,
    /^(?:what|which|who)\s+(?:is|are|was|were|did|do|does)\b/i,
    /^(?:tell\s+me\s+about|tell\s+me\s+more\s+about|show\s+me|find|locate|search\s+for|take\s+me\s+to|bring\s+me\s+to|guide\s+me\s+to|navigate\s+to|go\s+to|explore)\b/i,
    /^(?:how\s+to\s+get\s+to|can\s+you\s+show\s+me|can\s+you\s+find|can\s+you\s+locate)\b/i,
    /^(?:info(?:rmation)?|details)\s+(?:on|about|for|regarding)\b/i,
    /^(?:location\s+of|places?\s+of)\b/i
  ];

  if (invalidPrefixPatterns.some(p => p.test(lower))) {
    return true;
  }

  return false;
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

  // Canonical name sanity: Recovered entity cannot be a natural language question or command
  if (isInvalidCanonicalName(recStr)) {
    return {
      matches: false,
      rejectionReason: 'ENTITY_IDENTITY_MISMATCH',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: `Recovered entity "${recStr}" is an invalid natural language question/command and cannot establish geographic identity.`
    };
  }

  // If requestedEntity itself is an unextracted natural language question, don't allow circular self-matching
  if (isInvalidCanonicalName(reqStr)) {
    return {
      matches: false,
      rejectionReason: 'ENTITY_IDENTITY_MISMATCH',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: `Requested entity "${reqStr}" is an unextracted natural language question/command.`
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

  // 1. Exact match & alias resolution (with Unicode / diacritic equivalence)
  const reqAlias = resolveAlias(reqLower).canonical;
  const recAlias = resolveAlias(recLower).canonical;

  if (
    areEntitiesMatchingWithDiacritics(reqStr, recStr) ||
    areEntitiesMatchingWithDiacritics(reqAlias, recStr) ||
    areEntitiesMatchingWithDiacritics(reqStr, recAlias) ||
    areEntitiesMatchingWithDiacritics(reqAlias, recAlias)
  ) {
    return {
      matches: true,
      rejectionReason: 'NONE',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: reqLower === recLower ? 'Exact match' : 'Diacritic / Alias match'
    };
  }

  // 2. Check historical knowledge base aliases
  const reqKnowledge = getHistoricalEntityKnowledge(reqStr);
  if (reqKnowledge) {
    const canonicalKnowledgeName = reqKnowledge.entity.toLowerCase();
    if (
      areEntitiesMatchingWithDiacritics(recStr, canonicalKnowledgeName) ||
      recLower.includes(canonicalKnowledgeName) ||
      canonicalKnowledgeName.includes(recLower) ||
      stripDiacritics(recLower).includes(stripDiacritics(canonicalKnowledgeName)) ||
      stripDiacritics(canonicalKnowledgeName).includes(stripDiacritics(recLower))
    ) {
      return {
        matches: true,
        rejectionReason: 'NONE',
        requestedEntity: reqStr,
        recoveredEntity: recStr,
        details: 'Matched known historical entity alias'
      };
    }
  }

  // 3. Substring matching with qualification preservation (and diacritic tolerance)
  const reqStripped = stripDiacritics(reqLower);
  const recStripped = stripDiacritics(recLower);
  if (
    reqLower.includes(recLower) ||
    recLower.includes(reqLower) ||
    reqStripped.includes(recStripped) ||
    recStripped.includes(reqStripped)
  ) {
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
  normalizedEntity?: string;
  diacriticStrippedEntity?: string;
}): void {
  const norm = params.normalizedEntity || (params.requestedEntity ? params.requestedEntity.toLowerCase().trim() : '');
  const stripped = params.diacriticStrippedEntity || (params.requestedEntity ? stripDiacritics(params.requestedEntity).toLowerCase().trim() : '');
  console.log(`[ENTITY_IDENTITY_VALIDATION]
requestedEntity: "${params.requestedEntity}"
normalizedEntity: "${norm}"
diacriticStrippedEntity: "${stripped}"
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

const COUNTRY_SYNONYMS: Record<string, string> = {
  'usa': 'united states',
  'us': 'united states',
  'u.s.': 'united states',
  'u.s.a.': 'united states',
  'america': 'united states',
  'united states of america': 'united states',
  'uk': 'united kingdom',
  'u.k.': 'united kingdom',
  'britain': 'united kingdom',
  'great britain': 'united kingdom',
  'uae': 'united arab emirates',
  'prc': 'china',
  'peoples republic of china': 'china',
  'roc': 'taiwan',
  'russia': 'russia',
  'russian federation': 'russia',
  'south korea': 'south korea',
  'republic of korea': 'south korea',
  'korea': 'south korea',
  'the netherlands': 'netherlands',
  'holland': 'netherlands'
};

const SUBNATIONAL_TO_COUNTRY: Record<string, string> = {
  // UK constituent countries
  'england': 'united kingdom',
  'scotland': 'united kingdom',
  'wales': 'united kingdom',
  'northern ireland': 'united kingdom',
  'great britain': 'united kingdom',
  'britain': 'united kingdom',

  // US states & territories
  'alabama': 'united states', 'alaska': 'united states', 'arizona': 'united states', 'arkansas': 'united states',
  'california': 'united states', 'colorado': 'united states', 'connecticut': 'united states', 'delaware': 'united states',
  'florida': 'united states', 'georgia': 'united states', 'hawaii': 'united states', 'idaho': 'united states',
  'illinois': 'united states', 'indiana': 'united states', 'iowa': 'united states', 'kansas': 'united states',
  'kentucky': 'united states', 'louisiana': 'united states', 'maine': 'united states', 'maryland': 'united states',
  'massachusetts': 'united states', 'michigan': 'united states', 'minnesota': 'united states', 'mississippi': 'united states',
  'missouri': 'united states', 'montana': 'united states', 'nebraska': 'united states', 'nevada': 'united states',
  'new hampshire': 'united states', 'new jersey': 'united states', 'new mexico': 'united states', 'new york': 'united states',
  'north carolina': 'united states', 'north dakota': 'united states', 'ohio': 'united states', 'oklahoma': 'united states',
  'oregon': 'united states', 'pennsylvania': 'united states', 'rhode island': 'united states', 'south carolina': 'united states',
  'south dakota': 'united states', 'tennessee': 'united states', 'texas': 'united states', 'utah': 'united states',
  'vermont': 'united states', 'virginia': 'united states', 'washington': 'united states', 'west virginia': 'united states',
  'wisconsin': 'united states', 'wyoming': 'united states', 'district of columbia': 'united states',
  'puerto rico': 'united states', 'guam': 'united states',

  // Canadian provinces & territories
  'ontario': 'canada', 'quebec': 'canada', 'british columbia': 'canada', 'alberta': 'canada',
  'manitoba': 'canada', 'saskatchewan': 'canada', 'nova scotia': 'canada', 'new brunswick': 'canada',
  'newfoundland': 'canada', 'newfoundland and labrador': 'canada', 'prince edward island': 'canada',
  'northwest territories': 'canada', 'nunavut': 'canada', 'yukon': 'canada',

  // Australian states & territories
  'new south wales': 'australia', 'victoria': 'australia', 'queensland': 'australia',
  'western australia': 'australia', 'south australia': 'australia', 'tasmania': 'australia',
  'northern territory': 'australia', 'australian capital territory': 'australia'
};

const normalizeCountryName = (c?: string): string => {
  if (!c) return '';
  const s = c.trim().toLowerCase();
  return COUNTRY_SYNONYMS[s] || s;
};

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
  const { coordinates, reverseGeographicContext, authoritativeEntityContext, requestedEntity, expectedRegion } = params;

  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number' || isNaN(coordinates.lat) || isNaN(coordinates.lng)) {
    return {
      consistent: false,
      result: 'COORDINATE_INVALID',
      coordinateTrust: 'unverified',
      rejectionReason: 'Invalid numeric coordinates'
    };
  }

  const clean = (val?: string) => (val || '').trim().toLowerCase();

  // If reverse geocoding is available, check for explicit contradictions with authoritative context or expectedRegion
  if (reverseGeographicContext) {
    const revCountry = clean(reverseGeographicContext.country);
    const revState = clean(reverseGeographicContext.state || reverseGeographicContext.region);
    const revCounty = clean(reverseGeographicContext.county);
    const revCity = clean(reverseGeographicContext.city || reverseGeographicContext.town || reverseGeographicContext.village);
    const normRevCountry = normalizeCountryName(revCountry);

    // 1. Authoritative entity context check (when available)
    if (authoritativeEntityContext) {
      const authCountry = clean(authoritativeEntityContext.country);
      if (authCountry && revCountry) {
        const normAuthCountry = normalizeCountryName(authCountry);
        if (normAuthCountry !== normRevCountry && !normAuthCountry.includes(normRevCountry) && !normRevCountry.includes(normAuthCountry)) {
          return {
            consistent: false,
            result: 'ENTITY_COORDINATE_MISMATCH',
            coordinateTrust: 'unverified',
            rejectionReason: `Country mismatch: candidate coordinates in "${reverseGeographicContext.country}" conflict with authoritative "${authoritativeEntityContext.country}"`
          };
        }
      }

      const authState = clean(authoritativeEntityContext.state);
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

      const authCounty = clean(authoritativeEntityContext.county);
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

      if (typeof authoritativeEntityContext.lat === 'number' && typeof authoritativeEntityContext.lng === 'number') {
        const R = 6371; // km
        const dLat = (coordinates.lat - authoritativeEntityContext.lat) * Math.PI / 180;
        const dLon = (coordinates.lng - authoritativeEntityContext.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(authoritativeEntityContext.lat * Math.PI / 180) * Math.cos(coordinates.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distKm = R * c;

        if (distKm > 150) {
          return {
            consistent: false,
            result: 'ENTITY_COORDINATE_MISMATCH',
            coordinateTrust: 'unverified',
            rejectionReason: `Distance mismatch: candidate coordinates are ${Math.round(distKm)}km away from authoritative location`
          };
        }
      }

      // Corroborated by authoritative context!
      return {
        consistent: true,
        result: 'MATCH',
        coordinateTrust: 'verified',
        rejectionReason: undefined
      };
    }

    // 2. Expected region check (when authoritative context is not available)
    if (expectedRegion) {
      const expLower = clean(expectedRegion);
      const expParts = expLower.split(/[,\/]/).map(p => clean(p)).filter(Boolean);

      // Identify explicit and implied country/state components from expectedRegion
      let explicitExpCountry = '';
      let impliedExpCountry = '';

      for (let i = expParts.length - 1; i >= 0; i--) {
        const part = expParts[i];
        const normPart = normalizeCountryName(part);

        if (COUNTRY_SYNONYMS[part] || (normRevCountry && (normPart === normRevCountry || normPart.includes(normRevCountry) || normRevCountry.includes(normPart)))) {
          if (!explicitExpCountry) explicitExpCountry = normPart;
        } else if (SUBNATIONAL_TO_COUNTRY[part]) {
          if (!impliedExpCountry) impliedExpCountry = SUBNATIONAL_TO_COUNTRY[part];
        } else if (!explicitExpCountry && ['uk', 'usa', 'us', 'france', 'germany', 'italy', 'spain', 'turkey', 'egypt', 'japan', 'china', 'australia', 'canada', 'belgium', 'netherlands', 'greece', 'ireland', 'russia', 'mexico', 'brazil', 'india', 'sweden', 'norway', 'denmark', 'finland', 'switzerland', 'austria', 'portugal', 'poland', 'south africa', 'new zealand', 'argentina', 'chile', 'peru', 'colombia', 'thailand', 'vietnam', 'indonesia', 'philippines', 'israel', 'saudi arabia', 'iran', 'iraq', 'syria', 'jordan', 'cuba', 'iceland', 'ukraine', 'morocco', 'algeria'].includes(part)) {
          explicitExpCountry = normPart;
        }
      }

      const targetCountry = explicitExpCountry || impliedExpCountry;

      // Check country conflict if expectedRegion mentions or implies a country
      if (targetCountry && normRevCountry && targetCountry.length >= 3) {
        if (targetCountry !== normRevCountry && !targetCountry.includes(normRevCountry) && !normRevCountry.includes(targetCountry)) {
          return {
            consistent: false,
            result: 'ENTITY_COORDINATE_MISMATCH',
            coordinateTrust: 'unverified',
            rejectionReason: `Country mismatch: candidate coordinates in "${reverseGeographicContext.country}" conflict with expected region "${expectedRegion}"`
          };
        }
      }

      // Check state/region conflict if expectedRegion mentions a specific state/region that contradicts reverse geocode state
      if (revState) {
        const normRevState = clean(revState);
        for (const part of expParts) {
          if (SUBNATIONAL_TO_COUNTRY[part]) {
            // Both part and revState are known subnational divisions of the same country
            if (SUBNATIONAL_TO_COUNTRY[normRevState] && SUBNATIONAL_TO_COUNTRY[part] === SUBNATIONAL_TO_COUNTRY[normRevState]) {
              if (part !== normRevState && !part.includes(normRevState) && !normRevState.includes(part)) {
                return {
                  consistent: false,
                  result: 'ENTITY_COORDINATE_MISMATCH',
                  coordinateTrust: 'unverified',
                  rejectionReason: `State/Region mismatch: candidate coordinates in "${reverseGeographicContext.state || reverseGeographicContext.region}" conflict with expected region "${expectedRegion}"`
                };
              }
            }
          }
        }
      }

      // Check water location conflict for terrestrial expected entities
      const isWaterLocation = Boolean(
        (reverseGeographicContext.displayName && (
          reverseGeographicContext.displayName.toLowerCase().includes('sea of') ||
          reverseGeographicContext.displayName.toLowerCase().includes('ocean') ||
          reverseGeographicContext.displayName.toLowerCase().includes('gulf of')
        )) ||
        (reverseGeographicContext.feature && ['water', 'sea', 'ocean', 'bay'].includes(reverseGeographicContext.feature.toLowerCase()))
      );
      const isTerrestrialExpected = !expLower.includes('sea') && !expLower.includes('ocean') && !expLower.includes('gulf') && !expLower.includes('bay') && !expLower.includes('wreck') && !expLower.includes('shipwreck') && !expLower.includes('reef');

      if (isWaterLocation && isTerrestrialExpected && !revCity && !revCounty) {
        return {
          consistent: false,
          result: 'ENTITY_COORDINATE_MISMATCH',
          coordinateTrust: 'unverified',
          rejectionReason: `Geographic mismatch: candidate coordinates landed in open water (${reverseGeographicContext.displayName || 'water'}), but entity is expected in terrestrial region "${expectedRegion}"`
        };
      }

      // Corroboration check: if expectedRegion matches reverseGeocode tokens (city, state, county, or displayName)
      const revSummaryTokens = [revCity, revState, revCounty, revCountry, reverseGeographicContext.displayName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/[\s,–/-]+/)
        .filter(t => t.length >= 3);

      const expTokens = expLower
        .split(/[\s,–/-]+/)
        .filter(t => t.length >= 3 && !['the', 'and', 'near', 'off', 'between', 'area', 'region', 'city', 'county', 'state', 'country'].includes(t));

      const hasTokenCorroboration = expTokens.some(t => revSummaryTokens.includes(t));

      if (hasTokenCorroboration) {
        return {
          consistent: true,
          result: 'MATCH',
          coordinateTrust: 'verified',
          rejectionReason: undefined
        };
      }
    }
  }

  // If no reverse geocode or no authoritative context to corroborate, but no contradiction
  return {
    consistent: true,
    result: 'UNVERIFIED',
    coordinateTrust: 'provisional',
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

/**
 * Known administrative container prefixes and suffixes returned by geocoders / administrative registries.
 */
const ADMINISTRATIVE_CONTAINER_PATTERNS = [
  /^(?:city\s+and\s+county\s+of|city\s+of|town\s+of|village\s+of|borough\s+of|municipality\s+of|comune\s+di|commune\s+de|comuna\s+de|ayuntamiento\s+de)\s+/i,
  /\s+(?:metropolitan\s+city|metropolitan\s+municipality|metropolitan\s+area|metropolitan\s+district|metropolis|municipality|municipal\s+district|regional\s+council|county|parish|borough|district|department|prefecture|canton|governorate|province|region|state|township|subdivision|special\s+administrative\s+region|federal\s+territory|capital\s+territory|autonomous\s+region|national\s+capital\s+region)$/i
];

/**
 * Administrative qualifier words used to detect container expansions.
 */
const ADMIN_CONTAINER_WORDS = new Set([
  'city', 'metropolitan', 'municipality', 'municipal', 'metropolis',
  'county', 'parish', 'borough', 'district', 'department', 'prefecture',
  'canton', 'governorate', 'province', 'region', 'state', 'township',
  'subdivision', 'territory', 'autonomous', 'capital', 'comune', 'commune', 'comuna', 'ayuntamiento',
  'council', 'regional'
]);

const ADMIN_CONNECTIVE_WORDS = new Set([
  'of', 'and', 'the', 'di', 'de', 'la', 'le', 'el', 'da', 'du', 'del', 'della'
]);

/**
 * Checks if a candidate name is an administrative container representation of a requested entity.
 */
export function isAdministrativeContainer(candidateName: string, requestedEntity?: string): boolean {
  if (!candidateName || typeof candidateName !== 'string') return false;
  const candTrimmed = candidateName.trim();
  const candLower = candTrimmed.toLowerCase();
  
  // If requested entity is provided, check if candidate wraps or extends requestedEntity with administrative qualifiers
  if (requestedEntity && typeof requestedEntity === 'string') {
    const reqTrimmed = requestedEntity.trim();
    const reqLower = reqTrimmed.toLowerCase();
    
    // If requested entity already has the exact same name, it is an explicit request for that entity
    if (stripDiacritics(candLower) === stripDiacritics(reqLower)) {
      return false;
    }
    
    // Check if candidate starts with administrative prefix + requested entity or ends with administrative suffix
    for (const pattern of ADMINISTRATIVE_CONTAINER_PATTERNS) {
      if (pattern.test(candTrimmed)) {
        const strippedPrefix = candTrimmed.replace(/^(?:city\s+and\s+county\s+of|city\s+of|town\s+of|village\s+of|borough\s+of|municipality\s+of|comune\s+di|commune\s+de|comuna\s+de|ayuntamiento\s+de)\s+/i, '').trim();
        const strippedSuffix = candTrimmed.replace(/\s+(?:metropolitan\s+city|metropolitan\s+municipality|metropolitan\s+area|metropolitan\s+district|metropolis|municipality|municipal\s+district|county|parish|borough|district|department|prefecture|canton|governorate|province|region|state|township|subdivision|special\s+administrative\s+region|federal\s+territory|capital\s+territory|autonomous\s+region|national\s+capital\s+region)$/i, '').trim();
        
        if (
          areEntitiesMatchingWithDiacritics(strippedPrefix, reqTrimmed) ||
          areEntitiesMatchingWithDiacritics(strippedSuffix, reqTrimmed) ||
          stripDiacritics(strippedPrefix.toLowerCase()) === stripDiacritics(reqLower) ||
          stripDiacritics(strippedSuffix.toLowerCase()) === stripDiacritics(reqLower)
        ) {
          return true;
        }
      }
    }
    
    // Token-level check: candidate contains all distinctive tokens of requested entity,
    // and all extra tokens in candidate are strictly administrative words or connective words
    const reqTokens = extractDistinctiveEntityTokens(reqTrimmed);
    const candTokens = extractDistinctiveEntityTokens(candTrimmed);
    const reqTokenSet = new Set(reqTokens);
    
    if (reqTokens.length > 0 && reqTokens.every(t => candTokens.includes(t))) {
      const extraTokens = candTokens.filter(t => !reqTokenSet.has(t));
      if (extraTokens.length > 0 && extraTokens.every(t => ADMIN_CONTAINER_WORDS.has(t) || ADMIN_CONNECTIVE_WORDS.has(t))) {
        return true;
      }
    }
  }
  
  return ADMINISTRATIVE_CONTAINER_PATTERNS.some(p => p.test(candTrimmed));
}

/**
 * Determines the canonical display name for an entity, preventing geocoder administrative
 * container labels (e.g. "Kathmandu Metropolitan City") from overwriting user-requested place names
 * (e.g. "Kathmandu"), while preserving explicit administrative requests, semantic event titles, and intentional aliases.
 */
export function determineCanonicalDisplayName(requestedEntity: string, candidateName: string): string {
  const reqStr = (requestedEntity || '').trim();
  const candStr = (candidateName || '').trim();

  // If requested entity is invalid / empty, use candidate if valid
  if (!reqStr || isInvalidCanonicalName(reqStr)) {
    return candStr && !isInvalidCanonicalName(candStr) ? candStr : (reqStr || 'Unknown');
  }

  // If candidate is empty / invalid, use requested
  if (!candStr || isInvalidCanonicalName(candStr)) {
    return reqStr;
  }

  // Format casing with toCanonicalTitleCase (formats city/state e.g. "Dallas Texas" -> "Dallas, Texas")
  const formattedReq = toCanonicalTitleCase(reqStr) || reqStr;

  // Check alias resolution for requested entity (e.g. "USA" -> "United States")
  const aliasRes = resolveAlias(reqStr.toLowerCase());
  const canonicalRequested = aliasRes.aliasApplied
    ? (toCanonicalTitleCase(aliasRes.canonical) || aliasRes.canonical)
    : formattedReq;

  const reqNorm = stripDiacritics(canonicalRequested.toLowerCase());
  const candNorm = stripDiacritics(candStr.toLowerCase());

  // If exact string match (preserving exact user casing if already identical)
  if (reqStr === candStr) {
    return reqStr;
  }

  // If case-insensitive or diacritic match, return canonical title casing
  if (reqNorm === candNorm || areEntitiesMatchingWithDiacritics(canonicalRequested, candStr)) {
    return canonicalRequested;
  }

  // If candidate is an administrative container representation of the requested entity
  if (isAdministrativeContainer(candStr, canonicalRequested) || isAdministrativeContainer(candStr, reqStr)) {
    return canonicalRequested;
  }

  // If candidate has semantic event/discovery qualification (e.g. "SS Republic Shipwreck Site" for "SS Republic")
  if (/\b(?:shipwreck|sinking|discovery|battlefield|archaeological|ruins|monument|memorial|site)\b/i.test(candStr)) {
    const idCheck = validateEntityIdentity(canonicalRequested, candStr, { coordinatesValid: true });
    if (idCheck.matches) {
      return candStr;
    }
  }

  // Check if identity matches (e.g. translation "Rome" vs "Roma", "Mexico City" vs "Ciudad de México")
  const identityCheck = validateEntityIdentity(canonicalRequested, candStr, { coordinatesValid: true });
  if (identityCheck.matches) {
    // The requested entity is authoritative for display identity
    return canonicalRequested;
  }

  // Default fallback: preserve canonical requested name
  return canonicalRequested;
}


