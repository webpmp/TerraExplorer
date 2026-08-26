import { NewsItem } from '../../types';
import { generateContentWithRetry, modelName } from '../geminiService';
import { parseAndExtract } from '../../utils/jsonParser';

export const fetchGeminiGroundedNews = async (locationName: string): Promise<NewsItem[]> => {
  const providerStart = Date.now();
  console.log(`[NEWS TRACE] Gemini provider START location="${locationName}"`);
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
    7. CRITICAL: Do NOT generate fictional articles, placeholder sources, or invented event names. Never use "example.com" or "Local News Hub". If real news is unavailable, return an empty array [].
    
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
    const apiStart = Date.now();
    console.log(`[NEWS TRACE] Gemini API START`);
    const response = await generateContentWithRetry({
      model: modelName,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 4000,
      }
    });
    const apiElapsed = Date.now() - apiStart;
    console.log(`[NEWS TRACE] Gemini API COMPLETE elapsed=${apiElapsed}ms`);

    const parsed = parseAndExtract(response.text);
    const data = parsed.success ? (parsed.value as any) : null;

    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && data.news && Array.isArray(data.news)) {
      items = data.news;
    }

    console.log(`[NEWS TRACE] Gemini JSON PARSED articles=${items.length}`);

    const receivedCount = items.length;
    let rejectedCount = 0;

    const filteredNews = items.map((n: any) => ({
      title: n.title || n.headline || "News Update",
      summary: n.summary || "",
      source: n.source || "Unknown",
      url: n.url || ""
    })).filter((n: any) => {
       if (!n.url) { rejectedCount++; return false; }
       if (n.url.length < 10) { rejectedCount++; return false; }
       if (n.url.includes('...')) { rejectedCount++; return false; } 
       if (!n.url.startsWith('http')) { rejectedCount++; return false; }
       
       // Strict production guards against fake/placeholder content
       const forbiddenStrings = [
         'example.com', 'local news hub', 'local news', 'placeholder', 
         'localhost', 'sample', 'fictional', 'city council press release', 
         'economic growth initiative'
       ];
       const urlLower = n.url.toLowerCase();
       const sourceLower = n.source.toLowerCase();
       const titleLower = n.title.toLowerCase();
       const summaryLower = n.summary.toLowerCase();
       
       if (forbiddenStrings.some(f => urlLower.includes(f) || sourceLower.includes(f) || titleLower.includes(f) || summaryLower.includes(f))) {
           rejectedCount++;
           return false;
       }
       
       // Reject generic fake event names
       if (titleLower.includes("new community center opens") || titleLower.includes("seaside festival")) {
           rejectedCount++;
           return false;
       }
       
       return true;
    });

    const providerElapsed = Date.now() - providerStart;
    console.log(`[NEWS TRACE] Gemini provider COMPLETE articles=${filteredNews.length} elapsed=${providerElapsed}ms`);

    console.log(JSON.stringify({
      stage: "news-filter",
      received: receivedCount,
      rejected: rejectedCount,
      returned: filteredNews.length
    }));

    return filteredNews;

  } catch (error: any) {
    const providerElapsed = Date.now() - providerStart;
    console.error(`[NEWS TRACE] ERROR stage=geminiNewsProvider elapsed=${providerElapsed}ms message="${error?.message}"`);
    const isQuota = error?.message?.includes('429') || error?.message?.includes('Quota') || (error?.error && error.error.code === 429);
    if (isQuota) {
        throw new Error("Gemini quota exceeded");
    }
    throw error;
  }
};
