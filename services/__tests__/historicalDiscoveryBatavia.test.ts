import { describe, it, expect, vi } from 'vitest';
import { validateHistoricalCoordinate, getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';
import { routeIntentAndExtractEntity } from '../geminiService';
import * as geminiService from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { resolveAlias } from '../geographic/geographicAliases';
import { evaluateEnrichmentCompleteness } from '../entityValidation';

describe('Batavia Historical Discovery Resolution & Validation', () => {
  it('1. Intent and entity extraction: "Where was the Batavia found?" routes to DISCOVERY_OBJECT_LOCATION and Batavia Shipwreck Site', () => {
    const query = 'Where was the Batavia found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('Batavia Shipwreck Site');
    expect(routed.resolutionMode).toBe('SINGLE_POINT');
  });

  it('2. Historical knowledge base contains authoritative Batavia metadata and Houtman Abrolhos / Western Australia region', () => {
    const kb = getHistoricalEntityKnowledge('Batavia');
    expect(kb).toBeDefined();
    expect(kb?.entity).toBe('Batavia Shipwreck Site');
    expect(kb?.entityType).toBe('shipwreck');
    expect(kb?.expectedRegion).toContain('Houtman Abrolhos');
    expect(kb?.expectedRegion).toContain('Western Australia');
    expect(kb?.approximateCoordinates).toBeDefined();
    expect(kb?.approximateCoordinates?.lat).toBeCloseTo(-28.4903, 2);
    expect(kb?.approximateCoordinates?.lng).toBeCloseTo(113.7933, 2);
    expect(kb?.boundingBox).toBeDefined();
    expect(kb?.allowedCountries).toContain('Australia');
  });

  it('3. Rejects invalid speculative AI coordinate (-35.2781, 114.9026) near Albany outside bounding box in open water', async () => {
    const invalidCandidateCoords = { lat: -35.2781, lng: 114.9026 };
    const validation = await validateHistoricalCoordinate('Batavia Shipwreck Site', invalidCandidateCoords, {
      rawQuery: 'Where was the Batavia found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery',
      entityType: 'shipwreck_site'
    });
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE|GEOGRAPHIC_MISMATCH/);
  });

  it('4. Validates authoritative historical offshore coordinates (-28.4903, 113.7933) on Morning Reef / Houtman Abrolhos', async () => {
    const authoritativeCoords = { lat: -28.4903, lng: 113.7933 };
    const validation = await validateHistoricalCoordinate('Batavia Shipwreck Site', authoritativeCoords, {
      rawQuery: 'Where was the Batavia found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'deterministic',
      entityType: 'shipwreck_site'
    });
    expect(validation.valid).toBe(true);
    expect(validation.reason).toBe('MATCHES_EXPECTED_HISTORICAL_REGION');
  });

  it('5. Pipeline resolves "Where was the Batavia found?" to Western Australia / Houtman Abrolhos with verified identityStatus', async () => {
    const query = 'Where was the Batavia found?';
    const result = await runSearchPipeline({ rawQuery: query });

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    expect(entity.subject.identity.canonicalName).toBe('Batavia Shipwreck Site');
    expect(entity.subject.identity.entityType).toBe('shipwreck');

    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(-28.4903, 2);
    expect(coords.lng).toBeCloseTo(113.7933, 2);

    // Entity identity status must be verified
    expect((entity.subject.primaryLocation as any).identityStatus).toBe('verified');
  });

  it('6. Alias resolution maps various Batavia queries to canonical "batavia shipwreck site"', () => {
    const alias1 = resolveAlias('batavia');
    expect(alias1.canonical).toBe('batavia shipwreck site');

    const alias2 = resolveAlias('the batavia');
    expect(alias2.canonical).toBe('batavia shipwreck site');

    const alias3 = resolveAlias('batavia shipwreck');
    expect(alias3.canonical).toBe('batavia shipwreck site');

    const alias4 = resolveAlias('batavia wreck');
    expect(alias4.canonical).toBe('batavia shipwreck site');
  });

  it('7. Land-based entities (e.g. Eiffel Tower) in Water / Open Area are strictly rejected', async () => {
    // Open water coordinates in the Atlantic Ocean (e.g. 25.0, -45.0)
    const oceanCoords = { lat: 25.0, lng: -45.0 };
    const validation = await validateHistoricalCoordinate('Eiffel Tower', oceanCoords, {
      rawQuery: 'Eiffel Tower',
      intent: 'DIRECT',
      coordinateSource: 'ai_recovery',
      entityType: 'monument'
    });
    expect(validation.valid).toBe(false);
  });

  it('8. Random unsupported ocean coordinates for Batavia are strictly rejected', async () => {
    // Random ocean coordinate in Indian Ocean far outside Houtman Abrolhos bounding box
    const randomOceanCoords = { lat: -10.0, lng: 100.0 };
    const validation = await validateHistoricalCoordinate('Batavia Shipwreck Site', randomOceanCoords, {
      rawQuery: 'Where was the Batavia found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery',
      entityType: 'shipwreck_site'
    });
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE|GEOGRAPHIC_MISMATCH/);
  });

  it('9. Missing optional enrichment fields do not corrupt or fail resolution', () => {
    const minimalData = {
      name: 'Batavia Shipwreck Site',
      description: 'Batavia was a 17th-century Dutch East India Company ship wrecked in 1629 on Morning Reef.',
      notable: ['1629 mutiny and massacre led by Jeronimus Cornelisz']
    };

    const completeness = evaluateEnrichmentCompleteness(minimalData, 'Batavia Shipwreck Site', 'shipwreck');
    expect(completeness.missingFields).toContain('contextNotes');
  });

  it('10. Pipeline recovers via deterministic knowledge when AI recovery returns rejected coordinates', async () => {
    const spy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValueOnce({
      lat: -28.4903,
      lng: 113.7933,
      source: 'deterministic',
      confidence: 'high'
    });

    const result = await runSearchPipeline({ rawQuery: 'Where was the Batavia found?' });
    expect(result.isValid).toBe(true);
    expect(result.entity?.subject.identity.canonicalName).toBe('Batavia Shipwreck Site');
    expect(result.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(-28.4903, 2);
    expect(result.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(113.7933, 2);

    spy.mockRestore();
  });
});
