import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  determineCanonicalDisplayName,
  isAdministrativeContainer,
  validateEntityIdentity
} from '../geographic/entityIdentityValidator';
import { resolveLocationQuery } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import * as geoResolver from '../geographic/geographicResolver';
import { normalizeNominatimEntityType } from '../geographic/geographicResolver';

describe('Entity Canonicalization vs Geocoder Administrative Promotion Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Unit Tests: determineCanonicalDisplayName & isAdministrativeContainer', () => {
    it('detects administrative container suffixes and prefixes', () => {
      expect(isAdministrativeContainer('Kathmandu Metropolitan City', 'Kathmandu')).toBe(true);
      expect(isAdministrativeContainer('Tokyo Metropolis', 'Tokyo')).toBe(true);
      expect(isAdministrativeContainer('City of London', 'London')).toBe(true);
      expect(isAdministrativeContainer('City and County of San Francisco', 'San Francisco')).toBe(true);
      expect(isAdministrativeContainer('Comune di Roma', 'Rome')).toBe(true);
      expect(isAdministrativeContainer('Municipality of Anchorage', 'Anchorage')).toBe(true);
      expect(isAdministrativeContainer('Yellowstone County', 'Yellowstone')).toBe(true);

      // Explicit administrative requests should NOT be considered container overwrites of themselves
      expect(isAdministrativeContainer('Kathmandu Metropolitan City', 'Kathmandu Metropolitan City')).toBe(false);
      expect(isAdministrativeContainer('City of London', 'City of London')).toBe(false);
      expect(isAdministrativeContainer('Yellowstone County', 'Yellowstone County')).toBe(false);
    });

    it('resolves natural-location requested name over administrative container candidate', () => {
      // Natural location request
      expect(determineCanonicalDisplayName('Kathmandu', 'Kathmandu Metropolitan City')).toBe('Kathmandu');
      expect(determineCanonicalDisplayName('kathmandu', 'Kathmandu Metropolitan City')).toBe('Kathmandu');
      expect(determineCanonicalDisplayName('Tokyo', 'Tokyo Metropolis')).toBe('Tokyo');
      expect(determineCanonicalDisplayName('London', 'City of London')).toBe('London');
      expect(determineCanonicalDisplayName('San Francisco', 'City and County of San Francisco')).toBe('San Francisco');
      expect(determineCanonicalDisplayName('Rome', 'Comune di Roma')).toBe('Rome');
      expect(determineCanonicalDisplayName('Mexico City', 'Ciudad de México')).toBe('Mexico City');
    });

    it('preserves explicit administrative request as canonical name', () => {
      expect(determineCanonicalDisplayName('Kathmandu Metropolitan City', 'Kathmandu Metropolitan City')).toBe('Kathmandu Metropolitan City');
      expect(determineCanonicalDisplayName('City of London', 'City of London')).toBe('City of London');
      expect(determineCanonicalDisplayName('Yellowstone County', 'Yellowstone County')).toBe('Yellowstone County');
    });

    it('preserves intentional alias canonicalization (e.g. New York City / USA / UK)', () => {
      expect(determineCanonicalDisplayName('New York City', 'City of New York')).toBe('New York City');
      expect(determineCanonicalDisplayName('usa', 'United States of America')).toBe('United States');
      expect(determineCanonicalDisplayName('uk', 'United Kingdom of Great Britain and Northern Ireland')).toBe('United Kingdom');
    });
  });

  describe('2. Nominatim Entity Type Normalization', () => {
    it('maps municipality and metropolitan place types to city rather than landmark', () => {
      expect(normalizeNominatimEntityType('place', 'municipality')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'city_district')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'subdivision')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'metropolis')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'city')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'town')).toBe('city');
      expect(normalizeNominatimEntityType('place', 'village')).toBe('city');
    });
  });

  describe('3. resolveLocationQuery Geocoder Identity & Coordinate Resolution', () => {
    it('resolves "Kathmandu" with correct coordinates, preserving canonical name "Kathmandu" and administrative context', async () => {
      vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValueOnce({
        name: 'Kathmandu Metropolitan City, Kathmandu, Bagamati Province, Central Development Region, 44600, Nepal',
        coordinates: { lat: 27.708317, lng: 85.3205817, source: 'geocoder' },
        entityType: 'city',
        source: geoResolver.GeographicSource.NOMINATIM,
        identityStatus: 'verified',
        confidence: 0.95,
        suggestedZoom: 9,
        context: {
          country: 'Nepal',
          state: 'Bagamati Province',
          city: 'Kathmandu Metropolitan City'
        }
      } as any);

      const result = await resolveLocationQuery('Kathmandu', 'point_of_interest');
      expect(result).not.toBeNull();
      const loc = result!.locationInfo;
      expect(loc).toBeDefined();

      // Canonical name must be "Kathmandu", NOT "Kathmandu Metropolitan City"
      expect(loc.name).toBe('Kathmandu');
      expect(loc.canonicalName).toBe('Kathmandu');

      // Coordinates must still come from the geocoder
      expect(loc.coordinates.lat).toBeCloseTo(27.708317, 4);
      expect(loc.coordinates.lng).toBeCloseTo(85.3205817, 4);

      // Administrative context is preserved
      expect(loc.country).toBe('Nepal');
      expect(loc.state).toBe('Bagamati Province');
      expect(loc.city).toBe('Kathmandu Metropolitan City');
      expect(loc.locationString).toContain('Kathmandu Metropolitan City');
    });

    it('resolves "Kathmandu Metropolitan City" with canonical name "Kathmandu Metropolitan City"', async () => {
      vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValueOnce({
        name: 'Kathmandu Metropolitan City, Kathmandu, Bagamati Province, Central Development Region, 44600, Nepal',
        coordinates: { lat: 27.708317, lng: 85.3205817, source: 'geocoder' },
        entityType: 'city',
        source: geoResolver.GeographicSource.NOMINATIM,
        identityStatus: 'verified',
        confidence: 0.95,
        suggestedZoom: 9,
        context: {
          country: 'Nepal',
          state: 'Bagamati Province',
          city: 'Kathmandu Metropolitan City'
        }
      } as any);

      const result = await resolveLocationQuery('Kathmandu Metropolitan City', 'point_of_interest');
      expect(result).not.toBeNull();
      const loc = result!.locationInfo;
      expect(loc.name).toBe('Kathmandu Metropolitan City');
      expect(loc.canonicalName).toBe('Kathmandu Metropolitan City');
      expect(loc.coordinates.lat).toBeCloseTo(27.708317, 4);
      expect(loc.coordinates.lng).toBeCloseTo(85.3205817, 4);
    });
  });

  describe('4. Full Search Pipeline Integration', () => {
    it('runs pipeline for "Show me Kathmandu" -> canonical name "Kathmandu", geocoder coordinates, full admin context', async () => {
      vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Kathmandu Metropolitan City, Kathmandu, Bagamati Province, Central Development Region, 44600, Nepal',
        coordinates: { lat: 27.708317, lng: 85.3205817, source: 'geocoder' },
        entityType: 'city',
        source: geoResolver.GeographicSource.NOMINATIM,
        identityStatus: 'verified',
        confidence: 0.95,
        suggestedZoom: 9,
        context: {
          country: 'Nepal',
          state: 'Bagamati Province',
          city: 'Kathmandu Metropolitan City'
        }
      } as any);

      const resolved = await resolveLocationQuery('Kathmandu', 'point_of_interest');
      expect(resolved?.locationInfo?.name).toBe('Kathmandu');
      expect(resolved?.locationInfo?.canonicalName).toBe('Kathmandu');

      const response = await runSearchPipeline({ rawQuery: 'Show me Kathmandu' });
      const canonicalName = response.entity?.subject?.identity?.canonicalName || (response as any).finalData?.name;
      expect(canonicalName).toBe('Kathmandu');

      const coords = response.entity?.subject?.primaryLocation?.location?.coordinates || (response as any).finalData?.coordinates;
      expect(coords?.lat).toBeCloseTo(27.708317, 4);
      expect(coords?.lng).toBeCloseTo(85.3205817, 4);
    });

    it('runs pipeline for explicit "Show me Kathmandu Metropolitan City" -> canonical name "Kathmandu Metropolitan City"', async () => {
      vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Kathmandu Metropolitan City, Kathmandu, Bagamati Province, Central Development Region, 44600, Nepal',
        coordinates: { lat: 27.708317, lng: 85.3205817, source: 'geocoder' },
        entityType: 'city',
        source: geoResolver.GeographicSource.NOMINATIM,
        identityStatus: 'verified',
        confidence: 0.95,
        suggestedZoom: 9,
        context: {
          country: 'Nepal',
          state: 'Bagamati Province',
          city: 'Kathmandu Metropolitan City'
        }
      } as any);

      const resolved = await resolveLocationQuery('Kathmandu Metropolitan City', 'point_of_interest');
      expect(resolved?.locationInfo?.name).toBe('Kathmandu Metropolitan City');
      expect(resolved?.locationInfo?.canonicalName).toBe('Kathmandu Metropolitan City');

      const response = await runSearchPipeline({ rawQuery: 'Show me Kathmandu Metropolitan City' });
      const canonicalName = response.entity?.subject?.identity?.canonicalName || (response as any).finalData?.name;
      expect(canonicalName).toBe('Kathmandu Metropolitan City');

      const coords = response.entity?.subject?.primaryLocation?.location?.coordinates || (response as any).finalData?.coordinates;
      expect(coords?.lat).toBeCloseTo(27.708317, 4);
      expect(coords?.lng).toBeCloseTo(85.3205817, 4);
    });

    it('runs pipeline for "Show me Mexico City" -> canonical name "Mexico City"', async () => {
      vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
        name: 'Ciudad de México, Mexico',
        coordinates: { lat: 19.4326, lng: -99.1332, source: 'geocoder' },
        entityType: 'city',
        source: geoResolver.GeographicSource.NOMINATIM,
        identityStatus: 'verified',
        confidence: 0.95,
        suggestedZoom: 9,
        context: {
          country: 'Mexico',
          city: 'Ciudad de México'
        }
      } as any);

      const resolved = await resolveLocationQuery('Mexico City', 'point_of_interest');
      expect(resolved?.locationInfo?.name).toBe('Mexico City');
      expect(resolved?.locationInfo?.canonicalName).toBe('Mexico City');

      const response = await runSearchPipeline({ rawQuery: 'Show me Mexico City' });
      const canonicalName = response.entity?.subject?.identity?.canonicalName || (response as any).finalData?.name;
      expect(canonicalName).toBe('Mexico City');

      const coords = response.entity?.subject?.primaryLocation?.location?.coordinates || (response as any).finalData?.coordinates;
      expect(coords?.lat).toBeCloseTo(19.4326, 3);
      expect(coords?.lng).toBeCloseTo(-99.1332, 3);
    });

    it('identity validation validates candidate WITHOUT changing canonicalName', () => {
      const idCheck = validateEntityIdentity('Kathmandu', 'Kathmandu Metropolitan City', {
        intent: 'NATURAL_LOCATION',
        candidateEntityType: 'city',
        coordinatesValid: true
      });
      expect(idCheck.matches).toBe(true);
      expect(idCheck.requestedEntity).toBe('Kathmandu');
      expect(idCheck.recoveredEntity).toBe('Kathmandu Metropolitan City');

      const canonical = determineCanonicalDisplayName('Kathmandu', 'Kathmandu Metropolitan City');
      expect(canonical).toBe('Kathmandu');
    });
  });
});
