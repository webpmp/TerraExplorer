import { RouteWaypointMembership } from '../../types';

export interface AuthoritativeRouteAnchor {
  id: string;
  name: string;
  canonicalName: string;
  lat: number;
  lng: number;
  waypointType: 'route_waypoint' | 'historical_site' | 'administrative_depot';
  role: 'origin' | 'transit' | 'destination' | 'assembly' | 'regional_site';
  historicalContext: string;
  membershipType?:
    | 'ROUTE_EXCLUSIVE'
    | 'SHARED_ROUTE_ANCHOR'
    | 'EVENT_LEVEL_ANCHOR';
  sharedWithRouteGroupIds?: string[];
}

export interface AuthoritativeRouteGroupDefinition {
  id: string;
  name: string;
  isSequential: boolean;
  corridorDescription: string;
  documentedAnchors: AuthoritativeRouteAnchor[];
  documentedConsecutiveSegments: Array<[string, string]>; // Pairs of anchor IDs that form documented consecutive travel legs
}

export interface HistoricalEventRouteModel {
  eventTitle: string;
  eventPattern: RegExp;
  routeGroups: Record<string, AuthoritativeRouteGroupDefinition>;
}

export const HISTORICAL_ROUTE_REGISTRY: Record<string, HistoricalEventRouteModel> = {
  'trail-of-tears': {
    eventTitle: 'Trail of Tears',
    eventPattern: /\btrail\s+of\s+tears\b/i,
    routeGroups: {
      'northern-route': {
        id: 'northern-route',
        name: 'Northern Route',
        isSequential: true,
        corridorDescription: 'Overland corridor from SE Tennessee assembly depot through Kentucky, southern Illinois, Missouri, and northern Arkansas into Indian Territory.',
        documentedAnchors: [
          {
            id: 'new-echota',
            name: 'New Echota',
            canonicalName: 'New Echota',
            lat: 34.5408,
            lng: -84.9100,
            waypointType: 'historical_site',
            role: 'assembly',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Cherokee capital and 1835 treaty site in Georgia.'
          },
          {
            id: 'fort-cass',
            name: 'Fort Cass',
            canonicalName: 'Fort Cass',
            lat: 35.2858,
            lng: -84.7578,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'bell-route'],
            historicalContext: 'Primary military staging depot in Charleston, TN from which overland detachments departed.'
          },
          {
            id: 'fort-gibson',
            name: 'Fort Gibson',
            canonicalName: 'Fort Gibson',
            lat: 35.7981,
            lng: -95.2497,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'bell-route', 'water-route'],
            historicalContext: 'Primary military garrison and receiving depot in Indian Territory.'
          },
          {
            id: 'tahlequah',
            name: 'Tahlequah',
            canonicalName: 'Tahlequah',
            lat: 35.7094,
            lng: -94.8216,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'benge-route'],
            historicalContext: 'Final capital of the Cherokee Nation in Indian Territory.'
          }
        ],
        documentedConsecutiveSegments: [
          ['new-echota', 'fort-cass'],
          ['fort-gibson', 'tahlequah']
        ]
      },
      'benge-route': {
        id: 'benge-route',
        name: 'Benge Route',
        isSequential: true,
        corridorDescription: 'Overland corridor led by John Benge from Fort Payne, AL across Gunter\'s Landing through central Tennessee, Missouri, and northern Arkansas.',
        documentedAnchors: [
          {
            id: 'fort-payne',
            name: 'Fort Payne',
            canonicalName: 'Fort Payne',
            lat: 34.4442,
            lng: -85.7197,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Departure fort for John Benge detachment in DeKalb County, AL.'
          },
          {
            id: 'gunters-landing',
            name: 'Gunter\'s Landing',
            canonicalName: 'Gunter\'s Landing',
            lat: 34.3581,
            lng: -86.2944,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Tennessee River crossing point for the Benge detachment in Guntersville, AL.'
          },
          {
            id: 'tahlequah',
            name: 'Tahlequah',
            canonicalName: 'Tahlequah',
            lat: 35.7094,
            lng: -94.8216,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'benge-route'],
            historicalContext: 'Arrival destination in Indian Territory.'
          }
        ],
        documentedConsecutiveSegments: [
          ['fort-payne', 'gunters-landing']
        ]
      },
      'bell-route': {
        id: 'bell-route',
        name: 'Bell Route',
        isSequential: true,
        corridorDescription: 'Southern overland corridor led by John A. Bell and Lt. Edward Deas across southern Tennessee to Memphis and through central Arkansas.',
        documentedAnchors: [
          {
            id: 'fort-cass',
            name: 'Fort Cass',
            canonicalName: 'Fort Cass',
            lat: 35.2858,
            lng: -84.7578,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'bell-route'],
            historicalContext: 'Departure internment depot in Charleston, TN for the treaty party detachment.'
          },
          {
            id: 'memphis',
            name: 'Memphis',
            canonicalName: 'Memphis',
            lat: 35.1495,
            lng: -90.0489,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Mississippi River crossing point in western Tennessee.'
          },
          {
            id: 'fort-gibson',
            name: 'Fort Gibson',
            canonicalName: 'Fort Gibson',
            lat: 35.7981,
            lng: -95.2497,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'bell-route', 'water-route'],
            historicalContext: 'Western arrival post in Indian Territory.'
          }
        ],
        documentedConsecutiveSegments: []
      },
      'water-route': {
        id: 'water-route',
        name: 'Water Route',
        isSequential: true,
        corridorDescription: 'Riverine route from Ross\'s Landing down the Tennessee, Ohio, Mississippi, and Arkansas rivers to Fort Coffee / Fort Gibson in Indian Territory.',
        documentedAnchors: [
          {
            id: 'ross-landing',
            name: 'Ross\'s Landing',
            canonicalName: 'Ross\'s Landing',
            lat: 35.0560,
            lng: -85.3090,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Major embarkation point on the Tennessee River in Chattanooga, TN.'
          },
          {
            id: 'fort-coffee',
            name: 'Fort Coffee',
            canonicalName: 'Fort Coffee',
            lat: 35.3042,
            lng: -94.6144,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: 'Primary arrival river landing and receiving depot on the Arkansas River in Indian Territory.'
          },
          {
            id: 'fort-gibson',
            name: 'Fort Gibson',
            canonicalName: 'Fort Gibson',
            lat: 35.7981,
            lng: -95.2497,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'SHARED_ROUTE_ANCHOR',
            sharedWithRouteGroupIds: ['northern-route', 'bell-route', 'water-route'],
            historicalContext: 'Garrison receiving depot near the confluence of the Arkansas, Grand, and Verdigris rivers.'
          }
        ],
        documentedConsecutiveSegments: []
      }
    }
  }
};

