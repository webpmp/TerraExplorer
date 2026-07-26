import { GoogleGenAI, Type } from "@google/genai";
import { LocationInfo, QueryIntent, Waypoint, Route, UserSettings, LocationType, EntityType, SearchResult, MapMarker, GeoCoordinates, isValidCoordinates, ProvenanceRecord } from '../types';
import { runRoutePipeline } from './routePipeline';
import { PIPELINE_DEBUG, logWaypointSnapshot, logFieldDiff, logEnrichmentJsonPipeline } from '../utils/pipelineDebug';
import { parseAndExtract } from '../utils/jsonParser';
import { enrichLocationInfo } from './locationService';

export const EnrichmentMetrics = {
    retry: 0,
    retry_success: 0,
    schema_failure: 0,
    accepted: 0,
    rejected: 0
};

// Ensure API key is available
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-ts-check' });

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
      temperature: params.config?.temperature ?? params.generationConfig?.temperature ?? 0.7,
      max_tokens: params.config?.maxOutputTokens ?? params.generationConfig?.maxOutputTokens,
    };

    if (isJson) {
      // For compatibility with some local models, don't pass response_format if they might crash.
      // We will rely purely on the system prompt schema instruction we just added.
      // Many LM Studio models will 400 Bad Request on response_format unless it's perfectly supported.
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.status} ${response.statusText}`);
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
    description: { type: Type.STRING },
    population: {
      type: Type.OBJECT,
      properties: {
        current: populationInfoSchema,
        historical: populationInfoSchema
      }
    },
    climate: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        koppenCode: { type: Type.STRING }
      },
      required: ["name", "description"]
    },
    relatedEntities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING }
        },
        required: ["name", "type"]
      }
    },
    suggestedZoom: { type: Type.NUMBER },
    contextNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["name", "type", "coordinates", "description"]
};

// Helper to normalize coordinates (handle AI returning [lat, lng] instead of {lat, lng})
export const normalizeCoordinates = (coordsData: any): { lat: number, lng: number } | undefined => {
  if (!coordsData) return undefined;
  
  // Format D: { coordinates: [...] }
  if (coordsData.coordinates !== undefined) {
    return normalizeCoordinates(coordsData.coordinates);
  }

  // Format C: [lat, lng]
  if (Array.isArray(coordsData) && coordsData.length >= 2) {
    if (typeof coordsData[0] === 'number' && typeof coordsData[1] === 'number') {
      return { lat: coordsData[0], lng: coordsData[1] };
    }
  } 
  // Format A: { lat, lng }
  else if (typeof coordsData.lat === 'number' && typeof coordsData.lng === 'number') {
    return { lat: coordsData.lat, lng: coordsData.lng };
  }
  // Format B: { latitude, longitude }
  else if (typeof coordsData.latitude === 'number' && typeof coordsData.longitude === 'number') {
    return { lat: coordsData.latitude, lng: coordsData.longitude };
  }
  
  return undefined;
};



/**
 * Model-independent location normalization layer.
 * Formats city/state, city/country, and common location input formats regardless of AI provider.
 */
export const normalizeLocationEntity = (entity: string): string => {
  if (!entity) return "";
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
const DETERMINISTIC_LOCATION_DB: Record<string, { name: string; type: LocationType; entityType: EntityType; lat: number; lng: number; suggestedZoom?: number }> = {
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
  "boston massacre": { name: "Boston Massacre Site", type: LocationType.POI, entityType: "historical_event_site", lat: 42.3588, lng: -71.0578, suggestedZoom: 9 }
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

    // Pre-flight capability check: If API key is invalid or missing AND we are using Gemini AND no deterministic match exists
    const currentApiKey = process.env.API_KEY;
    if (!deterministicRes && settings.aiProvider === 'gemini' && (!currentApiKey || currentApiKey === 'dummy-key-for-ts-check')) {
       console.log("[DEBUG] Failure reason code: LOCATION_SYSTEM_UNAVAILABLE");
       return { error: "LOCATION_SYSTEM_UNAVAILABLE", locationInfo: { name: normalizedQuery || query } };
    }

    let resolvedData: any = null;
    let suggestedZoom = 5;

    if (deterministicRes) {
      resolvedData = {
        name: deterministicRes.name,
        type: deterministicRes.type,
        entityType: deterministicRes.entityType,
        climate: (deterministicRes as any).climate,
        coordinates: { lat: deterministicRes.lat, lng: deterministicRes.lng },
        description: `Information on ${deterministicRes.name}.`,
        funFacts: [],
        notable: []
      };
      suggestedZoom = deterministicRes.suggestedZoom || 8;
    }

    // Step 3: AI resolution / enrichment fallback if deterministic layer didn't find coordinates
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
        2. DISCOVERY_LOCATION:
           - Resolve the original discovery / recovery site coordinates (e.g. North Atlantic ocean floor for Titanic, Stockholm Harbor for Vasa discovery site, Fort Julien for Rosetta Stone, Qumran Caves for Dead Sea Scrolls).
           - Set 'entityType' to 'shipwreck_site', 'archaeological_site', 'discovery_site', or 'artifact'.
           - Set 'type' to 'Point of Interest'. DO NOT return current display museum locations unless query explicitly asks for the museum.
        3. NATURAL_LOCATION:
           - Resolve geographic features or places. For mountains, mountains ranges, lakes, rivers, set 'entityType' to 'mountain', 'natural_feature', 'ocean', etc. For cities, set 'entityType' to 'city'.

        Return a JSON object:
        - 'name': The canonical name of the location or event site.
        - 'entityType': Choose ONE from: city, country, state, ocean, natural_feature, mountain, landmark, museum, historical_event_site, archaeological_site, discovery_site, shipwreck_site, artifact, battlefield, festival_site.
        - 'type': Choose ONE from: Continent, Country, State, City, Ocean, Point of Interest.
        - 'metadataMode': MUST be exactly one of: "historical_site", "modern_place", or "natural_feature".
          - Use "historical_site" for ruins, ancient cities, archaeological locations, battlefields, historical events.
          - Use "modern_place" for current cities, towns, countries.
          - Use "natural_feature" for rivers, mountains, oceans.
        - 'suggestedZoom': 0-10 scale. 8-10 for specific sites/cities, 4-6 for regions.
        - 'description': Detailed summary (approx 80 words).
        - 'population': Object containing 'current' and 'historical' population estimates. For historical events, always distinguish historical from modern.
        - 'climate': Object containing 'name' (e.g. "Oceanic climate"), 'description' (plain language summary), and 'koppenCode'.
        - 'contextNotes': Array of 3 string facts that provide meaningful historical or geographic context.
        - 'coordinates': Precise decimal lat/lng.
        - 'relatedEntities': Array of entities that provide meaningful context. Categorize by type (person, group, place, institution, artifact, event).

        CRITICAL INSTRUCTION: Return ONLY a valid JSON object. Do not output markdown code blocks (\`\`\`json), explanations, or any other text. Output strict raw JSON.
      `;

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
    if (!resolvedData.description) resolvedData.description = "Detailed description unavailable.";
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
    
    // Distinguish temporary failure (network issues/timeout/blocked request)
    const errMsg = error?.message?.toLowerCase() || "";
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("timeout") || errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("exhaust")) {
       return { error: "TEMP_FAILURE", locationInfo: { name: normalizedQuery || query } };
    }
    return { error: "UNABLE_TO_RESOLVE", locationInfo: { name: normalizedQuery || query } };
  }
};

