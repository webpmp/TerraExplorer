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
import { doesSegmentIntersectLand, findWaterRoute } from '../geographic/waterRoutingService';
import { generateRoute } from '../geminiService';

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

  it('validates water-aware routing pathGeometry on Shackleton canonical route waypoints', () => {
    const canonical = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
    expect(canonical).toBeDefined();
    const route = canonical?.route as Waypoint[];
    expect(route).toHaveLength(9);

    route.forEach((wp, idx) => {
      console.log(`Waypoint ${idx + 1} (${wp.name}): pathGeometry points = ${wp.pathGeometry?.length ?? 0}`);
      if (wp.pathGeometry) {
        console.log(`  path: ${JSON.stringify(wp.pathGeometry)}`);
      }
    });

    // Check Plymouth -> Buenos Aires (idx 0)
    expect(route[0].pathGeometry).toBeDefined();
    expect(route[0].pathGeometry!.length).toBeGreaterThan(2);

    // Check Stromness -> Punta Arenas (idx 7)
    expect(route[7].pathGeometry).toBeDefined();
  });

  it('diagnoses each segment of Shackleton route for land intersections', () => {
    const canonical = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
    const route = canonical?.route as Waypoint[];

    for (let i = 0; i < route.length - 1; i++) {
      const from = route[i];
      const to = route[i + 1];
      const geom = from.pathGeometry || [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
      console.log(`\n--- Leg ${i + 1}: ${from.name} -> ${to.name} (${geom.length} points) ---`);
      for (let k = 0; k < geom.length - 1; k++) {
        const p1 = geom[k];
        const p2 = geom[k + 1];
        const hit = doesSegmentIntersectLand(p1, p2);
        console.log(`  Subsegment ${k} -> ${k + 1}: (${p1.lat.toFixed(2)}, ${p1.lng.toFixed(2)}) -> (${p2.lat.toFixed(2)}, ${p2.lng.toFixed(2)}) | intersectsLand: ${hit}`);
        expect(hit).toBe(false);
      }
    }
  });

  it('runs generateRoute for Shackleton Expedition and preserves all 9 waypoints and water routing geometry', async () => {
    const mockGenerateFn = async () => ({
      text: JSON.stringify({
        title: "Ernest Shackleton's Endurance Expedition",
        routeType: "expedition",
        routeEvidenceMode: "DOCUMENTED_ROUTE",
        isSequential: true,
        route: [
          { name: "Plymouth", lat: 50.3755, lng: -4.1427, sequence: 1 },
          { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, sequence: 2 },
          { name: "Grytviken", lat: -54.2811, lng: -36.5092, sequence: 3 },
          { name: "Weddell Sea", lat: -76.5, lng: -35.0, sequence: 4 },
          { name: "Endurance Sinks", lat: -69.08, lng: -51.5, sequence: 5 },
          { name: "Elephant Island", lat: -61.1417, lng: -55.2333, sequence: 6 },
          { name: "King Haakon Bay", lat: -54.15, lng: -37.2333, sequence: 7 },
          { name: "Stromness", lat: -54.16, lng: -36.711, sequence: 8 },
          { name: "Punta Arenas", lat: -53.1638, lng: -70.9171, sequence: 9 }
        ]
      })
    });

    const result = await generateRoute("Where did Ernest Shackleton's Endurance Expedition take place?", 'HISTORICAL_EVENT', mockGenerateFn);
    expect(result.waypoints).toHaveLength(9);
    expect(result.isSequential).toBe(true);

    // Verify Plymouth -> Buenos Aires pathGeometry
    expect(result.waypoints[0].pathGeometry).toBeDefined();
    expect(result.waypoints[0].pathGeometry!.length).toBeGreaterThanOrEqual(2);

    // Verify Stromness -> Punta Arenas pathGeometry
    expect(result.waypoints[7].pathGeometry).toBeDefined();
    expect(result.waypoints[7].pathGeometry!.length).toBeGreaterThanOrEqual(2);

    // Verify no subsegment intersects land
    for (let i = 0; i < result.waypoints.length - 1; i++) {
      const from = result.waypoints[i];
      const to = result.waypoints[i + 1];
      const geom = from.pathGeometry || [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
      for (let k = 0; k < geom.length - 1; k++) {
        const hit = doesSegmentIntersectLand(geom[k], geom[k + 1]);
        expect(hit).toBe(false);
      }
    }
  }, 25000);

  it('proves Stromness -> Punta Arenas enters via the Atlantic / Strait of Magellan corridor without cutting across South America', () => {
    // 1. Direct line between Stromness and Punta Arenas MUST intersect land
    const directIntersectsLand = doesSegmentIntersectLand(
      { lat: -54.16, lng: -36.711 },
      { lat: -53.1638, lng: -70.9171 }
    );
    expect(directIntersectsLand).toBe(true);

    const canonical = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
    const route = canonical?.route as Waypoint[];
    const stromnessWp = route[7]; // Stromness is index 7
    const puntaArenasWp = route[8]; // Punta Arenas is index 8

    expect(stromnessWp.name).toContain('Stromness');
    expect(puntaArenasWp.name).toContain('Punta Arenas');

    const geom = stromnessWp.pathGeometry;
    expect(geom).toBeDefined();
    expect(geom!.length).toBeGreaterThanOrEqual(3);

    // Verify first coordinate is Stromness
    expect(geom![0].lat).toBeCloseTo(-54.16, 2);
    expect(geom![0].lng).toBeCloseTo(-36.711, 2);

    // Verify last coordinate is Punta Arenas
    const lastCoord = geom![geom!.length - 1];
    expect(lastCoord.lat).toBeCloseTo(-53.1638, 2);
    expect(lastCoord.lng).toBeCloseTo(-70.9171, 2);

    // Verify intermediate waypoint passes through the Atlantic entrance of the Strait of Magellan (-52.3, -68.0)
    // and Angostura (-52.6, -69.9) rather than cutting across Patagonia or Tierra del Fuego
    const intermediateLngs = geom!.slice(1, -1).map(c => c.lng);
    const hasAtlanticMagellanEntrance = intermediateLngs.some(lng => lng > -70.5 && lng < -65.0);
    expect(hasAtlanticMagellanEntrance).toBe(true);

    // Verify every subsegment is completely over water
    for (let k = 0; k < geom!.length - 1; k++) {
      const hit = doesSegmentIntersectLand(geom![k], geom![k + 1]);
      expect(hit).toBe(false);
    }
  });

  it('guarantees pathGeometry is strictly rendering geometry and does not pollute canonical waypoints', () => {
    const canonical = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
    const waypoints = canonical?.route as Waypoint[];

    // Must be exactly 9 waypoints
    expect(waypoints).toHaveLength(9);

    // Must have exactly 8 sequential segments
    const segments = getSequentialRouteSegments(waypoints);
    expect(segments).toHaveLength(1);
    expect(segments[0].waypoints).toHaveLength(9);

    const pairs = getSequentialWaypointPairs(waypoints);
    expect(pairs).toHaveLength(8);

    // Canonical IDs and names are intact
    expect(waypoints[0].canonicalName).toBe('Plymouth');
    expect(waypoints[1].canonicalName).toBe('Buenos Aires');
    expect(waypoints[2].canonicalName).toBe('Grytviken');
    expect(waypoints[3].canonicalName).toBe('Weddell Sea');
    expect(waypoints[4].canonicalName).toBe('Endurance Sinks');
    expect(waypoints[5].canonicalName).toBe('Elephant Island');
    expect(waypoints[6].canonicalName).toBe('King Haakon Bay');
    expect(waypoints[7].canonicalName).toBe('Stromness');
    expect(waypoints[8].canonicalName).toBe('Punta Arenas');
  });
});

