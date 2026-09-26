import { RouteWaypointMembership } from '../../types';
import { resolveWaterAwareRoute, isMaritimeJourney } from './waterRoutingService';

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
  },
  'shackleton-endurance': {
    eventTitle: "Ernest Shackleton's Endurance Expedition",
    eventPattern: /\b(?:shackleton|endurance\s+(?:expedition|voyage)|trans-antarctic)\b/i,
    routeGroups: {
      'shackleton-endurance': {
        id: 'shackleton-endurance',
        name: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        corridorDescription: "Imperial Trans-Antarctic Expedition route from Plymouth through Buenos Aires, Grytviken, the Weddell Sea, Elephant Island, and South Georgia rescue at Stromness and Punta Arenas.",
        documentedAnchors: [
          {
            id: 'plymouth',
            name: "Plymouth, England",
            canonicalName: "Plymouth",
            lat: 50.3755,
            lng: -4.1427,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 8, 1914: The Endurance departs for Buenos Aires."
          },
          {
            id: 'buenos-aires',
            name: "Buenos Aires, Argentina",
            canonicalName: "Buenos Aires",
            lat: -34.6037,
            lng: -58.3816,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "October 9, 1914: The ship arrives to pick up supplies and crew."
          },
          {
            id: 'grytviken',
            name: "Grytviken, South Georgia",
            canonicalName: "Grytviken",
            lat: -54.2811,
            lng: -36.5092,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "December 5, 1914: The expedition departs the whaling station for the Weddell Sea."
          },
          {
            id: 'weddell-sea',
            name: "Weddell Sea (Ice Trap)",
            canonicalName: "Weddell Sea",
            lat: -76.5,
            lng: -35.0,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "January 1915: The Endurance becomes frozen fast in the pack ice."
          },
          {
            id: 'endurance-sinks',
            name: "Endurance Sinks",
            canonicalName: "Endurance Sinks",
            lat: -69.08,
            lng: -51.5,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "November 21, 1915: Crushed by ice, the ship sinks, stranding the crew."
          },
          {
            id: 'elephant-island',
            name: "Elephant Island",
            canonicalName: "Elephant Island",
            lat: -61.1417,
            lng: -55.2333,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "April 1916: The crew reaches solid land for the first time in 497 days."
          },
          {
            id: 'king-haakon-bay',
            name: "King Haakon Bay",
            canonicalName: "King Haakon Bay",
            lat: -54.1500,
            lng: -37.2333,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "May 1916: Shackleton and five men land after the perilous voyage of the James Caird."
          },
          {
            id: 'stromness',
            name: "Stromness Whaling Station",
            canonicalName: "Stromness",
            lat: -54.1600,
            lng: -36.7110,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "May 20, 1916: Shackleton, Worsley, and Crean reach safety after crossing the mountains."
          },
          {
            id: 'punta-arenas',
            name: "Punta Arenas, Chile",
            canonicalName: "Punta Arenas",
            lat: -53.1638,
            lng: -70.9171,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 30, 1916: The tug Yelcho, commanded by Luis Pardo, finally rescues the remaining crew from Elephant Island."
          }
        ],
        documentedConsecutiveSegments: [
          ['plymouth', 'buenos-aires'],
          ['buenos-aires', 'grytviken'],
          ['grytviken', 'weddell-sea'],
          ['weddell-sea', 'endurance-sinks'],
          ['endurance-sinks', 'elephant-island'],
          ['elephant-island', 'king-haakon-bay'],
          ['king-haakon-bay', 'stromness'],
          ['stromness', 'punta-arenas']
        ]
      }
    }
  },
  'lewis-and-clark': {
    eventTitle: "Lewis and Clark Expedition",
    eventPattern: /\b(?:lewis\s+(?:and|&)\s+clark|corps\s+of\s+discovery)\b/i,
    routeGroups: {
      'lewis-and-clark': {
        id: 'lewis-and-clark',
        name: "Lewis and Clark Expedition",
        isSequential: true,
        corridorDescription: "Overland and river expedition of the Corps of Discovery from Camp Dubois near St. Louis along the Missouri River, across the Rocky Mountains at Lemhi Pass, to Fort Clatsop on the Pacific Coast.",
        documentedAnchors: [
          {
            id: 'camp-dubois',
            name: "Camp Dubois",
            canonicalName: "Camp Dubois",
            lat: 38.8027,
            lng: -90.1012,
            waypointType: 'route_waypoint',
            role: 'origin',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "Winter camp and official departure point of the Corps of Discovery in May 1804."
          },
          {
            id: 'st-charles',
            name: "St. Charles",
            canonicalName: "St. Charles",
            lat: 38.7839,
            lng: -90.4812,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "May 1804: Final civilian embarkation point on the Missouri River before heading into unmapped western territory."
          },
          {
            id: 'kaw-point',
            name: "Kaw Point",
            canonicalName: "Kaw Point",
            lat: 39.1172,
            lng: -94.6144,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "June 1804: Confluence of the Kansas and Missouri Rivers where the expedition encamped for three days."
          },
          {
            id: 'sergeant-floyd-monument',
            name: "Sergeant Floyd Monument",
            canonicalName: "Sergeant Floyd Monument",
            lat: 42.4608,
            lng: -96.3819,
            waypointType: 'historical_site',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 1804: Burial site of Sergeant Charles Floyd, the only member of the expedition to perish during the journey."
          },
          {
            id: 'council-bluff',
            name: "Council Bluff",
            canonicalName: "Council Bluff",
            lat: 41.4550,
            lng: -96.0233,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 1804: Site of the first formal council between the expedition and representatives of the Oto and Missouri tribes."
          },
          {
            id: 'spirit-mound',
            name: "Spirit Mound",
            canonicalName: "Spirit Mound",
            lat: 42.8683,
            lng: -96.9567,
            waypointType: 'historical_site',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 1804: Prominent natural prairie mound visited by Lewis and Clark following local indigenous legends of spirit beings."
          },
          {
            id: 'fort-mandan',
            name: "Fort Mandan",
            canonicalName: "Fort Mandan",
            lat: 47.2961,
            lng: -101.3283,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "Winter 1804–1805: Encampment among the Mandan and Hidatsa nations where Sacagawea and Toussaint Charbonneau joined the expedition."
          },
          {
            id: 'knife-river-indian-villages',
            name: "Knife River Indian Villages",
            canonicalName: "Knife River Indian Villages",
            lat: 47.3236,
            lng: -101.3853,
            waypointType: 'historical_site',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "Major indigenous trade and agricultural hub where the expedition gathered vital geographic intelligence."
          },
          {
            id: 'great-falls-portage',
            name: "Great Falls (Lower Portage)",
            canonicalName: "Great Falls (Lower Portage)",
            lat: 47.5186,
            lng: -111.1969,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "June–July 1805: Arduous 18-mile overland portage around the series of five massive waterfalls on the upper Missouri."
          },
          {
            id: 'three-forks',
            name: "Three Forks of the Missouri",
            canonicalName: "Three Forks of the Missouri",
            lat: 45.9281,
            lng: -111.5511,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "July 1805: Confluence of the Jefferson, Madison, and Gallatin Rivers, forming the headwaters of the Missouri River."
          },
          {
            id: 'lemhi-pass',
            name: "Lemhi Pass",
            canonicalName: "Lemhi Pass",
            lat: 44.9708,
            lng: -113.4464,
            waypointType: 'route_waypoint',
            role: 'transit',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "August 1805: Mountain pass over the Continental Divide where Lewis first looked west beyond the boundaries of the Louisiana Purchase."
          },
          {
            id: 'fort-clatsop',
            name: "Fort Clatsop",
            canonicalName: "Fort Clatsop",
            lat: 46.1342,
            lng: -123.8803,
            waypointType: 'route_waypoint',
            role: 'destination',
            membershipType: 'ROUTE_EXCLUSIVE',
            historicalContext: "Winter 1805–1806: Pacific coastal winter encampment near the mouth of the Columbia River before the return journey."
          }
        ],
        documentedConsecutiveSegments: [
          ['camp-dubois', 'st-charles'],
          ['st-charles', 'kaw-point'],
          ['kaw-point', 'sergeant-floyd-monument'],
          ['sergeant-floyd-monument', 'council-bluff'],
          ['council-bluff', 'spirit-mound'],
          ['spirit-mound', 'fort-mandan'],
          ['fort-mandan', 'knife-river-indian-villages'],
          ['knife-river-indian-villages', 'great-falls-portage'],
          ['great-falls-portage', 'three-forks'],
          ['three-forks', 'lemhi-pass'],
          ['lemhi-pass', 'fort-clatsop']
        ]
      }
    }
  }
};

