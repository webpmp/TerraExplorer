/**
 * Nominatim Integration and Hardening Tests
 *
 * Covers:
 * 1.  No duplicate geographic databases (verified externally).
 * 2.  Deterministic entries never call Nominatim (verified by fetch mock).
 * 3.  In-memory cache audit (keys, misses not cached, survives lookups).
 * 4.  Unit tests separate from live integration tests.
 * 5.  Explicit timeout verification (AbortController fires).
 * 6.  User-Agent compliance.
 * 7.  Table-driven confidence scoring verification.
 * 8.  Table-driven entity mapping verification.
 * 9.  Pipeline path verification (Deterministic, Nominatim, AI Fallback).
 */

import {
  resolveGeographicEntity,
  normalizeNominatimEntityType,
  calculateNominatimConfidence,
  _clearNominatimCache,
  _getNominatimCacheSize,
  GeographicResolution,
} from '../geographic/geographicResolver';
import { DETERMINISTIC_LOCATION_DB } from '../geographic/geographicData';
import { isValidCoordinates } from '../../types';

// ---------------------------------------------------------------------------
// Mocking Utilities
// ---------------------------------------------------------------------------

let allPassed = true;
let fetchCallCount = 0;
let lastFetchUrl = '';
let lastFetchOptions: any = {};
let mockFetchImplementation: ((url: string, options: any) => Promise<any>) | null = null;

const originalFetch = global.fetch;

function setupMockFetch() {
  global.fetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    fetchCallCount++;
    lastFetchUrl = url.toString();
    lastFetchOptions = options || {};
    
    if (mockFetchImplementation) {
      return mockFetchImplementation(url.toString(), options);
    }
    
    // Default mock response (empty)
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

function teardownMockFetch() {
  global.fetch = originalFetch;
}

function resetMockState() {
  fetchCallCount = 0;
  lastFetchUrl = '';
  lastFetchOptions = {};
  mockFetchImplementation = null;
  _clearNominatimCache();
}

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    allPassed = false;
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------------------
// Test 2: Verify Nominatim is never called for deterministic entries
// ---------------------------------------------------------------------------

async function testNoFetchForDeterministic(): Promise<void> {
  section('TEST: Nominatim is never called for deterministic entries');
  resetMockState();

  const result = await resolveGeographicEntity('Paris');

  assert(result !== null, 'resolveGeographicEntity returns non-null for "Paris"');
  if (result && !('status' in result)) {
    assert(result?.source === 'cache', `source is "cache" (got "${result?.source}")`);
  }
  assert(fetchCallCount === 0, `fetch was called ${fetchCallCount} times (expected 0)`);
  assert(_getNominatimCacheSize() === 0, 'Nominatim cache remains empty');

  console.log(`  [OK] Deterministic cache hit avoids HTTP request and AI fallback.`);
}

// ---------------------------------------------------------------------------
// Test 3: Audit the in-memory cache
// ---------------------------------------------------------------------------

async function testInMemoryCacheAudit(): Promise<void> {
  section('TEST: Audit the in-memory cache behavior');
  resetMockState();

  // Mock fetch to return a valid response for "unknown_city"
  mockFetchImplementation = async () => new Response(JSON.stringify([{
    place_id: 1, display_name: 'Unknown City, State', name: 'Unknown City',
    lat: '10.0', lon: '20.0', class: 'place', type: 'city', importance: 0.8
  }]), { status: 200, headers: { 'Content-Type': 'application/json' }});

  // 1. Keys are normalized
  await resolveGeographicEntity(' Unknown City ');
  assert(_getNominatimCacheSize() === 1, 'Cache populated after successful lookup');
  
  fetchCallCount = 0; // Reset counter to track cache hit
  const resultCached = await resolveGeographicEntity('unknown city');
  assert(resultCached !== null, 'Returns cached result for normalized key');
  assert(fetchCallCount === 0, 'Cache hit avoids second fetch');

  // 2. Failed HTTP requests are never cached
  resetMockState();
  mockFetchImplementation = async () => new Response('Internal Server Error', { status: 500 });
  await resolveGeographicEntity('server_error_city');
  assert(_getNominatimCacheSize() === 0, 'Cache remains empty after 500 error');

  // 3. Low-confidence results are never cached
  resetMockState();
  mockFetchImplementation = async () => new Response(JSON.stringify([{
    place_id: 2, display_name: 'Low Confidence Place', name: 'Low',
    lat: '0.0', lon: '0.0', class: 'place', type: 'locality', importance: 0.01 // very low confidence
  }]), { status: 200, headers: { 'Content-Type': 'application/json' }});
  
  const lowConfResult = await resolveGeographicEntity('low_confidence_city');
  assert(lowConfResult === null, 'Low confidence result is rejected (returns null)');
  assert(_getNominatimCacheSize() === 0, 'Low confidence result is not cached');
}

// ---------------------------------------------------------------------------
// Test 5: Explicit timeout verification
// ---------------------------------------------------------------------------

async function testTimeoutVerification(): Promise<void> {
  section('TEST: Explicit timeout verification');
  resetMockState();

  // Create a mocked fetch that never resolves, but responds to abort signal
  mockFetchImplementation = async (url, options) => {
    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        reject(error);
      };
      
      if (options?.signal) {
        if (options.signal.aborted) return abortHandler();
        options.signal.addEventListener('abort', abortHandler);
      }
      
      // Never resolves naturally to simulate timeout
      // Note: Node.js setTimeout inside tests can hang if not careful, 
      // but abort logic should prevent it.
    });
  };

  const startTime = Date.now();
  const result = await resolveGeographicEntity('timeout_city');
  const elapsed = Date.now() - startTime;

  assert(result === null, 'Resolver returns null on timeout');
  assert(elapsed >= 4900 && elapsed < 6000, `Timeout occurred around configured interval (elapsed: ${elapsed}ms)`);
  assert(fetchCallCount === 1, 'Fetch was attempted');
  assert(_getNominatimCacheSize() === 0, 'Timeout does not populate cache');
}

