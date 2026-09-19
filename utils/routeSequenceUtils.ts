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

import { Waypoint, Route, RouteGroup } from '../types';

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
 * 1. Explicit false: If routeContext or any waypoint explicitly has isSequential === false, return false.
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
  routeContext?: Partial<Route> | { routeType?: string; isSequential?: boolean; routeEvidenceMode?: string; [key: string]: any }
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

/**
 * Groups waypoints into logical route groups (detachments / corridors / independent sequences).
 *
 * Rules:
 * - If route.routeGroups already exists, preserve the explicit grouping while associating waypoints.
 * - Otherwise group by wp.routeGroupId (or wp.routeGroupName).
 * - If no route groups exist and waypoints form a standard sequence, create one default route group.
 * - Never infer that geographically nearby locations belong to the same route group without evidence.
 * - Never merge explicitly separate route groups.
 */
export function groupWaypointsByRoute(
  waypoints: Waypoint[],
  route?: Partial<Route>
): RouteGroup[] {
  if (!waypoints || waypoints.length === 0) {
    return [];
  }

  // Case 1: Route already has explicit routeGroups
  if (route?.routeGroups && route.routeGroups.length > 0) {
    const wpMap = new Map<string, Waypoint[]>();

    waypoints.forEach(wp => {
      // If a waypoint already has a route-scoped ID or dedicated routeGroupId that matches its ID prefix,
      // assign it strictly to its own route group and do NOT replicate it into other groups.
      const isRouteScoped = wp.routeGroupId && wp.id && wp.id.startsWith(`${wp.routeGroupId}-`);

      // If waypoint has explicit memberships and is NOT already route-scoped to a single group, add to each group
      if (!isRouteScoped && Array.isArray(wp.memberships) && wp.memberships.length > 0) {
        wp.memberships.forEach(m => {
          const gId = m.routeGroupId;
          if (!wpMap.has(gId)) wpMap.set(gId, []);
          // Clone waypoint with route-scoped properties for this group's view
          wpMap.get(gId)!.push({
            ...wp,
            routeGroupId: m.routeGroupId,
            routeGroupName: m.routeGroupName || wp.routeGroupName,
            sequence: (m.routeGroupId === wp.routeGroupId && typeof wp.sequence === 'number') ? wp.sequence : (typeof m.sequence === 'number' ? m.sequence : wp.sequence)
          });
        });
      } else {
        const gId = wp.routeGroupId || 'default';
        if (!wpMap.has(gId)) {
          wpMap.set(gId, []);
        }
        wpMap.get(gId)!.push(wp);
      }
    });

    const definedGroups = route.routeGroups.map(rg => {
      const groupWaypoints = wpMap.get(rg.id) || rg.waypoints || [];
      // Sort within the group by route-local sequence
      const sortedWps = [...groupWaypoints].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      return {
        ...rg,
        waypoints: sortedWps
      };
    });

    // Only if definedGroups has no waypoints at all, fall back to wpMap
    if (definedGroups.length === 0) {
      const coveredGroupIds = new Set(route.routeGroups.map(rg => rg.id));
      for (const [gId, wps] of wpMap.entries()) {
        if (!coveredGroupIds.has(gId) && gId !== 'default') {
          const sortedWps = [...wps].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          definedGroups.push({
            id: gId,
            name: wps[0]?.routeGroupName || gId,
            type: 'documented_route',
            isSequential: wps.every(w => w.isSequential !== false),
            routeEvidenceMode: wps[0]?.routeEvidenceMode || route.routeEvidenceMode,
            waypoints: sortedWps
          });
        }
      }
    }

    return definedGroups;
  }

  // Case 2: Group by waypoint.memberships or waypoint.routeGroupId
  const hasMemberships = waypoints.some(wp => (Array.isArray(wp.memberships) && wp.memberships.length > 0) || wp.routeGroupId);
  if (hasMemberships) {
    const groupsMap = new Map<string, { name: string; isSeq: boolean; evidenceMode?: any; wps: Waypoint[] }>();

    waypoints.forEach(wp => {
      const isRouteScoped = wp.routeGroupId && wp.id && wp.id.startsWith(`${wp.routeGroupId}-`);
      if (!isRouteScoped && Array.isArray(wp.memberships) && wp.memberships.length > 0) {
        wp.memberships.forEach(m => {
          const gId = m.routeGroupId;
          const gName = m.routeGroupName || wp.routeGroupName || gId;
          if (!groupsMap.has(gId)) {
            const wpIsSeq = wp.isSequential !== false;
            groupsMap.set(gId, {
              name: gName,
              isSeq: wpIsSeq,
              evidenceMode: wp.routeEvidenceMode || route?.routeEvidenceMode,
              wps: []
            });
          }
          groupsMap.get(gId)!.wps.push({
            ...wp,
            routeGroupId: m.routeGroupId,
            routeGroupName: m.routeGroupName || wp.routeGroupName,
            sequence: typeof m.sequence === 'number' ? m.sequence : wp.sequence
          });
        });
      } else {
        const gId = wp.routeGroupId || 'default';
        const gName = wp.routeGroupName || (gId === 'default' ? (route?.title || 'Route') : gId);
        if (!groupsMap.has(gId)) {
          // Group-level sequentiality: check waypoint flag or default to group-level date/sequence evidence
          const wpIsSeq = wp.isSequential !== false;
          groupsMap.set(gId, {
            name: gName,
            isSeq: wpIsSeq,
            evidenceMode: wp.routeEvidenceMode || route?.routeEvidenceMode,
            wps: []
          });
        }
        groupsMap.get(gId)!.wps.push(wp);
      }
    });

    const result: RouteGroup[] = [];
    for (const [gId, gData] of groupsMap.entries()) {
      const sortedWps = [...gData.wps].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      // Determine isSequential for this group:
      // If waypoints explicitly declare isSequential !== false and show sequential properties
      const hasConsecutiveSeq = sortedWps.length >= 2 && sortedWps.every((w, idx) => (w.sequence ?? (idx + 1)) === idx + 1);
      const isMultiRoute = route?.routeEvidenceMode === 'MULTI_ROUTE_EVENT' || gData.evidenceMode === 'MULTI_ROUTE_EVENT';
      const isGroupSeq = gData.wps.some(w => w.isSequential === false)
        ? false
        : ((route?.isSequential === true && route?.routeType !== 'network' && route?.routeType !== 'regional_event') ||
           gData.wps.every(w => w.isSequential === true) ||
           (isMultiRoute && hasConsecutiveSeq) ||
           isRouteSequential(sortedWps, { ...route, routeType: route?.routeType, isSequential: undefined }));

      result.push({
        id: gId,
        name: gData.name,
        type: 'documented_route',
        isSequential: isGroupSeq,
        routeEvidenceMode: gData.evidenceMode,
        waypoints: sortedWps
      });
    }
    return result;
  }

  // Case 3: Single default route group for single-sequence routes
  const sortedWps = [...waypoints].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const isSeq = isRouteSequential(sortedWps, route);

  return [
    {
      id: 'default',
      name: route?.title || 'Main Route',
      type: 'documented_route',
      isSequential: isSeq,
      routeEvidenceMode: route?.routeEvidenceMode,
      waypoints: sortedWps
    }
  ];
}

