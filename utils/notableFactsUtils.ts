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
  'between', 'both', 'but', 'by', 'can', 'could', 'description', 'descriptions', 'detail', 'details', 'did', 'do', 'does', 'done', 'down', 'during', 'each',
  'early', 'either', 'even', 'fact', 'facts', 'feature', 'features', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'if', 'in',
  'information', 'into', 'is', 'it', 'item', 'items', 'its', 'itself', 'just', 'later', 'like', 'located',
  'location', 'made', 'make', 'many', 'may', 'might', 'more', 'most', 'much', 'must', 'my', 'near',
  'neither', 'no', 'nor', 'not', 'notable', 'note', 'notes', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'onto',
  'or', 'other', 'our', 'ours', 'out', 'over', 'own', 'part', 'place', 'present', 'region', 'same',
  'see', 'several', 'she', 'should', 'side', 'since', 'site', 'so', 'some', 'such', 'summary', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'time', 'to', 'too', 'under', 'until', 'up', 'upon', 'us', 'use', 'uses', 'used', 'using', 'various',
  'include', 'includes', 'included', 'including', 'consist', 'consists', 'consisted', 'consisting',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'within', 'without', 'would', 'you', 'your'
]);

export const META_EVALUATIVE_WORDS = new Set([
  'significance', 'significant', 'significantly', 'crucial', 'moment', 'moments',
  'symbol', 'symbols', 'symbolize', 'symbolizes', 'symbolized', 'symbolizing', 'symbolic', 'symbolism',
  'turning', 'point', 'points', 'milestone', 'milestones',
  'impact', 'impacts', 'impacted', 'impacting', 'lasting', 'profound', 'deep',
  'important', 'importance', 'role', 'roles', 'played',
  'marked', 'marking', 'marks', 'mark', 'heralded', 'heralding',
  'beginning', 'start', 'started', 'starting', 'commenced',
  'colonization', 'colonize', 'colonizing', 'colonized',
  'commemorated', 'commemorating', 'remembered', 'celebrated',
  'vital', 'historic', 'historical', 'history', 'legacy', 'legacies',
  'fame', 'famous', 'renowned', 'reknown', 'notable', 'noted',
  'considered', 'viewed', 'regarded', 'known',
  'exploration', 'explorations', 'expansion', 'discovery', 'discoveries',
  'represented', 'representing', 'represents', 'represent',
  'composition', 'withstand', 'weather', 'conditions', 'durability', 'durable', 'harsh', 'protect', 'protection',
  'european', 'europe', 'american', 'america', 'americas', 'western', 'eastern', 'northern', 'southern', 'global', 'world', 'era', 'age'
]);

const NUMBER_WORDS: Record<string, string> = {
  'zero': '0',
  'one': '1',
  'two': '2',
  'three': '3',
  'four': '4',
  'five': '5',
  'six': '6',
  'seven': '7',
  'eight': '8',
  'nine': '9',
  'ten': '10',
  'eleven': '11',
  'twelve': '12',
  'million': 'million',
  'millions': 'million',
  'billion': 'billion',
  'billions': 'billion',
  'thousand': 'thousand',
  'thousands': 'thousand',
  'first': '1',
  'second': '2',
  'third': '3'
};

