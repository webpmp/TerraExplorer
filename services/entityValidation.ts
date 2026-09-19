import { ResolvedEntity } from '../domain';
import { isValidCoordinates } from '../types';
import { validateEarthGeography } from './celestialCapabilities';
import { getHistoricalEntityKnowledge, isMaritimeHistoricalEntity } from './geographic/historicalCoordinateValidator';
import { isInvalidCanonicalName } from './geographic/entityIdentityValidator';
import { isPlaceholderString } from '../components/InfoPanel';

export type EnrichmentCompletenessStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED';

export interface EnrichmentCompletenessResult {
  status: EnrichmentCompletenessStatus;
  missingFields: string[];
  newsStatus: 'accepted' | 'optional/empty';
  recoveryRequired: boolean;
  recoveryReason?: string;
}

/**
 * Evaluates the completeness of location enrichment.
 * Complete landmarks and entities require substantive description, populated notable facts,
 * context notes, and climate information. News is optional.
 */
export function evaluateEnrichmentCompleteness(
  data: any,
  canonicalName?: string,
  entityType?: string,
  geographicScope?: string
): EnrichmentCompletenessResult {
  const isNonPointHistorical =
    entityType === 'historical_event' ||
    data?.entityType === 'historical_event' ||
    data?.geographicScope === 'GLOBAL_EVENT' ||
    data?.geographicScope === 'REGIONAL_EVENT' ||
    data?.geographicScope === 'global' ||
    data?.geographicScope === 'regional' ||
    geographicScope === 'GLOBAL_EVENT' ||
    geographicScope === 'REGIONAL_EVENT' ||
    geographicScope === 'global' ||
    geographicScope === 'regional' ||
    data?.singleLocation === false;

  if (!data || typeof data !== 'object') {
    return {
      status: 'FAILED',
      missingFields: isNonPointHistorical
        ? ['description', 'notable', 'contextNotes']
        : ['description', 'notable', 'contextNotes', 'climate'],
      newsStatus: 'optional/empty',
      recoveryRequired: true,
      recoveryReason: 'No enrichment data present'
    };
  }

  const missing: string[] = [];

  // 1. Description: Substantive and non-placeholder
  const desc = typeof data.description === 'string' ? data.description.trim() : '';
  const isDescMissingOrPlaceholder = !desc || isGenericPlaceholderDescription(desc, canonicalName || data.name);
  if (isDescMissingOrPlaceholder) {
    missing.push('description');
  }

  // 2. Notable: For landmarks, archaeological sites, POIs, settlements, etc.
  const notable = Array.isArray(data.notable) ? data.notable : [];
  if (notable.length === 0) {
    missing.push('notable');
  }

  // 3. Context Notes
  const contextNotes = Array.isArray(data.contextNotes) ? data.contextNotes : [];
  if (contextNotes.length === 0) {
    missing.push('contextNotes');
  }

  // 4. Climate (Only required for localized geographic points / features)
  if (!isNonPointHistorical) {
    const hasClimate = data.climate && (
      (typeof data.climate === 'string' && !isPlaceholderString(data.climate)) ||
      (typeof data.climate === 'object' && (
        (data.climate.name && !isPlaceholderString(data.climate.name)) ||
        (data.climate.value && !isPlaceholderString(data.climate.value))
      ))
    );
    if (!hasClimate) {
      missing.push('climate');
    }
  }

  // 5. News (Optional)
  const news = Array.isArray(data.news) ? data.news : [];
  const newsStatus = news.length > 0 ? 'accepted' : 'optional/empty';

  let status: EnrichmentCompletenessStatus = 'COMPLETE';
  let recoveryRequired = false;
  let recoveryReason: string | undefined;

  if (isDescMissingOrPlaceholder && missing.length >= 3) {
    status = 'FAILED';
    recoveryRequired = true;
    recoveryReason = 'enrichment failed: substantive metadata missing';
  } else if (missing.length > 0) {
    status = 'PARTIAL';
    recoveryRequired = true;
    recoveryReason = 'enrichment incomplete despite verified canonical identity';
  } else {
    status = 'COMPLETE';
    recoveryRequired = false;
  }

  return {
    status,
    missingFields: missing,
    newsStatus,
    recoveryRequired,
    recoveryReason
  };
}

