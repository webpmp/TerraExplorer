import { isPlaceholderString, normalizeDisplayText } from '../components/InfoPanel';

export type DescriptionQuality = 'substantive' | 'insufficient' | 'empty' | 'placeholder';

export interface DescriptionReadiness {
  isReady: boolean;
  quality: DescriptionQuality;
  reason: string;
  sentenceCount: number;
  charCount: number;
}

/**
 * Split text into meaningful sentences, ignoring abbreviations and decimals.
 */
function extractSentences(text: string): string[] {
  if (!text) return [];
  // Match sentence terminators (. ! ?) followed by whitespace or end of string, avoiding common abbreviations (e.g., e.g., i.e., St., Dr.)
  const rawSentences = text
    .replace(/(?:Mr|Mrs|Ms|Dr|Prof|St|Ave|Rd|Gen|Gov|e\.g|i\.e)\./gi, match => match.replace('.', '@DOT@'))
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/@DOT@/g, '.').trim())
    .filter(s => s.length > 5);
  return rawSentences;
}

function isPlaceholderDescription(text: string): boolean {
  if (isPlaceholderString(text)) return true;
  const clean = text.toLowerCase().trim();
  return (
    clean.startsWith('researching ') ||
    clean.startsWith('information on ') ||
    clean.startsWith('loading ') ||
    clean.startsWith('discovering ') ||
    clean.startsWith('fetching ') ||
    clean.includes('data unavailable') ||
    clean.includes('information is being researched')
  );
}

/**
 * Checks whether text is merely a tautological or trivial restatement of the entity's name/type.
 * e.g. "Cattedrale di Como is a church.", "A place in Italy."
 */
function isTautologicalOrTrivial(text: string, entityName?: string): boolean {
  const clean = text.toLowerCase().trim();
  const eName = (entityName || '').toLowerCase().trim();

  // Pattern checks for minimal one-clause label summaries
  const trivialPatterns = [
    /^(?:a|an|the)\s+(?:historic\s+)?(?:church|cathedral|villa|museum|town|city|village|park|lake|island|building|monument|place|site|location|promontory|garden|estate)\s+(?:in|on|at|near|with|known\s+for|famous\s+for)\s+[^.]{1,120}\.?$/i,
    /^(?:a|an|the)\s+[a-z\s-]{1,35}\s+(?:with|known\s+for|famous\s+for|featuring)\s+[a-z\s,-]{1,120}\.?$/i,
    /^(?:point\s+of\s+interest|historic\s+landmark|tourist\s+attraction)\s+(?:in|on|at|near)\s+[^.]{1,80}\.?$/i,
  ];

  for (const pattern of trivialPatterns) {
    if (pattern.test(clean)) {
      return true;
    }
  }

  if (eName && (clean === eName || clean.replace(/\.$/, '') === eName)) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a location description possesses substantive documentary depth.
 *
 * A description is NOT ready (insufficient) if:
 * 1. It is empty or whitespace.
 * 2. It is a known placeholder (e.g., "Researching this location...", "Information on X").
 * 3. It is a single generic sentence, brief label, or tautology (e.g., "A villa on a lake promontory in Lenno known for its topiary gardens.").
 * 4. It lacks substantive documentary/contextual content (must have multiple meaningful sentences with documentary context).
 *
 * A description IS ready (substantive) if:
 * 1. It contains multiple meaningful sentences (at least 2 sentences and >= 100 chars).
 * 2. It provides contextual depth (historical origin, architectural significance, cultural role, geographic setting, or specific features).
 * 3. It avoids generic filler and superficial one-sentence labels.
 */
export function evaluateDescriptionReadiness(
  description?: string | null,
  entityName?: string
): DescriptionReadiness {
  if (!description || typeof description !== 'string') {
    return {
      isReady: false,
      quality: 'empty',
      reason: 'Description is empty or missing.',
      sentenceCount: 0,
      charCount: 0
    };
  }

  const cleanText = normalizeDisplayText(description).trim();
  const charCount = cleanText.length;

  if (charCount === 0) {
    return {
      isReady: false,
      quality: 'empty',
      reason: 'Description is empty or whitespace.',
      sentenceCount: 0,
      charCount: 0
    };
  }

  if (isPlaceholderDescription(cleanText)) {
    return {
      isReady: false,
      quality: 'placeholder',
      reason: 'Description contains a temporary or generic placeholder string.',
      sentenceCount: 1,
      charCount
    };
  }

  if (isTautologicalOrTrivial(cleanText, entityName)) {
    return {
      isReady: false,
      quality: 'insufficient',
      reason: 'Description is a trivial, one-sentence or tautological label summary.',
      sentenceCount: 1,
      charCount
    };
  }

  const sentences = extractSentences(cleanText);
  const sentenceCount = sentences.length;

  // Substantive criteria:
  // Must contain multiple meaningful sentences with adequate documentary length (>= 2 sentences and >= 100 chars)
  // OR a very rich multi-clause documentary paragraph (>= 200 chars with informative punctuation / clauses)
  const hasMultipleSentences = sentenceCount >= 2 && charCount >= 100;
  const hasRichSingleLongProse = sentenceCount >= 1 && charCount >= 200 && (cleanText.includes(',') || cleanText.includes(';'));

  if (!hasMultipleSentences && !hasRichSingleLongProse) {
    return {
      isReady: false,
      quality: 'insufficient',
      reason: `Description contains only ${sentenceCount} sentence (${charCount} chars), lacking multi-sentence documentary context.`,
      sentenceCount,
      charCount
    };
  }

  // Check for substantive keywords / documentary signals (history, architecture, founding, centuries, geography, significance)
  const substantiveSignals = [
    /\b(?:century|centuries|founded|built|constructed|designed|architect|architecture|gothic|renaissance|baroque|roman|medieval|neoclassical|estate|palace|peninsula|promontory|shores?|lake|overlooking|situated|located|known\s+for|famous\s+for|celebrated|notable|historic|heritage|monument|facade|interior|frescoes|sculptures|tomb|relic|paintings|artworks|gardens|terraces|patron|dynasty|order|diocese|cathedral|sanctuary)\b/i,
    /\b(?:origin|origins|established|commissioned|consecrated|restored|expanded|dating|dates\s+back|era|period|1[0-9]{3}|20[0-2][0-9])\b/i
  ];

  const hasSubstantiveSignal = substantiveSignals.some(regex => regex.test(cleanText));

  // If text is multi-sentence with substantive documentary content, it qualifies!
  if (hasSubstantiveSignal && (hasMultipleSentences || hasRichSingleLongProse)) {
    return {
      isReady: true,
      quality: 'substantive',
      reason: `Substantive documentary introduction available (${sentenceCount} sentences, ${charCount} chars).`,
      sentenceCount,
      charCount
    };
  }

  if (hasMultipleSentences && charCount >= 140) {
    return {
      isReady: true,
      quality: 'substantive',
      reason: `Substantive documentary introduction available (${sentenceCount} sentences, ${charCount} chars).`,
      sentenceCount,
      charCount
    };
  }

  return {
    isReady: false,
    quality: 'insufficient',
    reason: 'Description lacks substantive documentary signals.',
    sentenceCount,
    charCount
  };
}
