import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getNearbyPlaces } from '../geminiService';
import * as geographicResolver from '../geographic/geographicResolver';
import * as geminiService from '../geminiService';
import { overpassProvider } from '../geographic/providers/OverpassProvider';

vi.mock('../geographic/geographicResolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../geographic/geographicResolver')>();
  return {
    ...actual,
    reverseGeocode: vi.fn(),
  };
});

vi.mock('../geographic/providers/OverpassProvider', () => ({
  overpassProvider: {
    searchNearby: vi.fn(),
    name: "OpenStreetMap"
  }
}));

describe('Deterministic Geographic Validation in getNearbyPlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(geminiService, 'generateContentWithRetry');
  });

  test('does not call AI generation endpoint for nearby places', async () => {
    vi.mocked(geographicResolver.reverseGeocode).mockResolvedValue({
      country: 'Oman',
      state: 'Musandam',
      type: 'region'
    });

    vi.mocked(overpassProvider.searchNearby).mockResolvedValue([]);

    await getNearbyPlaces(26.5, 56.2, 50);
    
    // The strict rule: AI must never be called for location generation!
    expect(geminiService.generateContentWithRetry).not.toHaveBeenCalled();
  });

  test('Strait of Hormuz returns real places without rejecting them', async () => {
    vi.mocked(geographicResolver.reverseGeocode).mockResolvedValue({
      country: 'United Arab Emirates',
      state: 'Ras al-Khaimah',
      type: 'state'
    });

    vi.mocked(overpassProvider.searchNearby).mockResolvedValue([
      { id: '1', name: 'Al Hamra', lat: 26.6, lng: 56.3, type: 'village', populationClass: 'small' } as any,
      { id: '2', name: 'Dibba Al-Fujairah', lat: 26.7, lng: 56.4, type: 'city', populationClass: 'large' } as any
    ]);

    const result = await getNearbyPlaces(26.5, 56.2, 50);
    const places = result.places;
    
    expect(places.some(p => p.name === 'Al Hamra')).toBe(true);
    expect(places.some(p => p.name === 'Dibba Al-Fujairah')).toBe(true);
  });

  test('Cromwell, New Zealand returns actual OSM entities', async () => {
    vi.mocked(geographicResolver.reverseGeocode).mockResolvedValue({
      country: 'New Zealand',
      state: 'Otago',
      type: 'region'
    });

    vi.mocked(overpassProvider.searchNearby).mockResolvedValue([
      { id: '3', name: 'Bannockburn', lat: -45.08, lng: 169.17, type: 'village', populationClass: 'small' } as any,
      { id: '4', name: 'Lake Dunstan', lat: -44.9, lng: 169.2, type: 'lake', populationClass: 'small' } as any
    ]);

    const result = await getNearbyPlaces(-45.0, 169.2, 10);
    const places = result.places;
    
    // Check that real OSM entities are returned, without synthesized anchors
    expect(places[0].name).toBe('Bannockburn');
    expect(places.some(p => p.name === 'Lake Dunstan')).toBe(true);
    expect(geminiService.generateContentWithRetry).not.toHaveBeenCalled();
  });
  
  test('Remote Area without reverse geocoder falls back to nearest OSM entity', async () => {
    vi.mocked(geographicResolver.reverseGeocode).mockResolvedValue(null);

    vi.mocked(overpassProvider.searchNearby).mockResolvedValue([
      { id: '5', name: 'Remote Village', lat: 10.05, lng: 20.05, type: 'village', populationClass: 'small' } as any
    ]);

    // 10, 20 is the query
    const result = await getNearbyPlaces(10, 20, 10);
    const places = result.places;
    
    // Falls back to nearest marker name
    expect(places[0].name).toBe('Remote Village');
    expect(places[0].isAnchor).toBeUndefined();
  });
});