export function logEnrichmentCompleteness(evalResult: EnrichmentCompletenessResult): void {
  console.log('[ENRICHMENT COMPLETENESS]');
  console.log(`Status: ${evalResult.status}`);
  if (evalResult.missingFields.length > 0) {
    console.log(`Missing/Insufficient: ${evalResult.missingFields.join(', ')}`);
  }
  console.log(`News: ${evalResult.newsStatus}`);
  console.log(`Recovery Required: ${evalResult.recoveryRequired ? 'YES' : 'NO'}`);
  if (evalResult.recoveryReason) {
    console.log(`Recovery Reason: ${evalResult.recoveryReason}`);
  }
}

export function isGenericPlaceholderDescription(description?: string | null, entityName?: string): boolean {
  if (!description || typeof description !== 'string') return true;
  const trimmed = description.trim();
  if (trimmed.length === 0) return true;

  const lower = trimmed.toLowerCase();

  // Pattern 1: Boilerplate templates: "Information on [X].", "Details about [X].", "Overview of [X]."
  const placeholderRegex = /^(?:information|details|overview|summary|facts|notes|description)\s+(?:on|about|for|regarding|of)\s+[^.!?\n]+[.!?]?$/i;
  if (placeholderRegex.test(trimmed)) {
    return true;
  }

  // Pattern 2: Explicit unavailable/fallback messages
  const unavailableRegex = /^(?:documentary\s+enrichment\s+unavailable|information\s+unavailable|no\s+information\s+available|details\s+unavailable|overview\s+unavailable|climate\s+data\s+is\s+unavailable\s+for\s+this\s+location)[.!?]?$/i;
  if (unavailableRegex.test(trimmed)) {
    return true;
  }

  // Pattern 3: Explicit entity match
  if (entityName) {
    const eLower = entityName.toLowerCase().trim();
    if (lower === `information on ${eLower}.` || 
        lower === `information on ${eLower}` ||
        lower === `information about ${eLower}.` || 
        lower === `information about ${eLower}` ||
        lower === `details about ${eLower}.` ||
        lower === `details about ${eLower}` ||
        lower === `details on ${eLower}.` ||
        lower === `details on ${eLower}` ||
        lower === `overview of ${eLower}.` ||
        lower === `overview of ${eLower}` ||
        lower === `summary of ${eLower}.` ||
        lower === `summary of ${eLower}`) {
      return true;
    }
  }

  // Pattern 4: Climate-only description masquerading as entity description
  const climateOnlyRegex = /^the\s+[^.!?\n]+\s+enjoys\s+a\s+(?:temperate|maritime|oceanic|continental|tropical|polar|subpolar|alpine|mediterranean|arid|semi-arid)\s+climate[.!?]?$/i;
  if (climateOnlyRegex.test(trimmed)) {
    return true;
  }

  return false;
}

