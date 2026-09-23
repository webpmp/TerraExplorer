import { LocationInfo, Waypoint, FollowUpItem, ImageMetadata, NewsItem } from '../types';
import { generateContentWithRetry, modelName } from './geminiService';
import { fetchAndValidateImages } from './imageService';
import { parseAndExtract } from '../utils/jsonParser';

export interface FollowUpClassificationResult {
  intent: 'FOLLOW_UP' | 'NEW_SEARCH' | 'ROUTE_LEVEL_QUERY';
  reasoning: string;
}

export interface ContextualChip {
  id: string;
  type: 'question' | 'news';
  label: string;
  query?: string;
  url?: string;
  newsItem?: NewsItem;
}

/**
 * Converts a follow-up question or string to clean Sentence Case:
 * - Capitalizes the first alphabetic character.
 * - If the text is all-uppercase, converts subsequent letters to lowercase.
 * - Preserves natural wording, proper nouns with existing casing, and punctuation.
 */
export function toSentenceCase(str: string): string {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = letters.length > 1 && letters === letters.toUpperCase();

  const working = isAllCaps ? trimmed.toLowerCase() : trimmed;

  const firstLetterMatch = working.match(/[a-zA-Z]/);
  if (!firstLetterMatch || firstLetterMatch.index === undefined) {
    return working;
  }

  const idx = firstLetterMatch.index;
  return working.slice(0, idx) + working[idx].toUpperCase() + working.slice(idx + 1);
}

/**
 * Evaluates whether a question candidate is broad, generic, or redundant with
 * information already presented in the InfoPanel or previous follow-ups.
 */
export function isBroadOrRedundantQuestion(
  question: string,
  location: LocationInfo | Waypoint | null
): boolean {
  if (!question || typeof question !== 'string') return true;
  const q = question.trim().toLowerCase();
  if (q.length < 5) return true;

  // 1. Broad overview/summary patterns that repeat the main InfoPanel description
  const broadSummaryPatterns = [
    /^what\s+is\s+.+\s+best\s+known\s+for\??$/i,
    /^what\s+is\s+the\s+history\s+of\s+.+\??$/i,
    /^tell\s+me\s+about\s+(?:the\s+)?history\b/i,
    /^tell\s+me\s+about\s+(?:its\s+)?cultural\s+(?:heritage|hub|importance)\b/i,
    /^tell\s+me\s+about\s+(?:cultural\s+hub|overview|general\s+facts?|background|general\s+info|summary|landmarks?|highlights?|features?)\b/i,
    /^what\s+makes\s+(?:this\s+location|it|.+)\s+unique\??$/i,
    /^what\s+notable\s+landmarks\s+are\s+here\??$/i,
    /^what\s+is\s+(?:this\s+place|it)\??$/i,
    /^why\s+is\s+.+\s+culturally\s+important\??$/i
  ];

  if (broadSummaryPatterns.some(pat => pat.test(q))) {
    return true;
  }

  if (!location) return false;

  const locName = (location.name || '').trim().toLowerCase();
  const shortName = locName.split(',')[0].trim();
  if (shortName.length > 2 && (q === `tell me about ${shortName}` || q === `tell me about ${shortName}?`)) {
    return true;
  }

  // 2. Section label wrappers without specific entity/action focus
  const notable = Array.isArray(location.notable) ? location.notable : [];
  for (const item of notable) {
    const rawTitle = (typeof item === 'string' ? item : (item.title || item.name || '')).trim().toLowerCase();
    if (['cultural hub', 'overview', 'general facts', 'background', 'history', 'preserved state', 'main features', 'highlights', 'significance', 'economy'].includes(rawTitle)) {
      if (q === `tell me about ${rawTitle}` || q === `tell me about ${rawTitle}?`) {
        return true;
      }
    }
  }

  // 3. Check against previously explored follow-ups in location.followUps
  if (Array.isArray(location.followUps) && location.followUps.length > 0) {
    const isExplored = location.followUps.some(fu => {
      const existingQ = (fu.question || '').toLowerCase().trim();
      if (existingQ === q) return true;

      // Extract substantive core keywords (>4 chars) ignoring common question boilerplate
      const stopWords = new Set(['about', 'where', 'which', 'their', 'there', 'would', 'could', 'should', 'today', 'first', 'after', 'before', 'these', 'those', 'other', 'being']);
      const qKeywords = q.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w));
      const existingKeywords = existingQ.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w));
      if (qKeywords.length === 0 || existingKeywords.length === 0) return false;

      const overlap = qKeywords.filter(k => existingKeywords.includes(k));
      return overlap.length >= Math.min(2, qKeywords.length) && overlap.length >= Math.min(2, existingKeywords.length);
    });

    if (isExplored) return true;
  }

  return false;
}

interface QuestionCandidate {
  question: string;
  dimension: 'CAUSE_CONSEQUENCE' | 'LANDMARK_STRUCTURE' | 'HISTORICAL_DEVELOPMENT' | 'CULTURE_DAILY_LIFE' | 'GEOGRAPHY_ENVIRONMENT';
}

