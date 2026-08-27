/**
 * Description Normalization & Coordinate Deduplication Utility
 * 
 * Removes redundant latitude/longitude coordinates matching the canonical waypoint
 * from generated narrative descriptions and performs minimal, deterministic grammar/punctuation
 * repair around the removal site while preserving non-matching coordinates, numbers,
 * dates, elevations, and existing markdown structure.
 */

export interface CoordinatePairMatch {
  rawMatch: string;
  fullClauseMatch: string;
  startIndex: number;
  endIndex: number;
  lat: number;
  lng: number;
}

export interface NormalizeDescriptionOptions {
  coordinates?: {
    lat: number;
    lng: number;
  } | null;
  toleranceDeg?: number;
}

/**
 * Checks whether candidate coordinates match the canonical waypoint coordinates within tolerance.
 * Uses independent latitude and longitude checks with a default tolerance of 0.01°.
 */
export function isMatchingWaypointCoordinate(
  candidateLat: number,
  candidateLng: number,
  canonicalLat: number,
  canonicalLng: number,
  toleranceDeg: number = 0.01
): boolean {
  if (
    typeof candidateLat !== 'number' ||
    typeof candidateLng !== 'number' ||
    typeof canonicalLat !== 'number' ||
    typeof canonicalLng !== 'number' ||
    isNaN(candidateLat) ||
    isNaN(candidateLng) ||
    isNaN(canonicalLat) ||
    isNaN(canonicalLng)
  ) {
    return false;
  }

  const latDiff = Math.abs(candidateLat - canonicalLat);
  const lngDiff = Math.abs(candidateLng - canonicalLng);

  return latDiff <= toleranceDeg && lngDiff <= toleranceDeg;
}

/**
 * Parses coordinate components and extracts coordinate matches from text.
 */
export function extractCoordinateMatches(text: string): CoordinatePairMatch[] {
  if (!text) return [];

  const matches: CoordinatePairMatch[] = [];

  // Pattern 1: Cardinal degrees, e.g. "40.6892° N, 74.0445° W", "31.6528N, 79.9909W", "34.0119 ° N , 118.4952 ° W"
  // Note: we match optional leading "at", "at approximately", "around", "near" without consuming "located" / "situated" / "lying" so verbs are preserved for context
  const cardinalRegex = /(?:(?:at\s+approximately|at\s+approx\.?|approx\.?|approximately|at\s+coordinates|coordinates:?|coords:?|at|around|near)\s+)?(\[|\()?\b(\d{1,2}(?:\.\d+)?)\s*°?\s*([NSns])\s*[,/;\s]\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])\b(\]|\))?/g;

  let m: RegExpExecArray | null;
  while ((m = cardinalRegex.exec(text)) !== null) {
    const fullMatch = m[0];
    const latNum = parseFloat(m[2]);
    const latDir = m[3].toUpperCase();
    const lngNum = parseFloat(m[4]);
    const lngDir = m[5].toUpperCase();

    if (!isNaN(latNum) && !isNaN(lngNum) && latNum <= 90 && lngNum <= 180) {
      const lat = latDir === 'S' ? -latNum : latNum;
      const lng = lngDir === 'W' ? -lngNum : lngNum;
      const rawCoordStr = `${m[2]}${m[3]}, ${m[4]}${m[5]}`;

      matches.push({
        rawMatch: rawCoordStr,
        fullClauseMatch: fullMatch,
        startIndex: m.index,
        endIndex: m.index + fullMatch.length,
        lat,
        lng
      });
    }
  }

  // Pattern 2: Signed or unsigned decimal coordinate pairs with explicit "°", e.g. "40.6892°, -74.0445°" or "(-34.6037°, -58.3816°)"
  const degreePairRegex = /(?:(?:at\s+approximately|at\s+approx\.?|approx\.?|approximately|at\s+coordinates|coordinates:?|coords:?|at|around|near)\s+)?(\[|\()?(?:^|\b|\s)([+-]?\d{1,2}(?:\.\d+)?)\s*°\s*[,/;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°(?:\b|\s|$)(\]|\))?/g;

  while ((m = degreePairRegex.exec(text)) !== null) {
    const fullMatch = m[0];
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);

    // Avoid duplicate if already covered by cardinal pattern
    const isOverlapping = matches.some(
      existing => Math.max(existing.startIndex, m!.index) < Math.min(existing.endIndex, m!.index + fullMatch.length)
    );

    if (!isOverlapping && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      matches.push({
        rawMatch: fullMatch,
        fullClauseMatch: fullMatch,
        startIndex: m.index,
        endIndex: m.index + fullMatch.length,
        lat,
        lng
      });
    }
  }

  // Pattern 3: Explicit coordinate label prefix with signed decimals, e.g. "coordinates: 40.6892, -74.0445" or "at coordinates (40.6892, -74.0445)"
  const labeledDecimalRegex = /(?:(?:coords?\.?:?\s+|coordinates:?\s+|at\s+coordinates\s+))(\[|\()?\b([+-]?\d{1,2}\.\d{2,})\s*[,/;\s]\s*([+-]?\d{1,3}\.\d{2,})\b(\]|\))?/gi;

  while ((m = labeledDecimalRegex.exec(text)) !== null) {
    const fullMatch = m[0];
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);

    const isOverlapping = matches.some(
      existing => Math.max(existing.startIndex, m!.index) < Math.min(existing.endIndex, m!.index + fullMatch.length)
    );

    if (!isOverlapping && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      matches.push({
        rawMatch: fullMatch,
        fullClauseMatch: fullMatch,
        startIndex: m.index,
        endIndex: m.index + fullMatch.length,
        lat,
        lng
      });
    }
  }

  // Sort by appearance in text
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Deterministically cleans up whitespace, punctuation, dangling prepositions, and capitalization
 * in a sentence following the removal of coordinate clauses.
 */
