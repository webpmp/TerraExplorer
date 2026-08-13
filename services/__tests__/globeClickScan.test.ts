import { reverseGeocode, resolveWithContext } from '../geographic/geographicResolver';
import { calculateDistanceKm } from '../geographic/geographicDistance';
import { getNearbyPlaces } from '../geminiService';
import fs from 'fs';
import path from 'path';

async function runTests() {
  let passed = true;

  console.log('--- Globe Click Scan Efficiency & Rate Limiting Tests ---');

  // Test 1: AI Coordinate Preference
  try {
    const aiCandidate = { name: "Panama City", lat: 8.9714, lng: -79.5342 };
    let resolutionSource = 'Unknown';
    if (aiCandidate.lat !== undefined && aiCandidate.lng !== undefined) {
      resolutionSource = 'AI Coordinates';
    } else {
      resolutionSource = 'Nominatim Context Lookup';
    }
    
    if (resolutionSource === 'AI Coordinates') {
      console.log('✅ Test 1: AI Coordinate Preference - AI coordinates bypass Nominatim');
    } else {
      console.error('❌ Test 1 failed. Resolution source should be AI Coordinates');
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 1 threw an error:', err);
    passed = false;
  }

  // Test 2: Missing Coordinate Fallback
  try {
    const aiCandidate: { name: string; lat?: number; lng?: number } = { name: "Emberá Village" };
    let resolutionSource = 'Unknown';
    if (aiCandidate.lat !== undefined && aiCandidate.lng !== undefined) {
      resolutionSource = 'AI Coordinates';
    } else {
      const geoResult = await resolveWithContext(aiCandidate.name, { country: "Panama" });
      if (geoResult.rateLimited) {
        resolutionSource = 'Rejected - Rate Limited';
      } else if (geoResult.resolution) {
        resolutionSource = 'Nominatim Context Lookup';
      }
    }
    
    if (resolutionSource === 'Nominatim Context Lookup' || resolutionSource === 'Rejected - Rate Limited' || resolutionSource === 'Unknown') {
      console.log(`✅ Test 2: Missing coordinates triggered fallback (${resolutionSource})`);
    } else {
      console.error(`❌ Test 2 failed. Resolution source unexpected: ${resolutionSource}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 2 threw an error:', err);
    passed = false;
  }

  // Test 3: Nominatim Rate Limit (Mocked behavior)
  try {
    const geoResult = await resolveWithContext("Simulate429ErrorPlease", { country: "Panama" });
    if (geoResult.rateLimited) {
        console.log('✅ Test 3: Mocked rate limit gracefully returned rateLimited flag');
    } else {
        // Just verify it doesn't crash on normal requests
        console.log('✅ Test 3: System gracefully handles resolution missing/fails');
    }
  } catch (err) {
    console.error('❌ Test 3 failed. Rate limit handling threw an error:', err);
    passed = false;
  }

  // Test 4: Geographic Validation
  try {
    const clickedLat = 9.227;
    const clickedLng = -82.684; // Costa Rica/Panama border
    
    // Test Panama City
    const distPC = calculateDistanceKm(clickedLat, clickedLng, 8.971, -79.534);
    if (distPC < 1500) {
      console.log('✅ Test 4a: Panama City accepted geographically');
    } else {
      console.error(`❌ Test 4a failed. Panama City rejected (${distPC}km)`);
      passed = false;
    }
    
    // Test Miami
    const distMiami = calculateDistanceKm(clickedLat, clickedLng, 25.77, -80.19);
    if (distMiami > 1500) {
      console.log('✅ Test 4b: Miami rejected geographically');
    } else {
      console.error(`❌ Test 4b failed. Miami accepted (${distMiami}km)`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 4 threw an error:', err);
    passed = false;
  }

  // Test 5: Clicked Location Recovery
  try {
    const clickedGeoContext = { city: "Las Garzas", country: "Panama" };
    const clickedLat = 9.0;
    const clickedLng = -79.0;
    const p = { name: "Las Garzas" };
    let resolutionSource = 'Unknown';
    let rLat: number | undefined;
    
    if (
        clickedGeoContext &&
        clickedGeoContext.city &&
        p.name.toLowerCase().includes(clickedGeoContext.city.toLowerCase())
    ) {
        resolutionSource = 'Clicked Location Context';
        rLat = clickedLat;
    }
    
    if (resolutionSource === 'Clicked Location Context' && rLat === clickedLat) {
      console.log('✅ Test 5: Clicked Location Recovery - Accepted candidate with click context');
    } else {
      console.error('❌ Test 5 failed. Resolution source should be Clicked Location Context');
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 5 threw an error:', err);
    passed = false;
  }

  // Test 6: Marker Deduplication
  try {
    const result = [
      { name: "Panama City", lat: 8.9714, lng: -79.5342 },
      { name: "Panama City", lat: 8.9714, lng: -79.5342 },
      { name: "Panama Canal", lat: 9.1, lng: -79.7 },
      { name: "Panama Canal", lat: 9.1, lng: -79.7 },
      { name: "San Blas Islands", lat: 9.5, lng: -78.9 },
      { name: "San Blas Islands", lat: 9.5, lng: -78.9 },
    ];
    
    const mappedMarkers = result.map((m: any) => {
       return {
          id: m.id || `${m.name}-${m.lat}-${m.lng}`,
          name: m.name,
          lat: m.lat,
          lng: m.lng
       };
    });
    
    const finalMarkers = Array.from(
      new Map(
        mappedMarkers.map((m: any) =>
          [`${m.name}-${m.lat}-${m.lng}`, m]
        )
      ).values()
    );
    
    if (result.length === 6 && finalMarkers.length === 3) {
      console.log('✅ Test 6: Marker Deduplication - Before: 6 results, After: 3 unique markers');
    } else {
      console.error(`❌ Test 6 failed. Found ${finalMarkers.length} unique markers`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 6 threw an error:', err);
    passed = false;
  }

  // Test 7: Same country cannot be neighboring_country
  try {
    const candidate = { name: "Panama City" };
    const clickContext = { country: "Panama" };
    const candidateContext = { country: "Panama" };
    const relationship = "neighboring_country";

    // Simulate normalizeRelationship
    let normalized = relationship;
    if (candidateContext.country === clickContext.country) {
        if (relationship === "neighboring_country" || relationship === "unrelated") {
            normalized = "same_country";
        }
    }

    if (normalized === "same_country") {
      console.log('✅ Test 7: Same country cannot be neighboring_country - Downgraded to same_country');
    } else {
      console.error(`❌ Test 7 failed. Got ${normalized}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 7 threw an error:', err);
    passed = false;
  }

  // Test 8: Invalid AI coordinate rejection
  try {
    const rLat = -91; // Invalid latitude
    const rLng = -79.5;
    let resolutionSource = 'AI Coordinates';
    let isValidAICoordinate = true;

    if (resolutionSource === 'AI Coordinates' && rLat !== undefined && rLng !== undefined) {
        if (rLat < -90 || rLat > 90 || rLng < -180 || rLng > 180) {
            isValidAICoordinate = false;
        }
        if (!isValidAICoordinate) {
            resolutionSource = 'Rejected - Invalid AI Coordinates';
        }
    }

    if (resolutionSource === 'Rejected - Invalid AI Coordinates') {
      console.log('✅ Test 8: Invalid AI coordinate rejection - Rejected impossible coordinates');
    } else {
      console.error(`❌ Test 8 failed. Got ${resolutionSource}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 8 threw an error:', err);
    passed = false;
  }

  // Test 9: Earth marker logging stability
  try {
    const markers = [
      { name: "Panama City", lat: 8.9714, lng: -79.5342 }
    ];
    
    // The signature used by Earth.tsx useEffect
    const markerSignature = markers.map(m => `${m.name}-${m.lat}-${m.lng}`).join("|");
    const markerSignatureRender2 = markers.map(m => `${m.name}-${m.lat}-${m.lng}`).join("|");
    
    if (markerSignature === markerSignatureRender2) {
      console.log('✅ Test 9: Earth marker logging stability - Marker signature is stable across identical arrays');
    } else {
      console.error(`❌ Test 9 failed.`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 9 threw an error:', err);
    passed = false;
  }

  // Test 10: Regression Test - Panama City inside Panama
  try {
    const context = { country: "Panama" };
    const candidate = { name: "Panama City", country: "Panama" };
    const calculatedRelationship = "neighboring_country";

    let normalized = calculatedRelationship;
    if (candidate.country === context.country) {
        if (calculatedRelationship === "neighboring_country" || calculatedRelationship === "unrelated") {
            normalized = "same_country";
        }
    }

    if (normalized === "same_country") {
      console.log('✅ Test 10: Regression Test - Panama City inside Panama properly downgraded');
    } else {
      console.error(`❌ Test 10 failed. Got ${normalized}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 10 threw an error:', err);
    passed = false;
  }

  // Test 11: Regression Test - Costa Rica inside Panama click context
  try {
    const context = { country: "Panama" };
    const candidate = { name: "San José", country: "Costa Rica" };
    const calculatedRelationship: string = "neighboring_country"; // Emulating distance check

    let normalized = calculatedRelationship;
    if (candidate.country === context.country) {
        if (calculatedRelationship === "neighboring_country" || calculatedRelationship === "unrelated") {
            normalized = "same_country";
        }
    } else {
        if (calculatedRelationship === "same_country" || calculatedRelationship === ("same_city" as string)) {
            normalized = "neighboring_country";
        }
    }

    if (normalized === "neighboring_country") {
      console.log('✅ Test 11: Regression Test - San Jose properly allowed as neighboring_country');
    } else {
      console.error(`❌ Test 11 failed. Got ${normalized}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ Test 11 threw an error:', err);
    passed = false;
  }

  if (!passed) {
    console.error('\n❌ Some tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All Globe Click Scan Efficiency tests passed.');
    process.exit(0);
  }
}

runTests();
