import { describe, it, expect, vi } from 'vitest';
import {
  resolveImageIntent,
  validateImageCandidate,
  isGeographicPlaceEntity,
  ImageCandidate
} from '../imageService';

describe('Geographic-Place Image Validation Pipeline', () => {
  describe('Helper: isGeographicPlaceEntity', () => {
    it('correctly identifies geographic place entities from name, entityType, and structure', () => {
      expect(isGeographicPlaceEntity({ name: 'Antikythera, Greece', entityType: 'landmark' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Symi, Greece', entityType: 'island' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Athens, Greece', entityType: 'city' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Boston, Massachusetts', entityType: 'city' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Vatican City', entityType: 'country' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Crete', entityType: 'island' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Peloponnese', entityType: 'region' })).toBe(true);
      expect(isGeographicPlaceEntity({ name: 'Attica', entityType: 'administrative_region' })).toBe(true);
    });

    it('correctly excludes discrete landmarks, monuments, and buildings', () => {
      expect(isGeographicPlaceEntity({ name: 'Eiffel Tower', entityType: 'monument' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'Colosseum', entityType: 'monument' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'Statue of Liberty', entityType: 'monument' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'Acropolis of Athens', entityType: 'archaeological_site' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'Parthenon', entityType: 'temple' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'National Archaeological Museum, Athens', entityType: 'museum' })).toBe(false);
      expect(isGeographicPlaceEntity({ name: 'Antikythera Wreck Site', entityType: 'shipwreck' })).toBe(false);
    });
  });

  describe('Validation Scenarios', () => {
    // Test 1: geographic place + verified matching photo
    it('Test 1: accepts qualifying photographic candidate for geographic place with verified matching geo evidence', () => {
      const entity = {
        name: 'Antikythera, Greece',
        canonicalName: 'Antikythera, Greece',
        country: 'Greece',
        entityType: 'landmark', // Even if initially typed as landmark
        coordinates: { lat: 35.8617, lng: 23.3033 },
        coordinateSource: 'osm'
      };

      const candidate: ImageCandidate = {
        title: 'Ancient Greece',
        description: 'Coastal and island landscape of Ancient Greece in the Aegean Sea',
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Ancient_Greece_landscape.jpg'
      };

      const consoleSpy = vi.spyOn(console, 'log');

      const result = validateImageCandidate(candidate, entity);

      expect(result.decision).toBe('ACCEPT');
      expect(result.reason).toBe('VERIFIED_GEOGRAPHIC_PLACE_MATCH');
      expect(result.tier).toBe(2);

      // Verify structured [IMAGE VALIDATION] diagnostic output
      const validationLogCalls = consoleSpy.mock.calls
        .map(c => c.join(' '))
        .find(msg => msg.includes('[IMAGE VALIDATION]') && msg.includes('reason=VERIFIED_GEOGRAPHIC_PLACE_MATCH'));

      expect(validationLogCalls).toBeDefined();
      expect(validationLogCalls).toContain('entity="Antikythera, Greece"');
      expect(validationLogCalls).toContain('candidate="Ancient Greece"');
      expect(validationLogCalls).toContain('geographicEvidence=MATCHING');
      expect(validationLogCalls).toContain('coordinateTrust=VERIFIED');
      expect(validationLogCalls).toContain('geographicConflict=false');
      expect(validationLogCalls).toContain('decision=ACCEPT');

      consoleSpy.mockRestore();
    });

    // Test 2: geographic place + unknown geographic evidence
    it('Test 2: rejects candidate with UNKNOWN geographic evidence and no entity-specific match', () => {
      const entity = {
        name: 'Antikythera, Greece',
        canonicalName: 'Antikythera, Greece',
        entityType: 'island',
        coordinates: { lat: 35.8617, lng: 23.3033 },
        coordinateSource: 'osm'
      };

      const candidate: ImageCandidate = {
        title: 'List of islands in the Mediterranean',
        description: 'Comprehensive table and summary of various Mediterranean islands',
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Mediterranean_islands_list.jpg'
      };

      const result = validateImageCandidate(candidate, entity);

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });

    // Test 3: geographic conflict
    it('Test 3: rejects candidate when there is a geographic conflict', () => {
      const entity = {
        name: 'Antikythera, Greece',
        canonicalName: 'Antikythera, Greece',
        country: 'Greece',
        coordinates: { lat: 35.8617, lng: 23.3033 },
        coordinateSource: 'osm'
      };

      // Candidate has coordinates in Thessaloniki / Northern Greece (>500km away from Antikythera)
      const candidate: ImageCandidate = {
        title: 'Ancient Greece Coastal Landscape',
        description: 'Coastal waters near Thessaloniki in northern Aegean',
        coordinates: { lat: 40.6401, lng: 22.9444 },
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Thessaloniki_landscape.jpg'
      };

      const result = validateImageCandidate(candidate, entity);

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('GEOGRAPHIC_CONFLICT');
    });

    // Test 4: discrete landmark without entity evidence
    it('Test 4: rejects candidate for discrete landmark without entity-specific evidence even with matching geo context', () => {
      const entity = {
        name: 'Eiffel Tower',
        canonicalName: 'Eiffel Tower',
        city: 'Paris',
        country: 'France',
        entityType: 'monument',
        coordinates: { lat: 48.8584, lng: 2.2945 },
        coordinateSource: 'osm'
      };

      const candidate: ImageCandidate = {
        title: 'Paris France Street View',
        description: 'Charming view of a cobblestone street in central Paris, France',
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Paris_street.jpg'
      };

      const result = validateImageCandidate(candidate, entity);

      expect(result.decision).toBe('REJECT');
      expect(['NO_ENTITY_SPECIFIC_EVIDENCE', 'DIFFERENT_ENTITY']).toContain(result.reason);
    });

    // Test 5: discrete landmark with entity evidence
    it('Test 5: accepts candidate for discrete landmark containing valid entity-specific evidence', () => {
      const entity = {
        name: 'Eiffel Tower',
        canonicalName: 'Eiffel Tower',
        city: 'Paris',
        country: 'France',
        entityType: 'monument',
        coordinates: { lat: 48.8584, lng: 2.2945 },
        coordinateSource: 'osm'
      };

      const candidate: ImageCandidate = {
        title: 'Eiffel Tower at Sunset',
        description: 'The Eiffel Tower illuminated against the Paris sky',
        url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Eiffel_tower_sunset.jpg'
      };

      const result = validateImageCandidate(candidate, entity);

      expect(result.decision).toBe('ACCEPT');
      expect(['STRONG_ENTITY_MATCH', 'STRONG_ENTITY_MATCH_GEO_VERIFIED']).toContain(result.reason);
      expect(result.tier).toBe(1);
    });

    // Test 6: non-photographic geographic-place candidate
    it('Test 6: rejects non-photographic media (map, flag, diagram) for geographic place even with matching coordinates', () => {
      const entity = {
        name: 'Antikythera, Greece',
        canonicalName: 'Antikythera, Greece',
        country: 'Greece',
        coordinates: { lat: 35.8617, lng: 23.3033 },
        coordinateSource: 'osm'
      };

      const mapCandidate: ImageCandidate = {
        title: 'Map of Greece showing Antikythera',
        description: 'Topographic locator map of Greece highlighting the Aegean islands',
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Locator_map_Greece.png'
      };

      const result = validateImageCandidate(mapCandidate, entity);

      expect(result.decision).toBe('REJECT');
      expect(['NON_PHOTOGRAPHIC_MEDIA_FOR_LOCATION_INTENT', 'NO_ENTITY_SPECIFIC_EVIDENCE']).toContain(result.reason);
    });
  });
});