export const sanitizeLocationInfo = <T extends Partial<LocationInfo>>(data: T): T => {
  if (!data) return data;

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
  if (data.population !== undefined) {
    if (typeof data.population === 'number' || typeof data.population === 'string') {
      console.warn(`[Normalization] Discarding legacy flat population value: ${data.population}`);
      data.population = null as any;
    } else if (data.population && typeof data.population === 'object') {
      const p = data.population as any;
      const hasCurrent = p.current && p.current.formattedValue && p.current.description;
      const hasHistorical = p.historical && p.historical.formattedValue && p.historical.description;
      
      if (!hasCurrent && !hasHistorical) {
        data.population = null as any;
      } else if (isHiddenEntityType && !hasHistorical) {
         // Force historical contexts to only show population if historical data exists
         data.population = null as any;
      }
    } else {
      data.population = null as any;
    }
  }

  // Normalize new climate schema
  if (data.climate !== undefined) {
    if (typeof data.climate === 'string') {
      const rawClimate = (data.climate as string).trim();
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
    } else if (data.climate && typeof data.climate === 'object') {
      const c = data.climate as any;
      if (!c.name || !c.description) {
        data.climate = null as any;
      } else if (isHiddenEntityType) {
         // Historically, we hid climate for events. Let's keep it if AI found it useful, but if it says "Varies" clear it
         if (c.name.toLowerCase().includes('varies') || c.name.toLowerCase().includes('n/a')) {
           data.climate = null as any;
         }
      }
    } else {
      data.climate = null as any;
    }
  }
  
  // Normalize relatedEntities
  if (data.relatedEntities) {
    if (!Array.isArray(data.relatedEntities) || data.relatedEntities.length === 0) {
       data.relatedEntities = [] as any;
    } else {
       const genericEntityBlacklist = [
         "history",
         "historical",
         "culture",
         "civilization",
         "europe",
         "asia",
         "the world",
         "ancient world"
       ];
       
       data.relatedEntities = data.relatedEntities.filter((e: any) => {
         if (!e.name || !e.type) return false;
         if (e.name.length < 2) return false;
         
         const lowerName = e.name.toLowerCase().trim();
         if (genericEntityBlacklist.includes(lowerName)) return false;
         
         return true;
       }) as any;
    }
  }

  return data;
};

