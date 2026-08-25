import { describe, it, expect } from 'vitest';
import {
  filterCandidatesByDisplayRelevance,
  getCategoryDisplayRadius,
  ScanOrigin
} from '../geographic/geographicDisplayRelevance';
import { Candidate } from '../../types';

describe('Geographic Display Relevance & Marker Filtering Suite', () => {
  const oregonScanOrigin: ScanOrigin = {
    lat: 43.7600,
    lng: -122.8780
  };

  it('1. Rejects distant candidates (Portland ~196 km, Oregon City ~180 km) while accepting genuine nearby settlements', () => {
    const candidates: Candidate[] = [
      {
        id: 'dorena',
        name: 'Dorena',
        coordinates: { lat: 43.7371, lng: -122.8706 }, // ~4.8 km
        type: 'village',
        rankingClass: 'POPULATED_PLACE',
        tier: 3,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      },
      {
        id: 'cottage-grove',
        name: 'Cottage Grove',
        coordinates: { lat: 43.7976, lng: -123.0595 }, // ~20.5 km
        type: 'town',
        rankingClass: 'POPULATED_PLACE',
        tier: 2,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      },
      {
        id: 'springfield',
        name: 'Springfield',
        coordinates: { lat: 44.0462, lng: -123.0220 }, // ~35.6 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 2,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      },
      {
        id: 'eugene',
        name: 'Eugene',
        coordinates: { lat: 44.0521, lng: -123.0868 }, // ~40.3 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 1,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      },
      {
        id: 'oregon-city',
        name: 'Oregon City',
        coordinates: { lat: 45.3573, lng: -122.6068 }, // ~180 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 2,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      },
      {
        id: 'portland',
        name: 'Portland',
        coordinates: { lat: 45.5152, lng: -122.6784 }, // ~196 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 1,
        pipelineStatus: 'selected',
        providers: ['osm'],
        rawProviders: {}
      }
    ];

    const result = filterCandidatesByDisplayRelevance(candidates, oregonScanOrigin);

    expect(result.accepted.length).toBe(4);
    expect(result.rejected.length).toBe(2);

    const acceptedNames = result.accepted.map(c => c.name);
    expect(acceptedNames).toContain('Dorena');
    expect(acceptedNames).toContain('Cottage Grove');
    expect(acceptedNames).toContain('Springfield');
    expect(acceptedNames).toContain('Eugene');

    const rejectedNames = result.rejected.map(r => r.candidate.name);
    expect(rejectedNames).toContain('Portland');
    expect(rejectedNames).toContain('Oregon City');

    const portlandRejection = result.rejected.find(r => r.candidate.name === 'Portland');
    expect(portlandRejection?.reason).toBe('OUTSIDE_DISPLAY_RADIUS');
    expect(portlandRejection?.distanceKm).toBeGreaterThan(190);
  });

  it('2. Category-specific display radius behaves appropriately per entity class and tier', () => {
    const tier1City: Candidate = {
      id: 't1-city',
      name: 'Major City',
      coordinates: { lat: 0, lng: 0 },
      type: 'city',
      rankingClass: 'POPULATED_PLACE',
      tier: 1,
      pipelineStatus: 'selected',
      providers: [],
      rawProviders: {}
    };

    const tier3Village: Candidate = {
      id: 't3-village',
      name: 'Small Village',
      coordinates: { lat: 0, lng: 0 },
      type: 'village',
      rankingClass: 'POPULATED_PLACE',
      tier: 3,
      pipelineStatus: 'selected',
      providers: [],
      rawProviders: {}
    };

    const tier1NationalPark: Candidate = {
      id: 't1-park',
      name: 'Grand National Park',
      coordinates: { lat: 0, lng: 0 },
      type: 'national_park',
      rankingClass: 'GEOGRAPHIC_FEATURE',
      tier: 1,
      pipelineStatus: 'selected',
      providers: [],
      rawProviders: {}
    };

    const poi: Candidate = {
      id: 'poi-1',
      name: 'Local Museum',
      coordinates: { lat: 0, lng: 0 },
      type: 'museum',
      rankingClass: 'POI',
      tier: 3,
      pipelineStatus: 'selected',
      providers: [],
      rawProviders: {}
    };

    expect(getCategoryDisplayRadius(tier1City)).toBe(100);
    expect(getCategoryDisplayRadius(tier3Village)).toBe(50);
    expect(getCategoryDisplayRadius(tier1NationalPark)).toBe(110);
    expect(getCategoryDisplayRadius(poi)).toBe(35);
  });

  it('3. Rejects candidates with invalid or missing coordinates before marker mapping', () => {
    const invalidCandidates: Candidate[] = [
      {
        id: 'no-coords',
        name: 'Ghost Settlement',
        coordinates: { lat: NaN, lng: -122.8780 },
        type: 'town',
        rankingClass: 'POPULATED_PLACE',
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      },
      {
        id: 'out-of-bounds',
        name: 'Impossible Lat',
        coordinates: { lat: 145.0, lng: -122.8780 },
        type: 'town',
        rankingClass: 'POPULATED_PLACE',
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      }
    ];

    const result = filterCandidatesByDisplayRelevance(invalidCandidates, oregonScanOrigin);
    expect(result.accepted.length).toBe(0);
    expect(result.rejected.length).toBe(2);
    expect(result.rejected[0].reason).toBe('INVALID_COORDINATES');
    expect(result.rejected[1].reason).toBe('INVALID_COORDINATES');
  });

  it('4. Allows fewer than 6 markers when there are not enough locally relevant results', () => {
    const onlyTwoNearby: Candidate[] = [
      {
        id: 'close-1',
        name: 'Nearby Town',
        coordinates: { lat: 43.78, lng: -122.85 }, // ~3 km
        type: 'town',
        rankingClass: 'POPULATED_PLACE',
        tier: 2,
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      },
      {
        id: 'close-2',
        name: 'Nearby Lake',
        coordinates: { lat: 43.80, lng: -122.90 }, // ~5 km
        type: 'water_body',
        rankingClass: 'GEOGRAPHIC_FEATURE',
        tier: 2,
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      },
      {
        id: 'far-1',
        name: 'Far City 1',
        coordinates: { lat: 45.00, lng: -122.00 }, // ~150 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 1,
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      },
      {
        id: 'far-2',
        name: 'Far City 2',
        coordinates: { lat: 45.50, lng: -122.00 }, // ~200 km
        type: 'city',
        rankingClass: 'POPULATED_PLACE',
        tier: 1,
        pipelineStatus: 'selected',
        providers: [],
        rawProviders: {}
      }
    ];

    const result = filterCandidatesByDisplayRelevance(onlyTwoNearby, oregonScanOrigin);
    expect(result.accepted.length).toBe(2);
    expect(result.rejected.length).toBe(2);
  });
});
