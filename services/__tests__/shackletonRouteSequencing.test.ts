import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_ROUTE_REGISTRY,
  getAuthoritativeEventModel,
  resolveCanonicalRouteGroup,
  findAuthoritativeAnchorAcrossEvent,
  validateDocumentedSegment,
  buildCanonicalEventTopology
} from '../geographic/historicalRouteRegistry';
import {
  isRouteSequential,
  groupWaypointsByRoute,
  getSequentialRouteSegments,
  getSequentialWaypointPairs
} from '../../utils/routeSequenceUtils';
import { Waypoint } from '../../types';

describe('Ernest Shackleton Endurance Expedition - Route Sequencing & Registry Validation', () => {
  it('registers Shackleton Endurance Expedition in HISTORICAL_ROUTE_REGISTRY with 9 canonical anchors and 8 consecutive segments', () => {
    const model = getAuthoritativeEventModel("Ernest Shackleton's Endurance Expedition");
    expect(model).toBeDefined();
    expect(model?.eventTitle).toBe("Ernest Shackleton's Endurance Expedition");

    const group = resolveCanonicalRouteGroup("Ernest Shackleton's Endurance Expedition", "shackleton-endurance");
    expect(group).toBeDefined();
    expect(group?.isSequential).toBe(true);
    expect(group?.documentedAnchors).toHaveLength(9);
    expect(group?.documentedConsecutiveSegments).toHaveLength(8);

    // Verify Grytviken anchor
    const grytviken = group?.documentedAnchors.find(a => a.canonicalName === 'Grytviken');
    expect(grytviken).toBeDefined();
    expect(grytviken?.lat).toBeCloseTo(-54.2811, 4);
    expect(grytviken?.lng).toBeCloseTo(-36.5092, 4);
    expect(grytviken?.waypointType).toBe('route_waypoint');
  });

  it('validates documented consecutive segments along the Shackleton corridor', () => {
    // Buenos Aires -> Grytviken
    const seg1 = validateDocumentedSegment(
      "Ernest Shackleton's Endurance Expedition",
      'Buenos Aires, Argentina',
      'Grytviken, South Georgia',
      'shackleton-endurance'
    );
    expect(seg1.segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');

    // Grytviken -> Weddell Sea
    const seg2 = validateDocumentedSegment(
      "Ernest Shackleton's Endurance Expedition",
      'Grytviken, South Georgia',
      'Weddell Sea (Ice Trap)',
      'shackleton-endurance'
    );
    expect(seg2.segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');

    // Non-consecutive: Plymouth -> Grytviken
    const nonConsecutive = validateDocumentedSegment(
      "Ernest Shackleton's Endurance Expedition",
      'Plymouth, England',
      'Grytviken, South Georgia',
      'shackleton-endurance'
    );
    expect(nonConsecutive.segmentEvidence).toBe('HIGH_LEVEL_HISTORICAL_ASSOCIATION');
  });

  it('finds authoritative anchor and memberships across event for Grytviken and other anchors', () => {
    const result = findAuthoritativeAnchorAcrossEvent(
      "Ernest Shackleton's Endurance Expedition",
      'Grytviken, South Georgia'
    );
    expect(result).toBeDefined();
    expect(result?.anchor.canonicalName).toBe('Grytviken');
    expect(result?.memberships).toHaveLength(1);
    expect(result?.memberships[0].routeGroupId).toBe('shackleton-endurance');
    expect(result?.memberships[0].sequence).toBe(3);
  });

  it('verifies Shackleton waypoints preserve sequence and routeGroupId and produce connecting route segments', () => {
    const shackletonWaypoints: Waypoint[] = [
      {
        id: 'wp-shackleton-1',
        name: 'Plymouth, England',
        canonicalName: 'Plymouth',
        lat: 50.3755,
        lng: -4.1427,
        sequence: 1,
        globalSequence: 1,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'August 8, 1914: The Endurance departs for Buenos Aires.'
      },
      {
        id: 'wp-shackleton-2',
        name: 'Buenos Aires, Argentina',
        canonicalName: 'Buenos Aires',
        lat: -34.6037,
        lng: -58.3816,
        sequence: 2,
        globalSequence: 2,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'October 9, 1914: The ship arrives to pick up supplies and crew.'
      },
      {
        id: 'wp-shackleton-3',
        name: 'Grytviken, South Georgia',
        canonicalName: 'Grytviken',
        lat: -54.2811,
        lng: -36.5092,
        sequence: 3,
        globalSequence: 3,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'December 5, 1914: The expedition departs the whaling station for the Weddell Sea.'
      },
      {
        id: 'wp-shackleton-4',
        name: 'Weddell Sea (Ice Trap)',
        canonicalName: 'Weddell Sea',
        lat: -76.5,
        lng: -35.0,
        sequence: 4,
        globalSequence: 4,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'January 1915: The Endurance becomes frozen fast in the pack ice.'
      },
      {
        id: 'wp-shackleton-5',
        name: 'Endurance Sinks',
        canonicalName: 'Endurance Sinks',
        lat: -69.08,
        lng: -51.5,
        sequence: 5,
        globalSequence: 5,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'November 21, 1915: Crushed by ice, the ship sinks, stranding the crew.'
      },
      {
        id: 'wp-shackleton-6',
        name: 'Elephant Island',
        canonicalName: 'Elephant Island',
        lat: -61.1417,
        lng: -55.2333,
        sequence: 6,
        globalSequence: 6,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'April 1916: The crew reaches solid land for the first time in 497 days.'
      },
      {
        id: 'wp-shackleton-7',
        name: 'King Haakon Bay',
        canonicalName: 'King Haakon Bay',
        lat: -54.1500,
        lng: -37.2333,
        sequence: 7,
        globalSequence: 7,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'May 1916: Shackleton and five men land after the perilous voyage of the James Caird.'
      },
      {
        id: 'wp-shackleton-8',
        name: 'Stromness Whaling Station',
        canonicalName: 'Stromness',
        lat: -54.1600,
        lng: -36.7110,
        sequence: 8,
        globalSequence: 8,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'May 20, 1916: Shackleton, Worsley, and Crean reach safety after crossing the mountains.'
      },
      {
        id: 'wp-shackleton-9',
        name: 'Punta Arenas, Chile',
        canonicalName: 'Punta Arenas',
        lat: -53.1638,
        lng: -70.9171,
        sequence: 9,
        globalSequence: 9,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'August 30, 1916: The tug Yelcho, commanded by Luis Pardo, finally rescues the remaining crew from Elephant Island.'
      }
    ];

    // Check grouping
    const groups = groupWaypointsByRoute(shackletonWaypoints);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('shackleton-endurance');
    expect(groups[0].isSequential).toBe(true);
    expect(groups[0].waypoints).toHaveLength(9);

    // Check sequential segments
    const segments = getSequentialRouteSegments(shackletonWaypoints);
    expect(segments).toHaveLength(1);
    expect(segments[0].group.id).toBe('shackleton-endurance');
    expect(segments[0].waypoints).toHaveLength(9);
    expect(segments[0].segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');

    // Check pairs for line rendering
    const pairs = getSequentialWaypointPairs(shackletonWaypoints);
    expect(pairs).toHaveLength(8);
    expect(pairs[0][0].name).toBe('Plymouth, England');
    expect(pairs[0][1].name).toBe('Buenos Aires, Argentina');
    expect(pairs[1][0].name).toBe('Buenos Aires, Argentina');
    expect(pairs[1][1].name).toBe('Grytviken, South Georgia');
    expect(pairs[2][0].name).toBe('Grytviken, South Georgia');
    expect(pairs[2][1].name).toBe('Weddell Sea (Ice Trap)');
    expect(pairs[7][0].name).toBe('Stromness Whaling Station');
    expect(pairs[7][1].name).toBe('Punta Arenas, Chile');
  });

  it('preserves architectural guardrail: arbitrary locations with dates but without route structure are not connected', () => {
    const arbitraryLocationsWithDates: Waypoint[] = [
      {
        id: 'loc-1',
        name: 'Paris',
        lat: 48.8566,
        lng: 2.3522,
        context: '1889: Eiffel Tower completed.',
        date: '1889',
        waypointType: 'historical_site',
        isSequential: false
      },
      {
        id: 'loc-2',
        name: 'London',
        lat: 51.5074,
        lng: -0.1278,
        context: '1894: Tower Bridge opened.',
        date: '1894',
        waypointType: 'historical_site',
        isSequential: false
      }
    ];

    const segments = getSequentialRouteSegments(arbitraryLocationsWithDates, {
      routeType: 'regional_event',
      isSequential: false
    });
    expect(segments).toHaveLength(0);
  });

  it('buildCanonicalEventTopology for Shackleton generates isSequential: true, routeEvidenceMode: DOCUMENTED_ROUTE, and 9 properly sequenced waypoints', () => {
    const canonical = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
    expect(canonical).toBeDefined();
    expect(canonical?.isSequential).toBe(true);
    expect(canonical?.routeEvidenceMode).toBe('DOCUMENTED_ROUTE');
    expect(canonical?.routeType).toBe('expedition');
    expect(canonical?.route).toHaveLength(9);

    // Verify Grytviken waypoint
    const grytviken = canonical?.route.find(w => w.canonicalName === 'Grytviken');
    expect(grytviken).toBeDefined();
    expect(grytviken?.sequence).toBe(3);
    expect(grytviken?.globalSequence).toBe(3);
    expect(grytviken?.routeGroupId).toBe('shackleton-endurance');
    expect(grytviken?.isSequential).toBe(true);
    expect(grytviken?.waypointType).toBe('route_waypoint');
    expect(grytviken?.segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');

    // Verify consecutive segment pairing
    const pairs = getSequentialWaypointPairs(canonical?.route as Waypoint[]);
    expect(pairs).toHaveLength(8);
  });
});

