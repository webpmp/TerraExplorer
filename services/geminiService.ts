
import { GoogleGenAI, Type } from "@google/genai";
import { LocationInfo, LocationType, SearchResult, MapMarker, NewsItem } from "../types";

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

// Schema for the static/encyclopedic data (News is fetched separately via Search tool)
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
  
  // Aggressively remove markdown code blocks markers anywhere in the string
  // This helps if the model puts text before the block and we extracted the whole thing
  cleaned = cleaned.replace(/```json/gi, '');
  cleaned = cleaned.replace(/```/g, '');
  
  // Remove literal ellipses "..." which models sometimes use to indicate "more items"
  // This causes invalid JSON.
  cleaned = cleaned.replace(/\.\.\./g, '');
  
  // Remove trailing commas before closing braces/brackets (common model error)
  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  
  return cleaned.trim();
};

// Helper to attempt repairing truncated JSON
const repairTruncatedJson = (jsonStr: string): string => {
  let fixed = jsonStr.trim();
  
  // If it's completely empty, nothing to do
  if (!fixed) return "{}";

  // Remove potential trailing comma
  fixed = fixed.replace(/,\s*$/, '');
  
  // Check if we are inside a string (odd number of non-escaped quotes)
  const quoteCount = (fixed.match(/"/g) || []).length - (fixed.match(/\\"/g) || []).length;
  if (quoteCount % 2 !== 0) {
      // Close the string
      fixed += '"';
  }

  // Count braces/brackets
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;

  // Append missing closing tokens. 
  // Heuristic: Close objects '}' before arrays ']' because usually we are deeper in an object.
  for (let i = 0; i < (openBraces - closeBraces); i++) fixed += '}';
  for (let i = 0; i < (openBrackets - closeBrackets); i++) fixed += ']';
  
  return fixed;
};

// Helper to safely parse JSON that might be wrapped in markdown or truncated
const safeJsonParse = (text: string) => {
  if (!text) return null;

  // 1. Try extracting from markdown code blocks using regex first (most reliable if present)
  // We use [\s\S]*? to match across newlines
  const markdownMatch = text.match(/```(?:json)?([\s\S]*?)```/);
  if (markdownMatch) {
    try {
      const innerCleaned = cleanJsonString(markdownMatch[1]);
      return JSON.parse(innerCleaned);
    } catch (e) {
       // Try repairing the inner content
       try {
         return JSON.parse(repairTruncatedJson(cleanJsonString(markdownMatch[1])));
       } catch (e2) {
         // Continue to other methods
       }
    }
  }

  // 2. Brute force: find the first '{' or '[' and the last '}' or ']'
  // This handles cases where there is conversational text BEFORE the JSON but no markdown blocks
  const firstOpenBrace = text.indexOf('{');
  const firstOpenBracket = text.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  // Determine if we are looking for an object or an array based on which comes first
  if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
      startIdx = firstOpenBrace;
      endIdx = text.lastIndexOf('}');
  } else if (firstOpenBracket !== -1) {
      startIdx = firstOpenBracket;
      endIdx = text.lastIndexOf(']');
  }
  
  if (startIdx !== -1) {
    // If endIdx is missing or before start (truncation), try to use the end of string
    const actualEndIdx = (endIdx !== -1 && endIdx > startIdx) ? endIdx + 1 : text.length;
    const jsonStr = text.substring(startIdx, actualEndIdx);
    
    try {
      return JSON.parse(cleanJsonString(jsonStr));
    } catch (e) {
       // Try repairing this substring
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
    // Continue
  }

  // 4. Heuristic: If text is a conversational refusal, suppress error.
  const lower = text.toLowerCase().trim();
  if (
      lower.startsWith("i am") || 
      lower.startsWith("i cannot") || 
      lower.startsWith("sorry") || 
      lower.startsWith("unfortunately") || 
      lower.startsWith("the search") ||
      lower.startsWith("here is") ||
      lower.startsWith("no news") ||
      lower.startsWith("please")
  ) {
      return null;
  }
  
  console.error("JSON Parse failed for text:", text.substring(0, 100) + "...");
  return null;
};

