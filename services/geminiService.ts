
import { GoogleGenAI, Type } from "@google/genai";
import { LocationInfo, LocationType, SearchResult, MapMarker, NewsItem, Waypoint, isValidCoordinates } from "../types";

// Ensure API key is available
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-ts-check' });

const modelName = "gemini-2.5-flash";

const getUserSettings = (): any => {
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
    lmStudioModel: 'local-model',
    newsProvider: 'gemini',
    newsApiKey: ''
  };
};

// Helper for exponential backoff retry
const generateContentWithRetry = async (params: any, retries = 3): Promise<any> => {
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

// Schema for the static/encyclopedic data
const mainInfoSchemaConfig = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING },
    entityType: { type: Type.STRING },
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

const fetchCustomNews = async (query: string, exclude: string[], settings: any): Promise<NewsItem[]> => {
  try {
    let items: NewsItem[] = [];
    const encodedQuery = encodeURIComponent(query);
    
    if (settings.newsProvider === 'newsapi') {
      const res = await fetch(`https://newsapi.org/v2/everything?q=${encodedQuery}&sortBy=publishedAt&language=en&apiKey=${settings.newsApiKey}`);
      const data = await res.json();
      if (data.articles) {
        items = data.articles.map((a: any) => ({
          headline: a.title,
          summary: a.description || "",
          source: a.source?.name || "NewsAPI",
          url: a.url
        }));
      }
    } else if (settings.newsProvider === 'newsdata') {
      const res = await fetch(`https://newsdata.io/api/1/news?apikey=${settings.newsApiKey}&q=${encodedQuery}&language=en`);
      const data = await res.json();
      if (data.results) {
        items = data.results.map((a: any) => ({
          headline: a.title,
          summary: a.description || "",
          source: a.source_id || "NewsData",
          url: a.link
        }));
      }
    } else if (settings.newsProvider === 'nyt') {
      const res = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodedQuery}&api-key=${settings.newsApiKey}`);
      const data = await res.json();
      if (data.response?.docs) {
        items = data.response.docs.map((a: any) => ({
          headline: a.headline?.main || "NYT Article",
          summary: a.abstract || a.snippet || "",
          source: "The New York Times",
          url: a.web_url
        }));
      }
    }

    // Filter out excluded headlines
    if (exclude && exclude.length > 0) {
      items = items.filter(item => {
         const headlineNorm = (item.headline || "").toLowerCase();
         return !exclude.some(ex => headlineNorm.includes(ex.toLowerCase()));
      });
    }

    // Take top 5
    return items.slice(0, 5).filter(n => {
       if (!n.url) return false;
       if (n.url.length < 10) return false;
       if (!n.url.startsWith('http')) return false;
       return true;
    });

  } catch (error) {
    console.error("Custom News API fetch failed", error);
    return [];
  }
};


export const fetchLiveNews = async (query: string, exclude: string[] = []): Promise<NewsItem[]> => {
  const settings = getUserSettings();
  if (settings.newsProvider !== 'gemini' && settings.newsApiKey) {
    return fetchCustomNews(query, exclude, settings);
  }

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

  "mount fuji": { name: "Mount Fuji", type: LocationType.POI, entityType: "mountain", lat: 35.3606, lng: 138.7274, suggestedZoom: 8, climate: "Tundra (ET) / Alpine" },
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

export const resolveLocationQuery = async (query: string, intent?: QueryIntent): Promise<SearchResult | null> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const settings = getUserSettings();
    const activeProvider = settings.aiProvider || 'gemini';

    // Step 1: Model-independent location normalization
    const normalizedQuery = normalizeLocationEntity(query);
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
        notable: [],
        news: []
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
        Input geographic query: "${targetSearchTerm}" (Raw query: "${query}")
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
        - 'suggestedZoom': 0-10 scale. 8-10 for specific sites/cities, 4-6 for regions.
        - 'description': Detailed summary (approx 80 words).
        - 'population': Population estimate for cities/countries; write "N/A" or null if not applicable.
        - 'climate': Köppen climate classification for places/natural features; write "Varies" or null for event/discovery sites.
        - 'funFacts': List 3 interesting facts.
        - 'coordinates': Precise decimal lat/lng.
        - 'notable': Array of 3 objects with 'name' and 'significance'.

        Output strictly valid JSON.
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
      let data = safeJsonParse(rawAiText);

      if (Array.isArray(data) && data.length > 0) {
        data = data[0];
      }

      if (!data) {
         console.log("[DEBUG] Failure reason code: DATA_PARSE_NULL");
         return { error: "UNABLE_TO_RESOLVE", locationInfo: { name: targetSearchTerm } };
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

    // Step 5: Fill defaults & sanitize metadata
    if (!resolvedData.description) resolvedData.description = "Detailed description unavailable.";
    if (!resolvedData.funFacts) resolvedData.funFacts = [];
    if (!resolvedData.notable) resolvedData.notable = [];
    if (!resolvedData.type) resolvedData.type = LocationType.POI;
    resolvedData.news = [];

    const finalLocationInfo = sanitizeLocationInfo(resolvedData);

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

  if (!isPopulationAllowed || isHiddenEntityType) {
    data.population = null as any;
  }

  if ((!isClimateAllowed && !isGeographicFeatureName) || isHiddenEntityType) {
    data.climate = null as any;
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
      - population: Recent estimate (if applicable).
      - climate: Köppen climate classification.
      - funFacts: 3 interesting facts.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - 'notable': Array of 3 objects, each with 'name' (person's name) and 'significance' (descriptive sentence).
      
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
    return sanitizeLocationInfo(data as LocationInfo);

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
        news: [],
        notable: []
    } as unknown as LocationInfo);
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
      - 'notable': Array of 3 objects, each with 'name' (person's name) and 'significance' (descriptive sentence).
      
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

    return sanitizeLocationInfo(data);

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
        news: [],
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
  const settings = getUserSettings();
  if (settings.newsProvider !== 'gemini' && settings.newsApiKey) {
    return fetchCustomNews(locationName, existingHeadlines, settings);
  }

  try { return fetchLiveNews(locationName, existingHeadlines); } catch (e) { return []; }
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

export type QueryIntent = 'DIRECT' | 'NATURAL_LOCATION' | 'EXPLORATORY' | 'HISTORICAL_EVENT' | 'DISCOVERY_LOCATION';

export interface ExtractedQuery {
  intent: QueryIntent;
  entity: string;
}

export const routeIntentAndExtractEntity = (query: string): ExtractedQuery => {
  const clean = query.trim();
  
  // 1. Check for Discovery / Recovery patterns first
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
      return {
        intent: 'HISTORICAL_EVENT',
        entity: cleanedEntity || entityStr
      };
    }
  }

  // 3. Check for Exploratory / mixed knowledge patterns
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

export const recoverCoordinatesFromAi = async (entity: string): Promise<{ lat: number, lng: number } | null> => {
  const promptText = `Provide only the precise real-world decimal latitude and longitude coordinates for: "${entity}".`;
  
  try {
    const response = await generateContentWithRetry({
      model: modelName,
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            lat: { type: "NUMBER" },
            lng: { type: "NUMBER" }
          },
          required: ["lat", "lng"]
        },
        maxOutputTokens: 200, 
      }
    });

    const data = safeJsonParse(response.text);
    let valid = false;
    let coords = null;

    if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
      coords = { lat: data.lat, lng: data.lng };
      valid = isValidCoordinates(coords);
    }
    
    return valid ? coords : null;
  } catch (err) {
    return null;
  }
};