/**
 * Generates dynamic, gap-oriented question suggestions tailored to the active location.
 * Analyzes substantive entities, landmarks, events, and environmental cues from the InfoPanel,
 * strictly rejecting broad summary requests and questions already explored.
 */
export const generateContextualQuestionChips = (
  location: LocationInfo | Waypoint | null
): string[] => {
  if (!location || !location.name) {
    return [];
  }

  const rawName = location.name.trim();
  const shortName = rawName.split(',')[0].trim() || rawName;
  const rawType = ((location as any).entityType || (location as any).type || '').toLowerCase();
  const rawDesc = ((location as any).description || (location as any).context || '');
  const desc = rawDesc.toLowerCase();
  const notable = Array.isArray(location.notable) ? location.notable : [];
  const notableText = notable.map((n: any) => {
    if (typeof n === 'string') return n;
    return `${n.title || n.name || ''} ${n.description || n.summary || ''}`;
  }).join(' ').toLowerCase();
  const combinedContext = `${desc} ${notableText}`;

  const candidates: QuestionCandidate[] = [];

  // Helper to add candidate
  const addCandidate = (q: string, dimension: QuestionCandidate['dimension']) => {
    const formatted = toSentenceCase(q.trim());
    if (formatted && !isBroadOrRedundantQuestion(formatted, location)) {
      if (!candidates.some(c => c.question.toLowerCase() === formatted.toLowerCase())) {
        candidates.push({ question: formatted, dimension });
      }
    }
  };

  // 1. Specific Questions derived from Notable Facts (Landmarks, Structures, Key Highlights)
  for (const item of notable) {
    const title = typeof item === 'string' ? item.trim() : (item.title || item.name || '').trim();
    const itemDesc = typeof item === 'object' && item ? (item.description || item.summary || '').trim() : '';
    const itemDescLower = itemDesc.toLowerCase();
    const titleLower = title.toLowerCase();

    if (!title || title.length < 2 || title.length > 45) continue;

    // Skip generic category titles
    if (['cultural hub', 'overview', 'general facts', 'background', 'history', 'highlights', 'economy'].includes(titleLower)) {
      continue;
    }

    if (titleLower.includes('templo mayor')) {
      addCandidate("What can you see at Templo Mayor today?", 'LANDMARK_STRUCTURE');
    } else if (titleLower.includes('standard mill') || (itemDescLower.includes('stamping mill') || itemDescLower.includes('gold ore'))) {
      addCandidate(`How did the ${title} process gold ore?`, 'LANDMARK_STRUCTURE');
    } else if (titleLower.includes('preserved state') || itemDescLower.includes('arrested decay')) {
      addCandidate(`How is ${shortName} maintained in a state of arrested decay?`, 'CAUSE_CONSEQUENCE');
    } else if (titleLower.includes('fushimi inari') || itemDescLower.includes('torii')) {
      addCandidate("What is the significance of the thousands of vermilion torii gates?", 'LANDMARK_STRUCTURE');
    } else if (itemDescLower.includes('built') || itemDescLower.includes('constructed') || itemDescLower.includes('designed') || titleLower.includes('bridge') || titleLower.includes('tower')) {
      addCandidate(`How was ${title} constructed?`, 'LANDMARK_STRUCTURE');
    } else if (titleLower.includes('palace') || titleLower.includes('museum') || titleLower.includes('temple') || titleLower.includes('monument') || titleLower.includes('cathedral') || titleLower.includes('church') || itemDescLower.includes('famous') || itemDescLower.includes('known for') || itemDescLower.includes('museum') || itemDescLower.includes('palace') || itemDescLower.includes('temple') || itemDescLower.includes('monument')) {
      addCandidate(`What can visitors discover at ${title} today?`, 'LANDMARK_STRUCTURE');
    } else {
      addCandidate(`What role did ${title} play in the history of ${shortName}?`, 'HISTORICAL_DEVELOPMENT');
    }
  }

  // 2. Specific Entity & Environmental Mentions from Description & Context
  // Waterways & Geological Features (e.g. Lake Texcoco, Tennessee River, Caldera, Glacier)
  if (desc.includes('lake texcoco') || combinedContext.includes('lake texcoco')) {
    addCandidate("What happened to Lake Texcoco?", 'GEOGRAPHY_ENVIRONMENT');
  } else if (desc.includes('lake') || desc.includes('river') || desc.includes('bay') || desc.includes('harbor')) {
    const lakeMatch = rawDesc.match(/Lake\s+([A-Z][a-zA-Z]+)/);
    const riverMatch = rawDesc.match(/([A-Z][a-zA-Z]+)\s+River/);
    if (lakeMatch) {
      addCandidate(`What happened to Lake ${lakeMatch[1]} over time?`, 'GEOGRAPHY_ENVIRONMENT');
    } else if (riverMatch) {
      addCandidate(`Why was the settlement founded along the ${riverMatch[1]} River?`, 'GEOGRAPHY_ENVIRONMENT');
    }
  }

  // Island / Causeway / Ancient City Origins (e.g., Tenochtitlan, Venice)
  if (desc.includes('tenochtitlan') || combinedContext.includes('tenochtitlan')) {
    addCandidate("Why was Tenochtitlan built on an island?", 'CAUSE_CONSEQUENCE');
    addCandidate("How did Aztec traditions influence modern Mexico City?", 'CULTURE_DAILY_LIFE');
  }

  // Conquest / Battles / Treaties / Historical Changes
  if (desc.includes('spanish conquest') || combinedContext.includes('spanish conquest') || desc.includes('conquest')) {
    addCandidate(`How did the Spanish conquest change ${shortName}?`, 'HISTORICAL_DEVELOPMENT');
  }

  // Disasters / Earthquakes / Rebuilding
  if (desc.includes('earthquake') || desc.includes('fire') || desc.includes('eruption') || desc.includes('disaster')) {
    if (desc.includes('earthquake')) {
      addCandidate(`How did ${shortName} rebuild after major earthquakes?`, 'HISTORICAL_DEVELOPMENT');
    } else if (desc.includes('fire')) {
      addCandidate(`How did the fire impact the development of ${shortName}?`, 'HISTORICAL_DEVELOPMENT');
    } else {
      addCandidate(`How did the disaster reshape ${shortName}?`, 'HISTORICAL_DEVELOPMENT');
    }
  }

  // Elevation & Geography
  if (desc.includes('elevation') || desc.includes('altitude') || desc.includes('valley of mexico') || desc.includes('meters above sea level') || desc.includes('feet above sea level')) {
    addCandidate(`Why is the elevation of ${shortName} significant?`, 'GEOGRAPHY_ENVIRONMENT');
  }

  // 3. Entity Type Focused Explorations
  // Shipwrecks / Maritime discovery
  if (rawType.includes('shipwreck') || combinedContext.includes('shipwreck') || combinedContext.includes('sank') || combinedContext.includes('sunk') || combinedContext.includes('wreckage') || combinedContext.includes('wreck site')) {
    addCandidate("When and why did the vessel sink?", 'CAUSE_CONSEQUENCE');
    addCandidate("Who discovered the wreck site?", 'HISTORICAL_DEVELOPMENT');
    addCandidate("What artifacts were recovered from the wreck?", 'CULTURE_DAILY_LIFE');
    addCandidate("What condition is the wreck in today?", 'LANDMARK_STRUCTURE');
  }
  // Ghost towns / Abandoned settlements / Mining booms
  else if (rawType.includes('ghost') || rawType.includes('abandon') || combinedContext.includes('abandon') || combinedContext.includes('ghost town') || combinedContext.includes('deserted') || combinedContext.includes('boom town') || combinedContext.includes('mining town') || rawName.toLowerCase().includes('ghost town')) {
    addCandidate(`Why was ${shortName} abandoned?`, 'CAUSE_CONSEQUENCE');
    addCandidate(`What was daily life like for miners in ${shortName}?`, 'CULTURE_DAILY_LIFE');
    addCandidate(`What structures survive in ${shortName} today?`, 'LANDMARK_STRUCTURE');
    if (combinedContext.includes('mine') || combinedContext.includes('gold') || combinedContext.includes('silver')) {
      addCandidate(`How was gold ore extracted in ${shortName}?`, 'LANDMARK_STRUCTURE');
    }
  }
  // Archaeological sites / Ancient ruins / Pyramids / Temples
  else if (rawType.includes('archaeological') || rawType.includes('ruin') || rawType.includes('ancient') || combinedContext.includes('archaeolog') || combinedContext.includes('ancient') || combinedContext.includes('pyramid') || combinedContext.includes('temple') || rawType.includes('monument')) {
    addCandidate(`What was the original civic or religious purpose of ${shortName}?`, 'CAUSE_CONSEQUENCE');
    addCandidate("What major discoveries were uncovered during excavations?", 'LANDMARK_STRUCTURE');
    addCandidate(`What rituals or ceremonies took place at ${shortName}?`, 'CULTURE_DAILY_LIFE');
    addCandidate(`What can visitors see at the site today?`, 'LANDMARK_STRUCTURE');
  }
  // Battles / Historical events / Castles / Forts
  else if (rawType.includes('battle') || rawType.includes('historical_event') || combinedContext.includes('battle') || combinedContext.includes('siege') || combinedContext.includes('treaty') || combinedContext.includes('war') || rawType.includes('castle') || rawType.includes('fort')) {
    addCandidate("What strategic factors led to this event?", 'CAUSE_CONSEQUENCE');
    addCandidate("Who were the key military commanders involved?", 'HISTORICAL_DEVELOPMENT');
    addCandidate("What were the long-term historical consequences?", 'HISTORICAL_DEVELOPMENT');
    addCandidate(`What defensive features did the fortifications have?`, 'LANDMARK_STRUCTURE');
  }
  // National parks / Natural features / Mountains / Volcanoes / Canyons / Waterfalls
  else if (rawType.includes('park') || rawType.includes('mountain') || rawType.includes('canyon') || rawType.includes('natural') || rawType.includes('volcano') || rawType.includes('waterfall') || rawType.includes('lake') || rawType.includes('glacier')) {
    addCandidate("How was this geological formation created?", 'GEOGRAPHY_ENVIRONMENT');
    addCandidate("What unique wildlife or ecosystems exist here?", 'GEOGRAPHY_ENVIRONMENT');
    addCandidate("What are the most notable geographic features?", 'LANDMARK_STRUCTURE');
    addCandidate("How has the landscape changed over time?", 'HISTORICAL_DEVELOPMENT');
  }
  // Populated Places / Cities / Settlements
  else {
    addCandidate(`How did the founding of ${shortName} influence the surrounding region?`, 'HISTORICAL_DEVELOPMENT');
    addCandidate(`What historical events shaped the layout of ${shortName}?`, 'CAUSE_CONSEQUENCE');
    addCandidate(`What was daily life like for early inhabitants of ${shortName}?`, 'CULTURE_DAILY_LIFE');
    addCandidate(`What major archaeological discoveries were found beneath ${shortName}?`, 'LANDMARK_STRUCTURE');
  }

  // 4. Climate & Environmental Specifics
  if (location.climate && (typeof location.climate === 'object' ? location.climate.name : location.climate)) {
    const climateName = typeof location.climate === 'object' ? location.climate.name : location.climate;
    addCandidate(`How does the ${climateName} climate affect daily life here?`, 'GEOGRAPHY_ENVIRONMENT');
  }

  // 5. Select Complementary Questions Across Distinct Dimensions
  const selectedQuestions: string[] = [];
  const usedDimensions = new Set<string>();

  // Pass 1: One question per distinct dimension to ensure diversity
  for (const cand of candidates) {
    if (!usedDimensions.has(cand.dimension) && !selectedQuestions.includes(cand.question)) {
      selectedQuestions.push(cand.question);
      usedDimensions.add(cand.dimension);
    }
    if (selectedQuestions.length >= 4) break;
  }

  // Pass 2: Fill remaining slots up to 4 if needed from remaining valid candidates
  if (selectedQuestions.length < 3) {
    for (const cand of candidates) {
      if (!selectedQuestions.includes(cand.question)) {
        selectedQuestions.push(cand.question);
      }
      if (selectedQuestions.length >= 4) break;
    }
  }

  // Fallback if still under 3 (strictly specific and non-redundant)
  if (selectedQuestions.length < 3) {
    const specificFallbacks: QuestionCandidate[] = [
      { question: `How did the early settlers adapt to the environment in ${shortName}?`, dimension: 'GEOGRAPHY_ENVIRONMENT' },
      { question: `What major historical developments took place in ${shortName}?`, dimension: 'HISTORICAL_DEVELOPMENT' },
      { question: `What architectural structures survive in ${shortName} today?`, dimension: 'LANDMARK_STRUCTURE' },
      { question: `What was daily life like during the founding of ${shortName}?`, dimension: 'CULTURE_DAILY_LIFE' }
    ];

    for (const fb of specificFallbacks) {
      if (!isBroadOrRedundantQuestion(fb.question, location) && !selectedQuestions.includes(fb.question)) {
        selectedQuestions.push(fb.question);
      }
      if (selectedQuestions.length >= 3) break;
    }
  }

  return selectedQuestions.slice(0, 4);
};

