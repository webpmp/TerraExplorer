import { NewsItem } from '../../types';

export const fetchNYTNews = async (locationName: string, apiKey: string): Promise<NewsItem[]> => {
  if (!apiKey) throw new Error("NYT API key required");
  
  const encodedQuery = encodeURIComponent(locationName);
  const res = await fetch(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodedQuery}&api-key=${apiKey}`);
  
  if (!res.ok) {
    throw new Error(`NYT API error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  if (data.response?.docs) {
    return data.response.docs.map((a: any) => ({
      title: a.headline?.main || "NYT Article",
      summary: a.abstract || a.snippet || "",
      source: "The New York Times",
      url: a.web_url,
      publishedAt: a.pub_date || undefined
    })).slice(0, 5);
  }
  
  return [];
};
