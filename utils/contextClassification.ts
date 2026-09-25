/**
 * Context Classification Utility
 * 
 * Classifies location context and narrative snippets into semantically accurate categories:
 * - Historical Context: real historical events, people, dates, institutions, historical development, heritage
 * - Film & Media: movies, television, books, games, filming locations, fictional representations
 * - Cultural Context: cultural traditions, cultural significance, local identity, notable cultural associations
 * - Scientific/Geographic Context: geological, ecological, scientific, geographic, or environmental significance
 * 
 * Prevents generic geographic labels (e.g. "Northern Ireland", "Central Asia") from being classified as Historical Context.
 */

export type ContextCategory = 'HISTORICAL' | 'FILM_MEDIA' | 'CULTURAL' | 'SCIENTIFIC_GEOGRAPHIC';

export const CONTEXT_CATEGORY_HEADINGS: Record<ContextCategory, string> = {
  HISTORICAL: 'Historical Context',
  FILM_MEDIA: 'Film & Media',
  CULTURAL: 'Cultural Context',
  SCIENTIFIC_GEOGRAPHIC: 'Scientific/Geographic Context'
};

const FILM_MEDIA_PATTERNS = [
  /\b(?:filming|filmed|film\s+location|shooting\s+location|film|films|movie|movies|cinema|cinematography)\b/i,
  /\b(?:television|tv\s+series|tv\s+show|episode|episodes|season|soundtrack|director|actor|actress|hollywood|studio)\b/i,
  /\b(?:game\s+of\s+thrones|westeros|winterfell|king's\s+landing|lord\s+of\s+the\s+rings|middle-earth|hobbit|mordor)\b/i,
  /\b(?:star\s+wars|harry\s+potter|hogwarts|breaking\s+bad|the\s+witcher|marvel|dc\s+comics|peaky\s+blinders|outlander|downton\s+abbey|stranger\s+things|dr\s+who|doctor\s+who)\b/i,
  /\b(?:fictional|fiction|novel|novels|book\s+series|fantasy\s+novel|setting\s+for\s+the\s+novel|adapted\s+into|screen\s+adaptation|video\s+game|cinematic)\b/i
];

const HISTORICAL_PATTERNS = [
  /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|\b1[0-9]{3}\b|\b20[0-2][0-9]\b|\b[0-9]{1,4}\s*(?:bc|bce|ad|ce)\b)\b/i,
  /\b(?:historical|historically|history|ancient|medieval|antiquity|prehistoric|renaissance|colonial|post-war|iron\s+age|bronze\s+age)\b/i,
  /\b(?:empire|dynasty|kingdom|reign|conquest|invaded|invasion|treaty|battle\s+of|war\s+of|civil\s+war|revolution|world\s+war|rebellion|uprising)\b/i,
  /\b(?:founded\s+in|established\s+in|chartered\s+in|built\s+in|constructed\s+in|discovered\s+in|settlement\s+founded|historic\s+site|historic\s+heritage|historic\s+milestone)\b/i,
  /\b(?:archaeology|archaeological|excavation|artifact|monarch|king|queen|emperor|pharaoh|tsar|sultan|president|prime\s+minister)\b/i,
  /\b(?:sputnik|cosmodrome|space\s+race|apollo|voyage|expedition|shipwreck|wreck|wreck\s+site|salvaged|maiden\s+voyage|shackleton|columbus)\b/i
];

const CULTURAL_PATTERNS = [
  /\b(?:cultural|culturally|culture|tradition|traditions|traditional|folklore|indigenous|ritual|rituals|custom|customs)\b/i,
  /\b(?:spiritual|sacred|pilgrimage|pilgrim|religious|shinto|temple|shrine|mosque|cathedral|monastery|ceremony|ceremonial)\b/i,
  /\b(?:cuisine|culinary|gastronomy|artisan|folktale|mythology|mythological|tribal|tribe|ethnic|local\s+identity|communal)\b/i,
  /\b(?:festival|annual\s+celebration|carnival|folk\s+art|music\s+tradition|heritage\s+site|symbol\s+of\s+the\s+people)\b/i
];

