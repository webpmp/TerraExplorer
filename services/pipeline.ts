import { LocationInfo, QueryIntent, isValidCoordinates, Waypoint, CoordinateSource, GeographicIdentityStatus } from '../types';
import { ResolvedEntity, EnrichmentResult } from '../domain';
import { routeIntentAndExtractEntity, resolveLocationQuery, sanitizeLocationInfo, recoverCoordinatesFromAi, recoverLocationMetadata, getUserSettings, generateRoute, normalizeCoordinates, isLMStudioNoModelError } from './geminiService';
import { enrichLocationInfo } from './locationService';
import { createIdentity, createResolvedSubject, createResolvedEntity } from './entityFactory';
import { validateResolvedEntity, isGenericPlaceholderDescription, evaluateEnrichmentCompleteness, logEnrichmentCompleteness } from './entityValidation';
import { mergeCoordinates } from './coordinateAuthority';
import { CanonicalGeographicEntity } from '../domain';
import { classifyGeographicEntity } from './classifierService';
import { getEstimatedClimate, getClimateDescription, isClimateConflicting } from './geographic/climateEstimator';
import { reverseGeocode, enrichSettlementPopulation, isPopulationBearingEntity } from './geographic/geographicResolver';
import { isPlaceholderString } from '../components/InfoPanel';
import { validateEarthGeography } from './celestialCapabilities';
import { getHistoricalEntityKnowledge, toCanonicalTitleCase } from './geographic/historicalCoordinateValidator';
import { determineHistoricalEventScope, logHistoricalEventScope } from './geographic/historicalEventScope';
import { deduplicateNotableFacts } from '../utils/notableFactsUtils';
import { validateEntityIdentity, logCoordinateRecoveryIdentityCheck, logEntityIdentityValidation, isInvalidCanonicalName } from './geographic/entityIdentityValidator';
import { detectHistoricalRouteEvent, normalizeSemanticEntityTitle } from './queryNormalizer';
import { getAuthoritativeEventModel } from './geographic/historicalRouteRegistry';
import { resolveAlias } from './geographic/geographicAliases';

// --- PIPELINE TYPES ---

export interface SearchRequest {
  rawQuery: string;
  intent?: QueryIntent;
  entity?: string;
}

export interface NormalizedQuery {
  request: SearchRequest;
  normalizedQuery: string;
}

export interface IntentResult {
  normalized: NormalizedQuery;
  intent: QueryIntent;
  queryShape?: string;
}

export interface EntityResolutionResult {
  intentResult: IntentResult;
  entity: string;
}

export interface CoordinateResolutionResult {
  entityResult: EntityResolutionResult;
  aiUsed: boolean;
  recoveryUsed: boolean;
  source: CoordinateSource;
  error?: string;
  data: LocationInfo;
}

export interface FinalLocationResult {
  data: LocationInfo;
  source: CoordinateSource;
  error?: string;
  suggestedZoom?: number;
  entityResult?: EntityResolutionResult;
}

// --- PIPELINE STAGES ---

export const SearchStage = (request: SearchRequest | string): EntityResolutionResult => {
  const reqObj: SearchRequest = typeof request === 'string' ? { rawQuery: request } : request;
  const extracted = routeIntentAndExtractEntity(reqObj.rawQuery);
  const intent = reqObj.intent || extracted.intent;
  const entity = reqObj.entity || extracted.entity;
  const queryShape = (extracted as any).queryShape || 'DIRECT';

  console.log("=== PIPELINE STAGE: SEARCH REQUEST ===");
  console.log(`Raw Query: "${reqObj.rawQuery}"`);
  console.log(`Classified Intent: ${intent}`);
  console.log(`Query Shape: ${queryShape}`);
  console.log(`Extracted Search Entity: "${entity}"`);
  
  const normalized: NormalizedQuery = {
    request: reqObj,
    normalizedQuery: reqObj.rawQuery.trim()
  };
  console.log("=== PIPELINE STAGE: NORMALIZATION ===");
  console.log(`Normalized Query: "${normalized.normalizedQuery}"`);

  const intentResult: IntentResult = {
    normalized,
    intent,
    queryShape
  };
  console.log("=== PIPELINE STAGE: INTENT ===");
  console.log(`Classified Intent: ${intentResult.intent}`);

  const entityResult: EntityResolutionResult = {
    intentResult,
    entity
  };
  console.log("=== PIPELINE STAGE: ENTITY ===");
  console.log(`Extracted Entity: "${entityResult.entity}"`);

  return entityResult;
};

export const IntentStage = SearchStage;

