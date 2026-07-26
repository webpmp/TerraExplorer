import { NewsItem } from '../../types';

export const fetchNewsDataNews = async (locationName: string, apiKey: string): Promise<NewsItem[]> => {
  if (!apiKey) throw new Error("NewsData.io key required");
  
  const encodedQuery = encodeURIComponent(locationName);
  const res = await fetch(`https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodedQuery}&language=en`);
  
  if (!res.ok) {
    throw new Error(`NewsData error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  if (data.results) {
    return data.results.map((a: any) => ({
      title: a.title || "News Article",
      summary: a.description || "",
      source: a.source_id || "NewsData",
      url: a.link,
      publishedAt: a.pubDate || undefined
    })).filter((n: NewsItem) => n.url && n.url.startsWith('http')).slice(0, 5);
  }
  
  return [];
};
