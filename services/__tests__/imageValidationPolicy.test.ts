import { describe, it, expect, vi } from 'vitest';
import {
  resolveImageIntent,
  validateImageCandidate,
  classifySemanticFeatureMatch,
  ImageCandidate,
  fetchAndValidateImages
} from '../imageService';

describe('Image Validation Policy and Subject Shape Pipeline', () => {
  describe('1. STRICT_ENTITY Policy (e.g. Eiffel Tower)', () => {
    const eiffelIntent = resolveImageIntent({
      name: 'Eiffel Tower',
      entityType: 'monument',
      city: 'Paris',
      country: 'France'
    });

    it('resolves Eiffel Tower to SPECIFIC_ENTITY and STRICT_ENTITY', () => {
      expect(eiffelIntent.shape).toBe('SPECIFIC_ENTITY');
      expect(eiffelIntent.policy).toBe('STRICT_ENTITY');
      expect(eiffelIntent.entityRequired).toBe(true);
    });

    it('accepts authentic Eiffel Tower candidate as Tier 1', () => {
      const candidate: ImageCandidate = {
        title: 'Tour Eiffel, Paris',
        description: 'Eiffel Tower illuminated at twilight in Paris, France',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tour_Eiffel.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Eiffel Tower',
          canonicalName: 'Eiffel Tower',
          aliases: ['Tour Eiffel'],
          city: 'Paris',
          country: 'France',
          entityType: 'monument',
          coordinates: { lat: 48.8584, lng: 2.2945 }
        },
        eiffelIntent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(1);
    });

    it('rejects Arc de Triomphe (different landmark in the same city)', () => {
      const candidate: ImageCandidate = {
        title: 'Arc de Triomphe, Paris',
        description: 'Arc de Triomphe de l\'Étoile in Paris, France',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Arc_de_Triomphe.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Eiffel Tower',
          canonicalName: 'Eiffel Tower',
          city: 'Paris',
          country: 'France',
          entityType: 'monument',
          coordinates: { lat: 48.8584, lng: 2.2945 }
        },
        eiffelIntent
      );

      expect(result.decision).toBe('REJECT');
    });

    it('rejects generic Paris imagery as a substitute for Eiffel Tower under STRICT_ENTITY', () => {
      const candidate: ImageCandidate = {
        title: 'Paris Skyline at Sunset',
        description: 'Panoramic view of Paris city streets',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Paris_Skyline.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Eiffel Tower',
          canonicalName: 'Eiffel Tower',
          city: 'Paris',
          country: 'France',
          entityType: 'monument',
          coordinates: { lat: 48.8584, lng: 2.2945 }
        },
        eiffelIntent
      );

      expect(result.decision).toBe('REJECT');
      expect(['NO_ENTITY_SPECIFIC_EVIDENCE', 'DIFFERENT_ENTITY']).toContain(result.reason);
    });
  });

  describe('2. GEOGRAPHIC_COLLECTION & GEOGRAPHIC_FEATURE (e.g. Venice Canals)', () => {
    const veniceCanalsIntent = resolveImageIntent({
      name: 'Venice Canals',
      rawQuery: 'Where is Venice Canals?',
      city: 'Venice',
      country: 'Italy'
    });

    it('resolves Venice Canals to GEOGRAPHIC_COLLECTION and GEOGRAPHIC_FEATURE', () => {
      expect(veniceCanalsIntent.shape).toBe('GEOGRAPHIC_COLLECTION');
      expect(veniceCanalsIntent.policy).toBe('GEOGRAPHIC_FEATURE');
      expect(veniceCanalsIntent.featureType).toBe('canal');
      expect(veniceCanalsIntent.parentLocation).toBe('Venice');
      expect(veniceCanalsIntent.entityRequired).toBe(false);
    });

    it('accepts "Grand Canal (Venice)" as Tier 2 strong related component feature', () => {
      const candidate: ImageCandidate = {
        title: 'Grand Canal (Venice)',
        description: 'View of the Grand Canal from Rialto Bridge in Venice, Italy',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Grand_Canal_Venice.jpg',
        coordinates: { lat: 45.4381, lng: 12.3359 }
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        veniceCanalsIntent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(2);
      expect(result.reason).toBe('STRONG_RELATED_FEATURE_MATCH');
    });

    it('accepts "Giudecca Canal" when geographic evidence supports Venice relevance', () => {
      const candidate: ImageCandidate = {
        title: 'Giudecca Canal',
        description: 'Giudecca Canal waterway in Venice, Italy with passing boats',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Giudecca_Canal.jpg',
        coordinates: { lat: 45.426, lng: 12.331 }
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        veniceCanalsIntent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(2);
    });

    it('accepts representative Venice imagery as Tier 3 fallback when geographic evidence matches', () => {
      const candidate: ImageCandidate = {
        title: 'Venice',
        description: 'Historic city center of Venice, Veneto, Italy',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Venice_City.jpg',
        coordinates: { lat: 45.437, lng: 12.332 }
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        veniceCanalsIntent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(3);
      expect(result.reason).toBe('REPRESENTATIVE_LOCATION_FEATURE');
    });

    it('rejects "Venice, Los Angeles" with GEOGRAPHIC_CONFLICT', () => {
      const candidate: ImageCandidate = {
        title: 'Venice Canals (Los Angeles)',
        description: 'Historic Venice Canals district in Los Angeles, California, United States',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Venice_Canals_LA.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        veniceCanalsIntent
      );

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('GEOGRAPHIC_CONFLICT');
    });

    it('rejects "Canals of Amsterdam" with GEOGRAPHIC_CONFLICT', () => {
      const candidate: ImageCandidate = {
        title: 'Canals of Amsterdam',
        description: 'Historic canal rings of Amsterdam, Netherlands',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Amsterdam_Canals.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        veniceCanalsIntent
      );

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('GEOGRAPHIC_CONFLICT');
    });
  });

  describe('3. BROAD_LOCATION Policy (e.g. "Where is Venice?")', () => {
    const veniceIntent = resolveImageIntent({
      name: 'Venice',
      rawQuery: 'Where is Venice?',
      entityType: 'settlement',
      city: 'Venice',
      country: 'Italy'
    });

    it('resolves broad city query to BROAD_LOCATION and LOCATION_REPRESENTATIVE', () => {
      expect(veniceIntent.shape).toBe('BROAD_LOCATION');
      expect(veniceIntent.policy).toBe('LOCATION_REPRESENTATIVE');
      expect(veniceIntent.entityRequired).toBe(false);
    });

    it('accepts representative Venice imagery without requiring a second exact entity name match', () => {
      const candidate: ImageCandidate = {
        title: 'Doge Palace and St Mark Square',
        description: 'Historic monuments on the Venetian lagoon',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Doge_Palace.jpg',
        coordinates: { lat: 45.434, lng: 12.340 }
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice',
          canonicalName: 'Venice',
          city: 'Venice',
          country: 'Italy',
          entityType: 'settlement',
          coordinates: { lat: 45.437, lng: 12.332 }
        },
        veniceIntent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.reason).toBe('LOCATION_REPRESENTATIVE_MATCH');
    });
  });

  describe('4. HISTORICAL_WAYPOINT Isolation Safeguards', () => {
    const histIntent = resolveImageIntent({
      name: "Fleming's Laboratory",
      historicalContext: 'Discovery of Penicillin in London, 1928',
      entityType: 'historical_waypoint',
      city: 'London',
      country: 'United Kingdom'
    });

    it('resolves historical waypoint to SPECIFIC_ENTITY and isolated HISTORICAL_WAYPOINT policy', () => {
      expect(histIntent.shape).toBe('SPECIFIC_ENTITY');
      expect(histIntent.policy).toBe('HISTORICAL_WAYPOINT');
      expect(histIntent.entityRequired).toBe(true);
    });

    it('rejects modern municipal buildings or unrelated nearby landmarks for historical waypoints', () => {
      const candidate: ImageCandidate = {
        title: 'City of Westminster Town Hall',
        description: 'Municipal building in London, United Kingdom',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Westminster_Town_Hall.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: "Fleming's Laboratory",
          canonicalName: "Fleming's Laboratory",
          city: 'London',
          country: 'United Kingdom',
          entityType: 'historical_waypoint',
          historicalContext: 'Discovery of Penicillin in London, 1928',
          coordinates: { lat: 51.5174, lng: -0.1741 }
        },
        histIntent
      );

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });

    it('failed historical entity matching does not fall through into GEOGRAPHIC_FEATURE or LOCATION_REPRESENTATIVE', () => {
      const candidate: ImageCandidate = {
        title: 'London Skyline',
        description: 'Modern London cityscape and streets',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/London_Skyline.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: "Fleming's Laboratory",
          canonicalName: "Fleming's Laboratory",
          city: 'London',
          country: 'United Kingdom',
          entityType: 'historical_waypoint',
          historicalContext: 'Discovery of Penicillin in London, 1928',
          coordinates: { lat: 51.5174, lng: -0.1741 }
        },
        histIntent
      );

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });
  });

  describe('5. Aliases & Name Variants', () => {
    it('canonical and alternate names establish a valid Tier 1 entity match', () => {
      const intent = resolveImageIntent({
        name: "St. Mary's Hospital",
        city: 'London',
        country: 'United Kingdom'
      });

      const candidate: ImageCandidate = {
        title: "St Mary's Hospital, London",
        description: "General view of St Mary's Hospital in Paddington, London",
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/St_Marys_Hospital.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: "St. Mary's Hospital",
          canonicalName: "St. Mary's Hospital",
          aliases: ["St Mary's Hospital, London"],
          city: 'London',
          country: 'United Kingdom',
          coordinates: { lat: 51.5174, lng: -0.1741 }
        },
        intent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(1);
    });

    it('alias matching does not weaken geographic conflict protection', () => {
      const intent = resolveImageIntent({
        name: "St. Mary's Hospital",
        city: 'London',
        country: 'United Kingdom'
      });

      const candidate: ImageCandidate = {
        title: "St. Mary's Hospital (Sydney)",
        description: "Hospital facility located in Sydney, Australia",
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/St_Marys_Sydney.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: "St. Mary's Hospital",
          canonicalName: "St. Mary's Hospital",
          aliases: ["St Mary's Hospital"],
          city: 'London',
          country: 'United Kingdom',
          coordinates: { lat: 51.5174, lng: -0.1741 }
        },
        intent
      );

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('GEOGRAPHIC_CONFLICT');
    });
  });

  describe('6. Incomplete Metadata Handling', () => {
    it('strong Tier 2 candidate with UNKNOWN geographic metadata is accepted without conflict', () => {
      const intent = resolveImageIntent({
        name: 'Venice Canals',
        rawQuery: 'Venice Canals',
        city: 'Venice',
        country: 'Italy'
      });

      // Candidate has strong feature + parent location title, but no coordinates and no text metadata
      const candidate: ImageCandidate = {
        title: 'Grand Canal (Venice)',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Grand_Canal_Venice.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy'
        },
        intent
      );

      expect(result.decision).toBe('ACCEPT');
      expect(result.tier).toBe(2);
    });

    it('Tier 3 representative fallback still requires positive geographic evidence', () => {
      const intent = resolveImageIntent({
        name: 'Venice Canals',
        rawQuery: 'Venice Canals',
        city: 'Venice',
        country: 'Italy'
      });

      // Candidate title is just "Lagoon Sunset" without Venice mention in text or matching geo
      const candidate: ImageCandidate = {
        title: 'Lagoon Sunset',
        description: 'Sunset over open water',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Lagoon_Sunset.jpg'
      };

      const result = validateImageCandidate(
        candidate,
        {
          name: 'Venice Canals',
          canonicalName: 'Venice Canals',
          city: 'Venice',
          country: 'Italy',
          coordinates: { lat: 45.432867, lng: 12.319523 }
        },
        intent
      );

      expect(result.decision).toBe('REJECT');
    });
  });
});