/**
 * Generates the unified ordered contextual chip list:
 * 1. Normal contextual follow-up questions
 * 2. READ: [Headline] News chips for loaded articles with valid URLs
 */
export const generateContextualChips = (
  location: LocationInfo | Waypoint | null,
  showNews: boolean = true
): ContextualChip[] => {
  if (!location || !location.name) {
    return [];
  }

  const questionTexts = generateContextualQuestionChips(location);
  const chips: ContextualChip[] = questionTexts.map((q, idx) => ({
    id: `q-${idx}`,
    type: 'question',
    label: q,
    query: q
  }));

  // Append READ: [Headline] chips only when News is enabled and actual headlines with valid URLs exist
  if (showNews && Array.isArray(location.news) && location.news.length > 0) {
    location.news.forEach((n, idx) => {
      if (n && n.url && typeof n.url === 'string' && n.url.startsWith('http')) {
        const headline = (n.title || (n as any).headline || '').trim();
        if (headline) {
          const displayHeadline = headline.length > 55 ? `${headline.substring(0, 52)}...` : headline;
          chips.push({
            id: `news-${idx}`,
            type: 'news',
            label: `READ: ${displayHeadline}`,
            url: n.url,
            newsItem: n
          });
        }
      }
    });
  }

  return chips;
};

