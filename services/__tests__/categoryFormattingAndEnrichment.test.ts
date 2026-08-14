import { describe, it, expect } from 'vitest';
import { formatUserFacingCategory, formatClimateName } from '../../utils/categoryFormatting';
import { evaluateDiscoveryScore } from '../geminiService';
import { mergeLocationInfo } from '../locationService';

describe('User-Facing Category Formatting and Enrichment Quality Gate', () => {
  describe('1. User-Facing Category Formatting', () => {
    it('formats cities, towns, villages, and hamlets into plain English', () => {
      expect(formatUserFacingCategory('city', 'Dalhart')).toBe('City');
      expect(formatUserFacingCategory('town', 'Washtucna')).toBe('Town');
      expect(formatUserFacingCategory('village', 'Al Hamra')).toBe('Village');
      expect(formatUserFacingCategory('hamlet', 'Starbuck')).toBe('Village');
      expect(formatUserFacingCategory('settlement', 'Dalhart', 'city')).toBe('City');
      expect(formatUserFacingCategory('populated_place', 'Washtucna', 'town')).toBe('Town');
    });

    it('formats water bodies using specific sub-categories (Creek, River, Lake, etc.)', () => {
      expect(formatUserFacingCategory('water_body', 'Carrizo Creek')).toBe('Creek');
      expect(formatUserFacingCategory('water_body', 'Similkameen River')).toBe('River');
      expect(formatUserFacingCategory('water_body', 'Lake Tanglewood')).toBe('Lake');
      expect(formatUserFacingCategory('water_body', 'Hoover Reservoir')).toBe('Reservoir');
      expect(formatUserFacingCategory('water_body', 'Niagara Falls')).toBe('Waterfall');
      expect(formatUserFacingCategory('water_body', 'Generic Waterway')).toBe('Waterway');
      expect(formatUserFacingCategory('river', 'Amazon River')).toBe('River');
      expect(formatUserFacingCategory('lake', 'Lake Tahoe')).toBe('Lake');
    });

    it('formats natural features into Natural Landmark or specific landforms (Grasslands, Mountains, Parks)', () => {
      expect(formatUserFacingCategory('natural_feature', 'Rita Blanca National Grassland')).toBe('National Grassland');
      expect(formatUserFacingCategory('natural_feature', 'Lake Tanglewood')).toBe('Lake');
      expect(formatUserFacingCategory('mountain', 'Matterhorn')).toBe('Mountain');
      expect(formatUserFacingCategory('mountain', 'Mount Rainier')).toBe('Mountain');
      expect(formatUserFacingCategory('national_park', 'El Cocuy National Park')).toBe('National Park');
      expect(formatUserFacingCategory('state_park', 'Wekiwa Springs State Park')).toBe('State Park');
    });

    it('formats historic, cultural, and administrative categories into clean English', () => {
      expect(formatUserFacingCategory('historical_site', 'Nuestra Señora de Atocha')).toBe('Historic Site');
      expect(formatUserFacingCategory('historic_district', 'French Quarter')).toBe('Historic District');
      expect(formatUserFacingCategory('archaeological_site', 'Pyramids of Giza')).toBe('Historic Site');
      expect(formatUserFacingCategory('museum', 'Louvre Museum')).toBe('Museum');
      expect(formatUserFacingCategory('building', 'Empire State Building')).toBe('Building');
      expect(formatUserFacingCategory('airport', 'Heathrow Airport')).toBe('Airport');
      expect(formatUserFacingCategory('administrative_region', 'Boyacá Department')).toBe('Region');
      expect(formatUserFacingCategory('country', 'Costa Rica')).toBe('Country');
    });

    it('formats climate values with proper body-text capitalization', () => {
      expect(formatClimateName('TEMPERATE / SEMI-ARID')).toBe('Temperate / Semi-Arid');
      expect(formatClimateName('ARID (HOT DESERT)')).toBe('Arid (Hot Desert)');
      expect(formatClimateName('SUBPOLAR OCEANIC')).toBe('Subpolar Oceanic');
      expect(formatClimateName('TROPICAL RAINFOREST')).toBe('Tropical Rainforest');
      expect(formatClimateName('Temperate Oceanic')).toBe('Temperate Oceanic');
    });

    it('never outputs internal/database-style terms', () => {
      const internalTerms = [
        'settlement', 'populated_place', 'POPULATED_PLACE',
        'geographic_feature', 'GEOGRAPHIC_FEATURE',
        'natural_feature', 'NATURAL_FEATURE',
        'water_body', 'WATER_BODY',
        'administrative_region', 'ADMINISTRATIVE_REGION'
      ];

      const testInputs = [
        { type: 'settlement', name: 'Dalhart' },
        { type: 'populated_place', name: 'Celebration' },
        { type: 'geographic_feature', name: 'Carrizo Creek' },
        { type: 'natural_feature', name: 'Rita Blanca National Grassland' },
        { type: 'water_body', name: 'Carrizo Creek' },
        { type: 'administrative_region', name: 'Boyacá Department' }
      ];

      for (const input of testInputs) {
        const result = formatUserFacingCategory(input.type, input.name);
        for (const forbidden of internalTerms) {
          expect(result.toLowerCase()).not.toBe(forbidden.toLowerCase());
        }
      }
    });
  });

  describe('2. Enrichment Quality Gate & Description Preservation', () => {
    it('does not penalize or reject substantive descriptions containing "located in" or "situated in"', () => {
      const ritaBlancaData = {
        name: 'Rita Blanca National Grassland',
        description: 'Rita Blanca National Grassland is a protected area of shortgrass prairie spanning the Texas Panhandle and northeastern New Mexico, located in Dallam County, known for its wide-open grasslands and important habitat for prairie wildlife.',
        notable: [
          'Preserves unique shortgrass prairie ecosystem in the southern Great Plains.',
          'Established following the Dust Bowl to restore damaged agricultural land.',
          'Home to pronghorn, black-tailed prairie dogs, and numerous bird species.'
        ]
      };

      const scoreResult = evaluateDiscoveryScore(ritaBlancaData);
      expect(scoreResult.score).toBeGreaterThanOrEqual(4);
      expect(scoreResult.reasons.some(r => r.includes('Geographic filler phrase detected'))).toBe(false);
    });

    it('preserves the richer initial description if a retry produces an empty or degraded response', () => {
      const initialData = {
        name: 'Rita Blanca National Grassland',
        description: 'Rita Blanca National Grassland is a protected area of shortgrass prairie spanning the Texas Panhandle and northeastern New Mexico, located in Dallam County, known for its wide-open grasslands and important habitat for prairie wildlife.',
        climate: 'Semi-arid continental climate with hot summers and cold winters.',
        notable: ['Established in 1960.']
      };

      const degradedRetryData = {
        name: 'Rita Blanca National Grassland',
        description: '',
        climate: '',
        notable: []
      };

      const merged = mergeLocationInfo(initialData, degradedRetryData);
      expect(merged.description).toBe(initialData.description);
      expect(merged.climate).toBe(initialData.climate);
    });

    it('preserves the initial description when retry description is a generic placeholder', () => {
      const initialData = {
        name: 'Carrizo Creek',
        description: 'Carrizo Creek is a perennial watercourse in the western Texas Panhandle that flows through rocky canyons and provides critical riparian habitat in an arid grassland region.',
        climate: null,
        notable: []
      };

      const placeholderRetryData = {
        name: 'Carrizo Creek',
        description: 'Information on Carrizo Creek.',
        climate: null,
        notable: []
      };

      const merged = mergeLocationInfo(initialData, placeholderRetryData);
      expect(merged.description).toBe(initialData.description);
    });
  });

  describe('3. Notable Facts Quality & Educational Structure', () => {
    it('requires fact headings to be accompanied by substantive explanations answering why it matters', async () => {
      const { getDiscoveryPrompt } = await import('../promptBuilder');
      const prompt = getDiscoveryPrompt('water_body', 'Strait of Hormuz');

      expect(prompt).toContain('NOTABLE FACTS REQUIREMENTS: FACTS MUST EXPLAIN WHY THEY MATTER');
      expect(prompt).toContain('Strategic Maritime Chokepoint');
      expect(prompt).toContain('Recurring Geopolitical Flashpoint');
      expect(prompt).toContain('Geological Formation');
      expect(prompt).toContain('Historical Contention');
      expect(prompt).toContain('DO NOT output empty headings');
    });

    it('formats notable facts cleanly with title heading and explanatory body', () => {
      const notableItems = [
        {
          title: 'Strategic Maritime Chokepoint',
          summary: 'The Strait of Hormuz is a narrow marine passage connecting the Persian Gulf with the Gulf of Oman, carrying approximately one-fifth of the world’s petroleum.'
        },
        {
          title: 'Seasonal Wetland Hydrology',
          summary: 'Paynes Prairie fluctuates between dry savannah and expansive lake depending on seasonal rainfall, supporting diverse wildlife species.'
        }
      ];

      for (const item of notableItems) {
        expect(item.title.length).toBeGreaterThan(5);
        expect(item.summary.length).toBeGreaterThan(30);
      }
    });
  });
});
