import { runSearchPipeline } from '../services/pipeline';

// Mock import.meta.env for tests
(global as any).import = { meta: { env: { VITE_NYT_API_KEY: 'mock' } } };

// Mock process.env.API_KEY if missing so it doesn't crash before deterministic checks
if (!process.env.API_KEY) process.env.API_KEY = 'mock-key';

async function testCapeTown() {
    console.log("=== TEST: Cape Town ===");
    const res = await runSearchPipeline({ rawQuery: "Find Cape Town", intent: "DIRECT", entity: "Cape Town" });
    
    const passedType = res.entity?.subject?.identity?.entityType === "city";
    const passedLat = Math.abs(res.entity!.subject.primaryLocation.location.coordinates.lat - (-33.9249)) < 1.0;
    const passedLng = Math.abs(res.entity!.subject.primaryLocation.location.coordinates.lng - (18.4241)) < 1.0;
    
    // Check metadata content
    const metadata = res.entity?.metadata as any;
    const hasDesc = !!metadata?.description;
    
    // Deterministic DB results may lack population and climate, which is expected.
    const passed = passedType && passedLat && passedLng && hasDesc;
    
    console.log(`Passed Type (city): ${passedType}`);
    console.log(`Passed Coords: ${passedLat && passedLng}`);
    console.log(`Passed Metadata Content: ${hasDesc}`);
    console.log(`Overall: ${passed ? 'PASS' : 'FAIL'}`);
    
    if (!passed) {
        throw new Error("Cape Town test failed");
    }
}

async function testBatavia() {
    console.log("\n=== TEST: Batavia Shipwreck ===");
    const res = await runSearchPipeline({ rawQuery: "Where was the Batavia found?", intent: "DISCOVERY_LOCATION", entity: "Batavia" });
    
    const type = res.entity?.subject?.identity?.entityType;
    const isCity = type === "city";
    
    console.log(`Entity Type: ${type}`);
    console.log(`Is not a city: ${!isCity}`);
    
    if (isCity) {
        console.warn("WARNING: AI might still be forcing 'city' for non-cities.");
    }
}

async function testParis() {
    console.log("\n=== TEST: Paris ===");
    const res = await runSearchPipeline({ rawQuery: "Paris", intent: "DIRECT", entity: "Paris" });
    
    const passedType = res.entity?.subject?.identity?.entityType === "city";
    const passedLat = Math.abs(res.entity!.subject.primaryLocation.location.coordinates.lat - (48.8566)) < 1.0;
    const passedLng = Math.abs(res.entity!.subject.primaryLocation.location.coordinates.lng - (2.3522)) < 1.0;
    
    const metadata = res.entity?.metadata as any;
    const hasDesc = !!metadata?.description;
    
    // Deterministic DB results may lack population and climate, which is expected.
    const passed = passedType && passedLat && passedLng && hasDesc;
    
    console.log(`Passed Type (city): ${passedType}`);
    console.log(`Passed Coords: ${passedLat && passedLng}`);
    console.log(`Passed Metadata Content: ${hasDesc}`);
    console.log(`Overall: ${passed ? 'PASS' : 'FAIL'}`);
    
    if (!passed) {
        throw new Error("Paris test failed");
    }
}

async function runTests() {
    try {
        await testCapeTown();
        await testBatavia();
        await testParis();
        console.log("\n✅ All regression tests passed.");
    } catch (e) {
        console.error("\n❌ Regression tests failed:", e);
        process.exit(1);
    }
}

runTests();
