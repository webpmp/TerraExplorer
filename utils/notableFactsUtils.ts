/**
 * Utility functions for parsing, normalizing, deduplicating,
 * and filtering notable facts for progressive, non-redundant InfoPanel presentation.
 */

export interface ParsedNotableFact {
  title: string;
  description: string;
  name?: string;
  summary?: string;
  text?: string;
  wikipediaUrl?: string;
  [key: string]: any;
}

/**
 * Parses a raw notable fact item (string or object) into structured { title, description }.
 */
export const parseNotableFactItem = (n: any): ParsedNotableFact | null => {
  if (!n) return null;
  if (typeof n === 'string') {
    const text = n.trim();
    if (!text) return null;
    const colonIdx = text.indexOf(':');
    if (colonIdx !== -1 && colonIdx < 50) {
      return { title: text.substring(0, colonIdx).trim(), description: text.substring(colonIdx + 1).trim() };
    }
    const dashIdx = text.indexOf(' — ') !== -1 ? text.indexOf(' — ') : (text.indexOf(' - ') !== -1 ? text.indexOf(' - ') : -1);
    if (dashIdx !== -1 && dashIdx < 50) {
      return { title: text.substring(0, dashIdx).trim(), description: text.substring(dashIdx + 3).trim() };
    }
    const match = text.match(/^([A-Z][A-Za-z0-9\s'-]{2,35}?)\s+(?:is|offers|features|was|has|provides|known for|designated|consists of|contains|serves as|stretches|lies|stands|showcases|serves|attracts)\b\s*(.*)$/i);
    if (match && match[1]) {
      const descPart = text.substring(match[1].length).trim();
      return {
        title: match[1].trim(),
        description: descPart.charAt(0).toUpperCase() + descPart.slice(1)
      };
    }
    if (text.length > 50) {
      return { title: "Notable Feature", description: text };
    }
    return { title: text, description: "" };
  }
  if (typeof n === 'object' && n !== null) {
    const title = (n.title || n.name || (n.text && !n.summary && !n.description ? n.text : "") || "").trim();
    const description = (n.description || n.summary || n.significance || (n.text && n.text !== title ? n.text : "") || "").trim();
    if (!title && description) {
      return parseNotableFactItem(description);
    }
    if (title && !description && title.length > 50) {
      return parseNotableFactItem(title);
    }
    if (!title && !description) return null;
    return {
      ...n,
      title,
      description
    };
  }
  return null;
};

/**
 * Normalizes text for comparison by collapsing repeated whitespace, trimming, and lowercasing.
 */
export const normalizeFactComparisonKey = (text: string): string => {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const COMMON_STOPWORDS = new Set([
  'a', 'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost', 'along', 'also', 'although',
  'an', 'and', 'another', 'any', 'are', 'area', 'around', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'done', 'down', 'during', 'each',
  'early', 'either', 'even', 'fact', 'facts', 'feature', 'features', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'if', 'in',
  'information', 'into', 'is', 'it', 'item', 'items', 'its', 'itself', 'just', 'later', 'like', 'located',
  'location', 'made', 'make', 'many', 'may', 'might', 'more', 'most', 'much', 'must', 'my', 'near',
  'neither', 'no', 'nor', 'not', 'notable', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'onto',
  'or', 'other', 'our', 'ours', 'out', 'over', 'own', 'part', 'place', 'present', 'region', 'same',
  'see', 'several', 'she', 'should', 'side', 'since', 'site', 'so', 'some', 'such', 'summary', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'time', 'to', 'too', 'under', 'until', 'up', 'upon', 'us', 'used', 'various',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'within', 'without', 'would', 'you', 'your'
]);

const SEMANTIC_SYNONYM_MAP: Record<string, string> = {
  'reached': 'arrive',
  'arrived': 'arrive',
  'attained': 'arrive',
  'founded': 'found',
  'founding': 'found',
  'established': 'found',
  'establishing': 'found',
  'chartered': 'found',
  'created': 'create',
  'built': 'build',
  'constructed': 'build',
  'construction': 'build',
  'finished': 'build',
  'completed': 'build',
  'erected': 'build',
  'designed': 'design',
  'engineered': 'design',
  'planned': 'design',
  'discovered': 'discover',
  'located': 'discover',
  'uncovered': 'discover',
  'sank': 'sink',
  'sinking': 'sink',
  'shipwrecked': 'sink',
  'grounded': 'sink',
  'wrecked': 'sink',
  'became': 'become',
  'served': 'serve',
  'operated': 'serve',
  'functioned': 'serve',
  'trade': 'trade',
  'trading': 'trade',
  'commerce': 'trade',
  'commercial': 'trade',
  'center': 'center',
  'centre': 'center',
  'hub': 'center',
  'voyage': 'voyage',
  'expedition': 'voyage',
  'journey': 'voyage',
  'trek': 'voyage',
  'explorers': 'explorer',
  'expeditions': 'voyage',
  'searching': 'search',
  'searched': 'search',
  'moon': 'lunar',
  'spacecraft': 'module',
  'capsule': 'module',
  'vessel': 'ship',
  'vessels': 'ship',
  'ships': 'ship',
  'galleon': 'ship',
  'steamship': 'ship',
  'steamer': 'ship',
  'returning': 'return',
  'returned': 'return',
  'held': 'preserve',
  'preserved': 'preserve',
  'holdings': 'collection',
  'collections': 'collection'
};

/**
 * Normalizes text for semantic fact comparison.
 */
export function normalizeSemanticFactText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`~]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[.,;:!?"'()\[\]{}]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts raw numbers and normalized quantities from text.
 */
export function extractFactNumbers(text: string): string[] {
  if (!text) return [];
  const normalized = text.toLowerCase().replace(/,/g, '').replace(/[-–—]/g, ' ');
  const matches = normalized.match(/\b\d+(?:\.\d+)?\b/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Determines whether a notable fact repeats or is substantially subsumed by existing text
 * (such as description, context notes, subtitle, etc.) at the factual/semantic level.
 */
export function isFactSubsumedByText(
  fact: string | ParsedNotableFact | any,
  existingTexts: string | string[] | any
): boolean {
  if (!fact) return true;

  const parsed = parseNotableFactItem(fact);
  if (!parsed) return true;

  const title = (parsed.title || '').trim();
  const desc = (parsed.description || '').trim();
  if (!title && !desc) return true;

  // Flatten existing texts
  const existingList: string[] = Array.isArray(existingTexts)
    ? existingTexts.map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.summary || ''))).filter(Boolean)
    : (existingTexts ? [typeof existingTexts === 'string' ? existingTexts : (existingTexts?.text || existingTexts?.description || '')] : []);

  const baseText = existingList.join('\n\n').trim();
  if (!baseText) return false;

  const factFullText = desc ? (title && title !== 'Notable Feature' ? `${title}: ${desc}` : desc) : title;
  const normBase = normalizeSemanticFactText(baseText);
  const normFactDesc = normalizeSemanticFactText(desc || title);
  const normFactFull = normalizeSemanticFactText(factFullText);

  // 1. Exact or normalized containment
  if (normBase.includes(normFactDesc) || normBase.includes(normFactFull)) {
    return true;
  }

  // 2. Numbers & Measurements Check:
  const factNumbers = extractFactNumbers(desc || factFullText);
  const baseNumbers = new Set(extractFactNumbers(baseText));
  const novelNumbers = factNumbers.filter(n => !baseNumbers.has(n));

  if (novelNumbers.length > 0) {
    const hasSignificantNovelNumber = novelNumbers.some(n => {
      const val = parseFloat(n);
      return val > 1; // Significant number (not single-digit generic 1)
    });
    if (hasSignificantNovelNumber) {
      const wordsInFact = normFactDesc
        .split(/\s+/)
        .map(w => SEMANTIC_SYNONYM_MAP[w] || w)
        .filter(w => w.length >= 3 && !COMMON_STOPWORDS.has(w));
      
      const unMatchedWords = wordsInFact.filter(w => !normBase.includes(w) && !(SEMANTIC_SYNONYM_MAP[w] && normBase.includes(SEMANTIC_SYNONYM_MAP[w])));
      if (unMatchedWords.length >= 2 || novelNumbers.length >= 2) {
        return false;
      }
    }
  }

  // 3. Named Entities / Associated People / Novel Proper Nouns:
  const rawDescWords = (desc || factFullText).split(/\s+/);
  const ignoredCaps = new Set([
    'The', 'This', 'That', 'These', 'Those', 'In', 'On', 'At', 'After', 'Before', 'During',
    'A', 'An', 'It', 'Its', 'They', 'He', 'She', 'His', 'Her', 'Notable', 'Feature',
    'Moon', 'Earth', 'Sun', 'Pacific', 'Atlantic', 'Indian', 'Mediterranean', 'Ocean', 'Sea', 'North', 'South', 'East', 'West',
    'Ancient', 'Historic', 'Major', 'National', 'International', 'European', 'American', 'Asian', 'African',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
  ]);

  const novelNamedEntities: string[] = [];
  for (let i = 0; i < rawDescWords.length; i++) {
    const raw = rawDescWords[i].replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (/^[A-Z][a-zA-ZÀ-ÿ-]+$/.test(raw)) {
      if (i === 0 && ignoredCaps.has(raw)) continue;
      if (ignoredCaps.has(raw)) continue;
      
      const normWord = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const synWord = SEMANTIC_SYNONYM_MAP[normWord] || normWord;
      if (!normBase.includes(normWord) && !normBase.includes(synWord) && !COMMON_STOPWORDS.has(normWord)) {
        novelNamedEntities.push(normWord);
      }
    }
  }

  if (novelNamedEntities.length >= 2 || (novelNamedEntities.length === 1 && !normBase.includes(novelNamedEntities[0]))) {
    const wordsInFact = normFactDesc
      .split(/\s+/)
      .map(w => SEMANTIC_SYNONYM_MAP[w] || w)
      .filter(w => w.length >= 3 && !COMMON_STOPWORDS.has(w));
    
    const unMatchedWords = wordsInFact.filter(w => !normBase.includes(w) && !(SEMANTIC_SYNONYM_MAP[w] && normBase.includes(SEMANTIC_SYNONYM_MAP[w])));
    if (unMatchedWords.length >= 2) {
      return false;
    }
  }

  // 4. Word-level semantic proposition overlap
  const wordsInFact = normFactDesc
    .split(/\s+/)
    .map(w => SEMANTIC_SYNONYM_MAP[w] || w)
    .filter(w => w.length >= 3 && !COMMON_STOPWORDS.has(w));

  // If there are too few informative words (< 3) and direct containment did not match, do not assume subsumption
  if (wordsInFact.length < 3) {
    return false;
  }

  let matchedWords = 0;
  for (const word of wordsInFact) {
    if (normBase.includes(word)) {
      matchedWords++;
    } else {
      const syn = SEMANTIC_SYNONYM_MAP[word];
      if (syn && normBase.includes(syn)) {
        matchedWords++;
      } else {
        const stem = word.length > 5 ? word.slice(0, 5) : word;
        if (stem.length >= 4 && normBase.includes(stem)) {
          matchedWords++;
        }
      }
    }
  }

  const matchRatio = matchedWords / wordsInFact.length;

  const unMatchedWords = wordsInFact.filter(w => {
    if (normBase.includes(w)) return false;
    const syn = SEMANTIC_SYNONYM_MAP[w];
    if (syn && normBase.includes(syn)) return false;
    const stem = w.length > 5 ? w.slice(0, 5) : w;
    if (stem.length >= 4 && normBase.includes(stem)) return false;
    return true;
  });

  // If the fact introduces meaningful new concepts, actions, or engineering details with low overall overlap (< 50%),
  // it is additive and not subsumed.
  if (matchRatio < 0.50 && unMatchedWords.length >= 3) {
    return false;
  }

  // If all numbers/dates in the fact are already in the base text (no novel numbers) and no novel entities,
  // then a moderate overlap (>= 40%) of informative nouns/verbs indicates the same underlying factual claim.
  if (factNumbers.length > 0 && novelNumbers.length === 0 && novelNamedEntities.length === 0) {
    if (matchRatio >= 0.40) {
      return true;
    }
  }

  if (matchRatio >= 0.65 || (wordsInFact.length <= 6 && matchRatio >= 0.50)) {
    return true;
  }

  return false;
}

/**
 * Filters a list of notable facts against existing InfoPanel narrative sections (description, context notes, etc.)
 * and against preceding notable facts to ensure strict progressive presentation and no semantic duplication.
 */
export const filterAdditiveNotableFacts = <T = any>(
  facts: T[],
  existingTexts: string | string[] | any = []
): T[] => {
  if (!Array.isArray(facts)) {
    return [];
  }

  const existingList: string[] = Array.isArray(existingTexts)
    ? existingTexts.map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.summary || ''))).filter(Boolean)
    : (existingTexts ? [typeof existingTexts === 'string' ? existingTexts : (existingTexts?.text || existingTexts?.description || '')] : []);

  const accumulatedContext: string[] = [...existingList];
  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const item of facts) {
    if (!item) continue;

    const parsed = parseNotableFactItem(item);
    if (!parsed) continue;

    const normTitle = normalizeFactComparisonKey(parsed.title);
    const normDesc = normalizeFactComparisonKey(parsed.description);

    if (!normTitle && !normDesc) continue;

    // Filter out generic fallback/placeholder text
    if (
      normDesc.includes('no widely documented') ||
      normDesc.includes('no historical or cultural facts were found') ||
      normTitle.includes('no widely documented')
    ) {
      continue;
    }

    // Filter out duplicate identical keys
    const key = normTitle && normDesc ? `${normTitle}:::${normDesc}` : (normTitle || normDesc);
    if (seenKeys.has(key)) {
      continue;
    }

    // Check if fact is subsumed by any existing section or prior notable facts
    if (isFactSubsumedByText(parsed, accumulatedContext)) {
      continue;
    }

    seenKeys.add(key);
    result.push(item);

    // Add accepted fact text into accumulated context so future facts don't repeat this one
    const factText = parsed.description ? `${parsed.title ? parsed.title + ': ' : ''}${parsed.description}` : parsed.title;
    accumulatedContext.push(factText);
  }

  return result;
};

/**
 * Deduplicates notable facts while strictly preserving first-occurrence order and semantic additivity.
 */
export const deduplicateNotableFacts = <T = any>(facts: T[]): T[] => {
  if (!Array.isArray(facts)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const item of facts) {
    if (!item) continue;

    const parsed = parseNotableFactItem(item);
    if (!parsed) continue;

    const normTitle = normalizeFactComparisonKey(parsed.title);
    const normDesc = normalizeFactComparisonKey(parsed.description);

    if (!normTitle && !normDesc) continue;

    const key = normTitle && normDesc ? `${normTitle}:::${normDesc}` : (normTitle || normDesc);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(item);
    }
  }

  return result;
};
