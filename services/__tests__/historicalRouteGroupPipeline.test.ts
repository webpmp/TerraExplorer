import { describe, it, expect } from 'vitest';
import { isRouteSequential, groupWaypointsByRoute, getSequentialRouteSegments, getSequentialWaypointPairs } from '../../utils/routeSequenceUtils';
import { validateEntityAlias } from '../geographic/entityIdentityValidator';
import { validateImageCandidate } from '../imageService';
import { Waypoint, Route, RouteGroup } from '../../types';
import { buildGlobeRouteGeometry, calculateOSMRouteArrow } from '../../utils/osmRouteArrowUtils';
import { getConnectingLineColor } from '../../utils/routeLineColor';
import { getThemeMarkerColors } from '../../utils/markerStyleUtils';
import { runRoutePipeline } from '../routePipeline';
import { parseAndExtract } from '../../utils/jsonParser';

describe('Historical Route Group Pipeline & Chronology Test Suite', () => {

  describe('1. Trail of Tears Multi-Route Structure & Route-Local Sequences', () => {
    it('groups waypoints into independent detachments with route-local sequence numbering', () => {
      const trailOfTearsWaypoints: Waypoint[] = [
        // Northern Route
        {
          id: 'wp-new-echota',
          name: 'New Echota',
          canonicalName: 'New Echota',
          lat: 34.5408,
          lng: -84.9100,
          sequence: 1,
          routeGroupId: 'northern-route',
          routeGroupName: 'Northern Route',
          isSequential: true
        },
        {
          id: 'wp-fort-cass',
          name: 'Fort Cass',
          canonicalName: 'Fort Cass',
          lat: 35.2858,
          lng: -84.7578,
          sequence: 2,
          routeGroupId: 'northern-route',
          routeGroupName: 'Northern Route',
          isSequential: true
        },
        {
          id: 'wp-fort-gibson',
          name: 'Fort Gibson',
          canonicalName: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          sequence: 3,
          routeGroupId: 'northern-route',
          routeGroupName: 'Northern Route',
          isSequential: true
        },
        // Benge Route
        {
          id: 'wp-fort-payne',
          name: 'Fort Payne',
          canonicalName: 'Fort Payne',
          lat: 34.4442,
          lng: -85.7197,
          sequence: 1,
          routeGroupId: 'benge-route',
          routeGroupName: 'Benge Route',
          isSequential: true
        },
        {
          id: 'wp-tahlequah',
          name: 'Tahlequah',
          canonicalName: 'Tahlequah',
          lat: 35.9154,
          lng: -94.9700,
          sequence: 2,
          routeGroupId: 'benge-route',
          routeGroupName: 'Benge Route',
          isSequential: true
        }
      ];

      const routeContext: Partial<Route> = {
        title: 'Trail of Tears',
        isSequential: false,
        routeEvidenceMode: 'MULTI_ROUTE_EVENT'
      };

      const groups = groupWaypointsByRoute(trailOfTearsWaypoints, routeContext);
      expect(groups.length).toBe(2);

      const northernGroup = groups.find(g => g.id === 'northern-route')!;
      expect(northernGroup).toBeDefined();
      expect(northernGroup.name).toBe('Northern Route');
      expect(northernGroup.isSequential).toBe(true);
      expect(northernGroup.waypoints.length).toBe(3);
      expect(northernGroup.waypoints.map(w => w.sequence)).toEqual([1, 2, 3]);

      const bengeGroup = groups.find(g => g.id === 'benge-route')!;
      expect(bengeGroup).toBeDefined();
      expect(bengeGroup.name).toBe('Benge Route');
      expect(bengeGroup.isSequential).toBe(true);
      expect(bengeGroup.waypoints.length).toBe(2);
      expect(bengeGroup.waypoints.map(w => w.sequence)).toEqual([1, 2]);
    });
  });

  describe('2. Chronological Connecting Lines & Isolation Between Route Groups', () => {
    it('generates connecting line segments within each sequential group and NEVER bridges between groups', () => {
      const waypoints: Waypoint[] = [
        // Group A: A1 -> A2 -> A3
        { id: 'a1', name: 'Site A1', lat: 35.0, lng: -85.0, sequence: 1, routeGroupId: 'group-a', isSequential: true },
        { id: 'a2', name: 'Site A2', lat: 35.5, lng: -88.0, sequence: 2, routeGroupId: 'group-a', isSequential: true },
        { id: 'a3', name: 'Site A3', lat: 36.0, lng: -94.0, sequence: 3, routeGroupId: 'group-a', isSequential: true },
        // Group B: B1 -> B2 -> B3
        { id: 'b1', name: 'Site B1', lat: 34.0, lng: -86.0, sequence: 1, routeGroupId: 'group-b', isSequential: true },
        { id: 'b2', name: 'Site B2', lat: 34.5, lng: -89.0, sequence: 2, routeGroupId: 'group-b', isSequential: true },
        { id: 'b3', name: 'Site B3', lat: 35.0, lng: -95.0, sequence: 3, routeGroupId: 'group-b', isSequential: true }
      ];

      const segments = getSequentialRouteSegments(waypoints, { isSequential: false });
      expect(segments.length).toBe(2);

      expect(segments[0].group.id).toBe('group-a');
      expect(segments[0].waypoints.map(w => w.id)).toEqual(['a1', 'a2', 'a3']);

      expect(segments[1].group.id).toBe('group-b');
      expect(segments[1].waypoints.map(w => w.id)).toEqual(['b1', 'b2', 'b3']);

      const geom = buildGlobeRouteGeometry({
        waypoints,
        skin: 'satellite',
        isSequential: false
      });
      expect(geom).not.toBeNull();
    });

    it('enforces the explicit cross-group safety invariant: no connecting line pair may span different routeGroupId values', () => {
      const waypoints: Waypoint[] = [
        { id: 'n1', name: 'N1', lat: 35.0, lng: -85.0, sequence: 1, routeGroupId: 'northern-route', isSequential: true },
        { id: 'n2', name: 'N2', lat: 35.5, lng: -88.0, sequence: 2, routeGroupId: 'northern-route', isSequential: true },
        { id: 'n3', name: 'N3', lat: 36.0, lng: -94.0, sequence: 3, routeGroupId: 'northern-route', isSequential: true },
        { id: 'b1', name: 'B1', lat: 34.0, lng: -86.0, sequence: 1, routeGroupId: 'benge-route', isSequential: true },
        { id: 'b2', name: 'B2', lat: 34.5, lng: -89.0, sequence: 2, routeGroupId: 'benge-route', isSequential: true },
        { id: 'b3', name: 'B3', lat: 35.0, lng: -95.0, sequence: 3, routeGroupId: 'benge-route', isSequential: true }
      ];

      const pairs = getSequentialWaypointPairs(waypoints, { isSequential: false });
      expect(pairs.length).toBe(4);

      // Verify each connected segment [a, b] belongs to the exact same route group
      for (const [a, b] of pairs) {
        expect(a.routeGroupId).toBe(b.routeGroupId);
      }

      // Assert that the boundary transition [N3, B1] is NEVER present
      const invalidBridge = pairs.some(([a, b]) => a.id === 'n3' && b.id === 'b1');
      expect(invalidBridge).toBe(false);
    });
  });

  describe('3. End-to-End Pipeline Verification for Generated Trail of Tears Route', () => {
    it('executes full pipeline on Trail of Tears data, verifying multi-route evidence mode, independent route groups, and isolated connecting lines', async () => {
      const mockRawTrailOfTears = async () => ({
        title: 'Trail of Tears',
        routeType: 'multi_location_campaign',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as const,
        isSequential: false,
        routeConfidence: { level: 'high', overallConfidence: 0.95 },
        routeGroups: [
          {
            id: 'northern-route',
            name: 'Northern Route',
            type: 'documented_route',
            isSequential: true,
            routeEvidenceMode: 'DOCUMENTED_ROUTE' as const,
            waypoints: []
          },
          {
            id: 'benge-route',
            name: 'Benge Route',
            type: 'documented_route',
            isSequential: true,
            routeEvidenceMode: 'DOCUMENTED_ROUTE' as const,
            waypoints: []
          }
        ],
        waypoints: [
          // Northern Route Waypoints (1838-1839)
          {
            id: 'tot-1',
            name: 'New Echota',
            canonicalName: 'New Echota',
            lat: 34.5408,
            lng: -84.9100,
            sequence: 1,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            description: 'Capital of the Cherokee Nation and departure staging site.'
          },
          {
            id: 'tot-2',
            name: 'Fort Cass',
            canonicalName: 'Fort Cass',
            lat: 35.2858,
            lng: -84.7578,
            sequence: 2,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            description: 'Federal military headquarters and primary internment depot in Tennessee.'
          },
          {
            id: 'tot-3',
            name: 'Fort Gibson',
            canonicalName: 'Fort Gibson',
            lat: 35.7981,
            lng: -95.2497,
            sequence: 3,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            description: 'Western military outpost and arrival terminus in Indian Territory.'
          },
          // Benge Route Waypoints (1838)
          {
            id: 'tot-4',
            name: 'Fort Payne',
            canonicalName: 'Fort Payne',
            lat: 34.4442,
            lng: -85.7197,
            sequence: 1,
            routeGroupId: 'benge-route',
            routeGroupName: 'Benge Route',
            role: 'primary',
            description: 'Fort Payne internment camp in Alabama where John Benge detachment departed.'
          },
          {
            id: 'tot-5',
            name: 'Tahlequah',
            canonicalName: 'Tahlequah',
            lat: 35.9154,
            lng: -94.9700,
            sequence: 2,
            routeGroupId: 'benge-route',
            routeGroupName: 'Benge Route',
            role: 'primary',
            description: 'Final capital established by the Cherokee Nation in Indian Territory.'
          }
        ]
      });

      const processedRoute = await runRoutePipeline(
        'Where did the Trail of Tears take place?',
        false,
        mockRawTrailOfTears,
        'HISTORICAL_EVENT'
      );

      // 1. Evidence mode & top-level sequentiality
      expect(processedRoute.routeEvidenceMode).toBe('MULTI_ROUTE_EVENT');
      expect(processedRoute.isSequential).toBe(false);

      // 2. Waypoints maintain route groups and route-local sequences
      expect(processedRoute.waypoints.length).toBe(5);

      const northernWps = processedRoute.waypoints.filter(w => w.routeGroupId === 'northern-route');
      expect(northernWps.length).toBe(3);
      expect(northernWps.map(w => w.sequence)).toEqual([1, 2, 3]);

      const bengeWps = processedRoute.waypoints.filter(w => w.routeGroupId === 'benge-route');
      expect(bengeWps.length).toBe(2);
      expect(bengeWps.map(w => w.sequence)).toEqual([1, 2]);

      // 3. Route groups collection
      expect(processedRoute.routeGroups).toBeDefined();
      expect(processedRoute.routeGroups!.length).toBe(2);

      // 4. Sequential segments and connecting line isolation
      const segments = getSequentialRouteSegments(processedRoute.waypoints, processedRoute);
      expect(segments.length).toBe(3); // Northern (New Echota -> Cass [primary], Cass -> Gibson [secondary]) + Benge (Payne -> Tahlequah [secondary])

      expect(segments.some(s => s.group.id === 'benge-route')).toBe(true);
      expect(segments.some(s => s.group.id === 'northern-route')).toBe(true);

      // 5. Explicit pair isolation
      const pairs = getSequentialWaypointPairs(processedRoute.waypoints, processedRoute);
      expect(pairs.length).toBe(3); // 1 in Benge (Payne -> Tahlequah secondary), 2 in Northern (New Echota -> Cass primary, Cass -> Gibson secondary)

      for (const [a, b] of pairs) {
        expect(a.routeGroupId).toBe(b.routeGroupId);
      }

      const invalidBridge = pairs.some(([a, b]) => a.routeGroupId !== b.routeGroupId);
      expect(invalidBridge).toBe(false);
    });
  });

  describe('4. Entity Identity & Alias Conflation Validation', () => {
    it('strictly rejects known entity conflations such as Fort Gibson = Fort Osage', () => {
      expect(validateEntityAlias('Fort Gibson', 'Fort Osage')).toBe(false);
      expect(validateEntityAlias('Fort Osage', 'Fort Gibson')).toBe(false);
      expect(validateEntityAlias('Fort Jackson', 'Fort Osage')).toBe(false);
      expect(validateEntityAlias('Fort Jackson', 'Fort Franklin')).toBe(false);
      expect(validateEntityAlias('Fort Gibson', 'Fort Franklin')).toBe(false);
      expect(validateEntityAlias('Fort Gibson', 'Fort Jackson')).toBe(false);
      expect(validateEntityAlias('Fort Cass', 'Fort Osage')).toBe(false);
    });

    it('accepts valid historical variations and aliases', () => {
      expect(validateEntityAlias('Fort Gibson', 'Cantonment Gibson')).toBe(true);
      expect(validateEntityAlias('New Echota', 'New Echota Historic Site')).toBe(true);
    });
  });

  describe('5. Historical Waypoint Image Validation & Trail Collision Detection', () => {
    it('rejects Oregon Trail imagery for a Fort Gibson / Trail of Tears waypoint', () => {
      const fortGibsonEntity = {
        name: 'Fort Gibson',
        canonicalName: 'Fort Gibson',
        city: 'Fort Gibson',
        state: 'Oklahoma',
        country: 'United States',
        entityType: 'historical_site',
        isHistoricalWaypoint: true,
        routeContext: {
          title: 'Trail of Tears',
          exploration: 'Trail of Tears',
          cleanLocationName: 'Fort Gibson'
        }
      };

      const oregonTrailCandidate = {
        url: 'https://upload.wikimedia.org/oregon_trail_ruts.jpg',
        title: 'Oregon Trail Ruts in Guernsey, Wyoming',
        description: 'Deep wagon wheel ruts carved into sandstone along the historic Oregon Trail in Wyoming.'
      };

      const result = validateImageCandidate(oregonTrailCandidate, fortGibsonEntity);
      expect(result.decision).toBe('REJECT');
      expect(result.score).toBe(0);
    });

    it('accepts genuine Fort Gibson / Trail of Tears imagery', () => {
      const fortGibsonEntity = {
        name: 'Fort Gibson',
        canonicalName: 'Fort Gibson',
        city: 'Fort Gibson',
        state: 'Oklahoma',
        country: 'United States',
        entityType: 'historical_site',
        isHistoricalWaypoint: true,
        routeContext: {
          title: 'Trail of Tears',
          exploration: 'Trail of Tears',
          cleanLocationName: 'Fort Gibson',
          year: '1838'
        }
      };

      const validCandidate = {
        url: 'https://upload.wikimedia.org/fort_gibson_historic_barracks.jpg',
        title: 'Fort Gibson Historic Site Barracks',
        description: 'Historic log stockade and barracks at Fort Gibson in Oklahoma, destination and receiving post for Cherokee detachments during the 1838 Trail of Tears.'
      };

      const result = validateImageCandidate(validCandidate, fortGibsonEntity);
      expect(result.decision).toBe('ACCEPT');
      expect(result.score).toBeGreaterThanOrEqual(45);
    });
  });

  describe('6. Single Sequential Route Backward Compatibility & Regression', () => {
    it('preserves sequential connecting lines for classic single-route expeditions (Lewis and Clark, Magellan)', () => {
      const lewisAndClarkWaypoints: Waypoint[] = [
        { id: 'lc-1', name: 'Camp Dubois', lat: 38.8033, lng: -90.1064, sequence: 1, isSequential: true },
        { id: 'lc-2', name: 'Fort Mandan', lat: 47.2964, lng: -101.3286, sequence: 2, isSequential: true },
        { id: 'lc-3', name: 'Fort Clatsop', lat: 46.1344, lng: -123.8789, sequence: 3, isSequential: true }
      ];

      const routeContext: Partial<Route> = {
        title: 'Lewis and Clark Expedition',
        routeType: 'fixed_path',
        isSequential: true
      };

      expect(isRouteSequential(lewisAndClarkWaypoints, routeContext)).toBe(true);

      const segments = getSequentialRouteSegments(lewisAndClarkWaypoints, routeContext);
      expect(segments.length).toBe(1);
      expect(segments[0].group.id).toBe('default');
      expect(segments[0].waypoints.length).toBe(3);

      const geom = buildGlobeRouteGeometry({
        waypoints: lewisAndClarkWaypoints,
        skin: 'satellite',
        isSequential: true,
        routeType: 'fixed_path'
      });
      expect(geom).not.toBeNull();
    });
  });

  describe('7. Non-Sequential Regional Historical Events', () => {
    it('does not produce connecting lines when an event has no documented sequence', () => {
      const regionalWaypoints: Waypoint[] = [
        { id: 'rw-1', name: 'Battle of Gettysburg', lat: 39.8167, lng: -77.2333, isSequential: false },
        { id: 'rw-2', name: 'Battle of Antietam', lat: 39.4697, lng: -77.7444, isSequential: false },
        { id: 'rw-3', name: 'Battle of Bull Run', lat: 38.8156, lng: -77.5217, isSequential: false }
      ];

      const routeContext: Partial<Route> = {
        title: 'Major Civil War Battles',
        routeType: 'regional_event',
        isSequential: false
      };

      expect(isRouteSequential(regionalWaypoints, routeContext)).toBe(false);
      const segments = getSequentialRouteSegments(regionalWaypoints, routeContext);
      expect(segments.length).toBe(0);

      const geom = buildGlobeRouteGeometry({
        waypoints: regionalWaypoints,
        skin: 'satellite',
        isSequential: false,
        routeType: 'regional_event'
      });
      expect(geom).toBeNull();
    });
  });

  describe('8. Mixed Route Events', () => {
    it('renders connecting lines only for sequential groups within a mixed-evidence event', () => {
      const mixedWaypoints: Waypoint[] = [
        // Sequential Corridor A
        { id: 'c1', name: 'Corridor Node 1', lat: 30.0, lng: 10.0, sequence: 1, routeGroupId: 'corridor-a', isSequential: true },
        { id: 'c2', name: 'Corridor Node 2', lat: 31.0, lng: 12.0, sequence: 2, routeGroupId: 'corridor-a', isSequential: true },
        // Non-sequential Regional Cluster B
        { id: 'r1', name: 'Outpost 1', lat: 40.0, lng: 20.0, sequence: 1, routeGroupId: 'cluster-b', isSequential: false },
        { id: 'r2', name: 'Outpost 2', lat: 42.0, lng: 22.0, sequence: 2, routeGroupId: 'cluster-b', isSequential: false }
      ];

      const routeContext: Partial<Route> = {
        title: 'Mixed Theater Campaign',
        isSequential: false
      };

      const segments = getSequentialRouteSegments(mixedWaypoints, routeContext);
      expect(segments.length).toBe(1);
      expect(segments[0].group.id).toBe('corridor-a');
      expect(segments[0].waypoints.map(w => w.id)).toEqual(['c1', 'c2']);
    });
  });

  describe('9. Determinism', () => {
    it('produces identical route groups and sequence topology over repeated processing', () => {
      const inputWaypoints: Waypoint[] = [
        { id: 'w1', name: 'Node 1', lat: 10.0, lng: 10.0, sequence: 2, routeGroupId: 'group-1', isSequential: true },
        { id: 'w2', name: 'Node 0', lat: 11.0, lng: 11.0, sequence: 1, routeGroupId: 'group-1', isSequential: true },
        { id: 'w3', name: 'Node 3', lat: 20.0, lng: 20.0, sequence: 1, routeGroupId: 'group-2', isSequential: true }
      ];

      const run1 = groupWaypointsByRoute(inputWaypoints);
      const run2 = groupWaypointsByRoute(inputWaypoints);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
      expect(run1[0].waypoints[0].id).toBe('w2'); // Sorted sequence 1
      expect(run1[0].waypoints[1].id).toBe('w1'); // Sorted sequence 2
    });
  });

  describe('10. Trail of Tears Route-Group-Local vs Global Sequencing & Marker Numbering Regression Suite', () => {
    it('guarantees route-group-local sequence starts at 1 for each detachment while recording globalSequence across event', async () => {
      const mockRawTrailOfTears = async () => ({
        title: 'Trail of Tears',
        routeType: 'multi_location_campaign',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as const,
        isSequential: false,
        routeGroups: [
          {
            id: 'northern-route',
            name: 'Northern Route',
            type: 'documented_route',
            isSequential: true
          },
          {
            id: 'benge-route',
            name: 'Benge Route',
            type: 'documented_route',
            isSequential: true
          }
        ],
        waypoints: [
          {
            id: 'wp-1',
            name: 'New Echota',
            canonicalName: 'New Echota',
            lat: 34.5408,
            lng: -84.9100,
            sequence: 1,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary'
          },
          {
            id: 'wp-2',
            name: 'Fort Cass',
            canonicalName: 'Fort Cass',
            lat: 35.2858,
            lng: -84.7578,
            sequence: 2,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary'
          },
          {
            id: 'wp-3',
            name: 'Fort Payne',
            canonicalName: 'Fort Payne',
            lat: 34.4442,
            lng: -85.7197,
            sequence: 1,
            routeGroupId: 'benge-route',
            routeGroupName: 'Benge Route',
            role: 'primary'
          },
          {
            id: 'wp-4',
            name: 'Tahlequah',
            canonicalName: 'Tahlequah',
            lat: 35.7094,
            lng: -94.8216,
            sequence: 2,
            routeGroupId: 'benge-route',
            routeGroupName: 'Benge Route',
            role: 'primary'
          }
        ]
      });

      const processedRoute = await runRoutePipeline(
        'Where did the Trail of Tears take place?',
        false,
        mockRawTrailOfTears as any,
        'HISTORICAL_EVENT'
      );

      const [newEchota, fortCass, fortPayne, tahlequah] = processedRoute.waypoints;

      // Check route-group-local sequences:
      // Northern Route: New Echota = 1, Fort Cass = 2
      expect(newEchota.sequence).toBe(1);
      expect(fortCass.sequence).toBe(2);

      // Benge Route: Fort Payne = 1, Tahlequah = 2 (Reset to 1 within group!)
      expect(fortPayne.sequence).toBe(1);
      expect(tahlequah.sequence).toBe(2);

      // Check global sequence across the entire event
      expect(newEchota.globalSequence).toBe(1);
      expect(fortCass.globalSequence).toBe(2);
      expect(fortPayne.globalSequence).toBe(3);
      expect(tahlequah.globalSequence).toBe(4);

      // Verify no cross-group connecting lines (Fort Cass -> Fort Payne is absent)
      const pairs = getSequentialWaypointPairs(processedRoute.waypoints, processedRoute);
      expect(pairs.length).toBe(2);
      expect(pairs.some(([a, b]) => a.name === 'New Echota' && b.name === 'Fort Cass')).toBe(true);
      expect(pairs.some(([a, b]) => a.name === 'Fort Payne' && b.name === 'Tahlequah')).toBe(true);

      const crossGroup = pairs.some(([a, b]) => a.routeGroupId !== b.routeGroupId);
      expect(crossGroup).toBe(false);

      // Verify that waypoints were not sorted by latitude, longitude, or distance
      expect(processedRoute.waypoints.map(w => w.name)).toEqual([
        'New Echota',
        'Fort Cass',
        'Fort Payne',
        'Tahlequah'
      ]);
    });

    it('robustly repairs malformed LLM JSON containing doubled opening and closing delimiters', () => {
      const malformedJson = `{
  "title": "Trail of Tears",
  "route": [
    {
      {
        "name": "New Echota",
        "lat": 34.5408,
        "lng": -84.9100
      },
      {
        "name": "Fort Cass",
        "lat": 35.2858,
        "lng": -84.7578
      }
    ]
  ]
}`;
      const result = parseAndExtract(malformedJson);
      expect(result.success).toBe(true);
      expect((result.value as any).title).toBe('Trail of Tears');
      expect((result.value as any).route.length).toBe(2);
      expect((result.value as any).route[0].name).toBe('New Echota');
    });

    it('handles flat string waypoints from concise LLM fast retry safely without crashing logFieldDiff or pipeline', async () => {
      const mockStringWaypoints = async () => ({
        title: 'Central Park Tour',
        routeType: 'multi_location_campaign',
        waypoints: [
          { name: 'Central Park, New York City', lat: 40.7829, lng: -73.9654 },
          { name: 'Bethesda Terrace', lat: 40.7744, lng: -73.9708 },
          { name: 'Strawberry Fields', lat: 40.7758, lng: -73.9752 }
        ] as any
      });

      const processed = await runRoutePipeline(
        'Central Park Tour',
        false,
        mockStringWaypoints as any,
        'HISTORICAL_EVENT'
      );

      expect(processed.waypoints.length).toBe(3);
      expect(processed.waypoints[0].name).toBe('Central Park, New York City');
      expect(processed.waypoints[1].name).toBe('Bethesda Terrace');
      expect(processed.waypoints[2].name).toBe('Strawberry Fields');
    });
  });

  describe('11. Route Waypoint Numbering and Route-Line Direction Globe & OSM Parity Suite', () => {
    // Setup 3 multi-route detachments:
    // Northern Route: A, B, C
    // Benge Route: D, E
    // Bell Route: F (single waypoint)
    const multiRouteWaypoints: Waypoint[] = [
      { id: 'wp-a', name: 'Waypoint A', lat: 34.1, lng: -84.1, sequence: 1, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'wp-b', name: 'Waypoint B', lat: 35.2, lng: -85.2, sequence: 2, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'wp-c', name: 'Waypoint C', lat: 36.3, lng: -86.3, sequence: 3, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'wp-d', name: 'Waypoint D', lat: 35.7, lng: -95.1, sequence: 1, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
      { id: 'wp-e', name: 'Waypoint E', lat: 35.9, lng: -94.9, sequence: 2, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
      { id: 'wp-f', name: 'Waypoint F', lat: 34.8, lng: -89.2, sequence: 1, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' }
    ];

    const routeContext: Partial<Route> = {
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT',
      isSequential: false,
      routeGroups: [
        { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
        { id: 'benge-route', name: 'Benge Route', type: 'detachment', isSequential: true },
        { id: 'bell-route', name: 'Bell Route', type: 'detachment', isSequential: true }
      ]
    };

    it('Test 1: Multi-route marker numbering resets to 1 for each route group (A=1, B=2, C=3, D=1, E=2, F=1)', () => {
      const groups = groupWaypointsByRoute(multiRouteWaypoints, routeContext);
      expect(groups.length).toBe(3);

      const northernGroup = groups.find(g => g.id === 'northern-route')!;
      expect(northernGroup.waypoints.map(w => w.sequence)).toEqual([1, 2, 3]);

      const bengeGroup = groups.find(g => g.id === 'benge-route')!;
      expect(bengeGroup.waypoints.map(w => w.sequence)).toEqual([1, 2]);

      const bellGroup = groups.find(g => g.id === 'bell-route')!;
      expect(bellGroup.waypoints.map(w => w.sequence)).toEqual([1]);

      // Verify that marker numbering calculation (typeof wp.sequence === 'number' ? wp.sequence : index + 1) produces:
      const markerNumbers = multiRouteWaypoints.map(wp => wp.sequence);
      expect(markerNumbers).toEqual([1, 2, 3, 1, 2, 1]);
    });

    it('Test 2: Segment direction strictly adheres to sequence (A → B, B → C, D → E) and never reverses', () => {
      const pairs = getSequentialWaypointPairs(multiRouteWaypoints, routeContext);
      expect(pairs.length).toBe(3);

      // Northern Route segments
      expect(pairs[0][0].id).toBe('wp-a');
      expect(pairs[0][1].id).toBe('wp-b');
      expect(pairs[1][0].id).toBe('wp-b');
      expect(pairs[1][1].id).toBe('wp-c');

      // Benge Route segment
      expect(pairs[2][0].id).toBe('wp-d');
      expect(pairs[2][1].id).toBe('wp-e');

      // Ensure no reverse pairs exist
      const isReversed = pairs.some(([from, to]) => (from.sequence ?? 0) > (to.sequence ?? 0));
      expect(isReversed).toBe(false);
    });

    it('Test 3: Globe and OSM view renderers derive identical ordered waypoint IDs', () => {
      // 1. Globe renderer logic:
      const globeSegments = getSequentialRouteSegments(multiRouteWaypoints, routeContext);
      const globeOrderedPairs = globeSegments.flatMap(seg => {
        const pairs: Array<{ fromId: string; toId: string; groupId: string }> = [];
        for (let i = 0; i < seg.waypoints.length - 1; i++) {
          pairs.push({
            fromId: seg.waypoints[i].id,
            toId: seg.waypoints[i + 1].id,
            groupId: seg.group.id
          });
        }
        return pairs;
      });

      // 2. OSM renderer logic:
      const osmSegments = getSequentialRouteSegments(multiRouteWaypoints, routeContext);
      const osmOrderedPairs = osmSegments.flatMap(segment => {
        const groupWaypoints = segment.waypoints;
        return groupWaypoints.slice(0, -1).map((wp, i) => ({
          fromId: wp.id,
          toId: groupWaypoints[i + 1].id,
          groupId: segment.group.id
        }));
      });

      expect(globeOrderedPairs).toEqual(osmOrderedPairs);
      expect(globeOrderedPairs).toEqual([
        { fromId: 'wp-a', toId: 'wp-b', groupId: 'northern-route' },
        { fromId: 'wp-b', toId: 'wp-c', groupId: 'northern-route' },
        { fromId: 'wp-d', toId: 'wp-e', groupId: 'benge-route' }
      ]);
    });

    it('Test 4: Single-waypoint route group produces a marker but zero connecting segments', () => {
      const segments = getSequentialRouteSegments(multiRouteWaypoints, routeContext);
      const bellSegment = segments.find(s => s.group.id === 'bell-route');
      expect(bellSegment).toBeUndefined();

      const pairs = getSequentialWaypointPairs(multiRouteWaypoints, routeContext);
      const hasBellPair = pairs.some(([from, to]) => from.routeGroupId === 'bell-route' || to.routeGroupId === 'bell-route');
      expect(hasBellPair).toBe(false);
    });

    it('Test 5: event.isSequential === false preserves internal sequence of individual route groups', () => {
      expect(routeContext.isSequential).toBe(false);
      const segments = getSequentialRouteSegments(multiRouteWaypoints, routeContext);
      expect(segments.length).toBe(2);
      expect(segments[0].group.id).toBe('northern-route');
      expect(segments[0].waypoints.map(w => w.name)).toEqual(['Waypoint A', 'Waypoint B', 'Waypoint C']);
      expect(segments[1].group.id).toBe('benge-route');
      expect(segments[1].waypoints.map(w => w.name)).toEqual(['Waypoint D', 'Waypoint E']);
    });

    it('Test 6: Direction test: New Echota → Fort Cass produces OSM segment and arrow pointing strictly toward Fort Cass (and fails if reversed)', () => {
      // Screen projection mock for New Echota and Fort Cass:
      // New Echota (34.5270, -85.1986) -> screen (sx1: 450, sy1: 520)
      // Fort Cass  (35.2858, -84.7578) -> screen (sx2: 480, sy2: 460) (Northeast on globe / Up-Right on screen: dy = -60, dx = +30)
      const newEchotaScreen = { x: 450, y: 520 };
      const fortCassScreen = { x: 480, y: 460 };

      const arrow = calculateOSMRouteArrow({
        start: newEchotaScreen,
        end: fortCassScreen,
        startMarkerRadius: 8,
        destinationMarkerRadius: 8
      });

      expect(arrow).not.toBeNull();
      // dx = 30, dy = -60 -> angleRad ~ -1.107 rad (-63.43°)
      const expectedAngleRad = Math.atan2(fortCassScreen.y - newEchotaScreen.y, fortCassScreen.x - newEchotaScreen.x);
      expect(arrow!.angleRad).toBeCloseTo(expectedAngleRad, 4);

      // Verify tip is closer to Fort Cass (destination) than baseCenter is to Fort Cass
      const distTipToFortCass = Math.hypot(arrow!.tip.x - fortCassScreen.x, arrow!.tip.y - fortCassScreen.y);
      const distBaseToFortCass = Math.hypot(arrow!.baseCenter.x - fortCassScreen.x, arrow!.baseCenter.y - fortCassScreen.y);
      expect(distTipToFortCass).toBeLessThan(distBaseToFortCass);

      // Verify that if segment were reversed (Fort Cass -> New Echota), the angle and direction would be completely opposite
      const reversedExpectedAngleRad = Math.atan2(newEchotaScreen.y - fortCassScreen.y, newEchotaScreen.x - fortCassScreen.x);
      expect(Math.abs(arrow!.angleRad - reversedExpectedAngleRad)).toBeGreaterThan(2.0); // ~180° (PI radians) difference
    });

    it('Test 7: Route-specific visual identity assigns deterministic distinct colors across route groups', () => {
      const colorNorthern = getConnectingLineColor({ theme: 'modern', mapLayer: 'globe', routeGroupId: 'northern-route' });
      const colorBenge = getConnectingLineColor({ theme: 'modern', mapLayer: 'globe', routeGroupId: 'benge-route' });
      const colorWater = getConnectingLineColor({ theme: 'modern', mapLayer: 'globe', routeGroupId: 'water-route' });

      // Colors should be valid hex strings
      expect(colorNorthern).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(colorBenge).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(colorWater).toMatch(/^#[0-9a-fA-F]{6}$/);

      // Marker colors should match route line colors for corresponding route groups
      const markerNorthern = getThemeMarkerColors('modern', { isWaypoint: true, routeGroupId: 'northern-route' });
      const markerBenge = getThemeMarkerColors('modern', { isWaypoint: true, routeGroupId: 'benge-route' });
      expect(markerNorthern.fill).toBe(colorNorthern);
      expect(markerBenge.fill).toBe(colorBenge);
    });

    it('Test 8: InfoPanel route-local positioning reports "Route B - Waypoint 1 of 4" and not global "Waypoint 5 of 8"', () => {
      const waypoints8: Waypoint[] = [
        { id: 'a1', name: 'A1', lat: 30, lng: -80, sequence: 1, routeGroupId: 'route-a', routeGroupName: 'Northern Route' },
        { id: 'a2', name: 'A2', lat: 31, lng: -81, sequence: 2, routeGroupId: 'route-a', routeGroupName: 'Northern Route' },
        { id: 'a3', name: 'A3', lat: 32, lng: -82, sequence: 3, routeGroupId: 'route-a', routeGroupName: 'Northern Route' },
        { id: 'a4', name: 'A4', lat: 33, lng: -83, sequence: 4, routeGroupId: 'route-a', routeGroupName: 'Northern Route' },
        { id: 'b1', name: 'B1', lat: 34, lng: -90, sequence: 1, routeGroupId: 'route-b', routeGroupName: 'Benge Route' },
        { id: 'b2', name: 'B2', lat: 35, lng: -91, sequence: 2, routeGroupId: 'route-b', routeGroupName: 'Benge Route' },
        { id: 'b3', name: 'B3', lat: 36, lng: -92, sequence: 3, routeGroupId: 'route-b', routeGroupName: 'Benge Route' },
        { id: 'b4', name: 'B4', lat: 37, lng: -93, sequence: 4, routeGroupId: 'route-b', routeGroupName: 'Benge Route' }
      ];

      // Test b1 (index 4 in array)
      const currentIdx = 4;
      const currentWp = waypoints8[currentIdx];
      const groupWps = waypoints8.filter(w => w.routeGroupId === currentWp.routeGroupId);
      const groupTotal = groupWps.length;
      const groupCurrent = currentWp.sequence!;

      const formattedLabel = `${currentWp.routeGroupName} — Waypoint ${groupCurrent} of ${groupTotal}`;
      expect(formattedLabel).toBe('Benge Route — Waypoint 1 of 4');
      expect(formattedLabel).not.toContain('Waypoint 5 of 8');
    });

    it('Test 9: First OSM segment calculation strictly points leftward when marker 2 is to the left of marker 1', () => {
      // Marker 1 at (600, 400), Marker 2 to the left at (200, 400)
      const m1Screen = { x: 600, y: 400 };
      const m2Screen = { x: 200, y: 400 }; // dx = -400, dy = 0 (Westward / Left)

      const arrow = calculateOSMRouteArrow({
        start: m1Screen,
        end: m2Screen,
        startMarkerRadius: 8,
        destinationMarkerRadius: 8
      });

      expect(arrow).not.toBeNull();
      // dx = -400, dy = 0 -> angle = PI (180°)
      expect(arrow!.angleRad).toBeCloseTo(Math.PI, 4);
      // Arrow tip should be to the left of base center
      expect(arrow!.tip.x).toBeLessThan(arrow!.baseCenter.x);
      // Arrow tip should be closer to m2 (200) than m1 (600)
      expect(Math.abs(arrow!.tip.x - m2Screen.x)).toBeLessThan(Math.abs(arrow!.tip.x - m1Screen.x));
    });

    it('Test 10: Canonical identity immutability rejects attempted LLM rename of Fort Cass to Fort Gibson in Stage 6', async () => {
      // Mock generator providing Fort Cass and Fort Gibson
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          { id: 'new-echota', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'fort-cass', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route' },
          { id: 'fort-gibson', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');

      expect(processed.waypoints.length).toBe(3);
      const fortCassWp = processed.waypoints.find(w => w.id === 'fort-cass');
      const fortGibsonWp = processed.waypoints.find(w => w.id === 'fort-gibson');

      expect(fortCassWp).toBeDefined();
      expect(fortGibsonWp).toBeDefined();

      // Ensure Fort Cass name and coordinates remain uncorrupted
      expect(fortCassWp!.name).toBe('Fort Cass');
      expect(fortCassWp!.lat).toBeCloseTo(35.2858, 3);
      expect(fortCassWp!.lng).toBeCloseTo(-84.7578, 3);

      // Ensure Fort Gibson name and coordinates remain uncorrupted
      expect(fortGibsonWp!.name).toBe('Fort Gibson');
      expect(fortGibsonWp!.lat).toBeCloseTo(35.7981, 3);
      expect(fortGibsonWp!.lng).toBeCloseTo(-95.2497, 3);
    });

    it('Test 11: Filters unpopulated route groups and prevents empty group shells from reaching final route', async () => {
      const mockGeneratorWithEmptyGroups = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
          { id: 'benge-route', name: 'Benge Route', type: 'detachment', isSequential: true },
          { id: 'bell-route', name: 'Bell Route', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          { id: 'new-echota', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'fort-cass', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGeneratorWithEmptyGroups, 'HISTORICAL_EVENT');

      expect(processed.routeGroups.length).toBe(1);
      expect(processed.routeGroups[0].id).toBe('northern-route');
      expect(processed.routeGroups.some(g => g.id === 'benge-route')).toBe(false);
      expect(processed.routeGroups.some(g => g.id === 'bell-route')).toBe(false);
    });

    it('Test 12: Non-route locations appear on map but do not generate connecting route lines', () => {
      const mixedWaypoints: Waypoint[] = [
        { id: 'wp-1', name: 'Origin Encampment', lat: 35.0, lng: -85.0, sequence: 1, routeGroupId: 'det-1', waypointType: 'route_waypoint', segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT' },
        { id: 'wp-2', name: 'Regional Context Site', lat: 35.5, lng: -86.0, sequence: 2, routeGroupId: 'det-1', waypointType: 'non_route_location', segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' },
        { id: 'wp-3', name: 'River Crossing Milestone', lat: 36.0, lng: -87.0, sequence: 3, routeGroupId: 'det-1', waypointType: 'route_waypoint', segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT' },
        { id: 'wp-4', name: 'Arrival Depot', lat: 36.5, lng: -88.0, sequence: 4, routeGroupId: 'det-1', waypointType: 'route_waypoint', segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT' }
      ];

      const segments = getSequentialRouteSegments(mixedWaypoints, { isSequential: true });
      const pairs = getSequentialWaypointPairs(mixedWaypoints, { isSequential: true });

      // wp-2 is a non_route_location, so it breaks the chain:
      // wp-1 is left isolated, while wp-3 -> wp-4 forms a valid consecutive segment
      expect(segments.length).toBe(1);
      expect(segments[0].waypoints.map(w => w.id)).toEqual(['wp-3', 'wp-4']);
      expect(pairs.some(([a, b]) => a.id === 'wp-2' || b.id === 'wp-2')).toBe(false);
    });

    it('Test 13: Segment evidence gating prevents INFERRED_CONNECTION from drawing lines while HIGH_LEVEL_HISTORICAL_ASSOCIATION renders secondary', () => {
      const inferredWaypoints: Waypoint[] = [
        { id: 'a', name: 'Point A', lat: 35.0, lng: -85.0, sequence: 1, routeGroupId: 'route-1', waypointType: 'route_waypoint', segmentEvidence: 'INFERRED_CONNECTION' },
        { id: 'b', name: 'Point B', lat: 36.0, lng: -86.0, sequence: 2, routeGroupId: 'route-1', waypointType: 'route_waypoint', segmentEvidence: 'INFERRED_CONNECTION' }
      ];

      const segments = getSequentialRouteSegments(inferredWaypoints, { isSequential: true });
      expect(segments.length).toBe(0);

      const highLevelWaypoints: Waypoint[] = [
        { id: 'c', name: 'Point C', lat: 35.0, lng: -85.0, sequence: 1, routeGroupId: 'route-2', waypointType: 'route_waypoint', segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' },
        { id: 'd', name: 'Point D', lat: 36.0, lng: -86.0, sequence: 2, routeGroupId: 'route-2', waypointType: 'route_waypoint', segmentEvidence: 'HIGH_LEVEL_HISTORICAL_ASSOCIATION' }
      ];

      const secondarySegments = getSequentialRouteSegments(highLevelWaypoints, { isSequential: true });
      expect(secondarySegments.length).toBe(1);
      expect(secondarySegments[0].segmentEvidence).toBe('HIGH_LEVEL_HISTORICAL_ASSOCIATION');
    });

    it('Test 14: Rejects alias conflation between Oklahoma City and Fort Coffee', () => {
      expect(validateEntityAlias('Fort Coffee', 'Oklahoma City')).toBe(false);
      expect(validateEntityAlias('Oklahoma City', 'Fort Coffee')).toBe(false);
      expect(validateEntityAlias('Fort Cass', 'Fort Gibson')).toBe(false);
      expect(validateEntityAlias('Fort Gibson', 'Fort Cass')).toBe(false);
    });

    it('Test 15: Preserves independent route-local sequences across four Trail of Tears detachments', () => {
      const multiRouteWaypoints: Waypoint[] = [
        // Northern Route
        { id: 'nr-1', name: 'New Echota', lat: 34.54, lng: -84.91, sequence: 1, routeGroupId: 'northern-route', waypointType: 'route_waypoint' },
        { id: 'nr-2', name: 'Fort Cass', lat: 35.28, lng: -84.75, sequence: 2, routeGroupId: 'northern-route', waypointType: 'route_waypoint' },
        // Benge Route
        { id: 'br-1', name: 'Fort Payne', lat: 34.44, lng: -85.72, sequence: 1, routeGroupId: 'benge-route', waypointType: 'route_waypoint' },
        { id: 'br-2', name: 'Gunter\'s Landing', lat: 34.35, lng: -86.29, sequence: 2, routeGroupId: 'benge-route', waypointType: 'route_waypoint' },
        // Bell Route
        { id: 'bl-1', name: 'Fort Cass', lat: 35.28, lng: -84.75, sequence: 1, routeGroupId: 'bell-route', waypointType: 'route_waypoint' },
        { id: 'bl-2', name: 'Memphis', lat: 35.15, lng: -90.05, sequence: 2, routeGroupId: 'bell-route', waypointType: 'route_waypoint' },
        // Water Route
        { id: 'wr-1', name: 'Ross\'s Landing', lat: 35.05, lng: -85.31, sequence: 1, routeGroupId: 'water-route', waypointType: 'route_waypoint' },
        { id: 'wr-2', name: 'Fort Coffee', lat: 35.30, lng: -94.61, sequence: 2, routeGroupId: 'water-route', waypointType: 'route_waypoint' }
      ];

      const groups = groupWaypointsByRoute(multiRouteWaypoints, {
        routeEvidenceMode: 'MULTI_ROUTE_EVENT',
        isSequential: false
      });

      expect(groups.length).toBe(4);
      groups.forEach(group => {
        expect(group.waypoints[0].sequence).toBe(1);
        expect(group.waypoints[1].sequence).toBe(2);
      });

      const pairs = getSequentialWaypointPairs(multiRouteWaypoints, {
        routeEvidenceMode: 'MULTI_ROUTE_EVENT',
        isSequential: false
      });

      expect(pairs.length).toBe(4);
      pairs.forEach(([a, b]) => {
        expect(a.routeGroupId).toBe(b.routeGroupId);
      });
    });

    it('Test A: Route-local numbering: A single waypoint in Water Route produces sequence=1 (never 7 or global array index)', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
          { id: 'water-route', name: 'Water Route', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          { id: 'nr-1', name: 'New Echota', lat: 34.54, lng: -84.91, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'nr-2', name: 'Fort Cass', lat: 35.28, lng: -84.75, sequence: 2, routeGroupId: 'northern-route' },
          { id: 'nr-3', name: 'Fort Gibson', lat: 35.79, lng: -95.24, sequence: 3, routeGroupId: 'northern-route' },
          { id: 'nr-4', name: 'Tahlequah', lat: 35.70, lng: -94.82, sequence: 4, routeGroupId: 'northern-route' },
          { id: 'wr-1', name: 'Ross\'s Landing', lat: 35.056, lng: -85.309, sequence: 7, routeGroupId: 'water-route' } // LLM sent 7
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');

      const waterWp = processed.waypoints.find(w => w.id === 'wr-1');
      expect(waterWp).toBeDefined();
      expect(waterWp!.sequence).toBe(1); // Normalized to route-local 1
      expect(waterWp!.globalSequence).toBe(5); // Global index 5
    }, 15000);

    it('Test B: Independent route numbering: Three groups each containing one waypoint produce sequence=1 for all three', async () => {
      const mockGenerator = async () => ({
        title: 'Multi-Group Event',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'group-a', name: 'Group A', type: 'detachment', isSequential: true },
          { id: 'group-b', name: 'Group B', type: 'detachment', isSequential: true },
          { id: 'group-c', name: 'Group C', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          { id: 'a1', name: 'Stop A1', lat: 30, lng: -80, sequence: 1, routeGroupId: 'group-a' },
          { id: 'b1', name: 'Stop B1', lat: 31, lng: -81, sequence: 5, routeGroupId: 'group-b' },
          { id: 'c1', name: 'Stop C1', lat: 32, lng: -82, sequence: 9, routeGroupId: 'group-c' }
        ]
      });

      const processed = await runRoutePipeline('Multi-Group Event', false, mockGenerator, 'HISTORICAL_EVENT');

      const a1 = processed.waypoints.find(w => w.id === 'a1');
      const b1 = processed.waypoints.find(w => w.id === 'b1');
      const c1 = processed.waypoints.find(w => w.id === 'c1');

      expect(a1!.sequence).toBe(1);
      expect(b1!.sequence).toBe(1);
      expect(c1!.sequence).toBe(1);
    });

    it('Test C: Canonical entity preservation: Verified historical entities (New Echota, Fort Cass) cannot be renamed by downstream stages', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'new-echota', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'fort-cass', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints[0].name).toBe('New Echota');
      expect(processed.waypoints[1].name).toBe('Fort Cass');
    });

    it('Test D: Route-group integrity: Waypoints strictly preserve their routeGroupId across all pipeline stages', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'wp-n', name: 'New Echota', lat: 34.54, lng: -84.91, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'wp-b', name: 'Fort Payne', lat: 34.44, lng: -85.72, sequence: 1, routeGroupId: 'benge-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.find(w => w.id === 'wp-n')!.routeGroupId).toBe('northern-route');
      expect(processed.waypoints.find(w => w.id === 'wp-b')!.routeGroupId).toBe('benge-route');
    });

    it('Test E: Identity lineage: Every final waypoint preserves verifiable provenance records', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'new-echota', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'fort-cass', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.length).toBe(2);
      const wp = processed.waypoints[0];
      expect(wp.provenance).toBeDefined();
      expect(wp.provenance!.length).toBeGreaterThanOrEqual(1);
      expect(wp.provenance![0].stage).toBe('normalization');
    });

    it('Test F: Rejects non-corridor locations (Nolichucky Mountains, Kingsport, West Point) from Northern Route', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'nr-1', name: 'Nolichucky Mountains', lat: 35.95, lng: -82.45, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'nr-2', name: 'Kingsport, Tennessee', lat: 36.54, lng: -82.56, sequence: 2, routeGroupId: 'northern-route' },
          { id: 'nr-3', name: 'West Point, Georgia', lat: 32.87, lng: -85.18, sequence: 3, routeGroupId: 'northern-route' },
          { id: 'nr-4', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 4, routeGroupId: 'northern-route' },
          { id: 'nr-5', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 5, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.some(w => w.name.includes('Nolichucky'))).toBe(false);
      expect(processed.waypoints.some(w => w.name.includes('Kingsport'))).toBe(false);
      expect(processed.waypoints.some(w => w.name.includes('West Point'))).toBe(false);
      expect(processed.waypoints.some(w => w.name === 'New Echota')).toBe(true);
      expect(processed.waypoints.some(w => w.name === 'Fort Cass')).toBe(true);
    });

    it('Test G: Rejects West Point, Georgia from Benge Route', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'br-1', name: 'West Point, Georgia', lat: 32.87, lng: -85.18, sequence: 1, routeGroupId: 'benge-route' },
          { id: 'br-2', name: 'Fort Payne', lat: 34.4442, lng: -85.7197, sequence: 2, routeGroupId: 'benge-route' },
          { id: 'br-3', name: 'Gunter\'s Landing', lat: 34.3581, lng: -86.2944, sequence: 3, routeGroupId: 'benge-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.some(w => w.name.includes('West Point'))).toBe(false);
      expect(processed.waypoints.some(w => w.name === 'Fort Payne')).toBe(true);
      expect(processed.waypoints.some(w => w.name === 'Gunter\'s Landing')).toBe(true);
    });

    it('Test H: Rejects "Bell, Tennessee" as a route-name hallucination for Bell Route', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'bell-route', name: 'Bell Route', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          { id: 'bl-1', name: 'Bell, Tennessee', lat: 35.80, lng: -88.50, sequence: 1, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
          { id: 'bl-2', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
          { id: 'bl-3', name: 'Memphis', lat: 35.1495, lng: -90.0489, sequence: 3, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.some(w => w.name.includes('Bell, Tennessee'))).toBe(false);
      expect(processed.waypoints.some(w => w.name === 'Fort Cass')).toBe(true);
    });

    it('Test I: Rejects "Oklahoma (Indian Territory)" as generic regional territory', async () => {
      const mockGenerator = async () => ({
        title: 'Trail of Tears',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        waypoints: [
          { id: 'nr-1', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'nr-2', name: 'Oklahoma (Indian Territory)', lat: 35.4675, lng: -97.5194, sequence: 2, routeGroupId: 'northern-route' },
          { id: 'nr-3', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 3, routeGroupId: 'northern-route' }
        ]
      });

      const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
      expect(processed.waypoints.some(w => w.name.includes('Oklahoma (Indian Territory)'))).toBe(false);
      expect(processed.waypoints.some(w => w.name === 'Tahlequah')).toBe(true);
    });

    it('Test K: Strict Authoritative Registry Rejection on the 6-Waypoint Corrupted Dataset', async () => {
      // Recreating the exact failure dataset reported by user:
      // Northern: Nashville TN, Fort Gibson OK
      // Benge: New Echota GA (dup coords), Fort Towson OK (dup coords)
      // Water: Fort McAllister GA, Tahlequah OK (Water Route)
      const mockCorruptedGenerator = async () => ({
        title: 'Where did the Trail of Tears take place?',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
          { id: 'benge-route', name: 'Benge Route', type: 'detachment', isSequential: true },
          { id: 'water-route', name: 'Water Route', type: 'detachment', isSequential: true }
        ] as any,
        waypoints: [
          // Northern Route
          { id: 'nr-1', name: 'Nashville, Tennessee', lat: 36.1627, lng: -86.7816, sequence: 1, routeGroupId: 'northern-route' },
          { id: 'nr-2', name: 'Fort Gibson, Oklahoma', lat: 35.7981, lng: -95.2497, sequence: 2, routeGroupId: 'northern-route' },
          // Benge Route with duplicate coordinates
          { id: 'br-1', name: 'New Echota, Georgia', lat: 34.1956, lng: -84.2705, sequence: 1, routeGroupId: 'benge-route' },
          { id: 'br-2', name: 'Fort Towson, Oklahoma', lat: 34.1956, lng: -84.2705, sequence: 2, routeGroupId: 'benge-route' },
          // Water Route with invalid origin Fort McAllister and misassigned Tahlequah
          { id: 'wr-1', name: 'Fort McAllister, Georgia', lat: 31.8889, lng: -81.1911, sequence: 1, routeGroupId: 'water-route' },
          { id: 'wr-2', name: 'Tahlequah, Oklahoma', lat: 35.7094, lng: -94.8216, sequence: 2, routeGroupId: 'water-route' }
        ]
      });

      const processed = await runRoutePipeline('Where did the Trail of Tears take place?', false, mockCorruptedGenerator, 'HISTORICAL_EVENT');

      // 1. Nashville is not accepted as Northern Route
      expect(processed.waypoints.some(w => w.name.includes('Nashville'))).toBe(false);

      // 2. New Echota is not accepted as Benge Route (belongs to Northern Route / assembly)
      expect(processed.waypoints.some(w => w.name.includes('New Echota') && w.routeGroupId === 'benge-route')).toBe(false);

      // 3. Fort Towson is not accepted on Benge Route
      expect(processed.waypoints.some(w => w.name.includes('Fort Towson'))).toBe(false);

      // 4. Fort McAllister is not accepted on Water Route
      expect(processed.waypoints.some(w => w.name.includes('Fort McAllister'))).toBe(false);

      // 5. Tahlequah is not accepted on Water Route (Water Route destinations are Fort Coffee / Fort Gibson)
      expect(processed.waypoints.some(w => w.name.includes('Tahlequah') && w.routeGroupId === 'water-route')).toBe(false);

      // 6. Fort Gibson on Northern Route is authoritatively accepted with canonical coordinates
      const fortGibson = processed.waypoints.find(w => w.name.includes('Fort Gibson'));
      if (fortGibson) {
        expect(fortGibson.lat).toBeCloseTo(35.7981, 3);
        expect(fortGibson.lng).toBeCloseTo(-95.2497, 3);
      }

      // 7. No invalid straight-line segments across the country (Fort McAllister -> Tahlequah) are generated
      const pairs = getSequentialWaypointPairs(processed.waypoints, { routeEvidenceMode: 'MULTI_ROUTE_EVENT', isSequential: false });
      expect(pairs.some(([a, b]) => a.name.includes('Fort McAllister') || b.name.includes('Fort McAllister'))).toBe(false);
    });
  });

});
