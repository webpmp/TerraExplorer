/**
 * Geographically grounded climate estimation and validation based on
 * latitude, longitude, and regional context (Köppen-Geiger climate classification).
 */

export function getEstimatedClimate(
    lat: number, 
    lng: number, 
    region?: string, 
    country?: string,
    entityType?: string
): { climateName: string, koppenCode: string, source: "estimated", confidence: "low" | "medium" | "high" } {
    const absLat = Math.abs(lat);
    const c = (country || "").toLowerCase();
    const r = (region || "").toLowerCase();
    const e = (entityType || "").toLowerCase();

    // 1. Alpine / Mountain detection (Swiss Alps, Valais, Rockies, Andes, Himalayas, Cascades, Sierra Nevada, etc.)
    const isAlps = (lat >= 45.0 && lat <= 48.0 && lng >= 5.5 && lng <= 16.5) ||
                   c.includes("switzerland") || c.includes("austria") ||
                   r.includes("valais") || r.includes("wallis") || r.includes("tirol") || r.includes("tyrol") || r.includes("alps");
    
    if (isAlps && (e === "mountain" || e === "peak" || e === "volcano" || e === "natural_feature" || r.includes("valais") || r.includes("wallis") || c.includes("switzerland"))) {
        return { climateName: "Alpine Climate", koppenCode: "ET", source: "estimated", confidence: "high" };
    }

    if (e === "mountain" || e === "peak" || e === "volcano") {
        return { climateName: "Alpine / Mountain Climate", koppenCode: "ET", source: "estimated", confidence: "medium" };
    }

    // 2. Florida & Southeastern United States
    const isFlorida = (lat >= 24.5 && lat <= 31.2 && lng >= -87.8 && lng <= -79.8) ||
                      r.includes("florida") || r === "fl" ||
                      r.includes("jacksonville") || r.includes("miami") || r.includes("orlando") || 
                      r.includes("tampa") || r.includes("gainesville") || r.includes("tallahassee") || 
                      r.includes("paynes prairie") || r.includes("alachua") || r.includes("duval");

    if (isFlorida) {
        if (lat < 26.0) {
            return { climateName: "Tropical Savanna", koppenCode: "Aw", source: "estimated", confidence: "high" };
        }
        return { climateName: "Humid Subtropical", koppenCode: "Cfa", source: "estimated", confidence: "high" };
    }

    const isSoutheastUS = (lat >= 28.0 && lat <= 37.0 && lng >= -95.0 && lng <= -75.0) ||
                          r.includes("georgia") || r.includes("alabama") || r.includes("mississippi") || 
                          r.includes("south carolina") || r.includes("north carolina") || 
                          r.includes("tennessee") || r.includes("louisiana") || r.includes("arkansas");
    if (isSoutheastUS) {
        return { climateName: "Humid Subtropical", koppenCode: "Cfa", source: "estimated", confidence: "high" };
    }

    // 3. Pacific Northwest & Western Coast (Vancouver, Seattle, Portland, coastal BC/WA/OR)
    const isPacNW = (lat >= 42.0 && lat <= 55.0 && lng >= -126.0 && lng <= -120.0) ||
                    r.includes("british columbia") || r.includes("vancouver") || 
                    (c.includes("united states") && (r.includes("washington") || r.includes("oregon")) && lng < -120.0);
    if (isPacNW) {
        return { climateName: "Temperate Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "high" };
    }

    // 4. California (Mediterranean)
    const isCalifornia = (lat >= 32.5 && lat <= 42.0 && lng >= -124.5 && lng <= -114.5) || r.includes("california") || r === "ca";
    if (isCalifornia) {
        return { climateName: "Mediterranean", koppenCode: "Csa", source: "estimated", confidence: "high" };
    }

    // 5. US Southwest Deserts (Sonoran, Mojave, Chihuahuan)
    const isUSSouthwestDesert = (lat >= 31.0 && lat <= 37.5 && lng >= -118.0 && lng <= -109.0) ||
                                r.includes("arizona") || (r.includes("nevada") && lat < 38);
    if (isUSSouthwestDesert) {
        return { climateName: "Arid (Hot Desert)", koppenCode: "BWh", source: "estimated", confidence: "high" };
    }

    // 6. US Great Plains / Semi-Arid Interior West
    const isUSGreatPlains = (lat >= 31.0 && lat <= 49.0 && lng >= -106.0 && lng < -98.0) ||
                            r.includes("panhandle") || r.includes("dallam") || r.includes("west texas") ||
                            (r.includes("colorado") && lng > -105.0) || r.includes("wyoming");
    if (isUSGreatPlains) {
        return { climateName: "Cold Semi-Arid", koppenCode: "BSk", source: "estimated", confidence: "high" };
    }

    // 7. US Midwest & Northeast
    const isUSNortheast = (lat >= 37.5 && lat <= 48.0 && lng >= -82.0 && lng <= -67.0) ||
                          r.includes("new york") || r.includes("pennsylvania") || r.includes("massachusetts") || 
                          r.includes("connecticut") || r.includes("vermont") || r.includes("new hampshire") || r.includes("maine");
    if (isUSNortheast) {
        return { climateName: "Humid Continental", koppenCode: "Dfb", source: "estimated", confidence: "high" };
    }

    const isUSMidwest = (lat >= 37.0 && lat <= 49.0 && lng >= -98.0 && lng < -82.0) ||
                        r.includes("illinois") || r.includes("ohio") || r.includes("indiana") || 
                        r.includes("michigan") || r.includes("wisconsin") || r.includes("minnesota") || 
                        r.includes("iowa") || r.includes("missouri");
    if (isUSMidwest) {
        return { climateName: "Humid Continental", koppenCode: "Dfa", source: "estimated", confidence: "high" };
    }

    // 8. Sahara & North Africa
    if (lat > 15 && lat < 33 && lng > -15 && lng < 38 && (c.includes("algeria") || c.includes("libya") || c.includes("egypt") || c.includes("mali") || c.includes("niger") || c.includes("chad") || c.includes("sudan") || c.includes("mauritania") || c.includes("morocco") || c.includes("saudi"))) {
        return { climateName: "Arid (Hot Desert)", koppenCode: "BWh", source: "estimated", confidence: "high" };
    }

    // 9. Amazon Rainforest & Equatorial South America
    if (lat > -15 && lat < 8 && lng > -78 && lng < -48 && (c.includes("brazil") || c.includes("peru") || c.includes("colombia") || c.includes("venezuela") || c.includes("ecuador") || c.includes("bolivia"))) {
        return { climateName: "Tropical Rainforest", koppenCode: "Af", source: "estimated", confidence: "high" };
    }
    
    // 10. Iceland
    if (c.includes("iceland") || r.includes("grindavík") || r.includes("reykjanes") || (lat >= 63.0 && lat <= 67.5 && lng >= -25.0 && lng <= -13.0)) {
        return { climateName: "Subpolar Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "high" };
    }

    // 11. UK & Western Europe
    if (c === "united kingdom" || c === "uk" || c === "great britain" || c.includes("ireland")) {
        return { climateName: "Temperate Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "high" };
    }
    if (c.includes("france") || c.includes("germany") || c.includes("belgium") || c.includes("netherlands")) {
        return { climateName: "Temperate Oceanic / Continental", koppenCode: "Cfb", source: "estimated", confidence: "high" };
    }

    // 12. Mediterranean Europe
    if (c.includes("italy") || c.includes("spain") || c.includes("greece") || c.includes("portugal") || c.includes("croatia")) {
        return { climateName: "Mediterranean", koppenCode: "Csa", source: "estimated", confidence: "high" };
    }

    // 13. Australia - East Coast vs Outback
    if (c.includes("australia") || c === "au") {
        if (r.includes("new south wales") || r.includes("sydney") || r.includes("queensland") || r.includes("brisbane") || (lat <= -25 && lat >= -38 && lng >= 150)) {
            return { climateName: "Humid Subtropical", koppenCode: "Cfa", source: "estimated", confidence: "high" };
        }
        if (r.includes("victoria") || r.includes("melbourne") || r.includes("tasmania") || (lat <= -37 && lng >= 140)) {
            return { climateName: "Temperate Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "high" };
        }
        if (lng > 115 && lng < 145 && (lat > -35 && lat < -18)) {
            return { climateName: "Arid (Hot Desert)", koppenCode: "BWh", source: "estimated", confidence: "medium" };
        }
    }

    // 14. East Asia (Japan, Eastern China, Korea)
    if (c.includes("japan") || c.includes("korea") || (c.includes("china") && lng > 110)) {
        if (lat < 33) {
            return { climateName: "Humid Subtropical", koppenCode: "Cfa", source: "estimated", confidence: "high" };
        }
        return { climateName: "Humid Continental", koppenCode: "Dfa", source: "estimated", confidence: "high" };
    }

    // 15. Broad Zonal Rules (fallback)
    if (absLat < 23.5) {
        if (c.includes("brazil") || c.includes("indonesia") || c.includes("congo") || c.includes("malaysia") || c.includes("philippines")) {
            return { climateName: "Tropical Rainforest", koppenCode: "Af", source: "estimated", confidence: "medium" };
        }
        return { climateName: "Tropical Savanna", koppenCode: "Aw", source: "estimated", confidence: "medium" };
    } else if (absLat >= 23.5 && absLat < 40) {
        // Eastern continental margins (like East Asia / East North America) are Humid Subtropical
        if (lng > -95 && lng < -70 && lat > 24) {
            return { climateName: "Humid Subtropical", koppenCode: "Cfa", source: "estimated", confidence: "medium" };
        }
        return { climateName: "Temperate Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "medium" };
    } else if (absLat >= 40 && absLat < 60) {
        if (c.includes("russia") || c.includes("canada") || c.includes("norway") || c.includes("sweden") || c.includes("finland")) {
            return { climateName: "Subarctic / Continental", koppenCode: "Dfc", source: "estimated", confidence: "medium" };
        }
        return { climateName: "Temperate Continental", koppenCode: "Dfb", source: "estimated", confidence: "medium" };
    }

    return { climateName: "Polar / Tundra", koppenCode: "ET", source: "estimated", confidence: "medium" };
}

export function isClimateGeographicallyValid(
    koppenCode: string, 
    lat: number, 
    lng: number, 
    region?: string, 
    country?: string
): boolean {
    if (!koppenCode) return true;
    const code = koppenCode.trim();
    const c = (country || "").toLowerCase();
    const r = (region || "").toLowerCase();

    // Florida: cannot be semi-arid, desert, subarctic, or polar
    const isFlorida = (lat >= 24.5 && lat <= 31.2 && lng >= -87.8 && lng <= -79.8) ||
                      r.includes("florida") || r === "fl" ||
                      r.includes("jacksonville") || r.includes("orlando") || r.includes("paynes prairie");
    
    if (isFlorida && (code === "BSk" || code === "BSh" || code === "BWk" || code === "BWh" || code === "Dfc" || code === "ET" || code === "EF")) {
        return false;
    }

    // East Coast Australia: cannot be BSk, desert, or polar
    const isEastCoastAus = (c.includes("australia") || c === "au") && (lat <= -25 && lat >= -38 && lng >= 150);
    if (isEastCoastAus && (code === "BSk" || code === "BWk" || code === "ET" || code === "EF")) {
        return false;
    }

    // Equatorial lowlands: cannot be Polar or Subarctic
    if (Math.abs(lat) < 20 && (code === "ET" || code === "EF" || code === "Dfc" || code === "Dfd")) {
        return false;
    }

    return true;
}

export function isClimateConflicting(
    candidateClimate: { name?: string; value?: string; koppenCode?: string } | string | null | undefined,
    deterministicClimate: { name?: string; value?: string; koppenCode?: string } | string | null | undefined,
    lat?: number,
    lng?: number,
    region?: string,
    country?: string,
    entityType?: string
): { isConflict: boolean; reason?: string } {
    if (!candidateClimate) return { isConflict: false };

    const getClimateObj = (c: any) => {
        if (!c) return { name: '', koppenCode: '' };
        if (typeof c === 'string') return { name: c, koppenCode: '' };
        return {
            name: (c.name || c.value || '').toString(),
            koppenCode: (c.koppenCode || '').toString()
        };
    };

    const candidate = getClimateObj(candidateClimate);
    const candName = candidate.name.toLowerCase();
    const candCode = candidate.koppenCode.toUpperCase();

    const det = getClimateObj(deterministicClimate);
    const detName = det.name.toLowerCase();
    const detCode = det.koppenCode.toUpperCase();

    const eType = (entityType || '').toLowerCase();
    const c = (country || '').toLowerCase();

    // 1. Conflict against established Alpine / Mountain Climate or mountain terrain classification
    const isDetAlpine = detCode === 'ET' || detName.includes('alpine') || detName.includes('mountain climate');
    const isMountainEntity = eType === 'mountain' || eType === 'peak' || eType === 'volcano';

    if (isDetAlpine || isMountainEntity) {
        // High mountain terrain cannot have tropical, humid subtropical, Mediterranean, hot desert, or savanna climate
        const isWarmOrTropical = candName.includes('tropical') || candName.includes('subtropical') || candName.includes('savanna') || 
                                 candName.includes('mediterranean') || candName.includes('hot desert') ||
                                 candCode === 'CFA' || candCode === 'CWA' || candCode === 'AF' || candCode === 'AM' || candCode === 'AW' || candCode === 'BWH' || candCode === 'CSA';
        if (isWarmOrTropical) {
            return {
                isConflict: true,
                reason: `Candidate climate "${candidate.name}" (${candidate.koppenCode || 'none'}) contradicts alpine/mountain terrain`
            };
        }
    }

    // 2. Conflict against established Subpolar Oceanic / Maritime (e.g. coastal Iceland)
    const isDetSubpolarOceanic = detName.includes('subpolar oceanic') || (c.includes('iceland') && (detCode === 'CFB' || detCode === 'CFC'));
    if (isDetSubpolarOceanic) {
        if (candName.includes('polar') || candName.includes('tundra') || candCode === 'ET' || candCode === 'EF' || candName.includes('desert') || candCode.startsWith('BW')) {
            return {
                isConflict: true,
                reason: `Candidate climate "${candidate.name}" (${candidate.koppenCode || 'none'}) contradicts maritime/subpolar oceanic baseline`
            };
        }
    }

    // 3. Conflict against established Humid Subtropical / Maritime (e.g. East Coast Australia / Florida)
    const isDetHumidSubtropical = detCode === 'CFA' || detName.includes('humid subtropical');
    if (isDetHumidSubtropical) {
        if (candName.includes('semi-arid') || candCode === 'BSK' || candCode === 'BSH' || candName.includes('desert') || candCode.startsWith('BW') || candName.includes('polar') || candCode === 'ET') {
            return {
                isConflict: true,
                reason: `Candidate climate "${candidate.name}" (${candidate.koppenCode || 'none'}) contradicts humid subtropical baseline`
            };
        }
    }

    // 4. Geographic plausibility check based on coordinates if available
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        if (candidate.koppenCode && !isClimateGeographicallyValid(candidate.koppenCode, lat, lng, region, country)) {
            return {
                isConflict: true,
                reason: `Candidate climate code "${candidate.koppenCode}" is geographically invalid for coordinates ${lat}, ${lng} (${region || 'unknown'}, ${country || 'unknown'})`
            };
        }
    }

    return { isConflict: false };
}

export function getClimateDescription(koppenCode: string, fallbackName: string): string {
    switch (koppenCode) {
        case "Af": return "Warm temperatures persist year-round with a pronounced wet season and heavy annual rainfall.";
        case "Am": return "Tropical monsoon conditions featuring high year-round temperatures and heavy seasonal monsoon rains.";
        case "Aw": return "Warm year-round with a distinct dry season and a marked wet season.";
        case "BWh": return "Characterized by hot temperatures and extremely low annual rainfall.";
        case "BWk": return "Cold desert climate characterized by arid conditions and wide seasonal temperature extremes.";
        case "BSh": return "Hot semi-arid climate with warm temperatures and intermediate precipitation.";
        case "Cfa": return "Humid subtropical conditions featuring warm to hot summers and mild winters with consistent rainfall throughout the year.";
        case "Cfb": return "Mild summers and cool winters with relatively consistent precipitation moderated by oceanic currents.";
        case "Cfc": return "Cool summers and mild winters moderated by oceanic currents with frequent precipitation.";
        case "Csa": return "Warm to hot, dry summers paired with mild, wet winters.";
        case "Csb": return "Mild, dry summers and cool, wet winters typical of coastal Mediterranean zones.";
        case "BSk": return "Hot summers, cold winters, and relatively low annual rainfall characterize this semi-arid grassland region.";
        case "Dfa": return "Hot, humid summers and cold, snowy winters with steady precipitation year-round.";
        case "Dfb": return "Warm summers and cold, snowy winters with distinct seasonal changes.";
        case "Dfc": return "Short, mild summers and long, extremely cold winters.";
        case "ET":  return "Cold temperatures, alpine conditions, and brief summers typical of mountain terrain.";
        case "EF":  return "Perpetual ice and snow with temperatures remaining below freezing year-round.";
        default:
            return `${fallbackName} conditions characterize the general climate of this region.`;
    }
}
