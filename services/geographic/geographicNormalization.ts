/**
 * Strips diacritics and combining marks from a string for robust matching.
 * Converts to NFD and removes \u0300-\u036f combining characters.
 */
export function stripDiacritics(text: string): string {
  if (!text || typeof text !== 'string') return "";
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface UnicodeNormalizedForms {
  original: string;
  originalLower: string;
  nfd: string;
  nfc: string;
  diacriticStripped: string;
  diacriticStrippedLower: string;
}

/**
 * Generates standard Unicode representations for robust multi-layer entity matching:
 * - Original Unicode form
 * - Lowercase Unicode form
 * - Unicode NFD-normalized form
 * - Unicode NFC-normalized form
 * - Diacritic-stripped comparison form
 * - Case-insensitive diacritic-stripped comparison form
 */
export function getUnicodeNormalizedForms(text: string): UnicodeNormalizedForms {
  const original = text || "";
  const originalLower = original.toLowerCase();
  const nfd = original.normalize('NFD');
  const nfc = original.normalize('NFC');
  const diacriticStripped = stripDiacritics(original);
  const diacriticStrippedLower = diacriticStripped.toLowerCase();

  return {
    original,
    originalLower,
    nfd,
    nfc,
    diacriticStripped,
    diacriticStrippedLower
  };
}

/**
 * Checks whether two entity strings match across any Unicode / diacritic / case variations.
 */
export function areEntitiesMatchingWithDiacritics(a: string, b: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const aTrim = a.trim();
  const bTrim = b.trim();
  if (aTrim === bTrim) return true;

  const aForms = getUnicodeNormalizedForms(aTrim);
  const bForms = getUnicodeNormalizedForms(bTrim);

  if (aForms.originalLower === bForms.originalLower) return true;
  if (aForms.nfc === bForms.nfc) return true;
  if (aForms.nfd === bForms.nfd) return true;
  if (aForms.diacriticStrippedLower === bForms.diacriticStrippedLower) return true;

  return false;
}

export function normalizeGeographicQuery(entity: string): string {
  if (!entity || typeof entity !== 'string') return "";
  
  // 1. Unicode normalization (NFC is standard)
  let str = entity.normalize('NFC');
  
  // 2. Replace smart quotes with standard quotes
  str = str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  
  // 3. Remove excess whitespace and normalize casing for processing
  str = str.trim().replace(/\s+/g, ' ').toLowerCase();
  
  // 4. Punctuation handling: we generally keep alphanumeric, spaces, commas, and hyphens.
  // Note: we want to preserve commas for format like "City, State".
  // For strict normalization, we might also strip out other punctuation.
  
  // State abbreviation mapping (to match previous logic but in a cleaner way)
  const stateMap: Record<string, string> = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas", "ca": "california",
    "co": "colorado", "ct": "connecticut", "de": "delaware", "fl": "florida", "ga": "georgia",
    "hi": "hawaii", "id": "idaho", "il": "illinois", "in": "indiana", "ia": "iowa",
    "ks": "kansas", "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi", "mo": "missouri",
    "mt": "montana", "ne": "nebraska", "nv": "nevada", "nh": "new hampshire", "nj": "new jersey",
    "nm": "new mexico", "ny": "new york", "nc": "north carolina", "nd": "north dakota", "oh": "ohio",
    "ok": "oklahoma", "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
    "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah", "vt": "vermont",
    "va": "virginia", "wa": "washington", "wv": "west virginia", "wi": "wisconsin", "wy": "wyoming"
  };

  // We return a strictly lowercased normalized string as the lookup key.
  // The original geminiService logic tried to title-case things.
  // We'll separate the lookup normalization from the display formatting if needed,
  // but for geographic queries, lowercase is canonical.
  
  // Handle patterns like "plano, texas" or "plano tx"
  const commaMatch = str.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    const city = commaMatch[1].trim();
    let stateOrCountry = commaMatch[2].trim();
    if (stateMap[stateOrCountry]) {
      stateOrCountry = stateMap[stateOrCountry];
    }
    return `${city}, ${stateOrCountry}`;
  }

  // Handle "plano tx" without comma
  const spaceStateMatch = str.match(/^(.+?)\s+([a-z]{2})$/);
  if (spaceStateMatch && stateMap[spaceStateMatch[2]]) {
    const city = spaceStateMatch[1].trim();
    const state = stateMap[spaceStateMatch[2]];
    return `${city}, ${state}`;
  }

  // Handle "dallas texas" or "boston massachusetts" without comma
  for (const [stAbbr, stName] of Object.entries(stateMap)) {
    const regex = new RegExp(`^(.+?)\\s+${stName}$`, 'i');
    const match = str.match(regex);
    if (match) {
      const city = match[1].trim();
      return `${city}, ${stName}`;
    }
  }
  
  return str;
}
