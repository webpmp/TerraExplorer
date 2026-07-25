import { LocationInfo, QueryIntent, isValidCoordinates } from '../types';
import { routeIntentAndExtractEntity, resolveLocationQuery, sanitizeLocationInfo, recoverCoordinatesFromAi } from './geminiService';

// --- PIPELINE TYPES ---

export interface SearchRequest {
  rawQuery: string;
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
  metadataResult: MetadataResult;
  isValid: boolean;
  finalData: LocationInfo | undefined;
  error: string | undefined;
}

// --- PIPELINE ADAPTERS ---

export const IntentStage = (request: SearchRequest): EntityResolutionResult => {
  console.log("=== PIPELINE STAGE: SEARCH REQUEST ===");
  console.log(`Raw Query: "${request.rawQuery}"`);
  
  const extracted = routeIntentAndExtractEntity(request.rawQuery);
  
  const normalized: NormalizedQuery = {
    request,
    normalizedQuery: request.rawQuery.trim()
  };
  console.log("=== PIPELINE STAGE: NORMALIZATION ===");
  console.log(`Normalized Query: "${normalized.normalizedQuery}"`);

  const intentResult: IntentResult = {
    normalized,
    intent: extracted.intent
  };
  console.log("=== PIPELINE STAGE: INTENT ===");
  console.log(`Classified Intent: ${intentResult.intent}`);

  const entityResult: EntityResolutionResult = {
    intentResult,
    entity: extracted.entity
  };
  console.log("=== PIPELINE STAGE: ENTITY ===");
  console.log(`Extracted Entity: "${entityResult.entity}"`);

  return entityResult;
};

export const ResolutionStage = async (entityResult: EntityResolutionResult): Promise<MetadataResult> => {
  console.log("=== PIPELINE STAGE: COORDINATE RESOLUTION ===");
  
  const rawResolverResult = await resolveLocationQuery(entityResult.entity, entityResult.intentResult.intent);
  
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
  if (error && allowedErrors.includes(error) && resolvedData && resolvedData.name && !resolvedData.coordinates) {
    console.log(`Recovery Attempted: Yes`);
    console.log(`Recovery Function: recoverCoordinatesFromAi`);
    const recoveryCoords = await recoverCoordinatesFromAi(resolvedData.name);
    console.log(`Coordinates Returned: ${recoveryCoords ? JSON.stringify(recoveryCoords) : 'None'}`);
    if (recoveryCoords) {
      resolvedData.coordinates = recoveryCoords;
      error = undefined; 
      recoveryUsed = true;
      console.log(`Recovery Success: Yes`);
    } else {
      console.log(`Recovery Success: No`);
    }
  } else {
    console.log(`Recovery Attempted: No`);
    console.log(`Recovery Function: N/A`);
    console.log(`Recovery Success: N/A`);
  }

  console.log(`Final Coordinates: ${resolvedData?.coordinates ? JSON.stringify(resolvedData.coordinates) : 'None'}`);
  console.log(`Failure Reason: ${error || 'None'}`);
  console.log(`===============================`);
  
  const coordinateResult: CoordinateResolutionResult = {
    entityResult,
    aiUsed: false, 
    deterministicMatch: false,
    resolvedData,
    suggestedZoom,
    error
  };

  console.log(`Error Status: ${error}`);

  console.log("=== PIPELINE STAGE: METADATA ===");
  const metadataResult: MetadataResult = {
    coordinateResult,
    enrichedData: resolvedData
  };
  
  console.log(`Entity Type: ${resolvedData?.entityType || 'None'}`);

  return metadataResult;
};

export const MetadataStage = (metadataResult: MetadataResult): FinalLocationResult => {
  console.log("=== PIPELINE STAGE: VALIDATION ===");
  
  let isValid = false;
  let finalData: LocationInfo | undefined;
  let error = metadataResult.coordinateResult.error;

  const data = metadataResult.enrichedData;
  if (data && data.coordinates) {
    isValid = isValidCoordinates(data.coordinates);
    if (!isValid && !error) {
       error = "NO_GEOGRAPHIC_DATA";
    }
  }

  console.log(`Coordinates Valid: ${isValid}`);

  if (isValid && data) {
    finalData = sanitizeLocationInfo(data as LocationInfo);
  }

  console.log("=== PIPELINE STAGE: FINAL RESULT ===");
  const finalResult: FinalLocationResult = {
    metadataResult,
    isValid,
    finalData,
    error
  };

  console.log(`Final Error: ${finalResult.error}`);

  return finalResult;
};

export const runSearchPipeline = async (rawQuery: string): Promise<FinalLocationResult> => {
  const searchRequest: SearchRequest = { rawQuery };
  const entityResult = IntentStage(searchRequest);
  const metadataResult = await ResolutionStage(entityResult);
  return MetadataStage(metadataResult);
};