export function cleanSentenceAfterCoordinateRemoval(sentence: string): string {
  if (!sentence) return '';

  let cleaned = sentence;

  // 1. Remove dangling introductory phrases at the very beginning of a sentence
  // e.g. "Located at approximately , the Statue..." or "Located at , the Statue..."
  cleaned = cleaned.replace(/^(?:Located|Situated|Lying|Found|Stands?|Sits?)\s+(?:at|in|near|around)?\s*(?:approximately|approx\.?)?\s*[,–—\-]?\s*/i, '');
  cleaned = cleaned.replace(/^(?:At\s+coordinates|Coordinates|Coords)\s*:?\s*[,–—\-]?\s*/i, '');
  cleaned = cleaned.replace(/^(?:At|Around|Near)\s+(?:approximately|approx\.?)?\s*[,–—\-]?\s*/i, '');

  // 2. Clean up dangling prepositions in the middle of sentences
  // e.g. "The site is located at on the western edge" -> "The site is located on the western edge"
  // e.g. "This marine reef is situated off the Atlantic coast" -> preserves "situated off"
  cleaned = cleaned.replace(/\b(located|situated|lying|found|stands?|sits?)\s+at\s+(on|in|along|by|off|near|around|to|from)\b/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(located|situated|lying|found|stands?|sits?)\s+(?:at|around|near)\s*,?\s*([a-zA-Z])/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(at|around|near)\s+(on|in|along|by|off|near|around|to|from)\b/gi, '$2');

  // 3. Clean up sentence endings with dangling prepositions
  // e.g. "...stands 305 feet tall at ." -> "...stands 305 feet tall."
  cleaned = cleaned.replace(/\s+(?:at|around|near|at\s+approximately|located\s+at)\s*([.!?])/gi, '$1');

  // 4. Fix double commas, comma before period, leading/trailing punctuation
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/\[\s*\]/g, '');
  cleaned = cleaned.replace(/^\s*[,;:–—\-]\s*/, '');
  cleaned = cleaned.replace(/\s+([,;:?.!])/g, '$1');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  cleaned = cleaned.trim();

  // 5. Capitalize first letter of sentence if needed
  if (cleaned.length > 0) {
    const firstChar = cleaned.charAt(0);
    if (firstChar >= 'a' && firstChar <= 'z') {
      cleaned = firstChar.toUpperCase() + cleaned.slice(1);
    }
  }

  return cleaned;
}

/**
 * Normalizes description text by removing redundant canonical waypoint coordinates
 * while leaving other numbers, non-matching coordinates, and factual narrative intact.
 */
export function normalizeDescription(
  description: string,
  options?: NormalizeDescriptionOptions
): string {
  if (!description || typeof description !== 'string') return '';
  if (!options?.coordinates || typeof options.coordinates.lat !== 'number' || typeof options.coordinates.lng !== 'number') {
    return description;
  }

  const { lat: canonicalLat, lng: canonicalLng } = options.coordinates;
  const toleranceDeg = typeof options.toleranceDeg === 'number' ? options.toleranceDeg : 0.01;

  // Split into lines/paragraphs to preserve structure
  const lines = description.split('\n');
  const normalizedLines: string[] = [];

  for (const line of lines) {
    // Preserve markdown headings as-is
    if (line.trim().startsWith('#')) {
      normalizedLines.push(line);
      continue;
    }

    const matches = extractCoordinateMatches(line);
    if (matches.length === 0) {
      normalizedLines.push(line);
      continue;
    }

    // Filter to only matches that correspond to the canonical coordinates
    const matchingToRemove = matches.filter(m =>
      isMatchingWaypointCoordinate(m.lat, m.lng, canonicalLat, canonicalLng, toleranceDeg)
    );

    if (matchingToRemove.length === 0) {
      normalizedLines.push(line);
      continue;
    }

    // Process removal from right to left (descending startIndex) to avoid index shifts
    let processedLine = line;
    for (let i = matchingToRemove.length - 1; i >= 0; i--) {
      const match = matchingToRemove[i];
      const before = processedLine.slice(0, match.startIndex);
      const after = processedLine.slice(match.endIndex);
      processedLine = before + after;
    }

    // Perform minimal deterministic cleanup on the modified line
    const cleanedLine = cleanSentenceAfterCoordinateRemoval(processedLine);
    if (cleanedLine.length > 0) {
      normalizedLines.push(cleanedLine);
    }
  }

  return normalizedLines.join('\n');
}
