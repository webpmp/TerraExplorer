import { describe, it, expect, vi } from 'vitest';
import {
  extractHistoricalImageContext,
  buildHistoricalImageQueries,
  validateImageCandidate,
  isIncompatibleCandidateEntityType,
  detectTemporalContradiction,
  detectGeographicMismatch,
  fetchAndValidateImages,
  ImageCandidate
} from '../imageService';

describe('Context-Aware Historical Image Parsing & Validation', () => {
  const shackletonPlymouthEntity = {
    name: 'Plymouth, England',
    canonicalName: 'Plymouth',
    city: 'Plymouth',
    country: 'England',
    historicalContext: "Ernest Shackleton's Imperial Trans-Antarctic Expedition departed from Millbay Docks, Plymouth aboard the Endurance in 1914.",
    historicalPeriod: '1914',
    routeTitle: "Shackleton's Expedition",
    entityType: 'historic_location',
    coordinates: { lat: 50.3686, lng: -4.1486 },
    waypoint: {
      name: 'Plymouth, England',
      canonicalName: 'Plymouth',
      city: 'Plymouth',
      country: 'England',
      routeTitle: "Shackleton's Expedition",
      description: 'Departure point for the Endurance expedition in August 1914 from Millbay Docks.',
      historicalContext: 'Departure port for Antarctic exploration.',
      historicalPeriod: '1914'
    }
  };

  describe('1. Context Extraction & Query Generation', () => {
    it('extracts full expedition context including vessels, departure docks, people, and dates', () => {
      const histContext = extractHistoricalImageContext(shackletonPlymouthEntity);
      expect(histContext.cleanLocationName).toBe('Plymouth');
      expect(histContext.year).toBe('1914');
      expect(histContext.exploration).toContain('Shackleton');
      expect(histContext.people).toContain('Shackleton');
      expect(histContext.artifacts).toContain('Endurance');
      expect(histContext.artifacts).toContain('Millbay Docks');
    });

    it('builds rich contextual queries linking the location with vessels, docks, and exploration', () => {
      const histContext = extractHistoricalImageContext(shackletonPlymouthEntity);
      const queries = buildHistoricalImageQueries(histContext);
      expect(queries).toContain('Plymouth');
      expect(queries).toContain('Plymouth historic site');
      expect(queries.some(q => q.includes('Shackleton'))).toBe(true);
      expect(queries.some(q => q.includes('Endurance'))).toBe(true);
      expect(queries.some(q => q.includes('Millbay Docks'))).toBe(true);
    });
  });

  describe('2. Case 1: Rejection of Incompatible Entity (Plymouth Automobile)', () => {
    it('rejects candidate with parenthetical (automobile) title', () => {
      const candidate: ImageCandidate = {
        title: 'Plymouth (automobile)',
        description: 'American marque of automobiles launched by Chrysler Corporation in 1928.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Plymouth_Car.jpg'
      };

      const typeCheck = isIncompatibleCandidateEntityType(candidate, shackletonPlymouthEntity);
      expect(typeCheck.incompatible).toBe(true);

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects candidate with automobile marque description even if title is clean', () => {
      const candidate: ImageCandidate = {
        title: '1932 Plymouth Model PB',
        description: 'Classic car brand manufactured by Chrysler division.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/1932_Plymouth.jpg'
      };

      const typeCheck = isIncompatibleCandidateEntityType(candidate, shackletonPlymouthEntity);
      expect(typeCheck.incompatible).toBe(true);

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('REJECT');
    });
  });

  describe('3. Case 2: Acceptance of Authentic Historical Context (Endurance & Millbay Docks)', () => {
    it('accepts historical candidate depicting Endurance departure or Millbay Docks', () => {
      const candidate: ImageCandidate = {
        title: 'Endurance departing Millbay Docks, Plymouth',
        description: 'Ernest Shackleton aboard Endurance departing Plymouth, England in August 1914.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Endurance_Plymouth_1914.jpg'
      };

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('ACCEPT');
      expect(result.score).toBeGreaterThanOrEqual(45);
    });

    it('accepts historic depiction of Plymouth harbor from the historical era', () => {
      const candidate: ImageCandidate = {
        title: 'Historic View of Plymouth Harbour',
        description: 'Archival engraving of the Royal Navy port and harbor in Plymouth, England.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Plymouth_Harbour_Historic.jpg'
      };

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('ACCEPT');
    });
  });

  describe('4. Case 3: Rejection of Geographic Ambiguity (Plymouth, Massachusetts)', () => {
    it('rejects Plymouth, Massachusetts for Plymouth, England', () => {
      const candidate: ImageCandidate = {
        title: 'Plymouth, Massachusetts',
        description: 'Town in Plymouth County, Massachusetts, United States, known for Plymouth Rock.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Plymouth_Mass.jpg'
      };

      const geoCheck = detectGeographicMismatch(candidate, shackletonPlymouthEntity);
      expect(geoCheck.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects candidate referencing US state abbreviation ", MA"', () => {
      const candidate: ImageCandidate = {
        title: 'Downtown Plymouth',
        description: 'Main street in Plymouth, MA, USA.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Plymouth_MA.jpg'
      };

      const geoCheck = detectGeographicMismatch(candidate, shackletonPlymouthEntity);
      expect(geoCheck.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('REJECT');
    });
  });

  describe('5. Case 4: Temporal Contradiction Rejection', () => {
    it('detects and rejects candidate introduced in 1928 for 1914 historical event', () => {
      const candidate: ImageCandidate = {
        title: 'Plymouth Sedan',
        description: 'Automobile brand introduced in 1928 by Walter Chrysler.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Plymouth_1928.jpg'
      };

      const temporalCheck = detectTemporalContradiction(candidate, {
        year: '1914',
        historicalContext: "Shackleton's 1914 Expedition"
      });
      expect(temporalCheck.contradiction).toBe(true);
      expect(temporalCheck.candidateYear).toBe(1928);
      expect(temporalCheck.targetYear).toBe(1914);

      const result = validateImageCandidate(candidate, shackletonPlymouthEntity);
      expect(result.decision).toBe('REJECT');
    });

    it('detects and rejects post-event 20th century brand for 19th century Lewis & Clark waypoint', () => {
      const lewisClarkWaypoint = {
        name: 'St. Charles, Missouri',
        historicalPeriod: '1804',
        historicalContext: 'Departure point for Lewis and Clark Corps of Discovery in 1804'
      };

      const candidate: ImageCandidate = {
        title: 'St. Charles Brand',
        description: 'Consumer brand founded in 1950.',
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Brand1950.jpg'
      };

      const temporalCheck = detectTemporalContradiction(candidate, lewisClarkWaypoint);
      expect(temporalCheck.contradiction).toBe(true);
    });
  });

  describe('6. Case 5: Reject instead of Guessing (fetchAndValidateImages returns empty array)', () => {
    it('returns empty array when all candidates are incompatible or conflicting', async () => {
      const fakeFetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            query: {
              pages: {
                '1': {
                  pageid: 1,
                  title: 'Plymouth (automobile)',
                  description: 'American automobile brand founded in 1928',
                  thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Car.jpg' }
                },
                '2': {
                  pageid: 2,
                  title: 'Plymouth, Massachusetts',
                  description: 'Town in Massachusetts, United States',
                  thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mass.jpg' }
                }
              }
            }
          })
        });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = fakeFetch as any;

      try {
        const results = await fetchAndValidateImages({
          name: 'Plymouth, England',
          canonicalName: 'Plymouth',
          city: 'Plymouth',
          country: 'England',
          historicalContext: "Shackleton's Expedition 1914",
          historicalPeriod: '1914',
          routeTitle: "Shackleton's Expedition",
          entityType: 'historic_location'
        }, 3);

        expect(results).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