const SCIENTIFIC_GEOGRAPHIC_PATTERNS = [
  /\b(?:geological|geology|tectonic|plate\s+tectonics|volcano|volcanic|crater|caldera|lava|magma|eruption|seismic|fault\s+line)\b/i,
  /\b(?:ecological|ecology|ecosystem|ecosystems|biodiversity|habitat|habitats|flora|fauna|endemic\s+species|wildlife|biosphere)\b/i,
  /\b(?:scientific|geographical|glacier|glacial|moraine|canyon|gorge|karst|formation|topography|biome|geothermal)\b/i,
  /\b(?:nature\s+reserve|national\s+park|protected\s+area|marine\s+sanctuary|conservation|meteorology|climate\s+zone|astronomical|observatory)\b/i
];

/**
 * Detects if a string is purely a geographic/administrative name or label
 * (e.g. "Northern Ireland", "Central Asia", "County Down, UK")
 * rather than substantive narrative context.
 */
export function isPureGeographicLabel(text: string): boolean {
  if (!text) return true;
  const clean = text.replace(/^#+\s*/, '').trim();
  if (clean.length === 0) return true;
  if (/^(?:n\/a|unknown|none|null|undefined|-)$/i.test(clean)) return true;

  // Very short text (<= 4 words) without punctuation or verbs is almost always a place label
  const words = clean.split(/\s+/);
  if (words.length <= 4) {
    const hasNarrativeVerb = /\b(?:is|was|were|are|served|built|filmed|occurred|took\s+place|features|contains|marks|represents|founded|established|became|provides|lies|stands|situated)\b/i.test(clean);
    const hasPunctuationSentence = /[.!?]/.test(clean);
    if (!hasNarrativeVerb && !hasPunctuationSentence) {
      return true;
    }
  }

  // Pure region/country/state names
  const pureRegionRegex = /^(?:Northern Ireland|Central Asia|Western Europe|Eastern Europe|North America|South America|Middle East|Southeast Asia|East Asia|United Kingdom|United States|County [A-Za-z\s]+|[A-Za-z\s]+ Province|[A-Za-z\s]+ Region)$/i;
  if (pureRegionRegex.test(clean)) {
    return true;
  }

  return false;
}

export interface ContextClassificationResult {
  category: ContextCategory | null;
  heading: string | null;
  isGeographicOnly: boolean;
  isMeaningful: boolean;
}

/**
 * Classifies a narrative context snippet into one of the 4 semantic categories,
 * or returns null if it is purely geographic, empty, or lacks meaningful context.
 */
export function classifyContext(text: string): ContextClassificationResult {
  if (!text || text.trim().length === 0) {
    return { category: null, heading: null, isGeographicOnly: false, isMeaningful: false };
  }

  const clean = text.replace(/^#+\s*/, '').trim();
  if (isPureGeographicLabel(clean)) {
    return { category: null, heading: null, isGeographicOnly: true, isMeaningful: false };
  }

  // Calculate pattern match scores
  let filmScore = 0;
  for (const pat of FILM_MEDIA_PATTERNS) {
    if (pat.test(clean)) filmScore += 2;
  }

  let histScore = 0;
  for (const pat of HISTORICAL_PATTERNS) {
    if (pat.test(clean)) histScore += 2;
  }

  let cultScore = 0;
  for (const pat of CULTURAL_PATTERNS) {
    if (pat.test(clean)) cultScore += 2;
  }

  let sciScore = 0;
  for (const pat of SCIENTIFIC_GEOGRAPHIC_PATTERNS) {
    if (pat.test(clean)) sciScore += 2;
  }

  // Strong Film & Media signals take top precedence for film/series queries and locations
  if (filmScore >= 2 && filmScore >= histScore) {
    return {
      category: 'FILM_MEDIA',
      heading: CONTEXT_CATEGORY_HEADINGS.FILM_MEDIA,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Scientific / Geographic significance
  if (sciScore >= 2 && sciScore > histScore && sciScore > cultScore) {
    return {
      category: 'SCIENTIFIC_GEOGRAPHIC',
      heading: CONTEXT_CATEGORY_HEADINGS.SCIENTIFIC_GEOGRAPHIC,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Cultural context
  if (cultScore >= 2 && cultScore > histScore) {
    return {
      category: 'CULTURAL',
      heading: CONTEXT_CATEGORY_HEADINGS.CULTURAL,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Historical context
  if (histScore >= 2) {
    return {
      category: 'HISTORICAL',
      heading: CONTEXT_CATEGORY_HEADINGS.HISTORICAL,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // If text is a descriptive narrative (> 40 chars with verbs) but none of the specific sets fired high:
  const hasNarrativeVerb = /\b(?:was|is|were|are|built|founded|served|became|located|developed|established|named|known|lies|stands|situated|occurred|took\s+place)\b/i.test(clean);
  if (clean.length > 40 && hasNarrativeVerb) {
    // Check if it mentions media terms at all
    if (/\b(?:film|filmed|movie|series|game|show|television|character|novel|book)\b/i.test(clean)) {
      return { category: 'FILM_MEDIA', heading: CONTEXT_CATEGORY_HEADINGS.FILM_MEDIA, isGeographicOnly: false, isMeaningful: true };
    }
    if (/\b(?:nature|wildlife|species|geology|mountain|river|lake|park|geothermal|volcano|rock)\b/i.test(clean)) {
      return { category: 'SCIENTIFIC_GEOGRAPHIC', heading: CONTEXT_CATEGORY_HEADINGS.SCIENTIFIC_GEOGRAPHIC, isGeographicOnly: false, isMeaningful: true };
    }
    if (/\b(?:tradition|custom|festival|art|sacred|spiritual|people|community)\b/i.test(clean)) {
      return { category: 'CULTURAL', heading: CONTEXT_CATEGORY_HEADINGS.CULTURAL, isGeographicOnly: false, isMeaningful: true };
    }
    // Default genuine location narrative to Historical Context if historical terms / dates or establishment is described
    if (/\b(?:century|\d{4}|ancient|historic|history|founded|built|war|battle|monarch|empire|wreck|shipwreck|site|monument|memorial|ruins)\b/i.test(clean)) {
      return { category: 'HISTORICAL', heading: CONTEXT_CATEGORY_HEADINGS.HISTORICAL, isGeographicOnly: false, isMeaningful: true };
    }
  }

  // Not enough domain substance to justify a specialized context section
  return { category: null, heading: null, isGeographicOnly: false, isMeaningful: false };
}

/**
 * Normalizes or re-classifies markdown headings in a description string.
 * - Reclassifies generic "Historical context" or "History" headings if the content below is Film & Media, Cultural, etc.
 * - Drops headings and text when content is purely a geographic label (e.g. "Northern Ireland").
 */
export function sanitizeContextMarkdown(markdown: string): string {
  if (!markdown) return '';

  const paragraphs = markdown.split(/\n\s*\n/);
  const sanitizedParagraphs: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;

    const headingMatch = p.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) {
      const headingTitle = headingMatch[1].trim();
      const headingLower = headingTitle.toLowerCase();

      // Check if this is a context heading
      const isContextHeading = /^(?:historical\s+context|historical\s+background|history|context|background|cultural\s+context|film\s*(?:&|and)\s*media|scientific\s*(?:&|\/|and)\s*geographic\s*context)$/i.test(headingLower);

      if (isContextHeading) {
        // Look at the content inside this paragraph (after the heading) or the next paragraph
        const textInParagraph = p.replace(/^#{1,3}\s+.+$/m, '').trim();
        const contentSnippet = textInParagraph || (paragraphs[i + 1] ? paragraphs[i + 1].trim() : '');

        if (isPureGeographicLabel(contentSnippet)) {
          // Skip this heading paragraph completely, and skip the next paragraph if it was the geographic label
          if (!textInParagraph && paragraphs[i + 1] && isPureGeographicLabel(paragraphs[i + 1].trim())) {
            i++; // skip next paragraph
          }
          continue;
        }

        const classification = classifyContext(contentSnippet);
        if (classification.category) {
          const targetHeading = `## ${classification.heading}`;
          if (textInParagraph) {
            sanitizedParagraphs.push(`${targetHeading}\n\n${textInParagraph}`);
          } else {
            sanitizedParagraphs.push(targetHeading);
          }
        } else if (textInParagraph) {
          // If not specialized context, keep text without fake context header
          sanitizedParagraphs.push(textInParagraph);
        }
        continue;
      }
    }

    // Normal paragraph
    sanitizedParagraphs.push(p);
  }

  return sanitizedParagraphs.join('\n\n');
}

/**
 * Normalizes text for semantic and fact-overlap comparison:
 * - strips markdown, symbols, and diacritics
 * - normalizes holidays and dates (e.g. "Christmas Day 1492" <-> "December 25, 1492")
 * - standardizes month names and temporal phrases
 * - normalizes maritime/historical event synonyms
 */
export function normalizeTextForSemanticComparison(text: string): string {
  if (!text) return '';
  let norm = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links
    .replace(/[#*_`~]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .toLowerCase();

  // Normalize holidays and specific historical dates
  norm = norm.replace(/\bchristmas\s+day\b/g, 'december 25');
  norm = norm.replace(/\bchristmas\s+eve\b/g, 'december 24');
  norm = norm.replace(/\bnew\s+year(?:'s)?\s+day\b/g, 'january 1');
  norm = norm.replace(/\bdec(?:ember|\.)?\s+25(?:th)?\b/g, 'december 25');

  // Month abbreviations
  norm = norm.replace(/\bjan(?:uary|\.)?\b/g, 'january');
  norm = norm.replace(/\bfeb(?:ruary|\.)?\b/g, 'february');
  norm = norm.replace(/\bmar(?:ch|\.)?\b/g, 'march');
  norm = norm.replace(/\bapr(?:il|\.)?\b/g, 'april');
  norm = norm.replace(/\bmay\b/g, 'may');
  norm = norm.replace(/\bjun(?:e|\.)?\b/g, 'june');
  norm = norm.replace(/\bjul(?:y|\.)?\b/g, 'july');
  norm = norm.replace(/\baug(?:ust|\.)?\b/g, 'august');
  norm = norm.replace(/\bsep(?:tember|\.|\s*t)?\b/g, 'september');
  norm = norm.replace(/\boct(?:ober|\.)?\b/g, 'october');
  norm = norm.replace(/\bnov(?:ember|\.)?\b/g, 'november');
  norm = norm.replace(/\bdec(?:ember|\.)?\b/g, 'december');

  // Historical / entity synonyms
  norm = norm.replace(/\bchristopher\s+columbus\b/g, 'columbus');
  norm = norm.replace(/\b(?:ran\s+aground|running\s+aground|grounded|grounding)\b/g, 'aground');
  norm = norm.replace(/\b(?:shipwrecked|shipwreck|wreck\s+site|wreckage)\b/g, 'wreck');
  norm = norm.replace(/\b(?:first\s+voyage|1492\s+voyage|voyage\s+of\s+1492)\b/g, 'voyage 1492');
  norm = norm.replace(/\b(?:present\s*day|modern\s*day)\b/g, '');

  return norm.replace(/\s+/g, ' ').trim();
}

const COMMON_STOPWORDS = new Set([
  'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost', 'along', 'also', 'although',
  'and', 'another', 'any', 'are', 'area', 'around', 'because', 'been', 'before', 'being', 'between',
  'both', 'but', 'by', 'can', 'could', 'did', 'does', 'down', 'during', 'each', 'early', 'either',
  'even', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'into', 'its', 'itself', 'just', 'known', 'later', 'like', 'located',
  'location', 'made', 'make', 'many', 'may', 'might', 'more', 'most', 'much', 'must', 'near', 'neither',
  'nor', 'not', 'now', 'off', 'once', 'one', 'only', 'onto', 'other', 'our', 'ours', 'out', 'over',
  'own', 'part', 'place', 'present', 'region', 'same', 'see', 'several', 'should', 'side', 'since',
  'site', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'time', 'too', 'under', 'until', 'upon',
  'used', 'various', 'very', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'within', 'without', 'would'
]);

// Semantic event synonyms for normalization (only direct grammatical/morphological variations)
const EVENT_SYNONYMS: Record<string, string> = {
  'shipwrecked': 'wreck',
  'shipwreck': 'wreck',
  'wreckage': 'wreck',
  'grounding': 'aground',
  'grounded': 'aground',
  'reefs': 'reef',
  'shoals': 'reef',
  'vessels': 'vessel',
  'sailing': 'sail',
  'voyages': 'voyage',
  'expeditions': 'expedition'
};

/**
 * Determines whether a supplemental context snippet (e.g. historical context)
 * is already semantically covered / subsumed by the primary description narrative,
 * avoiding redundant subsections while preserving genuinely new facts.
 */
export function isContextSubsumedByDescription(
  contextSnippet: string,
  baseDescription: string
): boolean {
  if (!contextSnippet || !contextSnippet.trim()) return true;
  if (!baseDescription || !baseDescription.trim()) return false;

  const cleanContext = contextSnippet.replace(/^#+\s*/, '').trim();
  const cleanBase = baseDescription.trim();

  // 1. Direct containment check
  if (cleanBase.toLowerCase().includes(cleanContext.toLowerCase())) {
    return true;
  }

  const normBase = normalizeTextForSemanticComparison(cleanBase);
  const normContext = normalizeTextForSemanticComparison(cleanContext);

  if (normBase.includes(normContext)) {
    return true;
  }

  // 2. Check for novel proper nouns (e.g. "La Navidad", "Elephant Island", "James Caird")
  // Extract capitalized words that are genuine named entities (not first-word sentence starters or temporal/geographic generics)
  const ignoredProperNouns = new Set([
    'The', 'This', 'That', 'These', 'Those', 'After', 'Before', 'During', 'In', 'On', 'At',
    'Today', 'Now', 'Later', 'Used', 'Ran', 'Built', 'Founded', 'Located', 'It', 'Its', 'They', 'He', 'She',
    'Shipwrecked', 'Shipwreck', 'Wreck', 'Ship', 'Vessel', 'Flagship', 'Caravel', 'Site', 'Remains',
    'Christmas', 'Day', 'Eve', 'Year', 'Month', 'North', 'South', 'East', 'West',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'Coast', 'Waters', 'Ocean', 'Sea', 'Island', 'Bay', 'Port', 'Fort', 'River', 'Reef'
  ]);

  const wordsInContext = cleanContext.split(/\s+/);
  for (let i = 0; i < wordsInContext.length; i++) {
    const rawWord = wordsInContext[i].replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (!rawWord || !/^[A-Z][a-zA-ZÀ-ÿ-]+$/.test(rawWord)) continue;

    // Skip first word of clause/sentence if it's in ignored list or capitalized as standard sentence start
    if (i === 0 || wordsInContext[i - 1].endsWith('.') || wordsInContext[i - 1].endsWith(';') || wordsInContext[i - 1].endsWith(':')) {
      if (ignoredProperNouns.has(rawWord)) continue;
    }
    if (ignoredProperNouns.has(rawWord)) continue;

    const normPn = rawWord.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (COMMON_STOPWORDS.has(normPn)) continue;
    if (normPn === 'christmas' && (normBase.includes('december 25') || normBase.includes('christmas'))) continue;

    // Check if it exists in base description
    if (!normBase.includes(normPn)) {
      if ((normPn.includes('cap') || normPn.includes('haitien') || normPn.includes('hispaniola')) && (normBase.includes('haiti') || normBase.includes('hispaniola'))) {
        continue;
      }
      if ((normPn === 'columbus' || normPn === 'christopher') && (normBase.includes('santa') || normBase.includes('columbus'))) {
        continue;
      }
      // Novel proper noun found!
      return false;
    }
  }

  // 3. Extract dates & years from context
  const contextDates = normContext.match(/\b(?:1[0-9]{3}|20[0-2][0-9]|december\s+25|january\s+1)\b/g) || [];
  for (const d of contextDates) {
    if (!normBase.includes(d)) {
      // Context has a specific date/year not mentioned in description
      return false;
    }
  }

  // 4. Split context into clauses / proposition segments
  const clauses = cleanContext
    .split(/(?:;|\.|\s+--\s+|\s+-\s+|,\s+(?:and|where|which|who|while|after|as)\s+)/)
    .map(c => c.trim())
    .filter(c => c.length > 0);

  if (clauses.length === 0) return true;

  let coveredClauses = 0;

  for (const clause of clauses) {
    const normClause = normalizeTextForSemanticComparison(clause);
    const words = normClause
      .split(/[^a-z0-9]+/)
      .map(w => EVENT_SYNONYMS[w] || w)
      .filter(w => w.length >= 3 && !COMMON_STOPWORDS.has(w));

    if (words.length === 0) {
      coveredClauses++;
      continue;
    }

    let matchedWords = 0;
    for (const word of words) {
      if (normBase.includes(word)) {
        matchedWords++;
      } else {
        const syn = EVENT_SYNONYMS[word];
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

    const matchRatio = matchedWords / words.length;
    // Strict factual coverage threshold: at least 70% of informative words matched, or >= 50% when date and action are matched
    if (matchRatio >= 0.70 || (matchRatio >= 0.50 && contextDates.length > 0)) {
      coveredClauses++;
    }
  }

  return coveredClauses === clauses.length;
}
