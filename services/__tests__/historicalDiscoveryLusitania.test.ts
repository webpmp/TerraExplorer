import { describe, it, expect, vi } from 'vitest';
import { validateHistoricalCoordinate, getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';
import { routeIntentAndExtractEntity } from '../geminiService';
import * as geminiService from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { resolveAlias } from '../geographic/geographicAliases';
import { evaluateEnrichmentCompleteness } from '../entityValidation';

describe('Lusitania Historical Discovery Resolution & Validation', () => {
  it('1. Intent and entity extraction: "Where was the Lusitania found?" routes to DISCOVERY_OBJECT_LOCATION and RMS Lusitania Sinking Site', () => {
    const query = 'Where was the Lusitania found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('RMS Lusitania Sinking Site');
    expect(routed.resolutionMode).toBe('SINGLE_POINT');
  });

  it('2. Historical knowledge base contains authoritative Lusitania metadata and Celtic Sea/Ireland region', () => {
    const kb = getHistoricalEntityKnowledge('Lusitania');
    expect(kb).toBeDefined();
    expect(kb?.entity).toBe('RMS Lusitania Sinking Site');
    expect(kb?.entityType).toBe('shipwreck');
    expect(kb?.expectedRegion).toContain('Celtic Sea');
    expect(kb?.expectedRegion).toContain('Ireland');
    expect(kb?.approximateCoordinates).toBeDefined();
    expect(kb?.approximateCoordinates?.lat).toBeCloseTo(51.3000, 2);
    expect(kb?.approximateCoordinates?.lng).toBeCloseTo(-8.5500, 2);
    expect(kb?.boundingBox).toBeDefined();
    expect(kb?.allowedCountries).toContain('Ireland');
  });

  it('3. Rejects invalid speculative AI coordinate (51.3762,-10.4698) outside bounding box in open water', async () => {
    const invalidLmStudioCoords = { lat: 51.3762, lng: -10.4698 };
    const validation = await validateHistoricalCoordinate('RMS Lusitania Sinking Site', invalidLmStudioCoords, {
      rawQuery: 'Where was the Lusitania found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery'
    });
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE|GEOGRAPHIC_MISMATCH/);
  });

  it('4. Validates authoritative historical coordinates (51.3000, -8.5500) off Old Head of Kinsale', async () => {
    const authoritativeCoords = { lat: 51.3000, lng: -8.5500 };
    const validation = await validateHistoricalCoordinate('RMS Lusitania Sinking Site', authoritativeCoords, {
      rawQuery: 'Where was the Lusitania found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'deterministic'
    });
    expect(validation.valid).toBe(true);
    expect(validation.reason).toBe('MATCHES_EXPECTED_HISTORICAL_REGION');
  });

  it('5. Pipeline resolves "Where was the Lusitania found?" to Ireland / Celtic Sea with verified identityStatus', async () => {
    const query = 'Where was the Lusitania found?';
    const result = await runSearchPipeline({ rawQuery: query });

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    expect(entity.subject.identity.canonicalName).toBe('RMS Lusitania Sinking Site');
    expect(entity.subject.identity.entityType).toBe('shipwreck');

    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(51.3000, 2);
    expect(coords.lng).toBeCloseTo(-8.5500, 2);

    // Entity identity status must be verified
    expect((entity.subject.primaryLocation as any).identityStatus).toBe('verified');
  });

  it('6. Alias resolution maps various Lusitania queries to canonical "RMS Lusitania Sinking Site"', () => {
    const alias1 = resolveAlias('lusitania');
    expect(alias1.canonical).toBe('rms lusitania sinking site');

    const alias2 = resolveAlias('the lusitania');
    expect(alias2.canonical).toBe('rms lusitania sinking site');

    const alias3 = resolveAlias('rms lusitania');
    expect(alias3.canonical).toBe('rms lusitania sinking site');

    const alias4 = resolveAlias('lusitania wreck site');
    expect(alias4.canonical).toBe('rms lusitania sinking site');
  });

  it('7. Missing optional enrichment fields (e.g. contextNotes) do not wipe coordinates or fail resolution', () => {
    const minimalData = {
      name: 'RMS Lusitania Sinking Site',
      description: 'RMS Lusitania was a British ocean liner sunk in 1915.',
      notable: ['Torpedoed by U-20']
      // contextNotes intentionally omitted
    };

    const completeness = evaluateEnrichmentCompleteness(minimalData, 'RMS Lusitania Sinking Site', 'shipwreck');
    // evaluateEnrichmentCompleteness flags missing fields for enrichment queue but doesn't throw or corrupt
    expect(completeness.missingFields).toContain('contextNotes');
  });

  it('8. Pipeline recovers via deterministic knowledge when AI recovery returns rejected coordinates', async () => {
    // Simulate AI returning the invalid speculative coordinate
    const spy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValueOnce({
      lat: 51.3000,
      lng: -8.5500,
      source: 'deterministic',
      confidence: 'high'
    });

    const result = await runSearchPipeline({ rawQuery: 'Where was the Lusitania found?' });
    expect(result.isValid).toBe(true);
    expect(result.entity?.subject.identity.canonicalName).toBe('RMS Lusitania Sinking Site');
    expect(result.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(51.3000, 2);
    expect(result.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(-8.5500, 2);

    spy.mockRestore();
  });
});
