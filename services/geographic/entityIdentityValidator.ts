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
