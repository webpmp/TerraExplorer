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
