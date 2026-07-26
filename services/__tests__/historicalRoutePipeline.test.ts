import { runSearchPipeline, FinalLocationResult } from '../pipeline';

async function testHistoricalRoutePipeline() {
  console.log("=== STARTING SILK ROAD ROUTE TEST ===");
  
  // Simulate the user searching from the UI
  const result: FinalLocationResult = await runSearchPipeline({
      rawQuery: "Follow the Silk Road from China to Europe"
  });

  // 1. Pipeline Mode
  console.assert(result.mode === "route", `Expected mode 'route', got '${result.mode}'`);
  
  // 2. Waypoints Structure
  console.assert(result.waypoints !== undefined, "Waypoints should not be undefined");
  console.assert(result.waypoints!.length >= 3, `Expected at least 3 waypoints, got ${result.waypoints?.length}`);
  
  // 3. Exact Name Rejection
  const hasSilkRoadExactMatch = result.waypoints!.some(w => w.name.toLowerCase() === "silk road");
  console.assert(!hasSilkRoadExactMatch, "Waypoint exactly matches route name 'Silk Road', this should have been rejected by validation");
  
  // 4. Fallback Coordinate Rejection
  const hasNYCFallback = result.waypoints!.some(w => Math.abs(w.lat - 40.7128) < 0.01 && Math.abs(w.lng - -74.006) < 0.01);
  console.assert(!hasNYCFallback, "Waypoint resolves to NYC fallback, this should have been rejected by validation");
  
  // 5. Content Validation
  const allNames = result.waypoints!.map(w => w.name.toLowerCase());
  const containsCoreLocations = allNames.some(n => n.includes("xi'an") || n.includes("xian")) && 
                                allNames.some(n => n.includes("samarkand") || n.includes("constantinople") || n.includes("istanbul"));
                                
  console.assert(containsCoreLocations, "Route should contain core Silk Road locations");
  
  console.log("=== TEST PASSED: Route generated correctly without regressions ===");
}

testHistoricalRoutePipeline();