/**
 * Returns the authoritative event model if the event title/query matches a known registry entry.
 */
export function getAuthoritativeEventModel(eventTitle: string): HistoricalEventRouteModel | null {
  const normTitle = eventTitle.trim();
  for (const model of Object.values(HISTORICAL_ROUTE_REGISTRY)) {
    if (model.eventPattern.test(normTitle) || normTitle.toLowerCase().includes(model.eventTitle.toLowerCase())) {
      return model;
    }
  }
  return null;
}

/**
 * Resolves an AI-generated or arbitrary route group identifier/name to an authoritative canonical route group definition.
 */
export function resolveCanonicalRouteGroup(
  eventTitle: string,
  groupIdOrName?: string
): AuthoritativeRouteGroupDefinition | null {
  if (!groupIdOrName) return null;
  const eventModel = getAuthoritativeEventModel(eventTitle);
  if (!eventModel) return null;

  const raw = groupIdOrName.toLowerCase().trim();
  const clean = raw.replace(/[^a-z0-9]/g, '');

  // 1. Direct ID match
  if (eventModel.routeGroups[raw]) return eventModel.routeGroups[raw];
  if (eventModel.routeGroups[clean]) return eventModel.routeGroups[clean];

  // 2. Name or substring match
  for (const [id, def] of Object.entries(eventModel.routeGroups)) {
    const defCleanName = def.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const defCleanId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean === defCleanName || clean === defCleanId) return def;
    if (defCleanName.includes(clean) || clean.includes(defCleanName)) return def;
    if (defCleanId.includes(clean) || clean.includes(defCleanId)) return def;
  }

  // 3. Keyword / alias mapping
  if (clean.includes('northern') || clean.includes('north')) return eventModel.routeGroups['northern-route'] || null;
  if (clean.includes('benge') || clean.includes('johnbenge')) return eventModel.routeGroups['benge-route'] || null;
  if (clean.includes('bell') || clean.includes('johnbell')) return eventModel.routeGroups['bell-route'] || null;
  if (clean.includes('water') || clean.includes('river') || clean.includes('boat')) return eventModel.routeGroups['water-route'] || null;

  return null;
}