const SEMANTIC_SYNONYM_MAP: Record<string, string> = {
  // Arrive / Reach / Land / Splashdown
  'reached': 'arrive',
  'reaching': 'arrive',
  'arrived': 'arrive',
  'arriving': 'arrive',
  'arrival': 'arrive',
  'attained': 'arrive',
  'landed': 'arrive',
  'landing': 'arrive',
  'splashed': 'arrive',
  'splashdown': 'arrive',

  // Found / Establish / Create / Build / Construct / Sculpt / Inscribe
  'founded': 'found',
  'founding': 'found',
  'founder': 'found',
  'founders': 'found',
  'established': 'found',
  'establishing': 'found',
  'establishment': 'found',
  'chartered': 'found',
  'chartering': 'found',
  'created': 'create',
  'creating': 'create',
  'creation': 'create',
  'creator': 'create',
  'built': 'build',
  'building': 'build',
  'buildings': 'build',
  'constructed': 'build',
  'constructing': 'build',
  'construction': 'build',
  'erected': 'build',
  'erecting': 'build',
  'erection': 'build',
  'engineered': 'design',
  'engineering': 'design',
  'designed': 'design',
  'designing': 'design',
  'designer': 'design',
  'planned': 'design',
  'planning': 'design',
  'sculpted': 'sculpt',
  'sculpting': 'sculpt',
  'sculptor': 'sculpt',
  'sculpture': 'monument',
  'sculptures': 'monument',
  'statue': 'monument',
  'statues': 'monument',
  'monument': 'monument',
  'monuments': 'monument',
  'effigy': 'monument',
  'finished': 'complete',
  'finishing': 'complete',
  'completed': 'complete',
  'completing': 'complete',
  'completion': 'complete',
  'inaugurated': 'inaugurate',
  'inaugurating': 'inaugurate',
  'inauguration': 'inaugurate',
  'dedicated': 'inaugurate',
  'dedicating': 'inaugurate',
  'dedication': 'inaugurate',
  'opened': 'inaugurate',
  'opening': 'inaugurate',
  'unveiled': 'inaugurate',
  'unveiling': 'inaugurate',
  'consecrated': 'inaugurate',
  'commissioned': 'inaugurate',

  // Symbol / Represent / Icon / Cultural
  'symbol': 'symbol',
  'symbols': 'symbol',
  'symbolize': 'symbol',
  'symbolizes': 'symbol',
  'symbolized': 'symbol',
  'symbolizing': 'symbol',
  'symbolic': 'symbol',
  'symbolism': 'symbol',
  'represent': 'symbol',
  'represents': 'symbol',
  'represented': 'symbol',
  'representing': 'symbol',
  'representation': 'symbol',
  'signifies': 'symbol',
  'signify': 'symbol',
  'signified': 'symbol',
  'signifying': 'symbol',
  'emblem': 'symbol',
  'emblematic': 'symbol',
  'icon': 'symbol',
  'icons': 'symbol',
  'iconic': 'symbol',

  // Religion
  'christian': 'christian',
  'christianity': 'christian',
  'catholic': 'christian',
  'catholicism': 'christian',
  'church': 'christian',
  'religious': 'christian',
  'religion': 'christian',
  'sacred': 'christian',
  'holy': 'christian',
  'spiritual': 'christian',

  // Global / World
  'global': 'global',
  'world': 'global',
  'worldwide': 'global',
  'international': 'global',

  // Attract / Visitors / Tourism / Drawing / Welcome
  'attracts': 'attract',
  'attract': 'attract',
  'attracting': 'attract',
  'attracted': 'attract',
  'attraction': 'attract',
  'attractions': 'attract',
  'draws': 'attract',
  'draw': 'attract',
  'drawing': 'attract',
  'drew': 'attract',
  'welcomes': 'attract',
  'welcome': 'attract',
  'welcoming': 'attract',
  'welcomed': 'attract',
  'receives': 'attract',
  'receive': 'attract',
  'receiving': 'attract',
  'received': 'attract',
  'hosts': 'attract',
  'host': 'attract',
  'hosting': 'attract',
  'hosted': 'attract',
  'visitors': 'visitor',
  'visitor': 'visitor',
  'tourists': 'visitor',
  'tourist': 'visitor',
  'tourism': 'visitor',
  'travelers': 'visitor',
  'traveler': 'visitor',
  'travellers': 'visitor',
  'traveller': 'visitor',
  'sightseers': 'visitor',
  'sightseer': 'visitor',
  'annually': 'annual',
  'annual': 'annual',
  'yearly': 'annual',

  // Views / Panoramic / Overlook / Vista
  'panoramic': 'view',
  'panorama': 'view',
  'views': 'view',
  'view': 'view',
  'vistas': 'view',
  'vista': 'view',
  'overlooks': 'view',
  'overlook': 'view',
  'overlooking': 'view',
  'overlooked': 'view',

  // Dimensions / Height / Elevation / Mountain / Summit / Base
  'height': 'height',
  'tall': 'height',
  'altitude': 'height',
  'elevation': 'height',
  'elevated': 'height',
  'rises': 'height',
  'rising': 'height',
  'stands': 'height',
  'standing': 'height',
  'stood': 'height',
  'measures': 'height',
  'measuring': 'height',
  'measurement': 'height',
  'peak': 'summit',
  'summit': 'summit',
  'top': 'summit',
  'crest': 'summit',
  'mountain': 'mountain',
  'mount': 'mountain',
  'mountains': 'mountain',
  'pedestal': 'pedestal',
  'base': 'pedestal',
  'plinth': 'pedestal',
  'meters': 'meter',
  'metres': 'meter',
  'meter': 'meter',
  'metre': 'meter',
  'feet': 'foot',
  'foot': 'foot',

  // Materials / Soapstone / Concrete / Tiles
  'materials': 'material',
  'material': 'material',
  'concrete': 'concrete',
  'reinforced': 'concrete',
  'soapstone': 'soapstone',
  'steatite': 'soapstone',
  'tile': 'tile',
  'tiles': 'tile',
  'mosaic': 'tile',
  'marble': 'marble',
  'granite': 'granite',
  'limestone': 'limestone',
  'clad': 'clad',
  'cladding': 'clad',
  'faced': 'clad',
  'facing': 'clad',

  // Weight / Width / Arm Span
  'weight': 'weight',
  'weighs': 'weight',
  'weighing': 'weight',
  'tons': 'ton',
  'ton': 'ton',
  'tonnes': 'ton',
  'metric': 'ton',
  'span': 'width',
  'spans': 'width',
  'spanning': 'width',
  'width': 'width',
  'wide': 'width',
  'stretch': 'width',
  'stretches': 'width',
  'stretching': 'width',
  'dimensions': 'dimension',
  'dimension': 'dimension',
  'size': 'dimension',

  // Transport / Shipping / Assembly / Prefabrication
  'shipped': 'transport',
  'shipping': 'transport',
  'transported': 'transport',
  'transporting': 'transport',
  'transportation': 'transport',
  'transport': 'transport',
  'assembled': 'assemble',
  'assembly': 'assemble',
  'assembling': 'assemble',
  'prefabricated': 'assemble',

  // Months
  'january': 'january',
  'february': 'february',
  'march': 'march',
  'april': 'april',
  'may': 'may',
  'june': 'june',
  'july': 'july',
  'august': 'august',
  'september': 'september',
  'october': 'october',
  'november': 'november',
  'december': 'december',

  // Discovery / Sink / Maritime / Ship / Voyage
  'discovered': 'discover',
  'discovering': 'discover',
  'discovery': 'discover',
  'discoveries': 'discover',
  'located': 'discover',
  'locating': 'discover',
  'location': 'discover',
  'uncovered': 'discover',
  'uncovering': 'discover',
  'unearthed': 'discover',
  'unearthing': 'discover',
  'sank': 'sink',
  'sinking': 'sink',
  'sunken': 'sink',
  'shipwrecked': 'sink',
  'grounded': 'sink',
  'grounding': 'sink',
  'aground': 'sink',
  'wrecked': 'sink',
  'wreck': 'sink',
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
  'explorer': 'explorer',
  'expeditions': 'voyage',
  'searching': 'search',
  'searched': 'search',
  'moon': 'lunar',
  'spacecraft': 'module',
  'capsule': 'module',
  'vessel': 'ship',
  'vessels': 'ship',
  'ships': 'ship',
  'ship': 'ship',
  'galleon': 'ship',
  'steamship': 'ship',
  'steamer': 'ship',
  'returning': 'return',
  'returned': 'return',
  'held': 'preserve',
  'preserved': 'preserve',
  'preserving': 'preserve',
  'houses': 'preserve',
  'housed': 'preserve',
  'housing': 'preserve',
  'contains': 'preserve',
  'contained': 'preserve',
  'containing': 'preserve',
  'holdings': 'collection',
  'collections': 'collection',
  'collection': 'collection',

  // Demonyms and countries
  'france': 'french',
  'french': 'french',
  'brazil': 'brazilian',
  'brazilian': 'brazilian',
  'america': 'american',
  'american': 'american',
  'italy': 'italian',
  'italian': 'italian',
  'spain': 'spanish',
  'spanish': 'spanish',
  'portugal': 'portuguese',
  'portuguese': 'portuguese',
  'britain': 'british',
  'british': 'british',
  'england': 'english',
  'english': 'english',
  'germany': 'german',
  'german': 'german',
  'japan': 'japanese',
  'japanese': 'japanese',
  'china': 'chinese',
  'chinese': 'chinese',
  'greece': 'greek',
  'greek': 'greek',
  'rome': 'roman',
  'roman': 'roman'
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
  const matches = normalized.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const words = normalized.split(/\s+/);
  const wordNums: string[] = [];
  for (const w of words) {
    if (NUMBER_WORDS[w]) {
      wordNums.push(NUMBER_WORDS[w]);
    }
  }
  return Array.from(new Set([...matches, ...wordNums]));
}

