import { routeIntentAndExtractEntity } from '../geminiService';

function testIntentClassification() {
  console.log("Running Intent Classification Regression Tests...\n");

  const testCases = [
    // Historical Event Queries
    { query: "Where did the eruption of Vesuvius take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "eruption of Vesuvius", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did the Boston Massacre take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Boston Massacre", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did Woodstock take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Woodstock", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did the Viking Age take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Viking Age", expectedMode: "MULTI_LOCATION_EXPLORATION" },

    // Geographic Queries
    { query: "Where is Boston?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Boston", expectedMode: undefined },
    { query: "Where is Amsterdam?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Amsterdam", expectedMode: undefined },
    { query: "Where is Mount Fuji?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Mount Fuji", expectedMode: undefined }
  ];

  for (const tc of testCases) {
    const res = routeIntentAndExtractEntity(tc.query);
    console.log(`Query: "${tc.query}" -> Intent: ${res.intent}, Entity: "${res.entity}", Mode: ${res.resolutionMode}`);
    console.assert(res.intent === tc.expectedIntent, `FAILED: ${tc.query} expected intent ${tc.expectedIntent}, got ${res.intent}`);
    console.assert(res.entity.toLowerCase() === tc.expectedEntity.toLowerCase(), `FAILED: ${tc.query} expected entity ${tc.expectedEntity}, got ${res.entity}`);
    console.assert(res.resolutionMode === tc.expectedMode, `FAILED: ${tc.query} expected mode ${tc.expectedMode}, got ${res.resolutionMode}`);
  }

  console.log("\nAll Intent Classification Regression Tests PASSED successfully!");
}

testIntentClassification();
