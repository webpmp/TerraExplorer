import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeIntentAndExtractEntity, resolveLocationQuery } from '../geminiService';
import { validateHistoricalCoordinate, getHistoricalEntityKnowledge, toCanonicalTitleCase } from '../geographic/historicalCoordinateValidator';
import { validateImageCandidate, isDifferentNamedEntity, fetchAndValidateImages } from '../imageService';
import { runSearchPipeline } from '../pipeline';
import { validateResolvedEntity } from '../entityValidation';
import { createIdentity, createResolvedSubject, createResolvedEntity } from '../entityFactory';

describe('SS Yongala Coordinate Resolution, Entity Context Isolation & Image Geography Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Entity disambiguation: "Where was the Yongala found?" routes to canonicalName "SS Yongala" with shipwreck classification', async () => {
    const query = 'Where was the Yongala found?';
    const routed = routeIntentAndExtractEntity(query);
    
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('SS Yongala');

    const resolved = await runSearchPipeline({ rawQuery: query });
    expect(resolved.isValid).toBe(true);
    expect(resolved.entity?.subject.identity.canonicalName).toBe('SS Yongala');
    expect(resolved.entity?.subject.identity.entityType).toBe('shipwreck_site');
  });

  it('2. Wrong AI coordinate rejected: inland Queensland coordinate (-28.1735, 150.4469) is rejected for SS Yongala', async () => {
    const wrongAiCoords = { lat: -28.1735, lng: 150.4469 };

    const validation = await validateHistoricalCoordinate('SS Yongala', wrongAiCoords, {
      rawQuery: 'Where was the Yongala found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai_recovery'
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('GEOGRAPHIC_MISMATCH');
    expect(validation.expectedRegion).toContain('Cape Bowling Green');
  });

  it('3. Correct geographic region: resolves to Queensland, Australia near ~19.31° S, 147.62° E', async () => {
    const query = 'Where was the Yongala found?';
    const resolved = await resolveLocationQuery('SS Yongala', 'DISCOVERY_OBJECT_LOCATION', query);

    expect(resolved.locationInfo).toBeDefined();
    const coords = resolved.locationInfo?.coordinates;
    expect(coords).toBeDefined();
    expect(coords?.lat).toBeCloseTo(-19.30, 1);
    expect(coords?.lng).toBeCloseTo(147.62, 1);

    const histKnowledge = getHistoricalEntityKnowledge('SS Yongala');
    expect(histKnowledge).toBeDefined();
    expect(histKnowledge?.allowedCountries).toContain('Australia');
    expect(histKnowledge?.expectedRegion).toContain('Queensland');
  });

  it('4. Context isolation: Previous search with Columbus/Hispaniola does not contaminate Yongala search', async () => {
    // Simulate previous search for Santa Maria with Columbus context
    const previousResult = await runSearchPipeline({ rawQuery: 'Where was the Santa Maria found?' });
    expect(previousResult.entity?.subject.identity.canonicalName).toBe('Santa Maria');

    // Run subsequent search for Yongala
    const yongalaResult = await runSearchPipeline({ rawQuery: 'Where was the Yongala found?' });
    expect(yongalaResult.isValid).toBe(true);
    expect(yongalaResult.entity?.subject.identity.canonicalName).toBe('SS Yongala');

    const desc = yongalaResult.entity?.subject.primaryLocation.description || '';
    const histContext = (yongalaResult.entity?.subject.primaryLocation as any)?.historicalContext || '';

    // Verify zero context contamination
    expect(desc.toLowerCase()).not.toContain('columbus');
    expect(desc.toLowerCase()).not.toContain('santa maría');
    expect(desc.toLowerCase()).not.toContain('hispaniola');
    expect(desc.toLowerCase()).not.toContain('haiti');
    expect(histContext.toLowerCase()).not.toContain('columbus');
    expect(histContext.toLowerCase()).not.toContain('hispaniola');
  });

  it('5. Image search context consistency: SS Yongala receives Australian/Queensland context without Columbus/Haiti leaks', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    // Mock fetch for Wikipedia
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ query: { pages: {} } })
    }));

    await fetchAndValidateImages({
      name: 'SS Yongala',
      canonicalName: 'SS Yongala',
      country: 'Australia',
      state: 'Queensland',
      entityType: 'shipwreck_site',
      coordinates: { lat: -19.3044, lng: 147.6225 }
    } as any);

    const detailLog = consoleSpy.mock.calls.find(c => String(c[0]).includes('[IMAGE SEARCH DETAILS]'));
    expect(detailLog).toBeDefined();
    const logText = String(detailLog?.[0]);

    expect(logText).toContain('Entity: SS Yongala');
    expect(logText).toContain('Geographic Context: Queensland / Australia');
    expect(logText).not.toContain('Christopher Columbus');
    expect(logText).not.toContain('Hispaniola');
    expect(logText).not.toContain('Haiti');
  });

  it('6. Image candidate filtering: Rejects non-maritime land candidates like "Yongala, South Australia", "Hundred of Yongala", "Yongala Lodge"', () => {
    const yongalaEntity = {
      name: 'SS Yongala',
      canonicalName: 'SS Yongala',
      entityType: 'shipwreck_site',
      country: 'Australia',
      state: 'Queensland',
      coordinates: { lat: -19.3044, lng: 147.6225 }
    };

    // 1. South Australia town
    const townCandidate = {
      title: 'Yongala, South Australia',
      description: 'Yongala is a small town in the Mid North region of South Australia.',
      coordinates: { lat: -33.0275, lng: 138.7561 } // Far away in South Australia
    };
    const checkTown = validateImageCandidate(townCandidate, yongalaEntity);
    expect(checkTown.decision).toBe('REJECT');

    // 2. Hundred of Yongala (administrative cadastral division)
    const hundredCandidate = {
      title: 'Hundred of Yongala',
      description: 'The Hundred of Yongala is a cadastral unit of hundred in South Australia.',
      coordinates: { lat: -33.02, lng: 138.75 }
    };
    const checkHundred = validateImageCandidate(hundredCandidate, yongalaEntity);
    expect(checkHundred.decision).toBe('REJECT');

    // 3. Yongala Lodge
    const lodgeCandidate = {
      title: 'Yongala Lodge',
      description: 'Historic accommodation and lodge building.',
      coordinates: { lat: -33.03, lng: 138.76 }
    };
    const checkLodge = validateImageCandidate(lodgeCandidate, yongalaEntity);
    expect(checkLodge.decision).toBe('REJECT');

    // 4. Legitimate SS Yongala Shipwreck image candidate
    const shipwreckCandidate = {
      title: 'SS Yongala Shipwreck Site',
      description: 'Underwater view of the historic steamship SS Yongala wreck in the Great Barrier Reef Marine Park, Queensland.',
      coordinates: { lat: -19.3044, lng: 147.6225 }
    };
    const checkShipwreck = validateImageCandidate(shipwreckCandidate, yongalaEntity);
    expect(checkShipwreck.decision).toBe('ACCEPT');
  });

  it('7. Existing canonical and entity behavior preserved without regression', () => {
    expect(toCanonicalTitleCase('ss republic')).toBe('SS Republic');
    expect(toCanonicalTitleCase('uss constitution')).toBe('USS Constitution');
    expect(toCanonicalTitleCase('hms erebus')).toBe('HMS Erebus');
    expect(toCanonicalTitleCase('nasa jet propulsion laboratory')).toBe('NASA Jet Propulsion Laboratory');
    expect(toCanonicalTitleCase('unesco site')).toBe('UNESCO Site');
    expect(toCanonicalTitleCase('BOSTON MASSACHUSETTS')).toBe('Boston, Massachusetts');
  });

  it('8. Offshore geographic validation accepts recovered SS Yongala coordinate (-21.2667, 150.8333)', () => {
    const coords = { lat: -21.2667, lng: 150.8333 };
    const identity = createIdentity(
      'Where was the Yongala found?',
      'SS Yongala',
      'place',
      'shipwreck_site'
    );
    const subject = createResolvedSubject(identity, {
      label: 'SS Yongala',
      location: {
        coordinates: coords,
        address: { country: 'Australia', state: 'Queensland', city: 'Townsville' }
      },
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified'
    } as any);

    const entity = createResolvedEntity(subject, {
      description: 'Historic Australian steamship wreck discovered in 1958 in the Great Barrier Reef Marine Park.'
    } as any);

    const isValid = validateResolvedEntity(entity);
    expect(isValid).toBe(true);
  });

  it('9. Offshore geographic validation succeeds when reverse geocoding has no terrestrial country/state', () => {
    const coords = { lat: -21.2667, lng: 150.8333 };
    const identity = createIdentity(
      'Where was the Yongala found?',
      'SS Yongala',
      'place',
      'shipwreck_site'
    );
    // Address has no terrestrial country/state (e.g. open water reverse geocode)
    const subject = createResolvedSubject(identity, {
      label: 'SS Yongala',
      location: {
        coordinates: coords,
        address: {}
      },
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified'
    } as any);

    const entity = createResolvedEntity(subject, {
      description: 'Historic Australian steamship wreck discovered in 1958 in the Great Barrier Reef Marine Park.'
    } as any);

    const isValid = validateResolvedEntity(entity);
    expect(isValid).toBe(true);
  });

  it('10. Offshore geographic validation rejects clearly incompatible coordinates for SS Yongala (e.g. North Atlantic or South Australia)', () => {
    const atlanticCoords = { lat: 41.7325, lng: -49.9469 }; // North Atlantic (Titanic area)
    const identity = createIdentity(
      'Where was the Yongala found?',
      'SS Yongala',
      'place',
      'shipwreck_site'
    );
    const subject = createResolvedSubject(identity, {
      label: 'SS Yongala',
      location: {
        coordinates: atlanticCoords,
        address: {}
      },
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified'
    } as any);

    const entity = createResolvedEntity(subject, {
      description: 'Historic Australian steamship wreck discovered in 1958 in the Great Barrier Reef Marine Park.'
    } as any);

    const isValid = validateResolvedEntity(entity);
    expect(isValid).toBe(false);
  });

  it('11. Generic offshore validation works for other known shipwrecks (HMS Terror in Terror Bay, Nunavut)', () => {
    const terrorCoords = { lat: 68.8550, lng: -98.9350 };
    const identity = createIdentity(
      'Where was the HMS Terror found?',
      'HMS Terror',
      'place',
      'shipwreck_site'
    );
    const subject = createResolvedSubject(identity, {
      label: 'HMS Terror',
      location: {
        coordinates: terrorCoords,
        address: {}
      },
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified'
    } as any);

    const entity = createResolvedEntity(subject, {
      description: 'Franklin Expedition bomb vessel discovered intact in 2016 in Terror Bay.'
    } as any);

    const isValid = validateResolvedEntity(entity);
    expect(isValid).toBe(true);
  });
});