const COMMON_DICTIONARY_OR_GEO_WORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'after', 'before', 'during',
  'a', 'an', 'it', 'its', 'they', 'he', 'she', 'his', 'her', 'notable', 'feature', 'features',
  'moon', 'earth', 'sun', 'pacific', 'atlantic', 'indian', 'mediterranean', 'ocean', 'sea', 'seas',
  'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'hemisphere',
  'ancient', 'historic', 'historical', 'major', 'national', 'international', 'global', 'world',
  'great', 'grand', 'new', 'old', 'first', 'second', 'third', 'main',
  'european', 'europe', 'american', 'america', 'americas', 'asian', 'asia', 'african', 'africa',
  'significance', 'importance', 'legacy', 'impact', 'symbolism', 'history',
  'cultural', 'culture', 'icon', 'icons', 'iconic', 'heritage',
  'date', 'dates', 'time', 'period', 'era', 'year', 'years', 'day', 'days', 'century', 'centuries', 'name', 'origin', 'role', 'type', 'location', 'material', 'materials', 'tile', 'tiles', 'dimension', 'dimensions',
  'mountain', 'mount', 'mountains', 'alpine', 'peak', 'summit', 'valley', 'volcano', 'volcanic',
  'river', 'lake', 'gulf', 'bay', 'strait', 'channel', 'cape', 'coast', 'coastal', 'island', 'islands', 'atoll',
  'fortress', 'citadel', 'castle', 'palace', 'tower', 'bridge', 'port', 'harbor', 'harbour',
  'church', 'cathedral', 'chapel', 'temple', 'sanctuary', 'monument', 'statue', 'sculpture', 'pyramid',
  'museum', 'library', 'university', 'park', 'forest', 'garden',
  'arrival', 'completion', 'construction', 'building', 'erection', 'foundation', 'founding',
  'discovery', 'excavation', 'restoration', 'recovery', 'expedition', 'voyage', 'journey', 'migration',
  'sinking', 'shipwreck', 'blockade', 'siege', 'treaty', 'accord', 'battle', 'war',
  'inscription', 'recognized', 'designation', 'designated', 'status',
  'holding', 'holdings', 'collection', 'collections', 'archive', 'archives', 'scroll', 'scrolls', 'papyrus',
  'gold', 'silver', 'bronze', 'copper', 'iron', 'steel', 'concrete', 'stone', 'soapstone', 'mortar', 'tuff',
  'coin', 'coins', 'treasure', 'artifact', 'artifacts', 'relic', 'relics',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
]);