/**
 * Helper to match candidate string against authoritative anchor name/canonicalName.
 */
export function isAnchorMatch(cand: string, anchor: AuthoritativeRouteAnchor): boolean {
  if (!cand) return false;
  // If candidate name has segment connector ' to ' or ' -> ' or ' - ', it is a segment description, not an anchor
  if (/\bto\b/i.test(cand) || cand.includes('->') || cand.includes('—')) {
    return false;
  }
  const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanAnchor = anchor.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanCanonical = anchor.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (cleanCand === cleanAnchor || cleanCand === cleanCanonical) return true;
  if (cleanCand.length >= 6 && (cleanAnchor.includes(cleanCand) || cleanCand.includes(cleanAnchor))) return true;
  if (cleanCand.length >= 6 && (cleanCanonical.includes(cleanCand) || cleanCand.includes(cleanCanonical))) return true;
  return false;
}

/**
 * Searches across all route groups in the registered event to find the canonical anchor
 * and all its documented route memberships.
 */
export function findAuthoritativeAnchorAcrossEvent(
  eventTitle: string,
  candidateName: string
): {
  anchor: AuthoritativeRouteAnchor;
  memberships: RouteWaypointMembership[];
} | null {
  const eventModel = getAuthoritativeEventModel(eventTitle);
  if (!eventModel) return null;

  let matchedAnchor: AuthoritativeRouteAnchor | null = null;
  const memberships: RouteWaypointMembership[] = [];
  const visitedGroupIds = new Set<string>();

  for (const [groupId, groupDef] of Object.entries(eventModel.routeGroups)) {
    for (let idx = 0; idx < groupDef.documentedAnchors.length; idx++) {
      const anchor = groupDef.documentedAnchors[idx];
      if (isAnchorMatch(candidateName, anchor)) {
        if (!matchedAnchor) {
          matchedAnchor = anchor;
        }
        if (!visitedGroupIds.has(groupId)) {
          visitedGroupIds.add(groupId);
          memberships.push({
            routeGroupId: groupId,
            routeGroupName: groupDef.name,
            sequence: idx + 1,
            membershipType: anchor.membershipType || (anchor.sharedWithRouteGroupIds && anchor.sharedWithRouteGroupIds.length > 1 ? 'SHARED_ROUTE_ANCHOR' : 'ROUTE_EXCLUSIVE')
          });
        }
      }
    }
  }

  if (!matchedAnchor) return null;

  // If anchor declared sharedWithRouteGroupIds that weren't directly visited in the loop, resolve them
  if (matchedAnchor.sharedWithRouteGroupIds) {
    for (const gId of matchedAnchor.sharedWithRouteGroupIds) {
      if (!visitedGroupIds.has(gId) && eventModel.routeGroups[gId]) {
        const groupDef = eventModel.routeGroups[gId];
        const aIdx = groupDef.documentedAnchors.findIndex(a => isAnchorMatch(candidateName, a));
        visitedGroupIds.add(gId);
        memberships.push({
          routeGroupId: gId,
          routeGroupName: groupDef.name,
          sequence: aIdx >= 0 ? aIdx + 1 : undefined,
          membershipType: 'SHARED_ROUTE_ANCHOR'
        });
      }
    }
  }

  return {
    anchor: matchedAnchor,
    memberships
  };
}

/**
 * Validates a candidate entity against the authoritative route model.
 * Precedence:
 * 1. Match candidate across the entire event registry.
 * 2. If not found in registry, reject if it is a registered event.
 * 3. Retrieve canonical memberships.
 * 4. Compare AI membership against canonical membership.
 * 5. Reconcile to canonical memberships (Registry wins).
 */
