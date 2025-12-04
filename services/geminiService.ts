
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
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
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

// Helper to cleanup JSON string before parsing
const cleanJsonString = (str: string): string => {
  if (!str) return "";
  let cleaned = str;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json/gi, '');
  cleaned = cleaned.replace(/```/g, '');
  
  // Remove literal ellipses "..." or unicode ellipses which models sometimes use to indicate truncation
  cleaned = cleaned.replace(/\.\.\./g, '');
  cleaned = cleaned.replace(/\u2026/g, ''); // Use unicode escape for ellipsis
  
  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  
  return cleaned.trim();
};

// Helper to attempt repairing truncated JSON
const repairTruncatedJson = (jsonStr: string): string => {
  let fixed = jsonStr.trim();
  if (!fixed) return "{}";

  // 1. Handle unclosed strings
  // Count double quotes that are NOT escaped
  let inString = false;
  let isEscaped = false;
  
  for (let i = 0; i < fixed.length; i++) {
      if (fixed[i] === '\\') {
          isEscaped = !isEscaped;
      } else {
          if (fixed[i] === '"' && !isEscaped) {
              inString = !inString;
          }
          isEscaped = false;
      }
  }

  // If we ended inside a string, close it
  if (inString) {
      fixed += '"';
  }

  // 2. Handle missing closing braces/brackets
  // We strip strings temporarily to count structural braces accurately
  const stripped = fixed.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '""');
  
  const openBraces = (stripped.match(/{/g) || []).length;
  const closeBraces = (stripped.match(/}/g) || []).length;
  const openBrackets = (stripped.match(/\[/g) || []).length;
  const closeBrackets = (stripped.match(/\]/g) || []).length;

  // Append missing closing tokens. 
  // Order matters: usually we are deep inside objects, so close } then ]
  for (let i = 0; i < (openBraces - closeBraces); i++) fixed += '}';
  for (let i = 0; i < (openBrackets - closeBrackets); i++) fixed += ']';
  
  return fixed;
};

// Helper to safely parse JSON that might be wrapped in markdown or truncated
const safeJsonParse = (text: string) => {
  if (!text) return null;

  // 1. Try extracting from markdown code blocks first
  const markdownMatch = text.match(/```(?:json)?([\s\S]*?)```/);
  if (markdownMatch) {
    try {
      const innerCleaned = cleanJsonString(markdownMatch[1]);
      return JSON.parse(innerCleaned);
    } catch (e) {
       try {
         return JSON.parse(repairTruncatedJson(cleanJsonString(markdownMatch[1])));
       } catch (e2) {
         // Continue
       }
    }
  }

  // 2. Brute force: find the first '{' or '['
  const firstOpenBrace = text.indexOf('{');
  const firstOpenBracket = text.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
      startIdx = firstOpenBrace;
      // Use lastIndexOf, but if it's broken, we might take the whole string
      endIdx = text.lastIndexOf('}');
  } else if (firstOpenBracket !== -1) {
      startIdx = firstOpenBracket;
      endIdx = text.lastIndexOf(']');
  }
  
  if (startIdx !== -1) {
    // If endIdx is missing (truncation) or before start, take to end of text
    const actualEndIdx = (endIdx !== -1 && endIdx > startIdx) ? endIdx + 1 : text.length;
    const jsonStr = text.substring(startIdx, actualEndIdx);
    
    try {
      return JSON.parse(cleanJsonString(jsonStr));
    } catch (e) {
       try {
         return JSON.parse(repairTruncatedJson(cleanJsonString(jsonStr)));
       } catch (e2) {
         // Fail silently
       }
    }
  }

  // 3. Last resort: Try parsing the whole cleaned string
  const cleaned = cleanJsonString(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
      // One final attempt at repair on the whole string
      try {
        return JSON.parse(repairTruncatedJson(cleaned));
      } catch (e2) {
        // Ignore
      }
  }

  // 4. Suppress conversational refusals
  const lower = text.toLowerCase().trim();
  if (lower.startsWith("i am") || lower.startsWith("sorry") || lower.startsWith("i cannot")) {
      return null;
  }
  
  console.error("JSON Parse failed for text:", text.substring(0, 100) + "...");
  return null;
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
    
    const mainPrompt = `
      You are an intelligent geographic knowledge engine.
      Current Date: ${currentDate}
      User Query: "${query}"

      Instructions:
      1. Analyze the query. Identify the specific geographic location.
      2. Return a JSON object containing the location details.
      3. 'suggestedZoom': 0-10 scale. 8-10 for specific landmarks/cities, 4-6 for countries.
      4. 'description': Explain specifically WHY this location answers their question, then provide context. Keep it under 100 words.
      5. 'population': Recent population estimate (e.g. "8.4 million").
      6. 'climate': Köppen climate classification (e.g. "Tropical Rainforest").
      7. 'funFacts': List 3 interesting facts about the location.
      8. 'coordinates': Precise decimal lat/lng.
      9. 'notable': List 3 notable people associated with this place. For 'significance', provide a descriptive sentence (approx 100-120 chars).
      10. 'type': Choose ONE from: Continent, Country, State, City, Ocean, Point of Interest. Do not use random numbers.
      
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
    if (!data) return null;

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

  } catch (error) {
    console.error("Error resolving location:", error);
    return null;
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

export const getNearbyPlaces = async (lat: number, lng: number): Promise<MapMarker[]> => {
  try {
    const prompt = `
      I am looking at a globe at coordinates ${lat}, ${lng}.
      Identify 5-8 major cities, landmarks, or significant places within a 500km radius.
      Return a strict JSON array: [{"id": "uuid", "name": "Name", "lat": 0.0, "lng": 0.0, "populationClass": "medium"}]
    `;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2000,
      }
    });

    const data = safeJsonParse(response.text);
    if (Array.isArray(data)) return data;
    if (data && data.places && Array.isArray(data.places)) return data.places;
    return [];

  } catch (error: any) {
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
