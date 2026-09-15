import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  validateHistoricalCoordinate, 
  isMaritimeHistoricalEntity, 
  toCanonicalTitleCase 
} from '../geographic/historicalCoordinateValidator';
import { routeIntentAndExtractEntity, normalizeLocationEntity } from '../geminiService';
import * as geminiService from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { validateEntityIdentity } from '../geographic/entityIdentityValidator';

describe('General Maritime Historical Shipwreck Resolution & Validation Architecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Canonical classification helper: correctly identifies maritime historical entity types', () => {
    expect(isMaritimeHistoricalEntity('shipwreck_site')).toBe(true);
    expect(isMaritimeHistoricalEntity('shipwreck')).toBe(true);
    expect(isMaritimeHistoricalEntity('maritime_wreck')).toBe(true);
    expect(isMaritimeHistoricalEntity('submerged_site')).toBe(true);
    expect(isMaritimeHistoricalEntity('naval_wreck')).toBe(true);
    expect(isMaritimeHistoricalEntity({ entityType: 'shipwreck_site' })).toBe(true);
    expect(isMaritimeHistoricalEntity({ entityType: 'monument' })).toBe(false);
    expect(isMaritimeHistoricalEntity({ entityType: 'city' })).toBe(false);
    expect(isMaritimeHistoricalEntity({ entityType: 'battlefield' })).toBe(false);
    expect(isMaritimeHistoricalEntity('monument')).toBe(false);
  });

  it('2. Ship name and initialism preservation: preserves SS, RMS, USS, HMS, MV without generic lowercase damage', () => {
    expect(toCanonicalTitleCase('ss republic')).toBe('SS Republic');
    expect(toCanonicalTitleCase('SS Republic')).toBe('SS Republic');
    expect(toCanonicalTitleCase('rms titanic')).toBe('RMS Titanic');
    expect(toCanonicalTitleCase('uss arizona')).toBe('USS Arizona');
    expect(toCanonicalTitleCase('hms victory')).toBe('HMS Victory');
    expect(toCanonicalTitleCase('mv wilhelm gustloff')).toBe('MV Wilhelm Gustloff');
    expect(toCanonicalTitleCase('the ss republic')).toBe('The SS Republic');

    // normalizeLocationEntity integration
    expect(normalizeLocationEntity('ss republic')).toBe('SS Republic');
    expect(normalizeLocationEntity('SS Republic')).toBe('SS Republic');
    expect(normalizeLocationEntity('rms titanic')).toBe('RMS Titanic');
  });

  it('3. Intent routing & entity extraction: "Where was the SS Republic found?" routes to DISCOVERY_OBJECT_LOCATION and "SS Republic"', () => {
    const query = 'Where was the SS Republic found?';
    const routed = routeIntentAndExtractEntity(query);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('SS Republic');
    expect(routed.resolutionMode).toBe('SINGLE_POINT');
  });

  it('4. Primary Regression (SS Republic): candidate in Atlantic Ocean off Georgia coast is accepted (MARITIME_LOCATION_SUPPORTED)', async () => {
    // True discovery coordinate for SS Republic (100 miles off Savannah, Georgia in Atlantic Ocean)
    const ssRepublicCoords = { lat: 31.958472, lng: -79.60583 };

    const validation = await validateHistoricalCoordinate('SS Republic', ssRepublicCoords, {
      rawQuery: 'Where was the SS Republic found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      entityType: 'shipwreck_site',
      expectedRegion: 'Atlantic Ocean, off Georgia/South Carolina coast, United States',
      locationDescription: 'Sunk in 1865 in the Atlantic Ocean approx. 100 miles southeast of Savannah, Georgia',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(true);
    expect(validation.reason).toBe('MARITIME_LOCATION_SUPPORTED');
  });

  it('5. Batavia: offshore coordinate in Wallabi Group / Indian Ocean is accepted', async () => {
    const bataviaCoords = { lat: -28.4903, lng: 113.7933 };

    const validation = await validateHistoricalCoordinate('Batavia Shipwreck Site', bataviaCoords, {
      rawQuery: 'Where was the Batavia found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      entityType: 'shipwreck_site',
      expectedRegion: 'Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(true);
    expect(validation.reason).toMatch(/MARITIME_LOCATION_SUPPORTED|MATCHES_EXPECTED_HISTORICAL_REGION/);
  });

  it('6. Titanic: generic maritime classification and North Atlantic coordinate is accepted', async () => {
    const titanicCoords = { lat: 41.7269, lng: -49.9483 };

    const validation = await validateHistoricalCoordinate('RMS Titanic Sinking Site', titanicCoords, {
      rawQuery: 'Where did the Titanic sink?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      entityType: 'shipwreck_site',
      expectedRegion: 'North Atlantic Ocean (Southeast of Newfoundland)',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(true);
    expect(validation.reason).toMatch(/MARITIME_LOCATION_SUPPORTED|MATCHES_EXPECTED_HISTORICAL_REGION/);
  });

  it('7. Random ocean coordinate: unsupported/conflicting ocean coordinate is strictly rejected', async () => {
    // Random coordinate in the middle of South Pacific for SS Republic (which is in North Atlantic)
    const randomSouthPacificCoords = { lat: -45.0, lng: -140.0 };

    const validation = await validateHistoricalCoordinate('SS Republic', randomSouthPacificCoords, {
      rawQuery: 'Where was the SS Republic found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      entityType: 'shipwreck_site',
      expectedRegion: 'Atlantic Ocean, off Georgia coast, United States',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/GEOGRAPHIC_MISMATCH|INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE/);
  });

  it('8. Land historical entity in water: non-maritime historical entity with water coordinate is strictly rejected', async () => {
    // Eiffel Tower candidate placed in open Atlantic ocean
    const oceanCoords = { lat: 25.0, lng: -45.0 };

    const validation = await validateHistoricalCoordinate('Eiffel Tower', oceanCoords, {
      rawQuery: 'Eiffel Tower',
      intent: 'DIRECT',
      entityType: 'monument',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE');
  });

  it('9. Entity identity protection: unverified entity identity cannot gain maritime validation exception', () => {
    const identityCheck = validateEntityIdentity('SS Republic', 'Unknown Shipwreck', {
      rawQuery: 'Where was the SS Republic found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      candidateEntityType: 'shipwreck_site',
      coordinatesValid: true
    });

    expect(identityCheck.matches).toBe(false);
    expect(identityCheck.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
  });

  it('10. End-to-End Pipeline: resolves "Where was the SS Republic found?" with verified identity and valid coordinates via recovery', async () => {
    // Mock AI recovery returning valid SS Republic coordinates off Georgia
    vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValueOnce({
      lat: 31.958472,
      lng: -79.60583,
      source: 'ai_recovery',
      confidence: 'high',
      recoveredEntity: 'SS Republic',
      canonicalName: 'SS Republic',
      entityType: 'shipwreck_site',
      coordinateTrust: 'provisional'
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValueOnce({
      description: "The SS Republic was an American Civil War-era sidewheel steamship that sank in 1865 off Georgia.",
      climate: { name: "Humid subtropical", description: "Maritime coastal", koppenCode: "Cfa" },
      notable: [{ title: "Shipwreck Discovery", description: "Discovered in 2003 by Odyssey Marine Exploration." }]
    });

    const result = await runSearchPipeline({ rawQuery: 'Where was the SS Republic found?' });

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    expect(entity.subject.identity.canonicalName).toBe('SS Republic');
    expect(entity.subject.identity.entityType).toBe('shipwreck_site');

    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(31.9585, 2);
    expect(coords.lng).toBeCloseTo(-79.6058, 2);
  });

  it('11. Candidate Identity & Trust Gate: requested entity "SS Republic", candidate "SS Republic Shipwreck Site" survives trust gate', async () => {
    // Initial resolver returns candidate with name "SS Republic Shipwreck Site" and source "ai"
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValueOnce({
      locationInfo: {
        name: 'SS Republic Shipwreck Site',
        canonicalName: 'SS Republic Shipwreck Site',
        type: 'Point of Interest' as any,
        entityType: 'shipwreck_site' as any,
        coordinates: { lat: 31.958472, lng: -79.60583 },
        coordinateSource: 'ai',
        coordinateTrust: 'provisional',
        identityStatus: 'verified',
        locationString: 'Atlantic Ocean, off Georgia Coast',
        description: 'The SS Republic Shipwreck Site contains the remains of the sidewheel steamship sunk in 1865.'
      },
      suggestedZoom: 8,
      aiUsed: true
    });

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValueOnce({
      description: "The SS Republic was an American Civil War-era sidewheel steamship.",
      climate: { name: "Humid subtropical", description: "Maritime coastal", koppenCode: "Cfa" },
      notable: [{ title: "Shipwreck Discovery", description: "Discovered in 2003." }]
    });

    const result = await runSearchPipeline({ rawQuery: 'Where was the SS Republic found?' });

    expect(result.isValid).toBe(true);
    expect(result.entity?.subject.identity.canonicalName).toBe('SS Republic Shipwreck Site');
    expect(result.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(31.9585, 2);
  });

  it('12. Prefix Guard: Vessel with SS/USS/RMS prefix but no wreck/discovery context does NOT receive shipwreck water exception', async () => {
    // Non-discovery query: "USS Nimitz" (active/modern aircraft carrier, not a shipwreck discovery site) in random water
    const oceanCoords = { lat: 25.0, lng: -45.0 };
    const validation = await validateHistoricalCoordinate('USS Nimitz', oceanCoords, {
      rawQuery: 'USS Nimitz',
      intent: 'DIRECT',
      entityType: 'vessel',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE');
  });
});