export function validateCandidateAgainstRegistry(
  eventTitle: string,
  candidateName: string,
  candidateGroupId: string,
  candidateGroupName?: string,
  candidateMemberships?: RouteWaypointMembership[]
): {
  isRegisteredEvent: boolean;
  isRegisteredAnchor: boolean;
  anchor?: AuthoritativeRouteAnchor;
  isGroupValid: boolean;
  expectedGroupId?: string;
  canonicalGroupDef?: AuthoritativeRouteGroupDefinition;
  canonicalMemberships?: RouteWaypointMembership[];
  action?: 'ACCEPT' | 'REGISTRY_OVERRIDE' | 'REJECT';
  reason: string;
} {
  const eventModel = getAuthoritativeEventModel(eventTitle);
  if (!eventModel) {
    return {
      isRegisteredEvent: false,
      isRegisteredAnchor: false,
      isGroupValid: true,
      reason: 'Event not governed by strict authoritative registry'
    };
  }

  // 1. Find candidate across the entire event registry
  const match = findAuthoritativeAnchorAcrossEvent(eventTitle, candidateName);
  if (!match) {
    return {
      isRegisteredEvent: true,
      isRegisteredAnchor: false,
      isGroupValid: false,
      action: 'REJECT',
      reason: `Location "${candidateName}" is not an authoritative documented anchor for ${eventModel.eventTitle}`
    };
  }

  const { anchor, memberships: canonicalMemberships } = match;

  // Resolve candidate group ID or Name to canonical definition
  const resolvedGroupDef = resolveCanonicalRouteGroup(eventTitle, candidateGroupId) ||
    resolveCanonicalRouteGroup(eventTitle, candidateGroupName);

  const candidateGId = resolvedGroupDef?.id || candidateGroupId;

  // Check if candidate group matches one of the canonical memberships
  const matchingCanonicalMembership = canonicalMemberships.find(m => m.routeGroupId === candidateGId);

  if (matchingCanonicalMembership) {
    const groupDef = eventModel.routeGroups[matchingCanonicalMembership.routeGroupId];
    return {
      isRegisteredEvent: true,
      isRegisteredAnchor: true,
      anchor,
      isGroupValid: true,
      expectedGroupId: matchingCanonicalMembership.routeGroupId,
      canonicalGroupDef: groupDef,
      canonicalMemberships,
      action: 'ACCEPT',
      reason: `Documented authoritative anchor for ${groupDef?.name || candidateGId}: ${anchor.historicalContext}`
    };
  }

  // If candidate group was 'default' or not matched to this specific route,
  // but anchor is an EVENT_LEVEL_ANCHOR or a canonical anchor in another route:
  // Canonical registry overrides AI's guess!
  const primaryCanonicalMembership = canonicalMemberships[0];
  const primaryGroupDef = eventModel.routeGroups[primaryCanonicalMembership.routeGroupId];

  console.log(`[ROUTE MEMBERSHIP RECONCILIATION]
Waypoint: ${anchor.name}
AI Membership: ${candidateGroupName || candidateGroupId}
Canonical Membership: ${canonicalMemberships.map(m => m.routeGroupName || m.routeGroupId).join(', ')}
Action: REGISTRY_OVERRIDE`);

  return {
    isRegisteredEvent: true,
    isRegisteredAnchor: true,
    anchor,
    isGroupValid: true,
    expectedGroupId: primaryCanonicalMembership.routeGroupId,
    canonicalGroupDef: primaryGroupDef,
    canonicalMemberships,
    action: 'REGISTRY_OVERRIDE',
    reason: `Canonical registry reconciled membership for "${anchor.name}" to [${canonicalMemberships.map(m => m.routeGroupName || m.routeGroupId).join(', ')}] (AI provided: "${candidateGroupName || candidateGroupId}")`
  };
}

/**
 * Validates whether two consecutive waypoints within a route group form a DOCUMENTED_ROUTE_SEGMENT.
 */
