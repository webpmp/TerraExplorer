import { describe, it, expect } from 'vitest';
import {
  validateImageCandidate,
  isGenericTopicCandidate,
  isDifferentNamedEntity,
  isSuspiciousPlaceholderCoordinate,
  classifyImageEvidence
} from '../imageService';

describe('Image Entity-Specific Gate & Qualification System', () => {
  const elFaroEntity = {
    name: 'El Faro',
    canonicalName: 'El Faro',
    entityType: 'shipwreck_site',
    intent: 'NATURAL_LOCATION',
    aliases: ['SS El Faro', 'El Faro wreck', 'El Faro shipwreck']
  };

  const shipwreckElFaroEntity = {
    name: 'Shipwreck of the El Faro',
    canonicalName: 'Shipwreck of the El Faro',
    entityType: 'shipwreck_site',
    intent: 'NATURAL_LOCATION',
    aliases: ['SS El Faro', 'El Faro', 'El Faro shipwreck']
  };

  describe('1. Suspicious Placeholder Coordinate Detection', () => {
    it('detects synthetic sequential digit patterns as untrusted placeholder coordinates', () => {
      expect(isSuspiciousPlaceholderCoordinate(12.3456, -78.9012)).toBe(true);
      expect(isSuspiciousPlaceholderCoordinate(12.345, 67.890)).toBe(true);
      expect(isSuspiciousPlaceholderCoordinate(0, 0)).toBe(true);
      expect(isSuspiciousPlaceholderCoordinate(999, 999)).toBe(true);
    });

    it('trusts genuine non-synthetic real-world coordinates', () => {
      // Forbidden City
      expect(isSuspiciousPlaceholderCoordinate(39.9172757, 116.3907694)).toBe(false);
      // El Faro site in Atlantic
      expect(isSuspiciousPlaceholderCoordinate(23.8644, -74.4989)).toBe(false);
      // Eiffel Tower in Paris
      expect(isSuspiciousPlaceholderCoordinate(48.8584, 2.2945)).toBe(false);
    });
  });

  describe('2. Generic Topic and Different Entity Detection', () => {
    it('identifies category and list pages as generic topics', () => {
      expect(isGenericTopicCandidate('List of maritime disasters in the 21st century')).toBe(true);
      expect(isGenericTopicCandidate('List of migrant vessel incidents on the Mediterranean Sea')).toBe(true);
      expect(isGenericTopicCandidate('Generic shipwreck photograph')).toBe(true);
      expect(isGenericTopicCandidate('List of shipwrecks in the Atlantic')).toBe(true);
    });

    it('identifies different named vessels as different entities', () => {
      expect(isDifferentNamedEntity('SS Edmund Fitzgerald', '', 'El Faro', ['SS El Faro'])).toBe(true);
      expect(isDifferentNamedEntity('USS Okanogan', '', 'El Faro', ['SS El Faro'])).toBe(true);
      expect(isDifferentNamedEntity('Wreck of the USS Memphis', '', 'El Faro', ['SS El Faro'])).toBe(true);
      expect(isDifferentNamedEntity('SS El Faro', '', 'El Faro', ['SS El Faro'])).toBe(false);
    });
  });

  describe('3. Required Regression Test Cases', () => {
    it('1. Exact entity: Requested El Faro, Candidate El Faro -> ACCEPT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/el_faro.jpg',
        title: 'El Faro',
        description: 'The American cargo ship El Faro sailing in calm waters.'
      };
      const res = validateImageCandidate(candidate, elFaroEntity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(50);
    });

    it('2. Verified alias: Requested Shipwreck of the El Faro, Candidate SS El Faro -> ACCEPT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/ss_el_faro_ship.jpg',
        title: 'SS El Faro',
        description: 'SS El Faro was a United States-flagged cargo vessel.'
      };
      const res = validateImageCandidate(candidate, shipwreckElFaroEntity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(50);
    });

    it('3. Generic maritime article: Requested El Faro, Candidate List of maritime disasters -> REJECT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/maritime_disasters.jpg',
        title: 'List of maritime disasters in the 21st century',
        description: 'A comprehensive list of maritime disasters, shipping accidents, and sinkings in the 21st century.'
      };
      const res = validateImageCandidate(candidate, elFaroEntity);
      expect(res.decision).toBe('REJECT');
      expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });

    it('4. Generic shipwreck: Requested El Faro, Candidate Generic shipwreck photograph -> REJECT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/generic_wreck.jpg',
        title: 'Generic shipwreck photograph',
        description: 'An unidentified sunken vessel on the seabed.'
      };
      const res = validateImageCandidate(candidate, elFaroEntity);
      expect(res.decision).toBe('REJECT');
      expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });

    it('5. Different named shipwreck: Requested El Faro, Candidate SS Edmund Fitzgerald -> REJECT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/edmund_fitzgerald.jpg',
        title: 'SS Edmund Fitzgerald',
        description: 'The SS Edmund Fitzgerald was an American Great Lakes freighter that sank in Lake Superior in 1975.'
      };
      const res = validateImageCandidate(candidate, elFaroEntity);
      expect(res.decision).toBe('REJECT');
      expect(res.reason).toBe('DIFFERENT_ENTITY');
    });

    it('6. Different vessel: Requested El Faro, Candidate USS Okanogan -> REJECT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/uss_okanogan.jpg',
        title: 'USS Okanogan',
        description: 'USS Okanogan (APA-220) was an attack transport in the United States Navy.'
      };
      const res = validateImageCandidate(candidate, elFaroEntity);
      expect(res.decision).toBe('REJECT');
      expect(res.reason).toBe('DIFFERENT_ENTITY');
    });

    it('7. Geographic mismatch: Requested El Faro, Candidate image associated with an unrelated location -> REJECT', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/lake_superior_wreck.jpg',
        title: 'El Faro memorial exhibit in San Francisco',
        description: 'Historic exhibit located in San Francisco, California, United States.',
        coordinates: { lat: 37.7749, lng: -122.4194 }
      };
      const entityWithAtlanticCoords = {
        ...elFaroEntity,
        country: 'Bahamas',
        coordinates: { lat: 23.8644, lng: -74.4989 }
      };
      const res = validateImageCandidate(candidate, entityWithAtlanticCoords);
      expect(res.decision).toBe('REJECT');
      expect(res.reason).toContain('Geographic mismatch');
    });

    it('8. No qualified image: When all candidates are generic or unrelated, images list remains empty', () => {
      const candidates = [
        {
          url: 'https://upload.wikimedia.org/maritime_disasters.jpg',
          title: 'List of maritime disasters in the 21st century',
          description: 'A list of maritime disasters.'
        },
        {
          url: 'https://upload.wikimedia.org/generic_wreck.jpg',
          title: 'Generic shipwreck photograph',
          description: 'Sunken vessel photo.'
        },
        {
          url: 'https://upload.wikimedia.org/uss_okanogan.jpg',
          title: 'USS Okanogan',
          description: 'Attack transport vessel.'
        }
      ];

      const acceptedImages = candidates.filter(c => validateImageCandidate(c, elFaroEntity).decision === 'ACCEPT');
      expect(acceptedImages.length).toBe(0);
    });

    it('9. Geographic Settlement: Dallas, Texas rejects Dallas Cowboys, Dallas County, DFW Airport, Bryce Dallas Howard', () => {
      const dallasEntity = {
        name: 'Dallas, Texas',
        canonicalName: 'Dallas, Texas',
        city: 'Dallas',
        state: 'Texas',
        country: 'United States',
        coordinates: { lat: 32.7767, lng: -96.7970 },
        entityType: 'settlement'
      };

      const candidates = [
        {
          url: 'https://upload.wikimedia.org/dallas_cowboys.jpg',
          title: 'Dallas Cowboys',
          description: 'The Dallas Cowboys are a professional American football team based in Dallas, Texas.'
        },
        {
          url: 'https://upload.wikimedia.org/dallas_county.jpg',
          title: 'Dallas County, Texas',
          description: 'Dallas County is a county located in the U.S. state of Texas.'
        },
        {
          url: 'https://upload.wikimedia.org/dfw_airport.jpg',
          title: 'Dallas Fort Worth International Airport',
          description: 'International airport serving the Dallas–Fort Worth metroplex in Texas.'
        },
        {
          url: 'https://upload.wikimedia.org/bryce_dallas_howard.jpg',
          title: 'Bryce Dallas Howard',
          description: 'American actress and director.'
        },
        {
          url: 'https://upload.wikimedia.org/dfw_metroplex.jpg',
          title: 'Dallas–Fort Worth metroplex',
          description: 'Metropolitan area in the U.S. state of Texas.'
        }
      ];

      candidates.forEach(cand => {
        const res = validateImageCandidate(cand, dallasEntity);
        expect(res.decision).toBe('REJECT');
      });

      // Valid candidate representing the city itself
      const validCandidate = {
        url: 'https://upload.wikimedia.org/downtown_dallas_skyline.jpg',
        title: 'Dallas, Texas',
        description: 'Downtown Dallas skyline view in Texas, United States.'
      };
      const validRes = validateImageCandidate(validCandidate, dallasEntity);
      expect(validRes.decision).toBe('ACCEPT');
    });
  });
});
