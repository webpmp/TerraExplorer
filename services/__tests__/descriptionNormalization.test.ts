import { describe, it, expect } from 'vitest';
import {
  normalizeDescription,
  extractCoordinateMatches,
  isMatchingWaypointCoordinate,
  cleanSentenceAfterCoordinateRemoval
} from '../../utils/descriptionNormalization';
import { getCleanDescriptionLines } from '../../components/InfoPanel';

describe('Description Normalization & Coordinate Deduplication', () => {
  describe('extractCoordinateMatches', () => {
    it('extracts cardinal degree coordinates with symbols and spaces', () => {
      const text = 'Located at approximately 40.6892° N, 74.0445° W, the Statue of Liberty stands on Liberty Island.';
      const matches = extractCoordinateMatches(text);
      expect(matches).toHaveLength(1);
      expect(matches[0].lat).toBeCloseTo(40.6892, 4);
      expect(matches[0].lng).toBeCloseTo(-74.0445, 4);
    });

    it('extracts unsigned cardinal coordinates without degree symbol', () => {
      const text = 'The shipwreck lies at 31.6528N, 79.9909W in deep water.';
      const matches = extractCoordinateMatches(text);
      expect(matches).toHaveLength(1);
      expect(matches[0].lat).toBeCloseTo(31.6528, 4);
      expect(matches[0].lng).toBeCloseTo(-79.9909, 4);
    });

    it('extracts coordinates enclosed in parentheses or brackets', () => {
      const text1 = 'The historical landmark (34.0119° N, 118.4952° W) was founded in 1875.';
      const matches1 = extractCoordinateMatches(text1);
      expect(matches1).toHaveLength(1);
      expect(matches1[0].lat).toBeCloseTo(34.0119, 4);
      expect(matches1[0].lng).toBeCloseTo(-118.4952, 4);

      const text2 = 'Site marker [12.3456S, 45.6789E] indicates the border.';
      const matches2 = extractCoordinateMatches(text2);
      expect(matches2).toHaveLength(1);
      expect(matches2[0].lat).toBeCloseTo(-12.3456, 4);
      expect(matches2[0].lng).toBeCloseTo(45.6789, 4);
    });

    it('extracts signed decimal coordinates with degree symbols or explicit label prefix', () => {
      const text1 = 'Positioned at 40.6892°, -74.0445° on the harbor.';
      const matches1 = extractCoordinateMatches(text1);
      expect(matches1).toHaveLength(1);
      expect(matches1[0].lat).toBeCloseTo(40.6892, 4);
      expect(matches1[0].lng).toBeCloseTo(-74.0445, 4);

      const text2 = 'The survey station is at coordinates: 37.7749, -122.4194 overlooking the bay.';
      const matches2 = extractCoordinateMatches(text2);
      expect(matches2).toHaveLength(1);
      expect(matches2[0].lat).toBeCloseTo(37.7749, 4);
      expect(matches2[0].lng).toBeCloseTo(-122.4194, 4);
    });
  });

  describe('isMatchingWaypointCoordinate', () => {
    it('matches exact and rounded coordinate values within tolerance', () => {
      // Exact
      expect(isMatchingWaypointCoordinate(40.6892, -74.0445, 40.6892, -74.0445)).toBe(true);

      // Minor precision difference (e.g. 31.65 vs 31.6528) with tolerance 0.01
      expect(isMatchingWaypointCoordinate(31.6528, -79.9909, 31.65, -79.99, 0.01)).toBe(true);

      // Different location outside tolerance
      expect(isMatchingWaypointCoordinate(40.6892, -74.0445, 34.0522, -118.2437)).toBe(false);
    });
  });

  describe('normalizeDescription core requirements', () => {
    it('removes matching coordinates at the beginning of a sentence and repairs grammar', () => {
      const input = 'Located at approximately 40.6892° N, 74.0445° W, the Statue of Liberty stands on Liberty Island.';
      const result = normalizeDescription(input, {
        coordinates: { lat: 40.6892, lng: -74.0445 }
      });
      expect(result).toBe('The Statue of Liberty stands on Liberty Island.');
    });

    it('removes matching coordinates embedded in useful context without losing geographic context', () => {
      const input = 'The site is located at 34.0119° N, 118.4952° W on the western edge of Santa Monica.';
      const result = normalizeDescription(input, {
        coordinates: { lat: 34.0119, lng: -118.4952 }
      });
      expect(result).toBe('The site is located on the western edge of Santa Monica.');
    });

    it('removes matching coordinates at the end of a sentence while preserving factual numbers and measurements', () => {
      const input = 'Construction began in 1886 and the monument stands 305 feet tall at 40.6892° N, 74.0445° W.';
      const result = normalizeDescription(input, {
        coordinates: { lat: 40.6892, lng: -74.0445 }
      });
      expect(result).toBe('Construction began in 1886 and the monument stands 305 feet tall.');
    });

    it('handles minor precision differences between header coordinates and description prose', () => {
      const input = 'This marine reef is situated at approximately 31.6528N, 79.9909W off the Atlantic coast.';
      // Header has rounded 31.65, -79.99
      const result = normalizeDescription(input, {
        coordinates: { lat: 31.65, lng: -79.99 }
      });
      expect(result).toBe('This marine reef is situated off the Atlantic coast.');
    });

    it('preserves coordinates that refer to a genuinely different geographic location', () => {
      const input = 'The expedition departed from Plymouth at 50.3755° N, 4.1427° W before arriving in South America.';
      // Waypoint is in Buenos Aires (-34.6037, -58.3816), so Plymouth coordinates should NOT be removed
      const result = normalizeDescription(input, {
        coordinates: { lat: -34.6037, lng: -58.3816 }
      });
      expect(result).toContain('50.3755° N, 4.1427° W');
    });

    it('preserves historical dates, elevations, populations, and measurements', () => {
      const input = 'Founded in 1781 with an initial population of 44 settlers, the pueblo sits at an elevation of 285 feet.';
      const result = normalizeDescription(input, {
        coordinates: { lat: 34.0522, lng: -118.2437 }
      });
      expect(result).toBe(input);
      expect(result).toContain('1781');
      expect(result).toContain('44 settlers');
      expect(result).toContain('285 feet');
    });

    it('leaves descriptions with no coordinates completely untouched', () => {
      const input = 'The Grand Canyon is a steep-sided canyon carved by the Colorado River in Arizona, known for its layered red rock formations.';
      const result = normalizeDescription(input, {
        coordinates: { lat: 36.1069, lng: -112.1129 }
      });
      expect(result).toBe(input);
    });

    it('preserves markdown headings and multiline paragraph structure', () => {
      const input = `## Overview\n\nLocated at approximately 40.6892° N, 74.0445° W, the Statue of Liberty is an iconic neoclassical sculpture.\n\n## History\n\nDedicated on October 28, 1886, it was a gift from the people of France.`;
      const result = normalizeDescription(input, {
        coordinates: { lat: 40.6892, lng: -74.0445 }
      });

      expect(result).toContain('## Overview');
      expect(result).toContain('The Statue of Liberty is an iconic neoclassical sculpture.');
      expect(result).toContain('## History');
      expect(result).toContain('Dedicated on October 28, 1886, it was a gift from the people of France.');
    });
  });

  describe('Integration with InfoPanel getCleanDescriptionLines', () => {
    it('cleans redundant coordinates in getCleanDescriptionLines pipeline', () => {
      const info = {
        name: 'Statue of Liberty',
        coordinates: { lat: 40.6892, lng: -74.0445 },
        description: 'Located at approximately 40.6892° N, 74.0445° W, the Statue of Liberty stands on Liberty Island in New York Harbor.'
      };

      const lines = getCleanDescriptionLines(info);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('The Statue of Liberty stands on Liberty Island in New York Harbor.');
      expect(lines[0]).not.toContain('40.6892');
      expect(lines[0]).not.toContain('74.0445');
    });

    it('cleans waypoint coordinates when coordinates object is in info.coordinates', () => {
      const info = {
        name: 'Santa Monica Pier',
        coordinates: { lat: 34.0119, lng: -118.4952 },
        description: 'The site is located at 34.0119° N, 118.4952° W on the western edge of Santa Monica.'
      };

      const lines = getCleanDescriptionLines(info);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('The site is located on the western edge of Santa Monica.');
    });
  });
});
