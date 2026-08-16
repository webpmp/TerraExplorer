import { describe, it, expect } from 'vitest';
import {
  validateImageCandidate,
  detectGeographicMismatch,
  isGenericFlagOrEmblem,
  buildEntityImageQueries,
  calculateHaversineDistanceKm,
  getEntityDistanceToleranceKm
} from '../imageService';

describe('Image Relevance & Validation System', () => {
  const forbiddenCityEntity = {
    name: 'Forbidden City',
    canonicalName: 'Forbidden City',
    city: 'Beijing',
    country: 'China',
    coordinates: { lat: 39.9172757, lng: 116.3907694 },
    entityType: 'landmark',
    aliases: ['Palace Museum', 'Gugong', '故宫', '紫禁城']
  };

  describe('1. Forbidden City Landmark Relevance Verification', () => {
    it('accepts authentic Forbidden City imagery in Beijing', () => {
      const candidates = [
        {
          url: 'https://upload.wikimedia.org/forbidden_city_hall_supreme_harmony.jpg',
          title: 'Forbidden City, Beijing',
          description: 'The Hall of Supreme Harmony in the Forbidden City, Beijing, China.',
          coordinates: { lat: 39.9172, lng: 116.3908 }
        },
        {
          url: 'https://upload.wikimedia.org/palace_museum_gate.jpg',
          title: 'Palace Museum Meridian Gate',
          description: 'Meridian Gate of the Palace Museum (Forbidden City), Beijing.',
          coordinates: { lat: 39.9138, lng: 116.3916 }
        },
        {
          url: 'https://upload.wikimedia.org/gugong_aerial.jpg',
          title: '故宫 (Forbidden City) panoramic view',
          description: 'View of the Forbidden City complex in central Beijing.'
        },
        {
          url: 'https://upload.wikimedia.org/zijincheng_architecture.jpg',
          title: '紫禁城 architectural details',
          description: 'Imperial roof decorations at the Forbidden City in Beijing, China.'
        }
      ];

      for (const candidate of candidates) {
        const result = validateImageCandidate(candidate, forbiddenCityEntity);
        expect(result.decision).toBe('ACCEPT');
        expect(result.score).toBeGreaterThanOrEqual(50);
      }
    });

    it('rejects geographic mismatches (e.g. San Francisco cabaret / nightclub)', () => {
      const sfCabaret = {
        url: 'https://upload.wikimedia.org/sf_cabaret.jpg',
        title: 'Asian-themed cabaret in San Francisco',
        description: 'Historic nightclub named Forbidden City in San Francisco, California, United States.',
        coordinates: { lat: 37.7915, lng: -122.4089 }
      };

      const result = validateImageCandidate(sfCabaret, forbiddenCityEntity);
      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('Geographic mismatch');
    });

    it('rejects national flags and emblems for the landmark', () => {
      const flagCandidate = {
        url: 'https://upload.wikimedia.org/flag_of_china.svg',
        title: 'Flag of China',
        description: 'National flag of the People\'s Republic of China.'
      };

      const result = validateImageCandidate(flagCandidate, forbiddenCityEntity);
      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('flag');
    });

    it('rejects generic or unrelated Chinese imagery without entity match', () => {
      const unrelatedCandidates = [
        {
          url: 'https://upload.wikimedia.org/beijing_cbd.jpg',
          title: 'Beijing CBD Skyline',
          description: 'Modern skyscrapers in Chaoyang District, Beijing, China.'
        },
        {
          url: 'https://upload.wikimedia.org/asian_street_food.jpg',
          title: 'Asian street food market',
          description: 'Food stalls in Bangkok, Thailand.'
        },
        {
          url: 'https://upload.wikimedia.org/terracotta_army.jpg',
          title: 'Terracotta Army in Xi\'an',
          description: 'Ancient terracotta warriors in Shaanxi province, China.'
        },
        {
          url: 'https://upload.wikimedia.org/chinese_pavilion_suzhou.jpg',
          title: 'Traditional Chinese architecture',
          description: 'Classical garden pavilion in Suzhou, China.'
        }
      ];

      for (const candidate of unrelatedCandidates) {
        const result = validateImageCandidate(candidate, forbiddenCityEntity);
        expect(result.decision).toBe('REJECT');
      }
    });
  });

  describe('2. Same-Name Location Disambiguation by Coordinates & Admin Context', () => {
    const parisFrance = {
      name: 'Paris',
      city: 'Paris',
      country: 'France',
      coordinates: { lat: 48.8566, lng: 2.3522 },
      entityType: 'city'
    };

    const parisTexas = {
      name: 'Paris',
      city: 'Paris',
      state: 'Texas',
      country: 'United States',
      coordinates: { lat: 33.6609, lng: -95.5555 },
      entityType: 'city'
    };

    it('validates French Paris imagery and rejects Texas Paris imagery when target is France', () => {
      const eiffelTower = {
        url: 'https://upload.wikimedia.org/eiffel_tower.jpg',
        title: 'Eiffel Tower, Paris',
        description: 'View of the Eiffel Tower in Paris, France.',
        coordinates: { lat: 48.8584, lng: 2.2945 }
      };

      const texasTower = {
        url: 'https://upload.wikimedia.org/paris_texas_tower.jpg',
        title: 'Eiffel Tower with Cowboy Hat in Paris, Texas',
        description: 'Replica tower in Paris, Texas, United States.',
        coordinates: { lat: 33.6609, lng: -95.5555 }
      };

      expect(validateImageCandidate(eiffelTower, parisFrance).decision).toBe('ACCEPT');
      expect(validateImageCandidate(texasTower, parisFrance).decision).toBe('REJECT');

      expect(validateImageCandidate(texasTower, parisTexas).decision).toBe('ACCEPT');
      expect(validateImageCandidate(eiffelTower, parisTexas).decision).toBe('REJECT');
    });
  });

  describe('3. Distance Tolerances by Entity Type', () => {
    it('uses tighter tolerance for landmarks and broader for natural features and regions', () => {
      expect(getEntityDistanceToleranceKm('landmark')).toBe(15);
      expect(getEntityDistanceToleranceKm('museum')).toBe(15);
      expect(getEntityDistanceToleranceKm('mountain')).toBe(85);
      expect(getEntityDistanceToleranceKm('natural_feature')).toBe(85);
      expect(getEntityDistanceToleranceKm('city')).toBe(50);
      expect(getEntityDistanceToleranceKm('state')).toBe(250);
      expect(getEntityDistanceToleranceKm('country')).toBe(1500);
    });

    it('correctly calculates Haversine distance in kilometers', () => {
      // Distance between Beijing (39.9042, 116.4074) and Tianjin (39.1256, 117.1979) is approx 108 km
      const distance = calculateHaversineDistanceKm(39.9042, 116.4074, 39.1256, 117.1979);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });
  });

  describe('4. Flag Detection', () => {
    it('identifies generic national flags and emblems for rejection', () => {
      expect(isGenericFlagOrEmblem('Flag of Australia', '', 'Sydney')).toBe(true);
      expect(isGenericFlagOrEmblem('Coat of arms of the United Kingdom', '', 'London')).toBe(true);
      expect(isGenericFlagOrEmblem('National Flag of Italy', '', 'Rome')).toBe(true);
    });

    it('allows flag images if the entity itself is a flag topic', () => {
      expect(isGenericFlagOrEmblem('Flag of the United States', '', 'Flag of the United States')).toBe(false);
    });
  });

  describe('5. Progressive Query Generation', () => {
    it('builds entity-specific fallback queries without generic degradations', () => {
      const queries = buildEntityImageQueries(forbiddenCityEntity);

      expect(queries).toContain('Forbidden City Beijing China');
      expect(queries).toContain('Forbidden City Beijing');
      expect(queries).toContain('Forbidden City China');
      expect(queries).toContain('Forbidden City');

      // Must not contain generic fallback searches like "China" or "Asian landmarks"
      expect(queries).not.toContain('China');
      expect(queries).not.toContain('Beijing');
      expect(queries).not.toContain('Chinese architecture');
    });
  });
});
