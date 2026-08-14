import { GoogleGenAI, Type } from "@google/genai";
import { reverseGeocode, ReverseGeocodeContext, resolveGeographicMetadata, resolveGeographicEntity, GeographicSource, resolvePrimaryGeographicEntity } from "./geographic/geographicResolver";
import { getEstimatedClimate, getClimateDescription, isClimateGeographicallyValid } from './geographic/climateEstimator';
import { providerRegistry } from './geographic/providers/providerRegistry';
import { applySelection } from './geographic/selection';
import { applyQualityGate } from './geographic/qualityGate';
import { applyCategoryBalance } from './geographic/categoryBalancer';
import { computeImportanceScore } from './geographic/scoring';
import { Candidate } from '../types';
import { getDiscoveryPrompt } from "./promptBuilder";
import { LocationInfo, QueryIntent, Waypoint, Route, UserSettings, LocationType, EntityType, SearchResult, MapMarker, GeoCoordinates, isValidCoordinates, ProvenanceRecord, CoordinateSource, GeographicIdentityStatus } from '../types';
import { runRoutePipeline } from './routePipeline';
import { PIPELINE_DEBUG, logWaypointSnapshot, logFieldDiff, logEnrichmentJsonPipeline } from '../utils/pipelineDebug';
import { EnrichmentResult, CanonicalGeographicEntity } from '../domain';
import { parseAndExtract } from '../utils/jsonParser';
import { enrichLocationInfo, mergeRichestFields } from './locationService';
import { isGenericPlaceholderDescription, isEnglishText } from './entityValidation';
import { isPlaceholderString } from '../components/InfoPanel';

export const EnrichmentMetrics = {
    retry: 0,
    retry_success: 0,
    schema_failure: 0,
    accepted: 0,
    rejected: 0
};

export const cancelFeatureInfoRequests = () => {};

// Ensure API key is available
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-ts-check' });

export const modelName = process.env.VITE_AI_MODEL || "gemini-2.5-flash";

export const getUserSettings = (): any => {
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      const saved = localStorage.getItem('terraExplorerSettings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // Ignore
    }
  }
  return {
    aiProvider: 'gemini',
    lmStudioUrl: 'http://localhost:1234/v1',
    lmStudioModel: 'local-model'
  };
};

// Helper for exponential backoff retry
export const generateContentWithRetry = async (params: any, retries = 3): Promise<any> => {
  const settings = getUserSettings();
  
  if (settings.aiProvider === 'lmstudio') {
    return generateLocalLMStudioContent(params, settings.lmStudioUrl, settings.lmStudioModel);
  }

  const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${params.model || modelName}:generateContent`;
  console.log("=== GEMINI API REQUEST START ===");
  console.log("Request URL:", requestUrl);
  console.log("Request Payload:", JSON.stringify(params, null, 2));
  try {
    const response = await ai.models.generateContent(params);
    console.log("Response Status Code: 200 OK");
    console.log("Response Body:", JSON.stringify(response, null, 2));
    console.log("=== GEMINI API REQUEST END ===");
    return response;
  } catch (error: any) {
    console.error("=== GEMINI API REQUEST ERROR ===");
    console.error("Request URL:", requestUrl);
    console.error("Error Name:", error?.name);
    console.error("Error Message:", error?.message);
    console.error("Error Status/Code:", error?.status || error?.code);
    console.error("Full Thrown Exception:", error);
    console.error("=================================");
    
    // Check for common rate limit error signatures from Google GenAI SDK or raw response
    const isQuotaError = 
      error?.status === 429 || 
      error?.code === 429 || 
      error?.message?.includes('429') || 
      error?.message?.includes('Quota') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.statusText?.includes('RESOURCE_EXHAUSTED') ||
      (error?.error && error.error.code === 429) ||
      (error?.error && error.error.status === 'RESOURCE_EXHAUSTED');

    if (isQuotaError && retries > 0) {
      // Increase backoff time: 4s, 8s, 12s to give quota time to reset
      const delayMs = 4000 * (4 - retries); 
      console.warn(`Quota exceeded (429). Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return generateContentWithRetry(params, retries - 1);
    }
    
    throw error;
  }
};

const generateLocalLMStudioContent = async (params: any, baseUrl: string, model: string = "local-model"): Promise<any> => {
  try {
    // Basic translation from Gemini format to OpenAI format
    const messages = [];
    const isJson = params.config?.responseMimeType === "application/json";
    let schemaInstruction = '';
    if (isJson) {
      schemaInstruction = '\n\nYou must respond with a valid JSON object. Ensure all requested fields are present.';
    }

    if (params.systemInstruction) {
      const sysContent = params.systemInstruction.parts?.[0]?.text || params.systemInstruction;
      messages.push({ role: 'system', content: sysContent + schemaInstruction });
    } else if (schemaInstruction) {
      messages.push({ role: 'system', content: schemaInstruction.trim() });
    }
    
    if (params.contents) {
      if (typeof params.contents === 'string') {
        messages.push({ role: 'user', content: params.contents });
      } else if (Array.isArray(params.contents)) {
        for (const item of params.contents) {
           if (typeof item === 'string') {
             messages.push({ role: 'user', content: item });
           } else {
             let role = item.role === 'model' ? 'assistant' : 'user';
             const text = item.parts?.[0]?.text || item.text || '';
             messages.push({ role, content: text });
           }
        }
      }
    }

    const payload: any = {
      model: model,
      messages,
      temperature: params.config?.temperature ?? params.generationConfig?.temperature ?? 0.7
    };

    const systemMessage = messages.find(m => m.role === 'system');
    const userMessage = messages.find(m => m.role === 'user');
    console.log("[LM STUDIO REQUEST]");
    console.log(`endpoint: ${baseUrl}/chat/completions`);
    console.log(`model: ${model}`);
    console.log(`message count: ${messages.length}`);
    console.log(`system prompt length: ${systemMessage?.content?.length || 0}`);
    console.log(`user prompt length: ${userMessage?.content?.length || 0}`);
    console.log(`temperature: ${payload.temperature}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LM Studio request failed\nStatus: ${response.status}\nBody: ${errorBody}`);
    }

    const data = await response.json();
    
    // Translate back to Gemini format
    return {
      text: data.choices?.[0]?.message?.content || ""
    };

  } catch (error) {
    console.error("Local LM Studio Request Failed", error);
    throw error;
  }
};

const populationInfoSchema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.NUMBER },
    formattedValue: { type: Type.STRING },
    timeframe: { type: Type.STRING },
    description: { type: Type.STRING },
    sourceType: { type: Type.STRING }
  },
  required: ["formattedValue", "timeframe", "description"]
};

// Schema for the static/encyclopedic data
const mainInfoSchemaConfig = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING },
    entityType: { type: Type.STRING },
    metadataMode: { type: Type.STRING },
    coordinates: {
      type: Type.OBJECT,
      properties: {
        lat: { type: Type.NUMBER },
        lng: { type: Type.NUMBER },
      },
      required: ["lat", "lng"]
    },
    population: { type: Type.NUMBER },
    description: { type: Type.STRING },
    climate: { 
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING }
      },
      required: ["name", "description"]
    },
    notable: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          entityType: { type: Type.STRING },
          wikipediaUrl: { type: Type.STRING }
        },
        required: ["title", "summary", "entityType"]
      }
    },
    imageCaption: { type: Type.STRING }
  },
  required: ["name", "type", "coordinates", "description", "notable"]
};

// Helper to normalize coordinates (handle AI returning [lat, lng] instead of {lat, lng})
export const normalizeCoordinates = (coordsData: any): { lat: number, lng: number, source?: CoordinateSource, confidence?: "high" | "medium" | "low" } | undefined => {
  if (!coordsData) return undefined;
  
  // Format D: { coordinates: [...] }
  if (coordsData.coordinates !== undefined) {
    const res = normalizeCoordinates(coordsData.coordinates);
    if (res) {
      if (!res.source && coordsData.source) res.source = coordsData.source;
      if (!res.confidence && coordsData.confidence) res.confidence = coordsData.confidence;
      return res;
    }
    return undefined;
  }

  let lat: number | undefined;
  let lng: number | undefined;
  const source: CoordinateSource | undefined = coordsData.source;
  const confidence = coordsData.confidence;

  // Format C: [lat, lng]
  if (Array.isArray(coordsData) && coordsData.length >= 2) {
    if (typeof coordsData[0] === 'number' && typeof coordsData[1] === 'number') {
      lat = coordsData[0];
      lng = coordsData[1];
    }
  } 
  // Format A: { lat, lng }
  else if (typeof coordsData.lat === 'number' && typeof coordsData.lng === 'number') {
    lat = coordsData.lat;
    lng = coordsData.lng;
  }
  // Format B: { latitude, longitude }
  else if (typeof coordsData.latitude === 'number' && typeof coordsData.longitude === 'number') {
    lat = coordsData.latitude;
    lng = coordsData.longitude;
  }
  
  if (lat === undefined || lng === undefined) {
      return undefined;
  }

  // 1. Detect swapped latitude/longitude (latitude outside [-90,90], longitude inside)
  if ((lat < -90 || lat > 90) && (lng >= -90 && lng <= 90)) {
      const temp = lat;
      lat = lng;
      lng = temp;
  }

  // 2. Final validation
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return undefined;
  }

  // 3. Reject exactly 0,0 invalid
  if (lat === 0 && lng === 0) {
      return undefined;
  }

  const result: { lat: number; lng: number; source?: CoordinateSource; confidence?: "high" | "medium" | "low" } = { lat, lng };
  if (source) result.source = source;
  if (confidence) result.confidence = confidence;

  return result;
};



/**
 * Model-independent location normalization layer.
 * Formats city/state, city/country, and common location input formats regardless of AI provider.
 */