export function validateDocumentedSegment(
  eventTitle: string,
  fromEntityName: string,
  toEntityName: string,
  routeGroupId: string
): {
  segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT' | 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' | 'INFERRED_CONNECTION';
  reason: string;
} {
  const eventModel = getAuthoritativeEventModel(eventTitle);
  if (!eventModel) {
    return {
      segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
      reason: 'General route: segment accepted under standard sequence evidence.'
    };
  }

  const groupDef = eventModel.routeGroups[routeGroupId.toLowerCase()];
  if (!groupDef) {
    return {
      segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION',
      reason: `Route group "${routeGroupId}" is not a registered detachment.`
    };
  }

  const normFrom = fromEntityName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTo = toEntityName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const fromAnchor = groupDef.documentedAnchors.find(a => {
    const nA = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nC = a.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normFrom === nA || normFrom === nC || normFrom.includes(nA) || nA.includes(normFrom);
  });

  const toAnchor = groupDef.documentedAnchors.find(a => {
    const nA = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nC = a.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normTo === nA || normTo === nC || normTo.includes(nA) || nA.includes(normTo);
  });

  if (!fromAnchor || !toAnchor) {
    return {
      segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION',
      reason: `One or both endpoints ("${fromEntityName}", "${toEntityName}") are not verified corridor anchors.`
    };
  }

  const isDocumentedConsecutive = groupDef.documentedConsecutiveSegments.some(([a, b]) => {
    return (a === fromAnchor.id && b === toAnchor.id) || (a === toAnchor.id && b === fromAnchor.id);
  });

  if (isDocumentedConsecutive) {
    return {
      segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
      reason: `Documented consecutive travel segment between ${fromAnchor.name} and ${toAnchor.name} on ${groupDef.name}.`
    };
  }

  return {
    segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION',
    reason: `Locations "${fromAnchor.name}" and "${toAnchor.name}" are documented corridor anchors on ${groupDef.name}, but do not form a single direct consecutive travel segment without intermediate documented stops.`
  };
}

/**
 * Builds the canonical deterministic route structure directly from the authoritative registry.
 * Used for deterministic recovery of registered historical events when LLM generation fails or truncates.
 */
export function buildCanonicalEventTopology(eventTitle: string): {
  title: string;
  routeType: string;
  routeEvidenceMode: string;
  isSequential: boolean;
  routeGroups: Array<{
    id: string;
    name: string;
    type: string;
    isSequential: boolean;
    description: string;
  }>;
  route: Array<any>;
} | null {
  const model = getAuthoritativeEventModel(eventTitle);
  if (!model) return null;

  const routeGroups: Array<{
    id: string;
    name: string;
    type: string;
    isSequential: boolean;
    description: string;
  }> = [];

  const route: Array<any> = [];

  for (const [groupId, groupDef] of Object.entries(model.routeGroups)) {
    routeGroups.push({
      id: groupDef.id,
      name: groupDef.name,
      type: 'detachment',
      isSequential: groupDef.isSequential,
      description: groupDef.corridorDescription
    });

    groupDef.documentedAnchors.forEach((anchor, idx) => {
      const match = findAuthoritativeAnchorAcrossEvent(model.eventTitle, anchor.name);
      route.push({
        id: `${groupDef.id}-${anchor.id}`,
        name: anchor.name,
        canonicalName: anchor.canonicalName,
        lat: anchor.lat,
        lng: anchor.lng,
        sequence: idx + 1,
        routeGroupId: groupDef.id,
        routeGroupName: groupDef.name,
        memberships: [{
          routeGroupId: groupDef.id,
          routeGroupName: groupDef.name,
          sequence: idx + 1,
          membershipType: anchor.membershipType || 'ROUTE_EXCLUSIVE'
        }],
        waypointType: anchor.waypointType,
        role: anchor.role,
        context: anchor.historicalContext,
        description: anchor.historicalContext,
        significance: anchor.historicalContext,
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT'
      });
    });
  }

  return {
    title: model.eventTitle,
    routeType: 'multi_location_campaign',
    routeEvidenceMode: 'MULTI_ROUTE_EVENT',
    isSequential: false,
    routeGroups,
    route
  };
}
