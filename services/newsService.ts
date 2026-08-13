import { NewsItem } from '../types';
import { getUserSettings } from './geminiService';

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

import { newsCache } from './cacheService';

export const fetchLiveNews = async (locationName: string): Promise<NewsItem[]> => {
  const cacheKey = locationName.toLowerCase();
  if (newsCache.has(cacheKey)) {
      return newsCache.get(cacheKey)!;
  }

  const settings = getUserSettings();
  
  let providerPromise: Promise<NewsItem[]>;
  const getEnv = () => typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : (typeof process !== 'undefined' ? process.env : {});

  switch (settings.newsProvider) {

    case 'nyt':
      providerPromise = fetchNYTNews(locationName, settings.nytApiKey || getEnv().VITE_NYT_API_KEY);
      break;
    case 'newsapi':
      providerPromise = fetchNewsApiNews(locationName, settings.newsApiKey || getEnv().VITE_NEWS_API_KEY);
      break;
    case 'newsdata':
      providerPromise = fetchNewsDataNews(locationName, settings.newsDataApiKey || getEnv().VITE_NEWS_DATA_API_KEY);
      break;
    default:
      return [];
  }
  
  try {
    const results = await fetchWithTimeout(providerPromise);
    newsCache.set(cacheKey, results);
    return results;
  } catch (error) {
    throw error;
  }
};
