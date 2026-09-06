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
