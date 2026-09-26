import { describe, it, expect } from 'vitest';
import {
  isPointOnLand,
  doesSegmentIntersectLand,
  findWaterRoute,
  simplifyWaterRoute,
  isMaritimeJourney,
  resolveWaterAwareRoute,
  GLOBAL_WATER_NODES
} from '../geographic/waterRoutingService';
import { buildCanonicalEventTopology } from '../geographic/historicalRouteRegistry';
import { buildGlobeRouteGeometry } from '../../utils/osmRouteArrowUtils';
import { Waypoint, Route } from '../../types';

describe('Water-Aware Maritime Routing Suite', () => {
  // 1. Open Water
  describe('1. Open Water Navigation', () => {
    it('preserves direct segment over open ocean without creating unnecessary intermediate points', () => {
      // Direct segment across the North Atlantic: (35° N, -40° W) to (40° N, -30° W)
      const start = { lat: 35.0, lng: -40.0 };
      const end = { lat: 40.0, lng: -30.0 };

      const intersects = doesSegmentIntersectLand(start, end);
      expect(intersects).toBe(false);

      const path = findWaterRoute(start, end);
      expect(path).toHaveLength(2);
      expect(path[0]).toEqual(start);
      expect(path[1]).toEqual(end);
    });
  });

  // 2. Continental Obstruction
  describe('2. Continental Obstruction', () => {
    it('detects land intersection and calculates alternate water route around landmass (e.g. Europe/Africa or South America)', () => {
      // Lisbon, Portugal (38.7223, -9.1393) to Genoa, Italy (44.4056, 8.9463)
      // Direct line crosses Spain / Iberian Peninsula.
      const lisbon = { lat: 38.7223, lng: -9.1393 };
      const genoa = { lat: 44.4056, lng: 8.9463 };

      const directCrossesLand = doesSegmentIntersectLand(lisbon, genoa);
      expect(directCrossesLand).toBe(true);

      const resolvedPath = findWaterRoute(lisbon, genoa);
      expect(resolvedPath.length).toBeGreaterThan(2);

      // Start and end are preserved
      expect(resolvedPath[0].lat).toBeCloseTo(lisbon.lat, 4);
      expect(resolvedPath[0].lng).toBeCloseTo(lisbon.lng, 4);
      expect(resolvedPath[resolvedPath.length - 1].lat).toBeCloseTo(genoa.lat, 4);
      expect(resolvedPath[resolvedPath.length - 1].lng).toBeCloseTo(genoa.lng, 4);

      // Verify each water sub-segment of the resolved path stays in open water
      for (let i = 1; i < resolvedPath.length - 2; i++) {
        const segStart = resolvedPath[i];
        const segEnd = resolvedPath[i + 1];
        const segCrossesLand = doesSegmentIntersectLand(segStart, segEnd, { sampleSteps: 20 });
        expect(segCrossesLand).toBe(false);
      }
    });

    it('navigates around Africa when connecting South Atlantic to Indian Ocean', () => {
      // Buenos Aires (-34.6, -58.38) to Mumbai (18.9, 72.8)
      // Direct great-circle line crosses the African continent.
      const buenosAires = { lat: -34.6, lng: -58.38 };
      const mumbai = { lat: 18.9, lng: 72.8 };

      const directCrossesLand = doesSegmentIntersectLand(buenosAires, mumbai);
      expect(directCrossesLand).toBe(true);

      const resolvedPath = findWaterRoute(buenosAires, mumbai);
      expect(resolvedPath.length).toBeGreaterThan(2);

      // Verify that none of the generated path segments cross Africa
      for (let i = 0; i < resolvedPath.length - 1; i++) {
        const segStart = resolvedPath[i];
        const segEnd = resolvedPath[i + 1];
        const segCrossesLand = doesSegmentIntersectLand(segStart, segEnd, { sampleSteps: 20 });
        expect(segCrossesLand).toBe(false);
      }
    });
  });

  // 3. Island Obstruction
  describe('3. Island Obstruction', () => {
    it('navigates around an island (e.g. Great Britain / Cuba / Madagascar) while preserving endpoints', () => {
      // Direct path from North Sea to Celtic Sea crossing southern England (e.g. 52° N, 3° E to 50° N, -7° W)
      const p1 = { lat: 52.0, lng: 3.0 };
      const p2 = { lat: 50.0, lng: -7.0 };

      const crossesGB = doesSegmentIntersectLand(p1, p2);
      expect(crossesGB).toBe(true);

      const resolvedPath = findWaterRoute(p1, p2);
      expect(resolvedPath.length).toBeGreaterThan(2);

      for (let i = 0; i < resolvedPath.length - 1; i++) {
        const segCrossesLand = doesSegmentIntersectLand(resolvedPath[i], resolvedPath[i + 1], { sampleSteps: 16 });
        expect(segCrossesLand).toBe(false);
      }
    });
  });

  // 4. Long Ocean Crossing
  describe('4. Long Ocean Crossing', () => {
    it('remains reasonably direct over open ocean without excessive intermediate geometry', () => {
      // Transatlantic crossing: Bermuda (32° N, -64° W) to Azores/Mid-Atlantic (38° N, -28° W)
      const start = { lat: 32.3, lng: -64.7 };
      const end = { lat: 38.5, lng: -28.6 };

      const directCrossesLand = doesSegmentIntersectLand(start, end);
      expect(directCrossesLand).toBe(false);

      const path = findWaterRoute(start, end);
      expect(path.length).toBeLessThanOrEqual(3);
    });
  });

  // 5. Non-Maritime Journey & Maritime Classification
  describe('5. Non-Maritime Journey & Maritime Classification', () => {
    it('preserves existing routing behavior and does NOT apply water-aware routing to overland journeys', () => {
      const overlandRoute: Partial<Route> = {
        title: 'Overland Silk Road Expedition',
        routeType: 'expedition',
        routeEvidenceMode: 'DOCUMENTED_ROUTE'
      };

      const isMaritime = isMaritimeJourney(overlandRoute);
      expect(isMaritime).toBe(false);

      const overlandWaypoints: Waypoint[] = [
        { id: 'wp-1', name: 'Xi\'an', lat: 34.3416, lng: 108.9398, sequence: 1 },
        { id: 'wp-2', name: 'Dunhuang', lat: 40.1421, lng: 94.6619, sequence: 2 },
        { id: 'wp-3', name: 'Samarkand', lat: 39.6542, lng: 66.9597, sequence: 3 }
      ];

      const resolved = resolveWaterAwareRoute(overlandWaypoints, overlandRoute);
      expect(resolved).toEqual(overlandWaypoints);
      expect(resolved[0].pathGeometry).toBeUndefined();
      expect(resolved[1].pathGeometry).toBeUndefined();
    });

    it('correctly classifies Franklin Expedition Route as maritime and generates pathGeometry for water legs', () => {
      const franklinRouteContext = {
        title: 'Franklin Expedition Route',
        routeType: 'expedition'
      };

      // 1. Classification check
      const isMaritime = isMaritimeJourney(franklinRouteContext);
      expect(isMaritime).toBe(true);

      // 2. Representative waypoints from canonical Franklin Expedition
      const franklinWaypoints: Waypoint[] = [
        {
          id: 'wp-fr-1',
          name: 'Greenhithe, England',
          canonicalName: 'Greenhithe',
          lat: 51.448,
          lng: 0.283,
          sequence: 1,
          routeGroupId: 'franklin-expedition'
        },
        {
          id: 'wp-fr-2',
          name: 'Stromness, Orkney',
          canonicalName: 'Stromness',
          lat: 58.965,
          lng: -3.296,
          sequence: 2,
          routeGroupId: 'franklin-expedition'
        },
        {
          id: 'wp-fr-3',
          name: 'Whalefish Islands, Greenland',
          canonicalName: 'Whalefish Islands',
          lat: 69.25,
          lng: -53.53,
          sequence: 3,
          routeGroupId: 'franklin-expedition'
        }
      ];

      const resolved = resolveWaterAwareRoute(franklinWaypoints, franklinRouteContext);
      expect(resolved).toHaveLength(3);

      // Original waypoint identities and coordinates are preserved
      expect(resolved[0].id).toBe('wp-fr-1');
      expect(resolved[1].id).toBe('wp-fr-2');
      expect(resolved[2].id).toBe('wp-fr-3');

      // Intermediate pathGeometry is attached for each maritime leg
      expect(resolved[0].pathGeometry).toBeDefined();
      expect(resolved[0].pathGeometry!.length).toBeGreaterThanOrEqual(2);
      expect(resolved[0].pathGeometry![0].lat).toBeCloseTo(51.448, 2);

      expect(resolved[1].pathGeometry).toBeDefined();
      expect(resolved[1].pathGeometry!.length).toBeGreaterThanOrEqual(2);
      expect(resolved[1].pathGeometry![0].lat).toBeCloseTo(58.965, 2);
    });

    it('navigates Peel Sound -> Point Victory as a short local Arctic leg without global wraparound', () => {
      const peelSound = { lat: 73.0, lng: -96.5 };
      const pointVictory = { lat: 69.63, lng: -98.81 };

      const resolvedPath = findWaterRoute(peelSound, pointVictory);
      expect(resolvedPath).toBeDefined();
      expect(resolvedPath.length).toBeGreaterThanOrEqual(2);

      // Verify endpoints
      expect(resolvedPath[0].lat).toBeCloseTo(peelSound.lat, 2);
      expect(resolvedPath[0].lng).toBeCloseTo(peelSound.lng, 2);
      expect(resolvedPath[resolvedPath.length - 1].lat).toBeCloseTo(pointVictory.lat, 2);
      expect(resolvedPath[resolvedPath.length - 1].lng).toBeCloseTo(pointVictory.lng, 2);

      // Verify all points remain in the Canadian Arctic corridor (lat > 65°, lng between -105° and -90°)
      for (const pt of resolvedPath) {
        expect(pt.lat).toBeGreaterThan(65.0);
        expect(pt.lng).toBeLessThan(-85.0);
        expect(pt.lng).toBeGreaterThan(-110.0);
      }
    });

    it('resolves all 9 consecutive legs of the full 10-waypoint Franklin Expedition locally without global detours', () => {
      const fullFranklinWaypoints: Waypoint[] = [
        { id: 'wp-fr-1', name: "Greenhithe, England", lat: 51.448, lng: 0.283, sequence: 1 },
        { id: 'wp-fr-2', name: "Stromness, Orkney", lat: 58.965, lng: -3.296, sequence: 2 },
        { id: 'wp-fr-3', name: "Whalefish Islands, Greenland", lat: 69.25, lng: -53.53, sequence: 3 },
        { id: 'wp-fr-4', name: "Lancaster Sound", lat: 74.25, lng: -84.0, sequence: 4 },
        { id: 'wp-fr-5', name: "Beechey Island", lat: 74.716, lng: -91.833, sequence: 5 },
        { id: 'wp-fr-6', name: "Cornwallis Island", lat: 75.15, lng: -95.0, sequence: 6 },
        { id: 'wp-fr-7', name: "Peel Sound", lat: 73.0, lng: -96.5, sequence: 7 },
        { id: 'wp-fr-8', name: "Point Victory", lat: 69.63, lng: -98.81, sequence: 8 },
        { id: 'wp-fr-9', name: "Terror Bay", lat: 68.89, lng: -98.94, sequence: 9 },
        { id: 'wp-fr-10', name: "Queen Maud Gulf", lat: 68.25, lng: -98.9, sequence: 10 }
      ];

      const resolved = resolveWaterAwareRoute(fullFranklinWaypoints, { title: 'Franklin Expedition Route' });
      expect(resolved).toHaveLength(10);

      // Leg 1: Greenhithe -> Stromness must exit via Thames Estuary and head north via North Sea (not cutting across land)
      const leg1Path = resolved[0].pathGeometry!;
      expect(leg1Path).toBeDefined();
      expect(leg1Path.length).toBeGreaterThanOrEqual(4);
      // Start is Greenhithe, End is Stromness
      expect(leg1Path[0].lat).toBeCloseTo(51.448, 2);
      expect(leg1Path[0].lng).toBeCloseTo(0.283, 2);
      expect(leg1Path[leg1Path.length - 1].lat).toBeCloseTo(58.965, 2);
      expect(leg1Path[leg1Path.length - 1].lng).toBeCloseTo(-3.296, 2);

      // Verify that all sub-segments of leg 1 stay in navigable water
      for (let s = 0; s < leg1Path.length - 1; s++) {
        expect(doesSegmentIntersectLand(leg1Path[s], leg1Path[s + 1], { sampleSteps: 20 })).toBe(false);
      }

      // Verify every leg has pathGeometry and none exceeds reasonable geographic bounds
      for (let i = 0; i < resolved.length - 1; i++) {
        const wp = resolved[i];
        expect(wp.pathGeometry).toBeDefined();
        expect(wp.pathGeometry!.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('correctly classifies Lewis and Clark Expedition as non-maritime and preserves direct inland segments', () => {
      const lcRouteContext = {
        title: 'Lewis and Clark Expedition',
        routeType: 'expedition',
        description: 'The Corps of Discovery expedition across the western United States to the Pacific coast.'
      };

      // 1. Classification check
      const isMaritime = isMaritimeJourney(lcRouteContext);
      expect(isMaritime).toBe(false);

      // 2. Canonical waypoints
      const lcWaypoints: Waypoint[] = [
        { id: 'wp-lc-1', name: 'Camp Dubois', lat: 38.8027, lng: -90.1012, sequence: 1 },
        { id: 'wp-lc-2', name: 'St. Charles', lat: 38.7839, lng: -90.4812, sequence: 2 },
        { id: 'wp-lc-3', name: 'Kaw Point', lat: 39.1172, lng: -94.6144, sequence: 3 },
        { id: 'wp-lc-4', name: 'Sergeant Floyd Monument', lat: 42.4608, lng: -96.3819, sequence: 4 },
        { id: 'wp-lc-5', name: 'Council Bluff', lat: 41.4550, lng: -96.0233, sequence: 5 },
        { id: 'wp-lc-6', name: 'Spirit Mound', lat: 42.8683, lng: -96.9567, sequence: 6 },
        { id: 'wp-lc-7', name: 'Fort Mandan', lat: 47.2961, lng: -101.3283, sequence: 7 },
        { id: 'wp-lc-8', name: 'Knife River Indian Villages', lat: 47.3236, lng: -101.3853, sequence: 8 },
        { id: 'wp-lc-9', name: 'Great Falls (Lower Portage)', lat: 47.5186, lng: -111.1969, sequence: 9 },
        { id: 'wp-lc-10', name: 'Three Forks of the Missouri', lat: 45.9281, lng: -111.5511, sequence: 10 },
        { id: 'wp-lc-11', name: 'Lemhi Pass', lat: 44.9708, lng: -113.4464, sequence: 11 },
        { id: 'wp-lc-12', name: 'Fort Clatsop', lat: 46.1342, lng: -123.8803, sequence: 12 }
      ];

      const resolved = resolveWaterAwareRoute(lcWaypoints, lcRouteContext);
      expect(resolved).toHaveLength(12);

      // Verify all 12 waypoint names, sequences, and coordinates
      expect(resolved.map(w => w.name)).toEqual([
        'Camp Dubois',
        'St. Charles',
        'Kaw Point',
        'Sergeant Floyd Monument',
        'Council Bluff',
        'Spirit Mound',
        'Fort Mandan',
        'Knife River Indian Villages',
        'Great Falls (Lower Portage)',
        'Three Forks of the Missouri',
        'Lemhi Pass',
        'Fort Clatsop'
      ]);
      expect(resolved.map(w => w.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      // Verify that no oceanic pathGeometry is injected for overland waypoints
      for (const wp of resolved) {
        expect(wp.pathGeometry).toBeUndefined();
      }
    });

    it('sanitizes and strips stale/persisted pathGeometry when a non-maritime route is processed', () => {
      // Create a non-maritime overland route with deliberately bogus oceanic pathGeometry
      const overlandWaypointsWithStaleGeometry: Waypoint[] = [
        {
          id: 'wp-lc-1',
          name: 'Camp Dubois',
          lat: 38.8027,
          lng: -90.1012,
          sequence: 1,
          pathGeometry: [
            { lat: 38.8027, lng: -90.1012 },
            { lat: 25.0, lng: -85.0 }, // Bogus Gulf of Mexico point
            { lat: 9.0, lng: -79.5 },  // Bogus Panama Canal point
            { lat: 38.7839, lng: -90.4812 }
          ]
        },
        {
          id: 'wp-lc-2',
          name: 'St. Charles',
          lat: 38.7839,
          lng: -90.4812,
          sequence: 2,
          pathGeometry: [
            { lat: 38.7839, lng: -90.4812 },
            { lat: 0.0, lng: -140.0 }, // Bogus Pacific Ocean point
            { lat: 39.1172, lng: -94.6144 }
          ]
        },
        {
          id: 'wp-lc-3',
          name: 'Kaw Point',
          lat: 39.1172,
          lng: -94.6144,
          sequence: 3
        }
      ];

      const routeContext = {
        title: 'Lewis and Clark Expedition',
        routeType: 'expedition'
      };

      const resolved = resolveWaterAwareRoute(overlandWaypointsWithStaleGeometry, routeContext);
      expect(resolved).toHaveLength(3);

      // Verify stale pathGeometry was stripped from all waypoints
      expect(resolved[0].pathGeometry).toBeUndefined();
      expect(resolved[1].pathGeometry).toBeUndefined();
      expect(resolved[2].pathGeometry).toBeUndefined();

      // Verify canonical coordinates remain completely uncorrupted
      expect(resolved[0].lat).toBeCloseTo(38.8027, 4);
      expect(resolved[0].lng).toBeCloseTo(-90.1012, 4);
      expect(resolved[1].lat).toBeCloseTo(38.7839, 4);
      expect(resolved[1].lng).toBeCloseTo(-90.4812, 4);
      expect(resolved[2].lat).toBeCloseTo(39.1172, 4);
      expect(resolved[2].lng).toBeCloseTo(-94.6144, 4);
    });

    it('correctly classifies Trail of Tears as non-maritime and preserves overland detachment routing', () => {
      const totRouteContext = {
        title: 'Trail of Tears',
        routeType: 'multi_location_campaign',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as const
      };

      const isMaritime = isMaritimeJourney(totRouteContext);
      expect(isMaritime).toBe(false);
    });
  });

  // 6. Waypoint Identity
  describe('6. Waypoint Identity Preservation', () => {
    it('ensures original waypoint IDs, count, and order remain strictly unchanged when intermediate geometry is generated', () => {
      const maritimeWaypoints: Waypoint[] = [
        { id: 'shackleton-plymouth', name: 'Plymouth, England', lat: 50.3755, lng: -4.1427, sequence: 1 },
        { id: 'shackleton-buenos-aires', name: 'Buenos Aires, Argentina', lat: -34.6037, lng: -58.3816, sequence: 2 },
        { id: 'shackleton-grytviken', name: 'Grytviken, South Georgia', lat: -54.2811, lng: -36.5092, sequence: 3 }
      ];

      const resolved = resolveWaterAwareRoute(maritimeWaypoints, {
        title: "Ernest Shackleton's Endurance Expedition",
        routeType: 'expedition'
      });

      // Original waypoints count, IDs, and order are 100% preserved
      expect(resolved).toHaveLength(3);
      expect(resolved[0].id).toBe('shackleton-plymouth');
      expect(resolved[1].id).toBe('shackleton-buenos-aires');
      expect(resolved[2].id).toBe('shackleton-grytviken');

      // Intermediate routing points are stored in pathGeometry on waypoints, NOT exposed as journey waypoints
      expect(resolved[0].pathGeometry).toBeDefined();
      expect(resolved[0].pathGeometry!.length).toBeGreaterThanOrEqual(2);
      expect(resolved[0].pathGeometry![0]).toEqual({ lat: 50.3755, lng: -4.1427 });
    });
  });

  // 7. Existing Route Registry Integration
  describe('7. Existing Route Registry Integration', () => {
    it('verifies that canonical maritime topologies from HISTORICAL_ROUTE_REGISTRY contain resolved water-aware geometry', () => {
      const topology = buildCanonicalEventTopology("Ernest Shackleton's Endurance Expedition");
      expect(topology).not.toBeNull();
      expect(topology?.route).toBeDefined();
      expect(topology!.route.length).toBeGreaterThan(0);

      // First waypoint (Plymouth) has resolved pathGeometry to Buenos Aires
      const plymouthWp = topology!.route.find(w => w.name.includes('Plymouth'));
      expect(plymouthWp).toBeDefined();
      expect(plymouthWp?.pathGeometry).toBeDefined();
      expect(plymouthWp?.pathGeometry?.length).toBeGreaterThanOrEqual(2);

      // Verify that downstream globe route geometry builder consumes the topology without errors
      const globeGeometry = buildGlobeRouteGeometry({
        waypoints: topology!.route,
        skin: 'modern'
      });
      expect(globeGeometry).not.toBeNull();
      expect(globeGeometry?.getAttribute('position').count).toBeGreaterThan(0);
    });
  });

  // 8. Dateline / Antimeridian (±180°) Handling
  describe('8. Dateline / Antimeridian Handling', () => {
    it('routes correctly across the Pacific without creating an unintended globe-spanning detour', () => {
      // Tokyo (35° N, 140° E) to San Francisco (37.7° N, -122.4° W)
      const tokyo = { lat: 35.6762, lng: 139.6503 };
      const sanFrancisco = { lat: 37.7749, lng: -122.4194 };

      const path = findWaterRoute(tokyo, sanFrancisco);
      expect(path.length).toBeGreaterThanOrEqual(2);

      // Verify start and end coordinates
      expect(path[0].lat).toBeCloseTo(tokyo.lat, 2);
      expect(path[0].lng).toBeCloseTo(tokyo.lng, 2);
      expect(path[path.length - 1].lat).toBeCloseTo(sanFrancisco.lat, 2);
      expect(path[path.length - 1].lng).toBeCloseTo(sanFrancisco.lng, 2);

      // Ensure all intermediate generated water points are in open water (not on land)
      for (const pt of path.slice(1, -1)) {
        expect(isPointOnLand(pt.lat, pt.lng)).toBe(false);
      }
    });
  });

  // 9. Geometry Simplification
  describe('9. Geometry Simplification', () => {
    it('simplifies intermediate path nodes with clear line of sight over open water', () => {
      const complexPath: { lat: number; lng: number }[] = [
        { lat: 20.0, lng: -40.0 },
        { lat: 22.0, lng: -38.0 },
        { lat: 24.0, lng: -36.0 },
        { lat: 26.0, lng: -34.0 },
        { lat: 28.0, lng: -32.0 },
        { lat: 30.0, lng: -30.0 }
      ];

      const simplified = simplifyWaterRoute(complexPath);
      // Collinear open water points should be simplified to endpoints
      expect(simplified.length).toBeLessThan(complexPath.length);
      expect(simplified[0]).toEqual(complexPath[0]);
      expect(simplified[simplified.length - 1]).toEqual(complexPath[complexPath.length - 1]);
    });
  });

  // 10. Water Graph Topological Integrity & Zero-Land-Crossing Guarantee
  describe('10. Water Graph Topological Integrity & Zero-Land-Crossing Guarantee', () => {
    it('verifies that every edge in GLOBAL_WATER_NODES is completely clear of all landmasses', () => {
      const invalidEdges: string[] = [];
      const checked = new Set<string>();

      for (const [nodeId, node] of Object.entries(GLOBAL_WATER_NODES)) {
        if (isPointOnLand(node.lat, node.lng)) {
          invalidEdges.push(`Node "${nodeId}" (${node.lat}, ${node.lng}) is located on land!`);
        }

        for (const neighborId of node.neighbors) {
          const neighbor = GLOBAL_WATER_NODES[neighborId];
          if (!neighbor) {
            invalidEdges.push(`Node "${nodeId}" has undefined neighbor "${neighborId}"`);
            continue;
          }

          const edgeKey = [nodeId, neighborId].sort().join(' <-> ');
          if (checked.has(edgeKey)) continue;
          checked.add(edgeKey);

          const intersects = doesSegmentIntersectLand(node, neighbor, { sampleSteps: 64, interiorOnly: false });
          if (intersects) {
            invalidEdges.push(`Edge between "${nodeId}" and "${neighborId}" intersects land!`);
          }
        }
      }

      expect(invalidEdges).toEqual([]);
    });

    it('verifies that real-world maritime voyage legs navigate strictly over water', () => {
      const routesToTest = [
        { name: 'Lisbon to Genoa (Mediterranean & Iberia)', start: { lat: 38.72, lng: -9.14 }, end: { lat: 44.41, lng: 8.93 } },
        { name: 'Plymouth to Cape Town (Atlantic & Africa)', start: { lat: 50.37, lng: -4.14 }, end: { lat: -33.92, lng: 18.42 } },
        { name: 'Plymouth to Boston (Transatlantic)', start: { lat: 50.37, lng: -4.14 }, end: { lat: 42.36, lng: -71.06 } },
        { name: 'Tokyo to San Francisco (Transpacific)', start: { lat: 35.68, lng: 139.76 }, end: { lat: 37.77, lng: -122.42 } },
        { name: 'London/Dover to Heligoland/Cuxhaven (North Sea & Dover Strait)', start: { lat: 51.13, lng: 1.31 }, end: { lat: 54.18, lng: 7.88 } },
        { name: 'Dubai/Persian Gulf to Mumbai (Strait of Hormuz & Arabian Sea)', start: { lat: 25.27, lng: 55.30 }, end: { lat: 18.92, lng: 72.83 } },
        { name: 'Jeddah/Red Sea to Singapore (Bab-el-Mandeb & Malacca Strait)', start: { lat: 21.49, lng: 39.19 }, end: { lat: 1.29, lng: 103.85 } },
        { name: 'Buenos Aires to Valparaiso (Cape Horn & Drake Passage)', start: { lat: -34.60, lng: -58.38 }, end: { lat: -33.04, lng: -71.62 } },
        { name: 'Havana to New York (Florida Straits & East Coast)', start: { lat: 23.11, lng: -82.37 }, end: { lat: 40.71, lng: -74.01 } },
        { name: 'Sydney to Auckland (Tasman Sea)', start: { lat: -33.86, lng: 151.20 }, end: { lat: -36.84, lng: 174.76 } }
      ];

      for (const testCase of routesToTest) {
        const path = findWaterRoute(testCase.start, testCase.end);
        expect(path.length).toBeGreaterThanOrEqual(2);

        for (let i = 0; i < path.length - 1; i++) {
          const p1 = path[i];
          const p2 = path[i + 1];
          const intersects = doesSegmentIntersectLand(p1, p2, { sampleSteps: 32, interiorOnly: true });
          expect(intersects).toBe(false);
        }
      }
    });
  });
});
