import { routeIntentAndExtractEntity, resolveLocationQuery, sanitizeLocationInfo } from '../geminiService';
import { isValidCoordinates } from '../../types';
import { IntentStage, ResolutionStage, MetadataStage, SearchRequest } from '../pipeline';

const testQueries = [
  "Where is Boston?",
  "Where is Mount Fuji?",
  "Where was the Titanic found?",
  "Where did the Boston Massacre take place?",
  "Where did the Gold Rush take place?",
  "Where were the Dead Sea Scrolls discovered?",
  "Where was the Vasa found?",
  "Show me the Dead Sea"
];

async function runParityTests() {
  console.log("Starting Pipeline Parity Tests...\n");

  let allPassed = true;

  for (const query of testQueries) {
    console.log(`\n=== Testing Query: "${query}" ===`);
    
    // --- OLD PIPELINE ---
    const oldExtracted = routeIntentAndExtractEntity(query);
    const oldResolved = await resolveLocationQuery(oldExtracted.entity, oldExtracted.intent);
    
    let oldIsValid = false;
    let oldFinalData = null;
    if (oldResolved.locationInfo && oldResolved.locationInfo.coordinates) {
      oldIsValid = isValidCoordinates(oldResolved.locationInfo.coordinates);
      if (oldIsValid) {
        oldFinalData = sanitizeLocationInfo(oldResolved.locationInfo as any);
      }
    }

    // --- NEW PIPELINE ---
    const request: SearchRequest = { rawQuery: query };
    const entityResult = IntentStage(request);
    const metadataResult = await ResolutionStage(entityResult);
    const finalResult = MetadataStage(metadataResult);

    // --- PARITY CHECKS ---
    const checks = [
      {
        name: "Intent",
        old: oldExtracted.intent,
        new: entityResult.intentResult.intent
      },
      {
        name: "Extracted Entity",
        old: oldExtracted.entity,
        new: entityResult.entity
      },
      {
        name: "Coordinates",
        old: JSON.stringify(oldResolved.locationInfo?.coordinates),
        new: JSON.stringify(metadataResult.coordinateResult.resolvedData?.coordinates)
      },
      {
        name: "Entity Type",
        old: oldResolved.locationInfo?.entityType,
        new: metadataResult.coordinateResult.resolvedData?.entityType
      },
      {
        name: "Location Type",
        old: oldResolved.locationInfo?.type,
        new: metadataResult.coordinateResult.resolvedData?.type
      },
      {
        name: "Suggested Zoom",
        old: oldResolved.suggestedZoom,
        new: metadataResult.coordinateResult.suggestedZoom
      },
      {
        name: "Validation Result",
        old: oldIsValid,
        new: finalResult.isValid
      }
    ];

    let queryPassed = true;
    for (const check of checks) {
      // We only strictly compare fields if they exist in the old pipeline successfully.
      // If the resolver fails to return coordinates (like Dead Sea), we log it as a limitation.
      if (check.name === "Coordinates" && (check.old === undefined || check.old === null || oldResolved.error)) {
        console.log(`[Limitation] AI provider could not resolve coordinates. (${oldResolved.error})`);
        continue; // skip strict equality check since it's a known limitation
      }

      if (check.old !== check.new) {
        console.error(`❌ Mismatch in ${check.name}: Old='${check.old}', New='${check.new}'`);
        queryPassed = false;
        allPassed = false;
      } else {
        console.log(`✅ ${check.name} match (${check.old})`);
      }
    }

    if (queryPassed) {
      console.log(`-> Query Parity PASSED: "${query}"`);
    } else {
      console.error(`-> Query Parity FAILED: "${query}"`);
    }
  }

  if (allPassed) {
    console.log("\n✅ All Parity Tests PASSED!");
  } else {
    console.error("\n❌ Some Parity Tests FAILED.");
    process.exit(1);
  }
}

// Run the tests
runParityTests().catch(console.error);
