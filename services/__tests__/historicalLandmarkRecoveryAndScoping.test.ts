import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pipelineMod from '../pipeline';
import * as geminiService from '../geminiService';
import * as geographicResolver from '../geographic/geographicResolver';
import { validateEntityCoordinates } from '../geographic/entityIdentityValidator';

describe('Historical Landmark Recovery, Variable Scoping & Coordinate Validation Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. ResolutionStage processes a non-registry landmark (e.g. Hagia Sophia) without ReferenceError', async () => {
    // Mock intent stage
    vi.spyOn(geminiService, 'routeIntentAndExtractEntity').mockReturnValue({
      intent: 'LANDMARK_LOCATION',
      entity: 'Hagia Sophia',
      queryShape: 'DIRECT',
      normalized: {
        normalizedQuery: 'hagia sophia',
        request: { rawQuery: 'Show me Hagia Sophia' }
      }
    } as any);

    // Mock initial resolver failing (e.g. simulating Nominatim unavailable or 429)
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: 'NO_GEOGRAPHIC_DATA'
    } as any);

    // Mock AI coordinate recovery returning valid coordinates for Hagia Sophia in Istanbul
    vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue({
      lat: 41.0086,
      lng: 28.9802,
      source: 'ai_recovery',
      confidence: 'high',
      recoveredEntity: 'Hagia Sophia',
      canonicalName: 'Hagia Sophia',
      entityType: 'landmark',
      coordinateTrust: 'provisional',
      identityStatus: 'verified'
    } as any);

    // Mock reverseGeocode
    vi.spyOn(geographicResolver, 'reverseGeocode').mockResolvedValue({
      country: 'Turkey',
      state: 'Istanbul',
      city: 'Istanbul',
      displayName: 'Hagia Sophia, Sultanahmet, Istanbul, Turkey'
    } as any);

    // Mock Wikipedia extract
    vi.spyOn(geographicResolver, 'fetchWikipediaLeadExtract').mockResolvedValue({
      title: 'Hagia Sophia',
      extract: 'Hagia Sophia is a major historic place of worship in Istanbul, Turkey, constructed in 537 AD as the patriarchal cathedral of the imperial capital of Constantinople.'
    } as any);

    // Mock recoverLocationMetadata
    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      name: 'Hagia Sophia',
      locationString: 'Istanbul, Turkey',
      description: {
        text: 'Hagia Sophia is a monumental landmark in Istanbul, Turkey, renowned for its massive dome and Byzantine architecture.'
      },
      climate: {
        value: 'Mediterranean climate',
        name: 'Mediterranean climate',
        description: 'Warm summers and cool winters',
        koppenCode: 'Csa'
      },
      contextNotes: [
        { text: 'Constructed under the order of Emperor Justinian I in 537 AD.' }
      ],
      notable: [
        {
          title: 'Byzantine Dome',
          description: 'The monumental central dome was an architectural marvel of the late Roman and Byzantine world.'
        }
      ],
      _validFields: ['description', 'climate', 'contextNotes', 'notable'],
      _rejectedFields: ['population']
    } as any);

    // Run pipeline
    const result = await pipelineMod.runSearchPipeline({
      rawQuery: 'Show me Hagia Sophia'
    });

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject.identity.canonicalName).toBe('Hagia Sophia');
    const desc = typeof result.entity?.metadata.description === 'string'
      ? result.entity?.metadata.description
      : (result.entity?.metadata.description as any)?.text;
    expect(desc).toContain('monumental landmark in Istanbul');
  });

  it('2. Coordinate validation rejects AI coordinates that contradict the AI-provided expected region', () => {
    // AI recovery returned coordinates in the Sea of Marmara (40.6273, 28.9775) with expectedRegion "Istanbul, Turkey"
    const validationResult = validateEntityCoordinates({
      requestedEntity: 'Hagia Sophia',
      recoveredEntity: 'Hagia Sophia',
      coordinates: { lat: 40.6273, lng: 28.9775 },
      expectedRegion: 'Istanbul, Turkey',
      reverseGeographicContext: {
        country: 'Turkey',
        displayName: 'Sea of Marmara',
        feature: 'water'
      }
    });

    expect(validationResult.consistent).toBe(false);
    expect(validationResult.result).toBe('ENTITY_COORDINATE_MISMATCH');
    expect(validationResult.coordinateTrust).toBe('unverified');
    expect(validationResult.rejectionReason).toContain('Geographic mismatch: candidate coordinates landed in open water');
  });

  it('3. Coordinate validation rejects AI coordinates that conflict in country with expected region', () => {
    // Coordinates landed in Ohio, USA for entity expected in Istanbul, Turkey
    const validationResult = validateEntityCoordinates({
      requestedEntity: 'Hagia Sophia',
      recoveredEntity: 'Hagia Sophia',
      coordinates: { lat: 39.9612, lng: -82.9988 },
      expectedRegion: 'Istanbul, Turkey',
      reverseGeographicContext: {
        country: 'United States',
        state: 'Ohio',
        city: 'Columbus'
      }
    });

    expect(validationResult.consistent).toBe(false);
    expect(validationResult.result).toBe('ENTITY_COORDINATE_MISMATCH');
    expect(validationResult.coordinateTrust).toBe('unverified');
    expect(validationResult.rejectionReason).toContain('Country mismatch');
  });

  it('4. Provisional coordinates remain eligible when reverse geocoding is unavailable and there is no contradiction', () => {
    // Nominatim returns 429/null during reverse geocoding
    const validationResult = validateEntityCoordinates({
      requestedEntity: 'Hagia Sophia',
      recoveredEntity: 'Hagia Sophia',
      coordinates: { lat: 41.0086, lng: 28.9802 },
      expectedRegion: 'Istanbul, Turkey',
      reverseGeographicContext: null
    });

    expect(validationResult.consistent).toBe(true);
    expect(validationResult.result).toBe('UNVERIFIED');
    expect(validationResult.coordinateTrust).toBe('provisional');
  });

  it('5. Nominatim 429 rate limit is treated as unavailable lookup and does not promote to verified', () => {
    const validationResult = validateEntityCoordinates({
      requestedEntity: 'Unknown Remote Peak',
      recoveredEntity: 'Unknown Remote Peak',
      coordinates: { lat: -25.3444, lng: 131.0369 },
      expectedRegion: 'Northern Territory, Australia',
      reverseGeographicContext: null
    });

    expect(validationResult.coordinateTrust).toBe('provisional');
    expect(validationResult.result).not.toBe('MATCH');
  });
});
