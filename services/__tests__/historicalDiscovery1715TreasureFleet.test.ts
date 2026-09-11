import { describe, it, expect } from 'vitest';
import { validateHistoricalCoordinate, getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';
import { isValidCoordinates } from '../../types';
import { routeIntentAndExtractEntity } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { validateEntityIdentity } from '../geographic/entityIdentityValidator';

describe('1715 Treasure Fleet Historical Discovery Resolution & Validation', () => {
  it('1. Correctly classifies intent and extracts entity for "Where was the 1715 Treasure Fleet found?"', () => {
    const query = 'Where was the 1715 Treasure Fleet found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.entity).toBe('1715 Treasure Fleet');
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
  });

  it('2. Historical knowledge base contains authoritative 1715 Treasure Fleet metadata and region', () => {
    const kb = getHistoricalEntityKnowledge('1715 Treasure Fleet');
    expect(kb).toBeDefined();
    expect(kb?.entity).toBe('1715 Treasure Fleet');
    expect(kb?.entityType).toBe('shipwreck');
    expect(kb?.expectedRegion).toContain('Florida');
    expect(kb?.approximateCoordinates).toBeDefined();
    expect(kb?.approximateCoordinates?.lat).toBeCloseTo(27.5, 1);
    expect(kb?.approximateCoordinates?.lng).toBeCloseTo(-80.3, 1);
    expect(kb?.boundingBox).toBeDefined();
  });

  it('3. Validates historical coordinates on Florida East Coast / Biscayne Bay / Treasure Coast', async () => {
    // Biscayne Bay coordinates
    const biscayneCoords = { lat: 25.483611, lng: -79.959444 };
    const validationBiscayne = await validateHistoricalCoordinate('1715 Treasure Fleet', biscayneCoords, {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(validationBiscayne.valid).toBe(true);
    expect(validationBiscayne.reason).toBe('MATCHES_EXPECTED_HISTORICAL_REGION');

    // Treasure Coast / Sebastian coordinates
    const treasureCoastCoords = { lat: 27.5, lng: -80.3 };
    const validationTC = await validateHistoricalCoordinate('1715 Treasure Fleet', treasureCoastCoords, {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'deterministic'
    });
    expect(validationTC.valid).toBe(true);
  });

  it('4. Rejects unrelated or fabricated coordinates (e.g. Australia / South Pacific or Terror Bay)', async () => {
    // Unrelated oceanic coordinate off Australia
    const badCoords = { lat: -32.9208, lng: 156.6369 };
    const validationBad = await validateHistoricalCoordinate('1715 Treasure Fleet', badCoords, {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(validationBad.valid).toBe(false);
    expect(validationBad.reason).toBe('GEOGRAPHIC_MISMATCH');

    // Terror Bay, Nunavut
    const terrorBayCoords = { lat: 68.8550, lng: -98.9350 };
    const validationTerror = await validateHistoricalCoordinate('1715 Treasure Fleet', terrorBayCoords, {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(validationTerror.valid).toBe(false);
    expect(validationTerror.reason).toBe('GEOGRAPHIC_MISMATCH');
  });

  it('5. Entity identity validator rejects "Terror Bay" or mismatched entities for "1715 Treasure Fleet"', () => {
    const checkMismatch = validateEntityIdentity('1715 Treasure Fleet', 'Terror Bay', {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION'
    });
    expect(checkMismatch.matches).toBe(false);

    const checkMatch = validateEntityIdentity('1715 Treasure Fleet', '1715 Spanish Treasure Fleet', {
      rawQuery: 'Where was the 1715 Treasure Fleet found?',
      intent: 'DISCOVERY_OBJECT_LOCATION'
    });
    expect(checkMatch.matches).toBe(true);
  });

  it('6. Pipeline resolves "Where was the 1715 Treasure Fleet found?" to authoritative Florida coordinates with valid entity identity', async () => {
    const result = await runSearchPipeline({
      rawQuery: 'Where was the 1715 Treasure Fleet found?'
    });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject.identity.canonicalName).toBe('1715 Treasure Fleet');
    expect(result.entity?.subject.primaryLocation.location.coordinates).toBeDefined();
    
    const coords = result.entity!.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeGreaterThanOrEqual(24.0);
    expect(coords.lat).toBeLessThanOrEqual(30.0);
    expect(coords.lng).toBeGreaterThanOrEqual(-82.5);
    expect(coords.lng).toBeLessThanOrEqual(-79.0);
  });
});