/**
 * Tokenizes text into normalized semantic words with synonyms mapped and stopwords filtered.
 */
export function tokenizeSemanticWords(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeSemanticFactText(text);
  return normalized
    .split(/\s+/)
    .map(w => SEMANTIC_SYNONYM_MAP[w] || w)
    .filter(w => w.length >= 2 && !COMMON_STOPWORDS.has(w));
}

/**
 * Extracts capitalized entity names and identifies novel entities not in base text.
 */
export function extractNamedEntities(text: string, baseText: string = ''): { all: string[]; novel: string[] } {
  if (!text) return { all: [], novel: [] };
  const baseTokens = new Set(tokenizeSemanticWords(baseText));
  const rawWords = text.split(/\s+/);
  const entities: string[] = [];
  const novel: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i].replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, '');
    if (/^[A-Z][a-zA-ZÀ-ÿ-]+$/.test(raw)) {
      const normWord = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      // Skip if it's in common stopwords, evaluative words, geo/common words, or synonym dictionary
      if (
        COMMON_STOPWORDS.has(normWord) ||
        META_EVALUATIVE_WORDS.has(normWord) ||
        COMMON_DICTIONARY_OR_GEO_WORDS.has(normWord) ||
        SEMANTIC_SYNONYM_MAP[normWord]
      ) {
        continue;
      }

      entities.push(normWord);
      if (!baseTokens.has(normWord)) {
        novel.push(normWord);
      }
    }
  }

  return { all: Array.from(new Set(entities)), novel: Array.from(new Set(novel)) };
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

  const baseTokensList = tokenizeSemanticWords(baseText);
  const baseTokenSet = new Set(baseTokensList);

  // 2. Numbers & Measurements Check on full fact:
  const factNumbers = extractFactNumbers(factFullText);
  const baseNumbers = new Set(extractFactNumbers(baseText));
  const novelNumbers = factNumbers.filter(n => !baseNumbers.has(n));
  const sharedNumbers = factNumbers.filter(n => {
    if (!baseNumbers.has(n)) return false;
    const val = parseFloat(n);
    // Only consider specific historical years or counts > 2 as shared quantitative facts
    return !isNaN(val) && (val >= 1000 || val > 2);
  });

  // Significant novel numbers: years (>= 1000), large counts (> 31), or novel numbers >= 2 paired with text
  const significantNovelNumbers = novelNumbers.filter(n => {
    const val = parseFloat(n);
    if (isNaN(val)) return true;
    if (val >= 2) return true;
    return false;
  });

  // 3. Named Entities / Associated People / Novel Proper Nouns:
  const { novel: novelNamedEntities } = extractNamedEntities(factFullText, baseText);

  // 4. Word-level semantic proposition overlap:
  const wordsInFact = tokenizeSemanticWords(factFullText);
  const wordsInDesc = tokenizeSemanticWords(desc || title);

  if (wordsInFact.length === 0) {
    return normBase.includes(normFactDesc) || normBase.includes(normFactFull);
  }

  // If all substantive words in the fact or fact description are already in the base text
  if (wordsInFact.length >= 2 && significantNovelNumbers.length === 0 && novelNamedEntities.length === 0) {
    const allDescInBase = wordsInDesc.length >= 2 && wordsInDesc.every(w => baseTokenSet.has(w) || normBase.includes(w) || baseTokensList.some(bw => bw.startsWith(w.slice(0, 4))));
    const allFactInBase = wordsInFact.every(w => baseTokenSet.has(w) || normBase.includes(w) || baseTokensList.some(bw => bw.startsWith(w.slice(0, 4))));
    if (allDescInBase || allFactInBase) {
      return true;
    }
  }

  // If there are too few informative words (< 3) and direct containment did not match
  if (wordsInFact.length < 3) {
    if (wordsInFact.length >= 2 && significantNovelNumbers.length === 0 && novelNamedEntities.length === 0) {
      const matchCount = wordsInFact.filter(w => baseTokenSet.has(w) || normBase.includes(w) || baseTokensList.some(bw => bw.startsWith(w.slice(0, 4)))).length;
      if (matchCount / wordsInFact.length >= 0.65) {
        return true;
      }
    }
    return false;
  }

  let matchedWords = 0;
  for (const word of wordsInFact) {
    if (baseTokenSet.has(word) || normBase.includes(word)) {
      matchedWords++;
    } else {
      const stem = word.length > 5 ? word.slice(0, 5) : word;
      if (stem.length >= 4 && (normBase.includes(stem) || baseTokensList.some(bw => bw.startsWith(stem)))) {
        matchedWords++;
      }
    }
  }

  const matchRatio = matchedWords / wordsInFact.length;

  const unMatchedWords = wordsInFact.filter(w => {
    if (baseTokenSet.has(w) || normBase.includes(w)) return false;
    const stem = w.length > 5 ? w.slice(0, 5) : w;
    if (stem.length >= 4 && (normBase.includes(stem) || baseTokensList.some(bw => bw.startsWith(stem)))) return false;
    return true;
  });

  const unMatchedConcreteWords = unMatchedWords.filter(
    w => !META_EVALUATIVE_WORDS.has(w) && !COMMON_DICTIONARY_OR_GEO_WORDS.has(w)
  );

  // If the fact introduces meaningful new named entities with non-evaluative content
  if (novelNamedEntities.length >= 2 || (novelNamedEntities.length === 1 && unMatchedConcreteWords.length >= 1)) {
    return false;
  }

  // If the fact introduces significant novel numbers with meaningful concrete words
  if (significantNovelNumbers.length > 0 && (unMatchedConcreteWords.length >= 1 || significantNovelNumbers.length >= 2)) {
    return false;
  }

  // If the fact introduces 2 or more distinct concrete concepts not in base text and has reasonable novelty (matchRatio < 0.65)
  if (unMatchedConcreteWords.length >= 2 && matchRatio < 0.65) {
    return false;
  }

  // If fact shares specific key numbers/dates (e.g. 1931, 1922, 400000, 1588) with base text and has no novel numbers or entities,
  // and has substantial overlap (>= 35%), it is repetitive of that specific recorded measurement/event.
  if (sharedNumbers.length > 0 && significantNovelNumbers.length === 0 && novelNamedEntities.length === 0) {
    if (matchRatio >= 0.35 || unMatchedConcreteWords.length <= 1) {
      return true;
    }
  }

  // If no novel numbers and no novel entities and at most 1 unmatched concrete word
  if (novelNamedEntities.length === 0 && significantNovelNumbers.length === 0 && unMatchedConcreteWords.length <= 1) {
    return true;
  }

  if (matchRatio >= 0.60 || (wordsInFact.length <= 6 && matchRatio >= 0.45)) {
    return true;
  }

  return false;
}

