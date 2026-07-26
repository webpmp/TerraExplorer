import { LocationInfo } from '../types';
import { getUserSettings, sanitizeLocationInfo } from './geminiService';
import { fetchLiveNews } from './newsService';
import { logWaypointSnapshot } from '../utils/pipelineDebug';

export const enrichLocationInfo = async (resolvedData: any): Promise<any> => {
    const settings = getUserSettings();
    const nytKey = settings.nytApiKey || import.meta.env.VITE_NYT_API_KEY;
    const newsApiKey = settings.newsApiKey || import.meta.env.VITE_NEWS_API_KEY;
    const newsDataKey = settings.newsDataApiKey || import.meta.env.VITE_NEWS_DATA_API_KEY;

    const apiKeyPresent = settings.newsProvider === 'gemini' ? 'existing Gemini configuration' : !!(
        (settings.newsProvider === 'nyt' && nytKey) ||
        (settings.newsProvider === 'newsapi' && newsApiKey) ||
        (settings.newsProvider === 'newsdata' && newsDataKey)
    );
    
    // Check missing API Key
    if (settings.newsProvider !== 'gemini' && !apiKeyPresent) {
        console.warn(`News provider ${settings.newsProvider} requires an API key`);
        resolvedData.news = [];
        resolvedData.newsError = `${settings.newsProvider.toUpperCase()} API key required`;
        return sanitizeLocationInfo(resolvedData);
    }
    
    const wp = resolvedData.waypoint;
    const enrichmentQuery = (wp && wp.canonicalName) ?? (wp && wp.modernLocation) ?? (wp && wp.name) ?? resolvedData.name ?? resolvedData.routeTitle ?? resolvedData.context ?? "Historical Location";
    
    logWaypointSnapshot('===== LOCATION ENRICHMENT START =====', wp);
    
    // Fetch external live news
    try {
        const newsItems = await fetchLiveNews(enrichmentQuery);
        resolvedData.news = newsItems || [];
        
        console.log(`=== NEWS PIPELINE TRACE ===`);
        console.log(`Provider: ${settings.newsProvider}`);
        console.log(`API Key Present: ${apiKeyPresent}`);
        console.log(`Query: ${enrichmentQuery}`);
        console.log(`Articles Returned: ${newsItems?.length || 0}`);
        console.log(`===========================`);
    } catch (e) {
        console.error("=== NEWS PIPELINE ERROR ===");
        console.error(settings.newsProvider);
        console.error(e);
        resolvedData.news = [];
        resolvedData.newsError = e instanceof Error ? e.message : String(e);
    }
    
    console.log("NEWS BEFORE SANITIZE", resolvedData.news);
    const sanitized = sanitizeLocationInfo(resolvedData);
    console.log("NEWS AFTER SANITIZE", sanitized.news);
    
    return sanitized;
};
