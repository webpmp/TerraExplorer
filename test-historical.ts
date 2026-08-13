import { runSearchPipeline } from './services/pipeline.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
}

async function run() {
  const queries = [
    "Where did the Viking Age take place?",
    "Roman Empire at its height",
    "Battle of Gettysburg",
    "Ancient Athens",
    "Machu Picchu"
  ];

  for (const query of queries) {
    console.log(`\n\n=== TESTING: ${query} ===\n`);
    try {
      const result = await runSearchPipeline({ rawQuery: query });
      if (!result.error && result.entity) {
         const { population, climate, notable } = result.entity.metadata;
         console.log("Population:", JSON.stringify(population, null, 2));
         console.log("Climate:", JSON.stringify(climate, null, 2));
         console.log("Related Entities:", JSON.stringify(notable, null, 2));
         
         // Assertions
         const locInfo = result.entity as any;
         
         // Generic Structural Assertions
         if (locInfo.population) {
           assert(typeof locInfo.population === "object", "Population should be structured object");
         }
         
         if (locInfo.climate) {
           assert(typeof locInfo.climate === "object", "Climate should be a structured object");
           assert(locInfo.climate?.name !== undefined, "Climate should have plain language name");
           assert(!locInfo.climate?.name?.startsWith("Cfb") && !locInfo.climate?.name?.startsWith("Dfb"), "Climate should not expose Köppen code as primary name");
         }
         
         if (locInfo.notable && locInfo.notable.length > 0) {
           assert(locInfo.notable[0].type !== undefined, "Related entity must have a type");
           assert(locInfo.notable[0].name !== undefined, "Related entity must have a name");
           assert(locInfo.notable[0].name.length >= 2, "Related entity name must be >= 2 chars");
         }

         // Specific Acceptance Criteria
         if (query === "Where did the Viking Age take place?") {
           assert(locInfo.population?.historical !== undefined, "Viking Age should have historical population");
           assert(locInfo.notable?.some(e => e.type === "group" || e.type === "institution" || e.type === "place"), "Viking Age should have groups/institutions/places");
         } else if (query === "Roman Empire at its height") {
           assert(locInfo.population?.historical !== undefined, "Roman Empire should have historical population");
           assert(locInfo.population?.current === undefined, "Roman Empire should not have current population");
         } else if (query === "Ancient Athens") {
           assert(locInfo.population?.historical !== undefined, "Ancient Athens should have historical population");
           const genericTerms = ["History", "Europe", "Ancient world"];
           const hasGeneric = locInfo.notable?.some(e => genericTerms.includes(e.name));
           assert(!hasGeneric, "Ancient Athens should not have generic entities");
         } else if (query === "Battle of Gettysburg") {
           assert(locInfo.population?.current !== undefined, "Gettysburg Battlefield should have modern population context");
           assert(locInfo.notable?.some(e => e.type === "event" || e.type === "person" || e.type === "group"), "Gettysburg should have event/military context");
         }

      } else {
         console.log("Pipeline failed:", result.error);
      }
    } catch (e) {
      console.error("Error:", e);
    }
  }
}
run();
