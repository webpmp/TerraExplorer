import { describe, it, expect } from 'vitest';
import { runRoutePipeline, normalizeRouteMemberships } from '../routePipeline';
import { groupWaypointsByRoute, getSequentialWaypointPairs } from '../../utils/routeSequenceUtils';
import { findAuthoritativeAnchorAcrossEvent } from '../geographic/historicalRouteRegistry';
import { Waypoint } from '../../types';

describe('Multi-Route Waypoint Normalization, Shared Waypoints, and Validation Suite', () => {

  // Test 1: Scalar Membership
  it('Test 1: Scalar Membership - normalizes scalar string routeGroupId and routeGroupName to memberships[1]', () => {
    const raw = {
      id: 'wp-1',
      name: 'New Echota',
      routeGroupId: 'northern-route',
      routeGroupName: 'Northern Route',
      sequence: 2
    };

    const { memberships, primaryGroupId, primaryGroupName, warning } = normalizeRouteMemberships(raw);
    expect(warning).toBeUndefined();
    expect(primaryGroupId).toBe('northern-route');
    expect(primaryGroupName).toBe('Northern Route');
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toEqual({
      routeGroupId: 'northern-route',
      routeGroupName: 'Northern Route',
      sequence: 2,
      membershipType: 'ROUTE_EXCLUSIVE'
    });
  });

  // Test 2: Explicit Membership Array
  it('Test 2: Explicit Membership Array - preserves clean memberships array and assigns primary scalar fields', () => {
    const raw = {
      id: 'fort-gibson',
      name: 'Fort Gibson',
      memberships: [
        {
          routeGroupId: 'northern-route',
          routeGroupName: 'Northern Route',
          sequence: 3,
          membershipType: 'SHARED_ROUTE_ANCHOR'
        },
        {
          routeGroupId: 'bell-route',
          routeGroupName: 'Bell Route',
          sequence: 3,
          membershipType: 'SHARED_ROUTE_ANCHOR'
        }
      ]
    };

    const { memberships, primaryGroupId, primaryGroupName } = normalizeRouteMemberships(raw);
    expect(memberships).toHaveLength(2);
    expect(primaryGroupId).toBe('northern-route');
    expect(primaryGroupName).toBe('Northern Route');
    expect(memberships[0].routeGroupId).toBe('northern-route');
    expect(memberships[1].routeGroupId).toBe('bell-route');
  });

  // Test 3: Legacy Array Membership
  it('Test 3: Legacy Array Membership - converts parallel arrays into memberships without leaving arrays in scalar fields', () => {
    const raw = {
      id: 'fort-gibson',
      name: 'Fort Gibson',
      routeGroupId: ['northern-route', 'bell-route'],
      routeGroupName: ['Northern Route', 'Bell Route'],
      sequence: 3
    };

    const { memberships, primaryGroupId, primaryGroupName, warning } = normalizeRouteMemberships(raw);
    expect(warning).toBeUndefined();
    expect(typeof primaryGroupId).toBe('string');
    expect(typeof primaryGroupName).toBe('string');
    expect(Array.isArray(primaryGroupId)).toBe(false);
    expect(Array.isArray(primaryGroupName)).toBe(false);
    expect(primaryGroupId).toBe('northern-route');
    expect(primaryGroupName).toBe('Northern Route');
    expect(memberships).toHaveLength(2);
    expect(memberships[0].routeGroupId).toBe('northern-route');
    expect(memberships[1].routeGroupId).toBe('bell-route');
  });

  // Test 4: Mismatched Arrays
  it('Test 4: Mismatched Arrays - handles differing array lengths safely without crashing or fabricating route names', () => {
    const raw = {
      id: 'wp-mismatched',
      name: 'Fort Gibson',
      routeGroupId: ['northern-route', 'bell-route', 'water-route'],
      routeGroupName: ['Northern Route'], // Only 1 name for 3 IDs
      sequence: 4
    };

    const { memberships, primaryGroupId, primaryGroupName, warning } = normalizeRouteMemberships(raw);
    expect(warning).toBeDefined();
    expect(warning).toContain('Mismatched parallel array lengths');
    expect(memberships).toHaveLength(3);
    expect(memberships[0].routeGroupName).toBe('Northern Route');
    expect(memberships[1].routeGroupName).toBeUndefined();
    expect(memberships[2].routeGroupName).toBeUndefined();
    expect(primaryGroupId).toBe('northern-route');
  });

  // Test 5: Array String Safety
  it('Test 5: Array String Safety - pipeline never throws routeGroupName.toLowerCase is not a function when LLM returns arrays', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      waypoints: [
        {
          id: 'fort-gibson-ok',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: [
            'northern-route',
            'bell-route',
            'benge-route',
            'water-route'
          ],
          routeGroupName: [
            'Northern Route',
            'Bell Route',
            'Benge Route',
            'Water Route'
          ],
          sequence: 4
        }
      ]
    });

    // Should complete cleanly without TypeError
    const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    expect(processed).toBeDefined();
    expect(processed.waypoints.length).toBeGreaterThan(0);
    const fg = processed.waypoints.find(w => w.name === 'Fort Gibson');
    expect(fg).toBeDefined();
    expect(typeof fg!.routeGroupId).toBe('string');
    expect(typeof fg!.routeGroupName).toBe('string');
  });

  // Test 6: Shared Waypoint
  it('Test 6: Shared Waypoint - one geographic entity ID participates across multiple route groups via groupWaypointsByRoute', () => {
    const sharedWaypoint: Waypoint = {
      id: 'fort-gibson',
      name: 'Fort Gibson',
      lat: 35.7981,
      lng: -95.2497,
      routeGroupId: 'northern-route',
      routeGroupName: 'Northern Route',
      memberships: [
        { routeGroupId: 'northern-route', routeGroupName: 'Northern Route', sequence: 3 },
        { routeGroupId: 'bell-route', routeGroupName: 'Bell Route', sequence: 3 },
        { routeGroupId: 'water-route', routeGroupName: 'Water Route', sequence: 3 }
      ]
    };

    const groups = groupWaypointsByRoute([sharedWaypoint], {
      routeGroups: [
        { id: 'northern-route', name: 'Northern Route', waypoints: [] },
        { id: 'bell-route', name: 'Bell Route', waypoints: [] },
        { id: 'water-route', name: 'Water Route', waypoints: [] }
      ]
    });

    expect(groups).toHaveLength(3);
    const northernGroup = groups.find(g => g.id === 'northern-route')!;
    const bellGroup = groups.find(g => g.id === 'bell-route')!;
    const waterGroup = groups.find(g => g.id === 'water-route')!;

    expect(northernGroup.waypoints).toHaveLength(1);
    expect(bellGroup.waypoints).toHaveLength(1);
    expect(waterGroup.waypoints).toHaveLength(1);

    expect(northernGroup.waypoints[0].id).toBe('fort-gibson');
    expect(bellGroup.waypoints[0].id).toBe('fort-gibson');
    expect(waterGroup.waypoints[0].id).toBe('fort-gibson');
  });

  // Test 7: Route-Local Sequence
  it('Test 7: Route-Local Sequence - different route groups can both independently contain sequence 1', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      waypoints: [
        { id: 'nr-1', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'wr-1', name: "Ross's Landing", lat: 35.0560, lng: -85.3090, sequence: 1, routeGroupId: 'water-route', routeGroupName: 'Water Route' }
      ]
    });

    const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    const nr = processed.waypoints.find(w => w.name === 'New Echota');
    const wr = processed.waypoints.find(w => w.name === "Ross's Landing");

    expect(nr).toBeDefined();
    expect(wr).toBeDefined();
    expect(nr!.sequence).toBe(1);
    expect(wr!.sequence).toBe(1);
  });

  // Test 8: Registry Override
  it('Test 8: Registry Override - valid canonical waypoint with incorrect AI route assignment is reconciled, not rejected', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears Northern Route',
      routeEvidenceMode: 'DOCUMENTED_ROUTE' as any,
      isSequential: true,
      waypoints: [
        // AI incorrectly assigns Fort Gibson to an unknown custom route
        {
          id: 'fort-gibson',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: 'unknown-custom-route',
          routeGroupName: 'Unknown Route',
          sequence: 1
        }
      ]
    });

    const processed = await runRoutePipeline('Trail of Tears Northern Route', false, mockGenerator, 'HISTORICAL_EVENT');
    const fg = processed.waypoints.find(w => w.name === 'Fort Gibson');
    expect(fg).toBeDefined();
    expect(fg!.memberships).toBeDefined();
    // According to the canonical route contract: "Create exactly one route-scoped membership"
    expect(fg!.memberships!.length).toBe(1);
    expect(fg!.memberships![0].routeGroupId).toBe('northern-route');
    expect(fg!.routeGroupId).toBe('northern-route');
  }, 10000);

  // Test 9: Invalid Historical Waypoint
  it('Test 9: Invalid Historical Waypoint - hallucinated/non-canonical locations remain strictly rejected', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      waypoints: [
        {
          id: 'hallucinated-site',
          name: 'West Point Military Academy',
          lat: 41.3918,
          lng: -73.9572,
          routeGroupId: 'northern-route',
          routeGroupName: 'Northern Route',
          sequence: 2
        }
      ]
    });

    const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    const wp = processed.waypoints.find(w => w.name === 'West Point Military Academy');
    expect(wp).toBeUndefined();
  });

  // Test 10: Event-Level Anchor
  it('Test 10: Event-Level Anchor - New Echota is maintained as a documented anchor without automatically attaching to all 4 routes', () => {
    const match = findAuthoritativeAnchorAcrossEvent('Trail of Tears', 'New Echota');
    expect(match).toBeDefined();
    expect(match!.anchor.name).toBe('New Echota');
    // It belongs to Northern Route overland departure corridor, not water-route
    expect(match!.memberships.some((m: any) => m.routeGroupId === 'northern-route')).toBe(true);
    expect(match!.memberships.some((m: any) => m.routeGroupId === 'water-route')).toBe(false);
  });

  // Test 11: Route Scope Filtering
  it('Test 11: Route Scope Filtering - a focused Northern Route request does not resurrect unrequested routes', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears Northern Route',
      routeEvidenceMode: 'DOCUMENTED_ROUTE' as any,
      isSequential: true,
      waypoints: [
        { id: 'nr-1', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-2', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-4', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 4, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' }
      ]
    });

    const processed = await runRoutePipeline('Trail of Tears Northern Route', false, mockGenerator, 'HISTORICAL_EVENT');
    const groupIds = new Set(processed.waypoints.map(w => w.routeGroupId));
    expect(groupIds.has('northern-route')).toBe(true);
    expect(groupIds.has('water-route')).toBe(false);
    expect(groupIds.has('bell-route')).toBe(false);
    expect(groupIds.has('benge-route')).toBe(false);
  }, 10000);

  // Test 12: Full Event Generation
  it('Test 12: Full Event Generation - full Trail of Tears event includes all populated canonical route groups', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      waypoints: [] // Empty AI trigger to exercise canonical event topology
    });

    const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    const groupIds = new Set(processed.waypoints.map(w => w.routeGroupId));
    expect(groupIds.has('northern-route')).toBe(true);
    expect(groupIds.has('benge-route')).toBe(true);
    expect(groupIds.has('bell-route')).toBe(true);
    expect(groupIds.has('water-route')).toBe(true);
  }, 10000);

  // Test 13: Pseudo-Group Regression
  it('Test 13: Pseudo-Group Regression - no waypoint output produces comma-separated pseudo-groups like "a,b,c"', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      waypoints: [
        {
          id: 'fort-gibson',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: ['northern-route', 'bell-route', 'water-route'],
          routeGroupName: ['Northern Route', 'Bell Route', 'Water Route'],
          sequence: 4
        }
      ]
    });

    const processed = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    for (const w of processed.waypoints) {
      expect(w.routeGroupId).not.toContain(',');
      if (w.routeGroupName) {
        expect(w.routeGroupName).not.toContain(',');
      }
    }
  }, 10000);

  // Test 14: Production Trail of Tears Regression
  it('Test 14: Production Trail of Tears Regression - production-style multi-route response runs without exceptions or cross-route connections', async () => {
    const mockGenerator = async () => ({
      title: 'Trail of Tears',
      routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
      isSequential: false,
      routeGroups: [
        { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
        { id: 'benge-route', name: 'Benge Route', type: 'detachment', isSequential: true },
        { id: 'bell-route', name: 'Bell Route', type: 'detachment', isSequential: true },
        { id: 'water-route', name: 'Water Route', type: 'detachment', isSequential: true }
      ],
      waypoints: [
        // Northern Route
        { id: 'nr-1', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-2', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        { id: 'nr-4', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 4, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
        // Benge Route
        { id: 'br-1', name: 'Fort Payne', lat: 34.4442, lng: -85.7197, sequence: 1, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
        { id: 'br-2', name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
        { id: 'br-3', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 3, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
        // Bell Route
        { id: 'bl-1', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 1, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
        { id: 'bl-2', name: 'Memphis', lat: 35.1495, lng: -90.0489, sequence: 2, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
        { id: 'bl-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
        // Water Route
        { id: 'wr-1', name: "Ross's Landing", lat: 35.0560, lng: -85.3090, sequence: 1, routeGroupId: 'water-route', routeGroupName: 'Water Route' },
        { id: 'wr-2', name: 'Fort Coffee', lat: 35.3042, lng: -94.6144, sequence: 2, routeGroupId: 'water-route', routeGroupName: 'Water Route' },
        { id: 'wr-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'water-route', routeGroupName: 'Water Route' }
      ]
    });

    const route = await runRoutePipeline('Trail of Tears', false, mockGenerator, 'HISTORICAL_EVENT');
    expect(route).toBeDefined();
    expect(route.waypoints.length).toBe(13);

    // Verify segments never connect across distinct route groups
    const pairs = getSequentialWaypointPairs(route.waypoints, route);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [fromWp, toWp] of pairs) {
      expect(fromWp.routeGroupId).toBe(toWp.routeGroupId);
    }
  }, 30000);
});
