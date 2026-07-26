import { NewsItem } from '../../types';
import { generateContentWithRetry, modelName } from '../geminiService';
import { parseAndExtract } from '../../utils/jsonParser';

export const fetchGeminiGroundedNews = async (locationName: string): Promise<NewsItem[]> => {
  const currentDate = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
  const count = 3;

  const prompt = `
    Current Date: ${currentDate}
    Task: Find ${count} distinct news articles related to: "${locationName}".
    
    Priority: 
    1. Live/Recent news (last 48 hours).
    2. If no breaking news is found, find interesting recent feature stories, travel updates, or cultural articles about this location from the last few months.
    3. If absolutely no stories exist, return an empty array [].
    
    Instructions:
    1. Use the Google Search tool to find real articles. Search for "${locationName} news" or "${locationName} recent stories".
    2. Return a strict JSON array of objects.
    3. For 'url', use the actual link found in the search results. CRITICAL: Ensure the URL is valid, complete, and NOT truncated (do not end with '...'). If the URL is truncated in the source, try to find the full link or omit the article.
    4. **If the headline is in a foreign language, TRANSLATE it into English.**
    5. 'summary': A short, engaging 1-2 sentence summary of what the article is about.
    6. Output ONLY the JSON array.
    
    Format:
    [
      {
        "title": "Headline text",
        "summary": "Short summary of the article.",
        "source": "News Source Name",
        "url": "Full URL to the article"
      }
    ]
  `;

  try {
    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 4000,
      }
    });

    const parsed = parseAndExtract(response.text);
    const data = parsed.success ? (parsed.value as any) : null;

    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && data.news && Array.isArray(data.news)) {
      items = data.news;
    }

    return items.map((n: any) => ({
      title: n.title || n.headline || "News Update",
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
        throw new Error("Gemini quota exceeded");
    }
    throw error;
  }
};
