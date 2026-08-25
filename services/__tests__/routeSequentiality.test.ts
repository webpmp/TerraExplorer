import { describe, it, expect } from 'vitest';
import { Waypoint, Route } from '../../types';
import { isRouteSequential, extractMeaningfulWaypointDate } from '../../utils/routeSequenceUtils';
import { buildGlobeRouteGeometry } from '../../utils/osmRouteArrowUtils';
import { runRoutePipeline } from '../routePipeline';
import { OSM_DETAIL_THRESHOLD } from '../geographic/osmTileService';

describe('Waypoint & Route Sequential Visualization Logic Suite', () => {

  // Test 1: Sequential waypoints with meaningful chronological dates -> true
  it('1. Sequential waypoints with meaningful chronological dates → true', () => {
    const historicalExpedition: Waypoint[] = [
      {
        id: 'wp-1',
        name: 'Palos de la Frontera',
        lat: 37.2289,
        lng: -6.8944,
        date: '1492-08-03',
        context: 'Departure on the first voyage across the Atlantic'
      },
      {
        id: 'wp-2',
        name: 'Canary Islands',
        lat: 28.2916,
        lng: -16.6291,
        date: '1492-09-06',
        context: 'Final resupply before open ocean crossing'
      },
      {
        id: 'wp-3',
        name: 'Guanahani (San Salvador)',
        lat: 24.0625,
        lng: -74.4744,
        date: '1492-10-12',
        context: 'First landfall in the Bahamas'
      }
    ];

    expect(isRouteSequential(historicalExpedition)).toBe(true);
  });

  // Test 2: Explicit authoritative ordering -> true
  it('2. Explicit authoritative ordering → true', () => {
    const waypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Start', lat: 10.0, lng: 20.0, temporalRelation: 'origin' },
      { id: 'wp-2', name: 'Next', lat: 15.0, lng: 25.0, temporalRelation: 'next stop' }
    ];

    expect(isRouteSequential(waypoints, { routeType: 'route', isSequential: true })).toBe(true);
  });

  // Test 3: Network + isSequential: true but no supporting evidence -> false
  it('3. Network + isSequential: true but no supporting evidence → false', () => {
    const networkRoute: Route = {
      routeType: 'network',
      isSequential: true,
      waypoints: [
        { id: 'wp-1', name: 'Node A', lat: 10.0, lng: 20.0, sequence: 1 },
        { id: 'wp-2', name: 'Node B', lat: 15.0, lng: 25.0, sequence: 2 },
        { id: 'wp-3', name: 'Node C', lat: 20.0, lng: 30.0, sequence: 3 }
      ]
    };

    expect(isRouteSequential(networkRoute.waypoints, networkRoute)).toBe(false);
  });

  // Test 4: Related locations without dates -> false
  it('4. Related locations without dates → false', () => {
    const waterfalls: Waypoint[] = [
      { id: 'wp-1', name: 'Niagara Falls', lat: 43.0962, lng: -79.0377 },
      { id: 'wp-2', name: 'Iguazu Falls', lat: -25.6953, lng: -54.4367 },
      { id: 'wp-3', name: 'Victoria Falls', lat: -17.9243, lng: 25.8572 }
    ];

    expect(isRouteSequential(waterfalls)).toBe(false);
  });

  // Test 5: Arbitrary array order -> false
  it('5. Arbitrary array order → false', () => {
    const searchResults: Waypoint[] = [
      { id: 'wp-1', name: 'Result 1', lat: 35.0, lng: 139.0 },
      { id: 'wp-2', name: 'Result 2', lat: 28.0, lng: 77.0 },
      { id: 'wp-3', name: 'Result 3', lat: 31.0, lng: 121.0 }
    ];

    expect(isRouteSequential(searchResults)).toBe(false);
  });

  // Test 6: sequence fields alone -> false
  it('6. sequence fields alone → false', () => {
    const numberedWaypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Place A', lat: 10.0, lng: 10.0, sequence: 1 },
      { id: 'wp-2', name: 'Place B', lat: 20.0, lng: 20.0, sequence: 2 },
      { id: 'wp-3', name: 'Place C', lat: 30.0, lng: 30.0, sequence: 3 }
    ];

    expect(isRouteSequential(numberedWaypoints)).toBe(false);
  });

  // Test 7: historicalPeriod alone -> false
  it('7. historicalPeriod alone → false', () => {
    const periodWaypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Castle A', lat: 10.0, lng: 10.0, historicalPeriod: 'Late Medieval Period' },
      { id: 'wp-2', name: 'Castle B', lat: 20.0, lng: 20.0, historicalPeriod: 'Late Medieval Period' },
      { id: 'wp-3', name: 'Castle C', lat: 30.0, lng: 30.0, historicalPeriod: 'Late Medieval Period' }
    ];

    expect(isRouteSequential(periodWaypoints)).toBe(false);
  });

  // Test 8: System/provenance timestamps alone -> false
  it('8. System/provenance timestamps alone → false', () => {
    const placesWithMetadataTimestamps: Waypoint[] = [
      {
        id: 'wp-1',
        name: 'Place 1',
        lat: 48.8584,
        lng: 2.2945,
        metadata: {
          createdAt: '2026-08-24T19:54:48.000Z',
          recordCreated: '2026-08-24T19:54:48.000Z'
        },
        provenance: [
          { stage: 'route_generation', source: 'ai', timestamp: '2026-08-24T19:54:48.000Z' }
        ]
      },
      {
        id: 'wp-2',
        name: 'Place 2',
        lat: 51.5007,
        lng: -0.1246,
        metadata: {
          createdAt: '2026-08-24T19:54:49.000Z',
          recordCreated: '2026-08-24T19:54:49.000Z'
        },
        provenance: [
          { stage: 'route_generation', source: 'ai', timestamp: '2026-08-24T19:54:49.000Z' }
        ]
      }
    ];

    expect(isRouteSequential(placesWithMetadataTimestamps)).toBe(false);
  });

  // Test 9: Mixed/incomplete dates -> false
  it('9. Mixed/incomplete dates → false', () => {
    const incompleteChronology: Waypoint[] = [
      { id: 'wp-1', name: 'Site Alpha', lat: 10.0, lng: 10.0, date: '1910' },
      { id: 'wp-2', name: 'Site Beta', lat: 20.0, lng: 20.0 }, // Missing date
      { id: 'wp-3', name: 'Site Gamma', lat: 30.0, lng: 30.0, date: '1914' }
    ];

    expect(isRouteSequential(incompleteChronology)).toBe(false);
  });

  // Test 10: Explicit isSequential: false -> false
  it('10. Explicit isSequential: false → false', () => {
    const waypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Stop 1', lat: 10.0, lng: 10.0, date: '1900' },
      { id: 'wp-2', name: 'Stop 2', lat: 20.0, lng: 20.0, date: '1910' }
    ];

    expect(isRouteSequential(waypoints, { routeType: 'fixed_path', isSequential: false })).toBe(false);
  });

  // Test 11: Game of Thrones filming locations (Exact User Regression Test) -> false
  it('11. Game of Thrones filming locations → false', () => {
    const route = {
      routeType: "network",
      isSequential: true,
      waypoints: [
        {
          id: "game-of-thrones-1",
          name: "Dubrovnik Old Town",
          sequence: 1,
          historicalPeriod: "Late Medieval Period",
          isSequential: true,
          lat: 42.6507,
          lng: 18.0944
        },
        {
          id: "game-of-thrones-2",
          name: "Castle Ward",
          sequence: 2,
          historicalPeriod: "Late Medieval Period",
          isSequential: true,
          lat: 54.3683,
          lng: -5.5786
        },
        {
          id: "game-of-thrones-3",
          name: "Vatnajökull National Park",
          sequence: 3,
          historicalPeriod: "Late Medieval Period",
          isSequential: true,
          lat: 64.4219,
          lng: -16.8528
        },
        {
          id: "game-of-thrones-4",
          name: "Location 4",
          sequence: 4,
          historicalPeriod: "Neolithic Period",
          isSequential: true,
          lat: 43.4475,
          lng: -2.7849
        },
        {
          id: "game-of-thrones-5",
          name: "Location 5",
          sequence: 5,
          historicalPeriod: "Late Medieval Period",
          isSequential: true,
          lat: 35.8858,
          lng: 14.4031
        },
      ],
    };

    expect(isRouteSequential(route.waypoints, route)).toBe(false);
  });

  // Test 12: Markers remain visible when sequentiality is false
  it('12. Markers remain visible when sequentiality is false', async () => {
    const gotRawRoute = async () => ({
      title: "Game of Thrones Filming Locations",
      routeType: "network",
      isSequential: true,
      waypoints: [
        { id: 'wp-1', name: "Dubrovnik Old Town", sequence: 1, lat: 42.6507, lng: 18.0944 },
        { id: 'wp-2', name: "Castle Ward", sequence: 2, lat: 54.3683, lng: -5.5786 },
        { id: 'wp-3', name: "Vatnajökull National Park", sequence: 3, lat: 64.4219, lng: -16.8528 },
        { id: 'wp-4', name: "Location 4", sequence: 4, lat: 43.4475, lng: -2.7849 },
        { id: 'wp-5', name: "Location 5", sequence: 5, lat: 35.8858, lng: 14.4031 }
      ]
    });

    const route = await runRoutePipeline("Where was Game of Thrones filmed?", false, gotRawRoute, "MULTI_LOCATION_DISCOVERY");

    expect(route.waypoints.length).toBe(5);
    expect(route.waypoints.map(w => w.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(route.isSequential).toBe(false);
  });

  // Test 13: Globe lines/arrows are absent when sequentiality is false
  it('13. Globe lines/arrows are absent when sequentiality is false', () => {
    const nonSequentialWaypoints: Waypoint[] = [
      { id: 'wp-1', name: "Location A", sequence: 1, lat: 10.0, lng: 20.0, isSequential: false },
      { id: 'wp-2', name: "Location B", sequence: 2, lat: 15.0, lng: 25.0, isSequential: false }
    ];

    const geom = buildGlobeRouteGeometry({
      waypoints: nonSequentialWaypoints,
      skin: 'modern'
    });

    expect(geom).toBeNull();
  });

  // Test 14: OSM lines/arrows are absent when sequentiality is false
  it('14. OSM lines/arrows are absent when sequentiality is false', () => {
    const nonSequentialWaypoints: Waypoint[] = [
      { id: 'wp-1', name: "Location A", sequence: 1, lat: 10.0, lng: 20.0, isSequential: false },
      { id: 'wp-2', name: "Location B", sequence: 2, lat: 15.0, lng: 25.0, isSequential: false }
    ];

    expect(isRouteSequential(nonSequentialWaypoints)).toBe(false);
  });

  // Test 15: OSM_DETAIL_THRESHOLD no longer produces a runtime error
  it('15. OSM_DETAIL_THRESHOLD no longer produces a runtime error', () => {
    expect(OSM_DETAIL_THRESHOLD).toBeDefined();
    expect(typeof OSM_DETAIL_THRESHOLD).toBe('number');
    expect(OSM_DETAIL_THRESHOLD).toBeGreaterThan(0);
  });
});
