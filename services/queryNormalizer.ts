import { detectImageIntentCategory, ImageIntentCategory } from './imageService';
import { QueryIntent } from '../types';
import { determineHistoricalEventScope } from './geographic/historicalEventScope';
import { getAuthoritativeEventModel } from './geographic/historicalRouteRegistry';
import { toCanonicalTitleCase, getHistoricalEntityKnowledge } from './geographic/historicalCoordinateValidator';

export interface NormalizedEntityResult {
  rawQuery: string;
  normalizedEntityCandidate: string;
  canonicalEntity: string;
  isHistoricalRouteEvent: boolean;
  registryEventTitle?: string;
  routeGroupsCount?: number;
  routeIntent?: string;
}

/**
 * Removes natural language interrogative query scaffolding (e.g. "where was ... take place?",
 * "where did ... happen?", "tell me about ...", "show me ...") to isolate the core entity candidate.
 */

export interface MediaSeparationResult {
  originalQuery: string;
  cleanEntity: string;
  imageIntent: ImageIntentCategory;
  explicitMediaIntent: boolean;
}

export function extractMediaIntentAndCleanEntity(rawQuery: string, entityCandidate: string): MediaSeparationResult {
  if (!rawQuery) {
    return {
      originalQuery: '',
      cleanEntity: '',
      imageIntent: 'PHYSICAL_LOCATION',
      explicitMediaIntent: false
    };
  }

  // 1. Detect media intent from the raw query
  const intentResult = detectImageIntentCategory(rawQuery, '', '', '');
  
  let cleanEntity = entityCandidate;

  // 2. If explicit media intent is detected, cleanly separate it
  if (intentResult.explicitMediaIntent) {
    // We only strip these if they are a clean prefix ending in " of " or a clean suffix.
    const MEDIA_PREFIXES = /^\s*(?:show\s+me\s+)?(?:some\s+)?(?:historical\s+)?(?:photos?|photographs?|pictures?|images?|maps?|paintings?|illustrations?|drawings?|sketches?|coats?\s+of\s+arms|flags?|seals?|logos?|emblems?)\s+of\s+/i;
    const MEDIA_SUFFIXES = /\s+(?:photos?|photographs?|pictures?|images?|maps?|paintings?|illustrations?|drawings?|sketches?|coat\s+of\s+arms|coats\s+of\s+arms|flags?|seals?|logos?|emblems?)\s*$/i;

    cleanEntity = cleanEntity.replace(MEDIA_PREFIXES, '');
    cleanEntity = cleanEntity.replace(MEDIA_SUFFIXES, '');
  }

  

  return {
    originalQuery: rawQuery,
    cleanEntity: cleanEntity,
    imageIntent: intentResult.category,
    explicitMediaIntent: intentResult.explicitMediaIntent
  };
}

export function normalizeQueryScaffolding(query: string): string {
  if (!query) return '';
  let text = query.trim();

  // Strip trailing punctuation
  text = text.replace(/[?.,!;:]+$/, '').trim();

  // 1. Interrogative prefixes and suffixes
  // "where was/did/is/are [the] X [take place|happen|occur|located|found]?"
  text = text.replace(/^\s*(?:where|when|how)\s+(?:was|were|did|is|are)\s+(?:the\s+)?/i, '');
  text = text.replace(/^\s*(?:tell\s+me\s+about|show\s+me|find|locate|search\s+for|info\s+on|information\s+about)\s+(?:the\s+)?/i, '');
  text = text.replace(/^\s*what\s+(?:is|was|were|are)\s+(?:the\s+)?/i, '');
  text = text.replace(/^\s*(?:where|location\s+of|places?\s+of)\s+(?:the\s+)?/i, '');

  // 2. Trailing question/location predicates
  text = text.replace(/\s+(?:take\s+place|taking\s+place|took\s+place|happen|happened|occur|occurred|located|found|situated)$/i, '');
  text = text.replace(/\s+(?:start|started|begin|began|end|ended|originate|originated)$/i, '');

  // Strip remaining leading "the", "a", "an"
  text = text.replace(/^(?:the|a|an)\s+/i, '').trim();

  return text;
}

/**
 * Detects if a query refers to a known authoritative historical route event,
 * returning the normalized entity and registry metadata.
 */