// Separate function to fetch news using Google Search Grounding
export const fetchLiveNews = async (query: string, exclude: string[] = []): Promise<NewsItem[]> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    // If we are asking for more news (exclude list exists), ask for more items to ensure we get unique ones
    const count = exclude.length > 0 ? 5 : 3;
    
    // Sanitize exclude list to avoid massive prompts
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
      3. For 'url', use the actual link found in the search results.
      4. **If the headline is in a foreign language, TRANSLATE it into English.**
      5. 'summary': A short, engaging 1-2 sentence summary of what the article is about.
      6. Ensure all string values are properly escaped.
      7. Output ONLY the JSON array.
      
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
        // responseMimeType cannot be used with googleSearch
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
    }));

  } catch (error: any) {
    // Gracefully handle quota errors for news specifically, as it's secondary content
    const isQuota = 
        error?.message?.includes('429') || 
        error?.message?.includes('Quota') || 
        error?.toString().includes('429') ||
        error?.toString().includes('RESOURCE_EXHAUSTED') ||
        (error?.error && error.error.code === 429) ||
        (error?.error && error.error.status === 'RESOURCE_EXHAUSTED');
    
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
      11. CRITICAL: Do NOT include any conversational text, pleasantries, or markdown. Output ONLY valid JSON.
      
      Output strictly valid JSON. Escape all double quotes.
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
    const mainText = mainResponse.text;
    if (!mainText) return null;

    const data = safeJsonParse(mainText);
    if (!data) return null;

    // Validate coordinates exist
    if (!data.coordinates || typeof data.coordinates.lat !== 'number' || typeof data.coordinates.lng !== 'number') {
        console.warn("Resolved location missing valid coordinates");
    }

    // Default values if missing
    if (!data.description) data.description = "Detailed description unavailable for this location.";
    if (!data.funFacts) data.funFacts = [];
    if (!data.notable) data.notable = [];
    if (!data.type) data.type = LocationType.POI;

    // Decoupled: Return data without news first for progressive loading
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
      - type: Continent, Country, State, City, Ocean, or Point of Interest. (Exact string, no numbers).
      - description: Detailed Wikipedia-style encyclopedia entry (approx 80 words).
      - population: Recent estimate (if applicable).
      - climate: Köppen climate classification.
      - funFacts: 3 interesting facts.
      - coordinates: The exact input coordinates {lat: ${lat}, lng: ${lng}}
      - notable: 3 notable people. For 'significance', provide a descriptive sentence (approx 100-120 chars).
      
      CRITICAL: Strictly conform to JSON syntax. Do not hallucinate repeating strings of numbers.
      Do NOT include any conversational text (e.g. "Here is the JSON"). Output ONLY the JSON object.
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
    const mainText = mainResponse.text;
    
    let data = null;
    if (mainText) {
      data = safeJsonParse(mainText);
    }

    if (!data) {
        // Fallback structure if parsing failed completely
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

    // CRITICAL FIX: Ensure coordinates are present even if model hallucinated or omitted them
    if (!data.coordinates || typeof data.coordinates.lat !== 'number') {
        data.coordinates = { lat, lng };
    }
    
    // Ensure text fields are populated
    if (!data.description) data.description = "Detailed description unavailable for this location.";
    if (!data.funFacts) data.funFacts = [];
    if (!data.notable) data.notable = [];
    if (!data.type) data.type = LocationType.POI;

    // Decoupled: Return data without news first for progressive loading
    data.news = [];

    return data;

  } catch (error: any) {
    console.error("Error getting info:", error);
    
    // Enhance error feedback for quota issues if retries failed
    const isQuota = 
        error?.message?.includes('429') || 
        error?.message?.includes('Quota') || 
        error?.toString().includes('429') ||
        error?.toString().includes('RESOURCE_EXHAUSTED') ||
        (error?.error && error.error.code === 429) ||
        (error?.error && error.error.status === 'RESOURCE_EXHAUSTED');

    // Return a safe fallback object to prevent UI crashes
    return {
        name: isQuota ? "System Busy (Quota)" : "Connection Error",
        type: "Point of Interest" as LocationType,
        description: isQuota 
            ? "The knowledge engine is currently experiencing high request volume (Quota Exceeded). Please wait a few moments and try scanning another location." 
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
      Identify 5-8 major cities, landmarks, or significant places within a 500km radius of this point.
      
      Important:
      - If the area is remote (e.g. desert, ocean, tundra), return the single nearest geographic feature or settlement, or the region name itself as a result.
      - Ensure at least one result is returned if possible.

      Return a strict JSON array of objects with this schema:
      {
        "id": "unique-string",
        "name": "Place Name",
        "lat": number,
        "lng": number,
        "populationClass": "large" | "medium" | "small"
      }

      CRITICAL: Do not wrap in markdown. No extra whitespace. Just the raw JSON array.
    `;

    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 4000,
      }
    });

    const text = response.text;
    if (!text) return [];

    const data = safeJsonParse(text);
    if (Array.isArray(data)) {
      return data;
    }
    // Handle case where AI wraps array in an object key
    if (data && data.places && Array.isArray(data.places)) return data.places;
    if (data && data.markers && Array.isArray(data.markers)) return data.markers;

    return [];

  } catch (error: any) {
    // Quota errors are expected for secondary calls, suppress robustly
    const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || (error?.error && error.error.code === 429);
    if (isQuota) {
        console.warn("Skipping nearby places fetch due to quota.");
        return [];
    }
    console.error("Error fetching nearby places:", error);
    return [];
  }
};

export const getMoreNews = async (locationName: string, existingHeadlines: string[]): Promise<NewsItem[]> => {
    return fetchLiveNews(locationName, existingHeadlines);
}