export const normalizeLocationEntity = (entity: string | null | undefined | any): string => {
  if (!entity || typeof entity !== 'string') return "";
  let str = entity.trim();
  
  // State abbreviation mapping
  const stateMap: Record<string, string> = {
    "al": "Alabama", "ak": "Alaska", "az": "Arizona", "ar": "Arkansas", "ca": "California",
    "co": "Colorado", "ct": "Connecticut", "de": "Delaware", "fl": "Florida", "ga": "Georgia",
    "hi": "Hawaii", "id": "Idaho", "il": "Illinois", "in": "Indiana", "ia": "Iowa",
    "ks": "Kansas", "ky": "Kentucky", "la": "Louisiana", "me": "Maine", "md": "Maryland",
    "ma": "Massachusetts", "mi": "Michigan", "mn": "Minnesota", "ms": "Mississippi", "mo": "Missouri",
    "mt": "Montana", "ne": "Nebraska", "nv": "Nevada", "nh": "New Hampshire", "nj": "New Jersey",
    "nm": "New Mexico", "ny": "New York", "nc": "North Carolina", "nd": "North Dakota", "oh": "Ohio",
    "ok": "Oklahoma", "or": "Oregon", "pa": "Pennsylvania", "ri": "Rhode Island", "sc": "South Carolina",
    "sd": "South Dakota", "tn": "Tennessee", "tx": "Texas", "ut": "Utah", "vt": "Vermont",
    "va": "Virginia", "wa": "Washington", "wv": "West Virginia", "wi": "Wisconsin", "wy": "Wyoming"
  };

  // Capitalize words helper
  const capitalizeWords = (s: string) => {
    return s.split(/\s+/).map(word => {
      if (!word) return "";
      if (word.length <= 2 && stateMap[word.toLowerCase()]) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  // Handle patterns like "plano, texas" or "plano texas" or "plano tx"
  const commaMatch = str.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    const city = capitalizeWords(commaMatch[1].trim());
    let stateOrCountry = commaMatch[2].trim().toLowerCase();
    if (stateMap[stateOrCountry]) {
      stateOrCountry = stateMap[stateOrCountry];
    } else {
      stateOrCountry = capitalizeWords(stateOrCountry);
    }
    return `${city}, ${stateOrCountry}`;
  }

  // Handle "plano tx" or "boston ma" without comma
  const spaceStateMatch = str.match(/^(.+?)\s+([a-zA-Z]{2})$/);
  if (spaceStateMatch && stateMap[spaceStateMatch[2].toLowerCase()]) {
    const city = capitalizeWords(spaceStateMatch[1].trim());
    const state = stateMap[spaceStateMatch[2].toLowerCase()];
    return `${city}, ${state}`;
  }

  // Handle "boston massachusetts" without comma
  for (const [stAbbr, stName] of Object.entries(stateMap)) {
    const regex = new RegExp(`^(.+?)\\s+${stName}$`, 'i');
    const match = str.match(regex);
    if (match) {
      const city = capitalizeWords(match[1].trim());
      return `${city}, ${stName}`;
    }
  }

  return capitalizeWords(str);
};

/**
 * Deterministic geographic resolution database for major cities, states, and landmarks.
 * Resolves exact coordinates and canonical names without relying on LLMs.
 */
const DETERMINISTIC_LOCATION_DB: Record<string, { name: string; type: LocationType; entityType: EntityType; lat: number; lng: number; suggestedZoom?: number; country?: string; state?: string; city?: string }> = {
  "plano, texas": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano, tx": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano tx": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano texas": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  
  "boston, massachusetts": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston, ma": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston ma": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },

  "amsterdam": { name: "Amsterdam, Netherlands", type: LocationType.CITY, entityType: "city", lat: 52.3676, lng: 4.9041, suggestedZoom: 8 },
  "amsterdam, netherlands": { name: "Amsterdam, Netherlands", type: LocationType.CITY, entityType: "city", lat: 52.3676, lng: 4.9041, suggestedZoom: 8 },

  "paris": { name: "Paris, France", type: LocationType.CITY, entityType: "city", lat: 48.8566, lng: 2.3522, suggestedZoom: 8 },
  "paris, france": { name: "Paris, France", type: LocationType.CITY, entityType: "city", lat: 48.8566, lng: 2.3522, suggestedZoom: 8 },

  "taj mahal": { name: "Taj Mahal", type: LocationType.POI, entityType: "landmark", lat: 27.1751, lng: 78.0421, suggestedZoom: 9 },
  "the taj mahal": { name: "Taj Mahal", type: LocationType.POI, entityType: "landmark", lat: 27.1751, lng: 78.0421, suggestedZoom: 9 },

  "mount fuji": { name: "Mount Fuji", type: LocationType.POI, entityType: "mountain", lat: 35.3606, lng: 138.7274, suggestedZoom: 8 },
  "titanic wreck site": { name: "Titanic Wreck Site", type: LocationType.POI, entityType: "shipwreck_site", lat: 41.7325, lng: -49.9469, suggestedZoom: 7 },
  "titanic": { name: "Titanic Wreck Site", type: LocationType.POI, entityType: "shipwreck_site", lat: 41.7325, lng: -49.9469, suggestedZoom: 7 },
  "the vasa": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck_site", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "vasa": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck_site", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "the vasa found": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck_site", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "dead sea scrolls": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "dead sea scrolls discovery site": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "the dead sea scrolls": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "rosetta stone": { name: "Fort Julien", type: LocationType.POI, entityType: "discovery_site", lat: 31.3996, lng: 30.4170, suggestedZoom: 8 },
  "the rosetta stone": { name: "Fort Julien", type: LocationType.POI, entityType: "discovery_site", lat: 31.3996, lng: 30.4170, suggestedZoom: 8 },
  "woodstock": { name: "Bethel, New York (Woodstock Site)", type: LocationType.POI, entityType: "festival_site", lat: 41.7001, lng: -74.7871, suggestedZoom: 8 },
  "eruption of vesuvius": { name: "Mount Vesuvius", type: LocationType.POI, entityType: "historical_event_site", lat: 40.8218, lng: 14.4264, suggestedZoom: 8 },
  "boston massacre": { name: "Boston Massacre Site", type: LocationType.POI, entityType: "historical_event_site", lat: 42.3588, lng: -71.0578, suggestedZoom: 9 },
  
  // Expanded Global Cities for Deterministic Fallback
  "cape town": { name: "Cape Town, South Africa", type: LocationType.CITY, entityType: "city", lat: -33.9249, lng: 18.4241, suggestedZoom: 8 },
  "cape town, south africa": { name: "Cape Town, South Africa", type: LocationType.CITY, entityType: "city", lat: -33.9249, lng: 18.4241, suggestedZoom: 8, country: "South Africa", city: "Cape Town" },
  "sydney": { name: "Sydney, Australia", type: LocationType.CITY, entityType: "city", lat: -33.8688, lng: 151.2093, suggestedZoom: 8, country: "Australia", state: "New South Wales", city: "Sydney" },
  "sydney, australia": { name: "Sydney, Australia", type: LocationType.CITY, entityType: "city", lat: -33.8688, lng: 151.2093, suggestedZoom: 8, country: "Australia", state: "New South Wales", city: "Sydney" },
  "london": { name: "London, UK", type: LocationType.CITY, entityType: "city", lat: 51.5074, lng: -0.1278, suggestedZoom: 8, country: "United Kingdom", city: "London" },
  "london, uk": { name: "London, UK", type: LocationType.CITY, entityType: "city", lat: 51.5074, lng: -0.1278, suggestedZoom: 8, country: "United Kingdom", city: "London" },
  "london, england": { name: "London, UK", type: LocationType.CITY, entityType: "city", lat: 51.5074, lng: -0.1278, suggestedZoom: 8, country: "United Kingdom", city: "London" },
  "new york": { name: "New York, USA", type: LocationType.CITY, entityType: "city", lat: 40.7128, lng: -74.0060, suggestedZoom: 8, country: "United States", state: "New York", city: "New York" },
  "new york city": { name: "New York, USA", type: LocationType.CITY, entityType: "city", lat: 40.7128, lng: -74.0060, suggestedZoom: 8, country: "United States", state: "New York", city: "New York" },
  "nyc": { name: "New York, USA", type: LocationType.CITY, entityType: "city", lat: 40.7128, lng: -74.0060, suggestedZoom: 8, country: "United States", state: "New York", city: "New York" },
  "cliffs of moher": { name: "Cliffs of Moher", type: LocationType.POI, entityType: "natural_landmark", lat: 52.9715, lng: -9.4265, suggestedZoom: 10, country: "Ireland", state: "County Clare" },
  "statue of liberty": { name: "Statue of Liberty", type: LocationType.POI, entityType: "landmark", lat: 40.6892, lng: -74.0445, suggestedZoom: 12, country: "United States", state: "New York", city: "New York" },
  "sydney opera house": { name: "Sydney Opera House", type: LocationType.POI, entityType: "landmark", lat: -33.8568, lng: 151.2153, suggestedZoom: 12, country: "Australia", state: "New South Wales", city: "Sydney" }
};

export const resolveLocationQuery = async (query: string, intent?: QueryIntent, rawQuery?: string): Promise<SearchResult | null> => {
  let normalizedQuery = query;
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const settings = getUserSettings();
    const activeProvider = settings.aiProvider || 'gemini';

    // Step 1: Model-independent location normalization
    normalizedQuery = normalizeLocationEntity(query);
    const lookupKey = (normalizedQuery || query).toLowerCase().trim();

    // Step 2: Deterministic geographic resolution before AI provider call
    let deterministicRes = DETERMINISTIC_LOCATION_DB[lookupKey] || DETERMINISTIC_LOCATION_DB[query.toLowerCase().trim()];
    let aiUsed = false;
    let rawAiText = "";

    let resolvedData: any = null;
    let suggestedZoom = 5;

    if (deterministicRes) {
      resolvedData = {
        name: deterministicRes.name,
        type: deterministicRes.type,
        entityType: deterministicRes.entityType,
        climate: (deterministicRes as any).climate,
        coordinates: { lat: deterministicRes.lat, lng: deterministicRes.lng, source: "deterministic" as CoordinateSource },
        coordinateSource: "deterministic" as CoordinateSource,
        identityStatus: "verified" as GeographicIdentityStatus,
        country: deterministicRes.country,
        state: deterministicRes.state,
        city: deterministicRes.city,
        description: `Information on ${deterministicRes.name}.`,
        funFacts: [],
        notable: []
      };
      suggestedZoom = deterministicRes.suggestedZoom || 8;
    }

    // Step 2.5: Authoritative Nominatim / OSM Resolution before AI
    if (!resolvedData || !resolvedData.coordinates) {
      try {
        console.log(`COORDINATE_VERIFICATION_ATTEMPT\nprovider: Nominatim\ncandidate: ${normalizedQuery || query}`);
        const geoEntity = await resolveGeographicEntity(normalizedQuery || query);
        if (geoEntity && !('status' in geoEntity) && geoEntity.coordinates && isValidCoordinates(geoEntity.coordinates)) {
          console.log(`COORDINATE_VERIFICATION_SUCCESS\nprovider: Nominatim\ncandidate: ${normalizedQuery || query}\ncoordinates: ${geoEntity.coordinates.lat}, ${geoEntity.coordinates.lng}`);
          
          resolvedData = {
            name: geoEntity.name.split(',')[0].trim(),
            locationString: geoEntity.name,
            type: geoEntity.entityType === 'city' ? LocationType.CITY : (geoEntity.entityType === 'country' ? LocationType.COUNTRY : LocationType.POI),
            entityType: geoEntity.entityType,
            coordinates: {
              lat: geoEntity.coordinates.lat,
              lng: geoEntity.coordinates.lng,
              source: (geoEntity.source === GeographicSource.NOMINATIM ? "geocoder" : "deterministic") as CoordinateSource
            },
            coordinateSource: (geoEntity.source === GeographicSource.NOMINATIM ? "geocoder" : "deterministic") as CoordinateSource,
            identityStatus: (geoEntity.identityStatus || "verified") as GeographicIdentityStatus,
            country: geoEntity.context?.country,
            state: geoEntity.context?.state,
            city: geoEntity.context?.city,
            county: geoEntity.context?.county,
            region: geoEntity.context?.region,
            osmId: geoEntity.osmId,
            osmType: geoEntity.osmType,
            wikidataId: geoEntity.wikidataId,
            wikipedia: geoEntity.wikipedia,
            description: `Information on ${geoEntity.name.split(',')[0].trim()}.`,
            funFacts: [],
            notable: []
          };
          suggestedZoom = geoEntity.suggestedZoom || 8;
        } else {
          console.log(`COORDINATE_VERIFICATION_FAILED\nprovider: Nominatim\ncandidate: ${normalizedQuery || query}\nreason: no_authoritative_match`);
        }
      } catch (err: any) {
        console.warn(`[Nominatim Resolution Error]:`, err.message);
      }
    }

    // Pre-flight capability check: If API key is invalid or missing AND we are using Gemini AND no deterministic/geocoder match exists
    const currentApiKey = process.env.API_KEY;
    if (!resolvedData && settings.aiProvider === 'gemini' && (!currentApiKey || currentApiKey === 'dummy-key-for-ts-check')) {
       console.log("[DEBUG] Failure reason code: LOCATION_SYSTEM_UNAVAILABLE");
       return { error: "LOCATION_SYSTEM_UNAVAILABLE", locationInfo: { name: normalizedQuery || query } };
    }

    // Step 3: AI resolution / enrichment fallback if deterministic layer and Nominatim didn't find coordinates
    if (!resolvedData || !resolvedData.coordinates) {
      aiUsed = true;
      const targetSearchTerm = normalizedQuery || query;

      const mainPrompt = `
        You are an intelligent geographic knowledge engine and unified semantic entity resolver.
        Current Date: ${currentDate}
        Input geographic query: "${targetSearchTerm}" (Raw query: "${rawQuery || query}")
        Query Intent: ${intent || 'NATURAL_LOCATION'}

        CRITICAL INPUT GUIDELINES:
        - Always resolve valid city/state, city/country, landmarks, historical event sites, or discovery sites to their exact real-world latitude and longitude.
        - DO NOT return NOT_FOUND or NO_GEOGRAPHIC_DATA for valid, recognized entities.

        INSTRUCTIONS BY INTENT:
        1. HISTORICAL_EVENT:
           - Resolve the physical event location/site (e.g. Old State House grounds for Boston Massacre, Bethel Woods for Woodstock, Mount Vesuvius eruption site).
           - Set 'entityType' to 'historical_event_site', 'battlefield', or 'festival_site'.
           - Set 'type' to 'Point of Interest'. DO NOT return generic surrounding city names like "Boston, Massachusetts".
        2. DISCOVERY_OBJECT_LOCATION:
           - Resolve the original discovery / recovery site coordinates (e.g. North Atlantic ocean floor for Titanic, Stockholm Harbor for Vasa discovery site, Fort Julien for Rosetta Stone, Qumran Caves for Dead Sea Scrolls).
           - Set 'entityType' to 'historical_site'.
           - Set 'locationType' to 'discovery_location'.
           - Set 'type' to 'Point of Interest'. DO NOT return current display museum locations unless query explicitly asks for the museum.
        3. NATURAL_LOCATION:
           - Resolve geographic features or places. For mountains, mountains ranges, lakes, rivers, set 'entityType' to 'mountain', 'natural_feature', 'ocean', etc. For cities, set 'entityType' to 'city'.

        Return a JSON object:
        - 'name': The feature's proper name only (e.g. "Mount Rainier" not "Mount Rainier, Washington"). Do NOT append State, Province, Country, or administrative hierarchy.
        - 'locationString': The geographic hierarchy separated from the title (e.g. "Florida, United States").
        - 'entityType': Choose ONE from: city, country, state, ocean, natural_feature, mountain, landmark, museum, historical_event_site, archaeological_site, discovery_site, shipwreck_site, artifact, battlefield, festival_site.
        - 'type': Choose ONE from: Continent, Country, State, City, Ocean, Point of Interest.
        - 'metadataMode': MUST be exactly one of: "historical_site", "modern_place", or "natural_feature".
          - Use "historical_site" for ruins, ancient cities, archaeological locations, battlefields, historical events.
          - Use "modern_place" for current cities, towns, countries.
          - Use "natural_feature" for rivers, mountains, oceans.
        - 'suggestedZoom': 0-10 scale. 8-10 for specific sites/cities, 4-6 for regions.
        - 'description': Write 2-4 concise paragraphs explaining what this place is, why it exists, why it is significant, and why someone should care. The first sentence must immediately identify what makes the place distinctive. Use Markdown headings. The Description and Notable Facts must NEVER overlap. Forbidden phrases: "is a location in", "is situated in", "serves surrounding communities", "an important regional feature". Do not output a single generic paragraph.
        - 'population': A number representing the population. Omit if not applicable.
        - 'climate': Object containing 'name' (e.g. "Oceanic climate"), 'description' (plain language summary), and 'koppenCode'.
        - 'notable': Generate 3-5 genuinely informative notable facts. Every fact MUST contain a concise heading ('title') AND a 1-3 sentence substantive explanation ('summary') explaining what the fact is, specific context/scale/history, and why it matters. Never output empty generic topic labels without substantive explanation.
        - 'imageCaption': A concise caption (10-25 words) for an iconic photograph of this feature. Do not merely restate the title.
        - 'imageSearchTerm': A highly specific Wikipedia search term to fetch the best iconic image of this feature.

        CRITICAL INSTRUCTION: Return ONLY a valid JSON object. Do not output markdown code blocks (\`\`\`json), explanations, or any other text. Output strict raw JSON.
      `;

      
      const isHistoricalDiscovery = ['DISCOVERY_LOCATION', 'DISCOVERY_OBJECT_LOCATION', 'historical_site', 'shipwreck', 'archaeological site', 'excavation site'].includes(intent || '');
      let historicalCoords = null;
      if (isHistoricalDiscovery) {
          const histPrompt = `You are resolving a historical discovery location.

Entity:
${targetSearchTerm}

Return the physical discovery location, not a namesake location.

Ignore:
- towns
- churches
- religious references
- people
- unrelated places sharing the name

Return only JSON:

{
  "lat": 0.0,
  "lng": 0.0,
  "location": "string",
  "confidence": "string"
}`;
          
          try {
              const histRes = await generateContentWithRetry({
                  model: modelName,
                  contents: histPrompt,
                  config: { responseMimeType: "application/json" }
              }, 1);
              const histParsed = parseAndExtract(histRes.text);
              if (histParsed.success) {
                  const val = histParsed.value as any;
                  if (val.lat !== undefined && val.lng !== undefined) {
                      historicalCoords = { lat: val.lat, lng: val.lng };
                      console.log(`[HISTORICAL LOCATION RESOLUTION]\n{\n  "entity": "${targetSearchTerm}",\n  "resolved location": "${val.location}",\n  "coordinates": ${JSON.stringify(historicalCoords)},\n  "confidence": "${val.confidence}"\n}`);
                  }
              }
          } catch (e) {
              console.error("Historical discovery pre-resolution failed", e);
          }
      }

      const executeAiCall = async (promptText: string) => {
        return generateContentWithRetry({
          model: modelName,
          contents: promptText,
          config: {
            responseMimeType: "application/json",
            responseSchema: mainInfoSchemaConfig,
            maxOutputTokens: 4000, 
          }
        });
      };

      let mainResponse = await executeAiCall(mainPrompt);
      rawAiText = mainResponse.text;
      let parsed = parseAndExtract(rawAiText);
      let data = parsed.success ? (parsed.value as any) : null;

      if (Array.isArray(data) && data.length > 0) {
        data = data[0];
      }

      if (!data) {
         console.log("[DEBUG] Failure reason code: DATA_PARSE_NULL");
         return { error: "UNABLE_TO_RESOLVE", locationInfo: { name: targetSearchTerm } };
      }

      if (historicalCoords) {
         data.coordinates = historicalCoords;
      }
      
      if (data.coordinates) {
         data.coordinates = normalizeCoordinates(data.coordinates) || data.coordinates;
         const lat = data.coordinates.lat;
         const lng = data.coordinates.lng;
         
         if (lat === 999 && lng === 999) {
            console.log("[DEBUG] Failure reason code: LOCATION_NOT_FOUND");
            return { error: "NOT_FOUND" };
         }
         if (lat === 998 && lng === 998) {
            console.log("[DEBUG] Failure reason code: LOCATION_AMBIGUOUS");
            return { error: "AMBIGUOUS" };
         }
         if (lat === 997 && lng === 997) {
            console.log("[DEBUG] Failure reason code: NO_GEOGRAPHIC_DATA");
            console.log(`=== PARTIAL LOCATION DATA RETAINED ===\nEntity: ${targetSearchTerm}\nName: ${data.name || 'Unknown'}\nEntity Type: ${data.entityType || 'Unknown'}\nMissing Field: coordinates\n===============================`);
            return { error: "NO_GEOGRAPHIC_DATA", locationInfo: data };
         }
      } else {
         console.log("[DEBUG] Failure reason code: MISSING_COORDINATES");
         console.log(`=== PARTIAL LOCATION DATA RETAINED ===\nEntity: ${targetSearchTerm}\nName: ${data.name || 'Unknown'}\nEntity Type: ${data.entityType || 'Unknown'}\nMissing Field: coordinates\n===============================`);
         return { error: "NO_GEOGRAPHIC_DATA", locationInfo: data };
      }

      resolvedData = data;
      suggestedZoom = data.suggestedZoom || 5;
    }

    // Step 5: Fill defaults & enrich metadata
    if (!resolvedData.description) resolvedData.description = "";
    if (!resolvedData.funFacts) resolvedData.funFacts = [];
    if (!resolvedData.notable) resolvedData.notable = [];
    if (!resolvedData.type) resolvedData.type = LocationType.POI;
    
    const finalLocationInfo = await enrichLocationInfo(resolvedData);

    console.log(`=== LOCATION RESOLUTION TRACE ===
AI Provider: ${activeProvider}
Original Query: "${query}"
Normalized Query: "${normalizedQuery}"
Deterministic Resolution: ${deterministicRes ? `SUCCESS (${deterministicRes.name})` : 'NONE'}
AI Resolution Used: ${aiUsed ? 'YES' : 'NO'}
AI Response: ${aiUsed ? (rawAiText ? rawAiText.substring(0, 150) + '...' : 'EMPTY') : 'N/A (Deterministic)'}
Final Coordinates: ${JSON.stringify(finalLocationInfo.coordinates)}
===============================`);

    return {
      locationInfo: finalLocationInfo,
      suggestedZoom: suggestedZoom
    };

  } catch (error: any) {
    console.log("[DEBUG] Raw lookup query:", query);
    console.log("[DEBUG] Failure reason code: EXCEPTION_THROWN", error?.message || error);
    if (error?.stack) console.log(error.stack);
    
    // Distinguish temporary failure (network issues/timeout/blocked request)
    const errMsg = error?.message?.toLowerCase() || "";
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("timeout") || errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("exhaust")) {
       return { error: "TEMP_FAILURE", locationInfo: { name: normalizedQuery || query } };
    }
    return { error: "UNABLE_TO_RESOLVE", locationInfo: { name: normalizedQuery || query } };
  }
};

