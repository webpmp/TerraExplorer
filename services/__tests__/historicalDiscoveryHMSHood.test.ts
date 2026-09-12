import { describe, it, expect } from 'vitest';
import { validateHistoricalCoordinate, getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';
import { routeIntentAndExtractEntity } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('HMS Hood Historical Discovery Resolution & Validation', () => {
  it('1. Correctly classifies intent as DISCOVERY_OBJECT_LOCATION and extracts entity "HMS Hood"', () => {
    const query = 'Where was the HMS Hood found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.entity).toBe('HMS Hood');
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.resolutionMode).toBe('SINGLE_POINT');
  });

  it('2. Historical knowledge base contains authoritative HMS Hood metadata and Denmark Strait region', () => {
    const kb = getHistoricalEntityKnowledge('HMS Hood');
    expect(kb).toBeDefined();
    expect(kb?.entity).toBe('HMS Hood');
    expect(kb?.entityType).toBe('shipwreck');
    expect(kb?.expectedRegion).toContain('Denmark Strait');
    expect(kb?.approximateCoordinates).toBeDefined();
    expect(kb?.approximateCoordinates?.lat).toBeCloseTo(63.3333, 1);
    expect(kb?.approximateCoordinates?.lng).toBeCloseTo(-31.8333, 1);
    expect(kb?.boundingBox).toBeDefined();
  });

  it('3. Validates historical coordinates in the Denmark Strait', async () => {
    const denmarkStraitCoords = { lat: 63.3333, lng: -31.8333 };
    const validation = await validateHistoricalCoordinate('HMS Hood', denmarkStraitCoords, {
      rawQuery: 'Where was the HMS Hood found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'deterministic'
    });
    expect(validation.valid).toBe(true);
    expect(validation.reason).toBe('MATCHES_EXPECTED_HISTORICAL_REGION');
  });

  it('4. Rejects unrelated or hallucinated coordinates (e.g. Ascension Island or Lesotho)', async () => {
    // Ascension Island coordinates: -27.864531, 15.892135
    const ascensionCoords = { lat: -27.864531, lng: 15.892135 };
    const validationAscension = await validateHistoricalCoordinate('HMS Hood', ascensionCoords, {
      rawQuery: 'Where was the HMS Hood found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(validationAscension.valid).toBe(false);
    expect(validationAscension.reason).toBe('GEOGRAPHIC_MISMATCH');

    // Lesotho coordinates: -29.8445, 28.7016
    const lesothoCoords = { lat: -29.8445, lng: 28.7016 };
    const validationLesotho = await validateHistoricalCoordinate('HMS Hood', lesothoCoords, {
      rawQuery: 'Where was the HMS Hood found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery'
    });
    expect(validationLesotho.valid).toBe(false);
    expect(validationLesotho.reason).toBe('GEOGRAPHIC_MISMATCH');
  });

  it('5. Pipeline resolves "Where was the HMS Hood found?" to Denmark Strait and preserves entity identity', async () => {
    const query = 'Where was the HMS Hood found?';
    const result = await runSearchPipeline({ rawQuery: query });

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    expect(entity.subject.identity.canonicalName).toBe('HMS Hood');
    expect(entity.subject.identity.entityType).toBe('shipwreck');

    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(63.3333, 1);
    expect(coords.lng).toBeCloseTo(-31.8333, 1);

    // Entity identity status must be verified
    expect((entity.subject.primaryLocation as any).identityStatus).toBe('verified');
  });

  it('6. Boston Massacre and Great Depression regression behaviors remain intact', async () => {
    // Boston Massacre: Point event with deterministic coordinates
    const bostonRes = await runSearchPipeline({ rawQuery: 'Where did the Boston Massacre take place?' });
    expect(bostonRes.isValid).toBe(true);
    expect(bostonRes.entity?.subject.identity.canonicalName).toBe('Boston Massacre Site');
    expect(bostonRes.entity?.subject.identity.entityType).toBe('historical_event_site');
    expect(bostonRes.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(42.3588, 2);

    // Great Depression: Broad historical event, non-point
    const greatDepressionRouted = routeIntentAndExtractEntity('Where did the Great Depression take place?');
    expect(greatDepressionRouted.intent).toBe('HISTORICAL_EVENT');
    expect(greatDepressionRouted.resolutionMode).toBe('HISTORICAL_NON_POINT');
    expect(greatDepressionRouted.singleLocation).toBe(false);
  });
});