export const getInfoFromFeature = async (name: string, lat: number, lng: number): Promise<LocationInfo | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const mainPrompt = `
      Provide encyclopedic information for the location named "${name}" located at coordinates: ${lat}, ${lng}.
      Current Date: ${currentDate}
      
      Return a JSON object with:
      - name: The specific name provided: "${name}". Do not change this name or summarize a region unless absolutely necessary.
      - type: Continent, Country, State, City, Ocean, or Point of Interest.
      - description: Detailed Wikipedia-style encyclopedia entry about ${name} (approx 80 words).
      - population: Object containing 'current' and 'historical' population estimates. For historical events, always distinguish historical population from modern population.
      - climate: Object containing 'name' (e.g. "Oceanic climate"), 'description' (plain language summary), and 'koppenCode' (treat scientific classifications as supporting metadata, not primary).
      - contextNotes: Array of 3 string facts that provide meaningful historical or geographic context. Do not output generic trivia.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - relatedEntities: Array of entities that provide meaningful context about the location or event. Categorize by type (person, group, place, institution, artifact, event). Do not include generic associated concepts.
      
      Output ONLY the JSON object.
    `;

    const mainRequest = generateContentWithRetry({
      model: modelName,
      contents: mainPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: mainInfoSchemaConfig,
        maxOutputTokens: 4000,
      }
    });

    const mainResponse = await mainRequest;
    
    let parsed = parseAndExtract(mainResponse.text);
    
    logEnrichmentJsonPipeline(mainResponse.text, parsed, false);

    // 1-Time Strict Retry for Formatting Failures
    if (!parsed.success && ((parsed as any).reason === "NO_JSON_FOUND" || (parsed as any).reason === "INVALID_JSON" || (parsed as any).reason === "UNBALANCED_DELIMITERS")) {
       EnrichmentMetrics.retry++;
       console.warn(`[RECOVERY] Parse failed (${(parsed as any).reason}): ${(parsed as any).error}. Triggering 1-time strict retry.`);
       const retryPrompt = mainPrompt + "\n\nCRITICAL INSTRUCTION: Return ONLY a single valid JSON object. Do not include markdown, explanations, code fences, comments, or any text before or after the JSON.";
       const retryRequest = generateContentWithRetry({
         model: modelName,
         contents: retryPrompt,
         config: {
           responseMimeType: "application/json",
           responseSchema: mainInfoSchemaConfig,
           maxOutputTokens: 4000,
         }
       });
       const retryResponse = await retryRequest;
       parsed = parseAndExtract(retryResponse.text);
       logEnrichmentJsonPipeline(retryResponse.text, parsed, true);
       
       if (parsed.success) {
           EnrichmentMetrics.retry_success++;
       }
    }

    let data = parsed.success ? (parsed.value as any) : null;

    if (!data) {
        data = {
            name: name,
            type: "Point of Interest",
            description: "Information unavailable.",
            coordinates: { lat, lng },
            contextNotes: [],
            relatedEntities: []
        };
    }
    
    // Ensure the name returned is the one requested
    data.name = name;
    
    if (data.coordinates) {
        data.coordinates = normalizeCoordinates(data.coordinates) || data.coordinates;
    }

    return enrichLocationInfo(data as LocationInfo);

  } catch (error: any) {
    console.error("Error resolving feature info:", error);
    return sanitizeLocationInfo({
        name: name,
        type: LocationType.POI,
        description: error.message?.includes('429') || error.message?.includes('Quota') 
            ? "API Quota Exceeded. Please try again later."
            : "Could not retrieve information at this time.",
        coordinates: { lat, lng },
        funFacts: [],
        notable: []
    } as unknown as LocationInfo);
  }
};

