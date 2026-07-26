import { NewsItem } from '../../types';

export const fetchNewsApiNews = async (locationName: string, apiKey: string): Promise<NewsItem[]> => {
  if (!apiKey) throw new Error("NewsAPI key required");
  
  const encodedQuery = encodeURIComponent(locationName);
  const res = await fetch(`https://newsapi.org/v2/everything?q=${encodedQuery}&sortBy=publishedAt&language=en&apiKey=${apiKey}`);
  
  if (!res.ok) {
    throw new Error(`NewsAPI error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  if (data.articles) {
    return data.articles.map((a: any) => ({
      title: a.title || "News Article",
      summary: a.description || "",
      source: a.source?.name || "NewsAPI",
      url: a.url,
      publishedAt: a.publishedAt || undefined
    })).filter((n: NewsItem) => n.url && n.url.startsWith('http')).slice(0, 5);
  }
  
  return [];
};