export function isEnglishText(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const lower = text.toLowerCase();
  
  // Non-English function words, structural phrases, and language markers
  const nonEnglishMarkers = /\b(est un|est une|sont des|dans le|dans la|sur le|sur la|d'un|d'une|l'un|l'une|c'est|il s'agit|édifice|bâtiment|situé dans|située dans|es un|es una|son los|son las|en el|en la|con el|con la|de un|de una|ubicado en|ubicada en|ciudad de|ist ein|ist eine|sind die|in der|in dem|mit dem|fuer die|gebauede|befindet sich|è un|è una|sono i|sono le|nella|nello|nell'|situato in|situata in)\b/i;

  if (nonEnglishMarkers.test(lower)) {
    return false;
  }
  return true;
}

/**
 * Detects whether a candidate entity name is an editorial headline, itinerary step,
 * activity recommendation, time slot, or generic tour label rather than an actual geographic place name.
 */
export function isItineraryOrActivityPhrase(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();

  // 1. Time slots / Schedule markers
  // e.g. "6 p.m. Get on board", "10:30 AM", "6 PM", "Day 1", "Morning", "Afternoon"
  if (/^\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}-(?:am|pm)-)\b/i.test(trimmed)) return true;
  if (/^\s*(?:day\s+\d+|day\s+[a-z]+|morning|afternoon|evening|night|late\s+afternoon|early\s+morning|noon|midnight)\b/i.test(trimmed)) return true;
  if (/^\s*(?:stop\s+\d+|step\s+\d+|part\s+\d+|stage\s+\d+)\b/i.test(trimmed)) return true;

  // 2. Imperative action verbs / Verb phrases at the beginning of the name
  // e.g. "Master the Art of Breakfast", "Stroll Storied Sites", "Savor the View", "Pick Up Local Provisions",
  // "Dine Somewhere Different", "Get Lost in Gardens", "Wander a Quieter Coastal Town", "Village Hop", "Dine Dockside", "Get On Board"
  const actionVerbPrefixRegex = /^(?:master|stroll|savor|pick\s+up|dine|get\s+lost|get\s+on\s+board|get\s+on|get|wander|hop|village\s+hop|explore|taste|shop|walk|visit|enjoy|discover|stop\s+by|head\s+to|check\s+out|take\s+a|cruise|sail|tour|eat|drink|relax|watch|listen|admire|experience|marvel|sample|find|climb|hike|swim|rent|stay|soak|bask|gaze|gawk|view|feast|unwind|sip|trek|board|embark|disembark|travel|journey|see|wake\s+up|spend|indulge|stash|grab|catch|try|browse|ride|cycle|boat|kayak|paddle|drive|return|depart|arrive|sleep|stay\s+at|book|reserve|seek\s+out|seek|look\s+for)\b/i;
  if (actionVerbPrefixRegex.test(trimmed)) return true;

  // 3. Gerund action phrases at the beginning
  // e.g. "Walking through...", "Dining dockside", "Exploring the lake"
  const gerundPrefixRegex = /^(?:walking|strolling|dining|exploring|cruising|tasting|visiting|shopping|wandering|mastering|savoring|getting\s+lost|getting\s+on\s+board|getting|heading|taking|touring|eating|drinking|relaxing|watching|admiring|experiencing|sampling|finding|climbing|hiking|swimming|renting|staying|soaking|gazing|feasting|unwinding|sipping|trekking|boarding|embarking|traveling|journeying|seeing|waking|spending|indulging|browsing|riding|cycling|boating|kayaking|paddling|driving|returning|departing|arriving|sleeping|booking|reserving|seeking)\b/i;
  if (gerundPrefixRegex.test(trimmed)) return true;

  // 4. Editorial phrasing, section headers, or conceptual titles
  const editorialPhrases = [
    'the art of',
    'the view',
    'storied sites',
    'somewhere different',
    'quieter coastal town',
    'in gardens',
    'dockside',
    'local provisions',
    'tourist route',
    'scenic drive',
    'walking tour',
    'day trip',
    'things to do',
    'where to eat',
    'what to do',
    'where to stay',
    'best of',
    '36 hours',
    'tourist itinerary',
    'travel diary',
    'travel itinerary',
    'travel guide',
    'itinerary step',
    'afternoon in',
    'morning in',
    'evening in',
    'night in',
    'a day in',
    'days in',
    'hours in'
  ];
  if (editorialPhrases.some(phrase => lower.includes(phrase))) return true;

  // 5. Generic route/tour placeholders (e.g. "Lake Como Tourist Route", "Lake Como Itinerary")
  if (/^(.+)\s+(?:tourist\s+route|itinerary|travel\s+guide|highlights|excursion|guide)$/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Unwraps an underlying physical place name if a candidate was formatted as "Activity (Physical Place)"
 * or "Activity: Physical Place" (e.g. "Get On Board (Villa Melzi)" -> "Villa Melzi").
 */
export function unwrapPhysicalEntityName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();

  // Pattern 1: Activity (Physical Place)
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const prefix = parenMatch[1].trim();
    const inner = parenMatch[2].trim();
    if (isItineraryOrActivityPhrase(prefix) && !isItineraryOrActivityPhrase(inner) && inner.length > 2) {
      return inner;
    }
  }

  // Pattern 2: Activity: Physical Place or Activity - Physical Place
  const colonMatch = trimmed.match(/^(.+?)\s*[:–—]\s*(.+)$/);
  if (colonMatch) {
    const prefix = colonMatch[1].trim();
    const suffix = colonMatch[2].trim();
    if (isItineraryOrActivityPhrase(prefix) && !isItineraryOrActivityPhrase(suffix) && suffix.length > 2) {
      return suffix;
    }
  }

  return trimmed;
}

