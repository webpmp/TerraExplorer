import { describe, it, expect } from 'vitest';
import { getEstimatedClimate, isClimateGeographicallyValid, getClimateDescription } from '../geographic/climateEstimator';
import { sanitizeLocationInfo } from '../geminiService';

describe('Climate Classification Geographic Accuracy', () => {
  describe('1. Florida & Southeastern US Accuracy', () => {
    it('accurately classifies Jacksonville, FL as Humid Subtropical (Cfa), NOT Semi-Arid (BSk)', () => {
      // Jacksonville, FL coords: 30.3322, -81.6557
      const climate = getEstimatedClimate(30.3322, -81.6557, 'Florida', 'United States', 'city');
      expect(climate.koppenCode).toBe('Cfa');
      expect(climate.climateName).toBe('Humid Subtropical');
      expect(climate.confidence).toBe('high');
    });

    it('accurately classifies Paynes Prairie Preserve State Park as Humid Subtropical (Cfa)', () => {
      // Paynes Prairie, FL coords: 29.5636, -82.3275
      const climate = getEstimatedClimate(29.5636, -82.3275, 'Florida', 'United States', 'state_park');
      expect(climate.koppenCode).toBe('Cfa');
      expect(climate.climateName).toBe('Humid Subtropical');
    });

    it('accurately classifies South Florida (Miami / Everglades) as Tropical Savanna (Aw)', () => {
      // Miami coords: 25.7617, -80.1918
      const climate = getEstimatedClimate(25.7617, -80.1918, 'Florida', 'United States', 'city');
      expect(climate.koppenCode).toBe('Aw');
      expect(climate.climateName).toBe('Tropical Savanna');
    });

    it('accurately classifies Atlanta, GA and Southeast US as Humid Subtropical (Cfa)', () => {
      // Atlanta, GA: 33.7490, -84.3880
      const climate = getEstimatedClimate(33.7490, -84.3880, 'Georgia', 'United States', 'city');
      expect(climate.koppenCode).toBe('Cfa');
      expect(climate.climateName).toBe('Humid Subtropical');
    });
  });

  describe('2. Climate Geographic Validation & Invalidation Rules', () => {
    it('rejects BSk (Cold Semi-Arid) for Florida coordinates', () => {
      expect(isClimateGeographicallyValid('BSk', 30.3322, -81.6557, 'Florida', 'United States')).toBe(false);
      expect(isClimateGeographicallyValid('BSk', 29.5636, -82.3275, 'Florida', 'United States')).toBe(false);
      expect(isClimateGeographicallyValid('Cfa', 30.3322, -81.6557, 'Florida', 'United States')).toBe(true);
    });

    it('rejects BSk for East Coast Australia (Sydney)', () => {
      expect(isClimateGeographicallyValid('BSk', -33.8688, 151.2093, 'New South Wales', 'Australia')).toBe(false);
      expect(isClimateGeographicallyValid('Cfa', -33.8688, 151.2093, 'New South Wales', 'Australia')).toBe(true);
    });

    it('rejects Polar/Tundra in equatorial lowlands', () => {
      expect(isClimateGeographicallyValid('ET', 0.0, 100.0, 'Sumatra', 'Indonesia')).toBe(false);
      expect(isClimateGeographicallyValid('Af', 0.0, 100.0, 'Sumatra', 'Indonesia')).toBe(true);
    });
  });

  describe('3. SanitizeLocationInfo Geographic Correction', () => {
    it('corrects geographically impossible climate returned by model for Florida', () => {
      const mockData: any = {
        name: 'Paynes Prairie Preserve State Park',
        coordinates: { lat: 29.5636, lng: -82.3275 },
        state: 'Florida',
        country: 'United States',
        entityType: 'state_park',
        climate: {
          name: 'Semi-Arid',
          description: 'Dry grassland with low rainfall.',
          koppenCode: 'BSk'
        }
      };

      sanitizeLocationInfo(mockData);

      expect(mockData.climate.koppenCode).toBe('Cfa');
      expect(mockData.climate.name).toMatch(/Humid Subtropical/i);
      expect(mockData.climate.description).toMatch(/Humid subtropical conditions/i);
    });
  });
});
