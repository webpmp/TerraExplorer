import { ResolvedEntity } from '../domain';
import { isValidCoordinates } from '../types';
import { validateEarthGeography } from './celestialCapabilities';
import { getHistoricalEntityKnowledge } from './geographic/historicalCoordinateValidator';

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
  if (isValidCoordinates(coords)) {
    coordinatesValid = true;
  } else {
    valid = false;
    failureReason = "Invalid coordinates (out of range or missing)";
  }

  console.log(`[COORDINATE_VALIDATION]
coordinates: ${JSON.stringify(coords)}
valid: ${coordinatesValid}`);

  // Level 2: Geographic Identity Validity
  const canonicalName = entity.subject?.identity?.canonicalName;
  const entityType = entity.subject?.identity?.entityType;
  const primaryLabel = entity.subject?.primaryLocation?.label;
  const identityStatus = (entity.subject?.primaryLocation as any)?.identityStatus || 
                         (entity.subject?.identity as any)?.identityStatus;
  const coordinateSource = coords?.source || (entity.subject?.primaryLocation as any)?.coordinateSource;

  if (canonicalName && entityType && primaryLabel && identityStatus !== 'failed') {
    identityValid = true;
  } else {
    identityValid = false;
    valid = false;
    failureReason = failureReason === 'none' ? "Invalid identity (missing canonicalName, entityType, or label, or status failed)" : `${failureReason}, Invalid identity`;
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
      const isMarineEntity = 
        entityType === 'shipwreck_site' || 
        entityType === 'shipwreck' || 
        entityType === 'submerged_archaeological_site' || 
        entityType === 'maritime_disaster_site' ||
        entityType === 'underwater_cultural_heritage' ||
        entityType === 'naval_wreck' ||
        entityType === 'aircraft_wreck_at_sea';

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