/**
 * Returns sequential route segments grouped by route group.
 *
 * Invariants:
 * - Groups waypoints by route group.
 * - Preserves route-local chronology.
 * - Returns only groups where group.isSequential === true.
 * - Preserves waypoint sequence order.
 * - NEVER creates a segment bridging across different route groups.
 * - NEVER sorts waypoints globally across route groups.
 * - NEVER infers a route segment solely from geographic proximity.
 */
export interface RouteSegment {
  group: RouteGroup;
  waypoints: Waypoint[];
  segmentEvidence?: 'DOCUMENTED_ROUTE_SEGMENT' | 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' | 'INFERRED_CONNECTION';
}

/**
 * Returns sequential route segments grouped by route group and evidence state.
 *
 * Invariants:
 * - Groups waypoints strictly by route group (never spans across groups).
 * - Preserves route-local chronology.
 * - Filters out historical_site and administrative_depot vertices.
 * - Supports DOCUMENTED_ROUTE_SEGMENT (solid/primary) and HIGH_LEVEL_HISTORICAL_ASSOCIATION (secondary/dashed/faded).
 * - NEVER creates a segment bridging across different route groups.
 * - NEVER sorts waypoints globally across route groups.
 * - NEVER infers a route segment solely from geographic proximity.
 */
export function getSequentialRouteSegments(
  waypoints: Waypoint[],
  routeContext?: Partial<Route>
): RouteSegment[] {
  if (!waypoints || waypoints.length < 2) {
    return [];
  }

  const groups = groupWaypointsByRoute(waypoints, routeContext);
  const sequentialSegments: RouteSegment[] = [];

  for (const group of groups) {
    if (group.isSequential && group.waypoints && group.waypoints.length >= 2) {
      const gWps = group.waypoints;
      let currentChain: Waypoint[] = [];
      let currentChainEvidence: 'DOCUMENTED_ROUTE_SEGMENT' | 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' | undefined;

      for (let i = 0; i < gWps.length - 1; i++) {
        const fromWp = gWps[i];
        const toWp = gWps[i + 1];

        const isConsecutive = (toWp.sequence ?? (i + 2)) === ((fromWp.sequence ?? (i + 1)) + 1);
        const fromType = fromWp.waypointType ?? 'route_waypoint';
        const toType = toWp.waypointType ?? 'route_waypoint';
        const fromEvidence = fromWp.segmentEvidence ?? 'DOCUMENTED_ROUTE_SEGMENT';

        const isPairRenderable =
          isConsecutive &&
          fromType !== 'non_route_location' &&
          toType !== 'non_route_location' &&
          (fromEvidence === 'DOCUMENTED_ROUTE_SEGMENT' || fromEvidence === 'HIGH_LEVEL_HISTORICAL_ASSOCIATION') &&
          fromWp.isSequential !== false &&
          toWp.isSequential !== false;

        if (isPairRenderable) {
          if (currentChain.length === 0) {
            currentChain.push(fromWp);
            currentChain.push(toWp);
            currentChainEvidence = fromEvidence;
          } else if (currentChainEvidence === fromEvidence) {
            currentChain.push(toWp);
          } else {
            // Evidence level changed: push existing chain and start new one
            sequentialSegments.push({
              group,
              waypoints: [...currentChain],
              segmentEvidence: currentChainEvidence
            });
            currentChain = [fromWp, toWp];
            currentChainEvidence = fromEvidence;
          }
        } else {
          if (currentChain.length >= 2) {
            sequentialSegments.push({
              group,
              waypoints: [...currentChain],
              segmentEvidence: currentChainEvidence
            });
          }
          currentChain = [];
          currentChainEvidence = undefined;
        }
      }

      if (currentChain.length >= 2) {
        sequentialSegments.push({
          group,
          waypoints: [...currentChain],
          segmentEvidence: currentChainEvidence
        });
      }
    }
  }

  return sequentialSegments;
}

