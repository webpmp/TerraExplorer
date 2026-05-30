
import { GoogleGenAI, Type } from "@google/genai";
import { LocationInfo, LocationType, SearchResult, MapMarker, NewsItem, Waypoint } from "../types";

// Ensure API key is available
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-ts-check' });

const modelName = "gemini-2.5-flash";

// Helper for exponential backoff retry
const generateContentWithRetry = async (params: any, retries = 3): Promise<any> => {
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

// Schema for the static/encyclopedic data
const mainInfoSchemaConfig = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING },
    coordinates: {
      type: Type.OBJECT,
      properties: {
        lat: { type: Type.NUMBER },
        lng: { type: Type.NUMBER },
      },
      required: ["lat", "lng"]
    },
    description: { type: Type.STRING },
    population: { type: Type.STRING },
    climate: { type: Type.STRING },
    funFacts: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    suggestedZoom: { type: Type.NUMBER },
    notable: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          significance: { type: Type.STRING },
          category: { type: Type.STRING }
        },
        required: ["name", "significance"]
      }
    }
  },
  required: ["name", "type", "coordinates", "description", "population", "climate", "funFacts", "notable"]
};

import { jsonrepair } from 'jsonrepair';

// Helper to cleanup JSON string before parsing
const cleanJsonString = (str: string): string => {
  if (!str) return "";
  let cleaned = str;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json/gi, '');
  cleaned = cleaned.replace(/```/g, '');
  
  // Remove literal ellipses "..." or unicode ellipses which models sometimes use to indicate truncation
  cleaned = cleaned.replace(/\.\.\./g, '');
  cleaned = cleaned.replace(/\u2026/g, '');
  
  return cleaned.trim();
};

// Helper to safely parse JSON that might be wrapped in markdown or truncated
const safeJsonParse = (text: string) => {
  if (!text) return null;

  // 1. Clean markdown first
  let cleaned = cleanJsonString(text);

  // 2. Suppress conversational refusals early if there are no brackets at all
  const lower = cleaned.toLowerCase().trim();
  if (lower.startsWith("i am") || lower.startsWith("sorry") || lower.startsWith("i cannot")) {
      return null;
  }

  // 3. Brute force extraction as fallback if the cleaned string has conversational text around it
  const firstOpenBrace = cleaned.indexOf('{');
  const firstOpenBracket = cleaned.indexOf('[');
  let jsonCandy = cleaned;

  if (firstOpenBrace !== -1 || firstOpenBracket !== -1) {
    let startIdx = -1;
    let endIdx = -1;

    if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
        startIdx = firstOpenBrace;
        endIdx = cleaned.lastIndexOf('}');
    } else {
        startIdx = firstOpenBracket;
        endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1) {
      if (endIdx !== -1 && endIdx > startIdx) {
        // If we found both, extract that portion
        jsonCandy = cleaned.substring(startIdx, endIdx + 1);
      } else {
        // If truncated, take everything from startIdx
        jsonCandy = cleaned.substring(startIdx);
      }
    }
  }

  // 4. Parse & Repair
  try {
    return JSON.parse(jsonCandy);
  } catch (e1: any) {
    try {
      // Use powerful jsonrepair module
      const repaired = jsonrepair(jsonCandy);
      return JSON.parse(repaired);
    } catch (e2: any) {
      // If the extracted candy failed, try repairing the entire cleaned text as an absolute last resort
      try {
        const repairedFull = jsonrepair(cleaned);
        return JSON.parse(repairedFull);
      } catch (e3: any) {
         console.error("JSON Parse failed for text:", text.substring(0, 100) + "...", "Errors:", e1.message, e2.message);
         return null;
      }
    }
  }
};

export const fetchLiveNews = async (query: string, exclude: string[] = []): Promise<NewsItem[]> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const count = exclude.length > 0 ? 5 : 3;
    const excludeList = exclude.slice(0, 10).map(s => `"${s.substring(0, 50)}..."`).join(', ');

    const prompt = `
      Current Date: ${currentDate}
      Task: Find ${count} distinct news articles related to: "${query}".
      
      Priority: 
      1. Live/Recent news (last 48 hours).
      2. If no breaking news is found, find interesting recent feature stories, travel updates, or cultural articles about this location from the last few months.
      3. If absolutely no stories exist, return an empty array [].
      
      ${exclude.length > 0 ? `IMPORTANT: The user has already seen stories with these headlines: [${excludeList}]. You MUST find DIFFERENT stories.` : ''}
      
      Instructions:
      1. Use the Google Search tool to find real articles. Search for "${query} news" or "${query} recent stories".
      2. Return a strict JSON array of objects.
      3. For 'url', use the actual link found in the search results. CRITICAL: Ensure the URL is valid, complete, and NOT truncated (do not end with '...'). If the URL is truncated in the source, try to find the full link or omit the article.
      4. **If the headline is in a foreign language, TRANSLATE it into English.**
      5. 'summary': A short, engaging 1-2 sentence summary of what the article is about.
      6. Output ONLY the JSON array.
      
      Format:
      [
        {
          "headline": "Headline text",
          "summary": "Short summary of the article.",
          "source": "News Source Name",
          "url": "Full URL to the article"
        }
      ]
    `;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 4000,
      }
    });

    const text = response.text;
    const data = safeJsonParse(text);

    let items: NewsItem[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && data.news && Array.isArray(data.news)) {
      items = data.news;
    }

    return items.map((n: any) => ({
      headline: n.headline || "News Update",
      summary: n.summary || "",
      source: n.source || "Unknown",
      url: n.url || ""
    })).filter(n => {
       if (!n.url) return false;
       if (n.url.length < 10) return false;
       if (n.url.includes('...')) return false; 
       if (!n.url.startsWith('http')) return false;
       return true;
    });

  } catch (error: any) {
    const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || (error?.error && error.error.code === 429);
    if (isQuota) {
        console.warn("Live news fetch skipped due to quota limits.");
        return [{
            headline: "News unavailable due to high traffic.",
            source: "System",
            url: "#",
            summary: "Please try again in a few moments."
        }];
    }
    console.error("Error fetching live news:", error);
    return [];
  }
};

export const resolveLocationQuery = async (query: string): Promise<SearchResult | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Pre-flight capability check: If API key is invalid or missing, fail immediately
    if (!apiKey || apiKey === 'dummy-key-for-ts-check') {
       console.log("[DEBUG] Failure reason code: LOCATION_SYSTEM_UNAVAILABLE");
       return { error: "LOCATION_SYSTEM_UNAVAILABLE" };
    }

    const mainPrompt = `
      You are an intelligent geographic knowledge engine and unified semantic entity resolver.
      Current Date: ${currentDate}
      User Query: "${query}"

      Your task is to resolve the user query (which might be a direct place lookup, a natural language query, a historical event query, or an exploratory/POI theme) into a specific geographic location or a highly relevant central event coordinate point.
      
      Instructions for different query types:
      1. Direct place lookup (e.g. "Dallas", "Tokyo", "Paris France"): Resolve to the exact city/state coordinates.
      2. Natural language / Historical events (e.g. "Great Fire of London", "assassination of Archduke Franz Ferdinand"): Identify the most relevant geographic location where the historical event took place (e.g., London / Pudding Lane coordinates lat 51.51, lng -0.08, or Sarajevo coordinates lat 43.85, lng 18.41) and explain the specific historical context in 'description'.
      3. Exploratory / mixed POI queries (e.g. "shipwrecks near Bermuda Triangle"): Identify the central coordinates of the region or historical theme, and explain the topic in 'description'.
      4. DO NOT fail for natural language, events, or POI queries if a location can be inferred. Instead, resolve to the most educational and historically accurate coordinates.

      Return a JSON object containing the location/event details.
      - 'suggestedZoom': 0-10 scale. 8-10 for specific landmarks/cities/events, 4-6 for countries/regions.
      - 'description': Explain specifically WHY this location/event answers their query, then provide historical/geographical context. Keep it under 100 words.
      - 'population': Recent population estimate or write "Historical/Event" if not applicable.
      - 'climate': Köppen climate classification or write "Varies" if not applicable.
      - 'funFacts': List 3 interesting facts about the location or historical event.
      - 'coordinates': Precise decimal lat/lng.
         - CRITICAL: If the query cannot be matched to any known place or historical event location at all, set coordinates to {"lat": 999, "lng": 999} and set name to "NOT_FOUND".
         - CRITICAL: If the query is too ambiguous or incomplete to resolve (e.g. multiple matches exist or input is unclear), set coordinates to {"lat": 998, "lng": 998} and set name to "AMBIGUOUS".
         - CRITICAL: If there is no geographic data available for this search, set coordinates to {"lat": 997, "lng": 997} and set name to "NO_GEOGRAPHIC_DATA".
      - 'notable': List 3 notable people associated with this place/event. For 'significance', provide a descriptive sentence (approx 100-120 chars).
      - 'type': Choose ONE from: Continent, Country, State, City, Ocean, Point of Interest.
      
      Output strictly valid JSON.
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
    const data = safeJsonParse(mainResponse.text);
    
    // Debug-only internal logging
    console.log("[DEBUG] Raw lookup query:", query);
    console.log("[DEBUG] Response payload:", mainResponse.text);
    console.log("[DEBUG] Parsed result:", data);

    if (!data) {
       console.log("[DEBUG] Failure reason code: DATA_PARSE_NULL");
       return { error: "UNABLE_TO_RESOLVE" };
    }

    if (data.coordinates) {
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
          return { error: "NO_GEOGRAPHIC_DATA" };
       }
    } else {
       console.log("[DEBUG] Failure reason code: MISSING_COORDINATES");
       return { error: "NO_GEOGRAPHIC_DATA" };
    }

    if (!data.coordinates || typeof data.coordinates.lat !== 'number') {
        console.warn("Resolved location missing valid coordinates");
    }
    
    // Fill defaults
    if (!data.description) data.description = "Detailed description unavailable.";
    if (!data.funFacts) data.funFacts = [];
    if (!data.notable) data.notable = [];
    if (!data.type) data.type = LocationType.POI;
    data.news = [];

    return {
      locationInfo: data,
      suggestedZoom: data.suggestedZoom || 5
    };

  } catch (error: any) {
    console.log("[DEBUG] Raw lookup query:", query);
    console.log("[DEBUG] Failure reason code: EXCEPTION_THROWN", error?.message || error);
    
    // Distinguish temporary failure (network issues/timeout/blocked request)
    const errMsg = error?.message?.toLowerCase() || "";
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("timeout") || errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("exhaust")) {
       return { error: "TEMP_FAILURE" };
    }
    return { error: "UNABLE_TO_RESOLVE" };
  }
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
      - population: Recent estimate (if applicable).
      - climate: Köppen climate classification.
      - funFacts: 3 interesting facts.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - notable: 3 notable people. For 'significance', provide a descriptive sentence.
      
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
    let data = safeJsonParse(mainResponse.text);

    if (!data) {
        data = {
            name: name,
            type: "Point of Interest",
            description: "Information unavailable.",
            coordinates: { lat, lng },
            funFacts: [],
            news: [],
            notable: []
        };
    }
    
    // Ensure the name returned is the one requested
    data.name = name;

    data.news = [];
    return data as LocationInfo;

  } catch (error: any) {
    console.error("Error resolving feature info:", error);
    return {
        name: name,
        type: LocationType.POI,
        description: error.message?.includes('429') || error.message?.includes('Quota') 
            ? "API Quota Exceeded. Please try again later."
            : "Could not retrieve information at this time.",
        coordinates: { lat, lng },
        funFacts: [],
        news: [],
        notable: []
    } as unknown as LocationInfo;
  }
};

