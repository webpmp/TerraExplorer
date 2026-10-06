import { stripDiacritics, areEntitiesMatchingWithDiacritics } from './geographicNormalization';

export interface AliasResolution {
    original: string;
    canonical: string;
    aliasApplied: boolean;
    aliasMatched?: string;
}

const ALIAS_DB: Record<string, string> = {
    // Countries
    "usa": "united states",
    "us": "united states",
    "u.s.": "united states",
    "u.s.a.": "united states",
    "america": "united states",
    "united states of america": "united states",
    "uk": "united kingdom",
    "u.k.": "united kingdom",
    "britain": "united kingdom",
    "great britain": "united kingdom",
    
    // Historical Names
    "constantinople": "istanbul",
    "byzantium": "istanbul",
    "peking": "beijing",
    "persia": "iran",
    "ceylon": "sri lanka",
    "siam": "thailand",
    "burma": "myanmar",
    "bombay": "mumbai",
    
    // Regional Names
    "mesopotamia": "iraq",
    "holy land": "israel",
    "gaul": "france",

    // Landmarks and Archaeological Sites
    "pyramids of gaza": "pyramids of giza",
    "the pyramids of gaza": "pyramids of giza",
    "pyramids of gazza": "pyramids of giza",
    "the pyramids of gazza": "pyramids of giza",
    "pyramids of gazah": "pyramids of giza",
    "piramids of giza": "pyramids of giza",
    "piramids of gaza": "pyramids of giza",
    "gaza pyramids": "pyramids of giza",
    "giza pyramids": "pyramids of giza",
    "great pyramid of giza": "pyramids of giza",
    "giza pyramid complex": "pyramids of giza",
    "mt everest": "mount everest",
    "the eiffel tower": "eiffel tower",
    "the grand canyon": "grand canyon",

    // Shipwrecks
    "lusitania": "rms lusitania sinking site",
    "the lusitania": "rms lusitania sinking site",
    "rms lusitania": "rms lusitania sinking site",
    "the rms lusitania": "rms lusitania sinking site",
    "lusitania wreck": "rms lusitania sinking site",
    "the lusitania wreck": "rms lusitania sinking site",
    "lusitania wreck site": "rms lusitania sinking site",
    "the lusitania wreck site": "rms lusitania sinking site",
    "rms lusitania wreck": "rms lusitania sinking site",
    "rms lusitania wreck site": "rms lusitania sinking site",
    "the rms lusitania wreck": "rms lusitania sinking site",
    "the rms lusitania wreck site": "rms lusitania sinking site",
    "lusitania sinking": "rms lusitania sinking site",
    "the lusitania sinking": "rms lusitania sinking site",
    "sinking of the lusitania": "rms lusitania sinking site",
    "sinking of the rms lusitania": "rms lusitania sinking site",
    "lusitania found": "rms lusitania sinking site",
    "the lusitania found": "rms lusitania sinking site",
    "rms lusitania found": "rms lusitania sinking site",
    "the rms lusitania found": "rms lusitania sinking site",

    // Batavia
    "batavia": "batavia shipwreck site",
    "the batavia": "batavia shipwreck site",
    "batavia wreck": "batavia shipwreck site",
    "the batavia wreck": "batavia shipwreck site",
    "batavia wreck site": "batavia shipwreck site",
    "the batavia wreck site": "batavia shipwreck site",
    "batavia shipwreck": "batavia shipwreck site",
    "the batavia shipwreck": "batavia shipwreck site",
    "batavia shipwreck site": "batavia shipwreck site",
    "the batavia shipwreck site": "batavia shipwreck site",

    // HMS Victory / HMS Victor
    "hms victor": "hms victory wreck site",
    "the hms victor": "hms victory wreck site",
    "hms victor found": "hms victory wreck site",
    "the hms victor found": "hms victory wreck site",
    "hms victor wreck": "hms victory wreck site",
    "the hms victor wreck": "hms victory wreck site",
    "hms victor wreck site": "hms victory wreck site",
    "the hms victor wreck site": "hms victory wreck site",
    "hms victory": "hms victory wreck site",
    "the hms victory": "hms victory wreck site",
    "hms victory found": "hms victory wreck site",
    "the hms victory found": "hms victory wreck site",
    "hms victory wreck": "hms victory wreck site",
    "the hms victory wreck": "hms victory wreck site",
    "hms victory wreck site": "hms victory wreck site",
    "the hms victory wreck site": "hms victory wreck site",
    "hms victory shipwreck": "hms victory wreck site",
    "the hms victory shipwreck": "hms victory wreck site",

    // Historical Battles and Events
    "battle of waterloo": "waterloo",
    "the battle of waterloo": "waterloo",
    "waterloo battlefield": "waterloo",
    "the waterloo battlefield": "waterloo",
    "battlefield of waterloo": "waterloo",
    "battle of gettysburg": "gettysburg",
    "the battle of gettysburg": "gettysburg",
    "gettysburg battlefield": "gettysburg",
    "the gettysburg battlefield": "gettysburg"
};

export function resolveAlias(normalizedQuery: string): AliasResolution {
    if (!normalizedQuery || typeof normalizedQuery !== 'string') {
        return {
            original: normalizedQuery,
            canonical: normalizedQuery,
            aliasApplied: false
        };
    }

    const matched = ALIAS_DB[normalizedQuery];
    if (matched) {
        return {
            original: normalizedQuery,
            canonical: matched,
            aliasApplied: true,
            aliasMatched: normalizedQuery
        };
    }

    const stripped = stripDiacritics(normalizedQuery);
    if (ALIAS_DB[stripped]) {
        return {
            original: normalizedQuery,
            canonical: ALIAS_DB[stripped],
            aliasApplied: true,
            aliasMatched: stripped
        };
    }
    
    for (const [aliasKey, targetCanonical] of Object.entries(ALIAS_DB)) {
        if (areEntitiesMatchingWithDiacritics(aliasKey, normalizedQuery)) {
            return {
                original: normalizedQuery,
                canonical: targetCanonical,
                aliasApplied: true,
                aliasMatched: aliasKey
            };
        }
    }

    return {
        original: normalizedQuery,
        canonical: normalizedQuery,
        aliasApplied: false
    };
}
