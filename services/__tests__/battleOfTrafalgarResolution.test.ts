import { describe, it, expect } from 'vitest';
import {
  getHistoricalEntityKnowledge,
  validateHistoricalCoordinate
} from '../geographic/historicalCoordinateValidator';
import { determineHistoricalEventScope } from '../geographic/historicalEventScope';
import { resolveLocationQuery } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Battle of Trafalgar Historical Event Coordinate Resolution', () => {
  it('1. Historical knowledge base contains Battle of Trafalgar with deterministic coordinates off Cape Trafalgar', () => {
    const kbEntry = getHistoricalEntityKnowledge('Battle of Trafalgar');
    expect(kbEntry).toBeDefined();
    expect(kbEntry?.entity).toBe('Battle of Trafalgar');
    expect(kbEntry?.geographicScope).toBe('POINT_EVENT');
    expect(kbEntry?.singleLocation).toBe(true);
    expect(kbEntry?.country).toBe('Spain');
    expect(kbEntry?.approximateCoordinates?.lat).toBeCloseTo(36.18, 2);
    expect(kbEntry?.approximateCoordinates?.lng).toBeCloseTo(-6.03, 2);
  });

  it('2. Aliases and variations ("Battle Of Trafalgar", "the battle of trafalgar", "Trafalgar") resolve to canonical knowledge entry', () => {
    const aliases = ['Battle Of Trafalgar', 'battle of trafalgar', 'the battle of trafalgar', 'Trafalgar', 'the Battle of Trafalgar'];
    for (const alias of aliases) {
      const entry = getHistoricalEntityKnowledge(alias);
      expect(entry).toBeDefined();
      expect(entry?.entity).toBe('Battle of Trafalgar');
      expect(entry?.approximateCoordinates?.lat).toBeCloseTo(36.18, 2);
      expect(entry?.approximateCoordinates?.lng).toBeCloseTo(-6.03, 2);
    }
  });

  it('3. determineHistoricalEventScope correctly identifies Battle of Trafalgar as a POINT_EVENT with SINGLE_LOCATION routing', () => {
    const scope = determineHistoricalEventScope('Battle of Trafalgar');
    expect(scope.scope).toBe('POINT_EVENT');
    expect(scope.singleLocation).toBe(true);
    expect(scope.routing).toBe('SINGLE_LOCATION');
  });

  it('4. validateHistoricalCoordinate strictly rejects hallucinated Bristol candidate (51.45237, -2.58602)', async () => {
    const bristolCandidate = { lat: 51.45237, lng: -2.58602 };
    const validation = await validateHistoricalCoordinate('Battle of Trafalgar', bristolCandidate, {
      rawQuery: 'Where did the Battle of Trafalgar take place?',
      intent: 'HISTORICAL_EVENT',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/GEOGRAPHIC_MISMATCH|FORBIDDEN_REGION/);
  });

  it('5. validateHistoricalCoordinate accepts authoritative coordinates in the Atlantic off Cape Trafalgar (36.18, -6.03)', async () => {
    const trafalgarCoords = { lat: 36.1800, lng: -6.0300 };
    const validation = await validateHistoricalCoordinate('Battle of Trafalgar', trafalgarCoords, {
      rawQuery: 'Where did the Battle of Trafalgar take place?',
      intent: 'HISTORICAL_EVENT',
      coordinateSource: 'deterministic'
    });

    expect(validation.valid).toBe(true);
  });

  it('6. resolveLocationQuery resolves Battle of Trafalgar with deterministic coordinates', async () => {
    const result = await resolveLocationQuery(
      'Battle of Trafalgar',
      'HISTORICAL_EVENT',
      'Where did the Battle of Trafalgar take place?'
    );

    expect(result).toBeDefined();
    expect(result?.locationInfo).toBeDefined();
    expect(result?.locationInfo?.coordinates).toBeDefined();
    expect(result?.locationInfo?.coordinates?.lat).toBeCloseTo(36.18, 1);
    expect(result?.locationInfo?.coordinates?.lng).toBeCloseTo(-6.03, 1);
  });

  it('7. runSearchPipeline resolves "Where did the Battle of Trafalgar take place?" to valid geographic data', async () => {
    const result = await runSearchPipeline({
      rawQuery: 'Where did the Battle of Trafalgar take place?'
    });

    expect(result).toBeDefined();
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.entity).toBeDefined();

    const canonicalName = result.entity?.subject?.identity?.canonicalName ?? (result as any).finalData?.canonicalName;
    expect(canonicalName).toBe('Battle of Trafalgar');

    const coordinates = result.entity?.subject?.primaryLocation?.location?.coordinates ?? (result as any).finalData?.coordinates;
    expect(coordinates).toBeDefined();
    expect(coordinates?.lat).toBeCloseTo(36.18, 1);
    expect(coordinates?.lng).toBeCloseTo(-6.03, 1);
    expect(coordinates?.source).toBe('deterministic');
  });
});
