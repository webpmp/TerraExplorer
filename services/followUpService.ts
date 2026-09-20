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
 * Generates dynamic, location-aware question suggestions tailored to the active location.
 * Uses location name, entity type, summary cues, notable facts, and climate,
 * while omitting questions already answered in existing follow-ups.
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
  const desc = ((location as any).description || (location as any).context || '').toLowerCase();
  const notable = Array.isArray(location.notable) ? location.notable : [];
  const notableText = notable.map((n: any) => {
    if (typeof n === 'string') return n;
    return `${n.title || n.name || ''} ${n.description || n.summary || ''}`;
  }).join(' ').toLowerCase();
  const combinedContext = `${desc} ${notableText}`;

  // Existing answered questions to avoid repeating
  const existingQuestions = Array.isArray(location.followUps)
    ? location.followUps.map(fu => (fu.question || '').toLowerCase().trim())
    : [];

  const candidates: string[] = [];

  const isAlreadyAnswered = (q: string): boolean => {
    const qLower = q.toLowerCase().trim();
    return existingQuestions.some(existing => {
      if (existing === qLower) return true;
      const coreKeywords = qLower.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 4);
      const matchCount = coreKeywords.filter(w => existing.includes(w)).length;
      return coreKeywords.length > 0 && matchCount >= Math.min(3, coreKeywords.length);
    });
  };

  // 1. Dynamic questions derived from Notable Facts
  for (const item of notable) {
    const title = typeof item === 'string' ? item.trim() : (item.title || item.name || '').trim();
    if (title && title.length > 2 && title.length < 35 && !title.toLowerCase().includes('fact')) {
      const q = `Tell me about ${title}`;
      if (!isAlreadyAnswered(q)) {
        candidates.push(q);
      }
      if (candidates.length >= 2) break;
    }
  }

  // 2. Entity Type Specializations
  // Shipwrecks / Maritime discovery
  if (rawType.includes('shipwreck') || combinedContext.includes('shipwreck') || combinedContext.includes('sank') || combinedContext.includes('sunk') || combinedContext.includes('wreckage') || combinedContext.includes('wreck site')) {
    candidates.push("When and why did it sink?");
    candidates.push("Who discovered the wreck?");
    candidates.push("What artifacts were recovered?");
    candidates.push("What condition is it in today?");
  }
  // Ghost towns / Abandoned settlements
  else if (rawType.includes('ghost') || rawType.includes('abandon') || combinedContext.includes('abandon') || combinedContext.includes('ghost town') || combinedContext.includes('deserted') || combinedContext.includes('boom town') || combinedContext.includes('mining town') || rawName.toLowerCase().includes('ghost town')) {
    candidates.push(`Why was ${shortName} abandoned?`);
    candidates.push("What was daily life like?");
    candidates.push("What structures survive today?");
    if (combinedContext.includes('mine') || combinedContext.includes('gold') || combinedContext.includes('silver')) {
      candidates.push("Tell me about the mining operations");
    }
  }
  // Archaeological sites / Ancient ruins / Pyramids / Temples
  else if (rawType.includes('archaeological') || rawType.includes('ruin') || rawType.includes('ancient') || combinedContext.includes('archaeolog') || combinedContext.includes('ancient') || combinedContext.includes('pyramid') || combinedContext.includes('temple') || rawType.includes('monument')) {
    candidates.push("When was it built and by whom?");
    candidates.push("What was its original purpose?");
    candidates.push("What major discoveries were made here?");
    candidates.push("What can visitors see today?");
  }
  // Battles / Historical events / Castles / Forts
  else if (rawType.includes('battle') || rawType.includes('historical_event') || combinedContext.includes('battle') || combinedContext.includes('siege') || combinedContext.includes('treaty') || combinedContext.includes('war') || rawType.includes('castle') || rawType.includes('fort')) {
    candidates.push("What led to this event?");
    candidates.push("Who were the key figures involved?");
    candidates.push("What was the outcome and legacy?");
    candidates.push("What marks this site today?");
  }
  // National parks / Natural features / Mountains / Volcanoes / Canyons / Waterfalls
  else if (rawType.includes('park') || rawType.includes('mountain') || rawType.includes('canyon') || rawType.includes('natural') || rawType.includes('volcano') || rawType.includes('waterfall') || rawType.includes('lake') || rawType.includes('glacier')) {
    candidates.push("How was it formed?");
    candidates.push("What wildlife lives here?");
    candidates.push("What are the most notable features?");
    candidates.push("What is the best time of year to visit?");
  }
  // Populated Places / Cities / Settlements
  else {
    candidates.push(`What is ${shortName} best known for?`);
    candidates.push(`What is the history of ${shortName}?`);
    candidates.push("What notable landmarks are here?");
    candidates.push("What makes this location unique?");
  }

  // 3. Summary Content Cues
  if (desc.includes('architect') || desc.includes('cathedral') || desc.includes('designed by')) {
    candidates.push("What is its architectural significance?");
  }
  if (desc.includes('disaster') || desc.includes('fire') || desc.includes('earthquake') || desc.includes('eruption')) {
    candidates.push("How did it recover from the disaster?");
  }
  if (location.climate && (typeof location.climate === 'object' ? location.climate.name : location.climate)) {
    candidates.push("What is the climate like throughout the year?");
  }

  // Deduplicate and filter out already answered questions
  const uniqueChips: string[] = [];
  for (const c of candidates) {
    const cleanChip = c.trim();
    if (cleanChip && !isAlreadyAnswered(cleanChip) && !uniqueChips.includes(cleanChip)) {
      uniqueChips.push(cleanChip);
    }
    if (uniqueChips.length >= 4) break;
  }

  // Conservative fallback if too few chips generated
  if (uniqueChips.length < 3) {
    const fallbacks = [
      `What is ${shortName} best known for?`,
      `What is the history of ${shortName}?`,
      "What notable landmarks are here?",
      "What makes this location unique?"
    ];
    for (const fb of fallbacks) {
      if (!isAlreadyAnswered(fb) && !uniqueChips.includes(fb)) {
        uniqueChips.push(fb);
      }
      if (uniqueChips.length >= 3) break;
    }
  }

  return uniqueChips.slice(0, 4);
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

EXISTING LOCATION SUMMARY:
${desc}

${notable ? `NOTABLE FACTS:\n${notable}\n` : ''}
USER FOLLOW-UP QUESTION:
${question.trim()}

CRITICAL INSTRUCTIONS:
1. Provide a direct, substantive, and well-researched answer to the user's question specifically about "${locName}".
2. Retain the location context so the answer does not drift to similarly named places or unrelated subjects.
3. Keep the tone engaging, informative, and concise (1-3 readable paragraphs).
4. Do NOT start with conversational filler like "Certainly!" or "Sure, here is the answer:". Go directly into the factual response.
5. All text MUST be strictly in English.

Return a JSON object:
{
  "answer": "Substantive educational answer text..."
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
