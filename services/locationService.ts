import { LocationInfo, NewsItem } from '../types';
import { getUserSettings, sanitizeLocationInfo } from './geminiService';
import { fetchLiveNews } from './newsService';
import { logWaypointSnapshot } from '../utils/pipelineDebug';
import { isClimateConflicting } from './geographic/climateEstimator';
import { isPlaceholderString } from '../components/InfoPanel';
import { deduplicateNotableFacts } from '../utils/notableFactsUtils';

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

    if (merged.notable && Array.isArray(merged.notable)) {
        merged.notable = deduplicateNotableFacts(merged.notable);
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

    // 4. Error state synchronization
    if (next.errorType) {
        merged.errorType = next.errorType;
        merged.errorMessage = next.errorMessage;
        merged.errorInstruction = next.errorInstruction;
    } else if (next.description && !isPlaceholderString(next.description)) {
        delete merged.errorType;
        delete merged.errorMessage;
        delete merged.errorInstruction;
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
    const geminiKey = (typeof process !== 'undefined' && process.env && (process.env.API_KEY || process.env.GEMINI_API_KEY)) || getEnv().GEMINI_API_KEY;
    const hasGeminiKey = !!geminiKey && geminiKey !== 'dummy-key-for-ts-check';

    if (settings.newsProvider === 'gemini' && !hasGeminiKey) {
        console.error("Gemini API key is missing or not configured for Gemini News Provider");
        throw new Error("Gemini API key is not configured");
    }

    const apiKeyPresent = !!(
        (settings.newsProvider === 'nyt' && nytKey) ||
        (settings.newsProvider === 'newsapi' && newsApiKey) ||
        (settings.newsProvider === 'newsdata' && newsDataKey) ||
        (settings.newsProvider === 'gemini' && hasGeminiKey)
    );
    
    if (settings.newsProvider && !apiKeyPresent) {
        console.warn(`News provider ${settings.newsProvider} requires an API key`);
        return [];
    }
    if (!settings.newsProvider || !apiKeyPresent) {
        return [];
    }

    const locStart = Date.now();
    const query = locationName || (locationData?.waypoint && locationData.waypoint.canonicalName) || (locationData?.waypoint && locationData.waypoint.name) || locationData?.name || "Historical Location";
    console.log(`[NEWS TRACE] locationService START query="${query}" locationName="${locationName}"`);
    try {
        const realNews = await fetchLiveNews(query);
        
        // Extract geographic metadata tokens for multi-tier evidence validation
        const raw = (locationName || locationData?.name || "").trim();
        const wp = locationData?.waypoint;

        let cityCandidate = (wp?.canonicalName || wp?.name || locationData?.city || "").trim().toLowerCase();
        let stateCandidate = (wp?.state || wp?.region || locationData?.state || locationData?.region || "").trim().toLowerCase();
        let countryCandidate = (wp?.country || locationData?.country || "").trim().toLowerCase();

        if (raw.includes(',')) {
            const parts = raw.split(',').map(s => s.trim().toLowerCase());
            if (!cityCandidate && parts[0]) cityCandidate = parts[0];
            if (!stateCandidate && parts[1]) stateCandidate = parts[1];
            if (!countryCandidate && parts[2]) countryCandidate = parts[2];
        } else if (raw) {
            const lowerRaw = raw.toLowerCase();
            const stateRegex = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|tx|ca|ny|fl|il|pa|oh|ga|nc|mi)\b$/i;
            const match = lowerRaw.match(stateRegex);
            if (match && match.index && match.index > 0) {
                const potentialCity = lowerRaw.substring(0, match.index).trim();
                if (potentialCity) {
                    if (!cityCandidate) cityCandidate = potentialCity;
                    if (!stateCandidate) stateCandidate = match[0];
                }
            } else if (!cityCandidate) {
                cityCandidate = lowerRaw;
            }
        }

        const canonicalCity = cityCandidate || raw.toLowerCase();
        const canonicalState = stateCandidate;
        const canonicalCountry = countryCandidate;
        const canonicalCounty = (locationData?.county || wp?.county || (canonicalCity ? `${canonicalCity} county` : "")).toLowerCase();
        const rawQuery = raw.toLowerCase();

        const rejectKeywords = [
            "hotel", "shopping", "lifestyle", "travel deals", "best places to stay",
            "cheap flights", "vacation rentals", "restaurants", "recipe", "ingredient",
            "obituary", "itinerary", "product", "listing", "address", "shipping"
        ];

        const hasWord = (text: string, phrase: string): boolean => {
            if (!phrase || !phrase.trim()) return false;
            const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
            return regex.test(text);
        };

        const metroAliases: Record<string, string[]> = {
            "dallas": ["dallas-fort worth", "dfw", "north texas", "fort worth", "arlington", "frisco", "plano", "irving", "richardson", "denton"],
            "new york": ["nyc", "manhattan", "brooklyn", "queens", "bronx", "staten island", "tri-state"],
            "san francisco": ["bay area", "oakland", "san jose", "silicon valley"],
            "los angeles": ["la", "socal", "hollywood", "long beach", "santa monica", "pasadena"],
            "london": ["greater london", "westminster", "thames"],
            "tokyo": ["kanto", "shibuya", "shinjuku", "ginza", "chiyoda"]
        };

        const filtered = realNews.filter(item => {
            const titleLower = (item.title || "").toLowerCase();
            const summaryLower = (item.summary || "").toLowerCase();
            const fullText = `${titleLower} ${summaryLower}`;

            // 1. Spam rejection
            for (const kw of rejectKeywords) {
                if (fullText.includes(kw)) {
                    console.log(`[NEWS VALIDATION]\nqueryLocation="${rawQuery}"\narticleTitle="${item.title}"\naccepted=false\nreason="Spam keyword: ${kw}"`);
                    return false;
                }
            }

            let accepted = false;
            let reason = "No sufficient geographic evidence";

            // 2. Strong evidence: Direct city match in title
            if (canonicalCity && hasWord(titleLower, canonicalCity)) {
                accepted = true;
                reason = `Direct location match: ${canonicalCity}`;
            }
            // Strong evidence: Raw query in title
            else if (rawQuery && hasWord(titleLower, rawQuery)) {
                accepted = true;
                reason = `Direct query match: ${rawQuery}`;
            }
            // Strong evidence: Local entity / institution / sports team match
            else if (canonicalCity && (() => {
                const entityRegex = new RegExp(`(^|[^a-z0-9])${canonicalCity}\\s+([a-z]+)`, 'i');
                const entityMatch = titleLower.match(entityRegex) || summaryLower.match(entityRegex);
                if (entityMatch) {
                    reason = `Local entity match: ${entityMatch[0].trim()}`;
                    return true;
                }
                return false;
            })()) {
                accepted = true;
            }
            // Strong evidence: Direct city in summary
            else if (canonicalCity && hasWord(summaryLower, canonicalCity)) {
                accepted = true;
                reason = `Location context match: ${canonicalCity}`;
            }
            // Strong evidence: County match
            else if (canonicalCounty && (hasWord(titleLower, canonicalCounty) || hasWord(summaryLower, canonicalCounty))) {
                accepted = true;
                reason = `County match: ${canonicalCounty}`;
            }
            // Strong evidence: Regional metropolitan aliases
            else if (canonicalCity && metroAliases[canonicalCity] && (() => {
                for (const alias of metroAliases[canonicalCity]) {
                    if (hasWord(titleLower, alias) || hasWord(summaryLower, alias)) {
                        reason = `Regional geographic match: ${alias}`;
                        return true;
                    }
                }
                return false;
            })()) {
                accepted = true;
            }
            // Moderate evidence: City + State in text
            else if (canonicalCity && canonicalState && hasWord(fullText, canonicalCity) && hasWord(fullText, canonicalState)) {
                accepted = true;
                reason = `City + State match: ${canonicalCity}, ${canonicalState}`;
            }
            // Weak evidence (Rejected): State-only or Country-only match without local geographic evidence
            else if (canonicalState && hasWord(fullText, canonicalState)) {
                accepted = false;
                reason = "Rejected: state-only match without local geographic evidence";
            } else if (canonicalCountry && hasWord(fullText, canonicalCountry)) {
                accepted = false;
                reason = "Rejected: country-only match without local geographic evidence";
            }

            console.log(`[NEWS VALIDATION]\nqueryLocation="${rawQuery}"\narticleTitle="${item.title}"\naccepted=${accepted}\nreason="${reason}"`);
            return accepted;
        });

        const locElapsed = Date.now() - locStart;
        console.log(`[NEWS TRACE] locationService COMPLETE articles=${filtered.length} elapsed=${locElapsed}ms`);
        return filtered;
    } catch (err: any) {
        const locElapsed = Date.now() - locStart;
        console.error(`[NEWS TRACE] ERROR stage=locationService elapsed=${locElapsed}ms message="${err?.message}"`);
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
      notableCount: Array.isArray(resolvedData.notable) ? resolvedData.notable.length : (resolvedData.notable?.summary ? 1 : 0)
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
      notableCount: Array.isArray(resolvedData.notable) ? resolvedData.notable.length : (resolvedData.notable?.summary ? 1 : 0)
    }));
    
    return resolvedData;
};