/**
 * Prunes redundant sentence or clause portions from a notable fact or context note that repeat existing text,
 * retaining genuinely novel additive portions where practical.
 * Returns null if the entire fact is subsumed or no substantive content remains.
 */
export function pruneRedundantFactContent(
  fact: string | ParsedNotableFact | any,
  existingTexts: string | string[] | any
): ParsedNotableFact | null {
  if (!fact) return null;
  const parsed = parseNotableFactItem(fact);
  if (!parsed) return null;

  const title = (parsed.title || '').trim();
  const desc = (parsed.description || '').trim();

  if (!title && !desc) return null;

  const existingList: string[] = Array.isArray(existingTexts)
    ? existingTexts.map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.summary || ''))).filter(Boolean)
    : (existingTexts ? [typeof existingTexts === 'string' ? existingTexts : (existingTexts?.text || existingTexts?.description || '')] : []);

  const baseText = existingList.join('\n\n').trim();
  if (!baseText) {
    return parsed;
  }

  // If the whole fact is subsumed, drop it
  if (isFactSubsumedByText(parsed, baseText)) {
    return null;
  }

  // If description is empty and title is not subsumed, keep parsed
  if (!desc) {
    return parsed;
  }

  // 1. Check multi-sentence splitting (decimal-safe to avoid splitting on numbers like 34.2% or 439.78)
  const sentenceMatches = desc.match(/(?:[^.!?]|(?<=\d)\.(?=\d))+([.!?]+['"”’)}\]]*)?(?:\s+|$)/g);
  if (sentenceMatches && sentenceMatches.length > 1) {
    const cleanSentences = sentenceMatches.map(s => s.trim()).filter(Boolean);
    const nonSubsumedSentences: string[] = [];

    for (const sent of cleanSentences) {
      if (!isFactSubsumedByText(sent, baseText)) {
        nonSubsumedSentences.push(sent);
      }
    }

    if (nonSubsumedSentences.length === 0) {
      // All sentences were subsumed
      return null;
    }

    if (nonSubsumedSentences.length < cleanSentences.length) {
      const newDesc = nonSubsumedSentences.join(' ');
      return {
        ...parsed,
        title,
        description: newDesc
      };
    }
  }

  // 2. Check leading clause-level redundancy:
  // e.g., "Built between 1922 and 1931 atop Corcovado mountain, the outer layers were constructed from six million soapstone tiles."
  const leadingClauseMatch = desc.match(/^([^,]{12,140}),\s+([a-zA-Z0-9].*)$/);
  if (leadingClauseMatch) {
    const preamble = leadingClauseMatch[1].trim();
    const mainClause = leadingClauseMatch[2].trim();

    if (isFactSubsumedByText(preamble, baseText) && !isFactSubsumedByText(mainClause, baseText)) {
      let cleanedClause = mainClause;
      cleanedClause = cleanedClause.replace(/^(?:and|where|while|which|having\s+been)\s+/i, '');
      cleanedClause = cleanedClause.charAt(0).toUpperCase() + cleanedClause.slice(1);
      if (!/[.!?]$/.test(cleanedClause)) {
        cleanedClause += '.';
      }

      if (cleanedClause.length >= 12) {
        return {
          ...parsed,
          title,
          description: cleanedClause
        };
      }
    }
  }

  // 3. Check trailing clause-level redundancy:
  // e.g., "The monument has an arm span of 28 meters, having been constructed between 1922 and 1931."
  const trailingClauseMatch = desc.match(/^([A-Z0-9][^,]{12,140}),\s+((?:having\s+been|which\s+was|which\s+is|constructed\s+in|built\s+in|inaugurated\s+in|located\s+in|standing\s+at|serving\s+as|designated\s+as|before\s+|after\s+|while\s+|and\s+was|and\s+is|and\s+built)[^,.]+[.!?]?)$/i);
  if (trailingClauseMatch) {
    const mainClause = trailingClauseMatch[1].trim();
    const trailingClause = trailingClauseMatch[2].trim();

    if (!isFactSubsumedByText(mainClause, baseText) && isFactSubsumedByText(trailingClause, baseText)) {
      let cleanedClause = mainClause;
      if (!/[.!?]$/.test(cleanedClause)) {
        cleanedClause += '.';
      }
      if (cleanedClause.length >= 12) {
        return {
          ...parsed,
          title,
          description: cleanedClause
        };
      }
    }
  }

  return parsed;
}

/**
 * Filters a list of context notes against existing narrative text (such as description)
 * and against preceding context notes to ensure strict additive presentation without semantic repetition.
 */
export const filterAdditiveContextNotes = (
  notes: any[] | undefined | null,
  existingTexts: string | string[] | any = []
): string[] => {
  if (!notes) return [];
  const rawList: any[] = Array.isArray(notes) ? notes : [notes];

  const existingList: string[] = Array.isArray(existingTexts)
    ? existingTexts.map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.summary || ''))).filter(Boolean)
    : (existingTexts ? [typeof existingTexts === 'string' ? existingTexts : (existingTexts?.text || existingTexts?.description || '')] : []);

  const accumulatedContext: string[] = [...existingList];
  const seenKeys = new Set<string>();
  const result: string[] = [];

  for (const rawItem of rawList) {
    if (!rawItem) continue;
    const noteText = (typeof rawItem === 'string' ? rawItem : (rawItem?.text || (typeof rawItem === 'object' ? (rawItem.description || rawItem.summary || '') : ''))).trim();
    if (!noteText) continue;

    // Prune redundant preambles/clauses
    const fakeFact = { title: '', description: noteText };
    const pruned = pruneRedundantFactContent(fakeFact, accumulatedContext);
    if (!pruned) {
      continue;
    }

    const cleanText = (pruned.description || pruned.title || '').trim();
    if (!cleanText || cleanText.length < 8) continue;

    const normKey = normalizeFactComparisonKey(cleanText);
    if (seenKeys.has(normKey)) {
      continue;
    }

    if (isFactSubsumedByText(cleanText, accumulatedContext)) {
      continue;
    }

    seenKeys.add(normKey);
    result.push(cleanText);
    accumulatedContext.push(cleanText);
  }

  return result;
};

