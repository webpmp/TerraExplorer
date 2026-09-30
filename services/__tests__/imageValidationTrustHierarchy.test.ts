import { describe, test, expect } from 'vitest';
import { validateImageCandidate, deriveEntityAliases, classifyImageEvidence, buildEntityImageQueries } from '../imageService';
import type { ImageCandidate } from '../imageService';

describe('Image Validation Trust Hierarchy & Diacritics Resolution', () => {

  const caldeiraoEntity = {
    name: 'Caldeirão do Inferno',
    canonicalName: 'Caldeirão do Inferno',
    entityType: 'natural_feature',
    intent: 'NATURAL_LOCATION',
    identityStatus: 'verified',
    coordinates: { lat: -23.548795, lng: -46.638015 },
    coordinateSource: 'ai_recovery',
    coordinateTrust: 'provisional',
    city: 'São Paulo',
    state: 'São Paulo',
    country: 'Brazil'
  };

  test('1. Exact canonical entity match with trusted/verified coordinates is ACCEPTED (Tier 1)', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/caldeirao.jpg',
      title: 'Caldeirão do Inferno',
      description: 'A view of Caldeirão do Inferno in São Paulo, Brazil.',
      coordinates: { lat: -23.5488, lng: -46.6380 }
    };

    const res = validateImageCandidate(candidate, {
      ...caldeiraoEntity,
      coordinateSource: 'deterministic',
      coordinateTrust: 'verified'
    });

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
    expect(res.reason).toBe('STRONG_ENTITY_MATCH_GEO_VERIFIED');
  });

  test('2. Exact canonical entity match with provisional AI coordinates is ACCEPTED (Tier 1)', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/caldeirao.jpg',
      title: 'Caldeirão do Inferno',
      description: 'A view of Caldeirão do Inferno in São Paulo, Brazil.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
    expect(res.reason).toBe('STRONG_ENTITY_MATCH');
  });

  test('3. Exact canonical entity match with no coordinates is ACCEPTED (Tier 1)', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/caldeirao.jpg',
      title: 'Caldeirão do Inferno',
      description: 'A photograph of Caldeirão do Inferno.'
    };

    const res = validateImageCandidate(candidate, {
      ...caldeiraoEntity,
      coordinates: undefined,
      coordinateSource: undefined,
      coordinateTrust: undefined
    });

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
    expect(res.reason).toBe('STRONG_ENTITY_MATCH');
  });

  test('4. Unicode canonical match with exact accents is ACCEPTED (Tier 1)', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/caldeirao_unicode.jpg',
      title: 'Caldeirão do Inferno',
      description: 'Caldeirão do Inferno landscape.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
  });

  test('5. Diacritic-stripped equivalent match (Caldeirao do Inferno) is ACCEPTED (Tier 1)', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/caldeirao_stripped.jpg',
      title: 'Caldeirao do Inferno',
      description: 'Caldeirao do Inferno photo without diacritics.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
  });

  test('6. Known alias match is ACCEPTED', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/inferno_caldeirao.jpg',
      title: 'Inferno Caldeirão',
      description: 'Alternate named representation of the site.'
    };

    const res = validateImageCandidate(candidate, {
      ...caldeiraoEntity,
      aliases: ['Inferno Caldeirão', 'Caldeirão Pool']
    });

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBeLessThanOrEqual(2);
  });

  test('7. Generic semantic match (e.g. Volcanic crater lake) is REJECTED', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/generic_crater.jpg',
      title: 'Volcanic crater lake',
      description: 'A generic volcanic crater lake in South America.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
  });

  test('8. Geographically nearby but unrelated entity (e.g. Carandiru massacre) is REJECTED', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/carandiru.jpg',
      title: 'Carandiru massacre memorial',
      description: 'Memorial for the Carandiru massacre in São Paulo, Brazil.',
      coordinates: { lat: -23.5188, lng: -46.6250 }
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('REJECT');
  });

  test('9. Far-away entity with conflicting geographic metadata (São Mateus, Espírito Santo) is REJECTED', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/sao_mateus.jpg',
      title: 'São Mateus, Espírito Santo',
      description: 'Municipality in Espírito Santo, Brazil.',
      coordinates: { lat: -18.7161, lng: -39.8589 } // ~885 km away
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('REJECT');
  });

  test('10. Generic natural-feature image without entity evidence is REJECTED', () => {
    const candidate: ImageCandidate = {
      url: 'https://example.com/generic_waterfall.jpg',
      title: 'Tropical waterfall and pool',
      description: 'A beautiful natural waterfall in the rainforest.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
  });

  test('11. Wikimedia File: prefix and underscore titles match properly', () => {
    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/File_Caldeirao_do_Inferno.jpg',
      title: 'File:Caldeirão_do_Inferno.jpg',
      description: 'Caldeirão do Inferno taken from elevated view.'
    };

    const res = validateImageCandidate(candidate, caldeiraoEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
  });

  test('12. Exact canonical match (Caldeirão Grande) with provisional AI coordinates and 1546km distance is ACCEPTED (Tier 1)', () => {
    const caldeiraoGrandeEntity = {
      name: 'Caldeirão Grande',
      canonicalName: 'Caldeirão Grande',
      entityType: 'natural_feature',
      intent: 'NATURAL_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: -23.548795, lng: -46.638015 }, // AI recovered in São Paulo
      coordinateSource: 'ai_recovery',
      coordinateTrust: 'provisional',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brazil'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Caldeir%C3%A3o_Grande.jpg/800px-Caldeir%C3%A3o_Grande.jpg',
      title: 'Caldeirão Grande',
      description: 'Landscape and view of Caldeirão Grande in Bahia, Brazil.',
      coordinates: { lat: -10.9708, lng: -40.3014 } // Bahia coords (~1546 km away)
    };

    const res = validateImageCandidate(candidate, caldeiraoGrandeEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
    expect(res.reason).toBe('STRONG_ENTITY_MATCH_PROVISIONAL_GEO_CONFLICT');
    expect(res.score).toBeGreaterThanOrEqual(50);
  });

  test('13. Exact canonical match with VERIFIED coordinates and 1546km distance is REJECTED due to trusted geographic conflict', () => {
    const caldeiraoGrandeVerified = {
      name: 'Caldeirão Grande',
      canonicalName: 'Caldeirão Grande',
      entityType: 'natural_feature',
      intent: 'NATURAL_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: -23.548795, lng: -46.638015 },
      coordinateSource: 'deterministic',
      coordinateTrust: 'verified',
      city: 'São Paulo',
      country: 'Brazil'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Caldeir%C3%A3o_Grande.jpg/800px-Caldeir%C3%A3o_Grande.jpg',
      title: 'Caldeirão Grande',
      description: 'Landscape in Bahia.',
      coordinates: { lat: -10.9708, lng: -40.3014 }
    };

    const res = validateImageCandidate(candidate, caldeiraoGrandeVerified);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('GEOGRAPHIC_CONFLICT');
  });

  test('14. Unrelated entity (e.g. Caio Castro) with provisional coordinates is REJECTED', () => {
    const caldeiraoGrandeEntity = {
      name: 'Caldeirão Grande',
      canonicalName: 'Caldeirão Grande',
      entityType: 'natural_feature',
      intent: 'NATURAL_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: -23.548795, lng: -46.638015 },
      coordinateSource: 'ai_recovery',
      coordinateTrust: 'provisional',
      country: 'Brazil'
    };

    const candidate: ImageCandidate = {
      url: 'https://example.com/caio_castro.jpg',
      title: 'Caio Castro',
      description: 'Brazilian actor and model in São Paulo, Brazil.',
      coordinates: { lat: -23.5505, lng: -46.6333 }
    };

    const res = validateImageCandidate(candidate, caldeiraoGrandeEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('DIFFERENT_ENTITY');
  });

  test('15. buildEntityImageQueries produces 7-stage query escalation starting with exact unconstrained name', () => {
    const queries: string[] = buildEntityImageQueries({
      name: 'Caldeirão Grande',
      canonicalName: 'Caldeirão Grande',
      city: 'São Paulo',
      country: 'Brazil',
      entityType: 'natural_feature',
      intent: 'NATURAL_LOCATION'
    });

    expect(queries[0]).toBe('Caldeirão Grande');
    expect(queries).toContain('Caldeirão Grande Brazil');
    expect(queries).toContain('Caldeirão Grande natural feature');
    expect(queries).toContain('Caldeirão Grande turismo');
    expect(queries).toContain('Caldeirao Grande');
    expect(queries).toContain('Caldeirão Grande São Paulo Brazil');
  });

  test('16. Exact entity match + explicit conflicting geography + provisional canonical coordinates is REJECTED (Santa Maria Ship & Museum in Ohio vs Haiti)', () => {
    const santaMariaEntity = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 19.76, lng: -72.2 },
      coordinateSource: 'historical_approximate',
      coordinateTrust: 'provisional',
      city: 'Cap-Haitien',
      state: 'Département du Nord',
      country: 'Haiti'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Santa_Maria_Museum_Ohio.jpg/800px-Santa_Maria_Museum_Ohio.jpg',
      title: 'Santa Maria Ship & Museum',
      description: 'The Santa Maria replica and museum docked on the Scioto River in Columbus, Ohio, United States.'
    };

    const res = validateImageCandidate(candidate, santaMariaEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('GEOGRAPHIC_CONFLICT');
  });

  test('17. Exact entity match + unknown geography + provisional canonical coordinates remains eligible (Santa María ship replica)', () => {
    const santaMariaEntity = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 19.76, lng: -72.2 },
      coordinateSource: 'historical_approximate',
      coordinateTrust: 'provisional',
      city: 'Cap-Haitien',
      state: 'Département du Nord',
      country: 'Haiti'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Santa_Maria_Ship.jpg/800px-Santa_Maria_Ship.jpg',
      title: 'Santa María (ship)',
      description: 'A replica of the Santa María, the flagship of Christopher Columbus on his 1492 voyage.'
    };

    const res = validateImageCandidate(candidate, santaMariaEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
    expect(res.reason).toBe('STRONG_ENTITY_MATCH');
  });

  test('18. Exact historical entity match with compatible historical geography is ACCEPTED', () => {
    const santaMariaEntity = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 19.76, lng: -72.2 },
      coordinateSource: 'historical_approximate',
      coordinateTrust: 'provisional',
      city: 'Cap-Haitien',
      state: 'Département du Nord',
      country: 'Haiti'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Cap_Haitien_Coast_Santa_Maria.jpg/800px-Cap_Haitien_Coast_Santa_Maria.jpg',
      title: 'Santa Maria Shipwreck Site',
      description: 'Reef off the northern coast of Cap-Haïtien, Haiti, historic site of the Santa Maria grounding.'
    };

    const res = validateImageCandidate(candidate, santaMariaEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.tier).toBe(1);
  });

  test('19. Exact entity match + compatible geography with verified coordinates is ACCEPTED', () => {
    const vasaEntity = {
      name: 'Vasa',
      canonicalName: 'Vasa',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 59.3275, lng: 18.0911 },
      coordinateSource: 'deterministic',
      coordinateTrust: 'verified',
      city: 'Stockholm',
      country: 'Sweden'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Vasa_Ship_Stockholm.jpg/800px-Vasa_Ship_Stockholm.jpg',
      title: 'Vasa (ship)',
      description: 'The 17th-century salvaged warship preserved at the Vasa Museum in Stockholm, Sweden.'
    };

    const res = validateImageCandidate(candidate, vasaEntity);

    expect(res.decision).toBe('ACCEPT');
    expect(res.reason).toBe('STRONG_ENTITY_MATCH_GEO_VERIFIED');
  });

  test('20. No entity match + unknown geography is REJECTED (Niña ship for Santa Maria)', () => {
    const santaMariaEntity = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 19.76, lng: -72.2 },
      coordinateSource: 'historical_approximate',
      coordinateTrust: 'provisional',
      city: 'Cap-Haitien',
      state: 'Département du Nord',
      country: 'Haiti'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Nina_Ship.jpg/800px-Nina_Ship.jpg',
      title: 'Niña (ship)',
      description: 'One of the Spanish caravels used by Christopher Columbus in 1492.'
    };

    const res = validateImageCandidate(candidate, santaMariaEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
  });

  test('21. Generic event topic candidate (Columbus Day) is REJECTED for specific ship entity', () => {
    const santaMariaEntity = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      identityStatus: 'verified',
      coordinates: { lat: 19.76, lng: -72.2 },
      coordinateSource: 'historical_approximate',
      coordinateTrust: 'provisional',
      city: 'Cap-Haitien',
      state: 'Département du Nord',
      country: 'Haiti'
    };

    const candidate: ImageCandidate = {
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Columbus_Day.jpg/800px-Columbus_Day.jpg',
      title: 'Columbus Day',
      description: 'Holiday commemorating the arrival of Christopher Columbus in the Americas.'
    };

    const res = validateImageCandidate(candidate, santaMariaEntity);

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
  });

});

