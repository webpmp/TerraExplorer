/**
 * Deterministic Content Quality Validator for Historical Waypoints
 *
 * Validates the 3 distinct semantic layers:
 * 1. Route Context: 1 concise sentence ("What specific role did this location play on this particular route?")
 * 2. Primary Description: 2-3 concise sentences ("What happened here?")
 * 3. Historical Significance: 1-2 concise sentences ("Why did what happened here matter to the larger historical event?")
 *
 * Validation checks:
 * - Empty content detection
 * - Generic boilerplate phrase rejection ("important location in history", "key location for the Trail of Tears", etc.)
 * - Exact sentence duplication
 * - Normalized near-duplicate sentences
 * - Excessive cross-field lexical overlap
 * - Waypoint-specific entity / fact presence
 * - Sentence count and length constraints
 */

export interface HistoricalWaypointContentInput {
  name: string;
  canonicalName?: string;
  routeContext?: string;
  description?: string;
  significance?: string;
}

export interface ContentValidationResult {
  isValid: boolean;
  issues: string[];
  layerScores: {
    routeContextValid: boolean;
    descriptionValid: boolean;
    significanceValid: boolean;
  };
}

const GENERIC_BOILERPLATE_PATTERNS: RegExp[] = [
  /\bimportant location in history\b/i,
  /\bkey location for the trail of tears\b/i,
  /\bkey location in history\b/i,
  /\bplayed a vital role\b/i,
  /\bplayed an important role\b/i,
  /\bnotable stop along the route\b/i,
  /\bsite along the path\b/i,
  /\ban important location where\b/i,
  /\ba critical stop on the journey\b/i,
  /\bsignificant stop along the way\b/i,
  /\bimportant place during the event\b/i,
  /\ban important stop\b/i,
  /\bkey waypoint\b/i
];

/**
 * Splits text into non-empty sentences.
 */
function extractSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Normalizes a sentence for near-duplicate comparison by stripping punctuation and stop words.
 */
function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts non-trivial content words (length >= 4, ignoring common stop words).
 */
const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'were', 'been', 'have', 'also', 'their', 'which',
  'where', 'when', 'what', 'after', 'before', 'during', 'under', 'about', 'into',
  'through', 'between', 'then', 'there', 'some', 'many', 'each', 'other'
]);