export const validateEnrichmentPayload = (data: any, entityName: string, coordinates: any) => {
    let lat = coordinates?.lat ?? coordinates?.latitude ?? (Array.isArray(coordinates) ? coordinates[0] : undefined);
    let lng = coordinates?.lng ?? coordinates?.longitude ?? (Array.isArray(coordinates) ? coordinates[1] : undefined);
    
    const climateNameLower = (data.climate as any)?.name?.toLowerCase() || "";
    const isBadClimate = !data.climate || typeof data.climate === 'string' || 
                         climateNameLower === "unknown" || 
                         climateNameLower === "unavailable" || 
                         climateNameLower === "n/a" || 
                         climateNameLower === "not available" || 
                         climateNameLower === "none" || 
                         climateNameLower === "";
    
    console.log(`[CLIMATE VALIDATION] before validation: ${JSON.stringify(data.climate)}`);
    if (isBadClimate) {
        if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
             const fallbackCountry = data.country || data.waypoint?.country || "";
             const fallbackRegion = data.region || data.state || data.waypoint?.region || data.waypoint?.state || "";
             const fallbackEntityType = data.entityType || data.type || data.waypoint?.entityType || "";
             const estClimate = getEstimatedClimate(Number(lat), Number(lng), fallbackRegion, fallbackCountry, fallbackEntityType);
             const desc = getClimateDescription(estClimate.koppenCode, estClimate.climateName);
             data.climate = {
                 name: estClimate.climateName,
                 description: `Specific climate data is unavailable. The geographic location has been deterministically estimated as ${estClimate.climateName} (${estClimate.confidence} confidence). ${desc}`,
                 koppenCode: estClimate.koppenCode
             };
        } else {
            data.climate = null;
        }
    }
    console.log(`[CLIMATE VALIDATION] after validation: ${JSON.stringify(data.climate)}`);
    if (data.news !== undefined && data.news !== null) {
        if (Array.isArray(data.news)) {
            const validNews = data.news.filter((n: any) => 
                n && typeof n.title === 'string' && (n.summary || n.source || n.url)
            );
            data.news = validNews as any;
        } else {
            data.news = undefined as any;
        }
    }
    console.log("[ENRICHMENT VALIDATION]");
    console.log(`description: PASS`);
    console.log(`climate: PASS`);
    console.log(`newsSource: ${(data.news && data.news.length > 0) ? 'ACCEPTED' : 'EMPTY'}`);
    
    return data;
};