/**
 * Filters a list of notable facts against existing InfoPanel narrative sections (description, context notes, etc.)
 * and against preceding notable facts to ensure strict progressive presentation, partial overlap pruning, and no semantic duplication.
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

  for (const rawItem of facts) {
    if (!rawItem) continue;

    const parsed = parseNotableFactItem(rawItem);
    if (!parsed) continue;

    // Filter out generic fallback/placeholder text
    const normTitle = normalizeFactComparisonKey(parsed.title);
    const normDesc = normalizeFactComparisonKey(parsed.description);

    if (!normTitle && !normDesc) continue;

    if (
      normDesc.includes('no widely documented') ||
      normDesc.includes('no historical or cultural facts were found') ||
      normTitle.includes('no widely documented')
    ) {
      continue;
    }

    // Prune redundant portions from candidate fact
    const pruned = pruneRedundantFactContent(parsed, accumulatedContext);
    if (!pruned) {
      continue;
    }

    const prunedTitle = (pruned.title || '').trim();
    const prunedDesc = (pruned.description || '').trim();
    if (!prunedTitle && !prunedDesc) continue;

    // Check exact / normalized key deduplication against already accepted facts
    const normPrunedTitle = normalizeFactComparisonKey(prunedTitle);
    const normPrunedDesc = normalizeFactComparisonKey(prunedDesc);
    const key = normPrunedTitle && normPrunedDesc ? `${normPrunedTitle}:::${normPrunedDesc}` : (normPrunedTitle || normPrunedDesc);
    if (seenKeys.has(key)) {
      continue;
    }

    // Check semantic subsumption against accumulated context (which includes existing texts and all previous accepted facts)
    if (isFactSubsumedByText(pruned, accumulatedContext)) {
      continue;
    }

    seenKeys.add(key);

    let finalItem: any;
    if (typeof rawItem === 'string') {
      finalItem = prunedDesc ? (prunedTitle && prunedTitle !== 'Notable Feature' ? `${prunedTitle}: ${prunedDesc}` : prunedDesc) : prunedTitle;
    } else if (typeof rawItem === 'object' && rawItem !== null) {
      finalItem = { ...rawItem };
      if (rawItem.title !== undefined || (rawItem.name === undefined && prunedTitle)) {
        finalItem.title = prunedTitle;
      }
      if (rawItem.description !== undefined || (rawItem.summary === undefined && rawItem.name === undefined && prunedDesc)) {
        finalItem.description = prunedDesc;
      }
      if (rawItem.name !== undefined) {
        finalItem.name = prunedTitle || rawItem.name;
      }
      if (rawItem.summary !== undefined) {
        finalItem.summary = prunedDesc || rawItem.summary;
      }
      if (rawItem.text !== undefined) {
        finalItem.text = prunedDesc || prunedTitle || rawItem.text;
      }
    } else {
      finalItem = rawItem;
    }

    result.push(finalItem);

    // Add accepted fact text into accumulated context so future facts don't repeat this one
    const factText = prunedDesc ? (prunedTitle ? `${prunedTitle}: ${prunedDesc}` : prunedDesc) : prunedTitle;
    accumulatedContext.push(factText);
  }

  return result;
};

/**
 * Deduplicates notable facts while strictly preserving first-occurrence order and semantic additivity.
 */
export const deduplicateNotableFacts = <T = any>(facts: T[]): T[] => {
  return filterAdditiveNotableFacts(facts, []);
};

