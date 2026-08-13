import { resolveWithContext } from '../geographic/geographicResolver';
import { calculateDistanceKm } from '../geographic/geographicDistance';
import { getScanRadiusKm } from '../geminiService';
async function runTests() {
    let passed = true;
    console.log('--- Globe Click Scan Contextual Accuracy Tests ---');
    // Test 1: Contextual resolution succeeds
    try {
        const geoResult = await resolveWithContext("Teribe River", { country: "Panama" });
        if (geoResult.resolution && geoResult.resolution.coordinates) {
            console.log('✅ Test 1: Contextual resolution succeeds');
        }
        else {
            console.error(`❌ Test 1 failed. Expected resolved coordinates, got null`);
            passed = false;
        }
    }
    catch (err) {
        console.error('❌ Test 1 threw an error:', err);
        passed = false;
    }
    // Test 2: Context prevents hallucination (Distance rejection)
    try {
        // Clicked Panama border region
        const clickedLat = 9.227;
        const clickedLng = -82.684;
        // Candidate Miami
        const geoResult = await resolveWithContext("Miami", { country: "Panama" });
        // Either it fails to resolve Miami in Panama (good) or it resolves actual Miami and we distance reject it
        let rejectedByDistance = false;
        if (geoResult.resolution && geoResult.resolution.coordinates) {
            const dist = calculateDistanceKm(clickedLat, clickedLng, geoResult.resolution.coordinates.lat, geoResult.resolution.coordinates.lng);
            if (dist > getScanRadiusKm('major_city')) {
                rejectedByDistance = true;
            }
        }
        else {
            // Rejected by contextual resolution not finding Miami in Panama
            rejectedByDistance = true;
        }
        if (rejectedByDistance) {
            console.log('✅ Test 2: Context prevents hallucination / Distance validation rejects');
        }
        else {
            console.error('❌ Test 2 failed. Miami was accepted.');
            passed = false;
        }
    }
    catch (err) {
        console.error('❌ Test 2 threw an error:', err);
        passed = false;
    }
    // Test 3: Nearby feature accepted
    try {
        // Clicked Panama border region
        const clickedLat = 9.227;
        const clickedLng = -82.684;
        const geoResult = await resolveWithContext("Teribe River", { country: "Panama" });
        if (geoResult.resolution && geoResult.resolution.coordinates) {
            const dist = calculateDistanceKm(clickedLat, clickedLng, geoResult.resolution.coordinates.lat, geoResult.resolution.coordinates.lng);
            if (dist <= getScanRadiusKm('river')) {
                console.log('✅ Test 3: Nearby feature accepted');
            }
            else {
                console.error(`❌ Test 3 failed. Teribe River distance too far: ${dist}`);
                passed = false;
            }
        }
        else {
            console.error(`❌ Test 3 failed. Could not resolve Teribe River`);
            passed = false;
        }
    }
    catch (err) {
        console.error('❌ Test 3 threw an error:', err);
        passed = false;
    }
    // Test 4: Missing context fallback
    try {
        const geoResult = await resolveWithContext("AtlantisUnknownPlace123", {});
        if (!geoResult.resolution) {
            console.log('✅ Test 4: Missing context fallback works (returns null for unknown)');
        }
        else {
            console.error('❌ Test 4 failed. Expected null for unknown place without context');
            passed = false;
        }
    }
    catch (err) {
        console.error('❌ Test 4 threw an error:', err);
        passed = false;
    }
    if (!passed) {
        console.error('\n❌ Some tests failed.');
        process.exit(1);
    }
    else {
        console.log('\n✅ All Globe Click Scan Contextual tests passed.');
        process.exit(0);
    }
}
runTests();