/**
 * Returns the authoritative event model if the event title/query matches a known registry entry.
 */
export function getAuthoritativeEventModel(eventTitle?: string): HistoricalEventRouteModel | null {
  if (!eventTitle || typeof eventTitle !== 'string') return null;
  const normTitle = eventTitle.trim();
  if (!normTitle) return null;
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
  if (clean.includes('shackleton') || clean.includes('endurance') || clean.includes('antarctic')) return eventModel.routeGroups['shackleton-endurance'] || null;
  if (clean.includes('lewis') || clean.includes('clark') || clean.includes('discovery')) return eventModel.routeGroups['lewis-and-clark'] || null;

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

  const groupValues = Object.values(model.routeGroups);
  const isSingleSequentialRoute = groupValues.length === 1 && groupValues[0].isSequential;

  for (const [groupId, groupDef] of Object.entries(model.routeGroups)) {
    routeGroups.push({
      id: groupDef.id,
      name: groupDef.name,
      type: isSingleSequentialRoute ? 'documented_route' : 'detachment',
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
        globalSequence: route.length + 1,
        isSequential: groupDef.isSequential,
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

  const effectiveRouteType = isSingleSequentialRoute ? 'expedition' : 'multi_location_campaign';
  const effectiveEvidenceMode = isSingleSequentialRoute ? 'DOCUMENTED_ROUTE' : 'MULTI_ROUTE_EVENT';

  const resolvedWaypoints = resolveWaterAwareRoute(route, { title: model.eventTitle, routeType: effectiveRouteType });

  return {
    title: model.eventTitle,
    routeType: effectiveRouteType,
    routeEvidenceMode: effectiveEvidenceMode,
    isSequential: isSingleSequentialRoute,
    routeGroups,
    route: resolvedWaypoints
  };
}

