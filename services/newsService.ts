import { NewsItem } from '../types';
import { getUserSettings } from './geminiService';
import { fetchGeminiGroundedNews } from './providers/geminiNewsProvider';
import { fetchNYTNews } from './providers/nytNewsProvider';
import { fetchNewsApiNews } from './providers/newsApiProvider';
import { fetchNewsDataNews } from './providers/newsDataProvider';

const NEWS_TIMEOUT_MS = 8000;

const fetchWithTimeout = async (promise: Promise<NewsItem[]>): Promise<NewsItem[]> => {
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error("Provider timeout"));
    }, NEWS_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const fetchLiveNews = async (locationName: string): Promise<NewsItem[]> => {
  const settings = getUserSettings();
  
  let providerPromise: Promise<NewsItem[]>;
  
  switch(settings.newsProvider) {
    case "gemini":
      providerPromise = fetchGeminiGroundedNews(locationName);
      break;
    case "nyt":
      providerPromise = fetchNYTNews(locationName, settings.nytApiKey || import.meta.env.VITE_NYT_API_KEY);
      break;
    case "newsapi":
      providerPromise = fetchNewsApiNews(locationName, settings.newsApiKey || import.meta.env.VITE_NEWS_API_KEY);
      break;
    case "newsdata":
      providerPromise = fetchNewsDataNews(locationName, settings.newsDataApiKey || import.meta.env.VITE_NEWS_DATA_API_KEY);
      break;
    default:
      return [];
  }
  
  return fetchWithTimeout(providerPromise);
};