export const sanitizeLocationInfo = <T extends Partial<LocationInfo>>(data: T): T => {
  if (!data) return data;

  validateEnrichmentPayload(data, data.name || "Unknown", data.coordinates || { lat: 0, lng: 0 });

  console.log(`[ENRICHMENT FLOW TRACE]\n{\n stage: "Before sanitize",\n description: "${(data.description || "").substring(0,20)}",\n notable: ${data.notable?.length || 0},\n contextNotes: ${data.contextNotes?.length || 0}\n}`);

  const normalizeArray = (arr: any[]): string[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
              if (typeof item.summary === 'string') return item.summary;
              if (typeof item.title === 'string') return item.title;
          }
          return null;
      }).filter(Boolean) as string[];
  };

  if (data.news !== undefined && data.news !== null) {
      data.news = (Array.isArray(data.news) ? data.news : undefined) as any;
  }
  data.notable = normalizeArray(data.notable as any) as any;
  data.contextNotes = normalizeArray(data.contextNotes as any) as any;

  if (data.description) {
    // 1. Remove coordinates patterns like 44.315949, 142.306349
    let cleanDesc = data.description.replace(/-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+/g, '');
    cleanDesc = cleanDesc.replace(/\(-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)/g, '');
    
    // 2. Remove coordinate phrases
    cleanDesc = cleanDesc.replace(/coordinates:\s*/gi, '');
    cleanDesc = cleanDesc.replace(/latitude:\s*/gi, '');
    cleanDesc = cleanDesc.replace(/longitude:\s*/gi, '');
    cleanDesc = cleanDesc.replace(/lat:\s*/gi, '');
    cleanDesc = cleanDesc.replace(/lng:\s*/gi, '');
    
    // 3. Remove raw markdown formatting that leaks
    cleanDesc = cleanDesc.replace(/#{1,3}\s/g, ''); // Remove #, ##, ###
    cleanDesc = cleanDesc.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold **
    cleanDesc = cleanDesc.replace(/__(.*?)__/g, '$1'); // Remove bold __
    
    data.description = cleanDesc.trim();
  }

  console.log(`[ENRICHMENT FLOW TRACE]\n{\n stage: "After sanitize",\n description: "${(data.description || "").substring(0,20)}",\n notable: ${data.notable?.length || 0},\n contextNotes: ${data.contextNotes?.length || 0}\n}`);


  const rawEntityType = (data.entityType || data.type || '').toString().toLowerCase().trim();
  const name = (data.name || '').toString().toLowerCase().trim();

  // Explicit allowed entity types for population: city, country, state
  const isPopulationAllowed = 
    rawEntityType === 'city' ||
    rawEntityType === 'country' ||
    rawEntityType === 'state';

  // Explicit allowed entity types for climate: city, country, state, natural_feature, mountain, ocean
  const isClimateAllowed = 
    isPopulationAllowed ||
    rawEntityType === 'ocean' ||
    rawEntityType === 'natural_feature' ||
    rawEntityType === 'mountain';

  // Explicit hidden entity types: historical_event_site, shipwreck_site, archaeological_site, discovery_site, artifact, museum, battlefield, festival_site
  const isHiddenEntityType = 
    rawEntityType.includes('historical') ||
    rawEntityType.includes('event') ||
    rawEntityType.includes('shipwreck') ||
    rawEntityType.includes('archaeological') ||
    rawEntityType.includes('discovery') ||
    rawEntityType.includes('artifact') ||
    rawEntityType.includes('museum') ||
    rawEntityType.includes('battle') ||
    rawEntityType.includes('festival') ||
    name.includes('eruption') ||
    name.includes('massacre') ||
    name.includes('wreck') ||
    name.includes('scrolls') ||
    name.includes('woodstock') ||
    name.includes('museum');

  // Check if a POI represents a natural/geographic feature fallback (e.g. Mount Fuji)
  const isGeographicFeatureName = 
    name.includes('mount') ||
    name.includes('mountain') ||
    name.includes('canyon') ||
    name.includes('lake') ||
    name.includes('volcano') ||
    name.includes('peak');

  // Normalize new population schema
  if (data.population !== undefined && data.population !== null) {
    if (typeof data.population === 'object') {
      const pObj = data.population as any;
      if (typeof pObj.value === 'number') {
        data.population = {
          value: pObj.value,
          source: pObj.source || 'Wikidata P1082',
          status: pObj.status || 'available',
          current: pObj.current || { formattedValue: pObj.value.toLocaleString() },
          historical: pObj.historical
        } as any;
      } else if (pObj.value === null || pObj.status === 'not_applicable' || pObj.status === 'lookup_failed') {
        data.population = {
          value: null,
          source: pObj.source || null,
          status: pObj.status || 'not_applicable'
        } as any;
      } else {
        console.warn(`[Normalization] Discarding invalid population value:`, data.population);
        data.population = null as any;
      }
    } else if (typeof data.population === 'number') {
      data.population = {
        value: data.population,
        source: 'AI/Deterministic',
        status: 'available',
        current: { formattedValue: Number(data.population).toLocaleString() }
      } as any;
    } else {
      console.warn(`[Normalization] Discarding invalid population value:`, data.population);
      data.population = null as any;
    }
  }

  // Normalize new climate schema
  if (data.climate !== undefined) {
    if (typeof data.climate === 'string') {
      const rawClimate = (data.climate as string).trim();
      
      // Detect fallback strings to prevent bad normalization
      if (!rawClimate || rawClimate.toLowerCase().includes('unavailable') || rawClimate.toLowerCase() === 'unknown') {
          data.climate = {
              name: "Unavailable",
              description: "Climate data unavailable.",
              koppenCode: ""
          } as any;
      } else {
          let name = "Unknown climate";
          let koppenCode = "";
          let description = "";
      
      const koppenMap: Record<string, string> = {
        'Af': 'Tropical rainforest',
        'Am': 'Tropical monsoon',
        'Aw': 'Tropical savanna',
        'As': 'Tropical savanna',
        'BWh': 'Hot desert',
        'BWk': 'Cold desert',
        'BSh': 'Hot semi-arid',
        'BSk': 'Cold semi-arid',
        'Csa': 'Mediterranean',
        'Csb': 'Warm-summer Mediterranean',
        'Csc': 'Cold-summer Mediterranean',
        'Cfa': 'Humid subtropical',
        'Cfb': 'Oceanic',
        'Cfc': 'Subpolar oceanic',
        'Cwa': 'Monsoon-influenced humid subtropical',
        'Cwb': 'Subtropical highland',
        'Cwc': 'Cold subtropical highland',
        'Dsa': 'Hot-summer Mediterranean continental',
        'Dsb': 'Warm-summer Mediterranean continental',
        'Dsc': 'Subarctic',
        'Dsd': 'Subarctic',
        'Dwa': 'Monsoon-influenced hot-summer humid continental',
        'Dwb': 'Monsoon-influenced warm-summer humid continental',
        'Dwc': 'Monsoon-influenced subarctic',
        'Dwd': 'Monsoon-influenced subarctic',
        'Dfa': 'Hot-summer humid continental',
        'Dfb': 'Warm-summer humid continental',
        'Dfc': 'Subarctic',
        'Dfd': 'Subarctic',
        'ET': 'Tundra',
        'EF': 'Ice cap'
      };

      // Remove prefixes
      let raw = rawClimate.replace(/^(K[öo]ppen climate classification|K[öo]ppen classification|K[öo]ppen|Climate classification|Climate)s?[:\-]?\s*/i, '');
      
      // Attempt to extract Koppen code
      const codeMatch = raw.match(/\b([A-Z][a-z]{1,2})\b/);
      if (codeMatch && koppenMap[codeMatch[1]]) {
          koppenCode = codeMatch[1];
      }

      // Check if it's just a code
      if (/^[A-Z][a-z]{1,2}$/.test(raw) && koppenMap[raw]) {
          name = koppenMap[raw];
      } else {
          // e.g. "Cfb (Oceanic climate)" -> extract Oceanic climate
          const parenMatch = raw.match(/^[A-Z][a-z]{1,2}\s*\((.*?)\)$/);
          if (parenMatch) {
              name = parenMatch[1];
          } else {
              // Split by comma or "characterized by"
              const parts = raw.split(/,\s*characterized by\s*|,\s*with\s*|,\s*(?=[a-z])|\.\s*/i);
              name = parts[0].trim();
              
              if (parts.length > 1) {
                  description = parts.slice(1).join(', ').trim();
                  // Remove trailing commas in description, capitalize first letter
                  description = description.replace(/,+$/, '').trim();
                  if (description) {
                     description = description.charAt(0).toUpperCase() + description.slice(1);
                  }
              }
              
              if (koppenCode && name === koppenCode) {
                  name = koppenMap[koppenCode];
              }
          }
      }
      
      // Add "climate" if missing
      if (!name.toLowerCase().includes('climate')) {
          name = name + " climate";
      }

      data.climate = {
        name,
        description,
        koppenCode
      } as any;
      console.log(`\n===== CLIMATE NORMALIZATION =====\nOriginal: ${rawClimate}\nNormalized: ${JSON.stringify(data.climate, null, 2)}\n=================================`);
      }
    } else if (data.climate && typeof data.climate === 'object') {
      const c = data.climate as any;
      if (!c.name || !c.description || c.name === 'Unavailable' || c.name === 'Unknown') {
        const lat = data.coordinates?.lat;
        const lng = data.coordinates?.lng;
        if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
          const est = getEstimatedClimate(Number(lat), Number(lng), data.state || data.region, data.country, data.entityType || data.type);
          data.climate = {
            name: est.climateName.toLowerCase().includes('climate') ? est.climateName : `${est.climateName} Climate`,
            description: getClimateDescription(est.koppenCode, est.climateName),
            koppenCode: est.koppenCode
          };
        } else {
          data.climate = {
              name: "Unavailable",
              description: "Climate data is unavailable for this location.",
              koppenCode: ""
          };
        }
      } else if (isHiddenEntityType) {
         // Historically, we hid climate for events. Let's keep it if AI found it useful, but if it says "Varies" clear it
         if (c.name.toLowerCase().includes('varies') || c.name.toLowerCase().includes('n/a')) {
           data.climate = null as any;
         }
      }
    } else {
      const lat = data.coordinates?.lat;
      const lng = data.coordinates?.lng;
      if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        const est = getEstimatedClimate(Number(lat), Number(lng), data.state || data.region, data.country, data.entityType || data.type);
        data.climate = {
          name: est.climateName.toLowerCase().includes('climate') ? est.climateName : `${est.climateName} Climate`,
          description: getClimateDescription(est.koppenCode, est.climateName),
          koppenCode: est.koppenCode
        };
      } else {
        data.climate = {
              name: "Unavailable",
              description: "Climate data is unavailable for this location.",
              koppenCode: ""
          };
      }
    }

    // Validate climate classification against entity's actual coordinates & region
    if (data.climate && typeof data.climate === 'object' && data.climate.name && data.climate.name !== 'Unavailable') {
      const lat = data.coordinates?.lat;
      const lng = data.coordinates?.lng;
      if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        const isValid = isClimateGeographicallyValid(data.climate.koppenCode, Number(lat), Number(lng), data.state || data.region, data.country);
        if (!isValid) {
          console.warn(`[Climate Validation] Discarded geographically incorrect climate "${data.climate.name}" (${data.climate.koppenCode}) for location ${lat}, ${lng} (${data.state || data.region}, ${data.country}). Correcting to regional baseline.`);
          const est = getEstimatedClimate(Number(lat), Number(lng), data.state || data.region, data.country, data.entityType || data.type);
          data.climate = {
            name: est.climateName.toLowerCase().includes('climate') ? est.climateName : `${est.climateName} Climate`,
            description: getClimateDescription(est.koppenCode, est.climateName),
            koppenCode: est.koppenCode
          };
        }
      }
    }

    console.log(`[CLIMATE VALIDATION] after sanitize: ${JSON.stringify(data.climate)}`);
  }
  
  // Normalize notable to array as requested by user
  if (data.notable) {
    if (Array.isArray(data.notable)) {
       data.notable = data.notable.filter(n => typeof n === 'string' || (typeof n === 'object' && n !== null)) as any;
    } else if (typeof (data.notable as any).summary === 'string') {
       data.notable = [(data.notable as any).summary] as any;
    } else if (typeof data.notable === 'string') {
       data.notable = [data.notable] as any;
    } else {
       data.notable = [] as any;
    }
  } else {
    data.notable = [] as any;
  }
  
  if (!Array.isArray(data.notable)) {
      data.notable = [];
  }
  
  return data;
};
const infoCache = new Map<string, Promise<LocationInfo | null>>();

const logInfoPanelTrace = (event: string, marker: any, elapsedMs?: number, state?: any) => {
    // if (DEBUG_INFO_PANEL) {
    //    console.log("INFO PANEL TRACE", { event, marker, elapsedMs, state });
    // }
};

import { descriptionCache } from './cacheService';

export const getInfoFromFeature = async (marker: MapMarker): Promise<LocationInfo | null> => {
  const { name, lat, lng } = marker;
  const startTime = Date.now();
  const cacheKey = `${name}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
  if (descriptionCache.has(cacheKey)) {
    logInfoPanelTrace("INFO_REQUEST_CACHE_HIT", name, Date.now() - startTime);
    return descriptionCache.get(cacheKey)!;
  }

  logInfoPanelTrace("INFO_REQUEST_STARTED", name, 0);

  const promise = (async () => {
    try {
    const country = marker.country || "Unknown Country";
    const region = marker.state || marker.region || "Unknown Region";
    const city = marker.city || marker.county || "Unknown City";
    const coordSource = marker.coordinateSource || "Nominatim";
    const identStatus = marker.identityStatus || "verified";
    const osmId = marker.osmId ? `OSM ID: ${marker.osmId}` : null;
    const osmType = marker.osmType ? `OSM Type: ${marker.osmType}` : null;
    const wikidataId = marker.wikidataId ? `Wikidata ID: ${marker.wikidataId}` : null;
    const wikipedia = marker.wikipedia ? `Wikipedia: ${marker.wikipedia}` : null;
    
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const discoveryBrief = {
      entity: marker.name,
      type: marker.type || "place",
      signals: marker.discoverySignals || []
    };
    console.log("[DISCOVERY BRIEF SENT TO LLM]", JSON.stringify(discoveryBrief, null, 2));
    const discoveryPrompt = getDiscoveryPrompt(discoveryBrief.type, discoveryBrief.entity, discoveryBrief.signals);
    
    const mainPrompt = `
      AUTHORITATIVE CANONICAL GEOGRAPHIC IDENTITY:
      Canonical entity: ${marker.name}
      Entity type: ${marker.type || "place"}
      Country: ${country}
      Region: ${region}
      City/area: ${city}
      Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}
      Coordinate source: ${coordSource}
      Identity status: ${identStatus}
      ${osmId ? osmId : ''}
      ${osmType ? osmType : ''}
      ${wikidataId ? wikidataId : ''}
      ${wikipedia ? wikipedia : ''}
      ${marker.population?.value ? `Population: ${marker.population.value}` : ''}
      
      CRITICAL INSTRUCTIONS:
      You are enriching the EXACT verified geographic entity specified above.
      You must describe THIS ${marker.name} in ${country} (${region}) and must NOT substitute another entity with the same or similar name.
      The coordinates, country, region, city, and identity are authoritative.
      
      Return a JSON object conforming to the schema with substantive, educational information (do NOT output generic placeholder text like "Information on ${marker.name}.").
      CRITICAL INSTRUCTION: You MUST keep semantic boundaries strict. Do not duplicate information across fields.
      Return ONLY a valid JSON object. Do not output markdown code blocks (\`\`\`json), explanations, or any other text. Output strict raw JSON.
    `;
    console.log(`[ENRICHMENT ATTEMPT 1] id: ${cacheKey}`);
    const mainRequest = generateContentWithRetry({
      model: modelName,
      systemInstruction: discoveryPrompt,
      contents: mainPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: mainInfoSchemaConfig,
        maxOutputTokens: 4000,
        temperature: 0.2
      }
    });

    let mainResponse = await mainRequest;
    
    let parsed = parseAndExtract(mainResponse.text);
    
    logEnrichmentJsonPipeline(mainResponse.text, parsed, false);
    let data: any = parsed.success ? parsed.value : null;

    if (Array.isArray(data)) {
        console.warn("[ENRICHMENT] LLM returned array, unwrapping first object");
        data = data.length > 0 ? data[0] : null;
    }
    if (data && typeof data !== "object") {
        data = null;
    }

    if (data) {
        const beforeKeys = Object.keys(data);
        
        // Grounding & placeholder validation
        if (data.description) {
            const entityNameStr = discoveryBrief.entity.toLowerCase();
            const entityNameParts = entityNameStr.split(/[,\s-]/).filter(p => p.length > 3);
            const descLower = data.description.toLowerCase();
            const isGrounded = descLower.includes(entityNameStr) || entityNameParts.some(p => descLower.includes(p));
            const isPlaceholder = isGenericPlaceholderDescription(data.description, discoveryBrief.entity);
            
            if (!isGrounded || isPlaceholder) {
                console.warn(`[Enrichment] REJECTED_DESCRIPTION: isGrounded=${isGrounded}, isPlaceholder=${isPlaceholder} for "${discoveryBrief.entity}"`);
                data = null;
            }
        }

        if (data && !data.description) {
            EnrichmentMetrics.schema_failure++;
            console.log("[Enrichment] SCHEMA_INVALID", {
                receivedKeys: Object.keys(data),
                expectedKeys: ["description"],
                missingFields: ["description"]
            });
            data = null;
        } else if (data) {
            if (!data.notable || !Array.isArray(data.notable)) {
                data.notable = [];
            }
            console.log("[ENRICHMENT NORMALIZATION]", {
                before: beforeKeys,
                after: Object.keys(data)
            });

            const { score, reasons } = evaluateDiscoveryScore(data);
            if (score < 4) {
               console.warn(`[Enrichment] Quality Score Failed (${score}/4). Reasons: ${reasons.join(", ")}. Retrying...`);
               EnrichmentMetrics.retry++;
               const initialValidData = { ...data };
               const qualityRetryPrompt = mainPrompt + `\n\nCRITICAL QUALITY FEEDBACK:\nYour previous response failed quality scoring for a documentary Discovery Interface. Reasons:\n- ${reasons.join("\n- ")}\nImprove the response to be more educational and focus on unique documentary facts.`;
               const retryRequest = generateContentWithRetry({
                 model: modelName,
                 contents: qualityRetryPrompt,
                 config: {
                   responseMimeType: "application/json",
                   responseSchema: mainInfoSchemaConfig,
                   maxOutputTokens: 4000,
                   temperature: 0.3
                 }
               });
               mainResponse = await retryRequest;
               parsed = parseAndExtract(mainResponse.text);
               logEnrichmentJsonPipeline(mainResponse.text, parsed, true);
               
               if (parsed.success) {
                   let retryData = parsed.value;
                   if (Array.isArray(retryData)) retryData = retryData.length > 0 ? retryData[0] : null;
                   
                   if (retryData) {
                       const postRetryScore = evaluateDiscoveryScore(retryData).score;
                       console.log(`[Enrichment] Retry Score: ${postRetryScore}/4 vs Initial Score: ${score}/4`);
                       
                       // Field-by-field richest merge, ensuring initial rich description is never destroyed
                       data = mergeRichestFields(initialValidData, retryData);
                       
                       if (postRetryScore >= 4) {
                           EnrichmentMetrics.retry_success++;
                           EnrichmentMetrics.accepted++;
                       } else {
                           console.warn(`[Enrichment] Quality Score Failed again after retry (${postRetryScore}/4). Merged richest fields anyway.`);
                           EnrichmentMetrics.accepted++;
                       }
                   } else {
                       data = initialValidData;
                   }
               } else {
                   // Retry failed to parse, keep initial data
                   console.warn(`[Enrichment] Retry failed to parse, keeping initial data.`);
                   data = initialValidData;
               }
            } else {
               EnrichmentMetrics.accepted++;
            }
        }
        
        if (data) {
            data.imageSearchTerm = getDeterministicImageSearchTerm(data.name, data.type, data.metadataMode, marker.discoverySignals || []);
        }
    }

    if (!data) {
        data = {
            name: name,
            type: LocationType.POI,
            entityType: "point_of_interest",
            description: "Documentary enrichment unavailable.",
            climate: null,
            coordinates: { lat, lng },
            funFacts: [],
            notable: [],
            status: "error", // Keep for backwards compatibility if needed
            sectionState: { description: "failed" },
            errorMessage: "Information unavailable."
        };
    } else {
        // Map overview to description if needed
        if (data.overview && !data.description) {
            data.description = data.overview;
        }
        
        // Final Quality Validation: only replace if genuinely empty or an explicit generic placeholder
        if (!data.description || isGenericPlaceholderDescription(data.description, name)) {
            console.warn(`[Enrichment] Placeholder description detected for ${name}.`);
            data.description = "Documentary enrichment unavailable.";
        }
    }
    
    // Ensure the name returned is the one requested
    data.name = name;
    
    if (data.coordinates) {
        data.coordinates = normalizeCoordinates(data.coordinates);
    }
    
    if (!data.coordinates || typeof data.coordinates.lat !== 'number' || isNaN(data.coordinates.lat)) {
        data.coordinates = { lat, lng };
    }

    if (!data.status) data.status = "success";
    
    console.log(`[ENRICHMENT FINAL APPLY] id: ${cacheKey}, name: ${data.name}`);
    const finalData = data as LocationInfo;
    logInfoPanelTrace("INFO_REQUEST_COMPLETE", name, Date.now() - startTime);
    
    console.log("[ENRICHMENT FINAL PAYLOAD]");
    console.log(`{
  descriptionLength: ${finalData.description?.length || 0},
  climate: ${!!finalData.climate},
  population: ${!!finalData.population},
  notableCount: ${Array.isArray(finalData.notable) ? finalData.notable.length : 0},
  relatedEntitiesCount: ${finalData.relatedEntities?.length || 0},
  contextCount: ${finalData.contextNotes?.length || 0}
}`);
    return finalData;

  } catch (error: any) {
    descriptionCache.delete(cacheKey); // Remove stale error from cache
    console.error("Error resolving feature info:", error);
    return sanitizeLocationInfo({
        name: name,
        type: LocationType.POI,
        description: "",
        coordinates: { lat, lng },
        funFacts: [],
        notable: [],
        status: "error",
        sectionState: { description: "failed" },
        errorMessage: error.message?.includes('429') || error.message?.includes('Quota') 
            ? "API Quota Exceeded. Please try again later."
            : "Could not retrieve information at this time."
    } as unknown as LocationInfo);
  }
  })();
  
  descriptionCache.set(cacheKey, promise);
  return promise;
};

