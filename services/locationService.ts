import { LocationInfo, NewsItem } from '../types';
import { getUserSettings, sanitizeLocationInfo } from './geminiService';
import { fetchLiveNews } from './newsService';
import { logWaypointSnapshot } from '../utils/pipelineDebug';
import { isClimateConflicting } from './geographic/climateEstimator';
import { isPlaceholderString } from '../components/InfoPanel';

export const mergeLocationInfo = (prev: any, next: any): any => {
    if (!next || typeof next !== 'object') return prev;
    if (!prev || typeof prev !== 'object') return { ...next };
    
    const merged = { ...prev, ...next };
    
    // 1. Immutable Deterministic Fields
    // These must never be overwritten by AI once set
    const IMMUTABLE_FIELDS = ["name", "entityType", "type", "coordinates", "coordinateSource", "identityStatus", "country", "state", "city", "county", "region", "osmId", "osmType", "wikidataId", "wikipedia", "population"];
    for (const field of IMMUTABLE_FIELDS) {
        if (prev[field] !== undefined && prev[field] !== null) {
            // Only overwrite if next has a valid value and prev is basically empty/placeholder, otherwise keep prev.
            if (field === 'coordinates' && prev.coordinates && !isNaN(prev.coordinates.lat)) {
                merged.coordinates = prev.coordinates;
            } else if (field === 'population' && prev.population?.value !== undefined && prev.population?.value !== null) {
                merged.population = prev.population;
            } else {
                merged[field] = prev[field];
            }
        }
    }
    
    // Strict Population Validation for incoming AI values
    if (merged.population) {
        const p = merged.population;
        if (p === null || p === "" || typeof p !== 'object' || p.value === undefined || p.status === undefined) {
            // Reject malformed incoming population, restore prev if it existed
            if (prev.population && prev.population.value !== undefined && prev.population.value !== null) {
                merged.population = prev.population;
            } else {
                delete merged.population;
            }
        }
    }

    // Strict Climate Protection: deterministic / established climate in prev cannot be overwritten by conflicting next climate
    const prevClimateName = prev.climate?.name || prev.climate?.value || (typeof prev.climate === 'string' ? prev.climate : '');
    if (prev.climate && !isPlaceholderString(prevClimateName)) {
        if (next.climate) {
            const conflict = isClimateConflicting(
                next.climate,
                prev.climate,
                prev.coordinates?.lat,
                prev.coordinates?.lng,
                prev.state || prev.region,
                prev.country,
                prev.entityType || prev.type
            );
            if (conflict.isConflict) {
                console.warn(`[CLIMATE CONTRADICTION REJECTION] mergeLocationInfo rejected incoming climate "${next.climate?.name || next.climate}" (${conflict.reason}). Preserving authoritative climate.`);
                merged.climate = prev.climate;
            } else if (typeof next.climate === 'object' && next.climate.name && !isPlaceholderString(next.climate.name)) {
                merged.climate = next.climate;
            } else {
                merged.climate = prev.climate;
            }
        } else {
            merged.climate = prev.climate;
        }
    }
    
    // 2. Non-Destructive Image Merge
    // A valid image must never be overwritten by a missing/empty/placeholder image
    const isInvalidImage = (img: any) => !img || img === "" || img === "placeholder.jpg" || img.includes("placeholder");
    
    if (prev.primaryImage && !isInvalidImage(prev.primaryImage)) {
        if (isInvalidImage(next.primaryImage)) {
            merged.primaryImage = prev.primaryImage;
        } else {
            // Both valid, prefer newer (or richer)
            merged.primaryImage = next.primaryImage;
        }
    }
    
    if (prev.notable && Array.isArray(prev.notable) && next.notable && Array.isArray(next.notable)) {
        // Merge notable arrays safely, preserving images where possible
        // This is complex, so we'll just keep the one with images if the other doesn't have them
        const prevHasImages = prev.notable.some((n: any) => n.image && !isInvalidImage(n.image));
        const nextHasImages = next.notable.some((n: any) => n.image && !isInvalidImage(n.image));
        
        if (prevHasImages && !nextHasImages && prev.notable.length > 0) {
            merged.notable = prev.notable;
        }
    }

    // 3. String length and quality fallback for descriptions/context (like mergeRichestFields)
    const TEXT_FIELDS = ["description", "overview"];
    for (const field of TEXT_FIELDS) {
        if (typeof prev[field] === 'string') {
            if (typeof next[field] !== 'string' || next[field].trim().length === 0 || isInvalidImage(next[field])) {
                merged[field] = prev[field];
            } else if (prev[field].trim().length > next[field].trim().length && !isInvalidImage(prev[field])) {
                merged[field] = prev[field];
            }
        }
    }

    return merged;
};

// Alias for backwards compatibility where used
export const mergeRichestFields = mergeLocationInfo;

export const fetchAndValidateLocationNews = async (
    locationName: string,
    locationData?: { name?: string; waypoint?: { country?: string; region?: string; state?: string; canonicalName?: string; name?: string } }
): Promise<NewsItem[]> => {
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
    
    if (settings.newsProvider && !apiKeyPresent) {
        console.warn(`News provider ${settings.newsProvider} requires an API key`);
        return [];
    }
    if (!settings.newsProvider || !apiKeyPresent) {
        return [];
    }

    const query = locationName || (locationData?.waypoint && locationData.waypoint.canonicalName) || (locationData?.waypoint && locationData.waypoint.name) || locationData?.name || "Historical Location";
    try {
        const realNews = await fetchLiveNews(query);
        const locName = (locationData?.name || locationName || "").toLowerCase().split(',')[0].trim();
        const countryName = (locationData?.waypoint?.country || "").toLowerCase();
        const regionName = (locationData?.waypoint?.region || locationData?.waypoint?.state || "").toLowerCase();
        
        return realNews.filter(item => {
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
        return [];
    }
};

export const enrichLocationInfo = async (resolvedData: any): Promise<any> => {
    // News is strictly lazy-loaded on-demand and excluded from the initial blocking enrichment path
    resolvedData.news = resolvedData.news || [];
    
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
