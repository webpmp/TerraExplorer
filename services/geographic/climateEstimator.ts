export function getEstimatedClimate(lat: number, lng: number, region: string, country: string): { climateName: string, koppenCode: string, source: "estimated", confidence: "low" | "medium" | "high" } {
    const absLat = Math.abs(lat);
    let climateName = "Unknown";
    let koppenCode = "";
    let confidence: "low" | "medium" | "high" = "low";

    const c = (country || "").toLowerCase();

    // Sahara coordinates (approx 15 to 30 N, -15 to 35 E in Africa)
    if (lat > 15 && lat < 30 && lng > -15 && lng < 35 && (c.includes("algeria") || c.includes("libya") || c.includes("egypt") || c.includes("mali") || c.includes("niger") || c.includes("chad") || c.includes("sudan") || c.includes("mauritania") || c.includes("morocco"))) {
        return { climateName: "Arid (Hot Desert)", koppenCode: "BWh", source: "estimated", confidence: "high" };
    }

    // Amazon coordinates (approx -15 to 5 N, -75 to -50 W in South America)
    if (lat > -15 && lat < 5 && lng > -75 && lng < -50 && (c.includes("brazil") || c.includes("peru") || c.includes("colombia") || c.includes("venezuela") || c.includes("ecuador") || c.includes("bolivia"))) {
        return { climateName: "Tropical Rainforest", koppenCode: "Af", source: "estimated", confidence: "high" };
    }
    
    // UK / London
    if (c === "united kingdom" || c === "uk" || c === "great britain") {
        return { climateName: "Temperate Oceanic", koppenCode: "Cfb", source: "estimated", confidence: "high" };
    }

    // Broad heuristics
    if (absLat < 23.5) {
        if (c.includes("brazil") || c.includes("indonesia") || c.includes("congo")) {
            climateName = "Tropical";
            koppenCode = "Af";
            confidence = "medium";
        } else {
            climateName = "Tropical Savanna";
            koppenCode = "Aw";
            confidence = "low";
        }
    } else if (absLat >= 23.5 && absLat < 40) {
        if (c.includes("egypt") || c.includes("saudi") || c.includes("algeria") || (c.includes("australia") && lng > 115 && lng < 145)) {
            climateName = "Arid (Hot Desert)";
            koppenCode = "BWh";
            confidence = "medium";
        } else if (c.includes("italy") || c.includes("spain") || c.includes("greece")) {
             climateName = "Mediterranean";
             koppenCode = "Csa";
             confidence = "medium";
        } else {
             climateName = "Temperate / Semi-Arid";
             koppenCode = "BSk";
             confidence = "low";
        }
    } else if (absLat >= 40 && absLat < 60) {
        if (c.includes("russia") || c.includes("canada")) {
             climateName = "Subarctic / Continental";
             koppenCode = "Dfc";
             confidence = "medium";
        } else {
             climateName = "Temperate Continental";
             koppenCode = "Dfb";
             confidence = "low";
        }
    } else {
        climateName = "Polar / Tundra";
        koppenCode = "ET";
        confidence = "medium";
    }

    return { climateName, koppenCode, source: "estimated", confidence };
}

export function getClimateDescription(koppenCode: string, fallbackName: string): string {
    switch (koppenCode) {
        case "Af": return "Warm temperatures persist year-round with a pronounced wet season and heavy annual rainfall.";
        case "Aw": return "Warm year-round with a distinct dry season and a marked wet season.";
        case "BWh": return "Characterized by hot temperatures and extremely low annual rainfall.";
        case "Cfb": return "Mild summers and cool winters with relatively consistent precipitation throughout the year.";
        case "Csa": return "Warm to hot, dry summers paired with mild, wet winters.";
        case "BSk": return "Hot summers, mild to cold winters, and relatively low annual rainfall characterize this region.";
        case "Dfc": return "Short, mild summers and long, extremely cold winters.";
        case "Dfb": return "Warm summers and cold winters with distinct seasonal changes.";
        case "ET":  return "Extremely cold year-round with very brief, cool summers and limited vegetation.";
        default:
            return `${fallbackName} conditions characterize the general climate of this region.`;
    }
}
