import { routeIntentAndExtractEntity, resolveLocationQuery } from '../geminiService';

async function runSemanticEntityRegressionTests() {
  console.log("Running Semantic Entity Resolution Architecture Tests...\n");

  const testCases = [
    // Historical Events
    {
      query: "Where did the Boston Massacre take place?",
      expectedEntityType: "historical_event_site",
      expectPopulationNull: true,
      expectClimateNull: true
    },
    {
      query: "Where did Woodstock take place?",
      expectedEntityType: "festival_site",
      expectPopulationNull: true,
      expectClimateNull: true
    },

    // Discovery
    {
      query: "Where was the Vasa found?",
      expectedEntityType: "shipwreck_site",
      forbiddenName: "Vasa Museum",
      expectPopulationNull: true,
      expectClimateNull: true
    },
    {
      query: "Where was the Titanic found?",
      expectedEntityType: "shipwreck_site",
      expectPopulationNull: true,
      expectClimateNull: true
    },
    {
      query: "Where were the Dead Sea Scrolls discovered?",
      expectedEntityType: "archaeological_site",
      expectPopulationNull: true,
      expectClimateNull: true
    },
    {
      query: "Where was the Rosetta Stone discovered?",
      expectedEntityType: "discovery_site",
      expectPopulationNull: true,
      expectClimateNull: true
    },

    // Natural Feature
    {
      query: "Where is Mount Fuji?",
      expectedEntityType: "mountain",
      expectPopulationNull: true,
      expectClimateNull: false
    }
  ];

  for (const tc of testCases) {
    const routed = routeIntentAndExtractEntity(tc.query);
    const result = await resolveLocationQuery(routed.entity, routed.intent);

    console.log(`Query: "${tc.query}"`);
    console.log(`  Intent: ${routed.intent}`);
    console.log(`  Extracted Entity: "${routed.entity}"`);

    if (!result || !result.locationInfo) {
      console.error(`  FAILED: No location info returned for "${tc.query}"`);
      continue;
    }

    const info = result.locationInfo;
    console.log(`  Resolved Name: "${info.name}"`);
    console.log(`  LocationType (UI): "${info.type}"`);
    console.log(`  EntityType (Semantic): "${info.entityType}"`);
    console.log(`  Population: ${info.population}`);
    console.log(`  Climate: ${info.climate}`);

    // Assertions
    if (tc.expectedEntityType) {
      console.assert(
        info.entityType === tc.expectedEntityType,
        `FAILED: Expected entityType ${tc.expectedEntityType}, got ${info.entityType}`
      );
    }

    if (tc.forbiddenName) {
      console.assert(
        !info.name.includes(tc.forbiddenName),
        `FAILED: Resolved name "${info.name}" should NOT include "${tc.forbiddenName}"`
      );
    }

    if (tc.expectPopulationNull) {
      console.assert(
        info.population === null || info.population === undefined,
        `FAILED: Population should be null for "${tc.query}", got ${info.population}`
      );
    }

    if (tc.expectClimateNull) {
      console.assert(
        info.climate === null || info.climate === undefined,
        `FAILED: Climate should be null for "${tc.query}", got ${info.climate}`
      );
    } else {
      console.assert(
        info.climate !== null && info.climate !== undefined,
        `FAILED: Climate should exist for "${tc.query}", got null/undefined`
      );
    }

    console.log("  -> PASSED\n");
  }

  console.log("All Semantic Entity Resolution Architecture Tests Completed!");
}

runSemanticEntityRegressionTests();
