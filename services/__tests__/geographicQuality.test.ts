/**
 * Geographic Quality Framework Tests
 */
import { normalizeGeographicQuery } from '../geographic/geographicNormalization';
import { resolveAlias } from '../geographic/geographicAliases';
import { calculateNominatimConfidence, GeographicSource } from '../geographic/geographicResolver';
import { recordResolution, getGeographicMetrics, resetGeographicMetrics } from '../geographic/geographicMetrics';
import { ConfidenceDescriptions } from '../geographic/geographicConfidence';

let allPassed = true;

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

async function testNormalization(): Promise<void> {
  section('TEST: Geographic Query Normalization');
  
  const cases = [
    { input: " Paris ", expected: "paris" },
    { input: "São  Paulo", expected: "são paulo" },
    { input: "ROME", expected: "rome" },
    { input: "plano, texas", expected: "plano, texas" },
    { input: "plano tx", expected: "plano, texas" }, // state alias expansion
    { input: "boston massachusetts", expected: "boston massachusetts" }, // already expanded
  ];

  for (const tc of cases) {
    const result = normalizeGeographicQuery(tc.input);
    assert(result === tc.expected, `Normalize "${tc.input}" -> "${tc.expected}" (got "${result}")`);
  }
}

async function testAliases(): Promise<void> {
  section('TEST: Alias Resolution');

  const cases = [
    { input: "usa", expectedCanonical: "united states", applied: true },
    { input: "united states of america", expectedCanonical: "united states", applied: true },
    { input: "peking", expectedCanonical: "beijing", applied: true },
    { input: "paris", expectedCanonical: "paris", applied: false }
  ];

  for (const tc of cases) {
    const res = resolveAlias(tc.input);
    assert(res.canonical === tc.expectedCanonical, `Alias "${tc.input}" canonical -> "${tc.expectedCanonical}"`);
    assert(res.aliasApplied === tc.applied, `Alias applied: ${tc.applied}`);
    if (tc.applied) {
      assert(res.aliasMatched === tc.input, `Alias matched field is present`);
    }
  }
}

async function testMetrics(): Promise<void> {
  section('TEST: Resolution Metrics');

  resetGeographicMetrics();
  
  recordResolution({ source: 'nominatim', confidence: 0.9, ambiguous: false, durationMs: 150 });
  recordResolution({ source: 'cache', confidence: 1.0, ambiguous: false, durationMs: 5 });
  recordResolution({ source: 'ai-fallback', confidence: 0, ambiguous: false, durationMs: 1500 });
  recordResolution({ source: 'nominatim', confidence: 0.4, ambiguous: true, durationMs: 400 }); // Low confidence & ambiguous

  const m = getGeographicMetrics();
  assert(m.totalResolutions === 4, `Total resolutions: 4 (got ${m.totalResolutions})`);
  assert(m.sourceCounts['nominatim'] === 2, `Nominatim hits: 2 (got ${m.sourceCounts['nominatim']})`);
  assert(m.sourceCounts['cache'] === 1, `Cache hits: 1`);
  assert(m.sourceCounts['ai-fallback'] === 1, `AI Fallback hits: 1`);
  assert(m.ambiguities === 1, `Ambiguities: 1`);
  assert(m.lowConfidenceMatches === 2, `Low confidence matches: 2 (AI=0, Nominatim=0.4)`);
  assert(m.totalDurationMs === (150 + 5 + 1500 + 400), `Total duration correctly summed`);
}

async function runAllTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('GEOGRAPHIC QUALITY FRAMEWORK TESTS');
  console.log('='.repeat(60));

  await testNormalization();
  await testAliases();
  await testMetrics();

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
