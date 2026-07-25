import { describe, test, expect } from 'vitest';
import { sanitizeLocationInfo } from '../geminiService';
import { LocationType } from '../../types';

describe('Metadata Eligibility Rules for Population and Climate', () => {
  describe('Historical Events', () => {
    test('Where did the eruption of Vesuvius take place?', () => {
      const input = {
        name: 'The Eruption of Vesuvius',
        type: LocationType.POI,
        entityType: 'historical_event',
        description: 'In AD 79, Mount Vesuvius erupted...',
        population: 'Pompeii population 20,000',
        climate: 'Varies; Mediterranean climate',
        funFacts: [],
        coordinates: { lat: 40.82, lng: 14.42 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBeNull();
      expect(sanitized.climate).toBeNull();
    });

    test('Where did Woodstock take place?', () => {
      const input = {
        name: 'Woodstock Festival',
        type: LocationType.POI,
        entityType: 'historical_event',
        description: 'The Woodstock Music Festival took place in 1969 in Bethel, NY.',
        population: '400,000 festival attendees',
        climate: 'Humid continental',
        funFacts: [],
        coordinates: { lat: 41.7, lng: -74.7 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBeNull();
      expect(sanitized.climate).toBeNull();
    });

    test('Where did the Boston Massacre take place?', () => {
      const input = {
        name: 'Boston Massacre',
        type: LocationType.POI,
        entityType: 'historical_event',
        description: 'The Boston Massacre occurred on March 5, 1770.',
        population: '675,000',
        climate: 'Humid continental',
        funFacts: [],
        coordinates: { lat: 42.35, lng: -71.05 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBeNull();
      expect(sanitized.climate).toBeNull();
    });
  });

  describe('Discovery / Recovery', () => {
    test('Where was the Titanic found?', () => {
      const input = {
        name: 'Titanic Wreck Site',
        type: LocationType.POI,
        entityType: 'shipwreck',
        description: 'The wreck of the RMS Titanic lies at a depth of about 12,500 feet.',
        population: '0',
        climate: 'Marine',
        funFacts: [],
        coordinates: { lat: 41.73, lng: -49.94 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBeNull();
      expect(sanitized.climate).toBeNull();
    });

    test('Where were the Dead Sea Scrolls discovered?', () => {
      const input = {
        name: 'Qumran Caves (Dead Sea Scrolls)',
        type: LocationType.POI,
        entityType: 'archaeological_site',
        description: 'The Dead Sea Scrolls were discovered in 12 caves around Qumran.',
        population: 'N/A',
        climate: 'Hot desert climate',
        funFacts: [],
        coordinates: { lat: 31.74, lng: 35.46 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBeNull();
      expect(sanitized.climate).toBeNull();
    });
  });

  describe('Geographic Locations', () => {
    test('Where is Amsterdam?', () => {
      const input = {
        name: 'Amsterdam',
        type: LocationType.CITY,
        entityType: 'city',
        description: 'Amsterdam is the capital and most populous city of the Netherlands.',
        population: '921,402',
        climate: 'Oceanic climate (Cfb)',
        funFacts: [],
        coordinates: { lat: 52.36, lng: 4.90 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBe('921,402');
      expect(sanitized.climate).toBe('Oceanic climate (Cfb)');
    });

    test('Where is Boston?', () => {
      const input = {
        name: 'Boston',
        type: LocationType.CITY,
        entityType: 'city',
        description: 'Boston is the capital and largest city of Massachusetts.',
        population: '675,000',
        climate: 'Humid subtropical / continental',
        funFacts: [],
        coordinates: { lat: 42.36, lng: -71.05 },
        news: [],
        notable: []
      };

      const sanitized = sanitizeLocationInfo(input);
      expect(sanitized.population).toBe('675,000');
      expect(sanitized.climate).toBe('Humid subtropical / continental');
    });
  });
});
