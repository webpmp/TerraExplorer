import { LocationInfo, QueryIntent, isValidCoordinates, Waypoint, CoordinateSource, GeographicIdentityStatus } from '../types';
import { ResolvedEntity, EnrichmentResult } from '../domain';
import { routeIntentAndExtractEntity, resolveLocationQuery, sanitizeLocationInfo, recoverCoordinatesFromAi, recoverLocationMetadata, getUserSettings, generateRoute, normalizeCoordinates } from './geminiService';
import { enrichLocationInfo } from './locationService';
import { createIdentity, createResolvedSubject, createResolvedEntity } from './entityFactory';
import { validateResolvedEntity, isGenericPlaceholderDescription } from './entityValidation';
import { mergeCoordinates } from './coordinateAuthority';
import { CanonicalGeographicEntity } from '../domain';
import { classifyGeographicEntity } from './classifierService';
import { getEstimatedClimate, getClimateDescription, isClimateConflicting } from './geographic/climateEstimator';
import { reverseGeocode, enrichSettlementPopulation, isPopulationBearingEntity } from './geographic/geographicResolver';
import { isPlaceholderString } from '../components/InfoPanel';
import { validateEarthGeography } from './celestialCapabilities';
import { getHistoricalEntityKnowledge, toCanonicalTitleCase } from './geographic/historicalCoordinateValidator';
import { deduplicateNotableFacts } from '../utils/notableFactsUtils';
import { validateEntityIdentity, logCoordinateRecoveryIdentityCheck, logEntityIdentityValidation } from './geographic/entityIdentityValidator';

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
}

export interface EntityResolutionResult {
  intentResult: IntentResult;
  entity: string;
}

export interface CoordinateResolutionResult {
  entityResult: EntityResolutionResult;
  aiUsed: boolean;
  deterministicMatch: boolean;
  resolvedData: Partial<LocationInfo> | undefined;
  suggestedZoom: number | undefined;
  error: string | undefined;
}

export interface MetadataResult {
  coordinateResult: CoordinateResolutionResult;
  enrichedData: Partial<LocationInfo> | undefined;
}

export interface FinalLocationResult {
  mode: "location" | "route";
  entity?: ResolvedEntity;
  finalData?: Partial<LocationInfo>;
  isValid: boolean;
  waypoints?: Waypoint[];
  error?: string;
}

// --- PIPELINE ADAPTERS ---

