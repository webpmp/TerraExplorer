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
    "gaul": "france"
};

export function resolveAlias(normalizedQuery: string): AliasResolution {
    const matched = ALIAS_DB[normalizedQuery];
    
    if (matched) {
        return {
            original: normalizedQuery,
            canonical: matched,
            aliasApplied: true,
            aliasMatched: normalizedQuery
        };
    }
    
    return {
        original: normalizedQuery,
        canonical: normalizedQuery,
        aliasApplied: false
    };
}
