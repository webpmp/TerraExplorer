import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  detectCelestialBody, 
  isCelestialBodySupported, 
  validateEarthGeography, 
  geographicCapabilities 
} from '../celestialCapabilities';
import { runSearchPipeline } from '../pipeline';
import { runRoutePipeline } from '../routePipeline';
import * as geminiService from '../geminiService';

describe('Celestial Body Geographic Capabilities & Earth-Only Validation Suite', () => {
  describe('1. Platform Capabilities Registry', () => {
    it('has Earth enabled and other celestial bodies disabled', () => {
      expect(isCelestialBodySupported('earth')).toBe(true);
      expect(isCelestialBodySupported('moon')).toBe(false);
      expect(isCelestialBodySupported('mars')).toBe(false);
      expect(isCelestialBodySupported('venus')).toBe(false);
      expect(isCelestialBodySupported('mercury')).toBe(false);
      expect(isCelestialBodySupported('jupiter')).toBe(false);
      expect(isCelestialBodySupported('saturn')).toBe(false);
      expect(isCelestialBodySupported('uranus')).toBe(false);
      expect(isCelestialBodySupported('neptune')).toBe(false);
      expect(isCelestialBodySupported('pluto')).toBe(false);
      expect(isCelestialBodySupported('titan')).toBe(false);
      expect(isCelestialBodySupported('europa')).toBe(false);
    });
  });

  describe('2. Deterministic Celestial Body Detection', () => {
    describe('Supported Earth Locations', () => {
      it('identifies standard Earth locations as earth', () => {
        expect(detectCelestialBody('New York, Earth')).toBe('earth');
        expect(detectCelestialBody('London, Earth')).toBe('earth');
        expect(detectCelestialBody('Grand Canyon, Earth')).toBe('earth');
        expect(detectCelestialBody('Paris, France')).toBe('earth');
        expect(detectCelestialBody('Tokyo, Japan')).toBe('earth');
      });

      it('identifies Earth locations with celestial-sounding names as earth', () => {
        expect(detectCelestialBody('Half Moon Bay, California, United States')).toBe('earth');
        expect(detectCelestialBody('Moon Township, Pennsylvania, United States')).toBe('earth');
        expect(detectCelestialBody('Craters of the Moon National Monument, Idaho, United States')).toBe('earth');
        expect(detectCelestialBody('Mars, Pennsylvania, United States')).toBe('earth');
        expect(detectCelestialBody('Mars Hill, North Carolina, United States')).toBe('earth');
        expect(detectCelestialBody('Luna County, New Mexico, USA')).toBe('earth');
        expect(detectCelestialBody('Europa Point, Gibraltar, UK')).toBe('earth');
      });
    });

    describe('Unsupported Non-Earth Locations & Features', () => {
      it('identifies Moon locations and lunar features', () => {
        expect(detectCelestialBody('Sea of Tranquility, Moon')).toBe('moon');
        expect(detectCelestialBody('Sea of Tranquility')).toBe('moon');
        expect(detectCelestialBody('Tranquility Base, Moon')).toBe('moon');
        expect(detectCelestialBody('Mare Tranquillitatis')).toBe('moon');
        expect(detectCelestialBody('Apollo 11 moon landing')).toBe('moon');
        expect(detectCelestialBody('Where did Apollo 11 land on the moon?')).toBe('moon');
      });

      it('identifies Mars locations and Martian features', () => {
        expect(detectCelestialBody('Olympus Mons, Mars')).toBe('mars');
        expect(detectCelestialBody('Olympus Mons')).toBe('mars');
        expect(detectCelestialBody('Valles Marineris, Mars')).toBe('mars');
        expect(detectCelestialBody('Curiosity Rover landing site on Mars')).toBe('mars');
        expect(detectCelestialBody('Gale Crater, Mars')).toBe('mars');
        expect(detectCelestialBody('Jezero Crater on Mars')).toBe('mars');
      });

      it('identifies Venus and Mercury locations', () => {
        expect(detectCelestialBody('Ishtar Terra, Venus')).toBe('venus');
        expect(detectCelestialBody('Aphrodite Terra on Venus')).toBe('venus');
        expect(detectCelestialBody('Caloris Basin on Mercury')).toBe('mercury');
      });

      it('identifies Outer Solar System moons', () => {
        expect(detectCelestialBody('Titan, Saturn')).toBe('titan');
        expect(detectCelestialBody('Kraken Mare on Titan')).toBe('titan');
        expect(detectCelestialBody('Europa, Jupiter')).toBe('europa');
        expect(detectCelestialBody('Ganymede, Jupiter')).toBe('ganymede');
        expect(detectCelestialBody('Callisto, Jupiter')).toBe('callisto');
      });

      it('detects celestial body from structured metadata object', () => {
        expect(detectCelestialBody({
          name: 'Sea of Tranquility',
          canonicalName: 'Mare Tranquillitatis',
          historicalRegion: 'Moon',
          modernLocation: 'Sea of Tranquility, Moon'
        })).toBe('moon');

        expect(detectCelestialBody({
          name: 'Olympus Mons',
          canonicalName: 'Olympus Mons',
          historicalRegion: 'Tharsis',
          modernLocation: 'Mars'
        })).toBe('mars');

        expect(detectCelestialBody({
          name: 'Plymouth',
          canonicalName: 'Plymouth',
          historicalRegion: 'Devon',
          modernLocation: 'Plymouth, England, UK'
        })).toBe('earth');
      });
    });
  });

  describe('3. validateEarthGeography validation helper', () => {
    it('returns valid for Earth locations', () => {
      const res = validateEarthGeography('New York, USA');
      expect(res.isValid).toBe(true);
      expect(res.celestialBody).toBe('earth');
      expect(res.error).toBeUndefined();
    });

    it('returns invalid and specific error for non-Earth locations', () => {
      const res = validateEarthGeography('Sea of Tranquility, Moon');
      expect(res.isValid).toBe(false);
      expect(res.celestialBody).toBe('moon');
      expect(res.error).toContain("Unsupported celestial body 'moon'");
    });
  });

  describe('4. Search Pipeline Intent Independence', () => {
    it('rejects unsupported celestial bodies across all intents (POINT, HISTORICAL_EVENT, EXPLORATORY, route)', async () => {
      // POINT intent
      const pointResult = await runSearchPipeline({
        rawQuery: "Where is the Sea of Tranquility on the Moon?",
        intent: "DIRECT" as any,
        entity: "Sea of Tranquility"
      });
      expect(pointResult.isValid).toBe(false);
      expect(pointResult.error).toBe("UNSUPPORTED_CELESTIAL_BODY");

      // HISTORICAL_EVENT intent
      const historicalResult = await runSearchPipeline({
        rawQuery: "Where did the Apollo 11 moon landing take place?",
        intent: "HISTORICAL_EVENT" as any,
        entity: "Apollo 11 moon landing"
      });
      expect(historicalResult.isValid).toBe(false);
      expect(historicalResult.error).toBe("UNSUPPORTED_CELESTIAL_BODY");

      // EXPLORATORY intent
      const exploratoryResult = await runSearchPipeline({
        rawQuery: "Explore Olympus Mons on Mars",
        intent: "EXPLORATORY" as any,
        entity: "Olympus Mons"
      });
      expect(exploratoryResult.isValid).toBe(false);
      expect(exploratoryResult.error).toBe("UNSUPPORTED_CELESTIAL_BODY");

      // Route intent
      const routeResult = await runSearchPipeline({
        rawQuery: "Route of Apollo 11 lunar excursion on the Moon",
        intent: "route" as any,
        entity: "Apollo 11"
      });
      expect(routeResult.isValid).toBe(false);
      expect(routeResult.error).toBe("UNSUPPORTED_CELESTIAL_BODY");
    });
  });

  describe('5. Route Pipeline Rejection (No Earth Repair)', () => {
    it('filters out Moon waypoints and rejects route without repairing to Earth', async () => {
      const mockRawGenerate = async () => ({
        title: "Apollo 11 Lunar Landing",
        routeType: "single_location",
        waypoints: [
          {
            name: "Sea of Tranquility",
            canonicalName: "Mare Tranquillitatis",
            historicalRegion: "Moon",
            modernLocation: "Sea of Tranquility, Moon",
            lat: 0.9524,
            lng: -1.8746,
            role: "primary",
            sequence: 1,
            description: "Landing site of Apollo 11 Lunar Module Eagle on July 20, 1969."
          }
        ]
      });

      const route = await runRoutePipeline(
        "Where did the Apollo 11 moon landing take place?",
        false,
        mockRawGenerate,
        "HISTORICAL_EVENT"
      );

      // Waypoint must be completely rejected (not transformed to an Earth location)
      expect(route.waypoints).toHaveLength(0);
    });

    it('preserves valid Earth waypoints in a multi-waypoint route', async () => {
      const mockRawGenerate = async () => ({
        title: "Historical Expedition",
        routeType: "regional_event",
        waypoints: [
          {
            name: "Cape Canaveral, Florida",
            canonicalName: "Cape Canaveral",
            historicalRegion: "Florida",
            modernLocation: "Florida, USA",
            lat: 28.3922,
            lng: -80.6077,
            role: "primary",
            sequence: 1,
            description: "Launch site on Earth."
          },
          {
            name: "Pacific Splashdown Site",
            canonicalName: "Pacific Ocean",
            historicalRegion: "Pacific",
            modernLocation: "Pacific Ocean",
            lat: 13.3167,
            lng: -169.15,
            role: "related",
            sequence: 2,
            description: "Recovery site in the Pacific Ocean."
          }
        ]
      });

      const route = await runRoutePipeline(
        "Apollo 11 Earth Operations",
        false,
        mockRawGenerate,
        "HISTORICAL_EVENT"
      );

      expect(route.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(route.waypoints[0].name).toContain("Cape Canaveral");
    });
  });

  describe('6. Suggested Search Filtering', () => {
    it('filters out non-Earth celestial suggestions from being presented as geographic searches', () => {
      const candidateSuggestions = [
        "Where did the moon landing take place?",
        "Where is the Apollo 11 landing site?",
        "Where is the Sea of Tranquility?",
        "Find Olympus Mons on Mars...",
        "Where is Gale Crater on Mars?",
        "Where is Kraken Mare on Titan?",
        "Where is Europa, Jupiter?",
        "Where did the Battle of Hastings take place?",
        "Where is the Eiffel Tower?",
        "Where was the Titanic found?",
        "Find Tokyo..."
      ];

      const validSuggestions = candidateSuggestions.filter(s => {
        const body = detectCelestialBody({ query: s });
        return isCelestialBodySupported(body);
      });

      expect(validSuggestions).toEqual([
        "Where did the Battle of Hastings take place?",
        "Where is the Eiffel Tower?",
        "Where was the Titanic found?",
        "Find Tokyo..."
      ]);
    });
  });
});