export const getInfoFromCoordinates = async (lat: number, lng: number, waypoint?: Waypoint): Promise<LocationInfo | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const mainPrompt = `
      Identify the most significant human settlement or geographic feature at or extremely close to coordinates: ${lat}, ${lng}.
      ${waypoint ? `IMPORTANT: The user selected the location "${waypoint.name}". Ensure your response accurately reflects this specific location.` : ""}
      Current Date: ${currentDate}
      
      Return a JSON object with:
      - name: Common name of the location
      - type: Continent, Country, State, City, Ocean, or Point of Interest.
      - metadataMode: MUST be exactly one of: "historical_site", "modern_place", or "natural_feature".
        - Use "historical_site" for ruins, ancient cities, archaeological locations, battlefields.
        - Use "modern_place" for current cities, towns, countries.
        - Use "natural_feature" for rivers, mountains, deserts.
      - description: Detailed Wikipedia-style encyclopedia entry (approx 80 words).
      - population: Recent estimate (if applicable).
      - climate: Köppen climate classification.
      - funFacts: 3 interesting facts.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - 'notable': Array of 3 objects, each with 'name' (person's name) and 'significance' (descriptive sentence).
      
      CRITICAL INSTRUCTION: Return ONLY a valid JSON object. Do not output markdown code blocks (\`\`\`json), explanations, or any other text. Output strict raw JSON.
    `;

    const mainRequest = generateContentWithRetry({
      model: modelName,
      contents: mainPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: mainInfoSchemaConfig,
        maxOutputTokens: 4000,
      }
    });

    let mainResponse = await mainRequest;
    
    let parsed = parseAndExtract(mainResponse.text);
    
    logEnrichmentJsonPipeline(mainResponse.text, parsed, false);
    
    // 1-Time Strict Retry for Formatting Failures
    if (!parsed.success && ((parsed as any).reason === "NO_JSON_FOUND" || (parsed as any).reason === "INVALID_JSON" || (parsed as any).reason === "UNBALANCED_DELIMITERS")) {
       EnrichmentMetrics.retry++;
       console.warn(`[RECOVERY] Parse failed (${(parsed as any).reason}): ${(parsed as any).error}. Triggering 1-time strict retry.`);
       const retryPrompt = mainPrompt + "\n\nCRITICAL INSTRUCTION: Return ONLY a single valid JSON object. Do not include markdown, explanations, code fences, comments, or any text before or after the JSON.";
       const retryRequest = generateContentWithRetry({
         model: modelName,
         contents: retryPrompt,
         config: {
           responseMimeType: "application/json",
           responseSchema: mainInfoSchemaConfig,
           maxOutputTokens: 4000,
         }
       });
       mainResponse = await retryRequest;
       parsed = parseAndExtract(mainResponse.text);
       logEnrichmentJsonPipeline(mainResponse.text, parsed, true);
       
       if (parsed.success) {
           EnrichmentMetrics.retry_success++;
       }
    }

    let data: any = parsed.success ? parsed.value : null;

    if (data) {
        // Validate schema
        if (!data.name || !data.type) {
            EnrichmentMetrics.schema_failure++;
            console.log(`[Enrichment] Metadata enrichment skipped. Reason: SCHEMA_INVALID`);
            data = null;
        } else {
            EnrichmentMetrics.accepted++;
        }
    }

    if (!data) {
        if (!parsed.success) {
            EnrichmentMetrics.rejected++;
            console.warn(`[Enrichment] STRICT RETRY FAILED (${(parsed as any).reason}): ${(parsed as any).error}`);
        }
        data = {
            name: "", // Prevent "Unknown Location" from overriding waypoint name
            type: "Point of Interest",
            description: "Information unavailable.",
            coordinates: { lat, lng },
            funFacts: [],
            notable: []
        };
    }

    if (data.coordinates) {
        data.coordinates = normalizeCoordinates(data.coordinates) || data.coordinates;
    }

    if (!data.coordinates || typeof data.coordinates.lat !== 'number') {
        data.coordinates = { lat, lng };
    }
    
    if (!data.description) data.description = "Detailed description unavailable.";
    if (!data.funFacts) data.funFacts = [];
    if (!data.notable) data.notable = [];
    if (!data.type) data.type = LocationType.POI;
    if (waypoint) {
        data.waypoint = waypoint;
    }
    return enrichLocationInfo(data as LocationInfo);

  } catch (error: any) {
    const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || (error?.error && error.error.code === 429);

    return sanitizeLocationInfo({
        name: isQuota ? "System Busy (Quota)" : "Connection Error",
        type: "Point of Interest" as LocationType,
        description: isQuota 
            ? "The knowledge engine is currently experiencing high request volume. Please wait a few moments and try again." 
            : "Could not retrieve information at this time.",
        coordinates: { lat, lng },
        funFacts: [],
        notable: []
    } as unknown as LocationInfo);
  }
};

