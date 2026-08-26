import { describe, test, expect } from 'vitest';
import { normalizeGeographicQuery } from '../geographic/geographicNormalization';
import { resolveAlias } from '../geographic/geographicAliases';
import { recordResolution, getGeographicMetrics, resetGeographicMetrics } from '../geographic/geographicMetrics';

describe('Geographic Quality Framework Tests', () => {
  test('Geographic Query Normalization', () => {
    expect(normalizeGeographicQuery(" Paris ")).toBe("paris");
    expect(normalizeGeographicQuery("São  Paulo")).toBe("são paulo");
    expect(normalizeGeographicQuery("ROME")).toBe("rome");
    expect(normalizeGeographicQuery("plano, texas")).toBe("plano, texas");
    expect(normalizeGeographicQuery("plano tx")).toBe("plano, texas");
    expect(normalizeGeographicQuery("boston massachusetts")).toBe("boston, massachusetts");
  });

  test('Alias Resolution', () => {
    const usa = resolveAlias("usa");
    expect(usa.canonical).toBe("united states");
    expect(usa.aliasApplied).toBe(true);

    const beijing = resolveAlias("peking");
    expect(beijing.canonical).toBe("beijing");
    expect(beijing.aliasApplied).toBe(true);

    const paris = resolveAlias("paris");
    expect(paris.canonical).toBe("paris");
    expect(paris.aliasApplied).toBe(false);
  });

  test('Resolution Metrics', () => {
    resetGeographicMetrics();
    recordResolution({ source: 'nominatim', confidence: 0.9, ambiguous: false, durationMs: 150 });
    recordResolution({ source: 'cache', confidence: 1.0, ambiguous: false, durationMs: 5 });
    recordResolution({ source: 'ai-fallback', confidence: 0, ambiguous: false, durationMs: 1500 });
    recordResolution({ source: 'nominatim', confidence: 0.4, ambiguous: true, durationMs: 400 });

    const m = getGeographicMetrics();
    expect(m.totalResolutions).toBe(4);
    expect(m.sourceCounts['nominatim']).toBe(2);
    expect(m.sourceCounts['cache']).toBe(1);
    expect(m.sourceCounts['ai-fallback']).toBe(1);
    expect(m.ambiguities).toBe(1);
    expect(m.lowConfidenceMatches).toBe(2);
  });
});
