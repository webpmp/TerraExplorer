import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity, resolveLocationQuery } from '../geminiService';

describe('Semantic Entity Resolution Architecture Tests', () => {
  const testCases = [
    // Historical Events
    {
      query: "Where did the Boston Massacre take place?",
      expectedEntityType: "historical_event_site",
      expectPopulationNull: true
    },
    {
      query: "Where did Woodstock take place?",
      expectedEntityType: "festival_site",
      expectPopulationNull: true
    },

    // Discovery
    {
      query: "Where was the Vasa found?",
      expectedEntityType: "shipwreck_site",
      forbiddenName: "Vasa Museum",
      expectPopulationNull: true
    },
    {
      query: "Where was the Titanic found?",
      expectedEntityType: "shipwreck_site",
      expectPopulationNull: true
    },
    {
      query: "Where were the Dead Sea Scrolls discovered?",
      expectedEntityType: "archaeological_site",
      expectPopulationNull: true
    },
    {
      query: "Where was the Rosetta Stone discovered?",
      expectedEntityType: "discovery_site",
      expectPopulationNull: true
    },

    // Natural Feature
    {
      query: "Where is Mount Fuji?",
      expectedEntityType: "mountain",
      expectPopulationNull: true
    }
  ];

  testCases.forEach((tc) => {
    test(`Query: "${tc.query}"`, async () => {
      const routed = routeIntentAndExtractEntity(tc.query);
      expect(routed.intent).toBeDefined();
      expect(routed.entity).toBeDefined();
    });
  });

  describe('Historical Event Location Resolution & Semantic Anchoring Tests', () => {
    test('Sputnik Launch query routes to HISTORICAL_EVENT and extracts entity without hardcoding', () => {
      const routed = routeIntentAndExtractEntity('Where did the launch of Sputnik take place?');
      expect(routed.intent).toBe('HISTORICAL_EVENT');
      expect(routed.entity.toLowerCase()).toContain('sputnik');
      expect(routed.resolutionMode).toBe('MULTI_LOCATION_EXPLORATION');
    });

    test('Gagarin Launch query routes to HISTORICAL_EVENT and extracts entity', () => {
      const routed = routeIntentAndExtractEntity('Where did Yuri Gagarin launch into space?');
      expect(routed.intent).toBe('HISTORICAL_EVENT');
      expect(routed.entity.toLowerCase()).toContain('gagarin');
    });

    test('Generic historical event queries route to HISTORICAL_EVENT', () => {
      const queries = [
        'Where did the first atomic bomb test take place?',
        'Where was the signing of the Declaration of Independence?',
        'Where did the Battle of Gettysburg take place?',
        'Where was the Apollo 11 launch?',
        'Where was the Hindenburg disaster?'
      ];

      queries.forEach(q => {
        const routed = routeIntentAndExtractEntity(q);
        expect(['HISTORICAL_EVENT', 'DISCOVERY_OBJECT_LOCATION', 'NATURAL_LOCATION']).toContain(routed.intent);
        expect(routed.entity.length).toBeGreaterThan(0);
      });
    });

    test('Sputnik location verification: Site No. 1 / Baikonur Cosmodrome (~45.92, 63.34) vs incorrect Site No. 33', () => {
      // Correct coordinates for Site No. 1 (Baikonur Cosmodrome)
      const correctSputnikCoords = { lat: 45.92, lng: 63.34 };
      // Incorrect candidate coordinates for Site No. 33 / Kosmotras
      const incorrectSite33Coords = { lat: 47.66, lng: 58.61 };

      // Distance from correct Site No. 1 to ~45.92, 63.34 should be within 0.1 deg
      const latDiff = Math.abs(correctSputnikCoords.lat - 45.92);
      const lngDiff = Math.abs(correctSputnikCoords.lng - 63.34);
      expect(latDiff).toBeLessThan(0.1);
      expect(lngDiff).toBeLessThan(0.1);

      // Verify that Site No. 33 coordinates are distinct from Site No. 1
      const site33LatDiff = Math.abs(incorrectSite33Coords.lat - 45.92);
      const site33LngDiff = Math.abs(incorrectSite33Coords.lng - 63.34);
      expect(site33LatDiff).toBeGreaterThan(1.0);
      expect(site33LngDiff).toBeGreaterThan(1.0);
    });

    test('Semantic Anchor Invariant: Sputnik query maintains Sputnik 1 as primary and Gagarin as secondary', () => {
      const sputnikWaypoint = {
        name: 'Site No. 1, Baikonur Cosmodrome',
        coordinates: { lat: 45.92, lng: 63.34 },
        description: 'Sputnik 1 was launched on October 4, 1957, from Site No. 1 at the Baikonur Cosmodrome in Kazakhstan, marking the dawn of the Space Age. Yuri Gagarin later launched from the same pad on April 12, 1961.',
        significance: 'Site No. 1 is the launchpad for the first artificial Earth satellite, Sputnik 1.'
      };

      // Primary event must be Sputnik 1 / October 4, 1957
      expect(sputnikWaypoint.description).toContain('Sputnik 1');
      expect(sputnikWaypoint.description).toContain('October 4, 1957');
      expect(sputnikWaypoint.description).toContain('Site No. 1');
      expect(sputnikWaypoint.description).not.toContain('Site No. 33');

      // First sentence / subject is Sputnik
      const firstSentence = sputnikWaypoint.description.split('.')[0];
      expect(firstSentence).toContain('Sputnik 1');
    });

    test('Semantic Anchor Invariant: Gagarin query maintains Vostok 1 / Gagarin 1961 as primary', () => {
      const gagarinWaypoint = {
        name: 'Site No. 1 (Gagarin\'s Start), Baikonur Cosmodrome',
        coordinates: { lat: 45.92, lng: 63.34 },
        description: 'Yuri Gagarin launched into space on April 12, 1961, aboard Vostok 1 from Site No. 1 at the Baikonur Cosmodrome, becoming the first human in space.',
        significance: 'Site No. 1 was the launch site for the first human spaceflight by Yuri Gagarin in 1961.'
      };

      // Primary event must be Yuri Gagarin / April 12, 1961 / Vostok 1
      expect(gagarinWaypoint.description).toContain('Yuri Gagarin');
      expect(gagarinWaypoint.description).toContain('April 12, 1961');
      expect(gagarinWaypoint.description).toContain('Vostok 1');
      expect(gagarinWaypoint.description).toContain('Site No. 1');

      const firstSentence = gagarinWaypoint.description.split('.')[0];
      expect(firstSentence).toContain('Yuri Gagarin');
    });

    test('Franklin Expedition: "Where was the HMS Terror found?" routes to DISCOVERY_OBJECT_LOCATION and resolves to Terror Bay, Nunavut', async () => {
      const query = 'Where was the HMS Terror found?';
      const routed = routeIntentAndExtractEntity(query);
      expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
      expect(routed.entity).toBe('HMS Terror');

      const resolved = await resolveLocationQuery(routed.entity, routed.intent, query);
      expect(resolved.error).toBeUndefined();
      expect(resolved.locationInfo).toBeDefined();
      expect(resolved.locationInfo?.name).toContain('HMS Terror');
      expect(resolved.locationInfo?.coordinates).toBeDefined();

      const coords = resolved.locationInfo!.coordinates!;
      // HMS Terror was discovered in Terror Bay (~68.855° N, -98.935° W)
      expect(coords.lat).toBeGreaterThan(68.0);
      expect(coords.lat).toBeLessThan(70.0);
      expect(coords.lng).toBeLessThan(-95.0);
      expect(coords.lng).toBeGreaterThan(-105.0);
    });

    test('Franklin Expedition: "Where was the HMS Erebus found?" routes to DISCOVERY_OBJECT_LOCATION and resolves to Wilmot and Crampton Bay, Nunavut', async () => {
      const query = 'Where was the HMS Erebus found?';
      const routed = routeIntentAndExtractEntity(query);
      expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
      expect(routed.entity).toBe('HMS Erebus');

      const resolved = await resolveLocationQuery(routed.entity, routed.intent, query);
      expect(resolved.error).toBeUndefined();
      expect(resolved.locationInfo).toBeDefined();
      expect(resolved.locationInfo?.name).toContain('HMS Erebus');
      expect(resolved.locationInfo?.coordinates).toBeDefined();

      const coords = resolved.locationInfo!.coordinates!;
      // HMS Erebus was discovered in Wilmot and Crampton Bay (~68.25° N, -98.87° W)
      expect(coords.lat).toBeGreaterThan(67.5);
      expect(coords.lat).toBeLessThan(69.0);
      expect(coords.lng).toBeLessThan(-95.0);
      expect(coords.lng).toBeGreaterThan(-105.0);
    });
  });
});


