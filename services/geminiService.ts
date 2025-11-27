
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
      (error?.error && error.error.code === 429);

    if (isQuotaError && retries > 0) {
      const delayMs = 2000 * (4 - retries); // 2000ms, 4000ms, 6000ms
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
      }
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
        }
      }
    }
  }
};

// Helper to cleanup JSON string before parsing
const cleanJsonString = (str: string): string => {
  if (!str) return "";
  // Remove markdown code blocks if they are wrapping the whole string
  let cleaned = str.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
  
  // Remove trailing commas before closing braces/brackets (common model error)
  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  
  return cleaned;
};

// Helper to attempt repairing truncated JSON
const repairTruncatedJson = (jsonStr: string): string => {
  let fixed = jsonStr.trim();
  
  // If it's completely empty, nothing to do
  if (!fixed) return "{}";

  // Remove potential trailing comma
  fixed = fixed.replace(/,\s*$/, '');
  
  // Check if we are inside a string (odd number of non-escaped quotes)
  // This is a naive check but works for most simple JSON interruptions
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

  // Append missing closing tokens in correct order (naive assumption: just close them all)
  // Usually prompt output is roughly balanced so we just need to close the stack.
  
  for (let i = 0; i < (openBrackets - closeBrackets); i++) fixed += ']';
  for (let i = 0; i < (openBraces - closeBraces); i++) fixed += '}';
  
  return fixed;
};

// Helper to safely parse JSON that might be wrapped in markdown or truncated
const safeJsonParse = (text: string) => {
  if (!text) return null;
  const cleaned = cleanJsonString(text);

  // 1. Try parsing directly
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue
  }

  // 2. Try extracting from markdown code blocks using regex
  const match = text.match(/```(?:json)?([\s\S]*?)```/);
  if (match) {
    try {
      const innerCleaned = cleanJsonString(match[1]);
      return JSON.parse(innerCleaned);
    } catch (e2) {
       // Try repairing the inner content
       try {
         return JSON.parse(repairTruncatedJson(cleanJsonString(match[1])));
       } catch (e2b) {
         // Continue
       }
    }
  }

  // 3. Try repairing the main string
  try {
    const repaired = repairTruncatedJson(cleaned);
    return JSON.parse(repaired);
  } catch (e3) {
    // Continue
  }

  // 4. Brute force: find the first '{' or '[' and the last '}' or ']'
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
    } catch (e4) {
       // Try repairing this substring
       try {
         return JSON.parse(repairTruncatedJson(cleanJsonString(jsonStr)));
       } catch (e4b) {
         // Fail silently
       }
    }
  }
  
  // 5. Heuristic: If text is a conversational refusal, explanation, or just doesn't look like JSON, suppress error.
  const lower = text.toLowerCase().trim();
  if (
      startIdx === -1 || // No braces/brackets found at all
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
const fetchLiveNews = async (query: string, exclude: string[] = []): Promise<NewsItem[]> => {
  try {
    const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    // If we are asking for more news (exclude list exists), ask for more items to ensure we get unique ones
    const count = exclude.length > 0 ? 5 : 3;
    
    // Sanitize exclude list to avoid massive prompts
    const excludeList = exclude.slice(0, 10).map(s => `"${s.substring(0, 50)}..."`).join(', ');

    const prompt = `
      Current Date: ${currentDate}
      Task: Find ${count} distinct news headlines related to: "${query}".
      
      Priority: 
      1. Live/Recent news (last 48 hours).
      2. If no recent news is found, find relevant stories from the last month.
      3. If no stories exist at all, return an empty array [].
      
      ${exclude.length > 0 ? `IMPORTANT: The user has already seen stories with these headlines: [${excludeList}]. You MUST find DIFFERENT stories or different angles.` : ''}
      
      Instructions:
      1. Use the Google Search tool to find real, live articles. Search for "${query} news".
      2. Return a strict JSON array of objects.
      3. For 'url', use the actual link found in the search results.
      4. Ensure all string values are properly escaped.
      5. Do NOT use trailing commas.
      6. IF NO NEWS IS FOUND, OR IF THE SEARCH FAILS, return exactly: [].
      7. DO NOT provide explanations, apologies, or conversational text.
      
      Format:
      [
        {
          "headline": "Headline text",
          "source": "News Source Name",
          "url": "Full URL to the article"
        }
      ]
      
      Do not use markdown. Just the raw JSON array.
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
      source: n.source || "Unknown",
      url: n.url || ""
    }));

  } catch (error) {
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
      5. 'coordinates': Precise decimal lat/lng.
      6. 'notable': List 3 notable people associated with this place.
      7. 'type': Choose ONE from: Continent, Country, State, City, Ocean, Point of Interest. Do not use random numbers.
      8. Do NOT include any conversational text or markdown. Output ONLY valid JSON.
      
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

    const newsItems = await fetchLiveNews(data.name);
    data.news = newsItems;

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
      - notable: 3 notable people.
      
      Strictly conform to JSON syntax. Do not hallucinate repeating strings of numbers.
      Do not include any text outside the JSON object.
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

    // Step 2: Fetch Live News
    if (data.name && data.name !== "Unknown Location") {
        const newsItems = await fetchLiveNews(data.name);
        data.news = newsItems;
    } else {
        data.news = [];
    }

    return data;

  } catch (error: any) {
    console.error("Error getting info:", error);
    
    // Enhance error feedback for quota issues if retries failed
    const isQuota = 
        error?.message?.includes('429') || 
        error?.message?.includes('Quota') || 
        error?.toString().includes('429') ||
        error?.toString().includes('RESOURCE_EXHAUSTED');

    // Return a safe fallback object to prevent UI crashes
    return {
        name: isQuota ? "High Traffic System" : "Connection Error",
        type: "Error",
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
      
      Return a strict JSON array of objects with this schema:
      {
        "id": "unique-string",
        "name": "City Name",
        "lat": number,
        "lng": number,
        "populationClass": "large" | "medium" | "small"
      }

      Do not wrap in markdown. No extra whitespace. Just the raw JSON array.
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

  } catch (error) {
    console.error("Error fetching nearby places:", error);
    return [];
  }
};

export const getMoreNews = async (locationName: string, existingHeadlines: string[]): Promise<NewsItem[]> => {
    return fetchLiveNews(locationName, existingHeadlines);
}
