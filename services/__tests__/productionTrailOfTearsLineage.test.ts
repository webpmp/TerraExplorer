import { describe, it, expect } from 'vitest';
import { runRoutePipeline } from '../routePipeline';
import { getSequentialRouteSegments } from '../../utils/routeSequenceUtils';

describe('Production Trail of Tears Full Lineage & Diagnostics', () => {
  it('executes complete production pipeline and captures [TRAIL OF TEARS FINAL PRODUCTION AUDIT] & [OSM RENDER STATE]', async () => {
    console.log("=== EXECUTING TRAIL OF TEARS END-TO-END PRODUCTION PIPELINE ===");

  // Simulating the exact Stage 1 prompt output for the prompt with detachment anchors:
  const mockGeminiResponse = async () => ({
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
      // Northern Route
      {
        id: 'nr-1',
        name: 'New Echota',
        canonicalName: 'New Echota',
        lat: 34.5408,
        lng: -84.9100,
        sequence: 1,
        routeGroupId: 'northern-route',
        routeGroupName: 'Northern Route',
        role: 'primary',
        description: 'Cherokee capital and 1835 treaty site in Georgia.'
      },
      {
        id: 'nr-2',
        name: 'Fort Cass',
        canonicalName: 'Fort Cass',
        lat: 35.2858,
        lng: -84.7578,
        sequence: 2,
        routeGroupId: 'northern-route',
        routeGroupName: 'Northern Route',
        role: 'primary',
        description: 'Primary military staging depot in Charleston, TN from which overland detachments departed.'
      },
      {
        id: 'nr-3',
        name: 'Fort Gibson',
        canonicalName: 'Fort Gibson',
        lat: 35.7981,
        lng: -95.2497,
        sequence: 3,
        routeGroupId: 'northern-route',
        routeGroupName: 'Northern Route',
        role: 'primary',
        description: 'Primary military garrison and receiving depot in Indian Territory.'
      },
      {
        id: 'nr-4',
        name: 'Tahlequah',
        canonicalName: 'Tahlequah',
        lat: 35.7094,
        lng: -94.8216,
        sequence: 4,
        routeGroupId: 'northern-route',
        routeGroupName: 'Northern Route',
        role: 'primary',
        description: 'Final capital of the Cherokee Nation in Indian Territory.'
      },
      // Benge Route
      {
        id: 'br-1',
        name: 'Fort Payne',
        canonicalName: 'Fort Payne',
        lat: 34.4442,
        lng: -85.7197,
        sequence: 1,
        routeGroupId: 'benge-route',
        routeGroupName: 'Benge Route',
        role: 'primary',
        description: 'Departure fort for John Benge detachment in DeKalb County, AL.'
      },
      {
        id: 'br-2',
        name: "Gunter's Landing",
        canonicalName: "Gunter's Landing",
        lat: 34.3581,
        lng: -86.2944,
        sequence: 2,
        routeGroupId: 'benge-route',
        routeGroupName: 'Benge Route',
        role: 'primary',
        description: 'Tennessee River crossing point for the Benge detachment in Guntersville, AL.'
      },
      {
        id: 'br-3',
        name: 'Tahlequah',
        canonicalName: 'Tahlequah',
        lat: 35.7094,
        lng: -94.8216,
        sequence: 3,
        routeGroupId: 'benge-route',
        routeGroupName: 'Benge Route',
        role: 'primary',
        description: 'Arrival destination in Indian Territory.'
      },
      // Bell Route
      {
        id: 'bl-1',
        name: 'Fort Cass',
        canonicalName: 'Fort Cass',
        lat: 35.2858,
        lng: -84.7578,
        sequence: 1,
        routeGroupId: 'bell-route',
        routeGroupName: 'Bell Route',
        role: 'primary',
        description: 'Departure internment depot in Charleston, TN for the treaty party detachment.'
      },
      {
        id: 'bl-2',
        name: 'Memphis',
        canonicalName: 'Memphis',
        lat: 35.1495,
        lng: -90.0489,
        sequence: 2,
        routeGroupId: 'bell-route',
        routeGroupName: 'Bell Route',
        role: 'primary',
        description: 'Mississippi River crossing point in western Tennessee.'
      },
      {
        id: 'bl-3',
        name: 'Fort Gibson',
        canonicalName: 'Fort Gibson',
        lat: 35.7981,
        lng: -95.2497,
        sequence: 3,
        routeGroupId: 'bell-route',
        routeGroupName: 'Bell Route',
        role: 'primary',
        description: 'Western arrival post in Indian Territory.'
      },
      // Water Route
      {
        id: 'wr-1',
        name: "Ross's Landing",
        canonicalName: "Ross's Landing",
        lat: 35.0560,
        lng: -85.3090,
        sequence: 1,
        routeGroupId: 'water-route',
        routeGroupName: 'Water Route',
        role: 'primary',
        description: 'Major embarkation point on the Tennessee River in Chattanooga, TN.'
      },
      {
        id: 'wr-2',
        name: 'Fort Coffee',
        canonicalName: 'Fort Coffee',
        lat: 35.3042,
        lng: -94.6144,
        sequence: 2,
        routeGroupId: 'water-route',
        routeGroupName: 'Water Route',
        role: 'primary',
        description: 'Primary arrival river landing and receiving depot on the Arkansas River in Indian Territory.'
      },
      {
        id: 'wr-3',
        name: 'Fort Gibson',
        canonicalName: 'Fort Gibson',
        lat: 35.7981,
        lng: -95.2497,
        sequence: 3,
        routeGroupId: 'water-route',
        routeGroupName: 'Water Route',
        role: 'primary',
        description: 'Garrison receiving depot near the confluence of the Arkansas, Grand, and Verdigris rivers.'
      }
    ]
  });

  const finalRoute = await runRoutePipeline(
    'Where did the Trail of Tears take place?',
    false,
    mockGeminiResponse,
    'HISTORICAL_EVENT'
  );

  // Capture OSM Render State exactly as rendered by OSMMapLayer.tsx
  const routeWaypoints = finalRoute.waypoints;
  const sequentialSegments = getSequentialRouteSegments(routeWaypoints, finalRoute);
  const uniqueWaypointIds = new Set(routeWaypoints.map(w => w.id));
  const routeGroupsMap = new Map<string, { name: string; count: number }>();
  routeWaypoints.forEach(w => {
    const gId = w.routeGroupId || 'default';
    const gName = w.routeGroupName || 'Default Group';
    if (!routeGroupsMap.has(gId)) {
      routeGroupsMap.set(gId, { name: gName, count: 0 });
    }
    routeGroupsMap.get(gId)!.count++;
  });

  console.log(`\n========================================`);
  console.log(`[OSM RENDER STATE]`);
  console.log(`========================================`);
  console.log(`TOTAL WAYPOINTS: ${routeWaypoints.length}`);
  console.log(`UNIQUE WAYPOINT IDS: ${uniqueWaypointIds.size}`);
  console.log(`UNIQUE ROUTE GROUPS: ${routeGroupsMap.size}\n`);
  
  console.log(`ROUTE GROUPS:`);
  Array.from(routeGroupsMap.entries()).forEach(([id, info]) => {
    console.log(`  - ${info.name} (id: ${id}): ${info.count} waypoints`);
  });

  console.log(`\nWAYPOINTS:`);
  routeWaypoints.forEach((w, idx) => {
    console.log(`  ${idx + 1}. id=${w.id} name="${w.name}" lat=${w.lat} lng=${w.lng} seq=${w.sequence} globalSeq=${w.globalSequence} routeGroupId=${w.routeGroupId} routeGroupName="${w.routeGroupName}" type=${w.waypointType} evidence=${w.segmentEvidence}`);
  });

  console.log(`\nSEGMENTS:`);
  const segmentsLines = sequentialSegments.flatMap(seg => {
    const groupWaypoints = seg.waypoints;
    return groupWaypoints.slice(0, -1).map((wp, i) => {
      const nextWp = groupWaypoints[i + 1];
      return `  - fromId=${wp.id} fromName="${wp.name}" fromSeq=${wp.sequence} fromGroup=${wp.routeGroupId} -> toId=${nextWp.id} toName="${nextWp.name}" toSeq=${nextWp.sequence} toGroup=${nextWp.routeGroupId}`;
    });
  });
  if (segmentsLines.length === 0) {
    console.log(`  (None - all consecutive pairs are gated or isolated)`);
  } else {
    segmentsLines.forEach(l => console.log(l));
  }
  console.log(`========================================\n`);
    expect(finalRoute.waypoints.length).toBe(13);
  }, 30000);
});
