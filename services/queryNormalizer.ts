import { getAuthoritativeEventModel } from './geographic/historicalRouteRegistry';
import { toCanonicalTitleCase } from './geographic/historicalCoordinateValidator';

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

