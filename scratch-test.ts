import { getNearbyPlaces } from './services/geminiService';

async function run() {
  const res = await getNearbyPlaces(48.8566, 2.3522); // Paris
  console.log("Found:", res.places.length);
  console.log(JSON.stringify(res.places, null, 2));
}

run().catch(console.error);