/**
 * Returns explicit pairs of consecutive waypoints that receive connecting lines.
 *
 * Critical Invariant:
 * Every pair [A, B] MUST belong to the exact same route group and sequence.
 * Both A and B must be route_waypoints with DOCUMENTED_ROUTE_SEGMENT evidence.
 * A and B will NEVER have different routeGroupId values.
 */
export function getSequentialWaypointPairs(
  waypoints: Waypoint[],
  routeContext?: Partial<Route>,
  options?: { requireDocumentedEvidence?: boolean }
): Array<[Waypoint, Waypoint]> {
  const segments = getSequentialRouteSegments(waypoints, routeContext);
  const pairs: Array<[Waypoint, Waypoint]> = [];

  for (const segment of segments) {
    const wps = segment.waypoints;
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      // Double check evidence gating on pair
      const aType = a.waypointType ?? 'route_waypoint';
      const bType = b.waypointType ?? 'route_waypoint';
      const aEv = a.segmentEvidence ?? segment.segmentEvidence ?? 'DOCUMENTED_ROUTE_SEGMENT';

      const isPairValid = options?.requireDocumentedEvidence
        ? (aType !== 'non_route_location' && bType !== 'non_route_location' && aEv === 'DOCUMENTED_ROUTE_SEGMENT')
        : (aType !== 'non_route_location' && bType !== 'non_route_location' && (aEv === 'DOCUMENTED_ROUTE_SEGMENT' || aEv === 'HIGH_LEVEL_HISTORICAL_ASSOCIATION'));

      if (isPairValid) {
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}

/**
 * Diagnostic logger for historical route structure & connecting segments.
 */
export function logHistoricalRouteStructure(route: Route): void {
  const groups = route.routeGroups || groupWaypointsByRoute(route.waypoints, route);
  const segments = getSequentialRouteSegments(route.waypoints, route);

  console.log(`\n===== HISTORICAL ROUTE STRUCTURE =====`);
  console.log(`Event: ${route.title || 'Historical Event'}`);
  console.log(`routeEvidenceMode: ${route.routeEvidenceMode || 'DOCUMENTED_ROUTE'}`);
  console.log(`event.isSequential: ${route.isSequential}`);

  for (const group of groups) {
    console.log(`Route Group: ${group.name}`);
    console.log(`routeGroupId: ${group.id}`);
    console.log(`isSequential: ${group.isSequential}`);
    console.log(`Waypoints:`);
    group.waypoints.forEach((wp, idx) => {
      console.log(`  ${wp.sequence ?? idx + 1}. ${wp.name} (ID: ${wp.id}, LatLng: ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})`);
    });
  }
  console.log(`=======================================\n`);

  console.log(`===== ROUTE SEGMENTS =====`);
  if (segments.length === 0) {
    console.log(`(No sequential connecting lines)`);
  } else {
    for (const seg of segments) {
      for (let i = 0; i < seg.waypoints.length - 1; i++) {
        console.log(`<${seg.group.name}>: ${seg.waypoints[i].name} → ${seg.waypoints[i + 1].name}`);
      }
    }
  }
  console.log(`=======================================\n`);
}

/**
 * Diagnostic logger for the shared route render model across Globe and OSM layers.
 */
export function logRouteRenderModel(
  routeWaypoints: Waypoint[],
  routeContext?: Partial<Route>
): void {
  const groups = groupWaypointsByRoute(routeWaypoints, routeContext);
  const segments = getSequentialRouteSegments(routeWaypoints, routeContext);

  console.log(`\n[ROUTE RENDER MODEL]`);
  for (const group of groups) {
    console.log(`Route Group: ${group.name}`);
    group.waypoints.forEach((wp, idx) => {
      console.log(`  Marker ${wp.sequence ?? idx + 1}: ${wp.name}`);
    });
    console.log(`  Segments:`);
    const groupSeg = segments.find(s => s.group.id === group.id);
    if (!groupSeg || groupSeg.waypoints.length < 2) {
      console.log(`    none`);
    } else {
      for (let i = 0; i < groupSeg.waypoints.length - 1; i++) {
        console.log(`    ${groupSeg.waypoints[i].name} → ${groupSeg.waypoints[i + 1].name}`);
      }
    }
  }
}

/**
 * Validates route and waypoint data integrity for historical routes.
 *
 * Invariants enforced:
 * 1. Canonical Waypoint ID rule: For route-scoped historical waypoints, id must follow `{routeGroupId}-{anchorSlug}`.
 *    Identity consistency: Waypoint ID prefix must strictly match `routeGroupId`.
 * 2. Route-local sequence integrity: Waypoints within each route group must have contiguous sequences starting at 1 (1..N).
 * 3. Global sequence integrity: Waypoints across the dataset must have contiguous globalSequence starting at 1 (1..totalWaypoints).
 * 4. Waypoint uniqueness: No duplicate waypoint IDs across the entire route dataset.
 * 5. Multi-route physical location rule: Physical locations on multiple routes must be separate route-scoped objects.
 */
export function validateHistoricalRouteData(route: Route): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!route || !Array.isArray(route.waypoints)) {
    return { isValid: false, issues: ['Route or waypoints array is missing'] };
  }

  const waypoints = route.waypoints;
  const seenIds = new Set<string>();

  // 1. Check duplicate IDs & Route ID Prefix Consistency
  waypoints.forEach((wp, idx) => {
    if (!wp.id) {
      issues.push(`Waypoint at index ${idx} ("${wp.name}") is missing an ID.`);
      return;
    }

    if (seenIds.has(wp.id)) {
      issues.push(`Duplicate waypoint ID detected: "${wp.id}" ("${wp.name}").`);
    }
    seenIds.add(wp.id);

    // If ID contains a hyphen, check if it claims a routeGroupId prefix
    // For canonical historical route waypoints: format is {routeGroupId}-{anchorSlug}
    if (wp.routeGroupId && wp.id.includes('-')) {
      // Check if ID starts with routeGroupId or if ID prefix is a known foreign group ID
      if (wp.id.startsWith(`${wp.routeGroupId}-`)) {
        // Valid prefix matching routeGroupId
      } else if (route.routeGroups && route.routeGroups.some(rg => rg.id !== wp.routeGroupId && wp.id.startsWith(`${rg.id}-`))) {
        issues.push(`Contradictory route identity: Waypoint "${wp.name}" has id="${wp.id}" but routeGroupId="${wp.routeGroupId}".`);
      }
    }
  });

  // 2. Route-local sequence check (contiguous 1..N per route group)
  const groups = groupWaypointsByRoute(waypoints, route);
  for (const group of groups) {
    const gWps = group.waypoints;
    for (let i = 0; i < gWps.length; i++) {
      const expectedSeq = i + 1;
      if (gWps[i].sequence !== expectedSeq) {
        issues.push(`Route group "${group.name}" (${group.id}) sequence gap: Waypoint "${gWps[i].name}" has sequence ${gWps[i].sequence}, expected ${expectedSeq}.`);
      }
      if (gWps[i].routeGroupId && gWps[i].routeGroupId !== group.id) {
        issues.push(`Route group membership mismatch: Waypoint "${gWps[i].name}" in group "${group.id}" has routeGroupId="${gWps[i].routeGroupId}".`);
      }
    }
  }

  // 3. Global sequence check (contiguous 1..totalWaypoints without gaps)
  for (let i = 0; i < waypoints.length; i++) {
    const expectedGlobalSeq = i + 1;
    if (waypoints[i].globalSequence !== expectedGlobalSeq) {
      issues.push(`Global sequence gap: Waypoint "${waypoints[i].name}" has globalSequence ${waypoints[i].globalSequence}, expected ${expectedGlobalSeq}.`);
    }
  }

  const isValid = issues.length === 0;

  if (!isValid && process.env.NODE_ENV !== 'production') {
    console.warn(`\n[HISTORICAL ROUTE VALIDATION] Integrity violations detected (${issues.length}):\n${issues.map(iss => `  - ${iss}`).join('\n')}\n`);
  }

  return { isValid, issues };
}

/**
 * Resolves the deterministic stable identity for a route waypoint or marker.
 */
export function getWaypointStableId(wp: { id?: string; name: string; lat: number; lng: number }): string {
  return wp.id || `${wp.name}-${wp.lat}-${wp.lng}`;
}

/**
 * Finds the immediate next waypoint in a route list given the current waypoint.
 * Returns null if the current waypoint is the last waypoint or cannot be found.
 */
export function findNextRouteWaypoint(currentWp: Waypoint, waypoints: Waypoint[]): Waypoint | null {
  if (!waypoints || waypoints.length <= 1) return null;
  const currentIdx = waypoints.findIndex(w => w.id === currentWp.id || (w.lat === currentWp.lat && w.lng === currentWp.lng));
  if (currentIdx >= 0 && currentIdx < waypoints.length - 1) {
    return waypoints[currentIdx + 1];
  }
  return null;
}
