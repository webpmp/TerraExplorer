import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Ensure process.env.API_KEY is defined in process for geminiService
process.env.API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;

import { generateRoute } from '../services/geminiService';
import { getSequentialRouteSegments } from '../utils/routeSequenceUtils';

async function main() {
  console.log("=== STARTING REAL PRODUCTION TRAIL OF TEARS QUERY ===");
  const query = "Where did the Trail of Tears take place?";
  
  try {
    const finalRoute = await generateRoute(query, 'HISTORICAL_EVENT');

    console.log("\n=== PIPELINE RETURNED ROUTE OBJECT ===");
    console.log(`Title: ${finalRoute.title}`);
    console.log(`Total Waypoints: ${finalRoute.waypoints.length}`);
    console.log(`Route Groups: ${finalRoute.routeGroups?.length || 0}`);

    // Simulate OSM RENDER STATE
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

  } catch (error) {
    console.error("Error running real Trail of Tears:", error);
  }
}

main();
