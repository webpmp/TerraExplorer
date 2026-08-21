import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichSettlementPopulation, isPopulationBearingEntity, resolveGeographicMetadata } from '../geographic/geographicResolver';
import { IntentStage, ResolutionStage } from '../pipeline';
import { getPopulationLabel } from '../../components/InfoPanel';
import * as geminiService from '../geminiService';

describe('Authoritative Population Pipeline & Resolution Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Gainesville, Florida Resolution & City-Scoping', () => {
    it('resolves Gainesville, Florida to the correct city population entity (~141,085) and not 1,500 or county/metro numbers', async () => {
      vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: { text: 'Gainesville is a prominent city in north central Florida, home to the University of Florida.' } as any,
        climate: { name: 'Humid subtropical climate', description: 'Humid subtropical climate.' } as any,
        notable: [{ title: 'University of Florida', description: 'Major research institution.' }],
        contextNotes: ['Alachua County seat']
      });

      const intentRes = IntentStage('Gainesville, Florida');
      const finalRes = await ResolutionStage(intentRes);

      expect(finalRes.isValid).toBe(true);
      const entity = finalRes.entity;
      expect(entity?.subject.identity.canonicalName).toBe('Gainesville, Florida');
      
      const pop = entity?.metadata?.population as any;
      expect(pop).toBeDefined();
      expect(pop.value).toBe(141085);
      expect(pop.value).not.toBe(1500);
      expect(pop.source).not.toBe('ai');
      
      const label = getPopulationLabel(pop.current || pop);
      expect(label).not.toContain('Modern');
      expect(label).not.toContain('Population');
      expect(label).toBe('2020 Census');
    });

    it('disambiguates Gainesville, FL from other settlements named Gainesville (e.g., small villages in NY or MO) using state/context and coordinates', async () => {
      // Mock global fetch for Nominatim search returning multiple Gainesville places across different states
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('nominatim.openstreetmap.org/search')) {
          return {
            ok: true,
            json: async () => [
              {
                name: 'Gainesville',
                display_name: 'Gainesville, Wyoming County, New York, United States',
                type: 'village',
                category: 'place',
                lat: '42.6395',
                lon: '-78.1347',
                extratags: { population: '1500', 'population:date': '2020' }
              },
              {
                name: 'Gainesville',
                display_name: 'Gainesville, Alachua County, Florida, United States',
                type: 'city',
                category: 'place',
                lat: '29.6516',
                lon: '-82.3248',
                extratags: { population: '141085', 'population:date': '2020' }
              }
            ]
          } as any;
        }
        return originalFetch(url);
      });

      const marker = {
        name: 'Gainesville',
        state: 'Florida',
        country: 'United States',
        type: 'city',
        lat: 29.6516,
        lng: -82.3248
      };
      const result: any = { ...marker };

      await enrichSettlementPopulation(result, marker, 'city');
      
      // Must match Florida Gainesville (141,085), NOT New York village (1,500)
      expect(result.population?.value).toBe(141085);
      expect(result.population?.value).not.toBe(1500);
      expect(result.population?.current?.formattedValue).toBe('141,085');
      expect(result.population?.year).toBe(2020);
      expect(result.population?.label).not.toContain('Population');
      expect(result.population?.label).toBe('2020 Estimate');
    });
  });

  describe('2. Modern Label Deprecation & Secondary Label Calculation (Never contains "Population")', () => {
    it('returns "Current Estimate" for current/recent estimates without year', () => {
      expect(getPopulationLabel({ formattedValue: '50,000' })).toBe('Current Estimate');
      expect(getPopulationLabel({ formattedValue: '50,000', label: 'Modern' })).toBe('Current Estimate');
      expect(getPopulationLabel({ formattedValue: '50,000', label: 'Modern Population' })).toBe('Current Estimate');
      expect(getPopulationLabel({ formattedValue: '50,000', label: 'Current Population' })).toBe('Current Estimate');
    });

    it('returns "2020 Census" when census year is specified', () => {
      expect(getPopulationLabel({ formattedValue: '141,085', censusYear: 2020 })).toBe('2020 Census');
      expect(getPopulationLabel({ formattedValue: '141,085', timeframe: '2020 Census' })).toBe('2020 Census');
      expect(getPopulationLabel({ formattedValue: '141,085', source: '2020 US Census' })).toBe('2020 Census');
      expect(getPopulationLabel({ formattedValue: '141,085', label: '2020 Census' })).toBe('2020 Census');
    });

    it('returns "YEAR Estimate" when an explicit estimate year is provided without duplicate Population', () => {
      expect(getPopulationLabel({ formattedValue: '145,000', year: 2025 })).toBe('2025 Estimate');
      expect(getPopulationLabel({ formattedValue: '140,000', year: 2022 })).toBe('2022 Estimate');
      expect(getPopulationLabel({ formattedValue: '100,000', timeframe: '2019' })).toBe('2019 Estimate');
    });
  });

  describe('3. Prevention of Hallucinated AI Population Data', () => {
    it('rejects AI-generated population from recoverLocationMetadata and omits population if structured data is unavailable', async () => {
      vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: { text: 'Substantive encyclopedic overview of the settlement.' } as any,
        climate: { name: 'Subtropical', description: 'Warm climate' } as any,
        population: { value: 1500, source: 'ai' } as any,
        notable: [],
        contextNotes: []
      });

      const intentRes = IntentStage('Fictional Place Without Real Census');
      const finalRes = await ResolutionStage(intentRes);

      // Population with source: 'ai' or invalid status must NOT leak into final entity
      if (finalRes.finalData?.population) {
        expect(finalRes.finalData.population.source).not.toBe('ai');
      }
    });

    it('omits population for non-settlement geographic features (mountains, lakes, parks)', async () => {
      expect(isPopulationBearingEntity('mountain', 'Matterhorn')).toBe(false);
      expect(isPopulationBearingEntity('lake', 'Lake Tahoe')).toBe(false);
      expect(isPopulationBearingEntity('canyon', 'Grand Canyon')).toBe(false);
      expect(isPopulationBearingEntity('national_park', 'Yellowstone')).toBe(false);

      const mountainResult: any = { name: 'Matterhorn', type: 'mountain' };
      await enrichSettlementPopulation(mountainResult, { lat: 45.97, lng: 7.65, name: 'Matterhorn' }, 'mountain');
      expect(mountainResult.population?.value).toBeNull();
      expect(mountainResult.population?.status).toBe('not_applicable');
    });
  });

  describe('4. Administrative Entity Boundary Isolation', () => {
    it('never inherits county, district, or state populations onto cities/settlements', async () => {
      // Mock reverse geocode returning Alachua County population for Gainesville coordinates
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('nominatim.openstreetmap.org/reverse')) {
          return {
            ok: true,
            json: async () => ({
              name: 'Alachua County',
              type: 'administrative',
              category: 'boundary',
              addresstype: 'county',
              extratags: { population: '278468' }
            })
          } as any;
        }
        return originalFetch(url);
      });

      const marker = { name: 'Gainesville', lat: 29.6516, lng: -82.3248, type: 'city' };
      const result: any = { ...marker };
      await enrichSettlementPopulation(result, marker, 'city');

      // Must NOT inherit county population 278,468
      expect(result.population?.value).not.toBe(278468);
    });
  });

  describe('5. Other Settlement Types (Towns, Villages, Municipalities)', () => {
    it('supports towns with verified population tags', async () => {
      const townMarker = {
        name: 'Sedona',
        type: 'town',
        lat: 34.8697,
        lng: -111.7609,
        population: 10339,
        tags: { 'population:date': '2020', 'census:date': '2020' }
      };
      const result: any = { ...townMarker };
      await enrichSettlementPopulation(result, townMarker, 'town');

      expect(result.population?.value).toBe(10339);
      expect(result.population?.year).toBe(2020);
      expect(result.population?.label).toBe('2020 Census');
      expect(result.population?.current?.formattedValue).toBe('10,339');
    });

    it('supports villages with verified population tags and rejects implausible numbers (>5M for villages)', async () => {
      const villageMarker = {
        name: 'Small Village',
        type: 'village',
        lat: 10.0,
        lng: 20.0,
        population: 500
      };
      const result: any = { ...villageMarker };
      await enrichSettlementPopulation(result, villageMarker, 'village');

      expect(result.population?.value).toBe(500);
      expect(result.population?.current?.formattedValue).toBe('500');

      // Implausible village population
      const corruptVillage = {
        name: 'Corrupt Village',
        type: 'village',
        lat: 10.0,
        lng: 20.0,
        population: 8000000
      };
      const corruptResult: any = { ...corruptVillage };
      await enrichSettlementPopulation(corruptResult, corruptVillage, 'village');
      expect(corruptResult.population?.value).toBeNull();
      expect(corruptResult.population?.status).toBe('lookup_failed');
    });
  });

  describe('6. Historical Population Preservation', () => {
    it('preserves historical population with explicit label and timeframe', async () => {
      const ancientMarker = {
        name: 'Pompeii',
        type: 'historical_site',
        lat: 40.75,
        lng: 14.48,
        population: {
          historical: {
            value: 20000,
            formattedValue: '20,000',
            timeframe: '79 CE',
            label: 'Historical'
          }
        }
      };

      const resolved = await resolveGeographicMetadata(ancientMarker as any);
      expect(resolved.population?.historical?.formattedValue).toBe('20,000');
      expect(resolved.population?.historical?.timeframe).toBe('79 CE');
      expect(resolved.population?.historical?.label).toBe('Historical');
    });
  });
});
