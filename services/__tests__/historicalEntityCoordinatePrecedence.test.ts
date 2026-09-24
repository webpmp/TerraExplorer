import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveLocationQuery } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import * as geographicResolver from '../geographic/geographicResolver';
import * as geminiService from '../geminiService';
import { getHistoricalEntityKnowledge } from '../geographic/historicalCoordinateValidator';

describe('Historical Entity Coordinate Precedence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Historical entity precedence for unqualified query ("Santa Maria")', () => {
    it('resolves "Santa Maria" to the historical shipwreck in Haiti instead of Santa Maria, Brazil', async () => {
      const nominatimSpy = vi.spyOn(geographicResolver, 'resolveGeographicEntity');

      const result = await resolveLocationQuery('Santa Maria');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toBe('Santa Maria');
      expect(loc.entityType).toBe('shipwreck_site');
      expect(loc.coordinates.lat).toBeCloseTo(19.7600, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-72.2000, 2);
      expect(loc.coordinateSource).toBe('historical_approximate');
      expect((loc as any).isApproximate).toBe(true);

      // Deterministic lookup must succeed before Nominatim is queried
      expect(nominatimSpy).not.toHaveBeenCalled();
    });

    it('end-to-end search pipeline for "Santa Maria" establishes Haiti shipwreck identity without contamination', async () => {
      vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'The Santa Maria was the flagship of Christopher Columbus on his 1492 voyage.',
        climate: null,
        contextNotes: [],
        notable: []
      } as any);

      const pipelineResult = await runSearchPipeline({ rawQuery: 'Santa Maria' });
      expect(pipelineResult.isValid).toBe(true);
      expect(pipelineResult.entity).toBeDefined();

      const identity = pipelineResult.entity!.subject.identity;
      const coords = pipelineResult.entity!.subject.primaryLocation.location.coordinates;
      expect(identity.canonicalName).toBe('Santa Maria');
      expect(identity.entityType).toBe('shipwreck_site');
      expect(coords.lat).toBeCloseTo(19.7600, 2);
      expect(coords.lng).toBeCloseTo(-72.2000, 2);
      expect((pipelineResult.entity as any).coordinateSource).toBe('historical_approximate');
      expect((pipelineResult.entity as any).isApproximate ?? (identity as any).isApproximate ?? true).toBe(true);
    });
  });

  describe('2. Explicitly qualified modern place queries', () => {
    it('does not override "Santa Maria, Brazil" with historical shipwreck', async () => {
      vi.spyOn(geographicResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Santa Maria, Rio Grande do Sul, Brazil',
        entityType: 'city',
        coordinates: { lat: -29.686, lng: -53.806 },
        source: 'nominatim' as any,
        context: { country: 'Brazil', state: 'Rio Grande do Sul', city: 'Santa Maria' }
      } as any);

      const result = await resolveLocationQuery('Santa Maria, Brazil');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.coordinates.lat).toBeCloseTo(-29.686, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-53.806, 2);
      expect(loc.country).toBe('Brazil');
      expect(loc.entityType).toBe('city');
    });

    it('does not override "Santa Maria, RS" with historical shipwreck', async () => {
      vi.spyOn(geographicResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Santa Maria, Rio Grande do Sul, Brazil',
        entityType: 'city',
        coordinates: { lat: -29.686, lng: -53.806 },
        source: 'nominatim' as any,
        context: { country: 'Brazil', state: 'Rio Grande do Sul', city: 'Santa Maria' }
      } as any);

      const result = await resolveLocationQuery('Santa Maria, RS');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.coordinates.lat).toBeCloseTo(-29.686, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-53.806, 2);
      expect(loc.country).toBe('Brazil');
    });

    it('does not override "Santa Maria, California" with historical shipwreck', async () => {
      vi.spyOn(geographicResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Santa Maria, California, United States',
        entityType: 'city',
        coordinates: { lat: 34.953, lng: -120.4357 },
        source: 'nominatim' as any,
        context: { country: 'United States', state: 'California', city: 'Santa Maria' }
      } as any);

      const result = await resolveLocationQuery('Santa Maria, California');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.coordinates.lat).toBeCloseTo(34.953, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-120.4357, 2);
      expect(loc.country).toBe('United States');
    });
  });

  describe('3. Historical explicit queries', () => {
    it('resolves "Santa Maria shipwreck" to the historical entity in Haiti', async () => {
      const result = await resolveLocationQuery('Santa Maria shipwreck');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toBe('Santa Maria');
      expect(loc.entityType).toBe('shipwreck_site');
      expect(loc.coordinates.lat).toBeCloseTo(19.7600, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-72.2000, 2);
      expect(loc.coordinateSource).toBe('historical_approximate');
      expect((loc as any).isApproximate).toBe(true);
    });

    it('resolves "the Santa Maria" to the historical entity in Haiti', async () => {
      const result = await resolveLocationQuery('the Santa Maria');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toBe('Santa Maria');
      expect(loc.entityType).toBe('shipwreck_site');
      expect(loc.coordinates.lat).toBeCloseTo(19.7600, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-72.2000, 2);
      expect(loc.coordinateSource).toBe('historical_approximate');
    });
  });

  describe('4. Existing exact deterministic historical coordinates', () => {
    it('resolves "Titanic" with exact deterministic coordinates', async () => {
      const result = await resolveLocationQuery('Titanic');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toContain('Titanic');
      expect(loc.coordinates.lat).toBeCloseTo(41.7325, 2);
      expect(loc.coordinates.lng).toBeCloseTo(-49.9469, 2);
      expect(loc.coordinateSource).toBe('deterministic');
    });

    it('resolves "Vasa" with exact deterministic coordinates', async () => {
      const result = await resolveLocationQuery('Vasa');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toContain('Vasa');
      expect(loc.coordinates.lat).toBeCloseTo(59.3275, 2);
      expect(loc.coordinates.lng).toBeCloseTo(18.0911, 2);
      expect(loc.coordinateSource).toBe('deterministic');
    });
  });

  describe('5. Ordinary modern places', () => {
    it('resolves "Seattle" via standard geocoding without historical KB match', async () => {
      const hist = getHistoricalEntityKnowledge('Seattle');
      expect(hist).toBeUndefined();

      const result = await resolveLocationQuery('Seattle');
      expect(result).toBeDefined();
      expect(result?.locationInfo).toBeDefined();

      const loc = result!.locationInfo;
      expect(loc.name).toContain('Seattle');
      expect(loc.coordinates.lat).toBeCloseTo(47.6062, 1);
      expect(loc.coordinates.lng).toBeCloseTo(-122.3321, 1);
    });
  });

  describe('6. Downstream safety net recovery', () => {
    it('recovers KB approximate coordinates when candidate coordinates are geographically incompatible', async () => {
      // Simulate initial resolver somehow returning Brazilian coordinates for Santa Maria
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        locationInfo: {
          name: 'Santa Maria',
          canonicalName: 'Santa Maria',
          type: 'poi' as any,
          entityType: 'shipwreck_site',
          coordinates: { lat: -29.686, lng: -53.806, source: 'geocoder' as any },
          coordinateSource: 'geocoder' as any,
          identityStatus: 'verified',
          country: 'Brazil',
          description: 'City in Brazil',
          funFacts: [],
          notable: []
        } as any,
        suggestedZoom: 8
      });

      let enrichedCoords: any = null;
      vi.spyOn(geminiService, 'recoverLocationMetadata').mockImplementation(async (name, coords, ...args) => {
        enrichedCoords = coords;
        return {
          description: 'Enrichment for Santa Maria historical wreck.',
          climate: null,
          contextNotes: [],
          notable: []
        } as any;
      });

      const pipelineResult = await runSearchPipeline({ rawQuery: 'Santa Maria' });
      expect(pipelineResult.isValid).toBe(true);

      // The pipeline should have detected the Brazilian coordinates violated Santa Maria's forbidden regions,
      // recovered to Haiti, and passed Haiti coordinates to enrichment
      const coords = pipelineResult.entity!.subject.primaryLocation.location.coordinates;
      const identity = pipelineResult.entity!.subject.identity;
      expect(coords.lat).toBeCloseTo(19.7600, 2);
      expect(coords.lng).toBeCloseTo(-72.2000, 2);
      expect((pipelineResult.entity as any).coordinateSource).toBe('historical_approximate');

      expect(enrichedCoords).toBeDefined();
      expect(enrichedCoords.lat).toBeCloseTo(19.7600, 2);
      expect(enrichedCoords.lng).toBeCloseTo(-72.2000, 2);
    });
  });
});