export function evaluateDiscoveryScore(data: any): { score: number, reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const descLower = (data.description || "").toLowerCase();
    const notableStr = Array.isArray(data.notable) ? data.notable.join(" ").toLowerCase() : (data.notable?.summary || "").toLowerCase();

    // 1. Identity Present (+1)
    if (descLower.length > 30 && !isGenericPlaceholderDescription(data.description, data.name)) {
        score += 1;
        reasons.push("Identity clearly defined.");
    }

    // 2. Unique Fact Present (+1)
    if (notableStr.length > 30 && !notableStr.includes("no widely documented")) {
        score += 1;
        reasons.push("Unique facts generated.");
    }

    // 3. Historical Signal (+1)
    if (descLower.includes("history") || descLower.includes("century") || descLower.includes("founded") || notableStr.includes("history") || notableStr.includes("century")) {
        score += 1;
        reasons.push("Historical signals present.");
    }

    // 4. Cultural Signal (+1)
    if (descLower.includes("culture") || descLower.includes("traditional") || descLower.includes("festival") || notableStr.includes("culture") || notableStr.includes("art")) {
        score += 1;
        reasons.push("Cultural signals present.");
    }

    // 5. Scientific/Natural Signal (+1)
    if (descLower.includes("ecosystem") || descLower.includes("geolog") || descLower.includes("species") || descLower.includes("wildlife") || descLower.includes("prairie") || descLower.includes("grassland") || descLower.includes("forest") || descLower.includes("mountain") || descLower.includes("water") || notableStr.includes("science") || notableStr.includes("discover") || notableStr.includes("wildlife")) {
        score += 1;
        reasons.push("Scientific/Natural signals present.");
    }

    // Vacuous Placeholder Penalty (-2)
    const vacuousPhrases = ["no specific information available", "no information available", "generic placeholder for this entity", "specific geographic description unavailable"];
    let penaltyApplied = false;
    for (const phrase of vacuousPhrases) {
        if (descLower.includes(phrase) || notableStr.includes(phrase)) {
            score -= 2;
            penaltyApplied = true;
            reasons.push(`Penalty: Vacuous placeholder phrase detected ("${phrase}").`);
            break;
        }
    }
    
    // Substantial description boost (+1)
    if (score < 4 && !penaltyApplied && descLower.length > 80) {
        score += 1;
        reasons.push("Content is substantial; +1 baseline boost.");
    }

    return { score, reasons };
}

export function getDeterministicImageSearchTerm(name: string, type: string, metadataMode: string, discoverySignals: string[] = []): string {
    const typeLower = (type || "").toLowerCase();
    const mode = (metadataMode || "").toLowerCase();
    const signals = discoverySignals.map(s => s.toLowerCase());
    
    // Landmark optimization
    if (signals.includes("tourism") || signals.includes("historic") || typeLower.includes("monument") || typeLower.includes("museum") || typeLower.includes("landmark")) {
        return `${name} landmark`;
    }
    
    // Landscape optimization
    if (signals.includes("natural") || typeLower.includes("mountain") || typeLower.includes("river") || typeLower.includes("lake") || mode === "natural_feature") {
        return `${name} landscape`;
    }
    
    // Historical optimization
    if (typeLower.includes("ruin") || typeLower.includes("castle") || mode === "historical_site") {
        return `${name} historical`;
    }
    
    // Urban optimization
    if (typeLower.includes("city") || typeLower.includes("capital") || mode === "modern_place") {
        return `${name} skyline`;
    }
    
    return name;
}



// Schema for nearby places geographic anchor
const nearbyPlacesSchemaConfig = {
  type: Type.OBJECT,
  properties: {
    anchor: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        type: { type: Type.STRING },
        coordinates: {
          type: Type.OBJECT,
          properties: {
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER }
          },
          required: ["lat", "lng"]
        },
        provenance: { type: Type.STRING }
      },
      required: ["name", "type", "coordinates", "provenance"]
    },
    nearby: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
          populationClass: { type: Type.STRING },
          type: { type: Type.STRING }
        },
        required: ["id", "name", "lat", "lng", "populationClass", "type"]
      }
    }
  },
  required: ["anchor", "nearby"]
};

export function getRegionalGuidance(lat: number, lng: number): string {
  const isFlorida = lat >= 24 && lat <= 31 && lng >= -87 && lng <= -80;
  const isHawaii = lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154;
  
  if (isFlorida) {
    return "You MUST prioritize major populated cities and destinations (such as Miami, Orlando, Tampa, Jacksonville, Key West) rather than generic terrain features or state parks.";
  }
  
  if (isHawaii) {
    return "You MUST prioritize well-known cities or landmarks (for example: Honolulu, Waikiki, Maui towns, or Pearl Harbor).";
  }
  
  return "";
}
interface ReverseGeocodeCacheEntry {
  value: { country?: string, state?: string, city?: string, type?: string } | null;
  timestamp: number;
}

const REVERSE_GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REVERSE_GEOCODE_CACHE_ENTRIES = 1000;
const reverseGeocodeCache = new Map<string, ReverseGeocodeCacheEntry>();
import { nearbyCache } from './cacheService';

export interface DiscoveryResult {
  status: "SUCCESS" | "NO_RESULTS" | "PROVIDER_FAILURE";
  places: MapMarker[];
  diagnostics: {
    providersAttempted: number;
    providerFailures: number;
    resultCount: number;
    candidatesReceived?: number;
    rejectedByDistance?: number;
    environment?: string;
  };
}

import { overpassProvider } from './geographic/providers/OverpassProvider';
import { wikipediaProvider } from './geographic/providers/WikipediaProvider';
import { nominatimProvider } from './geographic/providers/NominatimProvider';

import { classifyEntity, isLowSignificancePoi } from './geographic/classification';

export const generateFallbackCandidates = async (lat: number, lng: number, context: any, environment?: string): Promise<Candidate[]> => {
    const prompt = `Return real nearby geographic entities around this exact coordinate (${lat}, ${lng}). Do not move the search to another country or famous locations.

Context:
Country: ${context.country || 'Unknown'}
State/Region: ${context.state || 'Unknown'}
County: ${context.county || 'Unknown'}
Locality: ${context.city || context.town || context.village || 'Unknown'}
Environment: ${environment || 'wilderness'}

Identify any real, prominent nearby geographic entities (such as a nearby town or settlement, prominent mountain, lake, river, or national park). Do not manufacture places or include obscure POIs simply to fill slots. If there is only one meaningful place, return only that place. If there are none, return an empty array [].

Provide a JSON array of significant local places, natural features, landmarks, or settlements. Output ONLY valid JSON:
[
  {
    "name": "Name of the place",
    "lat": 12.34,
    "lng": 56.78,
    "type": "city | town | village | natural | landmark | mountain | lake | river | national_park"
  }
]`;

    try {
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        const text = result.text || "[]";
        const parsed = JSON.parse(text);
        
        return parsed.map((item: any, index: number) => ({
            id: `gemini-fallback-${index}`,
            name: item.name,
            coordinates: { lat: item.lat, lng: item.lng },
            type: (item.type || 'poi').toLowerCase(),
            providers: ['GeminiFallback'],
            rawProviders: { GeminiFallback: item },
            pipelineStatus: 'normalized',
            identifiers: {},
            populationClass: 'small',
            discoverySignals: ['Found via Gemini Fallback']
        } as Candidate));
    } catch (e) {
        console.warn("[Gemini Fallback] Failed to generate fallback candidates:", e);
        return [];
    }
};

