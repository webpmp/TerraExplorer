/**
 * Waypoint & Route Sequentiality Engine
 *
 * Determines whether a dataset of waypoints represents a meaningful
 * chronological or sequential route, or merely an unordered collection of locations.
 *
 * Core Principle:
 * A marker identifies a location. A connecting line asserts a relationship.
 * When the system cannot establish that waypoint order has semantic meaning,
 * do not draw a connecting line. Preserve every marker.
 */

import { Waypoint, Route } from '../types';

/**
 * Non-sequential route types by default.
 * These types represent collections, networks, regional areas, or search results.
 * An LLM asserting isSequential: true on these types is NOT trusted without independent evidence.
 */
const NON_SEQUENTIAL_ROUTE_TYPES = new Set([
  'network',
  'regional_event',
  'single_location',
  'conceptual',
  'point'
]);

/**
 * Supported sequential route types.
 * These types semantically support sequentiality (e.g. an expedition or fixed path).
 */
const SUPPORTED_SEQUENTIAL_ROUTE_TYPES = new Set([
  'fixed_path',
  'multi_location_campaign',
  'itinerary',
  'route',
  'expedition'
]);

/**
 * Metadata timestamp keys that must NEVER be treated as chronological waypoint event dates.
 */
const METADATA_TIMESTAMP_KEYS = new Set([
  'createdat',
  'created_at',
  'recordcreated',
  'recordcreationdate',
  'updatedat',
  'updated_at',
  'fetchedat',
  'fetched_at',
  'timestamp',
  'systemtimestamp',
  'publishedat',
  'published_at',
  'sourcetimestamp',
  'sourcepublishedat',
  'sequence',
  'order',
  'rank',
  'index'
]);

/**
 * Parses a domain date/year string or number into a numeric year (as float).
 * Supports BCE/BC (negative numbers), CE/AD, ISO strings, YYYY-MM-DD, and standalone years.
 * Returns null if the value cannot be reliably parsed.
 */
export function parseDomainDateToYear(dateVal: unknown): number | null {
  if (dateVal === null || dateVal === undefined) return null;

  if (typeof dateVal === 'number') {
    if (isNaN(dateVal) || !isFinite(dateVal)) return null;
    return dateVal;
  }

  if (typeof dateVal !== 'string') return null;

  const str = dateVal.trim();
  if (!str) return null;

  // Check for BC/BCE notation: e.g. "44 BCE", "300 BC"
  const bcMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:BCE|BC)\b/i);
  if (bcMatch) {
    return -parseFloat(bcMatch[1]);
  }

  // Check for AD/CE notation: e.g. "476 CE", "1066 AD"
  const ceMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:CE|AD)\b/i);
  if (ceMatch) {
    return parseFloat(ceMatch[1]);
  }

  // Check for standalone 3-4 digit year or signed year: e.g. "1492", "-500", "1969"
  const standaloneYearMatch = str.match(/^([+-]?\d{1,4})$/);
  if (standaloneYearMatch) {
    return parseFloat(standaloneYearMatch[1]);
  }

  // Try standard Date parsing for ISO / Month Day Year strings
  const parsedTimestamp = Date.parse(str);
  if (!isNaN(parsedTimestamp)) {
    const d = new Date(parsedTimestamp);
    return d.getUTCFullYear() + (d.getUTCMonth() / 12) + (d.getUTCDate() / 365);
  }

  // Check for year embedded in text like "October 1944" or "Circa 1850"
  const embeddedYearMatch = str.match(/\b([12]\d{3})\b/);
  if (embeddedYearMatch) {
    return parseFloat(embeddedYearMatch[1]);
  }

  return null;
}

/**
 * Extracts a meaningful domain-level event date or year from a waypoint.
 *
 * Rules:
 * - Accepts explicit wp.date, wp.year, wp.metadata.eventDate, wp.metadata.visitDate, wp.metadata.chronologicalDate.
 * - NEVER uses historicalPeriod (e.g. "Late Medieval Period" does not mean visited/filmed in that period).
 * - NEVER uses sequence, order, array index, marker number, search ranking.
 * - NEVER uses system creation timestamps, provenance timestamps, or news publication dates.
 */
export function extractMeaningfulWaypointDate(wp: Waypoint): number | null {
  if (!wp || typeof wp !== 'object') return null;

  // 1. Direct waypoint date/year fields
  if (wp.date !== undefined && wp.date !== null) {
    const y = parseDomainDateToYear(wp.date);
    if (y !== null) return y;
  }

  if (wp.year !== undefined && wp.year !== null) {
    const y = parseDomainDateToYear(wp.year);
    if (y !== null) return y;
  }

  // 2. Waypoint metadata domain date fields (filtering out metadata creation timestamps)
  if (wp.metadata && typeof wp.metadata === 'object') {
    for (const [key, value] of Object.entries(wp.metadata)) {
      const lowerKey = key.toLowerCase();
      if (METADATA_TIMESTAMP_KEYS.has(lowerKey)) {
        continue;
      }
      if (
        lowerKey === 'eventdate' ||
        lowerKey === 'visitdate' ||
        lowerKey === 'chronologicaldate' ||
        lowerKey === 'date' ||
        lowerKey === 'year' ||
        lowerKey === 'historicaldate'
      ) {
        const y = parseDomainDateToYear(value);
        if (y !== null) return y;
      }
    }
  }

  // Note: historicalPeriod (e.g. "Late Medieval Period") is intentionally NOT parsed as an event date.
  return null;
}

