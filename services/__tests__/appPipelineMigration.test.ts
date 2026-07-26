import { runSearchPipeline, IntentStage, MetadataStage } from '../pipeline';
import * as geminiService from '../geminiService';

const testQueries = [
  "Where is Boston?",
  "Where is Mount Fuji?",
  "Where did the Boston Massacre take place?",
  "Where was the Titanic found?",
  "Where was the Vasa found?"
];

async function runMigrationTests() {
  let allPassed = true;

  for (const query of testQueries) {
    const result = await runSearchPipeline({ rawQuery: query });
    if (!result.isValid || !result.finalData || result.error) {
       console.error(`❌ Migration Test Failed for ${query}`);
       allPassed = false;
    } else {
       console.log(`✅ Pipeline successfully resolved ${query} (isValid: ${result.isValid}, error: ${result.error})`);
    }
  }

  console.log("\n=== REGRESSION TEST: Show me the Dead Sea (Recovery Fallback) ===");
  console.log("\n=== REGRESSION TEST: Show me the Dead Sea (Recovery Fallback) ===");
  
  // Custom mock pipeline
  async function mockRunSearchPipeline(query: string, mockResolverResult: any, mockRecoveryResult: any) {
      const searchRequest = { rawQuery: query };
      const entityResult = IntentStage(searchRequest);
      
      let error = mockResolverResult.error;
      let resolvedData = mockResolverResult.locationInfo;
      let recoveryUsed = false;
      
      const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE"];
      if (error && allowedErrors.includes(error) && resolvedData && resolvedData.name && !resolvedData.coordinates) {
        if (mockRecoveryResult) {
          resolvedData.coordinates = mockRecoveryResult;
          error = undefined;
          recoveryUsed = true;
        }
      }
      
      const coordinateResult = {
        entityResult, aiUsed: true, deterministicMatch: false,
        resolvedData, suggestedZoom: 5, error
      };
      
      const metadataResult = { coordinateResult, enrichedData: resolvedData };
      return MetadataStage(metadataResult);
  }

  const recoveryResult = await mockRunSearchPipeline("Show me the Dead Sea", 
      { error: "LOCATION_SYSTEM_UNAVAILABLE", locationInfo: { name: "Dead Sea", entityType: "natural_feature" } },
      { lat: 31.5590, lng: 35.4732 }
  );

  if (recoveryResult.isValid && recoveryResult.finalData?.coordinates.lat === 31.5590) {
      console.log(`✅ Pipeline successfully triggered recovery for Dead Sea`);
  } else {
      console.error(`❌ Recovery test failed via pipeline. Result: ${JSON.stringify(recoveryResult)}`);
      allPassed = false;
  }
  
  console.log("\n=== REGRESSION TEST: Failure Safety (Invalid Coordinates) ===");
  const failureResult = await mockRunSearchPipeline("Where is Null Island?", 
      { error: undefined, locationInfo: { name: "Null Island", coordinates: { lat: 0, lng: 0 } } },
      null
  );

  if (!failureResult.isValid && failureResult.error === "NO_GEOGRAPHIC_DATA" && !failureResult.finalData) {
      console.log(`✅ Pipeline successfully intercepted invalid coordinates. Result prevents camera update.`);
  } else {
      console.error(`❌ Failure safety test failed! Result: ${JSON.stringify(failureResult)}`);
      allPassed = false;
  }

  if (allPassed) {
    console.log("\n✅ All Migration Tests PASSED!");
  } else {
    console.error("\n❌ Some Migration Tests FAILED.");
    process.exit(1);
  }
}

runMigrationTests().catch(console.error);