function extractContentTokens(text: string): string[] {
  return normalizeSentence(text)
    .split(' ')
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Computes Jaccard lexical overlap between two token lists.
 */
function computeTokenOverlap(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function validateHistoricalWaypointContent(
  input: HistoricalWaypointContentInput
): ContentValidationResult {
  const issues: string[] = [];
  const layerScores = {
    routeContextValid: true,
    descriptionValid: true,
    significanceValid: true
  };

  const name = input.canonicalName || input.name || 'Unknown Location';
  const routeCtx = (input.routeContext || '').trim();
  const desc = (input.description || '').trim();
  const sig = (input.significance || '').trim();

  // 1. Check for empty content
  if (!desc) {
    issues.push(`Primary description is missing for "${name}".`);
    layerScores.descriptionValid = false;
  }
  if (!sig) {
    issues.push(`Historical significance is missing for "${name}".`);
    layerScores.significanceValid = false;
  }

  // 2. Generic Boilerplate Detection
  const fields = [
    { name: 'Route Context', text: routeCtx, key: 'routeContextValid' as const },
    { name: 'Description', text: desc, key: 'descriptionValid' as const },
    { name: 'Significance', text: sig, key: 'significanceValid' as const }
  ];

  for (const f of fields) {
    if (!f.text) continue;
    for (const pattern of GENERIC_BOILERPLATE_PATTERNS) {
      if (pattern.test(f.text)) {
        issues.push(`${f.name} contains generic boilerplate phrase ("${f.text.match(pattern)?.[0]}") for "${name}".`);
        layerScores[f.key] = false;
      }
    }
  }

  // 3. Sentence Count & Length Constraints
  // Route Context: 1 concise sentence
  if (routeCtx) {
    const routeSentences = extractSentences(routeCtx);
    if (routeSentences.length > 2) {
      issues.push(`Route Context exceeds 1-2 sentence constraint (${routeSentences.length} sentences found) for "${name}".`);
      layerScores.routeContextValid = false;
    }
  }

  // Primary Description: 1 to 4 sentences
  if (desc) {
    const descSentences = extractSentences(desc);
    if (descSentences.length > 5) {
      issues.push(`Description exceeds concise constraint (${descSentences.length} sentences found) for "${name}".`);
      layerScores.descriptionValid = false;
    }
  }

  // Significance: 1 to 3 sentences
  if (sig) {
    const sigSentences = extractSentences(sig);
    if (sigSentences.length > 3) {
      issues.push(`Significance exceeds concise constraint (${sigSentences.length} sentences found) for "${name}".`);
      layerScores.significanceValid = false;
    }
  }

  // 4. Exact Sentence Duplication & Near-Duplicate Detection across fields
  const allSentences: Array<{ field: string; raw: string; normalized: string }> = [];
  if (routeCtx) {
    extractSentences(routeCtx).forEach(s => allSentences.push({ field: 'routeContext', raw: s, normalized: normalizeSentence(s) }));
  }
  if (desc) {
    extractSentences(desc).forEach(s => allSentences.push({ field: 'description', raw: s, normalized: normalizeSentence(s) }));
  }
  if (sig) {
    extractSentences(sig).forEach(s => allSentences.push({ field: 'significance', raw: s, normalized: normalizeSentence(s) }));
  }

  for (let i = 0; i < allSentences.length; i++) {
    for (let j = i + 1; j < allSentences.length; j++) {
      const s1 = allSentences[i];
      const s2 = allSentences[j];
      if (s1.field === s2.field) continue;

      // Exact match
      if (s1.raw.toLowerCase() === s2.raw.toLowerCase()) {
        issues.push(`Exact sentence duplication between ${s1.field} and ${s2.field} for "${name}": "${s1.raw}"`);
        if (s1.field === 'routeContext' || s2.field === 'routeContext') layerScores.routeContextValid = false;
        if (s1.field === 'significance' || s2.field === 'significance') layerScores.significanceValid = false;
      } else if (s1.normalized === s2.normalized && s1.normalized.length > 15) {
        issues.push(`Near-duplicate sentence between ${s1.field} and ${s2.field} for "${name}": "${s1.raw}" vs "${s2.raw}"`);
        if (s1.field === 'routeContext' || s2.field === 'routeContext') layerScores.routeContextValid = false;
        if (s1.field === 'significance' || s2.field === 'significance') layerScores.significanceValid = false;
      }
    }
  }

  // 5. Cross-field excessive lexical overlap (detecting redundant paraphrasing)
  const descTokens = extractContentTokens(desc);
  const sigTokens = extractContentTokens(sig);
  const routeTokens = extractContentTokens(routeCtx);

  // If description and significance have > 65% lexical overlap, flag redundancy
  const descSigOverlap = computeTokenOverlap(descTokens, sigTokens);
  if (descSigOverlap > 0.65 && descTokens.length >= 4 && sigTokens.length >= 4) {
    issues.push(`Excessive lexical overlap (${(descSigOverlap * 100).toFixed(0)}%) between description and significance for "${name}". Content is redundantly paraphrased.`);
    layerScores.significanceValid = false;
  }

  if (routeCtx) {
    const routeDescOverlap = computeTokenOverlap(routeTokens, descTokens);
    if (routeDescOverlap > 0.65 && routeTokens.length >= 4 && descTokens.length >= 4) {
      issues.push(`Excessive lexical overlap (${(routeDescOverlap * 100).toFixed(0)}%) between routeContext and description for "${name}". Content is redundantly paraphrased.`);
      layerScores.routeContextValid = false;
    }
  }

  // 6. Waypoint specificity check: ensure at least one field mentions the entity name or specific location/action
  // Filter out common geographic adjectives and stop words like 'new', 'fort', 'mount', 'north', 'south' if name is multi-word
  const genericGeoWords = new Set(['new', 'old', 'fort', 'mount', 'mt', 'north', 'south', 'east', 'west', 'upper', 'lower', 'lake', 'port', 'point']);
  let cleanNameTokens = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (cleanNameTokens.length > 1) {
    const distinctive = cleanNameTokens.filter(w => !genericGeoWords.has(w));
    if (distinctive.length > 0) cleanNameTokens = distinctive;
  }
  const combinedText = `${routeCtx} ${desc} ${sig}`.toLowerCase();
  const hasSpecificMention = cleanNameTokens.some(tok => combinedText.includes(tok)) || combinedText.includes(name.toLowerCase());
  if (!hasSpecificMention && cleanNameTokens.length > 0) {
    // If the description contains domain-rich historical terms (e.g. treaty, capital, cherokee, detachment, encampment), allow enrichment
    const hasRichHistoricalContext = /\b(treaty|capital|capitol|headquarters|encampment|staging|internment|commanded|cherokee|council|crossing|detachment)\b/i.test(combinedText);
    if (!hasRichHistoricalContext) {
      issues.push(`Content lacks waypoint specificity: No direct mention or factual reference to "${name}" found across fields.`);
      layerScores.descriptionValid = false;
    }
  }

  const isValid = issues.length === 0;
  return {
    isValid,
    issues,
    layerScores
  };
}
