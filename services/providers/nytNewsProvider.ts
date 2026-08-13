import { NewsItem } from '../../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchNYTNews = async (locationName: string, apiKey: string): Promise<NewsItem[]> => {
  if (!apiKey) throw new Error("NYT API key required");
  
  const parts = locationName.split(',').map(p => p.trim()).filter(Boolean);
  // Omit the country (usually the last part) to avoid generic national news, unless it's the only part.
  const searchParts = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)) : parts;
  
  for (let i = 0; i < searchParts.length; i++) {
    const part = searchParts[i];
    // Use strict phrase matching in the query
    const encodedQuery = encodeURIComponent(`"${part}"`);
    const res = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodedQuery}&api-key=${apiKey}`);
    
    if (!res.ok) {
      if (res.status === 429) {
          console.warn("NYT API Rate limit exceeded.");
          break;
      }
      throw new Error(`NYT API error: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.response?.docs && data.response.docs.length > 0) {
      return data.response.docs.map((a: any) => ({
        title: a.headline?.main || "NYT Article",
        summary: a.abstract || a.snippet || "",
        source: "The New York Times",
        url: a.web_url,
        publishedAt: a.pub_date || undefined
      })).slice(0, 5);
    }
    
    // Delay to avoid hitting rate limits too quickly on fallbacks
    if (i < searchParts.length - 1) await sleep(1100);
  }
  
  return [];
};
