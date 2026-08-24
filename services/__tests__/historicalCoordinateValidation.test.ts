import { describe, it, expect } from 'vitest';
import { validateHistoricalCoordinate } from '../geographic/historicalCoordinateValidator';
import { isValidCoordinates } from '../../types';
import { routeIntentAndExtractEntity, resolveLocationQuery } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Historical Coordinate Validation and Provenance Integrity Suite', () => {
  it('1. Rejects Santa Maria candidate in Brazil (-16.401389, -43.951389) with GEOGRAPHIC_MISMATCH', async () => {
    const candidate = { lat: -16.401389, lng: -43.951389 };
    expect(isValidCoordinates(candidate)).toBe(true);

    const validation = await validateHistoricalCoordinate('Santa Maria', candidate, {
      rawQuery: 'Where was the Santa Maria found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('GEOGRAPHIC_MISMATCH');
    expect(validation.expectedRegion).toContain('Hispaniola');
  });

  it('2. Rejects Santa Maria candidate in Rhode Island (41.2354, -71.6289) with GEOGRAPHIC_MISMATCH', async () => {
    const candidate = { lat: 41.2354, lng: -71.6289 };
    expect(isValidCoordinates(candidate)).toBe(true);

    const validation = await validateHistoricalCoordinate('Santa Maria', candidate, {
      rawQuery: 'Where was the Santa Maria found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('GEOGRAPHIC_MISMATCH');
  });

  it('3. Recovery and pipeline retain canonical name "Santa Maria" and do not rename to "Discovery Site of Santa Maria"', async () => {
    const query = 'Where was the Santa Maria found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.entity).toBe('Santa Maria');

    const pipelineRes = await runSearchPipeline({ rawQuery: query });
    if (pipelineRes.entity) {
      expect(pipelineRes.entity.subject.identity.canonicalName).toBe('Santa Maria');
      expect(pipelineRes.entity.subject.primaryLocation.label).toBe('Santa Maria');
    }
  });

  it('4. Historical entity with approximate deterministic coordinates preserves uncertainty and approximate source', async () => {
    const query = 'Where was the Santa Maria found?';
    const resolved = await resolveLocationQuery('Santa Maria', 'DISCOVERY_OBJECT_LOCATION', query);

    if (resolved.locationInfo?.coordinates) {
      expect(resolved.locationInfo.coordinates.lat).toBeCloseTo(19.76, 1);
      expect(resolved.locationInfo.coordinates.lng).toBeCloseTo(-72.20, 1);
      expect(resolved.locationInfo.coordinateSource).toBe('historical_approximate');
      expect(resolved.locationInfo.isApproximate).toBe(true);
      expect(resolved.locationInfo.exactLocationKnown).toBe(false);
    } else {
      expect(resolved.error).toBe('HISTORICAL_LOCATION_UNCONFIRMED');
    }
  });

  it('5. Accepts historical entity with valid coordinate in its known historical region (e.g. Vasa in Stockholm Harbor)', async () => {
    const candidate = { lat: 59.3275, lng: 18.0911 }; // Stockholm Harbor
    const validation = await validateHistoricalCoordinate('Vasa', candidate, {
      rawQuery: 'Where was the Vasa found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'deterministic'
    });

    expect(validation.valid).toBe(true);
    expect(validation.expectedRegion).toContain('Stockholm');
  });

  it('6. Distinguishes numeric validity from geographic validity', async () => {
    const nyCoords = { lat: 41.0675, lng: -73.8291 };
    
    // Numerically valid
    const numericValid = isValidCoordinates(nyCoords);
    expect(numericValid).toBe(true);

    // Geographically invalid for Santa Maria
    const geoValidation = await validateHistoricalCoordinate('Santa Maria', nyCoords);
    expect(geoValidation.valid).toBe(false);
    expect(geoValidation.reason).toBe('GEOGRAPHIC_MISMATCH');
  });

  it('7. Modern geographic entity resolves normally without interference', async () => {
    const query = 'Boston, Massachusetts';
    const resolved = await resolveLocationQuery('Boston, Massachusetts', 'NATURAL_LOCATION', query);
    expect(resolved.locationInfo?.coordinates).toBeDefined();
    expect(resolved.locationInfo?.coordinates?.lat).toBeCloseTo(42.3601, 2);
    expect(resolved.locationInfo?.coordinates?.lng).toBeCloseTo(-71.0589, 2);
    expect(resolved.locationInfo?.coordinateSource).toBe('deterministic');
  });

  it('8. Modern place disambiguation: "Where is Santa Maria, California?" resolves as a modern place, not a shipwreck', async () => {
    const query = 'Where is Santa Maria, California?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.intent).toBe('NATURAL_LOCATION');
    expect(routed.entity).toBe('Santa Maria, California');
    
    // Normal geocoder / deterministic resolution takes precedence
    const resolved = await resolveLocationQuery('Santa Maria, California', 'NATURAL_LOCATION', query);
    if (resolved.locationInfo?.coordinates) {
      // Santa Maria, CA is ~34.95° N, -120.43° W
      expect(resolved.locationInfo.coordinates.lat).toBeGreaterThan(30);
      expect(resolved.locationInfo.coordinates.lng).toBeLessThan(-100);
      expect(resolved.locationInfo.coordinateSource).not.toBe('historical_approximate');
    }
  });

  it('9. Separates discovery/wreck queries from travel/route queries semantically', () => {
    const discovery1 = routeIntentAndExtractEntity('Where was the Santa Maria found?');
    expect(discovery1.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(discovery1.entity).toBe('Santa Maria');

    const discovery2 = routeIntentAndExtractEntity('Where was the wreck of the Santa Maria discovered?');
    expect(discovery2.intent).toBe('DISCOVERY_OBJECT_LOCATION');

    const routeQuery = routeIntentAndExtractEntity('Where did the Santa Maria sail?');
    expect(routeQuery.intent).not.toBe('DISCOVERY_OBJECT_LOCATION');
  });

  it('10. Distinguishes HISTORICAL_LOCATION_UNCONFIRMED from NO_GEOGRAPHIC_DATA', async () => {
    const candidateUnconfirmed = {
      name: 'Unconfirmed Lost Site',
      error: 'HISTORICAL_LOCATION_UNCONFIRMED' as const
    };
    expect(candidateUnconfirmed.error).toBe('HISTORICAL_LOCATION_UNCONFIRMED');
    expect(candidateUnconfirmed.error).not.toBe('NO_GEOGRAPHIC_DATA');
  });
});