export function detectHistoricalRouteEvent(query: string): NormalizedEntityResult {
  const rawQuery = query.trim();
  const normalizedCandidate = normalizeQueryScaffolding(rawQuery);
  const titleCasedCandidate = toCanonicalTitleCase(normalizedCandidate || rawQuery);

  // Check historical registry for match on normalized candidate, title-cased candidate, or raw query
  const registryModel = 
    getAuthoritativeEventModel(titleCasedCandidate) || 
    getAuthoritativeEventModel(normalizedCandidate) || 
    getAuthoritativeEventModel(rawQuery);

  const isMatch = Boolean(registryModel);
  const canonicalName = registryModel ? registryModel.eventTitle : titleCasedCandidate;
  const routeGroupsCount = registryModel ? Object.keys(registryModel.routeGroups).length : undefined;

  const result: NormalizedEntityResult = {
    rawQuery,
    normalizedEntityCandidate: titleCasedCandidate,
    canonicalEntity: canonicalName,
    isHistoricalRouteEvent: isMatch,
    registryEventTitle: registryModel?.eventTitle,
    routeGroupsCount,
    routeIntent: isMatch ? 'MULTI_ROUTE_EVENT' : undefined
  };

  if (isMatch) {
    console.log(`[HISTORICAL ROUTE DETECTION]\nrawQuery:\n"${rawQuery}"\nnormalizedEntityCandidate:\n"${titleCasedCandidate}"\nregistryMatch:\ntrue\nregistryEvent:\n"${registryModel!.eventTitle}"\nrouteGroups:\n${routeGroupsCount}\nrouteIntent:\nMULTI_ROUTE_EVENT`);
  }

  return result;
}

/**
 * Generates a clean, human-readable default name for a route when opening the Save Route overlay.
 * Follows the priority hierarchy:
 * 1. Existing meaningful route/search title (if not generic/fallback like "Route Context").
 * 2. Search/query-derived historical subject (normalizing question scaffolding and command syntax).
 * 3. Current route/location subject or route group name.
 * 4. Fallback location-based name.
 */
export function generateDefaultRouteName(context: {
  routeTitle?: string;
  routeGroupName?: string;
  query?: string;
  locationName?: string;
  canonicalName?: string;
}): string {
  const isGeneric = (str?: string): boolean => {
    if (!str || typeof str !== 'string') return true;
    const trimmed = str.trim().toLowerCase();
    return !trimmed ||
      trimmed === 'route context' ||
      trimmed === 'route' ||
      trimmed === 'default' ||
      trimmed === 'location' ||
      trimmed === 'saved route' ||
      trimmed === 'unknown' ||
      trimmed === 'unknown waypoint' ||
      trimmed === 'searching...';
  };

  const formatTitleString = (str: string): string => {
    const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'through']);
    const parts = str.trim().split(/\s+/);
    return parts.map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && minorWords.has(lower)) {
        return lower;
      }
      return toCanonicalTitleCase(w);
    }).join(' ');
  };

  // 1. Existing meaningful routeTitle
  if (context.routeTitle && !isGeneric(context.routeTitle)) {
    return context.routeTitle.trim();
  }

  // 2. Query/search derived subject
  if (context.query && context.query.trim()) {
    const raw = context.query.trim();

    // Check historical route registry first
    const hist = detectHistoricalRouteEvent(raw);
    if (hist.isHistoricalRouteEvent && hist.canonicalEntity && !isGeneric(hist.canonicalEntity)) {
      return hist.canonicalEntity;
    }

    // Clean search scaffolding
    let candidate = normalizeQueryScaffolding(raw);

    // Clean route-specific leading verbs
    candidate = candidate.replace(/^(?:follow|trace|explore)\s+(?:the\s+)?/i, '');

    if (candidate && !isGeneric(candidate)) {
      return formatTitleString(candidate);
    }
  }

  // 3. Current route group name
  if (context.routeGroupName && !isGeneric(context.routeGroupName)) {
    return formatTitleString(context.routeGroupName.trim());
  }

  // 4. Location / canonical entity fallback
  if (context.canonicalName && !isGeneric(context.canonicalName)) {
    return context.canonicalName.trim();
  }

  if (context.locationName && !isGeneric(context.locationName)) {
    return context.locationName.trim();
  }

  return 'Saved Route';
}

/**
 * Detects if a title/name string is a raw or formatted coordinate string rather than a meaningful semantic name.
 * Examples recognized:
 * - "Position 51.3762 N, 11.4558 W (modern-day location)"
 * - "Position 51.3762° N, 11.4558° W"
 * - "41.3609 N, 12.2875 E"
 * - "51.3762, -11.4558"
 * - "51.38° N, 11.46° W"
 * - "51.3762° N, 11.4558° W"
 * - "Lat: 51.3762, Lng: -11.4558"
 * - "Point (51.3762, -11.4558)"
 * - "51.3762 N, 11.4558 W"
 */
