import { getHistoricalEntityKnowledge } from './historicalCoordinateValidator';

export interface EntityIdentityMatchOptions {
  rawQuery?: string;
  intent?: string;
  entityType?: string;
  recoveredEntityType?: string;
  coordinatesValid?: boolean;
}

export interface EntityIdentityMatchResult {
  matches: boolean;
  rejectionReason: 'NONE' | 'ENTITY_IDENTITY_MISMATCH' | 'COORDINATE_INVALID' | 'UNRESOLVED_ENTITY';
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
 * Strict protection against AI entity substitution (e.g. substituting 'Site No. 1, USS Eldorado'
 * for 'Shipwreck Of The El Faro').
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

  // 1. Direct or substring match
  if (reqLower === recLower || reqLower.includes(recLower) || recLower.includes(reqLower)) {
    return {
      matches: true,
      rejectionReason: 'NONE',
      requestedEntity: reqStr,
      recoveredEntity: recStr,
      details: 'Direct or substring match'
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

  // 3. Token-based overlap and conflict detection
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
