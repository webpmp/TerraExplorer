import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateHistoricalCoordinate,
  isMaritimeHistoricalEntity,
  getHistoricalEntityKnowledge
} from '../geographic/historicalCoordinateValidator';
import { routeIntentAndExtractEntity, recoverCoordinatesFromAi } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Antikythera Wreck & Maritime Discovery Coordinate Recovery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Intent routing & entity extraction: "Where was the Antikythera wreck found?" routes to DISCOVERY_OBJECT_LOCATION', () => {
    const query = 'Where was the Antikythera wreck found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity.toLowerCase()).toContain('antikythera');
    expect(routed.resolutionMode).toBe('SINGLE_POINT');
  });

  it('2. getHistoricalEntityKnowledge resolves "Antikythera Wreck" to canonical maritime discovery coordinates', () => {
    const kbDirect = getHistoricalEntityKnowledge('Antikythera Wreck');
    expect(kbDirect).toBeDefined();
    expect(kbDirect?.entityType).toBe('shipwreck_site');
    expect(kbDirect?.approximateCoordinates?.lat).toBeCloseTo(35.8622, 2);
    expect(kbDirect?.approximateCoordinates?.lng).toBeCloseTo(23.3000, 2);

    const kbThe = getHistoricalEntityKnowledge('The Antikythera Shipwreck');
    expect(kbThe).toBeDefined();
    expect(kbThe?.approximateCoordinates?.lat).toBeCloseTo(35.8622, 2);
  });

  it('3. isMaritimeHistoricalEntity detects maritime entity for shipwreck queries and entities', () => {
    expect(isMaritimeHistoricalEntity('Antikythera Wreck')).toBe(true);
    expect(isMaritimeHistoricalEntity('The Antikythera Shipwreck')).toBe(true);
    expect(isMaritimeHistoricalEntity({ entityType: 'shipwreck_site' })).toBe(true);
    expect(isMaritimeHistoricalEntity({ name: 'Antikythera Wreck', intent: 'DISCOVERY_OBJECT_LOCATION' })).toBe(true);
  });

  it('4. Nearby-land false positive rejection: does NOT accept inland Amorgos coordinate (36.8704, 25.9817)', async () => {
    // The incorrect AI coordinate that reverse-geocodes to inland Amorgos municipality
    const amorgosCandidate = { lat: 36.8704, lng: 25.9817 };

    const validation = await validateHistoricalCoordinate('Antikythera Wreck', amorgosCandidate, {
      rawQuery: 'Where was the Antikythera wreck found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      entityType: 'shipwreck_site',
      expectedRegion: 'Antikythera island / Aegean Sea, Greece',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
  });

  it('5. End-to-end recovery: recoverCoordinatesFromAi resolves Antikythera Wreck using grounded authoritative knowledge', async () => {
    const recovered = await recoverCoordinatesFromAi(
      'Where was the Antikythera wreck found?',
      'DISCOVERY_OBJECT_LOCATION',
      'Antikythera Wreck'
    );

    expect(recovered).not.toBeNull();
    expect(recovered?.lat).toBeCloseTo(35.8622, 2);
    expect(recovered?.lng).toBeCloseTo(23.3000, 2);
    expect(recovered?.entityType).toBe('shipwreck_site');
  });

  it('6. runSearchPipeline end-to-end: resolves "Where was the Antikythera wreck found?" to valid single location', async () => {
    const result = await runSearchPipeline({ rawQuery: 'Where was the Antikythera wreck found?' });
    expect(result.mode).toBe('location');
    expect(result.isValid).toBe(true);
    const coords = (result as any).finalData?.coordinates || (result as any).entity?.subject?.primaryLocation?.location?.coordinates;
    expect(coords).toBeDefined();
    expect(coords.lat).toBeCloseTo(35.8622, 2);
    expect(coords.lng).toBeCloseTo(23.3000, 2);
  });
});