export function isCoordinateTitle(str?: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;

  // 1. Direct coordinate pattern matches:
  const coordinatePatterns = [
    /^(?:position|coordinates?|coords?|point|location|approximate position|modern position)\s*[:\s]?\s*\(?[-+]?\d+(?:\.\d+)?\s*°?\s*[nsew]?[,\s]+[-+]?\d+(?:\.\d+)?\s*°?\s*[nsew]?\)?(?:\s*\([^)]*\))?$/i,
    /^[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[nsew]?[,\s;]+\s*[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[nsew]?(?:\s*\([^)]*\))?$/i,
    /^\d+(?:\.\d+)?\s*°?\s*[nsew][,\s]+\d+(?:\.\d+)?\s*°?\s*[nsew](?:\s*\([^)]*\))?$/i,
    /^(?:lat(?:itude)?\s*[:\s]?\s*[-+]?\d+(?:\.\d+)?)\s*[,\s;]+\s*(?:(?:lng|lon(?:g(?:itude)?)?)\s*[:\s]?\s*[-+]?\d+(?:\.\d+)?)(?:\s*\([^)]*\))?$/i,
    /^\(?\s*[-+]?\d{1,3}(?:\.\d+)?\s*,\s*[-+]?\d{1,3}(?:\.\d+)?\s*\)?$/i
  ];

  if (coordinatePatterns.some(p => p.test(trimmed))) {
    return true;
  }

  // 2. Structural token ratio check:
  const stripped = trimmed
    .replace(/^(?:position|coordinates?|coords?|point|location)\s*[:\s]?/i, '')
    .replace(/\((?:modern-day location|modern location|approximate|modern-day|unconfirmed|approx\.)\)/i, '')
    .replace(/[°NSEWnsew,;:/\s+()-]/g, '')
    .trim();

  if (stripped.length >= 2 && /^[\d.]+$/.test(stripped) && (trimmed.includes('°') || /[NSEWnsew]/.test(trimmed) || trimmed.toLowerCase().includes('position') || trimmed.includes(',') || trimmed.toLowerCase().includes('point'))) {
    return true;
  }

  return false;
}

/**
 * Checks if a title is an empty or generic placeholder.
 */
export function isGenericTitle(str?: string): boolean {
  if (!str || typeof str !== 'string') return true;
  const trimmed = str.trim().toLowerCase();
  return !trimmed ||
    trimmed === 'route context' ||
    trimmed === 'route' ||
    trimmed === 'default' ||
    trimmed === 'location' ||
    trimmed === 'location info' ||
    trimmed === 'saved route' ||
    trimmed === 'unknown' ||
    trimmed === 'unknown waypoint' ||
    trimmed === 'waypoint' ||
    trimmed === 'historical waypoint' ||
    trimmed === 'searching...' ||
    trimmed === 'place' ||
    trimmed === 'point of interest' ||
    trimmed === 'n/a' ||
    trimmed === 'na' ||
    trimmed === 'none' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === '[object object]';
}

/**
 * Formats a coordinate pair into clean display metadata (e.g. "51.38° N, 11.46° W").
 */
export function formatCoordinateDisplay(coords?: { lat?: number; lng?: number }, isApproximate?: boolean): string | undefined {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number' || isNaN(coords.lat) || isNaN(coords.lng)) {
    return undefined;
  }
  const latStr = coords.lat >= 0 ? `${coords.lat.toFixed(4)}° N` : `${Math.abs(coords.lat).toFixed(4)}° S`;
  const lngStr = coords.lng >= 0 ? `${coords.lng.toFixed(4)}° E` : `${Math.abs(coords.lng).toFixed(4)}° W`;
  return `${latStr}, ${lngStr}${isApproximate ? ' (Approximate)' : ''}`;
}

/**
 * Formats a title string with proper English minor-word casing (e.g. "Battle of Gettysburg Site").
 */
