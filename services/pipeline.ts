import { LocationInfo, QueryIntent, isValidCoordinates, Waypoint } from '../types';
import { ResolvedEntity, EnrichmentResult } from '../domain';
import { routeIntentAndExtractEntity, resolveLocationQuery, sanitizeLocationInfo, recoverCoordinatesFromAi, recoverLocationMetadata, getUserSettings, generateRoute, normalizeCoordinates } from './geminiService';
import { enrichLocationInfo } from './locationService';
import { createIdentity, createResolvedSubject, createResolvedEntity } from './entityFactory';
import { validateResolvedEntity } from './entityValidation';
import { mergeCoordinates } from './coordinateAuthority';
import { CanonicalGeographicEntity } from '../domain';
import { classifyGeographicEntity } from './classifierService';

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

export const IntentStage = (request: SearchRequest): EntityResolutionResult => {
  console.log("=== PIPELINE STAGE: SEARCH REQUEST ===");
  console.log(`Raw Query: "${request.rawQuery}"`);
  
  let intent = request.intent;
  let entity = request.entity;
  
  if (!intent || !entity) {
    const extracted = routeIntentAndExtractEntity(request.rawQuery);
    intent = intent || extracted.intent;
    entity = entity || extracted.entity;
  }
  
  const normalized: NormalizedQuery = {
    request,
    normalizedQuery: request.rawQuery.trim()
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
  
  const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE"];
  const nonGeographicIntents = ['EXPLORATORY', 'HISTORICAL_EVENT', 'BROAD_CULTURAL_QUERY'];
  const isGeographicIntent = !nonGeographicIntents.includes(entityResult.intentResult.intent);

  let coordinatesValid = resolvedData?.coordinates && isValidCoordinates(normalizeCoordinates(resolvedData.coordinates) || normalizeCoordinates(resolvedData));
  
  if (!coordinatesValid && error && allowedErrors.includes(error) && entityResult.entity && isGeographicIntent) {
    if (!resolvedData || typeof resolvedData !== 'object' || Array.isArray(resolvedData)) {
      resolvedData = { name: entityResult.entity };
    }

    const recoveryCoords = await recoverCoordinatesFromAi(
      entityResult.intentResult.normalized.request.rawQuery,
      entityResult.intentResult.intent,
      entityResult.entity
    );
    
    let recoveredValid = false;
    let source = "ai_recovery";
    if (recoveryCoords && isValidCoordinates(recoveryCoords)) {
      const incoming = {
         lat: recoveryCoords.lat,
         lng: recoveryCoords.lng,
         source: (recoveryCoords as any).source || 'ai_recovery'
      } as any;
      
      const existing = resolvedData.coordinates ? {
         lat: resolvedData.coordinates.lat,
         lng: resolvedData.coordinates.lng,
         source: (resolvedData as any).coordinateSource || 'deterministic'
      } as any : null;
      
      resolvedData.coordinates = mergeCoordinates(existing, incoming);
      error = undefined;
      recoveryUsed = true;
      recoveredValid = true;
      source = incoming.source;
    }
    
    console.log(`[COORDINATE RECOVERY]\nRecovery success: ${recoveredValid ? 'Yes' : 'No'}\nRecovered coordinates: ${recoveryCoords ? JSON.stringify(recoveryCoords) : 'None'}\nSource: ${source}`);
  }

  // Normalize whatever coordinates we have at this point
  if (resolvedData && resolvedData.coordinates) {
     const inputCoords = JSON.stringify(resolvedData.coordinates);
     const normalized = normalizeCoordinates(resolvedData.coordinates) || normalizeCoordinates(resolvedData);
     if (normalized) {
         resolvedData.coordinates = normalized;
     }
     
     console.log(`[COORDINATE NORMALIZATION]\nInput: ${inputCoords}\nNormalized coordinates: ${JSON.stringify(resolvedData.coordinates)}`);
     
     const finalValid = isValidCoordinates(resolvedData.coordinates);
     coordinatesValid = finalValid;
     
     const source = (resolvedData.coordinates as any)?.source || (recoveryUsed ? 'ai_recovery' : 'deterministic');
     
     console.log(`[FINAL COORDINATE VALIDATION]\nCoordinates: ${JSON.stringify(resolvedData.coordinates)}\nSource: ${source}\nValid: ${finalValid}`);
  }

  // 1. CANONICAL ENTITY LOCK
  // After coordinates are successfully recovered and normalized, establish identity
  let canonicalEntity: CanonicalGeographicEntity | null = null;
  let identity: ReturnType<typeof createIdentity> | null = null;
  let entityType: any;

  if (coordinatesValid && resolvedData && resolvedData.coordinates) {
      const canonicalName = resolvedData.name || entityResult.entity;
      
      const providerSignals = (resolvedData as any).discoverySignals || [];
      const adminContext = {
          country: (resolvedData as any).country,
          state: (resolvedData as any).state,
          county: (resolvedData as any).county
      };

      entityType = await classifyGeographicEntity(
          canonicalName,
          resolvedData.coordinates,
          providerSignals,
          adminContext
      );

      canonicalEntity = {
          canonicalName,
          entityType,
          coordinates: resolvedData.coordinates,
          providerSignals,
          adminContext
      };

      console.log(`[CANONICAL ENTITY]\nRequested entity: ${entityResult.intentResult.normalized.request.rawQuery}\nResolved name: ${canonicalEntity.canonicalName}\nCanonical name: ${canonicalEntity.canonicalName}\nEntity type: ${canonicalEntity.entityType}\nCoordinates: ${canonicalEntity.coordinates.lat}, ${canonicalEntity.coordinates.lng}\nCoordinate source: ${(canonicalEntity.coordinates as any).source || 'deterministic'}\nProvider classifications: ${providerSignals.join(',') || 'none'}\nFinal classification: ${canonicalEntity.entityType}\nClassification confidence: 1.0\nAdministrative context: ${JSON.stringify(adminContext)}`);

      identity = createIdentity(
          entityResult.intentResult.normalized.request.rawQuery,
          canonicalName,
          "place",
          entityType,
          {}
      );
  }

  // 3. METADATA RECOVERY (Short-circuit if description exists)
  if (coordinatesValid && canonicalEntity && !resolvedData?.description) {
      try {
        const metadataRecovery = await recoverLocationMetadata(canonicalEntity.canonicalName, canonicalEntity.coordinates);
        if (metadataRecovery) {
           console.log(`=== RECOVERY ENRICHMENT TRACE ===`);
           console.log(`Metadata Present: true`);
           console.log(`Enrichment Executed: true`);
           
           // Strip AI entity categorization to preserve canonical identity
           delete (metadataRecovery as any).type;
           delete (metadataRecovery as any).entityType;
           delete (metadataRecovery as any).name; // NEVER overwrite name
           
           // Attach the recovered metadata directly to resolvedData for now
           (resolvedData as any)._recoveredMetadata = metadataRecovery;
        } else {
           console.warn(`=== RECOVER METADATA WARN ===\nMetadata recovery returned empty.`);
        }
      } catch (err) {
        console.error("Failed to generate metadata for recovered coordinates:", err);
      }
  } else {
      console.log(`Metadata Recovery Attempted: No (Description exists)`);
  }

  // Construct the ResolvedEntity Domain Object
  let entity: ResolvedEntity | undefined = undefined;
  
  if (resolvedData && resolvedData.coordinates && identity && canonicalEntity) {
     const primaryLocation = {
         label: canonicalEntity.canonicalName,
         featureType: canonicalEntity.entityType,
         location: {
             coordinates: canonicalEntity.coordinates,
             boundingBox: resolvedData.boundary as any
         },
         provenance: {
             provider: recoveryUsed ? "Gemini Recovery" : "Gemini Resolution",
             timestamp: Date.now(),
             cache: false
         },
         diagnostics: {}
     };
     
     const subject = createResolvedSubject(
         identity,
         primaryLocation
     );
     
     const recoveredMetadata = (resolvedData as any)._recoveredMetadata as Partial<EnrichmentResult> | undefined;
     
     // Merge deterministic/initial metadata with recovered metadata
     const finalMetadata: any = {
         description: resolvedData.description,
         climate: (resolvedData as any).climate,
         population: (resolvedData as any).population,
         notable: (resolvedData as any).notable || [],
         news: resolvedData.news || [],
         contextNotes: (resolvedData as any).contextNotes || [],
         ...recoveredMetadata
     };
     
     entity = createResolvedEntity(
         subject,
         finalMetadata
     );
     
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
  if (!isValid && !error && !coordinatesValid) {
     error = "NO_GEOGRAPHIC_DATA";
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
  
  // 2. Routing Guard: If intent is route, bypass coordinate resolution
  if (entityResult.intentResult.intent === 'route' || entityResult.intentResult.intent === 'EXPLORATORY' as any) {
     console.log(`[Pipeline] Routing Guard activated for intent: ${entityResult.intentResult.intent}`);
      const route = await generateRoute(request.rawQuery, 'route');
      const waypoints = route.waypoints;
      console.log(`[Pipeline] WAYPOINTS AFTER GENERATEROUTE (Main guard):`);
      waypoints.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));
      return {
         mode: "route",
         isValid: waypoints.length > 0,
         waypoints
      };
  }

  const locationResult = await ResolutionStage(entityResult);
  
  // 3. Fallback Intent Correction
  const entityType = locationResult.entity?.subject?.identity?.entityType;
  
  const isRouteFallback = 
    entityType === 'historical_trade_route' ||
    entityType === 'historical_network' ||
    entityType === 'empire' ||
    entityType === 'civilization' ||
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
      (locationResult as any).finalData = {
          name: e.subject.identity.canonicalName,
          entityType: e.subject.identity.entityType,
          type: e.subject.identity.entityType,
          coordinates: e.subject.primaryLocation.location.coordinates,
          description: e.metadata.description,
          climate: e.metadata.climate,
          population: e.metadata.population,
          notable: e.metadata.notable,
          news: e.metadata.news,
          contextNotes: e.metadata.contextNotes
      };
  }

  console.log(`[NATURAL LOCATION RESULT]\nname: ${(locationResult as any).finalData?.name || 'none'}\ncoordinates: ${JSON.stringify((locationResult as any).finalData?.coordinates || 'none')}\nentityType: ${(locationResult as any).finalData?.entityType || 'none'}\nmetadataAvailable: ${!!locationResult.entity?.metadata}\nvalid: ${locationResult.isValid}`);

  return locationResult;
};