// Schema for nearby places
const nearbyPlacesSchemaConfig = {
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
};

export const getNearbyPlaces = async (lat: number, lng: number, radius: number = 25, isFallback: boolean = false): Promise<MapMarker[]> => {
  try {
    const prompt = isFallback ? `
      I am looking at a globe at coordinates ${lat}, ${lng}. We are performing a broad fallback search because the initial search returned weak or empty results.
      Aggressively search within a wide ${radius}km radius to locate the most prominent, globally or regionally recognizable human-populated cities, major towns, famous historic districts, cultural landmarks, unesco world heritage sites, major museums, or renowned tourist destinations that are highly educational and worth learning about.
      If there are any well-known cities or landmarks (for example: Honolulu, Waikiki, Maui towns, or Pearl Harbor in Hawaii; or Miami, Orlando, Tampa, Jacksonville, Key West, and major parks if in/near Florida), you MUST include them!
      
      Allowed categories: "capital_city", "major_city", "world_landmark", "historical_site", "museum", "unesco_site", "cultural_site", "tourist_destination", "major_district", "national_park", "famous_mountain", "famous_lake", "preserve", "lake", "river", "mountain", "valley".
      
      CRITICAL INSTRUCTIONS:
      - STRICTLY FORBIDDEN: Do NOT return highways, road segments, raceways, route geometry, unnamed infrastructure, or generic paths under any circumstances.
      - Highly prioritize major human settlements, cities, famous historic sites, and world-class museums or landmarks.
      - DO NOT include unnamed valleys, small streams, generic state parks, or low-significance preserves.
      
      Assign a semantic type to each place matching one of the allowed categories.
      Return a strict JSON array.
      Do not repeat places. Stop after 8 places. Output ONLY the JSON payload.
    ` : `
      I am looking at a globe at coordinates ${lat}, ${lng}.
      Act as an editorial curator to discover 5-8 meaningful places in this region that a curious traveler would recognize or want to explore and learn about (cultural significance, historical relevance, architectural marvels, world landmarks, major cities, unesco heritage sites, or globally significant natural wonders).
      If the region is in or near Florida (lat ~24 to ~31, lng ~-80 to ~-87), you MUST prioritize major populated cities and destinations (such as Miami, Orlando, Tampa, Jacksonville, Key West) rather than generic terrain features or state parks.
      
      Allowed categories: "capital_city", "major_city", "world_landmark", "historical_site", "museum", "unesco_site", "cultural_site", "tourist_destination", "major_district", "national_park", "famous_mountain", "famous_lake", "preserve", "lake", "river", "mountain", "valley".
      
      CRITICAL INSTRUCTIONS:
      - STRICTLY FORBIDDEN: Do NOT return highways, road segments, raceways, unnamed infrastructure, or generic paths under any circumstances.
      - ONLY include highly significant, globally or regionally famous natural landmarks (e.g., Mount Fuji, Grand Canyon, Lake Tahoe, Yosemite).
      - DO NOT include generic rivers, unnamed lakes, generic state parks, or random preserves.
      - In heavily populated areas, human locations must heavily dominate.
      - In remote areas (like oceans, deserts, or rural Alaska), you may include more natural features if human locations do not exist.
      
      Assign a semantic type to each place matching one of the allowed categories.
      Return a strict JSON array.
      Do not repeat places. Stop after 8 places. Output ONLY the JSON payload.
    `;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: nearbyPlacesSchemaConfig,
        maxOutputTokens: 4000,
      }
    });

    const parsed = parseAndExtract(response.text);
    const data = parsed.success ? (parsed.value as any) : null;
    if (Array.isArray(data)) return data;
    if (data && data.places && Array.isArray(data.places)) return data.places;
    return [];

  } catch (error: any) {
    console.error("Error fetching nearby places:", error);
    return [];
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
          - Classify the routeType as one of: "fixed_path", "network", or "conceptual".
          - If the query describes distributed networks like the Silk Road, Roman roads, Viking trade routes, migration routes, or exploration networks, classify as "network".
          - If routeType is "network", routeConfidence.level cannot automatically default to "high" unless the specific traversal is well-supported.
      19. Schema: 
      {
        "title": "Name of Route or Event",
        "routeType": "fixed_path" | "network" | "conceptual",
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
    if (PIPELINE_DEBUG) {
        console.log(`[RAW AI JSON RESPONSE]:\n${response.text}`);
    }
    const result = parseAndExtract(response.text);
    
    if (!result.success) {
        console.error(
            `[Route Generation] JSON extraction failed: ${(result as any).reason}`,
            (result as any).error
        );
        // Implement 1-time strict retry for route generation
        console.warn(`[RECOVERY] Parse failed after deterministic repair. Triggering 1-time strict retry for Route Generation.`);
        const retryPrompt = prompt + "\n\nCRITICAL INSTRUCTION: Return ONLY a single valid JSON object. Do not include markdown, explanations, code fences, comments, or any text before or after the JSON.";
        const retryResponse = await generateContentWithRetry({
          model: modelName,
          contents: retryPrompt,
          config: {
            tools: tools,
            maxOutputTokens: 8192,
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
        intent: 'DISCOVERY_LOCATION',
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

export const recoverCoordinatesFromAi = async (rawQuery: string, intent: string, entity: string): Promise<{ lat: number, lng: number } | null> => {
  const promptText = `Provide only the precise real-world decimal latitude and longitude coordinates for: "${entity}" (extracted from query: "${rawQuery}", intent: ${intent}).
  Return a strictly valid JSON object exactly like this:
  {
    "lat": 12.345,
    "lng": 67.890
  }
  Output ONLY the JSON object.`;
  
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
    
    // Check both root and nested coordinates property
    let parsedCoords = normalizeCoordinates(data) || (data && normalizeCoordinates((data as any).coordinates));
    
    console.log("=== DEBUG: recoverCoordinatesFromAi ===");
    console.log("Prompt:", promptText);
    console.log("Raw Response:", response.text);
    console.log("parseAndExtract(data):", JSON.stringify(data));
    console.log("normalizeCoordinates(data):", JSON.stringify(parsedCoords));
    console.log("=======================================");
    
    if (parsedCoords) {
      valid = isValidCoordinates(parsedCoords);
    }
    
    return valid ? parsedCoords : null;
  } catch (err) {
    return null;
  }
};

export const recoverLocationMetadata = async (entityName: string, coordinates: GeoCoordinates): Promise<LocationInfo | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const prompt = `
      Provide encyclopedic information for the location named "${entityName}" located precisely at coordinates: ${coordinates.lat}, ${coordinates.lng}.
      Current Date: ${currentDate}
      
      Return a JSON object with:
      - name: The normalized, canonical name of the location (e.g. "Dallas, Texas"). DO NOT output lowercase names.
      - entityType: Choose ONE from: city, country, state, ocean, natural_feature, mountain, landmark, museum, historical_event_site, archaeological_site, discovery_site, shipwreck_site, artifact, battlefield, festival_site.
      - type: Continent, Country, State, City, Ocean, or Point of Interest.
      - description: Detailed Wikipedia-style encyclopedia entry about ${entityName} (approx 80 words).
      - population: Object containing 'current' and 'historical' population estimates. For historical events, always distinguish historical population from modern population.
      - climate: Object containing 'name' (e.g. "Oceanic climate"), 'description' (plain language summary), and 'koppenCode' (treat scientific classifications as supporting metadata, not primary).
      - contextNotes: Array of 3 string facts that provide meaningful historical or geographic context. Do not output generic trivia.
      - coordinates: The exact input coordinates {lat: ${coordinates.lat}, lng: ${coordinates.lng}}
      - relatedEntities: Array of entities that provide meaningful context about the location or event. Categorize by type (person, group, place, institution, artifact, event). Do not include generic associated concepts.
      
      Output strictly valid JSON matching this structure.
    `;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: mainInfoSchemaConfig,
        maxOutputTokens: 4000,
      }
    });

    console.log(`=== RECOVER METADATA RAW RESPONSE ===`);
    console.log(response.text);
    console.log(`====================================`);

    const parsed = parseAndExtract(response.text);
    let data = parsed.success ? (parsed.value as any) : null;
    
    if (Array.isArray(data) && data.length > 0) {
       data = data[0];
    }
    
    if (!data) return null;
    
    const finalData = data as LocationInfo;
    finalData.coordinates = coordinates;
    
    return finalData;
  } catch (e) {
    console.error("recoverLocationMetadata failed:", e);
    return null;
  }
};
