import { runSearchPipeline } from './services/pipeline';

async function main() {
  const queries = ["Vienna", "Dead Sea", "Statue of Liberty", "Titanic", "Paris", "Christopher Columbus"];
  
  for (const q of queries) {
      console.log(`\n\n=== Testing: ${q} ===`);
      try {
          const res = await runSearchPipeline({ rawQuery: `Find ${q}`, intent: 'DIRECT', entity: q });
          console.log(`Success: ${res.isValid}`);
          if (res.entity) {
             console.log(`Coordinates:`, res.entity.subject.primaryLocation.location.coordinates);
             console.log(`Metadata keys:`, Object.keys(res.entity.metadata));
          } else {
             console.log(`Error: ${res.error}`);
          }
      } catch (e: any) {
          console.error(`Exception: ${e.message}`);
      }
  }
}

main().catch(console.error);
