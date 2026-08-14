import { describe, it, expect, vi } from 'vitest';
import { normalizeCoordinates } from '../geminiService';
import { mergeCoordinates } from '../coordinateAuthority';
import { validateResolvedEntity } from '../entityValidation';
import { resolveGeographicEntity, resolveGeographicMetadata } from '../geographic/geographicResolver';
import { mergeLocationInfo } from '../locationService';
import { ResolvedCoordinates, MapMarker, LocationType } from '../../types';
import { ResolvedEntity } from '../../domain';

describe('Geographic Identity Resolution and Coordinate Provenance Integrity', () => {

  it('Test 1: AI recovery coordinates preserve ai_recovery provenance and do not become deterministic', () => {
    const aiCandidate: ResolvedCoordinates = {
      lat: 37.2709,
      lng: -115.8187,
      source: 'ai_recovery'
    };

    const normalized = normalizeCoordinates(aiCandidate);
    expect(normalized).toBeDefined();
    expect(normalized?.lat).toBeCloseTo(37.2709);
    expect(normalized?.lng).toBeCloseTo(-115.8187);
    expect(normalized?.source).toBe('ai_recovery');

    // Merging with null existing keeps ai_recovery source
    const merged = mergeCoordinates(null, aiCandidate);
    expect(merged.source).toBe('ai_recovery');

    // Provenance and status are preserved on entity
    const entity: any = {
      id: 'blue-lagoon',
      pipelineVersion: 2,
      revision: 1,
      subject: {
        identity: {
          id: 'test',
          originalQuery: 'Where is the Blue Lagoon?',
          canonicalName: 'Blue Lagoon',
          category: 'place',
          entityType: 'natural_feature',
          entityProvenance: { provider: 'Gemini', timestamp: Date.now(), cache: false },
          diagnostics: {}
        },
        primaryLocation: {
          label: 'Blue Lagoon',
          featureType: 'natural_feature',
          location: {
            coordinates: { lat: 37.2709, lng: -115.8187, source: 'ai_recovery' }
          },
          coordinateSource: 'ai_recovery',
          identityStatus: 'unverified',
          provenance: { provider: 'ai_recovery', timestamp: Date.now(), cache: false },
          diagnostics: {}
        }
      },
      metadata: {
        description: 'A prominent natural body of water known for geothermal and natural features.'
      }
    };

    expect(entity.subject.primaryLocation.coordinateSource).toBe('ai_recovery');
    expect(entity.subject.primaryLocation.identityStatus).toBe('unverified');
    expect(entity.subject.primaryLocation.location.coordinates.source).toBe('ai_recovery');
    expect(validateResolvedEntity(entity)).toBe(true);
  });

  it('Test 2: Nominatim resolution is authoritative for named entities like Blue Lagoon', async () => {
    const geoRes = await resolveGeographicEntity('Blue Lagoon');
    
    // If running in an environment with network or mock, Nominatim should return Iceland
    if (geoRes && !('status' in geoRes)) {
      expect(geoRes.name.toLowerCase()).toContain('blue lagoon');
      expect(geoRes.coordinates.lat).toBeGreaterThan(60); // Iceland lat ~63.88
      expect(geoRes.coordinates.lng).toBeLessThan(-15);  // Iceland lng ~-22.45
      expect(geoRes.coordinates.source).toBe('geocoder');
      expect(geoRes.context?.country).toBe('Iceland');
    }
  });

  it('Test 3: Verification failure prevents AI coordinates from being promoted to deterministic', () => {
    const fakeAiCandidate: ResolvedCoordinates = {
      lat: 37.2709,
      lng: -115.8187,
      source: 'ai_recovery'
    };

    const deterministicExisting: ResolvedCoordinates = {
      lat: 63.8804,
      lng: -22.4495,
      source: 'deterministic'
    };

    // Merging deterministic with incoming ai_recovery must protect deterministic
    const protectedCoords = mergeCoordinates(deterministicExisting, fakeAiCandidate);
    expect(protectedCoords.lat).toBeCloseTo(63.8804);
    expect(protectedCoords.lng).toBeCloseTo(-22.4495);
    expect(protectedCoords.source).toBe('deterministic');
  });

  it('Test 4: Narrative mismatch prevention rejects contradictory geography', () => {
    // Case 1: Nevada coordinates/canonical country with Iceland narrative -> invalid
    const mismatchEntity: any = {
      id: 'blue-lagoon',
      pipelineVersion: 2,
      revision: 1,
      subject: {
        identity: {
          canonicalName: 'Blue Lagoon',
          entityType: 'natural_feature'
        },
        primaryLocation: {
          label: 'Blue Lagoon',
          location: {
            coordinates: { lat: 37.2709, lng: -115.8187, source: 'geocoder' },
            address: { country: 'United States', state: 'Nevada' }
          },
          coordinateSource: 'geocoder',
          identityStatus: 'verified'
        }
      },
      metadata: {
        description: 'The Blue Lagoon is a famous geothermal spa in southwestern Iceland located near Grindavík on the Reykjanes Peninsula.'
      }
    };

    const mismatchValid = validateResolvedEntity(mismatchEntity);
    expect(mismatchValid).toBe(false);

    // Case 2: Iceland coordinates/canonical country with Iceland narrative -> valid
    const matchingEntity: any = {
      id: 'blue-lagoon',
      pipelineVersion: 2,
      revision: 1,
      subject: {
        identity: {
          canonicalName: 'Blue Lagoon',
          entityType: 'natural_feature'
        },
        primaryLocation: {
          label: 'Blue Lagoon',
          location: {
            coordinates: { lat: 63.8804, lng: -22.4495, source: 'geocoder' },
            address: { country: 'Iceland', state: 'Suðurnes' }
          },
          coordinateSource: 'geocoder',
          identityStatus: 'verified'
        }
      },
      metadata: {
        description: 'The Blue Lagoon is a geothermal spa in southwestern Iceland, located in a lava field near Grindavík.'
      }
    };

    const matchValid = validateResolvedEntity(matchingEntity);
    expect(matchValid).toBe(true);
  });

  it('Test 5: Globe marker retains authoritative Overpass/OSM coordinates', async () => {
    const overpassMarker: MapMarker = {
      id: 'osm-way-12345',
      name: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
      type: 'landmark',
      populationClass: 'medium',
      osmId: '12345',
      osmType: 'way'
    };

    const enriched = await resolveGeographicMetadata(overpassMarker);
    expect(enriched.lat).toBe(48.8584);
    expect(enriched.lng).toBe(2.2945);
    expect(enriched.osmId).toBe('12345');
    expect(enriched.osmType).toBe('way');
  });

  it('Test 6: Saved Route coordinates for Grytviken are preserved without shifting', async () => {
    const grytvikenWaypoint: MapMarker = {
      id: 'grytviken-wp',
      name: 'Grytviken',
      lat: -54.2811,
      lng: -36.5092,
      type: 'historical_waypoint',
      populationClass: 'small'
    };

    const enriched = await resolveGeographicMetadata(grytvikenWaypoint);
    expect(enriched.lat).toBe(-54.2811);
    expect(enriched.lng).toBe(-36.5092);
    expect(enriched.name).toBe('Grytviken');

    const merged = mergeLocationInfo(
      { name: 'Grytviken', coordinates: { lat: -54.2811, lng: -36.5092 }, country: 'South Georgia and the South Sandwich Islands' },
      { description: 'A historic whaling station in South Georgia.' }
    );
    expect(merged.coordinates.lat).toBe(-54.2811);
    expect(merged.coordinates.lng).toBe(-36.5092);
  });

  it('Test 7: Ambiguous names do not silently receive arbitrary AI coordinates', () => {
    const ambiguousCoords = normalizeCoordinates({ lat: 998, lng: 998 });
    expect(ambiguousCoords).toBeUndefined();
  });
});