export const getInfoFromCoordinates = async (lat: number, lng: number): Promise<LocationInfo | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const mainPrompt = `
      Identify the most significant human settlement or geographic feature at or extremely close to coordinates: ${lat}, ${lng}.
      Current Date: ${currentDate}
      
      Return a JSON object with:
      - name: Common name of the location
      - type: Continent, Country, State, City, Ocean, or Point of Interest.
      - description: Detailed Wikipedia-style encyclopedia entry (approx 80 words).
      - population: Recent estimate (if applicable).
      - climate: Köppen climate classification.
      - funFacts: 3 interesting facts.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - notable: 3 notable people. For 'significance', provide a descriptive sentence.
      
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
    let data = safeJsonParse(mainResponse.text);

    if (!data) {
        data = {
            name: "Unknown Location",
            type: "Point of Interest",
            description: "Information unavailable.",
            coordinates: { lat, lng },
            funFacts: [],
            news: [],
            notable: []
        };
    }

    if (!data.coordinates || typeof data.coordinates.lat !== 'number') {
        data.coordinates = { lat, lng };
    }
    
    if (!data.description) data.description = "Detailed description unavailable.";
    if (!data.funFacts) data.funFacts = [];
    if (!data.notable) data.notable = [];
    if (!data.type) data.type = LocationType.POI;
    data.news = [];

    return data;

  } catch (error: any) {
    const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || (error?.error && error.error.code === 429);

    return {
        name: isQuota ? "System Busy (Quota)" : "Connection Error",
        type: "Point of Interest" as LocationType,
        description: isQuota 
            ? "The knowledge engine is currently experiencing high request volume. Please wait a few moments and try again." 
            : "Could not retrieve information at this time.",
        coordinates: { lat, lng },
        funFacts: [],
        news: [],
        notable: []
    } as unknown as LocationInfo;
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
      If there are any well-known cities or landmarks (for example: Honolulu, Waikiki, Maui towns, or Pearl Harbor in Hawaii), you MUST include them!
      
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

    const data = safeJsonParse(response.text);
    if (Array.isArray(data)) return data;
    if (data && data.places && Array.isArray(data.places)) return data.places;
    return [];

  } catch (error: any) {
    console.error("Error fetching nearby places:", error);
    return [];
  }
};

export const getMoreNews = async (locationName: string, existingHeadlines: string[]): Promise<NewsItem[]> => {
    return fetchLiveNews(locationName, existingHeadlines);
}

export const generateRoute = async (text: string): Promise<Waypoint[]> => {
  try {
    const isUrl = text.startsWith('http');
    
    const prompt = `
      Task: Trace a geographical route from the text.
      ${isUrl ? `URL: "${text}". Trace locations mentioned in the page content.` : `Text: "${text}"`}

      Instructions:
      1. Identify a name for this route/expedition (e.g. "Lewis and Clark Expedition", "Magellan's Circumnavigation", "The Silk Road"). If no specific name exists, create a short descriptive title.
      2. Extract every significant physical location (City, Country, Landmark) in narrative order.
      3. Use HIGH PRECISION coordinates (at least 4 decimal places) to ensure locations (like coastal cities) are mapped accurately on land, not in the ocean.
      4. If vague, use nearest major city but prioritize accurate coordinates.
      5. Schema: 
      {
        "title": "Name of Route",
        "route": [
          {"name": "Location Name", "lat": 0.0000, "lng": 0.0000, "context": "Very brief reason (max 10 words)"}
        ]
      }
      6. Remove consecutive duplicates.
      7. Output a strict JSON Object.
    `;
    
    const tools = isUrl ? [{ googleSearch: {} }] : undefined;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        tools: tools,
        maxOutputTokens: 8192,
      }
    });
    
    const data = safeJsonParse(response.text);
    
    let items: any[] = [];
    let title: string | undefined = undefined;

    // Robust parsing for different possible JSON structures
    if (data && typeof data === 'object') {
        if (data.title) title = data.title;
        
        if (data.route && Array.isArray(data.route)) items = data.route;
        else if (data.locations && Array.isArray(data.locations)) items = data.locations;
        else if (data.waypoints && Array.isArray(data.waypoints)) items = data.waypoints;
        else if (Array.isArray(data)) items = data; // Fallback if just an array in root
    } else if (Array.isArray(data)) {
        items = data;
    }

    return items.map((item, i) => ({
      id: `wp-${i}-${Date.now()}`,
      name: item.name || "Unknown Waypoint",
      lat: item.lat || 0,
      lng: item.lng || 0,
      context: item.context || "",
      routeTitle: title // Include title in Waypoint
    })).filter(w => w.lat !== 0 || w.lng !== 0);

  } catch (error) {
    console.error("Error generating route:", error);
    return [];
  }
};

export type QueryIntent = 'DIRECT' | 'NATURAL_LOCATION' | 'EXPLORATORY';

export interface ExtractedQuery {
  intent: QueryIntent;
  entity: string;
}

export const routeIntentAndExtractEntity = (query: string): ExtractedQuery => {
  const clean = query.trim();
  
  // 1. Check for Exploratory / mixed knowledge patterns
  const exploratoryPatterns = [
    /\bnear\b/i,
    /\baround\b/i,
    /\bshipwrecks\b/i,
    /\bplaces\s+in\b/i,
    /\bhistory\s+of\b/i,
    /\bimportant\s+places\b/i,
    /\bevents\s+of\b/i,
    /\bbattles\s+of\b/i,
  ];
  
  for (const pattern of exploratoryPatterns) {
    if (pattern.test(clean)) {
      return { intent: 'EXPLORATORY', entity: clean };
    }
  }

  // 2. Check for Natural language location queries
  const nlPatterns = [
    /^\s*where\s+did\s+(.+?)\s+take\s+place\s*\??\s*$/i,
    /^\s*where\s+did\s+(.+?)\s+happen\s*\??\s*$/i,
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
      return { 
        intent: 'NATURAL_LOCATION', 
        entity: match[1].replace(/[?.,!]+$/, "").trim() 
      };
    }
  }

  // 3. Fallback to Direct lookup
  return { intent: 'DIRECT', entity: clean };
};

export const extractEntityFromQuery = (query: string): string => {
  const extracted = routeIntentAndExtractEntity(query);
  return extracted.entity;
};
