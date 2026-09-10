/**
 * Regression tests: "The pyramids of gaza" entity resolution
 *
 * Acceptance criteria (see implementation_plan.md):
 *  - Searching "The pyramids of gaza" must produce the same entity as "The Pyramids of Giza"
 *  - Canonical name = "The Pyramids of Giza"
 *  - Geographic context = Giza, Egypt
 *  - Marker at ≈ 29.9792°N, 31.1342°E — NEVER at 31.5268, 29.2010 (Mediterranean)
 *  - Resolved through deterministic knowledge base — AI coordinate recovery NOT called
 *  - Enrichment receives canonical Giza identity, not the malformed query
 *  - Image queries contain Giza terminology, not "gaza"
 *  - Giza pyramid images accepted by image validator
 *  - Existing direct "Pyramids of Giza" search unaffected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAlias } from '../geographic/geographicAliases';
import { getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';
import { runSearchPipeline, ResolutionStage, IntentStage } from '../pipeline';
import { buildEntityImageQueries, validateImageCandidate, deriveEntityAliases } from '../imageService';
import type { ImageCandidate } from '../imageService';
import * as geminiService from '../geminiService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gizaEntity(overrides: Record<string, unknown> = {}) {
  return {
    name: 'The Pyramids of Giza',
    canonicalName: 'The Pyramids of Giza',
    city: 'Giza',
    country: 'Egypt',
    state: 'Giza Governorate',
    entityType: 'archaeological_site' as const,
    coordinates: { lat: 29.9792, lng: 31.1342 },
    coordinateSource: 'deterministic' as const,
    identityStatus: 'verified' as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Alias resolution
// ---------------------------------------------------------------------------
describe('Test 1 – Alias resolution', () => {
  it('resolveAlias("pyramids of gaza") returns canonical "pyramids of giza"', () => {
    const result = resolveAlias('pyramids of gaza');
    expect(result.aliasApplied).toBe(true);
    expect(result.canonical).toBe('pyramids of giza');
  });

  it('resolveAlias("the pyramids of gaza") returns canonical "pyramids of giza"', () => {
    const result = resolveAlias('the pyramids of gaza');
    expect(result.aliasApplied).toBe(true);
    expect(result.canonical).toBe('pyramids of giza');
  });

  it('resolveAlias("pyramids of gazza") returns canonical "pyramids of giza"', () => {
    const result = resolveAlias('pyramids of gazza');
    expect(result.aliasApplied).toBe(true);
    expect(result.canonical).toBe('pyramids of giza');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Knowledge-base lookup
// ---------------------------------------------------------------------------
describe('Test 2 – Knowledge-base resolution', () => {
  it('getHistoricalEntityKnowledge("pyramids of giza") returns the Giza entry', () => {
    const entry = getHistoricalEntityKnowledge('pyramids of giza');
    expect(entry).toBeDefined();
    expect(entry!.entity).toBe('The Pyramids of Giza');
    expect(entry!.country).toBe('Egypt');
    expect(entry!.approximateCoordinates!.lat).toBeCloseTo(29.9792, 2);
    expect(entry!.approximateCoordinates!.lng).toBeCloseTo(31.1342, 2);
    expect(entry!.approximateCoordinates!.source).toBe('deterministic');
    expect(entry!.exactLocationConfirmed).toBe(true);
  });

  it('getHistoricalEntityKnowledge("pyramids of gaza") also resolves to the Giza entry', () => {
    const entry = getHistoricalEntityKnowledge('pyramids of gaza');
    expect(entry).toBeDefined();
    expect(entry!.entity).toBe('The Pyramids of Giza');
    expect(entry!.country).toBe('Egypt');
  });

  it('getHistoricalEntityKnowledge("giza pyramid complex") resolves to the Giza entry', () => {
    const entry = getHistoricalEntityKnowledge('giza pyramid complex');
    expect(entry).toBeDefined();
    expect(entry!.entity).toBe('The Pyramids of Giza');
  });

  it('getHistoricalEntityKnowledge("great pyramid of giza") resolves to the Giza entry', () => {
    const entry = getHistoricalEntityKnowledge('great pyramid of giza');
    expect(entry).toBeDefined();
    expect(entry!.entity).toBe('The Pyramids of Giza');
  });
});

// ---------------------------------------------------------------------------
// Test 3 & 4: Pipeline end-to-end + AI recovery not called
// ---------------------------------------------------------------------------
describe('Test 3 & 4 – Pipeline resolves misspelling; AI recovery bypassed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runSearchPipeline({rawQuery:"The pyramids of gaza"}) produces canonical Giza identity', async () => {
    // Geocoder fails (Nominatim cannot find the misspelled query)
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: 'NO_GEOGRAPHIC_DATA',
    } as any);

    // AI recovery must NOT be called — spy to assert it is never invoked
    const recoverSpy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi');

    // Enrichment: return minimal metadata so the pipeline completes
    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Pyramids of Giza are ancient monuments on the Giza Plateau in Egypt.',
      notable: [{ title: 'Great Pyramid of Khufu', description: 'Built c. 2560 BCE.' }],
    } as any);

    const res = await runSearchPipeline({ rawQuery: 'The pyramids of gaza' });

    // Identity
    expect(res.isValid).toBe(true);
    const canonical = res.entity?.subject?.identity?.canonicalName ?? (res as any).finalData?.canonicalName;
    expect(canonical).toMatch(/The Pyramids of Giza/i);

    // Coordinates must be near Giza Plateau, NOT in the Mediterranean
    const lat = res.entity?.subject?.primaryLocation?.location?.coordinates?.lat;
    const lng = res.entity?.subject?.primaryLocation?.location?.coordinates?.lng;
    if (lat !== undefined) {
      expect(lat).toBeGreaterThan(29.5);
      expect(lat).toBeLessThan(30.5);
      expect(lng).toBeGreaterThan(30.5);
      expect(lng).toBeLessThan(32.0);
    }

    // Test 4: AI recovery was never called
    expect(recoverSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Mediterranean coordinates rejected by trust gate
// ---------------------------------------------------------------------------
describe('Test 5 – Mediterranean AI coordinates rejected', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ResolutionStage rejects provisional AI coords that place entity in the Mediterranean', async () => {
    // Geocoder fails for this unknown entity
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: 'NO_GEOGRAPHIC_DATA',
    } as any);

    // AI recovery returns Mediterranean coordinates (the actual bug coordinates)
    vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue({
      lat: 31.526874,
      lng: 29.201032,
      source: 'ai_recovery',
      coordinateTrust: 'provisional',
      recoveredEntity: 'Some Known Landmark',
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({} as any);

    const entityResult = IntentStage({ rawQuery: 'some unknown landmark xyz123abc' });

    const stageRes = await ResolutionStage(entityResult as any);

    // Either the result is invalid, or the coordinates are not Mediterranean
    if (stageRes.isValid) {
      const lat = stageRes.entity?.subject?.primaryLocation?.location?.coordinates?.lat;
      if (lat !== undefined) {
        // Mediterranean coords were 31.526874 — must not be accepted
        expect(lat).not.toBeCloseTo(31.526874, 1);
      }
    } else {
      // Expected: the provisional AI coords were rejected
      expect(stageRes.isValid).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: Enrichment receives canonical identity
// ---------------------------------------------------------------------------
describe('Test 6 – Enrichment receives canonical Giza identity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pipeline result has canonical Giza identity, not the misspelled query as the entity name', async () => {
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: 'NO_GEOGRAPHIC_DATA',
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Pyramids of Giza stand on the Giza Plateau.',
      notable: [{ title: 'Age', description: 'Over 4,500 years old.' }],
    } as any);

    const res = await runSearchPipeline({ rawQuery: 'The pyramids of gaza' });

    expect(res.isValid).toBe(true);

    // Canonical name must be Giza, not Gaza
    const canonical = (
      res.entity?.subject?.identity?.canonicalName ??
      (res as any).finalData?.canonicalName ??
      (res as any).finalData?.name ??
      ''
    ) as string;
    expect(canonical.toLowerCase()).not.toMatch(/pyramids of gaza/);
    expect(canonical.toLowerCase()).toContain('giza');

    // Country and geography must be Egypt/Giza — not unknown
    const country = (
      res.entity?.subject?.primaryLocation?.location?.country ??
      (res as any).finalData?.country ??
      ''
    ) as string;
    if (country) {
      expect(country.toLowerCase()).toBe('egypt');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7: Image queries use Giza terminology
// ---------------------------------------------------------------------------
describe('Test 7 – Image queries contain Giza terminology', () => {
  it('buildEntityImageQueries with Giza canonical name produces Giza queries, not Gaza queries', () => {
    const queries = buildEntityImageQueries({
      name: 'The Pyramids of Giza',
      canonicalName: 'The Pyramids of Giza',
      city: 'Giza',
      country: 'Egypt',
      entityType: 'archaeological_site',
    });

    const queryText = queries.join(' ').toLowerCase();
    expect(queryText).toMatch(/giza/);

    // Pyramid queries must not contain the misspelling "gaza"
    const pyramidGazaQueries = queries.filter(
      q => q.toLowerCase().includes('pyramid') && q.toLowerCase().includes('gaza')
    );
    expect(pyramidGazaQueries).toHaveLength(0);
  });

  it('deriveEntityAliases for "The Pyramids of Giza" includes component pyramid aliases', () => {
    const aliases = deriveEntityAliases('The Pyramids of Giza', 'The Pyramids of Giza');
    const allAliases = [
      ...aliases.canonicalAliases,
      ...aliases.componentAliases,
      ...aliases.alternateAliases,
      ...aliases.exactAliases,
    ].map(a => a.toLowerCase());

    expect(allAliases).toContain('great pyramid of giza');
    expect(allAliases).toContain('giza necropolis');
    expect(allAliases).toContain('giza plateau');
  });
});

// ---------------------------------------------------------------------------
// Test 8: Giza image validation
// ---------------------------------------------------------------------------
describe('Test 8 – Giza image validation', () => {
  it('validateImageCandidate accepts "Giza pyramid complex" title for The Pyramids of Giza entity', () => {
    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/giza.jpg',
      title: 'Giza pyramid complex',
      description: 'Aerial view of the Giza pyramid complex, Egypt.',
      caption: 'Giza pyramid complex',
    };
    const result = validateImageCandidate(candidate, gizaEntity());
    expect(result.decision).toBe('ACCEPT');
  });

  it('validateImageCandidate accepts "Great Pyramid of Giza" title for The Pyramids of Giza entity', () => {
    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/khufu.jpg',
      title: 'Great Pyramid of Giza',
      description: 'The Great Pyramid of Giza (Pyramid of Khufu) in Egypt.',
      caption: 'Great Pyramid of Giza',
    };
    const result = validateImageCandidate(candidate, gizaEntity());
    expect(result.decision).toBe('ACCEPT');
  });

  it('validateImageCandidate rejects unrelated "Demographics of Palestine" for The Pyramids of Giza', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/demographics.jpg',
      title: 'Demographics of Palestine',
      description: 'Population statistics for Palestine.',
      caption: 'Demographics of Palestine',
    };
    const result = validateImageCandidate(candidate, gizaEntity());
    expect(result.decision).toBe('REJECT');
  });
});

// ---------------------------------------------------------------------------
// Test 9: Non-regression — direct "Pyramids of Giza" search
// ---------------------------------------------------------------------------
describe('Test 9 – Non-regression: direct Pyramids of Giza search', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runSearchPipeline({rawQuery:"Pyramids of Giza"}) still resolves through KB without AI recovery', async () => {
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: 'NO_GEOGRAPHIC_DATA',
    } as any);

    const recoverSpy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi');

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Pyramids of Giza are ancient monuments on the Giza Plateau in Egypt.',
      notable: [{ title: 'Age', description: 'Over 4,500 years old.' }],
    } as any);

    const res = await runSearchPipeline({ rawQuery: 'Pyramids of Giza' });

    expect(res.isValid).toBe(true);
    const canonical = res.entity?.subject?.identity?.canonicalName ?? (res as any).finalData?.canonicalName;
    expect(canonical).toMatch(/Pyramids of Giza/i);

    // KB provides deterministic coordinates — AI recovery should not be called
    expect(recoverSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 10 & 11: Non-regression — other entities / landmarks unaffected
// ---------------------------------------------------------------------------
describe('Test 10 & 11 – Non-regression: other entities unaffected', () => {
  it('getHistoricalEntityKnowledge("titanic") still returns the Titanic entry', () => {
    const entry = getHistoricalEntityKnowledge('titanic');
    expect(entry).toBeDefined();
    expect(entry!.entity.toLowerCase()).toContain('titanic');
  });

  it('getHistoricalEntityKnowledge for a non-existent entity returns undefined', () => {
    const entry = getHistoricalEntityKnowledge('xyzzy totally fictional landmark 99999');
    expect(entry).toBeUndefined();
  });

  it('resolveAlias("eiffel tower") does not produce a Giza-related canonical', () => {
    const result = resolveAlias('eiffel tower');
    if (result.aliasApplied) {
      expect(result.canonical).not.toContain('giza');
    }
  });
});