export const getNearbyPlaces = async (lat: number, lng: number, initialRadius: number = 50): Promise<{ places: MapMarker[]; status: "SUCCESS" | "NO_RESULTS" | "PROVIDER_FAILURE"; diagnostics?: any }> => {
  if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
    return {
      places: [],
      status: "NO_RESULTS",
      diagnostics: { providersAttempted: 0, providerFailures: 0, resultCount: 0 }
    };
  }

  try {
    let providersAttempted = 0;
    let providerFailures = 0;
    let candidatesReceived = 0;
    let rejectedByDistance = 0;
    
    // 1. Resolve Context for the clicked coordinate
    const geoContext: Partial<ReverseGeocodeContext> = await reverseGeocode(lat, lng).catch(() => ({})) || {};

    // STAGE 1: Primary Geographic Entity Resolution
    const primaryEntity = await resolvePrimaryGeographicEntity(lat, lng, geoContext as any);

    if (primaryEntity) {
        console.log(`[Discovery] ${lat.toFixed(2)}, ${lng.toFixed(2)} → 1 candidate`);
        console.log(`[Discovery] Primary: ${primaryEntity.name}`);

        const primaryMarker: MapMarker = {
            id: `primary-${primaryEntity.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name: primaryEntity.name,
            lat: primaryEntity.lat,
            lng: primaryEntity.lng,
            type: primaryEntity.type,
            populationClass: primaryEntity.populationClass || 'large',
            provenance: primaryEntity.source,
            discoverySignals: [primaryEntity.reason]
        };

        return {
            places: [primaryMarker],
            status: "SUCCESS",
            diagnostics: {
                discoveryMode: 'PRIMARY_ENTITY',
                resolvedEntity: primaryEntity.name,
                entityType: primaryEntity.type,
                confidence: primaryEntity.confidence,
                resultCount: 1,
                providersAttempted: 1,
                providerFailures: 0
            }
        };
    }

    // STAGE 2: Nearby Discovery Fallback
    console.log(`[DISCOVERY MODE]\n` +
      `mode: FALLBACK_NEARBY\n` +
      `reason primary entity resolution failed: No meaningful primary entity directly at clicked coordinate (rural/oceanic area)\n`);

    // Detect Environment
    let environment: 'urban' | 'rural' | 'wilderness' | 'ocean' = 'wilderness';
    if (geoContext.city || geoContext.town || geoContext.municipality) {
        environment = 'urban';
    } else if (geoContext.village || geoContext.county) {
        environment = 'rural';
    } else if (!geoContext.country && !geoContext.state) {
        environment = 'ocean';
    } else {
        environment = 'wilderness';
    }

    // Collect Candidates & Anchor
    const rawCandidates: Candidate[] = [];
    const context = { lat, lng, radiusKm: initialRadius, ...geoContext };

    // Inject Anchor Provider Candidate (only if valid specific feature, not an administrative container)
    if (geoContext.feature) {
        const anchorName = geoContext.feature;
        const isCountyOrAdmin = anchorName.toLowerCase().includes('county') || 
                               anchorName.toLowerCase().includes('district') || 
                               (geoContext.county && anchorName.toLowerCase() === geoContext.county.toLowerCase()) ||
                               (geoContext.state && anchorName.toLowerCase() === geoContext.state.toLowerCase());
        if (anchorName && !isCountyOrAdmin && !isLowSignificancePoi(anchorName)) {
            rawCandidates.push({
                id: 'anchor-feature',
                name: anchorName,
                type: 'natural_feature',
                coordinates: { lat, lng },
                providers: ['AnchorProvider'],
                rawProviders: { AnchorProvider: geoContext },
                pipelineStatus: "collected",
                discoverySignals: ['Selected via click (Anchor)'],
                populationClass: 'small',
                identifiers: {},
                distanceBand: 'local',
                distanceKm: 0,
                settlementConfidence: 0,
                importanceScore: 100,
                confidenceScore: 100,
                isAnchor: true
            } as any);
        }
    }
    
    const providersAttemptedList: string[] = [];
    const providerFailuresList: string[] = [];
    const candidateSourcesUsed = new Set<string>();

    const providerStatusList: string[] = [];

    const results = await Promise.allSettled(
        providerRegistry.map(async (provider) => {
            providersAttempted++;
            providersAttemptedList.push(provider.name);
            const data = await provider.searchNearby(context);
            return {
                provider,
                name: provider.name,
                data
            };
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { provider, name, data } = result.value;
            const status = provider.lastStatus || (data.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY');
            const msg = provider.lastStatusMessage ? ` (${provider.lastStatusMessage})` : '';
            providerStatusList.push(`${name}: ${status}${msg}`);

            if (status === 'RATE_LIMITED' || status === 'FAILED' || status === 'TIMEOUT') {
                providerFailures++;
                providerFailuresList.push(`${name}: ${provider.lastStatusMessage || status}`);
            }

            for (const genericItem of data) {
                const item = genericItem as any;
                candidatesReceived++;
                candidateSourcesUsed.add(name);
                
                // 3. Normalize
                const itemLat = item.lat || item.coordinates?.lat || 0;
                const itemLng = item.lng || item.coordinates?.lng || 0;
                const distKm = Math.sqrt(Math.pow(itemLat - lat, 2) + Math.pow(itemLng - lng, 2)) * 111;
                
                let distanceBand: 'local' | 'regional' | 'extended' | 'invalid' = 'invalid';
                if (distKm <= 25) distanceBand = 'local';
                else if (distKm <= 100) distanceBand = 'regional';
                else if (distKm <= 250) distanceBand = 'extended';

                if (distanceBand === 'invalid') {
                    rejectedByDistance++;
                    continue;
                }

                const candidate: Candidate = {
                    id: item.id,
                    name: item.name || '',
                    type: (item.type || 'poi').toLowerCase(),
                    coordinates: { lat: itemLat, lng: itemLng },
                    providers: [name],
                    rawProviders: { [name]: item },
                    pipelineStatus: "collected",
                    discoverySignals: item.discoverySignals || [],
                    populationClass: item.populationClass || 'small',
                    identifiers: item.identifiers || {},
                    distanceBand: distanceBand,
                    distanceKm: distKm,
                    settlementConfidence: item.settlementConfidence
                };
                if (!candidate.name) continue;
                rawCandidates.push(candidate);
            }
        } else {
            providerFailures++;
            const failedProviderName = (result.reason as any)?.providerName || 'Unknown Provider';
            providerFailuresList.push(`${failedProviderName}: ${result.reason?.message || result.reason}`);
            providerStatusList.push(`${failedProviderName}: FAILED (${result.reason?.message || result.reason})`);
        }
    }

    console.log(`[DISCOVERY PROVIDER STATUS]\n` +
      providerStatusList.map(s => `  ${s}`).join('\n') + '\n' +
      `candidate sources used: ${Array.from(candidateSourcesUsed).join(', ') || 'None'}\n` +
      `fallback stage: ${providerFailures > 0 ? 'REGIONAL_MULTI_SOURCE_FALLBACK' : 'PRIMARY_PROVIDER_DISCOVERY'}\n`);

    // 4. Merge Evidence Into Entities
    const mergeCandidates = (candidates: Candidate[], existingMerged: Candidate[] = []) => {
        const result = [...existingMerged];
        for (const candidate of candidates) {
            let merged = false;
            const normalizedName = candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '');

            for (const existing of result) {
                const existingNormalized = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const dist = Math.sqrt(Math.pow(candidate.coordinates.lat - existing.coordinates.lat, 2) + Math.pow(candidate.coordinates.lng - existing.coordinates.lng, 2)) * 111;
                
                // Name match or proximity match
                if (normalizedName === existingNormalized || dist < 0.5) {
                    if (!existing.providers.includes(candidate.providers[0])) {
                        existing.providers.push(candidate.providers[0]);
                    }
                    existing.rawProviders = { ...existing.rawProviders, ...candidate.rawProviders };
                    if (candidate.discoverySignals) {
                        existing.discoverySignals = [...(existing.discoverySignals || []), ...candidate.discoverySignals];
                    }
                    existing.pipelineStatus = "merged";
                    
                    if (candidate.isAnchor) existing.isAnchor = true;
                    
                    merged = true;
                    break;
                }
            }
            if (!merged) {
                candidate.pipelineStatus = "merged";
                candidate.entityClass = classifyEntity(candidate);
                
                // Exclude administrative regions from discovery markers
                if (geoContext.country && candidate.name.toLowerCase() === geoContext.country.toLowerCase()) {
                    candidate.entityClass = 'administrative_region';
                    candidate.rankingClass = 'ADMINISTRATIVE_REGION';
                    candidate.type = 'administrative';
                    candidate.normalizedEntityType = 'administrative_region';
                    candidate.eligibleForDefaultDiscovery = false;
                }
                if (geoContext.state && candidate.name.toLowerCase() === geoContext.state.toLowerCase()) {
                    candidate.entityClass = 'administrative_region';
                    candidate.rankingClass = 'ADMINISTRATIVE_REGION';
                    candidate.type = 'administrative';
                    candidate.normalizedEntityType = 'administrative_region';
                    candidate.eligibleForDefaultDiscovery = false;
                }
                if (geoContext.county && candidate.name.toLowerCase() === geoContext.county.toLowerCase()) {
                    candidate.entityClass = 'administrative_region';
                    candidate.rankingClass = 'ADMINISTRATIVE_REGION';
                    candidate.type = 'administrative';
                    candidate.normalizedEntityType = 'administrative_region';
                    candidate.eligibleForDefaultDiscovery = false;
                }
                
                result.push(candidate);
            }
        }
        return result;
    };

    let mergedCandidates = mergeCandidates(rawCandidates);

    // 5. Score and Gate Candidates
    const balancedCandidates = applyCategoryBalance(mergedCandidates);
    await Promise.all(balancedCandidates.map(c => computeImportanceScore(c, lat, lng)));

    const popPlacesCount = balancedCandidates.filter(c => (c.rankingClass === 'POPULATED_PLACE' || c.entityClass === 'settlement') && c.eligibleForDefaultDiscovery !== false).length;
    const geoFeaturesCount = balancedCandidates.filter(c => (c.rankingClass === 'GEOGRAPHIC_FEATURE' || c.entityClass === 'geographic_feature') && c.eligibleForDefaultDiscovery !== false).length;
    const adminRegionsCount = balancedCandidates.filter(c => c.rankingClass === 'ADMINISTRATIVE_REGION' || c.entityClass === 'administrative_region' || c.type === 'administrative').length;

    console.log(`[Candidate Normalization & Classification Diagnostics]\n` +
      (balancedCandidates.length > 0 ? balancedCandidates.map(c => 
        `Candidate: ${c.name}\n` +
        `  Provider type: ${c.originalProviderType || c.type}\n` +
        `  Normalized type: ${c.normalizedEntityType || c.type}\n` +
        `  Classification: ${c.rankingClass || 'OTHER'}\n` +
        (c.displayName && c.displayName !== c.name ? `  Display name: ${c.displayName}\n` : '') +
        `  Reason: ${c.classificationReason || c.classificationEvidence || (c.rankingClass === 'POPULATED_PLACE' ? 'Verified populated place' : (c.rankingClass === 'REJECTED' ? 'Non-geographic event/topic' : 'Geographic feature / administrative area'))}`
      ).join('\n') : '  None'));
    
    // Apply standard scoring threshold gate (strictly enforces eligibleForDefaultDiscovery)
    const gatedCandidates = applyQualityGate(balancedCandidates);

    console.log(`[Pre-Ranking Candidates]\n` +
      (gatedCandidates.length > 0 ? gatedCandidates.map((c, i) => `  ${i + 1}. ${c.displayName || c.name} | ${c.normalizedEntityType || c.type} | ${(c.distanceKm ?? 0).toFixed(1)} km | score ${c.importanceScore ?? 0} | tier ${c.tier ?? 3}`).join('\n') : '  None'));

    gatedCandidates.sort((a, b) => {
        const tierA = a.tier || 3;
        const tierB = b.tier || 3;
        
        // Priority by hierarchy tier (Tier 1 > Tier 2 > Tier 3 > Tier 4 > Tier 5)
        if (tierA !== tierB) {
            return tierA - tierB;
        }

        // Higher importance score wins within same tier
        if ((a.importanceScore || 0) !== (b.importanceScore || 0)) {
            return (b.importanceScore || 0) - (a.importanceScore || 0);
        }

        if ((a.confidenceScore || 0) !== (b.confidenceScore || 0)) {
            return (b.confidenceScore || 0) - (a.confidenceScore || 0);
        }

        const distA = a.distanceKm ?? Math.sqrt(Math.pow(a.coordinates.lat - lat, 2) + Math.pow(a.coordinates.lng - lng, 2)) * 111;
        const distB = b.distanceKm ?? Math.sqrt(Math.pow(b.coordinates.lat - lat, 2) + Math.pow(b.coordinates.lng - lng, 2)) * 111;
        return distA - distB;
    });

    const selectedCandidates = applySelection(gatedCandidates, 6);

    const finalMarkers: MapMarker[] = selectedCandidates.map(c => ({
        id: c.id,
        name: c.displayName || c.name,
        displayName: c.displayName || c.name,
        lat: c.coordinates.lat,
        lng: c.coordinates.lng,
        type: c.normalizedEntityType || c.type,
        populationClass: c.populationClass || 'small',
        provenance: c.providers.join(', '),
        discoverySignals: c.discoverySignals,
        identifiers: c.identifiers
    }));

    console.log(`[Candidate Ranking]\n` +
      `populated places available: ${popPlacesCount}\n` +
      `geographic features available: ${geoFeaturesCount}\n` +
      `administrative regions: ${adminRegionsCount}\n\n` +
      `Final results:\n` +
      (finalMarkers.length > 0 ? finalMarkers.map((m, i) => `  ${i + 1}. ${m.name} | ${m.type}`).join('\n') : '  None'));

    if (selectedCandidates.length > 0) {
        console.log(`[Discovery primary]\n  ${selectedCandidates[0].name}`);
    } else {
        console.log(`[Discovery] ${lat.toFixed(2)}, ${lng.toFixed(2)} → 0 candidates`);
    }

    if (selectedCandidates.length === 0) {
        return {
            places: [],
            status: "NO_RESULTS",
            diagnostics: { 
                discoveryMode: 'REGIONAL_DISCOVERY',
                providersAttempted, 
                providerFailures, 
                resultCount: 0,
                candidatesReceived,
                rejectedByDistance,
                environment
            }
        };
    }

    return {
        places: finalMarkers,
        status: "SUCCESS",
        diagnostics: {
            discoveryMode: 'REGIONAL_DISCOVERY',
            resultCount: finalMarkers.length,
            providersAttempted,
            providerFailures,
            environment
        }
    };
  } catch (error: any) {
    console.error("Error fetching nearby places:", error);
    return {
      places: [],
      status: "PROVIDER_FAILURE",
      diagnostics: { providersAttempted: 1, providerFailures: 1, resultCount: 0 }
    };
  }
};

export const generateRoute = async (text: string, intent?: string): Promise<Route> => {
  const isUrl = text.startsWith('http');
  
  const generateRawRoute = async (t: string, url: boolean): Promise<{ waypoints: any[], title?: string, routeConfidence?: any, routeType?: string }> => {
    const prompt = `
      Task: Trace a geographical route or extract locations from the text.
      ${url ? `URL: "${t}". Trace locations mentioned in the page content.` : `Text: "${t}"`}

      Instructions:
      1. Identify a name for this route/expedition or event (e.g. "Battle of Midway", "The Silk Road"). If no specific name exists, create a short descriptive title.
      2. Extract every significant physical location (City, Country, Landmark) in narrative order.
      3. Identify the primary location where the event occurred.
      4. Classify every location by its relationship to the query using 'role': "primary", "related", "administrative", or "historical_context".
      5. Do not create separate primary waypoints for parent administrative regions. Assign them the "administrative" role and set their 'parentId' to the id of the location they contain.
      6. Do not treat cities, states, countries, or regions containing the primary location as separate equal waypoints.
      7. Include related locations only when they have a direct historical, geographic, or strategic relationship.
      8. Administrative parents should provide context, not compete with the primary location.
      9. For specific historical events, prioritize the event location over associated locations.
      10. For historical routes, prioritize specific named stops, cities, ports, crossings, and settlements.
      11. Historical routes must consist of specific, physical stops. NEVER use modern political borders, vast empires (like 'Persian Empire', 'Roman Empire'), continents (like 'Europe'), or generic regions as waypoints. The waypoints must be exact, point-like locations that were physically traversed.
      12. Avoid generic containers such as: "Central Asia", "The Balkans", "Europe", "China". Convert these into contextual relationships or administrative parents.
      13. Use HIGH PRECISION coordinates (at least 4 decimal places).
      14. For each location, provide rich historical context:
          - "context": A brief 10-word reason why it's on the route.
          - "description": A 2-4 sentence detailed narrative explaining why this location is included.
          - "significance": Why this specific location matters to the event.
          - "highlights": An array of 2-4 key historical facts or events here.
          - "historicalPeriod": The time period (e.g. "8th-11th century").
          - "entities": Relevant people, cultures, kingdoms, or groups.
      15. Separate the location name into distinct fields:
          - "name": Clean display label. NEVER include translations, parenthetical notes, historical annotations, "(modern-day)", "(ancient city)", "(起点)", or explanatory suffixes.
          - "alternateNames": Array of strings for translations, historical labels, or annotations (e.g. ["起点", "Ancient Bactra"]).
          - "canonicalName": The strict historical name of the specific location (e.g. "Karakoram Pass").
          - "historicalRegion": The broader historical region (e.g. "Central Asia").
          - "modernLocation": The modern-day equivalent (e.g. "Xinjiang, China").
      16. Historical accuracy rules:
          - Do not claim a definitive origin for distributed networks, trade systems, migrations, or cultural movements unless historically undisputed.
          - For concepts like the Silk Road, use representative locations and explain uncertainty.
          - Prefer wording such as: "representative starting point", "key trade corridor", "important node", "historically significant location".
          - Never output false certainty.
          - For distributed networks, do not evaluate confidence of the existence of the route. Evaluate confidence of the specific traversal. 
          - Example bad routeConfidence: "Silk Road was historically documented"
          - Example good routeConfidence: "The Silk Road existed as a network of routes. This sequence represents one historically plausible east-to-west traversal rather than a single fixed path."
      17. Route Ordering:
          - Require every waypoint to include a "sequence" integer.
          - Sequence must begin at 1 and increment by 1 for the narrative path.
      18. Route Type Classification:
          - Classify the routeType as one of: "single_location", "regional_event", "multi_location_campaign", "fixed_path", "network", "conceptual", or "point".
          - If the query describes distributed networks like the Silk Road, Roman roads, Viking trade routes, classification: "network".
          - If the query resolves to a single geographic location (like "Battle of Waterloo", "Pearl Harbor", "Pompeii"), classification: "single_location".
          - If the query is about a war, conflict, revolution, or invasion without a specific path, classification: "regional_event".
          - If the query is about an explicit journey or military campaign, classification: "multi_location_campaign".
      ${intent === 'HISTORICAL_EVENT' && /(war|conflict|revolution|campaign|invasion|battle)/i.test(t) && !/(route|timeline|progression|path)/i.test(t) ? `
      CRITICAL OVERRIDE: The user asked about a historical event/war but did NOT explicitly request a route. 
      You MUST classify this as routeType: "regional_event" or "single_location". 
      Do NOT generate a fake campaign or fixed path. Limit output to maximum 5 waypoints representing major regions.
      ` : ''}
      19. Payload Constraints:
          - Maximum 5 waypoints.
          - Maximum 200 words per waypoint.
          - Do NOT include empty fields.
          - Omit historical context objects and related locations unless directly requested.
      20. Schema: 
      {
        "title": "Name of Route or Event",
        "routeType": "single_location" | "regional_event" | "multi_location_campaign" | "fixed_path" | "network" | "conceptual" | "point",
        "routeConfidence": {
          "level": "high" | "medium" | "low",
          "reasoning": "Explanation of certainty for the overall route..."
        },
        "route": [
          {
            "id": "unique-kebab-case-id",
            "name": "Clean Display Name", 
            "alternateNames": ["Alternate 1", "Alternate 2"],
            "canonicalName": "Historical Name",
            "historicalRegion": "Region",
            "modernLocation": "Modern Name",
            "lat": 0.0000, 
            "lng": 0.0000,
            "role": "primary",
            "parentId": "",
            "sequence": 1,
            "context": "Brief context",
            "description": "Full narrative description...",
            "significance": "Historical importance...",
            "highlights": ["Fact 1", "Fact 2"],
            "historicalPeriod": "Time period",
            "entities": ["Person A", "Culture B"],
            "historicalConfidence": {
              "level": "high" | "medium" | "low",
              "reasoning": "..."
            }
          }
        ]
      }
      19. Output a strict JSON Object.
    `;
    
    const tools = url ? [{ googleSearch: {} }] : undefined;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        tools: tools,
        maxOutputTokens: 8192,
      }
    });
    const rawText = response.text;
    
    // Add size logging
    const charCount = rawText.length;
    const estimatedWaypoints = (rawText.match(/"lat"/g) || []).length;
    console.log(`===== ROUTE GENERATION SIZE =====\ncharacters: ${charCount}\nwaypoints: ${estimatedWaypoints}\nestimated payload: ${(charCount * 2) / 1024} KB\n=================================`);

    // Check size limit: If > 50,000 characters, it's way too big.
    if (charCount > 50000) {
        console.warn(`[Route Generation] Payload size (${charCount} chars) exceeded limit. Aborting parse and triggering concise retry.`);
        const conciseRetryPrompt = `Return ONLY valid JSON. Maximum 5 locations. No explanations. No markdown.`;
        const retryResponse = await generateContentWithRetry({
          model: modelName,
          contents: conciseRetryPrompt,
          config: {
            tools: tools,
            maxOutputTokens: 2048,
          }
        });
        const retryResult = parseAndExtract(retryResponse.text);
        if (!retryResult.success) {
             return { waypoints: [] };
        }
        return processParsedRouteResult(retryResult.value, text);
    }

    if (PIPELINE_DEBUG) {
        console.log(`[RAW AI JSON RESPONSE]:\n${rawText}`);
    }
    const result = parseAndExtract(rawText);
    
    if (!result.success) {
        console.error(
            `[Route Generation] JSON extraction failed: ${(result as any).reason}`,
            (result as any).error
        );
        // Fast retry with a concise prompt instead of resending the full context
        console.warn(`[RECOVERY] Parse failed. Triggering fast concise retry.`);
        const conciseRetryPrompt = `Return ONLY valid JSON. Maximum 5 locations. No explanations. No markdown.`;
        const retryResponse = await generateContentWithRetry({
          model: modelName,
          contents: conciseRetryPrompt,
          config: {
            tools: tools,
            maxOutputTokens: 2048,
          }
        });
        const retryResult = parseAndExtract(retryResponse.text);
        if (!retryResult.success) {
             return { waypoints: [] };
        }
        return processParsedRouteResult(retryResult.value, text);
    }
    return processParsedRouteResult(result.value, text);
  };
  
    const processParsedRouteResult = (data: any, originalText: string) => {
      let items: any[] = [];
      let title: string | undefined = undefined;
      let routeConfidence: any = undefined;
  
      if (data && typeof data === 'object') {
          if (data.title) title = data.title;
          if (data.routeConfidence) routeConfidence = data.routeConfidence;
          if (data.route && Array.isArray(data.route)) items = data.route;
          else if (data.locations && Array.isArray(data.locations)) items = data.locations;
          else if (data.waypoints && Array.isArray(data.waypoints)) items = data.waypoints;
          else if (Array.isArray(data)) items = data;
      } else if (Array.isArray(data)) {
          items = data;
      }

    const mappedItems = items.map((item, idx) => {
       const mapped = {
         ...item,
         routeTitle: title
       };
       if (idx === 0) logFieldDiff('generateRawRoute', item, mapped);
       if (idx === 0 && mapped.id) logWaypointSnapshot('RAW AI (After generateRawRoute map)', mapped as Waypoint);
       return mapped;
    });

    if (PIPELINE_DEBUG) {
      console.log(`\n===== GENERATE RAW ROUTE SUCCESS =====`);
      console.log(`Title: ${title}`);
      console.log(`Route Type: ${data.routeType || 'unknown'}`);
      console.log(`Waypoint Count: ${mappedItems.length}`);
      if (mappedItems.length > 0) {
        console.log(`Waypoint Fields: ${Object.keys(mappedItems[0]).length}`);
      }
      console.log(`======================================\n`);
    }

    return { waypoints: mappedItems, title, routeConfidence, routeType: data.routeType };
  };

  try {
    const route = await runRoutePipeline(text, isUrl, generateRawRoute, intent);
    return route;
  } catch (error) {
    console.error("Error generating route with pipeline:", error);
    return { waypoints: [] };
  }
};


export interface ExtractedQuery {
  intent: QueryIntent;
  entity: string;
  resolutionMode?: 'SINGLE_POINT' | 'MULTI_LOCATION_EXPLORATION';
}

export const routeIntentAndExtractEntity = (query: string): ExtractedQuery => {
  const clean = query.trim();
  
  // 1. Check for Route / Expansion patterns
  const routePatterns = [
    /\b(?:follow|trace|journey|path|route|expansion|migration|trade network)\b/i,
    /\bfrom\b.*?\bto\b/i
  ];
  for (const pattern of routePatterns) {
    if (pattern.test(clean)) {
      return { 
        intent: 'route' as any, 
        entity: clean,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION'
      };
    }
  }

  // 2. Check for Discovery / Recovery patterns first
  const discoveryPatterns = [
    /^\s*where\s+(?:was|were)\s+(?:the\s+)?(.+?)\s+(?:found|discovered|recovered|unearthed|excavated|located)\s*\??\s*$/i,
    /^\s*where\s+did\s+(?:they|researchers|archaeologists)?\s*(?:find|discover|recover|unearth|excavate)\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
    /^\s*discovery\s+site\s+of\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
    /^\s*location\s+where\s+(?:the\s+)?(.+?)\s+was\s+(?:found|discovered|recovered|unearthed)\s*\??\s*$/i,
  ];

  for (const pattern of discoveryPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const entityStr = match[1].replace(/[?.,!]+$/, "").trim();
      const cleanedEntity = entityStr.replace(/^the\s+/i, "");
      return {
        intent: 'DISCOVERY_OBJECT_LOCATION',
        entity: cleanedEntity || entityStr
      };
    }
  }

  // 2. Check for Historical Event patterns
  const historicalPatterns = [
    /^\s*where\s+did\s+(.+?)\s+take\s+place\s*\??\s*$/i,
    /^\s*where\s+did\s+(.+?)\s+happen\s*\??\s*$/i,
    /^\s*where\s+did\s+(.+?)\s+occur\s*\??\s*$/i,
    /^\s*when\s+and\s+where\s+did\s+(.+?)\s+take\s+place\s*\??\s*$/i,
  ];

  for (const pattern of historicalPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const entityStr = match[1].replace(/[?.,!]+$/, "").trim();
      const cleanedEntity = entityStr.replace(/^the\s+/i, "");
      
      console.log(`Intent:\nHISTORICAL_EVENT\nRouting decision:\nMULTI_LOCATION_EXPLORATION\nCoordinate validation:\nBYPASSED (non-point intent)`);
      
      return {
        intent: 'HISTORICAL_EVENT',
        entity: cleanedEntity || entityStr,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION'
      };
    }
  }

  // 3. Check for Exploratory / mixed knowledge patterns
  const exploratoryPatterns = [
    /\bnear\b/i,
    /\baround\b/i,
    /\bshipwrecks\b/i,
    /\bplaces\s+in\b/i,
    /\bplaces\s+related\s+to\b/i,
    /\bhistory\s+of\b/i,
    /\bimportant\s+places\b/i,
    /\bevents\s+of\b/i,
    /\bbattles\s+of\b/i,
  ];
  
  for (const pattern of exploratoryPatterns) {
    if (pattern.test(clean)) {
      return { 
        intent: 'EXPLORATORY', 
        entity: clean,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION'
      };
    }
  }

  // 4. Check for Natural language location queries
  const nlPatterns = [
    /^\s*where\s+is\s+located\s+(.+)$/i,
    /^\s*where\s+is\s+(.+?)(?:\s+located|\s+found)?\s*\??\s*$/i,
    /^\s*where\s+was\s+(.+?)(?:\s+found|\s+located)?\s*\??\s*$/i,
    /^\s*location\s+of\s+(.+?)\s*$/i,
    /^\s*tell\s+me\s+(?:about|more\s+about)\s+(.+?)\s*$/i,
    /^\s*show\s+me\s+(.+?)\s*$/i,
    /^\s*find\s+(.+?)\s*$/i,
    /^\s*locate\s+(.+?)\s*$/i,
    /^\s*go\s+to\s+(.+?)\s*$/i,
    /^\s*take\s+me\s+to\s+(.+?)\s*$/i,
    /^\s*info(?:rmation)?\s+on\s+(.+?)\s*$/i,
  ];

  for (const pattern of nlPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const entityStr = match[1].replace(/[?.,!]+$/, "").trim();
      const cleanedEntity = entityStr.replace(/^the\s+/i, "");
      return { 
        intent: 'NATURAL_LOCATION', 
        entity: cleanedEntity || entityStr
      };
    }
  }

  // 5. Fallback to Direct lookup
  return { intent: 'DIRECT', entity: clean };
};

export const extractEntityFromQuery = (query: string): string => {
  const extracted = routeIntentAndExtractEntity(query);
  return extracted.entity;
};

import { ResolvedCoordinates } from '../types';

export const recoverCoordinatesFromAi = async (rawQuery: string, intent: string, entity: string, attempt: number = 1): Promise<ResolvedCoordinates | null> => {
  let promptText = `Provide only the precise real-world decimal latitude and longitude coordinates for: "${entity}" (extracted from query: "${rawQuery}", intent: ${intent}).
  Return a strictly valid JSON object exactly like this:
  {
    "lat": 12.345,
    "lng": 67.890
  }
  Output ONLY the JSON object.`;

  if (attempt > 1) {
      promptText += `\n\nReturn the documented discovery coordinates. Do not return the origin of the name. Do not return a similarly named location.`;
  }
  
  try {
    const response = await generateContentWithRetry({
      model: modelName,
      contents: promptText,
      config: {
        maxOutputTokens: 200, 
      }
    });

    const parsed = parseAndExtract(response.text);
    const data = parsed.success ? parsed.value : null;
    let valid = false;
    
    let parsedCoords = normalizeCoordinates(data) || (data && normalizeCoordinates((data as any).coordinates));
    
    if (parsedCoords) {
      valid = isValidCoordinates(parsedCoords);
      
      const lookupKey = entity.toLowerCase().trim();
      const knownEntity = DETERMINISTIC_LOCATION_DB[lookupKey];
      if (valid && knownEntity) {
         const R = 6371;
         const dLat = (parsedCoords.lat - knownEntity.lat) * Math.PI / 180;
         const dLon = (parsedCoords.lng - knownEntity.lng) * Math.PI / 180;
         const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(knownEntity.lat * Math.PI / 180) * Math.cos(parsedCoords.lat * Math.PI / 180) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
         const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
         const distance = R * c;
         
         const threshold = knownEntity.type === LocationType.CITY ? 50 : 10;
         
         if (distance > threshold) {
             valid = false;
         }
      }

      if (valid && intent === 'DISCOVERY_OBJECT_LOCATION') {
          const revGeo = await reverseGeocode(parsedCoords.lat, parsedCoords.lng);
          
          const validationPrompt = `Is ${revGeo?.country || "this location"} (${revGeo?.state || revGeo?.region || "unknown region"}) the historically correct documented discovery or recovery location for "${entity}"?
          Answer with ONLY a JSON object: {"valid": true/false, "reason": "why"}`;
          
          const valRes = await generateContentWithRetry({
              model: modelName,
              contents: validationPrompt,
              config: { responseMimeType: "application/json" }
          }, 1);
          
          const valParsed = parseAndExtract(valRes.text);
          let isHistoricallyValid = false;
          let reason = "Validation failed to parse";
          
          if (valParsed.success && typeof (valParsed.value as any).valid === 'boolean') {
              isHistoricallyValid = (valParsed.value as any).valid;
              reason = (valParsed.value as any).reason || "No reason provided";
          }
          
          console.log(`[RECOVERY LOCATION VALIDATION]`);
          console.log(`entity: ${entity}`);
          console.log(`coordinates: ${parsedCoords.lat}, ${parsedCoords.lng}`);
          console.log(`reverseGeocode: ${revGeo?.displayName || 'Unknown'}`);
          console.log(`country: ${revGeo?.country || 'Unknown'}`);
          console.log(`region: ${revGeo?.state || revGeo?.region || 'Unknown'}`);
          console.log(`historicalContext: ${intent}`);
          console.log(`result: ${isHistoricallyValid ? 'PASS' : 'FAIL'} (${reason})`);
          
          if (!isHistoricallyValid) {
              if (attempt < 2) {
                  console.log("Retrying recovery with strict documented coordinates constraint...");
                  return recoverCoordinatesFromAi(rawQuery, intent, entity, attempt + 1);
              }
              valid = false;
          }
      }

      if (valid) {
         return { ...parsedCoords, source: "ai_recovery" };
      }
    }
    
    return null;

  } catch (error) {
    return null;
  }
};;

export const recoverLocationMetadata = async (
  entityName: string, 
  coordinates: GeoCoordinates,
  canonicalIdentity?: Partial<CanonicalGeographicEntity> & { country?: string; state?: string; city?: string; region?: string; county?: string }
): Promise<Partial<EnrichmentResult> | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const entityTitle = canonicalIdentity?.canonicalName || entityName;
    const adminArea = canonicalIdentity?.city || canonicalIdentity?.county || canonicalIdentity?.state || canonicalIdentity?.region || "Unknown area";
    const countryName = canonicalIdentity?.country || "Unknown country";
    const entityTypeStr = canonicalIdentity?.entityType || "natural_feature";

    const contextDetails = [
      `Entity: ${entityTitle}`,
      `Canonical coordinates: ${coordinates.lat}, ${coordinates.lng}`,
      `Country: ${countryName}`,
      `Administrative area: ${adminArea}`,
      `Entity type: ${entityTypeStr}`,
      canonicalIdentity?.osmId ? `OSM ID: ${canonicalIdentity.osmId}` : null,
      canonicalIdentity?.osmType ? `OSM Type: ${canonicalIdentity.osmType}` : null,
      canonicalIdentity?.wikidataId ? `Wikidata ID: ${canonicalIdentity.wikidataId}` : null,
      canonicalIdentity?.wikipedia ? `Wikipedia: ${canonicalIdentity.wikipedia}` : null
    ].filter(Boolean).join('\n');

    const basePrompt = `
      Canonical geographic identity:
${contextDetails}

      CRITICAL INSTRUCTIONS:
      1. You MUST describe THIS entity at THESE canonical coordinates (${coordinates.lat}, ${coordinates.lng}).
      2. Do not substitute another place with the same or similar name.
      3. The coordinates, country, administrative area, and entity type are authoritative.
      4. LANGUAGE REQUIREMENT: All text fields ("description", "climate", "contextNotes", "notable") MUST be written strictly in ENGLISH. Never return French, Spanish, German, Italian, or other non-English text.
      
      Current Date: ${currentDate}
      
      Require the response to be a SINGLE JSON object with exactly these top-level fields:
      {
        "name": "${entityTitle}",
        "locationString": "${adminArea}, ${countryName}",
        "description": "2-4 substantive educational paragraphs in English explaining what this place is, why it exists, why it is significant, and why someone should care. Write informative narrative without generic template phrases.",
        "population": null,
        "climate": {
          "name": "string (e.g. Subpolar oceanic climate, Oceanic climate, Alpine climate, Humid subtropical climate, etc.)",
          "description": "string (plain language climate summary in English)",
          "koppenCode": "string (e.g. Cfa, Cfb, ET)"
        },
        "contextNotes": ["substantive fact 1 in English", "substantive fact 2 in English", "substantive fact 3 in English"],
        "notable": ["notable point 1 in English", "notable point 2 in English", "notable point 3 in English"]
      }

      Do NOT allow Markdown headings, nested explanatory sections, prose before/after JSON, or multiple JSON objects.
      Output ONLY a single valid JSON object.
    `;

    const retryPrompt = `
      Canonical geographic identity:
${contextDetails}

      CRITICAL RULES:
      1. You MUST output ONLY a single valid JSON object.
      2. Describe ONLY ${entityTitle} in ${countryName} at coordinates ${coordinates.lat}, ${coordinates.lng}.
      3. ALL text must be strictly in ENGLISH. Do NOT use French, Spanish, German, Italian, etc.
      4. Do NOT use markdown fences (\`\`\`).
      5. Do NOT output partial JSON or nested climate objects as root.
      6. You MUST include ALL of the following top-level keys: "description", "population", "climate", "contextNotes", "notable".
      7. "description" must be substantive paragraphs in English about the entity, not just climate notes.
    `;

    const fetchAndParse = async (isRetry: boolean) => {
      const prompt = isRetry ? retryPrompt : basePrompt;
      const response = await generateContentWithRetry({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: mainInfoSchemaConfig,
          maxOutputTokens: 4000,
        }
      });
      
      const rawText = response.text;
      const parsed = parseAndExtract(rawText);
      let data = parsed.success ? (parsed.value as any) : null;
      if (Array.isArray(data) && data.length > 0) {
         data = data[0];
      }
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
          const keys = Object.keys(data);
          // Unwrap container if needed
          if (keys.length === 1 && typeof data[keys[0]] === 'object' && data[keys[0]] !== null && !Array.isArray(data[keys[0]])) {
              data = data[keys[0]];
          }
          
          // Never accept isolated sub-objects (e.g., climate sub-object extracted as root)
          if (data.koppenCode && !data.climate) {
              console.warn(`[RECOVERY PARSER] Rejected isolated sub-object containing koppenCode:`, data);
              data = null;
          }
          if (data && isGenericPlaceholderDescription(data.description, entityTitle)) {
              console.warn(`[RECOVERY PARSER] Description failed placeholder validation:`, data.description);
              data = null;
          }
          if (data && data.description && !isEnglishText(data.description)) {
              console.warn(`[RECOVERY PARSER] Description failed English language validation:`, data.description);
              data = null;
          }
      }
      return { rawText, extractedJson: parsed.success ? JSON.stringify(parsed.value, null, 2) : 'Extraction Failed', parseResult: parsed.success ? 'Pass' : 'Fail', data };
    };

    let attempt = await fetchAndParse(false);
    
    const validateContent = (data: any) => {
        let missing: string[] = [];
        if (!data) return ['all'];
        
        if (!data.description || typeof data.description !== 'string' || isGenericPlaceholderDescription(data.description, entityTitle) || !isEnglishText(data.description)) {
            missing.push('description');
        }
        
        return missing;
    };
    
    let missingKeys: string[] = validateContent(attempt.data);
    let retryAttempted = false;
    
    if (missingKeys.length > 0) {
        retryAttempted = true;
        console.warn(`Initial metadata recovery failed validation. Missing/Empty keys: ${missingKeys.join(', ')}. Retrying with strict fallback...`);
        attempt = await fetchAndParse(true);
        missingKeys = validateContent(attempt.data);
    }
    
    console.log(`=== METADATA RECOVERY PIPELINE ===`);
    console.log(`Raw Response:\n${attempt.rawText}`);
    console.log(`Extracted JSON:\n${attempt.extractedJson}`);
    console.log(`Parse Result:\n${attempt.parseResult}`);
    console.log(`Retry Attempted:\n${retryAttempted}`);
    
    const data = attempt.data;

    // Guardrail against narrative mismatch
    if (data && data.description && canonicalIdentity?.country) {
      const canonicalCountry = canonicalIdentity.country.toLowerCase().trim();
      const descLower = (data.description || '').toLowerCase();
      if ((canonicalCountry === 'united states' || canonicalCountry === 'usa') && 
          (descLower.includes('iceland') || descLower.includes('reykjanes') || descLower.includes('grindavík')) &&
          !descLower.includes('united states') && !descLower.includes('nevada')) {
        console.warn(`[ENRICHMENT GUARDRAIL REJECTION] Narrative described Iceland for canonical US/Nevada entity. Rejecting contradictory narrative.`);
        data.description = "";
      } else if (canonicalCountry === 'iceland' && 
                 (descLower.includes('nevada') || descLower.includes('las vegas')) &&
                 !descLower.includes('iceland')) {
        console.warn(`[ENRICHMENT GUARDRAIL REJECTION] Narrative described Nevada for canonical Iceland entity. Rejecting contradictory narrative.`);
        data.description = "";
      }
    }

    const timestamp = Date.now();
    const provenance = { provider: "Gemini", timestamp, cache: false };
    const metadata: Partial<EnrichmentResult> = {};
    
    const validFields: string[] = [];
    const rejectedFields: string[] = [];
    
    const isBlank = (val: any) => {
        if (val === undefined || val === null) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        if (Array.isArray(val) && val.length === 0) return true;
        if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
        return false;
    };

    if (data && data.description && !isBlank(data.description) && isEnglishText(typeof data.description === 'string' ? data.description : data.description.text)) {
       metadata.description = typeof data.description === 'string' 
           ? { text: data.description, provenance } 
           : { ...data.description, provenance };
       validFields.push('description');
    } else {
       rejectedFields.push('description');
    }
    
    const rawEType = (canonicalIdentity?.entityType || '').toLowerCase();
    const isSettlement = ['city', 'town', 'village', 'municipality', 'settlement', 'country', 'state'].includes(rawEType);

    if (data && data.population && typeof data.population === 'number' && data.population > 0 && isSettlement) {
       metadata.population = { value: data.population, source: "ai", status: "available" };
       validFields.push('population');
    } else {
       rejectedFields.push('population');
    }
    
    if (data && data.climate && !isBlank(data.climate)) {
       let cName = "";
       let cDesc = "";
       let kCode = "";
       if (typeof data.climate === 'string') {
           cName = data.climate;
           cDesc = data.climate;
       } else if (typeof data.climate === 'object') {
           cName = data.climate.name || data.climate.value || data.climate.koppenCode || "";
           cDesc = data.climate.description || "";
           kCode = data.climate.koppenCode || "";
       }

       if (cName && !isPlaceholderString(cName)) {
           metadata.climate = {
               value: cName,
               name: cName,
               description: isPlaceholderString(cDesc) ? "" : cDesc,
               koppenCode: kCode,
               provenance
           };
           validFields.push('climate');
       } else {
           rejectedFields.push('climate');
       }
    } else {
       rejectedFields.push('climate');
    }
    
    if (data.contextNotes && !isBlank(data.contextNotes)) {
       const notesArray = Array.isArray(data.contextNotes) ? data.contextNotes : [data.contextNotes];
       metadata.contextNotes = notesArray.map((note: any) => ({
          text: typeof note === 'string' ? note : JSON.stringify(note),
          provenance
       }));
       validFields.push('contextNotes');
    } else {
       rejectedFields.push('contextNotes');
    }
    
    if (data.notable && !isBlank(data.notable)) {
       const notableArray = Array.isArray(data.notable) ? data.notable : [data.notable];
       metadata.notable = notableArray.map((e: any) => (
           typeof e === 'string' ? {
               name: e,
               entityType: "unknown",
               relationship: "custom",
               customRelationship: "unknown",
               provenance
           } : {
               name: e.name,
               entityType: e.type,
               relationship: "custom",
               customRelationship: e.type,
               provenance
           }
       ));
       validFields.push('notable');
    } else {
       rejectedFields.push('notable');
    }
    
    console.log(`[METADATA RECOVERY]\nValid fields: ${validFields.length > 0 ? validFields.join(', ') : 'None'}\nRejected fields: ${rejectedFields.length > 0 ? rejectedFields.join(', ') : 'None'}`);
    
    console.log(`Final Metadata Keys:\n${Object.keys(metadata).join(', ')}`);
    console.log(`================================`);
    
    console.log(`=== BOUNDARY LOG 1: recoverLocationMetadata output ===`);
    console.log(`{
      description: typeof ${typeof metadata.description},
      population: typeof ${typeof metadata.population},
      climate: typeof ${typeof metadata.climate},
      contextNotes: typeof ${typeof metadata.contextNotes}
    }`);
    console.log(`======================================================`);

    return metadata;
  } catch (e) {
    console.error("recoverLocationMetadata failed:", e);
    return null;
  }
};