/**
 * Checks if a waypoint explicitly declares a relational transition with adjacent waypoints
 * (e.g. "before", "after", "then", "next", "origin", "destination", "departed_to").
 *
 * Note: sequence numbers, order indices, and marker numbers are NOT relational signals.
 */
export function hasExplicitRelationshipSignal(wp: Waypoint): boolean {
  if (!wp || typeof wp !== 'object') return false;

  const relationStrings = [
    wp.temporalRelation,
    wp.relationship,
    wp.metadata?.temporalRelation,
    wp.metadata?.relationship
  ].filter(Boolean);

  const sequentialKeywords = /\b(next|previous|before|after|then|origin|destination|departed|arrived|leg|itinerary_step)\b/i;

  for (const rel of relationStrings) {
    if (typeof rel === 'string' && sequentialKeywords.test(rel)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a list of waypoints represents an established chronological or sequential route.
 *
 * Precedence & Hierarchy:
 * 1. Explicit false: If route or any waypoint explicitly has isSequential === false, return false.
 * 2. Route types non-sequential by default (network, regional_event, single_location, conceptual, point):
 *    - An LLM assertion of isSequential: true is NOT trusted without independent evidence.
 *    - Requires complete meaningful chronological dates OR explicit temporal relationships.
 * 3. Complete, meaningful chronological dates:
 *    - All waypoints must have valid domain dates.
 *    - Dates must establish chronological progression (monotonically non-decreasing and last > first).
 * 4. Explicit temporal relationships:
 *    - Waypoints contain explicit transition metadata (before, after, next, then, origin, destination).
 * 5. Supported route types (fixed_path, multi_location_campaign, itinerary, route, expedition):
 *    - fixed_path returns true (physical continuous path).
 *    - itinerary / expedition / campaign with validated ordering returns true.
 * 6. Never use sequence, order, array index, marker number, search ranking, or historicalPeriod as evidence.
 * 7. Safe Default: Anything ambiguous or unsupported returns false.
 */
export function isRouteSequential(
  waypoints?: Waypoint[] | null,
  routeContext?: Partial<Route> | { routeType?: string; isSequential?: boolean; [key: string]: any }
): boolean {
  if (!waypoints || waypoints.length < 2) {
    return false;
  }

  // 1. Explicit False
  if (routeContext && routeContext.isSequential === false) {
    return false;
  }
  if (waypoints.some(wp => wp.isSequential === false)) {
    return false;
  }

  const rawRouteType = routeContext?.routeType ? String(routeContext.routeType).toLowerCase() : undefined;
  const isDefaultNonSequentialType = rawRouteType && NON_SEQUENTIAL_ROUTE_TYPES.has(rawRouteType);

  // Check for independent chronological date evidence
  const dates = waypoints.map(extractMeaningfulWaypointDate);
  const allHaveDates = dates.every(d => d !== null && !isNaN(d));

  let hasChronologicalProgression = false;
  if (allHaveDates) {
    const validDates = dates as number[];
    let isMonotonic = true;
    for (let i = 0; i < validDates.length - 1; i++) {
      if (validDates[i + 1] < validDates[i]) {
        isMonotonic = false;
        break;
      }
    }
    // Must show progression (not identical static timestamps)
    const hasProgression = validDates[validDates.length - 1] > validDates[0];
    if (isMonotonic && hasProgression) {
      hasChronologicalProgression = true;
    }
  }

  // Check for independent relational transitions
  const hasRelationalSignals = waypoints.some(hasExplicitRelationshipSignal);

  // If independent evidence exists, it is sequential regardless of routeType
  if (hasChronologicalProgression || hasRelationalSignals) {
    return true;
  }

  // 2. Non-sequential by default types (network, regional_event, single_location, conceptual, point):
  // Even if the LLM returned isSequential: true, it has no independent evidence -> return false.
  if (isDefaultNonSequentialType) {
    return false;
  }

  // 3. Supported route types
  if (rawRouteType === 'fixed_path') {
    return true;
  }

  if (rawRouteType && SUPPORTED_SEQUENTIAL_ROUTE_TYPES.has(rawRouteType)) {
    if (routeContext?.isSequential === true || waypoints.some(wp => wp.isSequential === true)) {
      return true;
    }
  }

  // 4. Standalone explicit isSequential: true (authoritative route flag or resolved waypoints)
  if (routeContext?.isSequential === true || waypoints.every(wp => wp.isSequential === true)) {
    return true;
  }

  // 5. Default safe fallback
  return false;
}
