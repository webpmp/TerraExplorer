import { describe, it, expect } from 'vitest';
import { runRoutePipeline } from '../routePipeline';
import { getSequentialRouteSegments, getSequentialWaypointPairs } from '../../utils/routeSequenceUtils';
import { getRouteSegmentStyle, ROUTE_LINE_DASH_ARRAY, ROUTE_LINE_SECONDARY_DASH_ARRAY, ROUTE_LINE_STROKE_WIDTH, ROUTE_LINE_SECONDARY_STROKE_WIDTH } from '../../utils/osmRouteArrowUtils';
import { getConnectingLineColor } from '../../utils/routeLineColor';

describe('Multi-Route Historical Visual & UI Semantics Test Suite', () => {
  const multiRouteEventGenerator = async () => ({
    title: 'Trail of Tears',
    routeEvidenceMode: 'MULTI_ROUTE_EVENT' as const,
    isSequential: false,
    routeGroups: [
      { id: 'northern-route', name: 'Northern Route', type: 'detachment', isSequential: true },
      { id: 'benge-route', name: 'Benge Route', type: 'detachment', isSequential: true },
      { id: 'bell-route', name: 'Bell Route', type: 'detachment', isSequential: true },
      { id: 'water-route', name: 'Water Route', type: 'detachment', isSequential: true }
    ],
    waypoints: [
      // Northern Route (4)
      { id: 'nr-1', name: 'New Echota', lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'nr-2', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'nr-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      { id: 'nr-4', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 4, routeGroupId: 'northern-route', routeGroupName: 'Northern Route' },
      // Benge Route (3)
      { id: 'br-1', name: 'Fort Payne', lat: 34.4442, lng: -85.7197, sequence: 1, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
      { id: 'br-2', name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
      { id: 'br-3', name: 'Tahlequah', lat: 35.7094, lng: -94.8216, sequence: 3, routeGroupId: 'benge-route', routeGroupName: 'Benge Route' },
      // Bell Route (3)
      { id: 'bl-1', name: 'Fort Cass', lat: 35.2858, lng: -84.7578, sequence: 1, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
      { id: 'bl-2', name: 'Memphis', lat: 35.1495, lng: -90.0489, sequence: 2, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
      { id: 'bl-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'bell-route', routeGroupName: 'Bell Route' },
      // Water Route (3)
      { id: 'wr-1', name: "Ross's Landing", lat: 35.0560, lng: -85.3090, sequence: 1, routeGroupId: 'water-route', routeGroupName: 'Water Route' },
      { id: 'wr-2', name: 'Fort Coffee', lat: 35.3042, lng: -94.6144, sequence: 2, routeGroupId: 'water-route', routeGroupName: 'Water Route' },
      { id: 'wr-3', name: 'Fort Gibson', lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: 'water-route', routeGroupName: 'Water Route' }
    ]
  });

  it('1. Each route starts at sequence 1 and has its own independent waypoint count', async () => {
    const route = await runRoutePipeline('Trail of Tears', false, multiRouteEventGenerator, 'HISTORICAL_EVENT');

    const northern = route.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = route.waypoints.filter(w => w.routeGroupId === 'benge-route');
    const bell = route.waypoints.filter(w => w.routeGroupId === 'bell-route');
    const water = route.waypoints.filter(w => w.routeGroupId === 'water-route');

    expect(northern.length).toBe(4);
    expect(northern.map(w => w.sequence)).toEqual([1, 2, 3, 4]);

    expect(benge.length).toBe(3);
    expect(benge.map(w => w.sequence)).toEqual([1, 2, 3]);

    expect(bell.length).toBe(3);
    expect(bell.map(w => w.sequence)).toEqual([1, 2, 3]);

    expect(water.length).toBe(3);
    expect(water.map(w => w.sequence)).toEqual([1, 2, 3]);
  }, 30000);

  it('2. Preserves shared geographic locations across distinct routes without conflating or merging them', async () => {
    const route = await runRoutePipeline('Trail of Tears', false, multiRouteEventGenerator, 'HISTORICAL_EVENT');

    // Fort Cass is on Northern (seq 2) and Bell (seq 1)
    const fortCassInstances = route.waypoints.filter(w => w.name === 'Fort Cass');
    expect(fortCassInstances.length).toBe(2);
    expect(fortCassInstances.map(w => w.routeGroupId)).toEqual(['northern-route', 'bell-route']);
    expect(fortCassInstances.map(w => w.sequence)).toEqual([2, 1]);

    // Fort Gibson is on Northern (seq 3), Bell (seq 3), and Water (seq 3)
    const fortGibsonInstances = route.waypoints.filter(w => w.name === 'Fort Gibson');
    expect(fortGibsonInstances.length).toBe(3);
    expect(fortGibsonInstances.map(w => w.routeGroupId)).toEqual(['northern-route', 'bell-route', 'water-route']);

    // Tahlequah is on Northern (seq 4) and Benge (seq 3)
    const tahlequahInstances = route.waypoints.filter(w => w.name === 'Tahlequah');
    expect(tahlequahInstances.length).toBe(2);
    expect(tahlequahInstances.map(w => w.routeGroupId)).toEqual(['northern-route', 'benge-route']);
  }, 30000);

  it('3. Never generates cross-route segments (all segments strictly bounded within routeGroupId)', async () => {
    const route = await runRoutePipeline('Trail of Tears', false, multiRouteEventGenerator, 'HISTORICAL_EVENT');
    const pairs = getSequentialWaypointPairs(route.waypoints, route);

    expect(pairs.length).toBeGreaterThan(0);
    for (const [fromWp, toWp] of pairs) {
      expect(fromWp.routeGroupId).toBe(toWp.routeGroupId);
      expect(fromWp.routeGroupId).toBeDefined();
    }
  }, 30000);

  it('4. Renders DOCUMENTED_ROUTE_SEGMENT as primary/solid and HIGH_LEVEL_HISTORICAL_ASSOCIATION as secondary/faded', async () => {
    const route = await runRoutePipeline('Trail of Tears', false, multiRouteEventGenerator, 'HISTORICAL_EVENT');
    const segments = getSequentialRouteSegments(route.waypoints, route);

    // Primary styles
    const primaryStyle = getRouteSegmentStyle('DOCUMENTED_ROUTE_SEGMENT', 'modern');
    expect(primaryStyle.isSecondary).toBe(false);
    expect(primaryStyle.strokeWidth).toBe(ROUTE_LINE_STROKE_WIDTH);
    expect(primaryStyle.strokeDasharray).toBe(ROUTE_LINE_DASH_ARRAY);
    expect(primaryStyle.opacity).toBeGreaterThan(0.9);

    // Secondary styles
    const secondaryStyle = getRouteSegmentStyle('HIGH_LEVEL_HISTORICAL_ASSOCIATION', 'modern');
    expect(secondaryStyle.isSecondary).toBe(true);
    expect(secondaryStyle.strokeWidth).toBe(ROUTE_LINE_SECONDARY_STROKE_WIDTH);
    expect(secondaryStyle.strokeDasharray).toBe(ROUTE_LINE_SECONDARY_DASH_ARRAY);
    expect(secondaryStyle.opacity).toBeLessThan(0.5);

    // Northern Route: New Echota -> Fort Cass (primary), Fort Cass -> Fort Gibson (secondary), Fort Gibson -> Tahlequah (primary)
    const northernSegments = segments.filter(s => s.group.id === 'northern-route');
    expect(northernSegments.length).toBe(3);
    expect(northernSegments[0].segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');
    expect(northernSegments[1].segmentEvidence).toBe('HIGH_LEVEL_HISTORICAL_ASSOCIATION');
    expect(northernSegments[2].segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');

    // Benge Route: Fort Payne -> Gunter's Landing is primary, Gunter's Landing -> Tahlequah is secondary
    const bengeSegments = segments.filter(s => s.group.id === 'benge-route');
    expect(bengeSegments.length).toBe(2);
    expect(bengeSegments[0].segmentEvidence).toBe('DOCUMENTED_ROUTE_SEGMENT');
    expect(bengeSegments[1].segmentEvidence).toBe('HIGH_LEVEL_HISTORICAL_ASSOCIATION');
  }, 30000);

  it('5. Assigns deterministic distinct route colors to each detachment', () => {
    const northernColor = getConnectingLineColor({ theme: 'modern', mapLayer: 'osm', routeGroupId: 'northern-route' });
    const bengeColor = getConnectingLineColor({ theme: 'modern', mapLayer: 'osm', routeGroupId: 'benge-route' });
    const bellColor = getConnectingLineColor({ theme: 'modern', mapLayer: 'osm', routeGroupId: 'bell-route' });
    const waterColor = getConnectingLineColor({ theme: 'modern', mapLayer: 'osm', routeGroupId: 'water-route' });

    const colorSet = new Set([northernColor, bengeColor, bellColor, waterColor]);
    expect(colorSet.size).toBe(4); // All four detachments have visually distinguishable colors
  });
});
