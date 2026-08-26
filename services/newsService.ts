import { NewsItem } from '../types';
import { getUserSettings } from './geminiService';

import { fetchNYTNews } from './providers/nytNewsProvider';
import { fetchNewsApiNews } from './providers/newsApiProvider';
import { fetchNewsDataNews } from './providers/newsDataProvider';
import { fetchGeminiGroundedNews } from './providers/geminiNewsProvider';

const DEFAULT_NEWS_TIMEOUT_MS = 8000;
const GEMINI_NEWS_TIMEOUT_MS = 30000;

const fetchWithTimeout = async (promise: Promise<NewsItem[]>, timeoutMs: number = DEFAULT_NEWS_TIMEOUT_MS, providerName = 'unknown'): Promise<NewsItem[]> => {
  const startTime = Date.now();
  let timeoutHandle: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      console.error(`[NEWS TRACE] TIMEOUT provider=${providerName} configuredTimeout=${timeoutMs}ms elapsed=${elapsed}ms`);
      reject(new Error("Provider timeout"));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

import { newsCache } from './cacheService';

export const fetchLiveNews = async (locationName: string): Promise<NewsItem[]> => {
  const overallStart = Date.now();
  const cacheKey = locationName.toLowerCase();
  if (newsCache.has(cacheKey)) {
      const cached = newsCache.get(cacheKey)!;
      console.log(`[NEWS TRACE] fetchLiveNews CACHE HIT location="${locationName}" count=${cached?.length || 0}`);
      return cached;
  }

  const settings = getUserSettings();
  const provider = settings.newsProvider || 'gemini';
  console.log(`[NEWS TRACE] fetchLiveNews START provider=${provider} location="${locationName}"`);
  
  let providerPromise: Promise<NewsItem[]>;
  let timeoutMs = DEFAULT_NEWS_TIMEOUT_MS;
  const getEnv = () => typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : (typeof process !== 'undefined' ? process.env : {});

  switch (provider) {
    case 'gemini':
      providerPromise = fetchGeminiGroundedNews(locationName);
      timeoutMs = GEMINI_NEWS_TIMEOUT_MS;
      break;
    case 'nyt':
      providerPromise = fetchNYTNews(locationName, settings.nytApiKey || getEnv().VITE_NYT_API_KEY);
      timeoutMs = DEFAULT_NEWS_TIMEOUT_MS;
      break;
    case 'newsapi':
      providerPromise = fetchNewsApiNews(locationName, settings.newsApiKey || getEnv().VITE_NEWS_API_KEY);
      timeoutMs = DEFAULT_NEWS_TIMEOUT_MS;
      break;
    case 'newsdata':
      providerPromise = fetchNewsDataNews(locationName, settings.newsDataApiKey || getEnv().VITE_NEWS_DATA_API_KEY);
      timeoutMs = DEFAULT_NEWS_TIMEOUT_MS;
      break;
    default:
      console.warn(`[NEWS TRACE] fetchLiveNews UNKNOWN provider=${provider}`);
      return [];
  }
  
  try {
    const results = await fetchWithTimeout(providerPromise, timeoutMs, provider);
    const elapsed = Date.now() - overallStart;
    console.log(`[NEWS TRACE] fetchLiveNews COMPLETE articles=${results.length} elapsed=${elapsed}ms`);
    newsCache.set(cacheKey, results);
    return results;
  } catch (error: any) {
    const elapsed = Date.now() - overallStart;
    console.error(`[NEWS TRACE] ERROR stage=fetchLiveNews provider=${provider} elapsed=${elapsed}ms message="${error?.message}"`);
    throw error;
  }
};