// ---------------------------------------------------------------------------
// Test 6: Verify User-Agent compliance
// ---------------------------------------------------------------------------

async function testUserAgentCompliance(): Promise<void> {
  section('TEST: Verify User-Agent compliance');
  resetMockState();

  await resolveGeographicEntity('user_agent_test_city');

  assert(fetchCallCount === 1, 'Fetch was called');
  
  const headers = lastFetchOptions.headers;
  assert(headers !== undefined, 'Headers were passed to fetch');
  
  // Headers could be a Headers object, array, or plain object.
  // We assume plain object based on geographicResolver implementation.
  const userAgent = headers['User-Agent'];
  assert(userAgent === 'TerraExplorer/1.0 (educational globe application)', `User-Agent matches required string (got "${userAgent}")`);
}

// ---------------------------------------------------------------------------
// Test 7: Confidence scoring verification
// ---------------------------------------------------------------------------

async function testConfidenceScoringTable(): Promise<void> {
  section('TEST: Confidence scoring verification');

  const baseResult = { place_id: 1, display_name: 'Test', name: 'Test', lat: '0', lon: '0', class: 'place', type: 'city', importance: 0.5 };

  const cases = [
    {
      label: 'Base score + exact match',
      query: 'test',
      result: { ...baseResult },
      expected: 0.6 // 0.5 + 0.10
    },
    {
      label: 'Base score + address rank bonus',
      query: 'other',
      result: { ...baseResult, address_rank: 16 }, // Rank 16 qualifies
      expected: 0.55 // 0.5 + 0.05 (no exact match)
    },
    {
      label: 'Neighborhood penalty',
      query: 'other',
      result: { ...baseResult, type: 'neighbourhood' },
      expected: 0.3 // 0.5 - 0.20
    },
    {
      label: 'Catch-all "yes" penalty',
      query: 'other',
      result: { ...baseResult, type: 'yes' },
      expected: 0.4 // 0.5 - 0.10
    },
    {
      label: 'Clamping (max 1.0)',
      query: 'test',
      result: { ...baseResult, importance: 0.95, address_rank: 10 },
      expected: 1.0 // 0.95 + 0.10 + 0.05 = 1.1 -> clamped to 1.0
    },
    {
      label: 'Clamping (min 0.0) with low base importance',
      query: 'other',
      result: { ...baseResult, importance: 0.0, type: 'neighbourhood' },
      expected: 0.0 // 0.05 (clamped base) - 0.20 = -0.15 -> clamped to 0.0
    }
  ];

  for (const tc of cases) {
    const { score } = calculateNominatimConfidence(tc.result, tc.query);
    assert(Math.abs(score - tc.expected) < 0.001, `${tc.label}: expected ${tc.expected}, got ${score.toFixed(3)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 8: Entity mapping verification
// ---------------------------------------------------------------------------

async function testEntityMappingTable(): Promise<void> {
  section('TEST: Entity mapping verification');

  const mappings = [
    { c: 'place', t: 'city', e: 'city' },
    { c: 'place', t: 'country', e: 'country' },
    { c: 'place', t: 'state', e: 'state' },
    { c: 'place', t: 'ocean', e: 'ocean' },
    { c: 'place', t: 'continent', e: 'natural_feature' },
    { c: 'natural', t: 'peak', e: 'mountain' },
    { c: 'natural', t: 'water', e: 'natural_feature' },
    { c: 'waterway', t: 'river', e: 'natural_feature' },
    { c: 'tourism', t: 'museum', e: 'museum' },
    { c: 'tourism', t: 'viewpoint', e: 'landmark' },
    { c: 'historic', t: 'battlefield', e: 'battlefield' },
    { c: 'historic', t: 'ruins', e: 'archaeological_site' },
    { c: 'historic', t: 'monument', e: 'archaeological_site' },
    { c: 'amenity', t: 'museum', e: 'museum' },
    { c: 'boundary', t: 'administrative', e: 'state' },
    { c: 'unmapped_class', t: 'unmapped_type', e: 'landmark' } // fallback
  ];

  for (const map of mappings) {
    const mapped = normalizeNominatimEntityType(map.c, map.t);
    assert(mapped === map.e, `Mapping ${map.c}/${map.t} -> ${map.e} (got ${mapped})`);
  }
}

// ---------------------------------------------------------------------------
// Optional Integration Tests
// ---------------------------------------------------------------------------

async function testLiveIntegration(): Promise<void> {
  if (process.env.RUN_NOMINATIM_TESTS !== '1') {
    section('TEST: Live integration skipped (RUN_NOMINATIM_TESTS != 1)');
    return;
  }
  
  section('TEST: Live integration (Network)');
  teardownMockFetch(); // Restore original fetch
  _clearNominatimCache();

  const result = await resolveGeographicEntity('Eiffel Tower');
  
  if (result && !('status' in result)) {
    assert(result.source === 'nominatim', 'Live result source is nominatim');
    assert(result.confidence !== undefined && result.confidence >= 0.3, 'Live result meets confidence threshold');
    assert(isValidCoordinates(result.coordinates), 'Live result coordinates are valid');
  } else {
    assert(false, 'Live request failed (is network up?)');
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runAllTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('NOMINATIM INTEGRATION & HARDENING TESTS');
  console.log('='.repeat(60));

  setupMockFetch();

  await testNoFetchForDeterministic();
  await testInMemoryCacheAudit();
  await testTimeoutVerification();
  await testUserAgentCompliance();
  await testConfidenceScoringTable();
  await testEntityMappingTable();
  
  // Pipeline path verification conceptually covered by:
  // 1. testNoFetchForDeterministic (Deterministic)
  // 2. testInMemoryCacheAudit (Nominatim via mock)
  // 3. testInMemoryCacheAudit's low confidence/error cases -> null (AI Fallback)
  // (Full pipeline with AI enrichment is tested in geographicResolution.test.ts)

  await testLiveIntegration();

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
  }
  console.log('='.repeat(60));
}

runAllTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
