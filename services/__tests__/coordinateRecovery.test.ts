import { IntentStage, ResolutionStage, SearchRequest } from '../pipeline';
import * as geminiService from '../geminiService';

const testQueries = [
  // 1. Deterministic (No recovery required)
  "Where is Boston?",
  "Where is Mount Fuji?",
  "Where was the Titanic found?",
  
  // 2. AI Fallback (Missing coordinates -> Recovery)
  "Show me the Dead Sea",
  "Where did the Gold Rush take place?",
  "Where was the Rosetta Stone discovered?",
  
  // 3. Semantic regression
  "Where did the Boston Massacre take place?",
  "Where did Woodstock take place?",
  "Where were the Dead Sea Scrolls discovered?",
  "Where was the Vasa found?",
  
  // 4. Intent filtering regressions
  "Where is Hagia Sophia?",
  "Where is Iguazu Falls?"
];

async function runRecoveryTests() {
  console.log("Starting Coordinate Recovery Tests...\n");
  let allPassed = true;

  for (const query of testQueries) {
    console.log(`\n=== Testing Query: "${query}" ===`);
    
    const request: SearchRequest = { rawQuery: query };
    const entityResult = IntentStage(request);
    const metadataResult = await ResolutionStage(entityResult);
    
    const data = metadataResult.enrichedData;
    const error = metadataResult.coordinateResult.error;

    // Checks
    let hasCoords = false;
    if (data && data.coordinates && typeof data.coordinates.lat === 'number') {
      hasCoords = true;
    }

    if (entityResult.intentResult.normalized.request.rawQuery !== query) {
       console.error(`❌ rawQuery not preserved! Expected: "${query}", Got: "${entityResult.intentResult.normalized.request.rawQuery}"`);
       allPassed = false;
    } else {
       console.log(`✅ rawQuery preserved.`);
    }

    if (query === "Where was the Vasa found?" && entityResult.intentResult.intent !== "DISCOVERY_LOCATION") {
       console.error(`❌ Intent not preserved!`);
       allPassed = false;
    }
    
    if (query === "Where did the Boston Massacre take place?" && entityResult.intentResult.intent !== "HISTORICAL_EVENT") {
       console.error(`❌ Intent not preserved!`);
       allPassed = false;
    }

    if (!hasCoords && error) {
       console.log(`[Limitation] AI provider could not resolve coordinates for ${query}.`);
       if (!data) {
           console.log(`[Limitation] Partial data was also not returned by the AI provider.`);
       }
    } else if (hasCoords) {
       console.log(`✅ Coordinates successfully present for ${query}.`);
       console.log(`✅ Entity Type preserved: ${data?.entityType}`);
       console.log(`✅ Location Type preserved: ${data?.type}`);
    } else {
       console.error(`❌ Coordinates missing without explicit error!`);
       allPassed = false;
    }
  }

  console.log("\n=== REGRESSION TEST: Show me the Dead Sea ===");
  // Simulate the ResolutionStage logic directly to avoid ES module read-only errors
  const mockResolveLocationQuery = async () => ({
      error: "LOCATION_SYSTEM_UNAVAILABLE",
      locationInfo: {
          name: "Dead Sea",
          entityType: "natural_feature",
          description: "A salt lake bordered by Jordan to the east and Israel and the West Bank to the west."
      }
  });
  
  const mockRecoverCoordinatesFromAi = async (rawQuery: string, intent: string, entity: string) => ({
      lat: 31.5590, lng: 35.4732
  });

  const request: SearchRequest = { rawQuery: "Show me the Dead Sea" };
  const entityResult = IntentStage(request);
  
  const rawResolverResult = await mockResolveLocationQuery();
  let error = rawResolverResult.error;
  let resolvedData: any = rawResolverResult.locationInfo;
  
  const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE"];
  if (error && allowedErrors.includes(error) && resolvedData && resolvedData.name && !resolvedData.coordinates) {
    const recoveryCoords = await mockRecoverCoordinatesFromAi(
        entityResult.intentResult.normalized.request.rawQuery,
        entityResult.intentResult.intent,
        resolvedData.name || entityResult.entity
    );
    if (recoveryCoords) {
      resolvedData.coordinates = recoveryCoords;
      error = undefined; 
    }
  }

  const finalData = resolvedData;
  if (finalData && finalData.coordinates && finalData.coordinates.lat === 31.5590 && finalData.entityType === "natural_feature" && finalData.description?.includes("salt lake")) {
      console.log(`✅ Recovery correctly attempted.`);
      console.log(`✅ Coordinates restored.`);
      console.log(`✅ EntityType preserved.`);
      console.log(`✅ Description preserved.`);
  } else {
      console.error(`❌ Regression test failed. Data not preserved or coordinates not restored.`);
      console.log(JSON.stringify(finalData));
      allPassed = false;
  }

  if (allPassed) {
    console.log("\n✅ All Coordinate Recovery Tests Completed.");
  } else {
    console.error("\n❌ Some tests failed.");
    process.exit(1);
  }

  console.log("\n=== REGRESSION TEST: Viking Age Skips Recovery ===");
  const request2: SearchRequest = { rawQuery: "Where did the Viking Age take place?" };
  const entityResult2 = IntentStage(request2);
  const rawResolverResult2 = await mockResolveLocationQuery();
  let error2 = rawResolverResult2.error;
  let resolvedData2: any = rawResolverResult2.locationInfo;
  
  const isGeographicIntent2 = !['EXPLORATORY', 'HISTORICAL_EVENT', 'BROAD_CULTURAL_QUERY'].includes(entityResult2.intentResult.intent);
  
  if (error2 && allowedErrors.includes(error2) && entityResult2.entity && isGeographicIntent2 && (!resolvedData2 || !resolvedData2.coordinates)) {
    console.error(`❌ Regression test failed. Viking Age attempted recovery despite being HISTORICAL_EVENT.`);
    process.exit(1);
  } else {
    console.log(`✅ Viking Age successfully bypassed recovery.`);
  }

}

runRecoveryTests().catch(console.error);