export function formatTitleWithMinorWords(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  const hist = getHistoricalEntityKnowledge(trimmed);
  if (hist?.entity) return hist.entity;

  const formatWord = (w: string) => {
    if (!w) return '';
    if (/^(?:II|III|IV|VI|VII|VIII|IX|X|USA|UK|DFW|SS|USS|HMS|RMS|NASA|UNESCO|JPL|MV|HMAS|USNS|CSS|IJN|SMS|RV|SV|MS|TSS|PS)$/i.test(w)) {
      return w.toUpperCase();
    }
    if (w.length >= 2 && /^[A-Z0-9]+$/.test(w)) {
      return w;
    }
    const formatted = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    return formatted.replace(/([a-zA-Z])'([a-zA-Z]+)/g, (_, before, after) => `${before}'${after.toLowerCase()}`);
  };

  const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'through']);
  const parts = trimmed.split(/\s+/);
  return parts.map((w, idx) => {
    const lower = w.toLowerCase();
    if (idx > 0 && minorWords.has(lower)) {
      return lower;
    }
    return formatWord(w);
  }).join(' ');
}

/**
 * Generates natural language event-specific descriptive titles.
 * Examples:
 * - "RMS Lusitania" / "Lusitania" + "sinking" -> "RMS Lusitania Sinking Site"
 * - "Titanic" + "sinking" -> "RMS Titanic Sinking Site"
 * - "Lincoln" / "Abraham Lincoln" + "assassination" -> "Lincoln Assassination Site"
 * - "Amelia Earhart" + "disappearance" -> "Amelia Earhart Disappearance Site"
 * - "Battle of Gettysburg" + "battle" -> "Battle of Gettysburg Site"
 * - "Declaration of Independence" + "signing" -> "Declaration of Independence Signing Site"
 */
export function generateSemanticEventTitle(subject?: string, event?: string, relationship?: string): string | undefined {
  if (!subject && !event && !relationship) return undefined;
  
  let cleanSubject = (subject || '').trim();
  cleanSubject = cleanSubject.replace(/^(?:the|a|an)\s+/i, '').replace(/[?.,!;:]+$/, '').trim();
  
  // Canonical prefixes for famous ships if missing
  const lowerSubj = cleanSubject.toLowerCase();
  if (lowerSubj === 'lusitania' || lowerSubj === 'rms lusitania') {
    cleanSubject = 'RMS Lusitania';
  } else if (lowerSubj === 'titanic' || lowerSubj === 'rms titanic') {
    cleanSubject = 'RMS Titanic';
  } else if (lowerSubj === 'vasa' || lowerSubj === 'the vasa') {
    cleanSubject = 'Vasa';
  } else if (cleanSubject) {
    cleanSubject = formatTitleWithMinorWords(cleanSubject);
  }

  const cleanEvent = (event || relationship || '').toLowerCase().trim();

  if (cleanEvent.includes('sink') || cleanEvent.includes('sinking') || cleanEvent.includes('wreck') || cleanEvent.includes('sunken')) {
    return cleanSubject ? `${cleanSubject} Sinking Site` : 'Shipwreck Sinking Site';
  }
  if (cleanEvent.includes('assassin') || cleanEvent.includes('murder') || cleanEvent.includes('shot')) {
    return cleanSubject ? `${cleanSubject} Assassination Site` : 'Assassination Site';
  }
  if (cleanEvent.includes('disappear') || cleanEvent.includes('missing') || cleanEvent.includes('lost')) {
    return cleanSubject ? `${cleanSubject} Disappearance Site` : 'Disappearance Site';
  }
  if (cleanEvent.includes('crash') || cleanEvent.includes('wreckage') || cleanEvent.includes('downed')) {
    return cleanSubject ? `${cleanSubject} Crash Site` : 'Crash Site';
  }
  if (cleanEvent.includes('discover') || cleanEvent.includes('found') || cleanEvent.includes('recovery') || cleanEvent.includes('unearth')) {
    return cleanSubject ? `${cleanSubject} Discovery Site` : 'Discovery Site';
  }
  if (cleanEvent.includes('sign') || cleanEvent.includes('treaty')) {
    return cleanSubject ? `${cleanSubject} Signing Site` : 'Signing Site';
  }
  if (cleanEvent.includes('battle') || cleanEvent.includes('fight') || cleanEvent.includes('siege')) {
    if (/battle\b/i.test(cleanSubject)) {
      return `${cleanSubject} Site`;
    }
    return cleanSubject ? `Battle of ${cleanSubject} Site` : 'Battlefield Site';
  }
  if (cleanEvent.includes('land') || cleanEvent.includes('touchdown')) {
    return cleanSubject ? `${cleanSubject} Landing Site` : 'Landing Site';
  }
  if (cleanEvent.includes('launch') || cleanEvent.includes('liftoff')) {
    return cleanSubject ? `${cleanSubject} Launch Site` : 'Launch Site';
  }
  if (cleanEvent.includes('erupt') || cleanEvent.includes('explosion') || cleanEvent.includes('disaster')) {
    return cleanSubject ? `${cleanSubject} Site` : 'Event Site';
  }

  if (cleanSubject) {
    return `${cleanSubject} Site`;
  }

  return undefined;
}

export interface SemanticTitleContext {
  explicitTitle?: string;
  canonicalName?: string;
  displayName?: string;
  name?: string;
  subject?: string;
  event?: string;
  requestedRelationship?: string;
  landmark?: string;
  locationString?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  rawQuery?: string;
  query?: string;
  description?: string;
  historicalContext?: string;
  routeTitle?: string;
  coordinates?: { lat?: number; lng?: number };
}

/**
 * ONE canonical semantic title normalization function.
 * Implements the authoritative 5-tier hierarchy:
 * 1. Explicit canonical/descriptive title (if not generic and not coordinate-based)
 * 2. Event-specific descriptive title (e.g. "RMS Lusitania Sinking Site")
 * 3. Recognizable landmark/place name (e.g. "Ford's Theatre", "Gettysburg Battlefield")
 * 4. Generated semantic title (derived from subject / query scaffolding)
 * 5. Coordinate-based title as an absolute fallback (only when no semantic title can be established)
 */
export function normalizeSemanticEntityTitle(context: SemanticTitleContext): string {
  // 1. Explicit canonical/descriptive title already supplied by entity or search result
  const candidates = [
    context.explicitTitle,
    context.canonicalName,
    context.displayName,
    context.name
  ];

  for (const cand of candidates) {
    if (cand && typeof cand === 'string') {
      const trimmed = cand.trim();
      if (!isGenericTitle(trimmed) && !isCoordinateTitle(trimmed)) {
        const isAllUpper = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        const isAllLower = trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);
        if (isAllUpper || isAllLower) {
          return formatTitleWithMinorWords(trimmed);
        }
        return trimmed;
      }
    }
  }

  // 2. Event-specific descriptive title
  const eventTitle = generateSemanticEventTitle(
    context.subject,
    context.event,
    context.requestedRelationship
  );
  if (eventTitle && !isGenericTitle(eventTitle) && !isCoordinateTitle(eventTitle)) {
    return eventTitle;
  }

  // Check historicalContext / description / routeTitle for event semantics
  const textCorpus = `${context.routeTitle || ''} ${context.historicalContext || ''} ${context.description || ''} ${context.rawQuery || ''} ${context.query || ''}`;
  if (textCorpus) {
    if (/\blusitania\b/i.test(textCorpus) && /\b(sink|sank|sinking|torpedo|u-20)\b/i.test(textCorpus)) {
      return 'RMS Lusitania Sinking Site';
    }
    if (/\btitanic\b/i.test(textCorpus) && /\b(sink|sank|sinking|iceberg)\b/i.test(textCorpus)) {
      return 'RMS Titanic Sinking Site';
    }
    if (/\blincoln\b/i.test(textCorpus) && /\b(assassin|ford's theatre|booth)\b/i.test(textCorpus)) {
      return 'Abraham Lincoln Assassination Site';
    }
    if (/\bearhart\b/i.test(textCorpus) && /\b(disappear|howland|pacific)\b/i.test(textCorpus)) {
      return 'Amelia Earhart Disappearance Site';
    }
    if (/\bgettysburg\b/i.test(textCorpus)) {
      return 'Battle of Gettysburg Site';
    }
  }

  // 3. Recognizable landmark / place name
  const landmarkCandidates = [
    context.landmark,
    context.city,
    context.locationString,
    context.address
  ];
  for (const lmk of landmarkCandidates) {
    if (lmk && typeof lmk === 'string') {
      const trimmed = lmk.trim();
      if (!isGenericTitle(trimmed) && !isCoordinateTitle(trimmed)) {
        return formatTitleWithMinorWords(trimmed);
      }
    }
  }

  // 4. Generated semantic title from query or routeTitle
  const queryCandidates = [context.rawQuery, context.query, context.routeTitle];
  for (const q of queryCandidates) {
    if (q && typeof q === 'string') {
      const stripped = normalizeQueryScaffolding(q);
      if (stripped && !isGenericTitle(stripped) && !isCoordinateTitle(stripped)) {
        return formatTitleWithMinorWords(stripped);
      }
    }
  }

  // 5. Coordinate-based title as an absolute fallback
  if (context.coordinates && typeof context.coordinates.lat === 'number' && typeof context.coordinates.lng === 'number') {
    const lat = context.coordinates.lat;
    const lng = context.coordinates.lng;
    return `${lat >= 0 ? lat.toFixed(4) + '° N' : Math.abs(lat).toFixed(4) + '° S'}, ${lng >= 0 ? lng.toFixed(4) + '° E' : Math.abs(lng).toFixed(4) + '° W'}`;
  }

  return 'Location';
}

export interface ExtractedQuery {
  intent: QueryIntent;
  entity: string;
  queryShape?: 'NATURAL_LANGUAGE_QUESTION' | 'DIRECT' | 'HISTORICAL_ROUTE' | 'MULTI_LOCATION' | 'EXPLORATORY' | 'HISTORICAL_EVENT' | 'DISCOVERY_OBJECT_LOCATION' | string;
  subject?: string;
  event?: string;
  requestedRelationship?: string;
  discoveryTarget?: string;
  resolutionMode?: 'SINGLE_POINT' | 'MULTI_LOCATION_EXPLORATION' | 'HISTORICAL_NON_POINT';
  geographicScope?: string;
  singleLocation?: boolean;
}

export const routeIntentAndExtractEntity = (query: string): ExtractedQuery => {
  const clean = query.trim();

  // 0. Check for Authoritative Historical Route Registry Events (Precedence over single-location intents)
  const historicalDetection = detectHistoricalRouteEvent(clean);
  if (historicalDetection.isHistoricalRouteEvent) {
    return {
      intent: 'route' as any,
      entity: historicalDetection.canonicalEntity,
      subject: historicalDetection.canonicalEntity,
      resolutionMode: 'MULTI_LOCATION_EXPLORATION',
      queryShape: 'HISTORICAL_ROUTE'
    };
  }

  // 1. Check for Multi-Location Discovery patterns (Filming, multiple places, general multi-entity questions)
  const multiLocationPatterns: { regex: RegExp; getDetails: (match: RegExpMatchArray) => { subject: string; target: string } }[] = [
    // "Where was/were X filmed/shot/produced?" or "Where was the movie/series X filmed?"
    {
      regex: /^\s*where\s+(?:was|were)\s+(?:the\s+(?:movie|show|series|film|television\s+show|tv\s+show)\s+)?(.+?)\s+(?:filmed|shot|produced)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "filming locations" })
    },
    // "Places where X was filmed/shot"
    {
      regex: /^\s*(?:places|locations|sites)\s+where\s+(.+?)\s+(?:was|were)\s+(?:filmed|shot|produced)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "filming locations" })
    },
    // "What are the filming/shooting/production locations for/of/in X?"
    {
      regex: /^\s*what\s+(?:are|were)\s+(?:the\s+)?(?:filming|shooting|production)\s+locations\s+(?:for|of|in)\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "filming locations" })
    },
    // "Filming/shooting/production locations for/of/in X"
    {
      regex: /^\s*(?:filming|shooting|production|real-world|real\s+life)\s+locations\s+(?:for|of|in|used\s+in|used\s+for)\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "filming locations" })
    },
    // "Real-world locations / real places used to portray / used in X"
    {
      regex: /^\s*(?:real-world|real\s+world|real\s+life|real)\s+(?:locations|places)\s+(?:used\s+to\s+portray|used\s+in|used\s+for|in)\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "filming locations" })
    },
    // "What places/locations/cities/sites were used for/in X?"
    {
      regex: /^\s*what\s+(?:places|locations|cities|sites)\s+(?:were|are)\s+used\s+(?:for|in)\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "locations" })
    },
    // "What locations were used in/for X?"
    {
      regex: /^\s*what\s+locations\s+were\s+used\s+(?:in|for)\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "locations" })
    },
    // "What cities were involved in / important in / part of X?"
    {
      regex: /^\s*what\s+cities\s+were\s+(?:involved\s+in|important\s+in|part\s+of)\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "important cities" })
    },
    // "What places did X visit / travel to / explore?"
    {
      regex: /^\s*what\s+places\s+did\s+(.+?)\s+(?:visit|travel\s+to|explore|touch)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "places visited" })
    },
    // "Where are the locations associated with X?"
    {
      regex: /^\s*where\s+are\s+the\s+locations\s+associated\s+with\s+(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "associated locations" })
    },
    // "Where were/are/did [the] [major/key/famous] battles/sites/events/places/campaigns [fought by / fought in / of / in] X [take place / happen / occur / fought]?"
    {
      regex: /^\s*where\s+(?:were|are|did)\s+(?:the\s+)?(?:(?:major|key|famous|important|main)\s+)?(battles|events|sites|places|campaigns|stops|voyages)\s+(?:fought\s+by|fought\s+in|of|in|associated\s+with)\s+(?:the\s+)?(.+?)(?:\s+(?:fought|take\s+place|happen|occur|held))?\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[2], target: `major ${m[1]}` })
    },
    // "Where were the battles of X fought?" / "Where were the events/sites of X located?"
    {
      regex: /^\s*where\s+(?:were|are)\s+(?:the\s+)?(?:(?:major|key|famous|important|main)\s+)?(battles|events|sites|places|campaigns)\s+(?:of|for)\s+(?:the\s+)?(.+?)\s+(?:fought|located|held|situated|staged)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[2], target: `major ${m[1]}` })
    },
    // "What were the major battles / events / sites of/fought by X?"
    {
      regex: /^\s*what\s+(?:were|are)\s+(?:the\s+)?(?:(?:major|key|famous|important|main)\s+)?(battles|events|sites|places|campaigns|stops|voyages)\s+(?:fought\s+by|fought\s+in|of|in|associated\s+with)\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[2], target: `major ${m[1]}` })
    },
    // "Where did the Apollo missions land?"
    {
      regex: /^\s*where\s+did\s+(?:the\s+)?(.+?(?:missions|expeditions|landings|voyages))\s+(?:land|touch\s+down|reach)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "landing sites" })
    },
    // "What places were involved in X?"
    {
      regex: /^\s*what\s+places\s+were\s+involved\s+in\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: "places involved" })
    },
    // "What are the world's most famous waterfalls / landmarks / volcanoes / etc.?"
    {
      regex: /^\s*what\s+(?:are|were)\s+(?:the\s+)?(?:(?:world's|earth's|most\s+famous|famous|top|major|greatest|best)\s+)*(waterfalls|volcanoes|mountains|canyons|monuments|landmarks|castles|ruins|deserts|islands|cities|places|sites|wonders)\b.*?\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], target: `famous ${m[1]}` })
    }
  ];

  for (const item of multiLocationPatterns) {
    const match = clean.match(item.regex);
    if (match) {
      const { subject, target } = item.getDetails(match);
      const cleanedSubject = toCanonicalTitleCase(subject.replace(/^(?:the|a|an)\s+/i, '').replace(/[?.,!]+$/, '').trim());

      console.log(`[QUERY INTENT]\nquery="${clean.toLowerCase()}"\nintent=MULTI_LOCATION_DISCOVERY\nsubject="${cleanedSubject}"\ntarget="${target}"`);

      return {
        intent: 'MULTI_LOCATION_DISCOVERY',
        subject: cleanedSubject,
        discoveryTarget: target,
        entity: cleanedSubject,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION',
        queryShape: 'MULTI_LOCATION'
      };
    }
  }

  // 2. Check for Route / Expansion patterns
  const routePatterns = [
    /\b(?:follow|trace|journey|path|route|expansion|migration|trade network|voyage|travels?|sail(?:ed|ing)?)\b/i,
    /\bfrom\b.*?\bto\b/i
  ];
  for (const pattern of routePatterns) {
    if (pattern.test(clean)) {
      return {
        intent: 'route' as any,
        entity: clean,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION',
        queryShape: 'HISTORICAL_ROUTE'
      };
    }
  }

  // 3. Check for Discovery / Recovery patterns
  const discoveryPatterns: { regex: RegExp; getDetails: (match: RegExpMatchArray) => { subject: string; event: string; relationship: string } }[] = [
    {
      regex: /^\s*where\s+(?:was|were)\s+(?:the\s+)?(.+?)\s+(found|discovered|recovered|unearthed|excavated|located)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: m[2], relationship: 'discovery_site' })
    },
    {
      regex: /^\s*where\s+did\s+(?:they|researchers|archaeologists)?\s*(find|discover|recover|unearth|excavate)\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[2], event: m[1], relationship: 'discovery_site' })
    },
    {
      regex: /^\s*discovery\s+site\s+of\s+(?:the\s+)?(.+?)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'discovery', relationship: 'discovery_site' })
    },
    {
      regex: /^\s*location\s+where\s+(?:the\s+)?(.+?)\s+was\s+(found|discovered|recovered|unearthed)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: m[2], relationship: 'discovery_site' })
    }
  ];

  for (const item of discoveryPatterns) {
    const match = clean.match(item.regex);
    if (match) {
      const { subject, event, relationship } = item.getDetails(match);
      let entityStr = subject.replace(/[?.,!]+$/, "").trim();
      entityStr = entityStr.replace(/^(?:the\s+)?(?:wreck|wreckage|remains|ruins|site)\s+of\s+(?:the\s+)?/i, "");
      const cleanedEntity = entityStr.replace(/^the\s+/i, "");
      const kbEntry = getHistoricalEntityKnowledge(cleanedEntity) || getHistoricalEntityKnowledge(entityStr);
      const finalSubject = (kbEntry?.entity && kbEntry.entityType === 'shipwreck')
        ? kbEntry.entity
        : toCanonicalTitleCase(cleanedEntity || entityStr);
      return {
        intent: 'DISCOVERY_OBJECT_LOCATION',
        entity: finalSubject,
        subject: finalSubject,
        event,
        requestedRelationship: relationship,
        resolutionMode: 'SINGLE_POINT',
        queryShape: 'DISCOVERY_OBJECT_LOCATION'
      };
    }
  }

  // 4. Check for Historical Event patterns (Location of Event -> SINGLE_POINT)
  const historicalPatterns: { regex: RegExp; getDetails: (match: RegExpMatchArray) => { subject: string; event?: string; relationship?: string } }[] = [
    {
      regex: /^\s*where\s+did\s+(.+?)\s+take\s+place\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'event', relationship: 'event_site' })
    },
    {
      regex: /^\s*where\s+did\s+(.+?)\s+happen\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'event', relationship: 'event_site' })
    },
    {
      regex: /^\s*where\s+did\s+(.+?)\s+occur\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'event', relationship: 'event_site' })
    },
    {
      regex: /^\s*when\s+and\s+where\s+did\s+(.+?)\s+take\s+place\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'event', relationship: 'event_site' })
    },
    {
      regex: /^\s*where\s+was\s+(?:the\s+)?(.+?(?:battle|massacre|signing|treaty|launch|landing|bombing|disaster|explosion|siege|revolution|protest|riot|summit))\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: 'event', relationship: 'event_site' })
    },
    {
      regex: /^\s*where\s+was\s+(?:the\s+)?(.+?)\s+(signed|fought|launched|tested|built|founded|assassinated|executed|shot|murdered)\s*\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: m[2], relationship: `${m[2]}_site` })
    },
    {
      regex: /^\s*where\s+did\s+(?:the\s+)?(.+?)\s+(launch|land|touch\s+down|sink|sank|crash|crashed|disappear|disappeared|surrender|surrendered|sign|fight|battle|die|died|originate|erupt|erupted)\b.*?\??\s*$/i,
      getDetails: (m) => ({ subject: m[1], event: m[2], relationship: `${m[2]}_site` })
    },
  ];

  for (const item of historicalPatterns) {
    const match = clean.match(item.regex);
    if (match) {
      const { subject, event, relationship } = item.getDetails(match);
      const entityStr = subject.replace(/[?.,!]+$/, "").trim();
      const cleanedEntity = entityStr.replace(/^the\s+/i, "");
      const finalSubject = toCanonicalTitleCase(cleanedEntity || entityStr);

      const scopeInfo = determineHistoricalEventScope(finalSubject, clean);
      const resolutionMode = scopeInfo.singleLocation ? 'SINGLE_POINT' : 'HISTORICAL_NON_POINT';

      console.log(`Intent:\nHISTORICAL_EVENT\nRouting decision:\n${resolutionMode}\nsubject="${finalSubject}"\nevent="${event}"\ngeographicScope="${scopeInfo.scope}"`);

      return {
        intent: 'HISTORICAL_EVENT',
        entity: finalSubject,
        subject: finalSubject,
        event,
        requestedRelationship: relationship,
        resolutionMode: resolutionMode as any,
        queryShape: 'HISTORICAL_EVENT',
        geographicScope: scopeInfo.scope as any,
        singleLocation: scopeInfo.singleLocation
      };
    }
  }

  // 5. Check for Exploratory / mixed knowledge patterns
  const exploratoryPatterns = [
    /\bnear\b/i,
    /\baround\b/i,
    /\bshipwrecks\b/i,
    /\bplaces\s+in\b/i,
    /\bplaces\s+related\s+to\b/i,
    /\bhistory\s+of\b/i,
    /\bimportant\s+places\b/i,
    /\bevents\s+of\b/i,
    /\bbattles\s+of\b/i,
  ];

  for (const pattern of exploratoryPatterns) {
    if (pattern.test(clean)) {
      return {
        intent: 'EXPLORATORY',
        entity: clean,
        resolutionMode: 'MULTI_LOCATION_EXPLORATION',
        queryShape: 'EXPLORATORY'
      };
    }
  }

  // 6. Check for Natural language location queries (Single Point)
  const nlPatterns = [
    // "where is / are / was / were (located / found / situated) X" or "where is / are / was / were X located / found / situated"
    /^\s*where\s+(?:is|are|was|were)\s+(?:located\s+|found\s+|situated\s+)?(.+?)(?:\s+located|\s+found|\s+situated)?\s*\??\s*$/i,
    // "what is / are / was / were X"
    /^\s*what\s+(?:is|are|was|were)\s+(.+?)\s*\??\s*$/i,
    // "tell me about / tell me more about X"
    /^\s*tell\s+me\s+(?:about|more\s+about)\s+(.+?)\s*\??\s*$/i,
    // "show me / can you show me X"
    /^\s*(?:can\s+you\s+)?show\s+me\s+(.+?)\s*\??\s*$/i,
    // "find / can you find X"
    /^\s*(?:can\s+you\s+)?find\s+(.+?)\s*\??\s*$/i,
    // "locate / can you locate X"
    /^\s*(?:can\s+you\s+)?locate\s+(.+?)\s*\??\s*$/i,
    // "go to / take me to / bring me to / guide me to / navigate to X"
    /^\s*(?:take\s+me\s+to|bring\s+me\s+to|guide\s+me\s+to|navigate\s+to|go\s+to)\s+(.+?)\s*\??\s*$/i,
    // "how to get to X"
    /^\s*how\s+to\s+get\s+to\s+(.+?)\s*\??\s*$/i,
    // "search for X"
    /^\s*search\s+for\s+(.+?)\s*\??\s*$/i,
    // "location of / places of X"
    /^\s*(?:location\s+of|places?\s+of)\s+(.+?)\s*\??\s*$/i,
    // "info on / information about / information on / details about / details on X"
    /^\s*(?:info(?:rmation)?|details)\s+(?:on|about|for|regarding)\s+(.+?)\s*\??\s*$/i,
  ];

  for (const pattern of nlPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      let entityStr = match[1].replace(/[?.,!;:]+$/, "").trim();
      entityStr = entityStr.replace(/\s+(?:located|found|situated)$/i, "").trim();
      const cleanedEntity = entityStr.replace(/^(?:the|a|an)\s+/i, "").replace(/[?.,!;:]+$/, "").trim();
      return {
        intent: 'NATURAL_LOCATION',
        entity: cleanedEntity || entityStr,
        queryShape: 'NATURAL_LANGUAGE_QUESTION'
      };
    }
  }

  // 7. Fallback to Direct lookup
  return { intent: 'DIRECT', entity: clean, queryShape: 'DIRECT' };
};


