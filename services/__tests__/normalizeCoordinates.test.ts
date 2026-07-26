import { normalizeCoordinates } from '../geminiService';

console.log('=== Testing normalizeCoordinates ===');

let passed = 0;
let failed = 0;

function runTest(name: string, input: any, expected: any) {
  const result = normalizeCoordinates(input);
  const resultStr = JSON.stringify(result);
  const expectedStr = JSON.stringify(expected);
  if (resultStr === expectedStr) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Got:      ${resultStr}`);
    failed++;
  }
}

const expected = { lat: 39.9042, lng: 32.8736 };

runTest('Format A: { lat, lng }', { lat: 39.9042, lng: 32.8736 }, expected);
runTest('Format B: { latitude, longitude }', { latitude: 39.9042, longitude: 32.8736 }, expected);
runTest('Format C: [lat, lng]', [39.9042, 32.8736], expected);
runTest('Format D: { coordinates: [lat, lng] }', { coordinates: [39.9042, 32.8736] }, expected);
runTest('Format D nested: { coordinates: { latitude, longitude } }', { coordinates: { latitude: 39.9042, longitude: 32.8736 } }, expected);
runTest('Invalid: null', null, undefined);
runTest('Invalid: {}', {}, undefined);
runTest('Invalid: { lat: string }', { lat: '39' }, undefined);

console.log(`\nTests passed: ${passed}, failed: ${failed}`);
