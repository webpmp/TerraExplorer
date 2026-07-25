import { routeIntentAndExtractEntity } from '../geminiService';

function testDiscoveryIntentExtraction() {
  console.log("Running Discovery Intent Extraction Regression Tests...\n");

  const testCases = [
    { query: "Where was the Titanic found?", expectedIntent: "DISCOVERY_LOCATION", expectedEntity: "Titanic" },
    { query: "Where was the Vasa found?", expectedIntent: "DISCOVERY_LOCATION", expectedEntity: "Vasa" },
    { query: "Where was the Rosetta Stone discovered?", expectedIntent: "DISCOVERY_LOCATION", expectedEntity: "Rosetta Stone" },
    { query: "Where were the Dead Sea Scrolls discovered?", expectedIntent: "DISCOVERY_LOCATION", expectedEntity: "Dead Sea Scrolls" },
    
    // Real location names with discovery words that should stay NATURAL_LOCATION
    { query: "Where is the Discovery Museum?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Discovery Museum" },
    { query: "Where is the Recovery Monument?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Recovery Monument" }
  ];

  for (const tc of testCases) {
    const res = routeIntentAndExtractEntity(tc.query);
    console.log(`Query: "${tc.query}" -> Intent: ${res.intent}, Entity: "${res.entity}"`);
    console.assert(res.intent === tc.expectedIntent, `FAILED: ${tc.query} expected intent ${tc.expectedIntent}, got ${res.intent}`);
    console.assert(res.entity.toLowerCase() === tc.expectedEntity.toLowerCase(), `FAILED: ${tc.query} expected entity ${tc.expectedEntity}, got ${res.entity}`);
  }

  console.log("\nAll Discovery Intent Extraction Regression Tests PASSED successfully!");
}

testDiscoveryIntentExtraction();
