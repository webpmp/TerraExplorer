import { LocationInfo } from '../types';
import { getUserSettings, sanitizeLocationInfo } from './geminiService';
import { fetchLiveNews } from './newsService';
import { logWaypointSnapshot } from '../utils/pipelineDebug';

export const mergeRichestFields = (target: any, source: any): any => {
    if (!source || typeof source !== 'object') return target;
    if (!target || typeof target !== 'object') return { ...source };
    
    const merged = { ...target };
    for (const key of Object.keys(source)) {
        const sourceVal = source[key];
        const targetVal = merged[key];
        
        if (typeof sourceVal === 'string' && typeof targetVal === 'string') {
            if (sourceVal.trim().length > targetVal.trim().length) {
                merged[key] = sourceVal;
            }
        } else if (Array.isArray(sourceVal) && Array.isArray(targetVal)) {
            if (sourceVal.length > targetVal.length) {
                merged[key] = sourceVal;
            }
        } else if (sourceVal && (!targetVal || (Array.isArray(targetVal) && targetVal.length === 0))) {
            merged[key] = sourceVal;
        } else if (sourceVal !== undefined && sourceVal !== null && sourceVal !== "") {
            if (!(Array.isArray(sourceVal) && sourceVal.length === 0)) {
                // If it's a completely new type or object and target is emptyish, or if we can't easily compare, prefer source only if it's non-empty
                if (targetVal === undefined || targetVal === null || targetVal === "") {
                    merged[key] = sourceVal;
                }
            }
        }
    }
    return merged;
};

export const enrichLocationInfo = async (resolvedData: any): Promise<any> => {
    const settings = getUserSettings();
    const getEnv = () => typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : (typeof process !== 'undefined' ? process.env : {});
    const nytKey = settings.nytApiKey || getEnv().VITE_NYT_API_KEY;
    const newsApiKey = settings.newsApiKey || getEnv().VITE_NEWS_API_KEY;
    const newsDataKey = settings.newsDataApiKey || getEnv().VITE_NEWS_DATA_API_KEY;

    const apiKeyPresent = !!(
        (settings.newsProvider === 'nyt' && nytKey) ||
        (settings.newsProvider === 'newsapi' && newsApiKey) ||
        (settings.newsProvider === 'newsdata' && newsDataKey)
    );
    
    // Check missing API Key
    if (settings.newsProvider && !apiKeyPresent) {
        console.warn(`News provider ${settings.newsProvider} requires an API key`);
        resolvedData.news = [];
        resolvedData.newsError = `${settings.newsProvider.toUpperCase()} API key required`;
        return sanitizeLocationInfo(resolvedData);
    } else if (settings.newsProvider && apiKeyPresent) {
        // We have a real news provider. Fetch real articles.
        const query = (resolvedData.waypoint && resolvedData.waypoint.canonicalName) ?? (resolvedData.waypoint && resolvedData.waypoint.name) ?? resolvedData.name ?? "Historical Location";
        try {
            const realNews = await fetchLiveNews(query);
            // Apply strict geographic scoring to real news
            const locName = (resolvedData.name || "").toLowerCase().split(',')[0].trim();
            const countryName = (resolvedData.waypoint?.country || "").toLowerCase();
            const regionName = (resolvedData.waypoint?.region || resolvedData.waypoint?.state || "").toLowerCase();
            
            resolvedData.news = realNews.filter(item => {
                const titleLower = (item.title || "").toLowerCase();
                const summaryLower = (item.summary || "").toLowerCase();
                const fullText = titleLower + " " + summaryLower;
                
                const rejectKeywords = ["hotel", "shopping", "lifestyle", "travel deals", "best places to stay", "cheap flights", "vacation rentals", "restaurants", "recipe", "ingredient", "obituary", "itinerary", "product", "listing", "address", "shipping"];
                for (const kw of rejectKeywords) {
                     if (fullText.includes(kw)) {
                         console.log(`[NEWS VALIDATION] {\n  queryLocation: "${locName}",\n  articleTitle: "${item.title}",\n  accepted: false,\n  reason: "Spam keyword: ${kw}"\n}`);
                         return false;
                     }
                }
                
                const hasLoc = locName && (titleLower.includes(locName) || summaryLower.includes(locName));
                const hasRegion = regionName && (titleLower.includes(regionName) || summaryLower.includes(regionName));
                const hasCountry = countryName && (titleLower.includes(countryName) || summaryLower.includes(countryName));
                
                let accepted = false;
                let reason = "Rejected: unrelated";
                
                if (hasLoc) {
                    accepted = true;
                    reason = "Exact location match";
                } else if (hasRegion && hasCountry) {
                    accepted = true;
                    reason = "Region + country match";
                } else if (hasCountry && !hasRegion) {
                    accepted = false;
                    reason = "Rejected: country-only match";
                }
                
                console.log(`[NEWS VALIDATION] {\n  "queryLocation": "${locName}",\n  "articleTitle": "${item.title}",\n  "accepted": ${accepted},\n  "reason": "${reason}"\n}`);
                return accepted;
            });
        } catch (err) {
            console.error("Failed to fetch real news:", err);
            resolvedData.news = [];
        }
    } else {
        // Never use LLM hallucinated news
        resolvedData.news = [];
    }
    
    const wp = resolvedData.waypoint;
    
    // --- Validation Layer ---
    const hasWaypoint = !!wp;
    const coords = resolvedData.coordinates || (wp && wp.coordinates);
    const hasCoordinates = coords && 
                           typeof coords.lat === 'number' && 
                           typeof coords.lng === 'number' &&
                           !isNaN(coords.lat) && 
                           !isNaN(coords.lng);
                           
    console.log(JSON.stringify({
      stage: "enrichment-validation",
      hasWaypoint,
      hasCoordinates,
      action: hasCoordinates ? "proceed" : "blocked"
    }));

    if (!hasCoordinates) {
      console.warn("Blocking enrichment: Missing or invalid coordinates.");
      resolvedData.status = "error";
      resolvedData.errorMessage = "Missing geographic coordinates for enrichment.";
      return sanitizeLocationInfo(resolvedData);
    }
    // ------------------------

    const enrichmentQuery = (wp && wp.canonicalName) ?? (wp && wp.modernLocation) ?? (wp && wp.name) ?? resolvedData.name ?? resolvedData.routeTitle ?? resolvedData.context ?? "Historical Location";
    
    logWaypointSnapshot('===== LOCATION ENRICHMENT START =====', wp);
    
    console.log(JSON.stringify({
      stage: "before-sanitize",
      newsCount: resolvedData.news?.length || 0,
      newsPreview: JSON.stringify(resolvedData.news)?.substring(0, 100),
      descriptionPreview: resolvedData.description?.substring(0, 100),
      climatePreview: resolvedData.climate?.name || "none",
      notableCount: resolvedData.notable?.summary ? 1 : 0
    }));

    if (!resolvedData.news) {
        resolvedData.news = [];
    }

    sanitizeLocationInfo(resolvedData); // Mutates in place
    
    // Make sure we have a valid status
    resolvedData.status = resolvedData.status || "success";
    
    console.log(JSON.stringify({
      stage: "after-sanitize",
      newsCount: resolvedData.news?.length || 0,
      newsPreview: JSON.stringify(resolvedData.news)?.substring(0, 100),
      descriptionPreview: resolvedData.description?.substring(0, 100),
      climatePreview: resolvedData.climate?.name || "none",
      notableCount: resolvedData.notable?.summary ? 1 : 0
    }));
    
    return resolvedData;
};
