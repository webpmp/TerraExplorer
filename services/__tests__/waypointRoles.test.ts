import { generateRoute } from '../geminiService';

async function runTests() {
  console.log("Starting Waypoint Roles & Relationships Tests...\n");

  let allPassed = true;

  // Test 1: Historical event
  console.log("=== Testing: Where did the Battle of Midway take place? ===");
  const midwayRoute = await generateRoute("Where did the Battle of Midway take place?");
  
  const midwayPrimary = midwayRoute.find(w => w.role === 'primary');
  const midwayRelated = midwayRoute.filter(w => w.role === 'related');
  const midwayAdmin = midwayRoute.filter(w => w.role === 'administrative');

  let passed = false;
  if (!midwayPrimary || !midwayPrimary.name.includes("Midway")) {
      console.error("❌ Midway primary location missing or incorrect");
  } else if (!midwayRelated.some(w => w.name.includes("Pearl Harbor"))) {
      console.error("❌ Midway related location (Pearl Harbor) missing");
  } else if (!midwayAdmin.some(w => w.name.includes("Hawaii"))) {
      console.error("❌ Midway administrative location (Hawaii) missing");
  } else if (midwayRoute.some(w => w.name === "Hawaii" && w.role !== 'administrative')) {
      console.error("❌ Hawaii is present as a non-administrative waypoint");
  } else {
      console.log("✅ Battle of Midway test passed");
      passed = true;
  }
  if (!passed) allPassed = false;
  
  console.log("Waypoints Output:");
  console.log(midwayRoute.map(w => `[${w.role}] ${w.name} (parent: ${w.parentId})`).join('\n'));

  // Test 2: Broad exploration
  console.log("\n=== Testing: Where did the Viking Age take place? ===");
  const vikingRoute = await generateRoute("Where did the Viking Age take place?");
  
  const vikingPrimaries = vikingRoute.filter(w => w.role === 'primary' || !w.role);
  // We expect multiple primary locations for exploration
  if (vikingPrimaries.length < 3) {
      console.error("❌ Viking Age test failed: not enough primary locations for exploration intent");
      allPassed = false;
  } else {
      console.log(`✅ Viking Age test passed: Found ${vikingPrimaries.length} primary/related exploration sites`);
  }
  console.log("Waypoints Output:");
  console.log(vikingRoute.map(w => `[${w.role}] ${w.name}`).join('\n'));


  // Test 3: Specific place
  console.log("\n=== Testing: Where is Machu Picchu? ===");
  const machuRoute = await generateRoute("Where is Machu Picchu?");
  
  const machuPrimary = machuRoute.find(w => w.role === 'primary');
  const machuAdmin = machuRoute.filter(w => w.role === 'administrative');
  
  passed = false;
  if (!machuPrimary || !machuPrimary.name.includes("Machu Picchu")) {
      console.error("❌ Machu Picchu primary location missing");
  } else if (!machuAdmin.some(w => w.name.includes("Peru") || w.name.includes("Cusco"))) {
      console.error("❌ Machu Picchu administrative location missing");
  } else if (machuRoute.some(w => w.name === "Peru" && w.role !== 'administrative')) {
      console.error("❌ Peru is present as a non-administrative waypoint");
  } else {
      console.log("✅ Machu Picchu test passed");
      passed = true;
  }
  if (!passed) allPassed = false;

  console.log("Waypoints Output:");
  console.log(machuRoute.map(w => `[${w.role}] ${w.name} (parent: ${w.parentId})`).join('\n'));

  if (allPassed) {
      console.log("\n✅ ALL TESTS PASSED!");
  } else {
      console.error("\n❌ SOME TESTS FAILED.");
      process.exit(1);
  }
}

runTests().catch(console.error);