export const validateResolvedEntity = (entity: ResolvedEntity | null | undefined): boolean => {
  let failureReason = 'none';
  let coordinatesValid = false;
  let identityValid = false;
  let enrichmentValid = true;
  let metadataFieldsPresent: string[] = [];
  let metadataFieldsMissing: string[] = [];
  let valid = true;

  if (!entity) {
    console.log(`[ENTITY VALIDATION]\nvalid: false\nFailure Reason: Entity is null or undefined`);
    return false;
  }

  // Level 1: Coordinate Validity
  const coords = entity.subject?.primaryLocation?.location?.coordinates;
  const isNonPointHistorical = 
    entity.subject?.identity?.singleLocation === false ||
    entity.subject?.identity?.geographicScope === 'GLOBAL_EVENT' ||
    entity.subject?.identity?.geographicScope === 'REGIONAL_EVENT' ||
    entity.subject?.identity?.geographicScope === 'NON_GEOGRAPHIC_HISTORICAL_EVENT' ||
    (entity.subject?.identity?.entityType === 'historical_event' && !coords);

  if (isValidCoordinates(coords)) {
    coordinatesValid = true;
  } else if (isNonPointHistorical) {
    coordinatesValid = true;
  } else {
    valid = false;
    failureReason = "Invalid coordinates (out of range or missing)";
  }

  console.log(`[COORDINATE_VALIDATION]
coordinates: ${JSON.stringify(coords || 'none')}
valid: ${coordinatesValid}`);

  // Level 2: Geographic Identity Validity
  const canonicalName = entity.subject?.identity?.canonicalName;
  const entityType = entity.subject?.identity?.entityType;
  const primaryLabel = entity.subject?.primaryLocation?.label;
  const identityStatus = (entity.subject?.primaryLocation as any)?.identityStatus || 
                         (entity.subject?.identity as any)?.identityStatus;
  const coordinateSource = coords?.source || (entity.subject?.primaryLocation as any)?.coordinateSource || (entity as any)?.coordinateSource;
  const coordinateTrust = (coords as any)?.coordinateTrust || (entity.subject?.primaryLocation as any)?.coordinateTrust || (entity as any)?.coordinateTrust;

  if (canonicalName && entityType && primaryLabel && identityStatus !== 'failed' && !isInvalidCanonicalName(canonicalName) && !isInvalidCanonicalName(primaryLabel)) {
    identityValid = true;
  } else {
    identityValid = false;
    valid = false;
    if (isInvalidCanonicalName(canonicalName) || isInvalidCanonicalName(primaryLabel)) {
      failureReason = failureReason === 'none' ? "Invalid identity (canonical name cannot be a natural language question or command)" : `${failureReason}, Invalid identity question format`;
    } else {
      failureReason = failureReason === 'none' ? "Invalid identity (missing canonicalName, entityType, or label, or status failed)" : `${failureReason}, Invalid identity`;
    }
  }

  // An unverified AI coordinate cannot by itself establish a valid canonical geographic identity
  if ((coordinateSource === 'ai' || coordinateSource === 'ai_recovery') && (coordinateTrust === 'unverified' || (coordinateTrust === 'provisional' && identityStatus === 'unverified'))) {
    identityValid = false;
    valid = false;
    failureReason = failureReason === 'none'
      ? "Unverified AI coordinates cannot establish canonical geographic identity without corroboration"
      : `${failureReason}, Unverified AI coordinates`;
  }

  // Level 2.5: Celestial Body Validation (Earth-Only support)
  const celestialValidation = validateEarthGeography({
    name: canonicalName || primaryLabel,
    canonicalName,
    description: typeof (entity.metadata as any)?.description === 'string' ? (entity.metadata as any).description : undefined,
    modernLocation: (entity.subject?.primaryLocation as any)?.address?.country || primaryLabel
  });

  if (!celestialValidation.isValid) {
    identityValid = false;
    valid = false;
    failureReason = failureReason === 'none' 
      ? `Unsupported celestial body '${celestialValidation.celestialBody}'. TerraExplorer supports Earth only.`
      : `${failureReason}, Unsupported celestial body '${celestialValidation.celestialBody}'`;
  }

  // Level 2.6: Historical Geographic Consistency Check
  const address = entity.subject?.primaryLocation?.location?.address;
  const canonicalCountry = (address?.country || (entity.subject?.primaryLocation as any)?.country || '').toLowerCase().trim();
  const canonicalState = (address?.state || (entity.subject?.primaryLocation as any)?.state || '').toLowerCase().trim();
  
  if (canonicalName && coords) {
    const histKnowledge = getHistoricalEntityKnowledge(canonicalName);
    if (histKnowledge) {
      const isMarineEntity = isMaritimeHistoricalEntity(entityType);

      if (isMarineEntity) {
        let regionalCompatibility = true;

        if (histKnowledge.boundingBox) {
          const { minLat, maxLat, minLng, maxLng } = histKnowledge.boundingBox;
          if (coords.lat < minLat || coords.lat > maxLat || coords.lng < minLng || coords.lng > maxLng) {
            regionalCompatibility = false;
          }
        }

        // For marine entities, check forbidden regions only if a terrestrial administrative boundary was matched
        const hasLandMatch = Boolean(
          canonicalCountry && 
          canonicalCountry !== 'none' && 
          canonicalCountry !== 'unknown country' && 
          canonicalCountry !== 'water / open area'
        );

        if (regionalCompatibility && histKnowledge.forbiddenRegions && hasLandMatch) {
          const fullRegionStr = `${canonicalCountry} ${canonicalState}`.toLowerCase();
          for (const forbidden of histKnowledge.forbiddenRegions) {
            if (fullRegionStr.includes(forbidden.toLowerCase())) {
              regionalCompatibility = false;
              break;
            }
          }
        }

        console.log(`[OFFSHORE GEOGRAPHIC VALIDATION]
entity="${canonicalName}"
entityType="${entityType}"
candidateCoordinates=${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}
expectedRegion="${histKnowledge.expectedRegion}"
marineEntity=true
reverseGeocodeLandMatch=${hasLandMatch}
regionalCompatibility=${regionalCompatibility}
result=${regionalCompatibility ? 'ACCEPT' : 'REJECT'}`);

        if (!regionalCompatibility) {
          identityValid = false;
          valid = false;
          failureReason = failureReason === 'none'
            ? `Geographic mismatch: coordinate (${coords.lat}, ${coords.lng}) contradicts expected historical region '${histKnowledge.expectedRegion}'`
            : `${failureReason}, Historical geographic mismatch`;
        }
      } else {
        // Terrestrial entity validation
        if (histKnowledge.boundingBox) {
          const { minLat, maxLat, minLng, maxLng } = histKnowledge.boundingBox;
          if (coords.lat < minLat || coords.lat > maxLat || coords.lng < minLng || coords.lng > maxLng) {
            identityValid = false;
            valid = false;
            failureReason = failureReason === 'none'
              ? `Geographic mismatch: coordinate (${coords.lat}, ${coords.lng}) contradicts expected historical region '${histKnowledge.expectedRegion}'`
              : `${failureReason}, Historical geographic mismatch`;
          }
        }
        if (histKnowledge.forbiddenRegions) {
          const fullRegionStr = `${canonicalCountry} ${canonicalState}`.toLowerCase();
          for (const forbidden of histKnowledge.forbiddenRegions) {
            if (fullRegionStr.includes(forbidden.toLowerCase())) {
              identityValid = false;
              valid = false;
              failureReason = failureReason === 'none'
                ? `Geographic mismatch: region '${forbidden}' contradicts historical entity '${canonicalName}'`
                : `${failureReason}, Historical geographic mismatch`;
              break;
            }
          }
        }
      }
    }
  }

  console.log(`[GEOGRAPHIC_IDENTITY_VALIDATION]
canonicalName: "${canonicalName || 'none'}"
entityType: "${entityType || 'none'}"
celestialBody: "${celestialValidation.celestialBody}"
coordinateSource: "${coordinateSource || 'unknown'}"
identityStatus: "${identityStatus || 'unverified'}"
valid: ${identityValid}`);

  console.log(`[ENTITY_IDENTITY_VALIDATION]
canonicalName: "${canonicalName || 'none'}"
entityType: "${entityType || 'none'}"
identityStatus: "${identityStatus || 'unverified'}"
valid: ${identityValid}`);

  // Level 3: Enrichment Identity Validity
  const metadata = entity.metadata as any || {};
  const descriptionText = typeof metadata.description === 'string' 
    ? metadata.description 
    : (metadata.description?.text || (Array.isArray(metadata.description?.paragraphs) ? metadata.description.paragraphs.join(' ') : ''));

  // 3a: Top-level structure check (reject if a sub-object like climate was treated as root metadata)
  if (metadata.koppenCode && !metadata.climate) {
    enrichmentValid = false;
    valid = false;
    failureReason = failureReason === 'none' 
      ? "Enrichment failed: isolated sub-object passed as top-level metadata" 
      : `${failureReason}, Isolated sub-object`;
  }
  
  // 3b: Description Quality / Placeholder check
  if (isGenericPlaceholderDescription(descriptionText, canonicalName)) {
    enrichmentValid = false;
    valid = false;
    failureReason = failureReason === 'none' 
      ? "Enrichment failed: generic placeholder description" 
      : `${failureReason}, Generic placeholder description`;
  }

  // 3c: Language check (Enforce English)
  if (descriptionText && !isEnglishText(descriptionText)) {
    enrichmentValid = false;
    valid = false;
    failureReason = failureReason === 'none' 
      ? "Enrichment failed: non-English language detected" 
      : `${failureReason}, Non-English language`;
  }

  // 3d: Geographic Contradiction Guardrail
  const descLower = descriptionText.toLowerCase();

  if (canonicalCountry && descLower.length > 0) {
    if ((canonicalCountry === 'united states' || canonicalCountry === 'usa' || canonicalState === 'nevada') && 
        (descLower.includes('iceland') || descLower.includes('reykjanes') || descLower.includes('grindavík')) &&
        !descLower.includes('nevada') && !descLower.includes('united states')) {
      enrichmentValid = false;
      valid = false;
      failureReason = failureReason === 'none' ? "Enrichment mismatch: description contradicts canonical country/region" : `${failureReason}, Enrichment mismatch`;
    } else if (canonicalCountry === 'iceland' && (descLower.includes('nevada') || descLower.includes('las vegas')) && !descLower.includes('iceland')) {
      enrichmentValid = false;
      valid = false;
      failureReason = failureReason === 'none' ? "Enrichment mismatch: description contradicts canonical country/region" : `${failureReason}, Enrichment mismatch`;
    }
  }

  // 3e: Climate Plausibility & Compatibility check
  if (metadata.climate && typeof metadata.climate === 'object') {
    const cName = ((metadata.climate.name || metadata.climate.value || '') as string).toLowerCase();
    const kCode = ((metadata.climate.koppenCode || '') as string).toLowerCase();
    if (cName.includes('tropical') && (canonicalCountry.includes('switzerland') || canonicalCountry.includes('norway') || canonicalCountry.includes('iceland') || entityType === 'mountain')) {
      enrichmentValid = false;
      valid = false;
      failureReason = failureReason === 'none' ? "Enrichment mismatch: climate contradicts alpine/arctic geography" : `${failureReason}, Climate contradiction`;
    } else if (((cName.includes('polar') && !cName.includes('subpolar')) || cName.includes('tundra')) && (canonicalCountry.includes('iceland') && (canonicalName?.toLowerCase().includes('blue lagoon') || canonicalState.includes('grindavík')))) {
      enrichmentValid = false;
      valid = false;
      failureReason = failureReason === 'none' ? "Enrichment mismatch: Polar/Tundra climate contradicts maritime Iceland geography" : `${failureReason}, Climate contradiction`;
    } else if ((cName.includes('semi-arid') || kCode === 'bsk' || cName.includes('desert') || kCode === 'bwh') && (canonicalCountry.includes('australia') && (canonicalName?.toLowerCase().includes('sydney') || canonicalState.includes('new south wales')))) {
      enrichmentValid = false;
      valid = false;
      failureReason = failureReason === 'none' ? "Enrichment mismatch: Semi-arid climate contradicts coastal Sydney geography" : `${failureReason}, Climate contradiction`;
    }
  }

  // 3f: Notable array validation
  if (metadata.notable !== undefined && metadata.notable !== null && !Array.isArray(metadata.notable)) {
    enrichmentValid = false;
    valid = false;
    failureReason = failureReason === 'none' ? "Enrichment structure: notable must be an array" : `${failureReason}, Invalid notable format`;
  }

  console.log(`[ENRICHMENT_IDENTITY_VALIDATION]
canonicalCountry: "${canonicalCountry || 'none'}"
canonicalState: "${canonicalState || 'none'}"
enrichmentMatchesGeography: ${enrichmentValid}
valid: ${enrichmentValid}`);

  const hasField = (field: string) => {
    const val = metadata[field];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (typeof val === 'number') return true;
    if (Array.isArray(val)) return true; // Empty array means resolved, but 0 items
    if (typeof val === 'object') {
      if (Object.keys(val).length === 0) return false;
      if (val.text !== undefined && typeof val.text === 'string' && val.text.trim() === '') return false;
    }
    return true;
  };

  const allFields = ['description', 'population', 'climate', 'contextNotes', 'notable', 'news'];
  metadataFieldsPresent = allFields.filter(f => hasField(f));
  metadataFieldsMissing = allFields.filter(f => !hasField(f));

  console.log(`[ENTITY VALIDATION SUMMARY]
Coordinates valid: ${coordinatesValid}
Entity identity valid: ${identityValid}
Enrichment valid: ${enrichmentValid}
Metadata fields present: ${metadataFieldsPresent.length > 0 ? metadataFieldsPresent.join(', ') : 'none'}
Metadata fields missing: ${metadataFieldsMissing.length > 0 ? metadataFieldsMissing.join(', ') : 'none'}
Valid: ${valid}
Failure Reason: ${failureReason}`);

  return valid;
};