export const ResolutionStage = async (entityResult: EntityResolutionResult): Promise<FinalLocationResult> => {
  console.log("=== PIPELINE STAGE: COORDINATE RESOLUTION ===");

  // ─── STEP -1: ENTITY ALIAS RESOLUTION ────────────────────────────────────
  // Canonicalize malformed / misspelled entity names BEFORE any geographic
  // operation (geocoder, knowledge-base, AI recovery, enrichment, image search).
  // Example: "The pyramids of gaza" → alias → "pyramids of giza"
  //          → toCanonicalTitleCase → "The Pyramids of Giza"
  //
  // The original user query is preserved separately and must never overwrite
  // the resolved canonical entity identity downstream.
  const originalQueryEntity = entityResult.entity; // preserved for debugging
  const entityLower = originalQueryEntity.toLowerCase().trim();
  const entityNoArticle = entityLower.replace(/^the\s+/i, '');

  // Try alias lookup first with article ("the pyramids of gaza"),
  // then without article ("pyramids of gaza") as fallback.
  const aliasWithArticle = resolveAlias(entityLower);
  const aliasWithoutArticle = resolveAlias(entityNoArticle);
  const aliasResult = aliasWithArticle.aliasApplied ? aliasWithArticle : aliasWithoutArticle;

  // resolvedEntityLookup: lowercase alias key used for KB and geocoder queries
  // resolvedEntityName: canonical title-cased display name (checked against KB)
  const resolvedEntityLookup: string = aliasResult.aliasApplied ? aliasResult.canonical : entityNoArticle;
  const resolvedEntityName: string = aliasResult.aliasApplied
    ? (toCanonicalTitleCase(aliasResult.canonical) || aliasResult.canonical)
    : originalQueryEntity;

  if (aliasResult.aliasApplied) {
    console.log(`[ENTITY ALIAS RESOLUTION]\noriginalQuery="${originalQueryEntity}"\nresolvedEntity="${resolvedEntityName}"\naliasKey="${aliasResult.aliasMatched}"\naliasApplied=true`);
  } else {
    console.log(`[ENTITY ALIAS RESOLUTION]\noriginalQuery="${originalQueryEntity}"\nalias=none\naliasApplied=false`);
  }

  const rawResolverResult = await resolveLocationQuery(
    resolvedEntityName,
    entityResult.intentResult.intent,
    entityResult.intentResult.normalized.request.rawQuery
  );

  let error = rawResolverResult.error;
  let resolvedData = rawResolverResult.locationInfo;
  const suggestedZoom = rawResolverResult.suggestedZoom;
  let recoveryUsed = false;

  console.log(`=== COORDINATE RECOVERY TRACE ===`);
  console.log(`Query: ${entityResult.intentResult.normalized.request.rawQuery}`);
  console.log(`Entity (original): ${originalQueryEntity}`);
  console.log(`Entity (resolved): ${resolvedEntityName}`);
  console.log(`Intent: ${entityResult.intentResult.intent}`);
  console.log(`Initial Resolver Error: ${error || 'None'}`);

  const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE", "TEMP_FAILURE", "HISTORICAL_LOCATION_UNCONFIRMED"];
  const nonGeographicIntents = ['EXPLORATORY', 'BROAD_CULTURAL_QUERY', 'MULTI_LOCATION_DISCOVERY'];
  const isGeographicIntent = entityResult.intentResult.resolutionMode === 'SINGLE_POINT' || !nonGeographicIntents.includes(entityResult.intentResult.intent);

  // Step 0: Validate entity identity of the initial resolver result
  if (resolvedData && resolvedData.name) {
    const initialIdentityCheck = validateEntityIdentity(resolvedEntityName, resolvedData.name, {
      rawQuery: entityResult.intentResult.normalized.request.rawQuery,
      intent: entityResult.intentResult.intent,
      candidateEntityType: (resolvedData as any).entityType,
      candidateCanonicalName: resolvedData.name,
      coordinatesValid: Boolean(resolvedData.coordinates)
    });

    logEntityIdentityValidation({
      requestedEntity: resolvedEntityName,
      candidateName: resolvedData.name,
      candidateEntityType: (resolvedData as any).entityType,
      intent: entityResult.intentResult.intent,
      identityValid: initialIdentityCheck.matches,
      identityStatus: initialIdentityCheck.matches ? ((resolvedData as any).identityStatus || 'verified') : 'unverified',
      rejectionReason: initialIdentityCheck.matches ? undefined : initialIdentityCheck.rejectionReason
    });

    if (!initialIdentityCheck.matches) {
      logCoordinateRecoveryIdentityCheck({
        requestedEntity: resolvedEntityName,
        recoveredEntity: resolvedData.name,
        entityIdentityMatch: false,
        coordinateValidity: Boolean(resolvedData.coordinates),
        recoveryAccepted: false,
        rejectionReason: initialIdentityCheck.rejectionReason || 'ENTITY_IDENTITY_MISMATCH'
      });
      console.warn(`[ENTITY IDENTITY MISMATCH] Resolver returned "${resolvedData.name}" which differs from resolved entity "${resolvedEntityName}" (original query: "${originalQueryEntity}"). Discarding coordinates.`);
      resolvedData.name = resolvedEntityName;
      resolvedData.canonicalName = resolvedEntityName;
      resolvedData.coordinates = undefined;
      error = "NO_GEOGRAPHIC_DATA";
    } else {
      (resolvedData as any).identityStatus = (resolvedData as any).identityStatus || 'verified';
      if (resolvedData.name && resolvedData.name !== 'Unknown') {
        resolvedData.canonicalName = resolvedData.canonicalName || resolvedData.name;
      }
    }
  }

  let coordinatesValid = resolvedData?.coordinates && isValidCoordinates(normalizeCoordinates(resolvedData.coordinates) || normalizeCoordinates(resolvedData));

  if (!coordinatesValid && error && allowedErrors.includes(error) && resolvedEntityName && isGeographicIntent) {
    if (!resolvedData || typeof resolvedData !== 'object' || Array.isArray(resolvedData)) {
      resolvedData = { name: resolvedEntityName };
    }

    // ── Knowledge-base lookup ──────────────────────────────────────────────
    // The KB is the authoritative source for known entities regardless of
    // query intent. A "DIRECT" search for "The pyramids of giza" must find
    // the KB entry just as reliably as a "DISCOVERY_OBJECT_LOCATION" intent.
    // Using resolvedEntityLookup (alias-corrected lowercase) and resolvedEntityName
    // so "pyramids of giza" hits the KB even if Nominatim failed.
    const histKnowledge =
      getHistoricalEntityKnowledge(resolvedEntityLookup) ||
      getHistoricalEntityKnowledge(resolvedEntityName) ||
      getHistoricalEntityKnowledge(resolvedData?.name || '');

    if (histKnowledge?.approximateCoordinates) {
      const coordSource = histKnowledge.approximateCoordinates.source || 'deterministic';
      resolvedData.name = histKnowledge.entity;
      resolvedData.canonicalName = histKnowledge.entity;
      resolvedData.coordinates = { ...histKnowledge.approximateCoordinates };
      (resolvedData as any).entityType = histKnowledge.entityType === 'shipwreck' ? 'shipwreck_site' : histKnowledge.entityType;
      (resolvedData as any).coordinateSource = coordSource;
      (resolvedData as any).coordinateTrust = coordSource === 'deterministic' ? 'verified' : 'provisional';
      (resolvedData as any).identityStatus = 'verified';
      (resolvedData as any).isApproximate = !histKnowledge.exactLocationConfirmed;
      (resolvedData as any).exactLocationKnown = histKnowledge.exactLocationKnown ?? true;
      (resolvedData as any).confirmedWreckLocation = histKnowledge.confirmedWreckLocation ?? true;
      if (histKnowledge.country) (resolvedData as any).country = histKnowledge.country;
      if (histKnowledge.state) (resolvedData as any).state = histKnowledge.state;
      if (histKnowledge.nearbyCity || (histKnowledge as any).city) {
        (resolvedData as any).city = histKnowledge.nearbyCity || (histKnowledge as any).city;
      }
      resolvedData.description = resolvedData.description || histKnowledge.historicalContext || histKnowledge.sourceRationale || "";
      error = undefined;
      coordinatesValid = true;
      console.log(`[HISTORICAL KNOWLEDGE RESOLUTION]\nentity="${histKnowledge.entity}"\nsource=${coordSource}\ncoordinates=${resolvedData.coordinates.lat},${resolvedData.coordinates.lng}\nconfidence=${histKnowledge.confidence}\ncountry=${histKnowledge.country || 'unknown'}\noriginalQuery="${originalQueryEntity}"`);
    } else {
      const recoveryTarget = (resolvedData?.name && resolvedData.name !== 'Unknown' && resolvedData.name !== resolvedEntityName)
        ? resolvedData.name
        : resolvedEntityName;

      const recoveryCoords = await recoverCoordinatesFromAi(
        entityResult.intentResult.normalized.request.rawQuery,
        entityResult.intentResult.intent,
        recoveryTarget
      );

      let recoveredValid = false;
      let source: CoordinateSource = "ai_recovery";
      if (recoveryCoords && isValidCoordinates(recoveryCoords)) {
        const incoming = {
           lat: recoveryCoords.lat,
           lng: recoveryCoords.lng,
           source: (recoveryCoords as any).source || 'ai_recovery'
        } as any;

        const existing = resolvedData.coordinates ? {
           lat: resolvedData.coordinates.lat,
           lng: resolvedData.coordinates.lng,
           source: (resolvedData as any).coordinateSource || (resolvedData.coordinates as any).source || 'ai_recovery'
        } as any : null;

        resolvedData.coordinates = mergeCoordinates(existing, incoming);
        const recoveredName = (recoveryCoords as any).recoveredEntity || (recoveryCoords as any).resolvedEntity || (recoveryCoords as any).name || (recoveryCoords as any).canonicalName;
        if (recoveredName) {
          resolvedData.name = recoveredName;
          resolvedData.canonicalName = recoveredName;
        } else {
          resolvedData.name = resolvedData.name || resolvedEntityName;
          resolvedData.canonicalName = resolvedData.canonicalName || resolvedData.name || resolvedEntityName;
        }
        (resolvedData as any).coordinateSource = incoming.source;
        const incomingTrust: string = (recoveryCoords as any).coordinateTrust || 'provisional';
        (resolvedData as any).coordinateTrust = incomingTrust;
        const recoveredIdentityMatches = validateEntityIdentity(resolvedEntityName, resolvedData.name, {
          rawQuery: entityResult.intentResult.normalized.request.rawQuery,
          intent: entityResult.intentResult.intent,
          candidateEntityType: (resolvedData as any).entityType,
          candidateCanonicalName: resolvedData.name,
          coordinatesValid: true
        }).matches;

        // identityStatus tracks ENTITY identity (whether the name matches).
        // It is intentionally kept separate from coordinateTrust which tracks
        // GEOGRAPHIC reliability. An LLM naming the entity correctly does NOT
        // prove its coordinates are correct — see trust gate below.
        (resolvedData as any).identityStatus = incomingTrust === 'verified'
          ? 'verified'
          : (recoveredIdentityMatches ? ((resolvedData as any).identityStatus || 'verified') : 'unverified');
        error = undefined;
        recoveryUsed = true;
        recoveredValid = true;
        source = incoming.source;
      } else {
        resolvedData.name = resolvedData.name || resolvedEntityName;
        resolvedData.canonicalName = resolvedData.canonicalName || resolvedData.name || resolvedEntityName;
        resolvedData.coordinates = undefined;
        error = "NO_GEOGRAPHIC_DATA";
      }

      console.log(`[COORDINATE RECOVERY]\nRecovery success: ${recoveredValid ? 'Yes' : 'No'}\nRecovered coordinates: ${recoveryCoords ? JSON.stringify(recoveryCoords) : 'None'}\nSource: ${source}\nresolvedEntity="${resolvedEntityName}"\nrecoveryTarget="${recoveryTarget}"\noriginalQuery="${originalQueryEntity}"`);
    }
  }

  // Normalize whatever coordinates we have at this point
  let finalSource: CoordinateSource = 'deterministic';
  let finalStatus: GeographicIdentityStatus = 'verified';
  let finalTrust: 'verified' | 'provisional' | 'unverified' = 'verified';

  if (resolvedData && resolvedData.coordinates) {
     const inputCoords = JSON.stringify(resolvedData.coordinates);
     const normalized = normalizeCoordinates(resolvedData.coordinates) || normalizeCoordinates(resolvedData);
     if (normalized) {
         resolvedData.coordinates = normalized;
     }
     
     console.log(`[COORDINATE NORMALIZATION]\nInput: ${inputCoords}\nNormalized coordinates: ${JSON.stringify(resolvedData.coordinates)}`);
     
     const finalValid = isValidCoordinates(resolvedData.coordinates);
     coordinatesValid = finalValid;
     
       finalSource = (resolvedData.coordinates as any)?.source || 
                     (resolvedData as any)?.coordinateSource || 
                     (recoveryUsed ? 'ai_recovery' : ((rawResolverResult as any)?.aiUsed ? 'ai' : 'deterministic'));
       
       finalTrust = 
         (finalSource === 'deterministic' || finalSource === 'geocoder') ? 'verified' :
         ((resolvedData as any)?.coordinateTrust === 'verified' ? 'verified' : 
         ((resolvedData as any)?.coordinateTrust === 'provisional' ? 'provisional' : 
         ((resolvedData as any)?.coordinateTrust === 'unverified' ? 'unverified' :
         ((finalSource === 'ai' || finalSource === 'ai_recovery') ? 'provisional' : 'verified'))));

       finalStatus = (resolvedData as any)?.identityStatus || 
                     (finalTrust === 'verified' ? 'verified' : 'unverified');

       resolvedData.coordinates.source = finalSource;
       (resolvedData.coordinates as any).coordinateTrust = finalTrust;
       (resolvedData.coordinates as any).coordinateSource = finalSource;
       (resolvedData.coordinates as any).coordinateTrust = finalTrust;
       (resolvedData.coordinates as any).identityStatus = finalStatus;
       
       const providerLabel = finalSource === 'geocoder' 
         ? 'Nominatim' 
         : (finalSource === 'deterministic' ? 'DeterministicDB' : (finalSource === 'ai_recovery' ? 'ai_recovery' : 'lmstudio'));

       console.log(`[FINAL COORDINATE VALIDATION]\nCoordinates: ${JSON.stringify(resolvedData.coordinates)}\nSource: ${finalSource}\nTrust: ${finalTrust}\nValid: ${finalValid}`);
       console.log(`COORDINATE_FINAL\nname: ${resolvedData.name || entityResult.entity}\nlat: ${resolvedData.coordinates.lat}\nlng: ${resolvedData.coordinates.lng}\nsource: ${finalSource}\ntrust: ${finalTrust}\nstatus: ${finalStatus}\nprovider: ${providerLabel}`);

       // AI Coordinate Trust Gate
       // ─────────────────────────────────────────────────────────────────────
       // Identity verification and coordinate verification are SEPARATE concepts.
       //
       // identityStatus = 'verified' means the AI correctly NAMED the entity.
       // coordinateTrust = 'provisional' means the coordinates are AI-generated
       //   with no authoritative geographic corroboration.
       //
       // Policy:
       //   (A) Known KB entity with provisional AI coordinates → REJECT.
       //       The KB provides authoritative deterministic coordinates; an AI
       //       override of those coordinates must be refused.  The Pyramids of
       //       Gaza bug: AI named Giza correctly but returned Mediterranean
       //       coordinates — and would have passed the old "provisional +
       //       verified identity" gate.  For KB-known entities the KB path
       //       should already have run (so AI recovery is unreachable), but this
       //       gate is a secondary safety net.
       //
       //   (B) Unknown entity, identity unverified, trust provisional → REJECT.
       //       Neither the entity name nor the coordinates are trustworthy.
       //
       //   (C) Unknown entity, identity verified, trust provisional → PASS.
       //       For entities not in the KB (El Faro, Dead Sea, Easter Island …),
       //       AI recovery with a verified entity match is the only available
       //       source. Allow it — the existing identity and bounding-box checks
       //       provide sufficient guard.
       const isAiSource = finalSource === 'ai' || finalSource === 'ai_recovery';
       const entityInKb = !!(
         getHistoricalEntityKnowledge(resolvedEntityLookup) ||
         getHistoricalEntityKnowledge(resolvedData.name || '') ||
         getHistoricalEntityKnowledge(resolvedEntityName)
       );
       // Reject provisional when entity is in the KB (has deterministic coords),
       // OR when identity is also unverified (both name AND coordinates unknown).
       const isUnverifiedAi = isAiSource && (
         finalTrust === 'unverified' ||
         (finalTrust === 'provisional' && entityInKb) ||
         (finalTrust === 'provisional' && finalStatus === 'unverified')
       );

       if (isUnverifiedAi) {
         const rejectedProposal = {
           proposedCoordinates: { ...resolvedData.coordinates },
           source: finalSource,
           trust: finalTrust,
           identityStatus: finalStatus,
           rejectionReason: entityInKb ? 'KB_ENTITY_REQUIRES_DETERMINISTIC_COORDINATES' : 'UNVERIFIED_AI_COORDINATES'
         };
         (resolvedData as any).rejectedAiProposal = rejectedProposal;
         console.log(`[COORDINATE TRUST GATE]\nResult: REJECT\nProposed Coordinates: ${JSON.stringify(resolvedData.coordinates)}\nSource: ${finalSource}\nTrust: ${finalTrust}\nIdentityStatus: ${finalStatus}\nEntity: "${resolvedData.name || resolvedEntityName}"\nOriginalQuery: "${originalQueryEntity}"\nEntityInKB: ${entityInKb}\nRejection Reason: ${entityInKb ? 'AI_COORDINATES_REJECTED_FOR_KB_KNOWN_ENTITY' : 'AI_COORDINATES_REQUIRE_CORROBORATION'}`);
         coordinatesValid = false;
         resolvedData.coordinates = undefined;
         error = "UNRESOLVED_ENTITY";
       } else {
         console.log(`[COORDINATE TRUST GATE]\nResult: PASS\nCoordinates: ${JSON.stringify(resolvedData.coordinates)}\nSource: ${finalSource}\nTrust: ${finalTrust}\nIdentityStatus: ${finalStatus}\nEntity: "${resolvedData.name || resolvedEntityName}"\nEntityInKB: ${entityInKb}`);
       }
  }

  // 1. CANONICAL ENTITY LOCK
  // After coordinates are successfully recovered and normalized, establish identity
  let canonicalEntity: CanonicalGeographicEntity | null = null;
  let identity: ReturnType<typeof createIdentity> | null = null;
  let entityType: any;
  let authoritativeHierarchy = '';
  let locationLabel = '';

  if (coordinatesValid && resolvedData && resolvedData.coordinates) {
      // KB check without intent gate — the KB entity name is authoritative
      // for any intent when it matches the resolved entity.
      const histKnowledge =
        getHistoricalEntityKnowledge(resolvedEntityLookup) ||
        getHistoricalEntityKnowledge(resolvedData.name || '') ||
        getHistoricalEntityKnowledge(resolvedEntityName);

      const resolvedCanonical = resolvedData.canonicalName || (resolvedData.name && resolvedData.name !== 'Unknown' ? resolvedData.name : null);
      const queryCanonical = resolvedEntityName && resolvedEntityName !== 'Unknown' ? resolvedEntityName : null;
      let canonicalName = histKnowledge?.entity || resolvedCanonical || queryCanonical || (resolvedData.name && resolvedData.name !== 'Unknown' ? resolvedData.name : null);

      canonicalName = normalizeSemanticEntityTitle({
        explicitTitle: canonicalName || undefined,
        canonicalName: canonicalName || undefined,
        displayName: (resolvedData as any).displayName,
        name: resolvedData.name,
        subject: resolvedEntityName,
        rawQuery: entityResult.intentResult.normalized.request.rawQuery,
        query: entityResult.intentResult.normalized.request.rawQuery,
        description: resolvedData.description,
        coordinates: resolvedData.coordinates
      });

      if (isInvalidCanonicalName(canonicalName)) {
        if (resolvedCanonical && !isInvalidCanonicalName(resolvedCanonical)) {
          canonicalName = resolvedCanonical;
        } else if (queryCanonical && !isInvalidCanonicalName(queryCanonical)) {
          canonicalName = queryCanonical;
        } else {
          canonicalName = 'Unknown';
        }
      }

      // Lock resolvedData.name and canonicalName — original query must never overwrite
      resolvedData.name = canonicalName;
      resolvedData.canonicalName = canonicalName;

      // Populate administrative context if missing from deterministic coordinates
      if (!resolvedData.country || !resolvedData.state || !resolvedData.city) {
          try {
              const rev = await reverseGeocode(resolvedData.coordinates.lat, resolvedData.coordinates.lng);
              if (rev) {
                  const revCity = rev.city || rev.town || rev.village || (rev.municipality ? rev.municipality.replace(/^Municipality of\s+/i, '').replace(/\s+Municipality$/i, '').trim() : undefined);
                  resolvedData.country = resolvedData.country || rev.country;
                  resolvedData.state = resolvedData.state || rev.state;
                  resolvedData.city = resolvedData.city || revCity;
                  resolvedData.county = resolvedData.county || rev.county;
              }
          } catch {
              // Best effort
          }
      }

      // If administrative context is still missing (e.g. offshore marine site), preserve from validated historical knowledge
      if (histKnowledge) {
          if (!resolvedData.country && histKnowledge.country) {
              resolvedData.country = histKnowledge.country;
          } else if (!resolvedData.country && histKnowledge.allowedCountries?.length > 0) {
              resolvedData.country = histKnowledge.allowedCountries[0];
          }
          if (!resolvedData.state && histKnowledge.state) {
              resolvedData.state = histKnowledge.state;
          }
          if (!resolvedData.city && histKnowledge.nearbyCity) {
              resolvedData.city = histKnowledge.nearbyCity;
          }
          if (!resolvedData.locationString && (histKnowledge.expectedRegion || histKnowledge.approximateRegion)) {
              resolvedData.locationString = histKnowledge.expectedRegion || histKnowledge.approximateRegion;
          }
      }

      const authCity = (resolvedData as any).city;
      const authState = (resolvedData as any).state;
      const authCountry = (resolvedData as any).country;

      locationLabel = '';
      if (authCity && authCountry) {
          locationLabel = `${authCity}, ${authCountry}`;
      } else if (authState && authCountry) {
          locationLabel = `${authState}, ${authCountry}`;
      } else if (authCountry) {
          locationLabel = authCountry;
      } else if (authCity && authState) {
          locationLabel = `${authCity}, ${authState}`;
      } else if (authCity) {
          locationLabel = authCity;
      } else if (authState) {
          locationLabel = authState;
      }

      authoritativeHierarchy = [authCity, authState, authCountry].filter(Boolean).filter((val, idx, arr) => arr.indexOf(val) === idx).join(', ');

      if (!resolvedData.locationString && authoritativeHierarchy) {
          resolvedData.locationString = authoritativeHierarchy;
      }

      console.log(`[GEOGRAPHIC CONTEXT]
entity="${canonicalName}"
coordinates=${resolvedData.coordinates.lat.toFixed(7)},${resolvedData.coordinates.lng.toFixed(7)}
city="${authCity || 'none'}"
state="${authState || 'none'}"
country="${authCountry || 'none'}"
source="${finalSource}"
locationLabel="${locationLabel || 'none'}"`);
      
      const providerSignals = [
          ...((resolvedData as any).discoverySignals || []),
          histKnowledge?.entityType === 'shipwreck' ? 'shipwreck_site' : histKnowledge?.entityType,
          resolvedData.entityType,
          resolvedData.type
      ].filter(Boolean);
      const adminContext = [
          (resolvedData as any).country,
          (resolvedData as any).state,
          (resolvedData as any).county
      ].filter(Boolean);

      entityType = await classifyGeographicEntity(
          canonicalName,
          resolvedData.coordinates,
          providerSignals,
          {
              type: resolvedData.type,
              entityType: histKnowledge?.entityType || resolvedData.entityType,
              country: (resolvedData as any).country,
              state: (resolvedData as any).state,
              city: (resolvedData as any).city,
              county: (resolvedData as any).county
          }
      );

      canonicalEntity = {
          canonicalName,
          entityType,
          coordinates: {
              lat: resolvedData.coordinates.lat,
              lng: resolvedData.coordinates.lng,
              source: finalSource
          },
          coordinateSource: finalSource,
          coordinateTrust: finalTrust,
          identityStatus: finalStatus,
          providerSignals,
          adminContext,
          osmId: (resolvedData as any).osmId,
          osmType: (resolvedData as any).osmType,
          wikidataId: (resolvedData as any).wikidataId,
          wikipedia: (resolvedData as any).wikipedia
      };

      console.log(`[RESOLUTION SUMMARY]\nRaw Query: "${entityResult.intentResult.normalized.request.rawQuery}"\nClassified Intent: ${entityResult.intentResult.intent}\nQuery Shape: ${entityResult.intentResult.queryShape || 'DIRECT'}\nExtracted Search Entity: "${entityResult.entity}"\nResolution Input: "${entityResult.entity}"\nCanonical Entity: "${canonicalName}"\nEntity Type: "${entityType}"\nCoordinate Source: "${finalSource}"\nCoordinate Trust: "${finalTrust}"\nIdentity Status: "${finalStatus}"\nCoordinate Trust Gate: ${coordinatesValid ? 'PASS' : 'REJECT'}`);

      console.log(`[ENRICHMENT IDENTITY]\noriginalQuery="${entityResult.intentResult.normalized.request.rawQuery}"\nnormalizedQuery="${entityResult.intentResult.normalized.normalizedQuery}"\ncanonicalName="${canonicalEntity.canonicalName}"\nentityType="${canonicalEntity.entityType}"\nstate="${(resolvedData as any).state || 'none'}"\ncountry="${(resolvedData as any).country || 'none'}"\ncoordinates=${canonicalEntity.coordinates.lat.toFixed(4)},${canonicalEntity.coordinates.lng.toFixed(4)}\nidentityStatus="${canonicalEntity.identityStatus}"`);
      console.log(`[CANONICAL ENTITY]\nRequested entity: ${entityResult.intentResult.normalized.request.rawQuery}\nResolved name: ${canonicalEntity.canonicalName}\nCanonical name: ${canonicalEntity.canonicalName}\nEntity type: ${canonicalEntity.entityType}\nCoordinates: ${canonicalEntity.coordinates.lat}, ${canonicalEntity.coordinates.lng}\nCoordinate source: ${canonicalEntity.coordinateSource || canonicalEntity.coordinates.source}\nIdentity status: ${canonicalEntity.identityStatus}\nProvider classifications: ${providerSignals.join(',') || 'none'}\nFinal classification: ${canonicalEntity.entityType}\nClassification confidence: 1.0\nAdministrative context: ${JSON.stringify(adminContext)}`);

      identity = createIdentity(
          entityResult.intentResult.normalized.request.rawQuery,
          canonicalName,
          "place",
          entityType,
          {}
      );
  }

  // 2.5 STRUCTURED POPULATION RESOLUTION
  if (coordinatesValid && canonicalEntity && isPopulationBearingEntity(canonicalEntity.entityType, canonicalEntity.canonicalName)) {
      if (!(resolvedData as any).population || !(resolvedData as any).population.value) {
          try {
              await enrichSettlementPopulation(
                  resolvedData,
                  {
                      name: canonicalEntity.canonicalName,
                      lat: canonicalEntity.coordinates.lat,
                      lng: canonicalEntity.coordinates.lng,
                      state: (resolvedData as any).state,
                      country: (resolvedData as any).country,
                      city: (resolvedData as any).city,
                      type: canonicalEntity.entityType
                  },
                  canonicalEntity.entityType
              );
          } catch (err) {
              console.warn("Failed to enrich settlement population in pipeline:", err);
          }
      }
  }

  // 3. METADATA RECOVERY & ENRICHMENT COMPLETENESS
  const isPlaceholder = isGenericPlaceholderDescription(resolvedData?.description, canonicalEntity?.canonicalName);
  const initialCompleteness = evaluateEnrichmentCompleteness(
    resolvedData,
    canonicalEntity?.canonicalName,
    canonicalEntity?.entityType
  );
  logEnrichmentCompleteness(initialCompleteness);

  if (coordinatesValid && canonicalEntity && initialCompleteness.recoveryRequired) {
      try {
        const metadataRecovery = await recoverLocationMetadata(canonicalEntity.canonicalName, canonicalEntity.coordinates, {
          ...canonicalEntity,
          country: (resolvedData as any).country,
          state: (resolvedData as any).state,
          city: (resolvedData as any).city,
          county: (resolvedData as any).county,
          region: (resolvedData as any).region,
          climate: (resolvedData as any).climate,
          originalQuery: entityResult.intentResult.normalized.request.rawQuery
        });
        if (metadataRecovery) {
           console.log(`=== RECOVERY ENRICHMENT TRACE ===`);
           console.log(`Metadata Present: true`);
           console.log(`Enrichment Executed: true`);

           const validFields = (metadataRecovery as any)._validFields || Object.keys(metadataRecovery).filter(k => !k.startsWith('_'));
           const rejectedFields = (metadataRecovery as any)._rejectedFields || [];
           console.log(`[RECOVERY MERGE FILTER]\nAccepted fields: ${validFields.length > 0 ? validFields.join(', ') : 'None'}\nRejected fields excluded: ${rejectedFields.length > 0 ? rejectedFields.join(', ') : 'None'}`);

           if (rejectedFields.includes('climate')) {
             delete (resolvedData as any).climate;
           }
           if (rejectedFields.includes('population')) {
             delete (resolvedData as any).population;
           }
           
           if (authoritativeHierarchy && metadataRecovery.locationString && metadataRecovery.locationString !== authoritativeHierarchy) {
               console.log(`[GEOGRAPHIC CONTEXT PRESERVED]\nauthoritative="${authoritativeHierarchy}"\naiLocationString="${metadataRecovery.locationString}"\naction="authoritative_context_retained"`);
               metadataRecovery.locationString = authoritativeHierarchy;
           }

           // Strip AI entity categorization to preserve canonical identity
           delete (metadataRecovery as any).type;
           delete (metadataRecovery as any).entityType;
           delete (metadataRecovery as any).name; // NEVER overwrite name
           
           // Attach the recovered metadata directly to resolvedData
           (resolvedData as any)._recoveredMetadata = metadataRecovery;
           if (metadataRecovery.notable && Array.isArray(metadataRecovery.notable) && metadataRecovery.notable.length > 0) {
             (resolvedData as any).notable = metadataRecovery.notable;
           }
           if (metadataRecovery.contextNotes && Array.isArray(metadataRecovery.contextNotes) && metadataRecovery.contextNotes.length > 0) {
             (resolvedData as any).contextNotes = metadataRecovery.contextNotes;
           }
           if (metadataRecovery.description && isPlaceholder) {
             resolvedData.description = metadataRecovery.description;
           }
        } else {
           console.warn(`=== RECOVER METADATA WARN ===\nMetadata recovery returned empty.`);
           const histKnowledge = getHistoricalEntityKnowledge(canonicalEntity.canonicalName);
           if (histKnowledge && histKnowledge.historicalContext) {
             resolvedData.description = histKnowledge.historicalContext;
           }
        }
      } catch (err) {
        console.error("Failed to generate metadata for recovered coordinates:", err);
      }
  }

  // Construct the ResolvedEntity Domain Object
  let entity: ResolvedEntity | undefined = undefined;
  
  if (resolvedData && resolvedData.coordinates && identity && canonicalEntity) {
     const providerName = finalSource === 'geocoder' 
       ? "Nominatim" 
       : (finalSource === 'deterministic' ? "DeterministicDB" : (finalSource === 'ai_recovery' ? "ai_recovery" : "lmstudio"));

     const primaryLocation = {
         label: canonicalEntity.canonicalName,
         featureType: canonicalEntity.entityType,
         location: {
             coordinates: canonicalEntity.coordinates,
             address: {
                 country: (resolvedData as any).country,
                 state: (resolvedData as any).state,
                 city: (resolvedData as any).city,
                 full: (resolvedData as any).locationString
             },
             boundingBox: resolvedData.boundary as any
         },
         coordinateSource: finalSource,
         coordinateTrust: (canonicalEntity as any).coordinateTrust || (resolvedData as any).coordinateTrust || finalTrust,
         identityStatus: finalStatus,
         isApproximate: (resolvedData as any).isApproximate ?? (canonicalEntity as any).isApproximate ?? (finalSource === 'historical_approximate'),
         exactLocationKnown: (resolvedData as any).exactLocationKnown ?? (canonicalEntity as any).exactLocationKnown ?? (finalSource !== 'historical_approximate'),
         provenance: {
             provider: providerName,
             timestamp: Date.now(),
             cache: false
         },
         diagnostics: {}
     };
     
     const subject = createResolvedSubject(
         identity,
         primaryLocation as any
     );
     
     const recoveredMetadata = (resolvedData as any)._recoveredMetadata as Partial<EnrichmentResult> | undefined;
     
     // Authority hierarchy: deterministic geographic data > validated provider data > LLM-generated metadata
     let initialClimate = (resolvedData as any).climate;
     if (initialClimate) {
         const initialConflict = isClimateConflicting(
             initialClimate,
             undefined,
             canonicalEntity.coordinates.lat,
             canonicalEntity.coordinates.lng,
             (resolvedData as any).state || (resolvedData as any).region,
             (resolvedData as any).country,
             canonicalEntity.entityType
         );
         if (initialConflict.isConflict) {
             console.warn(`[CLIMATE CONTRADICTION REJECTION] Discarded conflicting initial climate "${initialClimate.name || initialClimate.value}" (${initialConflict.reason}).`);
             initialClimate = undefined;
         }
     }

     const recoveredClimate = recoveredMetadata?.climate;
     let finalClimate = initialClimate;

     if (recoveredClimate) {
         const conflict = isClimateConflicting(
             recoveredClimate,
             initialClimate,
             canonicalEntity.coordinates.lat,
             canonicalEntity.coordinates.lng,
             (resolvedData as any).state || (resolvedData as any).region,
             (resolvedData as any).country,
             canonicalEntity.entityType
         );
         if (conflict.isConflict) {
             console.warn(`[CLIMATE CONTRADICTION REJECTION] Discarded conflicting recovered climate "${recoveredClimate.name || recoveredClimate.value}" during merge (${conflict.reason}). Preserving authoritative deterministic climate.`);
             finalClimate = initialClimate;
         } else {
             finalClimate = recoveredClimate;
         }
     }

     const authoritativePopulation = (resolvedData as any).population;

       // Merge deterministic/initial metadata with recovered metadata
       const initialNotable = Array.isArray((resolvedData as any).notable) ? (resolvedData as any).notable : [];
       const recoveredNotable = Array.isArray(recoveredMetadata?.notable) ? recoveredMetadata.notable : [];
       const mergedNotable = deduplicateNotableFacts([...initialNotable, ...recoveredNotable]);

       const initialContextNotes = Array.isArray((resolvedData as any).contextNotes) ? (resolvedData as any).contextNotes : [];
       const recoveredContextNotes = Array.isArray(recoveredMetadata?.contextNotes) ? recoveredMetadata.contextNotes : [];
       const mergedContextNotes = Array.from(new Set([...initialContextNotes, ...recoveredContextNotes].filter(Boolean)));

       const histKnowledgeForMeta = getHistoricalEntityKnowledge(canonicalEntity.canonicalName) || getHistoricalEntityKnowledge(entityResult.entity);
       const histContext = histKnowledgeForMeta?.historicalContext || (resolvedData as any).historicalContext || recoveredMetadata?.historicalContext;

       // Create a sanitized shallow copy of recoveredMetadata omitting internal tracking fields and rejected keys
       const sanitizedRecovered: any = { ...recoveredMetadata };
       delete sanitizedRecovered._validFields;
       delete sanitizedRecovered._rejectedFields;
       delete sanitizedRecovered.climate;
       delete sanitizedRecovered.population;

       const finalMetadata: any = {
           description: (isPlaceholder && recoveredMetadata?.description) ? recoveredMetadata.description : (resolvedData.description || recoveredMetadata?.description),
           climate: finalClimate,
           population: authoritativePopulation,
           notable: mergedNotable,
           news: resolvedData.news || [],
           contextNotes: mergedContextNotes,
           historicalContext: histContext,
           intent: entityResult.intentResult.intent,
           ...sanitizedRecovered
       };

       // Ensure authoritative climate, population, notable facts, context notes, and historical context are preserved
       finalMetadata.climate = finalClimate;
       finalMetadata.population = authoritativePopulation;
       finalMetadata.notable = mergedNotable;
       finalMetadata.contextNotes = mergedContextNotes;
       if (histContext) finalMetadata.historicalContext = histContext;
       finalMetadata.intent = entityResult.intentResult.intent;

       if (isPlaceholder && recoveredMetadata?.description) {
           finalMetadata.description = recoveredMetadata.description;
       }

     // Validate population for settlements vs non-settlements
     const eTypeLower = (canonicalEntity.entityType || '').toLowerCase();
     const isSettlement = ['city', 'town', 'village', 'municipality', 'settlement', 'country', 'state'].includes(eTypeLower);
     if (!isSettlement || 
         !finalMetadata.population || 
         finalMetadata.population.status === 'lookup_failed' || 
         finalMetadata.population.status === 'not_applicable' || 
         finalMetadata.population.source === 'ai' ||
         (typeof finalMetadata.population.value === 'number' && finalMetadata.population.value <= 0)) {
         finalMetadata.population = undefined;
     }

     const hasClimate = finalMetadata.climate && (
         (typeof finalMetadata.climate === 'string' && !isPlaceholderString(finalMetadata.climate)) ||
         (typeof finalMetadata.climate === 'object' && (
             (finalMetadata.climate.name && !isPlaceholderString(finalMetadata.climate.name)) ||
             (finalMetadata.climate.value && !isPlaceholderString(finalMetadata.climate.value))
         ))
     );

     if (!hasClimate) {
         const lat = canonicalEntity.coordinates.lat;
         const lng = canonicalEntity.coordinates.lng;
         const reg = (resolvedData as any).state || (resolvedData as any).region || "";
         const ctry = (resolvedData as any).country || "";
         const eType = canonicalEntity.entityType;
         const est = getEstimatedClimate(lat, lng, reg, ctry, eType);
         const desc = getClimateDescription(est.koppenCode, est.climateName);
         if (est && !isPlaceholderString(est.climateName)) {
             finalMetadata.climate = {
                 name: est.climateName,
                 description: desc,
                 koppenCode: est.koppenCode
             };
         } else {
             finalMetadata.climate = undefined;
         }
     }
     
     entity = createResolvedEntity(
         subject,
         finalMetadata
     );
     (entity as any).isApproximate = (primaryLocation as any).isApproximate;
     (entity as any).exactLocationKnown = (primaryLocation as any).exactLocationKnown;
     (entity as any).coordinateSource = finalSource;
     (entity as any).coordinateTrust = (resolvedData as any).coordinateTrust || (finalSource === 'deterministic' || finalSource === 'geocoder' ? 'verified' : 'unverified');

     const finalCompleteness = evaluateEnrichmentCompleteness(
         entity.metadata,
         canonicalEntity.canonicalName,
         canonicalEntity.entityType
     );
     logEnrichmentCompleteness(finalCompleteness);
     
     if (recoveryUsed) {
         console.log(`=== RECOVERY MERGE RESULT ===`);
         console.log(`canonicalName: ${entity.subject.identity.canonicalName}`);
         console.log(`entityType: ${entity.subject.identity.entityType}`);
         console.log(`locationLabel: ${entity.subject.primaryLocation.label}`);
         console.log(`coordinates: ${entity.subject.primaryLocation.location.coordinates.lat},${entity.subject.primaryLocation.location.coordinates.lng}`);
         console.log(`metadataKeys: ${Object.keys(entity.metadata).join(',')}`);
         console.log(`===============================`);
     }
  }

  const isValid = validateResolvedEntity(entity);
  if (!isValid) {
     if (error === "HISTORICAL_LOCATION_UNCONFIRMED") {
        // Retain specific historical uncertainty error
     } else if (!error && !coordinatesValid) {
        error = "NO_GEOGRAPHIC_DATA";
     }
  } else if (isValid) {
     error = undefined;
  }

  console.log(`[FINAL GEOGRAPHIC VALIDATION]\nCoordinates valid: ${coordinatesValid}\nEntity identity valid: ${!!(entity?.subject?.identity?.canonicalName && entity?.subject?.identity?.entityType)}\nMetadata available: ${!!(entity?.metadata && Object.keys(entity.metadata).length > 0)}\nFinal valid: ${isValid}\nFinal Error: ${error || 'none'}`);

  return {
    mode: "location",
    entity,
    isValid,
    error
  };
};