/**
 * Conservatively classifies whether a query is a follow-up about the active InfoPanel location,
 * a route-level question, or a new search query.
 */
export const classifyFollowUpIntent = (
  query: string,
  activeLocation: LocationInfo | Waypoint | null,
  isRouteActive: boolean = false,
  isExplicitChip: boolean = false
): FollowUpClassificationResult => {
  const clean = (query || '').trim();
  if (!clean) {
    return { intent: 'NEW_SEARCH', reasoning: 'Empty query' };
  }

  // 1. Explicit chip selection establishes contextual intent immediately
  if (isExplicitChip) {
    return {
      intent: 'FOLLOW_UP',
      reasoning: 'Explicit contextual chip selection'
    };
  }

  // If no location is active, it cannot be a follow-up
  if (!activeLocation || !activeLocation.name) {
    return {
      intent: 'NEW_SEARCH',
      reasoning: 'No active InfoPanel location'
    };
  }

  const activeName = activeLocation.name.toLowerCase().trim();
  const canonicalName = ((activeLocation as any).canonicalName || '').toLowerCase().trim();
  const queryLower = clean.toLowerCase();

  // 2. Check for route-level comparison intent during active TRACE ROUTE
  if (isRouteActive) {
    const routeLevelPatterns = [
      /\bwhich\s+(?:of\s+these\s+(?:towns|cities|stops|waypoints|places|locations|battles)?|one|town|city|stop|waypoint|place|location|battle)\s+(?:is|was|were|came)\s+(?:the\s+)?(?:oldest|newest|largest|smallest|first|last|furthest|farthest|most|best)\b/i,
      /\bwhich\s+(?:stop|waypoint|town|city|place|location)\s+came\s+(?:first|last|before|after)\b/i,
      /\bhow\s+(?:long|far|many\s+stops|many\s+days|many\s+miles|many\s+km)\s+(?:is|was|did)\s+(?:the\s+)?(?:route|journey|expedition|entire|whole|all)\b/i,
      /\bcompare\s+(?:the\s+)?(?:stops|waypoints|cities|locations|towns)\b/i,
      /\bwho\s+led\s+(?:the\s+)?(?:entire\s+|whole\s+)?(?:expedition|campaign|route|journey)\b/i,
      /\ball\s+stops\s+in\s+this\s+route\b/i
    ];

    for (const pattern of routeLevelPatterns) {
      if (pattern.test(clean)) {
        return {
          intent: 'ROUTE_LEVEL_QUERY',
          reasoning: 'Query asks about route-level comparison or overall route rather than specific active waypoint'
        };
      }
    }
  }

  // 3. Explicit TRACE ROUTE prefix or route command -> NEW_SEARCH
  if (/^\s*(?:trace\s+route|route\s+of|follow\s+the\s+route|journey\s+of)\b/i.test(clean)) {
    return {
      intent: 'NEW_SEARCH',
      reasoning: 'Explicit route trace command'
    };
  }

  // 4. Check for strong follow-up signals:
  // - Query explicitly names the active location (e.g. "Why was Bodie abandoned?" or "Why was Bodie, California abandoned?")
  const baseActiveName = activeName.split(',')[0].trim();
  const namesToCheck = [activeName, canonicalName, baseActiveName].filter(Boolean);
  const mentionsActiveLocation = namesToCheck.some(n => n.length > 2 && queryLower.includes(n));

  // - Query uses pronouns referencing the active location ("it", "its", "there", "they", "them", "that", "this")
  const hasPronounReference = /\b(it|its|there|they|them|that|this|here)\b/i.test(clean);

  // - Follow-up phrasing with continuation / question starters
  const isQuestionContinuation = /^(?:why|what|who|when|how|where|tell\s+me|show\s+me|can\s+you\s+tell|can\s+you\s+show|describe|explain|photos?|images?|pictures?|more\s+details|more\s+info|details\s+on)\b/i.test(clean);

  if (mentionsActiveLocation && isQuestionContinuation) {
    return {
      intent: 'FOLLOW_UP',
      reasoning: 'Question explicitly targets active location'
    };
  }

  if (hasPronounReference && isQuestionContinuation) {
    return {
      intent: 'FOLLOW_UP',
      reasoning: 'Question contains pronoun/continuation reference to active location'
    };
  }

  // Omitted subject question patterns that clearly continue topic of active location
  const omittedSubjectPatterns = [
    /^\s*why\s+(?:was|is|did|were)\s+(?:it\s+)?(?:abandoned|founded|built|destroyed|evacuated|closed|deserted|attacked|chosen|created|discovered|named)\s*\??\s*$/i,
    /^\s*what\s+(?:was|is)\s+(?:daily\s+life|life|the\s+population|the\s+history|the\s+purpose|the\s+weather|the\s+climate|the\s+legacy|the\s+significance|the\s+economy|the\s+origin)\s*(?:like|there)?\s*\??\s*$/i,
    /^\s*what\s+(?:about|remains|survives|exists|happened\s+next|happened\s+here|happened\s+after|is\s+left)\s*(?:today|now|there)?\b/i,
    /^\s*who\s+(?:lived|died|ruled|governed|discovered|founded|built|explored|worked)\s*(?:here|there)?\s*\??\s*$/i,
    /^\s*when\s+(?:did\s+that\s+happen|was\s+it\s+founded|was\s+it\s+built|was\s+it\s+abandoned|did\s+it\s+happen|was\s+it\s+discovered)\s*\??\s*$/i,
    /^\s*how\s+many\s+(?:residents|people|miners|soldiers|citizens|inhabitants|structures|buildings|mines)\s*\??\s*$/i,
    /^\s*tell\s+me\s+more\s+about\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
    /^\s*(?:more\s+details|more\s+info|more\s+information)\s+(?:on|about)\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
    /^\s*show\s+(?:me\s+)?(?:more\s+)?(?:photos?|pictures?|images?)\s*(?:of\s+it)?\s*(?:today|now)?\s*\??\s*$/i
  ];

  for (const pattern of omittedSubjectPatterns) {
    if (pattern.test(clean)) {
      return {
        intent: 'FOLLOW_UP',
        reasoning: 'Omitted subject question continuation for active location'
      };
    }
  }

  // 5. Check for strong new search signals:
  // - Clear new geographic entities or destinations (e.g. "Paris", "Ghost towns in Nevada", "Best castles in Scotland", "Find the Titanic", "Mount Fuji", "Show me places to visit in Japan")
  const newLocationSearchPatterns = [
    /^\s*(?:find|locate|search\s+for|show\s+me|take\s+me\s+to|where\s+is|where\s+are|where\s+was|places\s+to\s+visit\s+in|ghost\s+towns\s+in|castles\s+in|best\s+\w+\s+in)\s+([A-Z][a-zA-Z\s,]+)\s*\??\s*$/i,
    /^[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+$/i, // e.g. "Calico, California" or "Austin, Texas"
    /^[A-Z][a-zA-Z\s]+$/i // Single proper noun or title like "Paris", "Nevada", "Mount Fuji"
  ];

  for (const pattern of newLocationSearchPatterns) {
    const match = clean.match(pattern);
    if (match) {
      const candidateEntity = (match[1] || clean).toLowerCase().trim();
      // If the candidate entity is NOT our active location, it is a new search!
      if (!namesToCheck.some(n => n === candidateEntity || candidateEntity.includes(n))) {
        return {
          intent: 'NEW_SEARCH',
          reasoning: 'Query introduces a new location or entity'
        };
      }
    }
  }

  // 6. Default conservative fallback:
  // Ambiguous queries without clear follow-up grammar remain NEW_SEARCH
  return {
    intent: 'NEW_SEARCH',
    reasoning: 'Query does not exhibit clear follow-up grammar or reference to active location'
  };
};

import { extractAllJsonCandidates } from '../utils/jsonParser';

export const followUpSchemaConfig = {
  type: "OBJECT",
  properties: {
    answer: {
      type: "STRING",
      description: "Substantive educational answer text to the user follow-up question"
    }
  },
  required: ["answer"]
};

/**
 * Cleanly extracts answer text from model responses, handling raw Markdown,
 * structured JSON, JSON arrays, unescaped newlines, and strictly rejecting parser/delimiter artifacts.
 */
export const extractCleanAnswerText = (rawResponse: string): string => {
  if (!rawResponse || typeof rawResponse !== 'string') {
    console.log('[Follow-Up Parser] Extraction failed: Empty or invalid input response');
    return '';
  }

  const trimmed = rawResponse.trim();
  if (!trimmed) {
    console.log('[Follow-Up Parser] Extraction failed: Response is blank whitespace');
    return '';
  }

  // 1. Try standard JSON parse / extraction via parseAndExtract
  const parsed = parseAndExtract(trimmed);
  if (parsed.success && parsed.value) {
    if (typeof (parsed.value as any).answer === 'string' && (parsed.value as any).answer.trim()) {
      const cleaned = cleanAnswerProse((parsed.value as any).answer);
      if (cleaned) {
        console.log('[Follow-Up Parser] Successfully extracted answer via parseAndExtract (direct object)');
        return cleaned;
      }
    }
    if (Array.isArray(parsed.value) && parsed.value.length > 0 && typeof parsed.value[0]?.answer === 'string' && parsed.value[0].answer.trim()) {
      const cleaned = cleanAnswerProse(parsed.value[0].answer);
      if (cleaned) {
        console.log('[Follow-Up Parser] Successfully extracted answer via parseAndExtract (array unwrapped)');
        return cleaned;
      }
    }
  }

  // 2. Scan all JSON candidates anywhere within the response
  const candidates = extractAllJsonCandidates(trimmed);
  for (const cand of candidates) {
    try {
      const parsedCand = parseAndExtract(cand.extracted);
      if (parsedCand.success && parsedCand.value) {
        if (typeof (parsedCand.value as any).answer === 'string' && (parsedCand.value as any).answer.trim()) {
          const cleaned = cleanAnswerProse((parsedCand.value as any).answer);
          if (cleaned) {
            console.log('[Follow-Up Parser] Successfully extracted answer via JSON candidate scan');
            return cleaned;
          }
        }
        if (Array.isArray(parsedCand.value) && parsedCand.value.length > 0 && typeof parsedCand.value[0]?.answer === 'string' && parsedCand.value[0].answer.trim()) {
          const cleaned = cleanAnswerProse(parsedCand.value[0].answer);
          if (cleaned) {
            console.log('[Follow-Up Parser] Successfully extracted answer via JSON candidate array unwrapped');
            return cleaned;
          }
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  // 3. Try regex extraction for "answer": "..." or corrupted property keys like iệunswer": "..."
  const jsonAnswerRegex = /(?:^|[^\w])(?:answer|unswer|response|text)\s*"?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|`([^`]*)`|"""([\s\S]*?)""")/is;
  const match = trimmed.match(jsonAnswerRegex);
  if (match) {
    const rawVal = match[1] || match[2] || match[3];
    if (rawVal) {
      try {
        const unescaped = JSON.parse(`"${rawVal}"`);
        if (unescaped && typeof unescaped === 'string' && unescaped.trim()) {
          const cleaned = cleanAnswerProse(unescaped);
          if (cleaned) {
            console.log('[Follow-Up Parser] Successfully extracted answer via regex pattern matching');
            return cleaned;
          }
        }
      } catch {
        const simpleClean = rawVal.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t');
        if (simpleClean.trim()) {
          const cleaned = cleanAnswerProse(simpleClean);
          if (cleaned) {
            console.log('[Follow-Up Parser] Successfully extracted answer via regex pattern matching (escaped cleanup)');
            return cleaned;
          }
        }
      }
    }
  }

  // 4. Handle raw markdown / plain text output: strip code fences
  let rawText = trimmed
    .replace(/^```(?:json|markdown|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // If the raw text is clearly a JSON object or array structure that failed to parse (e.g. starts with { or [),
  // or contains unparsed property keys like "foo": or answer":, reject it to avoid leaking syntax fragments
  const isCorruptedJson = /^[{\[]/.test(rawText) || /[}\]]$/.test(rawText) || /^\s*"[a-zA-Z0-9_]+"\s*:/i.test(rawText) || /\b(?:answer|unswer)\s*"\s*:/i.test(rawText);
  if (isCorruptedJson) {
    console.log('[Follow-Up Parser] Rejected corrupted JSON residue in raw text fallback');
    return '';
  }

  const proseResult = cleanAnswerProse(rawText);
  if (proseResult) {
    console.log('[Follow-Up Parser] Successfully accepted clean natural prose fallback');
    return proseResult;
  }

  console.log('[Follow-Up Parser] Extraction failed: No valid answer could be extracted from response');
  return '';
};

const cleanAnswerProse = (text: string): string => {
  if (!text) return '';
  let res = text.trim();

  // Strip conversational intro filler if present
  res = res.replace(/^(?:Certainly!|Sure!|Here is the answer:?|Of course!)\s*/i, '');

  // Strip leading/trailing outer quotes if the entire string was quoted
  if ((res.startsWith('"') && res.endsWith('"')) || (res.startsWith("'") && res.endsWith("'"))) {
    res = res.slice(1, -1).trim();
  }

  // Reject if remaining text contains JSON property residue (e.g. unswer": "Dallas...)
  if (/^\s*"[a-zA-Z0-9_]+"\s*:/i.test(res) || /\b(?:answer|unswer)\s*"\s*:/i.test(res)) {
    return '';
  }

  // Ensure we did not end up with only punctuation artifacts like "]." or "]"
  if (/^[\s\].'"`}{)(;:,-]+$/.test(res)) {
    return '';
  }

  return res.trim();
};

/**
 * Researches and generates an answer for a contextual follow-up question,
 * using the active location as structured explicit context.
 */
export const researchFollowUp = async (
  question: string,
  activeLocation: LocationInfo | Waypoint,
  signal?: AbortSignal
): Promise<FollowUpItem> => {
  const locName = activeLocation.name || 'Location';
  const canonicalName = (activeLocation as any).canonicalName || locName;
  const entityType = (activeLocation as any).entityType || (activeLocation as any).type || 'Location';
  const rawDesc = (activeLocation as any).description || (activeLocation as any).context || '';
  const desc = rawDesc.replace(/```(?:json|markdown)?/gi, '').replace(/```/g, '').trim();
  const lat = (activeLocation as any).coordinates?.lat ?? (activeLocation as any).lat;
  const lng = (activeLocation as any).coordinates?.lng ?? (activeLocation as any).lng;
  const locationString = (activeLocation as any).locationString || [
    (activeLocation as any).city,
    (activeLocation as any).state || (activeLocation as any).region,
    (activeLocation as any).country
  ].filter(Boolean).join(', ');

  const notable = Array.isArray(activeLocation.notable)
    ? activeLocation.notable
        .map((n: any) => {
          if (typeof n === 'string') return `- ${n.trim()}`;
          const t = (n.title || n.name || '').trim();
          const d = (n.description || n.summary || '').trim();
          if (t && d) return `- ${t}: ${d}`;
          if (t || d) return `- ${t || d}`;
          return '';
        })
        .filter(Boolean)
        .join('\n')
    : '';

  const climateText = activeLocation.climate
    ? (typeof activeLocation.climate === 'object'
        ? `${activeLocation.climate.name || ''}: ${activeLocation.climate.description || ''}`
        : String(activeLocation.climate))
    : '';

  const existingFollowUpsText = Array.isArray(activeLocation.followUps) && activeLocation.followUps.length > 0
    ? activeLocation.followUps
        .map((fu, idx) => `Q${idx + 1}: ${fu.question}\nA${idx + 1}: ${fu.answer}`)
        .join('\n\n')
    : '';

  const systemInstruction = `You are an intelligent educational research engine for TerraExplorer.
You answer follow-up questions about specific geographic locations clearly, factually, and engagingly.
You MUST respond with a valid JSON object matching the requested schema: {"answer": "..."}.
Do not include conversational pleasantries, introductory filler, or surrounding markdown outside the JSON.`;

  const promptText = `ACTIVE LOCATION CONTEXT:
Name: ${locName}
Canonical Name: ${canonicalName}
Entity Type: ${entityType}
${locationString ? `Geographic Region: ${locationString}` : ''}
${lat !== undefined && lng !== undefined ? `Coordinates: ${lat}, ${lng}` : ''}

CURRENT INFOPANEL CONTENT (ALREADY PRESENTED TO AND READ BY THE USER):
Summary:
${desc}

${notable ? `Notable Facts:\n${notable}\n` : ''}
${climateText ? `Climate:\n${climateText}\n` : ''}
${existingFollowUpsText ? `Previously Explored Questions & Answers (Already Shown):\n${existingFollowUpsText}\n` : ''}

USER FOLLOW-UP QUESTION:
${question.trim()}

CRITICAL INSTRUCTIONS FOR NON-REPETITIVE, DELTA-ORIENTED ANSWER:
1. The user has ALREADY READ the Existing Location Summary, Notable Facts, Climate, and previous Q&As above.
2. Do NOT repeat or re-summarize that existing information.
3. Your answer must be DELTA-ORIENTED: focus directly on NEW, deeper information that answers the specific question and expands the user's understanding beyond what is already visible in the InfoPanel.
4. You may briefly reference an existing fact ONLY when strictly necessary as context to explain new details. Do NOT restate the overall background or repeat the summary.
5. Provide a direct, factual, and engaging answer specifically to "${question.trim()}".
6. Keep the tone engaging, informative, and concise (1-3 paragraphs). Go directly into the factual response without conversational filler (e.g., "Certainly!", "Sure, here is the answer:").
7. All text MUST be strictly in English.

Return a JSON object:
{
  "answer": "Substantive educational answer text providing new details not in the InfoPanel..."
}`;

  console.log(`[researchFollowUp] Starting follow-up research for location="${locName}" question="${question}"`);

  let answerText = '';
  try {
    const response = await generateContentWithRetry({
      model: modelName,
      systemInstruction,
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: followUpSchemaConfig,
        maxOutputTokens: 1200,
        temperature: 0.3
      }
    }, 3, signal);

    const responseSnippet = (response?.text || '').slice(0, 150).replace(/\n/g, ' ');
    console.log(`[researchFollowUp] Raw response received (len=${response?.text?.length || 0}): "${responseSnippet}..."`);

    const extracted = extractCleanAnswerText(response.text);
    if (extracted) {
      answerText = extracted;
      console.log(`[researchFollowUp] Successfully extracted answer for "${question}" (len=${answerText.length})`);
    } else {
      console.warn(`[researchFollowUp] extractCleanAnswerText returned empty for raw response: "${response?.text}"`);
      throw new Error(`Unable to extract valid answer for "${question}".`);
    }
  } catch (err: any) {
    if (signal?.aborted) {
      throw err;
    }
    console.error('[researchFollowUp] Failed to generate answer:', err);
    throw new Error(`Information about ${locName} regarding "${question}" is currently unavailable.`);
  }

  // Check if user explicitly asked for media/photos
  let followUpImages: Array<string | ImageMetadata> | undefined = undefined;
  const isMediaRequest = /\b(photos?|images?|pictures?|visuals?|photography|look\s+like)\b/i.test(question);
  if (isMediaRequest) {
    try {
      const searchContext = {
        waypointId: (activeLocation as any).id || locName,
        searchQuery: `${locName} ${question}`
      };
      const retrieved = await fetchAndValidateImages(activeLocation as any, searchContext);
      if (retrieved && retrieved.length > 0) {
        followUpImages = retrieved;
      }
    } catch (e) {
      console.warn('[researchFollowUp] Media retrieval failed:', e);
    }
  }

  const followUpItem: FollowUpItem = {
    id: `fu-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    question: question.trim(),
    answer: answerText,
    images: followUpImages,
    createdAt: new Date().toISOString()
  };

  return followUpItem;
};