export const IntentStage = (request: SearchRequest | string): EntityResolutionResult => {
  const reqObj: SearchRequest = typeof request === 'string' ? { rawQuery: request } : request;
  console.log("=== PIPELINE STAGE: SEARCH REQUEST ===");
  console.log(`Raw Query: "${reqObj.rawQuery}"`);
  
  let intent = reqObj.intent;
  let entity = reqObj.entity;
  
  if (!intent || !entity) {
    const extracted = routeIntentAndExtractEntity(reqObj.rawQuery);
    intent = intent || extracted.intent;
    entity = entity || extracted.entity;
  }
  
  const normalized: NormalizedQuery = {
    request: reqObj,
    normalizedQuery: reqObj.rawQuery.trim()
  };
  console.log("=== PIPELINE STAGE: NORMALIZATION ===");
  console.log(`Normalized Query: "${normalized.normalizedQuery}"`);

  const intentResult: IntentResult = {
    normalized,
    intent
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

export const ResolutionStage = async (entityResult: EntityResolutionResult): Promise<FinalLocationResult> => {
  console.log("=== PIPELINE STAGE: COORDINATE RESOLUTION ===");
  
  const rawResolverResult = await resolveLocationQuery(
    entityResult.entity, 
    entityResult.intentResult.intent,
    entityResult.intentResult.normalized.request.rawQuery
  );
  
  let error = rawResolverResult.error;
  let resolvedData = rawResolverResult.locationInfo;
  const suggestedZoom = rawResolverResult.suggestedZoom;
  let recoveryUsed = false;
  
  console.log(`=== COORDINATE RECOVERY TRACE ===`);
  console.log(`Query: ${entityResult.intentResult.normalized.request.rawQuery}`);
  console.log(`Entity: ${resolvedData?.name || entityResult.entity}`);
  console.log(`Intent: ${entityResult.intentResult.intent}`);
  console.log(`Initial Resolver Error: ${error || 'None'}`);
  
  const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE", "TEMP_FAILURE", "HISTORICAL_LOCATION_UNCONFIRMED"];
  const nonGeographicIntents = ['EXPLORATORY', 'HISTORICAL_EVENT', 'BROAD_CULTURAL_QUERY', 'MULTI_LOCATION_DISCOVERY'];
  const isGeographicIntent = !nonGeographicIntents.includes(entityResult.intentResult.intent);

  // Step 0: Validate entity identity of the initial resolver result
  if (resolvedData && resolvedData.name) {
    const initialIdentityCheck = validateEntityIdentity(entityResult.entity, resolvedData.name, {
      rawQuery: entityResult.intentResult.normalized.request.rawQuery,
      intent: entityResult.intentResult.intent,
      candidateEntityType: (resolvedData as any).entityType,
      candidateCanonicalName: resolvedData.name,
      coordinatesValid: Boolean(resolvedData.coordinates)
    });

    logEntityIdentityValidation({
      requestedEntity: entityResult.entity,
      candidateName: resolvedData.name,
      candidateEntityType: (resolvedData as any).entityType,
      intent: entityResult.intentResult.intent,
      identityValid: initialIdentityCheck.matches,
      identityStatus: initialIdentityCheck.matches ? ((resolvedData as any).identityStatus || 'verified') : 'unverified',
      rejectionReason: initialIdentityCheck.matches ? undefined : initialIdentityCheck.rejectionReason
    });

    if (!initialIdentityCheck.matches) {
      logCoordinateRecoveryIdentityCheck({
        requestedEntity: entityResult.entity,
        recoveredEntity: resolvedData.name,
        entityIdentityMatch: false,
        coordinateValidity: Boolean(resolvedData.coordinates),
        recoveryAccepted: false,
        rejectionReason: initialIdentityCheck.rejectionReason || 'ENTITY_IDENTITY_MISMATCH'
      });
      console.warn(`[ENTITY IDENTITY MISMATCH] Resolver returned "${resolvedData.name}" which differs from requested "${entityResult.entity}". Discarding coordinates and reverting to requested entity.`);
      resolvedData.name = entityResult.entity;
      resolvedData.canonicalName = entityResult.entity;
      resolvedData.coordinates = undefined;
      error = "NO_GEOGRAPHIC_DATA";
    } else {
      if (resolvedData.name && resolvedData.name !== 'Unknown') {
        resolvedData.canonicalName = resolvedData.canonicalName || resolvedData.name;
      }
    }
  }

  let coordinatesValid = resolvedData?.coordinates && isValidCoordinates(normalizeCoordinates(resolvedData.coordinates) || normalizeCoordinates(resolvedData));
  
  if (!coordinatesValid && error && allowedErrors.includes(error) && entityResult.entity && isGeographicIntent) {
    if (!resolvedData || typeof resolvedData !== 'object' || Array.isArray(resolvedData)) {
      resolvedData = { name: entityResult.entity };
    }

    const isHistoricalDiscovery = entityResult.intentResult.intent === 'DISCOVERY_OBJECT_LOCATION' || entityResult.intentResult.intent === 'HISTORICAL_EVENT';
    const histKnowledge = isHistoricalDiscovery ? (getHistoricalEntityKnowledge(entityResult.entity) || getHistoricalEntityKnowledge(resolvedData?.name)) : null;

    if (histKnowledge?.approximateCoordinates) {
      resolvedData.name = histKnowledge.entity;
      resolvedData.canonicalName = histKnowledge.entity;
      resolvedData.coordinates = { ...histKnowledge.approximateCoordinates };
      (resolvedData as any).entityType = histKnowledge.entityType === 'shipwreck' ? 'shipwreck_site' : histKnowledge.entityType;
      (resolvedData as any).coordinateSource = histKnowledge.approximateCoordinates.source || 'deterministic';
      (resolvedData as any).identityStatus = 'verified';
      (resolvedData as any).isApproximate = !histKnowledge.exactLocationConfirmed;
      (resolvedData as any).exactLocationKnown = histKnowledge.exactLocationKnown ?? true;
      (resolvedData as any).confirmedWreckLocation = histKnowledge.confirmedWreckLocation ?? true;
      resolvedData.description = resolvedData.description || histKnowledge.historicalContext || histKnowledge.sourceRationale || "";
      error = undefined;
      coordinatesValid = true;
      console.log(`[HISTORICAL KNOWLEDGE APPLIED] Prioritized authoritative historical knowledge for "${entityResult.entity}": ${JSON.stringify(resolvedData.coordinates)}`);
    } else {
      const recoveryCoords = await recoverCoordinatesFromAi(
        entityResult.intentResult.normalized.request.rawQuery,
        entityResult.intentResult.intent,
        entityResult.entity
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
          resolvedData.name = entityResult.entity;
          resolvedData.canonicalName = resolvedData.canonicalName || entityResult.entity;
        }
        (resolvedData as any).coordinateSource = incoming.source;
        (resolvedData as any).identityStatus = (resolvedData as any).identityStatus || "unverified";
        error = undefined;
        recoveryUsed = true;
        recoveredValid = true;
        source = incoming.source;
      } else {
        resolvedData.name = entityResult.entity;
        resolvedData.canonicalName = resolvedData.canonicalName || entityResult.entity;
        resolvedData.coordinates = undefined;
        error = "NO_GEOGRAPHIC_DATA";
      }
      
      console.log(`[COORDINATE RECOVERY]\nRecovery success: ${recoveredValid ? 'Yes' : 'No'}\nRecovered coordinates: ${recoveryCoords ? JSON.stringify(recoveryCoords) : 'None'}\nSource: ${source}`);
    }
  }

  // Normalize whatever coordinates we have at this point
  let finalSource: CoordinateSource = 'deterministic';
  let finalStatus: GeographicIdentityStatus = 'verified';

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
      finalStatus = (resolvedData as any)?.identityStatus || 
                    ((finalSource === 'ai' || finalSource === 'ai_recovery') ? 'unverified' : 'verified');

      resolvedData.coordinates.source = finalSource;
      (resolvedData as any).coordinateSource = finalSource;
      (resolvedData as any).identityStatus = finalStatus;
      
      const providerLabel = finalSource === 'geocoder' 
        ? 'Nominatim' 
        : (finalSource === 'deterministic' ? 'DeterministicDB' : (finalSource === 'ai_recovery' ? 'ai_recovery' : 'lmstudio'));

      console.log(`[FINAL COORDINATE VALIDATION]\nCoordinates: ${JSON.stringify(resolvedData.coordinates)}\nSource: ${finalSource}\nValid: ${finalValid}`);
      console.log(`COORDINATE_FINAL\nname: ${resolvedData.name || entityResult.entity}\nlat: ${resolvedData.coordinates.lat}\nlng: ${resolvedData.coordinates.lng}\nsource: ${finalSource}\nstatus: ${finalStatus}\nprovider: ${providerLabel}`);
  }

  // 1. CANONICAL ENTITY LOCK
  // After coordinates are successfully recovered and normalized, establish identity
  let canonicalEntity: CanonicalGeographicEntity | null = null;
  let identity: ReturnType<typeof createIdentity> | null = null;
  let entityType: any;
  let authoritativeHierarchy = '';
  let locationLabel = '';

  if (coordinatesValid && resolvedData && resolvedData.coordinates) {
      const isHistoricalDiscovery = entityResult.intentResult.intent === 'DISCOVERY_OBJECT_LOCATION' || entityResult.intentResult.intent === 'HISTORICAL_EVENT';
      const histKnowledge = isHistoricalDiscovery ? (getHistoricalEntityKnowledge(resolvedData.name) || getHistoricalEntityKnowledge(entityResult.entity)) : null;
      
      const resolvedCanonical = resolvedData.canonicalName || (resolvedData.name && resolvedData.name !== 'Unknown' ? resolvedData.name : null);
      const queryCanonical = entityResult.entity && entityResult.entity !== 'Unknown' ? entityResult.entity : null;
      const canonicalName = histKnowledge?.entity || resolvedCanonical || queryCanonical || (resolvedData.name || 'Unknown');

      // Lock resolvedData.name and canonicalName
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
          histKnowledge?.entityType,
          isHistoricalDiscovery ? 'shipwreck_site' : undefined,
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
          identityStatus: finalStatus,
          providerSignals,
          adminContext,
          osmId: (resolvedData as any).osmId,
          osmType: (resolvedData as any).osmType,
          wikidataId: (resolvedData as any).wikidataId,
          wikipedia: (resolvedData as any).wikipedia
      };

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

  // 3. METADATA RECOVERY (Short-circuit if description exists)
  const isPlaceholder = isGenericPlaceholderDescription(resolvedData?.description, canonicalEntity?.canonicalName);
  // 3. METADATA RECOVERY (Short-circuit only if substantive description exists)
  if (coordinatesValid && canonicalEntity && (!resolvedData?.description || isPlaceholder)) {
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
           
           if (authoritativeHierarchy && metadataRecovery.locationString && metadataRecovery.locationString !== authoritativeHierarchy) {
               console.log(`[GEOGRAPHIC CONTEXT PRESERVED]\nauthoritative="${authoritativeHierarchy}"\naiLocationString="${metadataRecovery.locationString}"\naction="authoritative_context_retained"`);
               metadataRecovery.locationString = authoritativeHierarchy;
           }

           // Strip AI entity categorization to preserve canonical identity
           delete (metadataRecovery as any).type;
           delete (metadataRecovery as any).entityType;
           delete (metadataRecovery as any).name; // NEVER overwrite name
           
           // Attach the recovered metadata directly to resolvedData for now
           (resolvedData as any)._recoveredMetadata = metadataRecovery;
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
  } else {
      console.log(`Metadata Recovery Attempted: No (Substantive description exists)`);
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
     const initialClimate = (resolvedData as any).climate;
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

      const histKnowledgeForMeta = getHistoricalEntityKnowledge(canonicalEntity.canonicalName) || getHistoricalEntityKnowledge(entityResult.entity);
      const histContext = histKnowledgeForMeta?.historicalContext || (resolvedData as any).historicalContext || recoveredMetadata?.historicalContext;

      const finalMetadata: any = {
          description: resolvedData.description,
          climate: finalClimate,
          population: authoritativePopulation,
          notable: mergedNotable,
          news: resolvedData.news || [],
          contextNotes: (resolvedData as any).contextNotes || [],
          historicalContext: histContext,
          intent: entityResult.intentResult.intent,
          ...recoveredMetadata
      };

      // Ensure authoritative climate, population, notable facts, and historical context are preserved
      finalMetadata.climate = finalClimate;
      finalMetadata.population = authoritativePopulation;
      finalMetadata.notable = mergedNotable;
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
  
  // 2. Routing Guard: If intent is route / multi-location discovery, bypass coordinate resolution
  if (
    entityResult.intentResult.intent === 'route' || 
    entityResult.intentResult.intent === 'EXPLORATORY' || 
    entityResult.intentResult.intent === 'MULTI_LOCATION_DISCOVERY' ||
    (entityResult as any).resolutionMode === 'MULTI_LOCATION_EXPLORATION'
  ) {
     console.log(`[Pipeline] Routing Guard activated for intent: ${entityResult.intentResult.intent}`);
      const route = await generateRoute(request.rawQuery, entityResult.intentResult.intent);
      const waypoints = route.waypoints;
      console.log(`[Pipeline] WAYPOINTS AFTER GENERATEROUTE (Main guard):`);
      waypoints.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));
      return {
         mode: "route",
         isValid: true,
         waypoints: waypoints || []
      };
  }

  const locationResult = await ResolutionStage(entityResult);
  
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
      
      const route = await generateRoute(request.rawQuery, 'route');
      const waypoints = route.waypoints;
      console.log(`[Pipeline] WAYPOINTS AFTER GENERATEROUTE (Intent fallback):`);
      waypoints.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));
      return {
         mode: "route",
         isValid: waypoints.length > 0,
         waypoints
      };
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