export const runSearchPipeline = async (request: SearchRequest): Promise<FinalLocationResult> => {
  const entityResult = IntentStage(request);

  // 1. Celestial Body Validation Guard (Earth-only support across ALL intents)
  const celestialValidation = validateEarthGeography({
    query: request.rawQuery,
    entity: entityResult.entity
  });

  if (!celestialValidation.isValid) {
    console.warn(`[Pipeline] Celestial Body Validation failed: query="${request.rawQuery}" body="${celestialValidation.celestialBody}"`);
    return {
      mode: "location",
      isValid: false,
      error: "UNSUPPORTED_CELESTIAL_BODY"
    };
  }
  
  // 2. Routing Guard: If intent is route / multi-location discovery, or matches authoritative historical route registry, bypass coordinate resolution
  const histCheck = detectHistoricalRouteEvent(request.rawQuery);
  const isHistoricalMatch = histCheck.isHistoricalRouteEvent || Boolean(getAuthoritativeEventModel(entityResult.entity));

  // Check Historical Event Scope (POINT_EVENT vs GLOBAL_EVENT / REGIONAL_EVENT / NON_GEOGRAPHIC_HISTORICAL_EVENT)
  const histScope = (entityResult.intentResult.intent === 'HISTORICAL_EVENT' || (entityResult as any).geographicScope)
    ? determineHistoricalEventScope(entityResult.entity, request.rawQuery)
    : null;

  const isNonPointHistorical = Boolean(histScope && !histScope.singleLocation);

  const selectedPipeline = isHistoricalMatch || entityResult.intentResult.intent === 'route' || entityResult.intentResult.intent === 'EXPLORATORY' || entityResult.intentResult.intent === 'MULTI_LOCATION_DISCOVERY' || (entityResult as any).resolutionMode === 'MULTI_LOCATION_EXPLORATION'
    ? 'HISTORICAL_ROUTE'
    : (isNonPointHistorical ? 'HISTORICAL_NON_POINT' : 'SINGLE_LOCATION');

  console.log(`[PIPELINE ROUTING]\nentity: "${entityResult.entity}"\nhistoricalRegistryMatch: ${isHistoricalMatch}\nselectedPipeline: ${selectedPipeline}`);

  if (histScope) {
    logHistoricalEventScope({
      entity: entityResult.entity,
      scope: histScope.scope,
      singleLocation: histScope.singleLocation,
      routing: histScope.routing,
      coordinateResolution: isNonPointHistorical ? 'SKIPPED' : undefined,
      reason: isNonPointHistorical ? histScope.reason : undefined
    });
  }

  if (isNonPointHistorical && histScope) {
    const canonicalName = toCanonicalTitleCase(entityResult.entity);
    const kbEntry = getHistoricalEntityKnowledge(canonicalName) || getHistoricalEntityKnowledge(entityResult.entity);
    const desc = kbEntry?.historicalContext || `Historical event: ${canonicalName}`;
    const significance = kbEntry?.significance;
    const notable = kbEntry?.notable || [];
    const contextNotes = kbEntry?.contextNotes ? [kbEntry.contextNotes] : [];
    const expectedRegion = kbEntry?.expectedRegion || (histScope.scope === 'GLOBAL_EVENT' ? 'Global' : 'Regional');

    const identity = createIdentity(
      request.rawQuery,
      canonicalName,
      'historical_event',
      'historical_event',
      {},
      {
        geographicScope: histScope.scope,
        singleLocation: false
      }
    );

    const primaryLocation = {
      label: canonicalName,
      featureType: 'historical_event',
      location: {
        coordinates: undefined,
        address: {
          country: expectedRegion,
          state: undefined,
          city: undefined,
          full: expectedRegion
        }
      },
      coordinateSource: 'deterministic' as CoordinateSource,
      coordinateTrust: 'verified' as any,
      identityStatus: 'verified' as GeographicIdentityStatus,
      isApproximate: false,
      exactLocationKnown: false,
      provenance: {
        provider: 'AuthoritativeHistoricalRegistry',
        timestamp: Date.now(),
        cache: false
      },
      diagnostics: {}
    };

    const subject = createResolvedSubject(identity, primaryLocation as any);

    const metadata: EnrichmentResult = {
      description: desc,
      notable,
      contextNotes,
      historicalContext: desc,
      intent: entityResult.intentResult.intent,
      news: []
    };
    if (significance) {
      (metadata as any).significance = significance;
    }

    const resolvedEntity = createResolvedEntity(subject, metadata);
    (resolvedEntity as any).singleLocation = false;
    (resolvedEntity as any).geographicScope = histScope.scope;

    const isValid = validateResolvedEntity(resolvedEntity);

    const finalData = {
      name: canonicalName,
      canonicalName,
      displayName: canonicalName,
      entityType: 'historical_event',
      type: 'historical_event',
      category: 'historical_event',
      intent: entityResult.intentResult.intent,
      historicalContext: desc,
      coordinates: undefined,
      coordinateSource: 'deterministic',
      isApproximate: false,
      exactLocationKnown: false,
      singleLocation: false,
      geographicScope: histScope.scope,
      description: desc,
      significance,
      notable,
      news: [],
      contextNotes,
      locationString: expectedRegion,
      locationLabel: expectedRegion,
      country: expectedRegion
    };

    const result: FinalLocationResult = {
      mode: 'location',
      entity: resolvedEntity,
      isValid,
      error: isValid ? undefined : 'NO_GEOGRAPHIC_DATA'
    };
    (result as any).finalData = finalData;

    console.log(`[NATURAL LOCATION RESULT]\nname: ${finalData.name}\ncoordinates: none\nentityType: ${finalData.entityType}\nmetadataAvailable: true\nvalid: ${isValid}`);

    return result;
  }

  if (
    isHistoricalMatch ||
    entityResult.intentResult.intent === 'route' || 
    entityResult.intentResult.intent === 'EXPLORATORY' || 
    entityResult.intentResult.intent === 'MULTI_LOCATION_DISCOVERY' ||
    (entityResult as any).resolutionMode === 'MULTI_LOCATION_EXPLORATION'
  ) {
     console.log(`[Pipeline] Routing Guard activated for intent: ${entityResult.intentResult.intent}`);
      try {
        const route = await generateRoute(request.rawQuery, isHistoricalMatch ? 'route' : entityResult.intentResult.intent);
        const waypoints = route.waypoints;
        console.log(`[Pipeline] WAYPOINTS AFTER GENERATEROUTE (Main guard):`);
        waypoints.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));
        return {
           mode: "route",
           isValid: true,
           waypoints: waypoints || []
        };
      } catch (error) {
        if (isLMStudioNoModelError(error)) {
          return {
            mode: "route",
            isValid: false,
            error: "LM_STUDIO_NO_MODEL",
            waypoints: []
          };
        }
        throw error;
      }
  }

  let locationResult: FinalLocationResult;
  try {
    locationResult = await ResolutionStage(entityResult);
  } catch (error) {
    if (isLMStudioNoModelError(error)) {
      return {
        mode: "location",
        isValid: false,
        error: "LM_STUDIO_NO_MODEL"
      };
    }
    throw error;
  }
  
  // 3. Fallback Intent Correction
  const entityType = locationResult.entity?.subject?.identity?.entityType;
  
  const isRouteFallback = 
    (entityType as any) === 'historical_trade_route' ||
    (entityType as any) === 'historical_network' ||
    (entityType as any) === 'empire' ||
    (entityType as any) === 'civilization' ||
    entityType === 'route';
    
  if (isRouteFallback) {
      console.log(`=== INTENT ROUTING CORRECTION ===`);
      console.log(`Original Intent: ${entityResult.intentResult.intent}`);
      console.log(`Entity Type: ${entityType}`);
      console.log(`Correction: MULTI_LOCATION_EXPLORATION`);
      console.log(`Recovery: generateRoute()`);
      
      try {
        const route = await generateRoute(request.rawQuery, 'route');
        const waypoints = route.waypoints;
        console.log(`[Pipeline] WAYPOINTS AFTER GENERATEROUTE (Intent fallback):`);
        waypoints.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));
        return {
           mode: "route",
           isValid: waypoints.length > 0,
           waypoints
        };
      } catch (error) {
        if (isLMStudioNoModelError(error)) {
          return {
            mode: "route",
            isValid: false,
            error: "LM_STUDIO_NO_MODEL",
            waypoints: []
          };
        }
        throw error;
      }
  }

  if (locationResult.entity) {
      const e = locationResult.entity;
      const rawDesc = e.metadata.description;
      const descString = typeof rawDesc === 'string'
          ? rawDesc
          : (rawDesc && typeof rawDesc === 'object' && typeof (rawDesc as any).text === 'string'
              ? (rawDesc as any).text
              : (typeof (e.metadata as any)?.description === 'string' ? (e.metadata as any).description : ''));

      const address = e.subject.primaryLocation.location.address as any;
      const finalCity = address?.city || (locationResult as any).locationInfo?.city;
      const finalState = address?.state || (locationResult as any).locationInfo?.state;
      const finalCountry = address?.country || (locationResult as any).locationInfo?.country;
      const finalCounty = address?.county || (locationResult as any).locationInfo?.county;

      let derivedLabel = '';
      if (finalCity && finalCountry) derivedLabel = `${finalCity}, ${finalCountry}`;
      else if (finalState && finalCountry) derivedLabel = `${finalState}, ${finalCountry}`;
      else if (finalCountry) derivedLabel = finalCountry;

      const finalHierarchy = [finalCity, finalState, finalCountry].filter(Boolean).filter((val, idx, arr) => arr.indexOf(val) === idx).join(', ');

      (locationResult as any).finalData = {
          name: e.subject.identity.canonicalName,
          canonicalName: e.subject.identity.canonicalName,
          displayName: e.subject.identity.canonicalName,
          entityType: e.subject.identity.entityType,
          type: e.subject.identity.entityType,
          category: e.subject.identity.category || "place",
          intent: entityResult.intentResult.intent,
          historicalContext: (e.metadata as any)?.historicalContext || (e as any).historicalContext,
          coordinates: e.subject.primaryLocation.location.coordinates,
          coordinateSource: (e as any).coordinateSource ?? (e.subject.primaryLocation as any).coordinateSource,
          isApproximate: (e as any).isApproximate ?? (e.subject.primaryLocation as any).isApproximate,
          exactLocationKnown: (e as any).exactLocationKnown ?? (e.subject.primaryLocation as any).exactLocationKnown,
          confirmedWreckLocation: (e as any).confirmedWreckLocation ?? (e.subject.primaryLocation as any).confirmedWreckLocation,
          description: descString,
          climate: e.metadata.climate,
          population: e.metadata.population,
          notable: e.metadata.notable,
          news: e.metadata.news,
          contextNotes: e.metadata.contextNotes,
          city: finalCity,
          state: finalState,
          country: finalCountry,
          county: finalCounty,
          locationString: address?.full || finalHierarchy || derivedLabel,
          locationLabel: derivedLabel || address?.full || finalHierarchy
      };
  } else {
      const displayName = entityResult.entity ? toCanonicalTitleCase(entityResult.entity) : (request.rawQuery ? toCanonicalTitleCase(request.rawQuery) : 'Unknown');
      (locationResult as any).finalData = {
          name: displayName,
          canonicalName: displayName,
          displayName: displayName,
          intent: entityResult.intentResult.intent
      };
  }

  console.log(`[NATURAL LOCATION RESULT]\nname: ${(locationResult as any).finalData?.name || 'none'}\ncoordinates: ${JSON.stringify((locationResult as any).finalData?.coordinates || 'none')}\nentityType: ${(locationResult as any).finalData?.entityType || 'none'}\nmetadataAvailable: ${!!locationResult.entity?.metadata}\nvalid: ${locationResult.isValid}`);

  return locationResult;
};
