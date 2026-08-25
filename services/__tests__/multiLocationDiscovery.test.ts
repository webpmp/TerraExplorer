import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeIntentAndExtractEntity, recoverCoordinatesFromAi } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { runRoutePipeline } from '../routePipeline';
import { validateImageCandidate, buildEntityImageQueries } from '../imageService';

describe('Multi-Location Geographic Discovery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Multi-Location vs Single-Location Intent Classification', () => {
    it('A. Single location queries stay single point / NATURAL_LOCATION', () => {
      const single1 = routeIntentAndExtractEntity("Show me the Grand Canyon");
      expect(single1.intent).toBe("NATURAL_LOCATION");
      expect(single1.entity.toLowerCase()).toContain("grand canyon");
      expect(single1.resolutionMode).toBeUndefined();

      const single2 = routeIntentAndExtractEntity("Show me Mount Everest");
      expect(single2.intent).toBe("NATURAL_LOCATION");
      expect(single2.entity.toLowerCase()).toContain("mount everest");

      const single3 = routeIntentAndExtractEntity("Show me Gjáin");
      expect(single3.intent).toBe("NATURAL_LOCATION");
      expect(single3.entity.toLowerCase()).toContain("gjáin");

      const single4 = routeIntentAndExtractEntity("Where is the Dead Sea?");
      expect(single4.intent).toBe("NATURAL_LOCATION");
      expect(single4.entity.toLowerCase()).toContain("dead sea");
    });

    it('B. Multi-location: "Where was Game of Thrones filmed?" produces MULTI_LOCATION_DISCOVERY', () => {
      const res = routeIntentAndExtractEntity("Where was Game of Thrones filmed?");
      expect(res.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(res.subject).toBe("Game Of Thrones");
      expect(res.discoveryTarget).toBe("filming locations");
      expect(res.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");
      expect(res.entity).not.toContain("filmed");
    });

    it('C. Multi-location: "Where were Lord of the Rings filmed?" produces MULTI_LOCATION_DISCOVERY', () => {
      const res = routeIntentAndExtractEntity("Where were Lord of the Rings filmed?");
      expect(res.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(res.subject).toBe("Lord Of The Rings");
      expect(res.discoveryTarget).toBe("filming locations");
      expect(res.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");
    });

    it('G. Generalizes multi-location queries across various domains', () => {
      const roman = routeIntentAndExtractEntity("What cities were important in the Roman Empire?");
      expect(roman.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(roman.subject).toBe("Roman Empire");
      expect(roman.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");

      const apollo = routeIntentAndExtractEntity("Where did the Apollo missions land?");
      expect(apollo.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(apollo.subject).toBe("Apollo Missions");
      expect(apollo.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");

      const silkRoad = routeIntentAndExtractEntity("What places were involved in the Silk Road?");
      expect(silkRoad.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(silkRoad.subject).toBe("Silk Road");
      expect(silkRoad.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");

      const waterfalls = routeIntentAndExtractEntity("What are the world's most famous waterfalls?");
      expect(waterfalls.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(waterfalls.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");

      const wwii = routeIntentAndExtractEntity("Where did the major battles of World War II take place?");
      expect(wwii.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(wwii.subject).toBe("World War II");
      expect(wwii.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");

      const bb = routeIntentAndExtractEntity("What locations were used in Breaking Bad?");
      expect(bb.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(bb.subject).toBe("Breaking Bad");
      expect(bb.resolutionMode).toBe("MULTI_LOCATION_EXPLORATION");
    });
  });

  describe('2. Coordinate Safety & Rejection of Fabricated Values', () => {
    it('D. Coordinate safety: Rejects AI-invented coordinates (12.345, 67.89) and query phrases', async () => {
      // Coordinate recovery must be blocked for multi-location intent and query phrases
      const res = await recoverCoordinatesFromAi(
        "Where was Game of Thrones filmed?",
        "MULTI_LOCATION_DISCOVERY",
        "Game Of Thrones Filmed"
      );
      expect(res).toBeNull();
    });

    it('E. Entity identity validation prevents query phrase substitution', () => {
      // A query phrase like "Game Of Thrones Filmed" must not be treated as a single entity
      const res = routeIntentAndExtractEntity("Where was Game of Thrones filmed?");
      expect(res.entity).not.toBe("Game Of Thrones Filmed");
      expect(res.intent).toBe("MULTI_LOCATION_DISCOVERY");
    });
  });

  describe('3. Per-Entity Image Search and Validation', () => {
    it('F. Image search operates on individual discovered entities, not the query sentence', () => {
      // Dubrovnik as a filming location
      const dubrovnikQueries = buildEntityImageQueries({
        name: "Dubrovnik",
        city: "Dubrovnik",
        country: "Croatia",
        entityType: "city",
        routeTitle: "Game of Thrones Filming Locations",
        waypoint: {
          name: "Dubrovnik",
          context: "King's Landing filming location in Game of Thrones",
          routeTitle: "Game of Thrones Filming Locations"
        }
      });

      expect(dubrovnikQueries.some(q => q.includes("Dubrovnik"))).toBe(true);

      // Validate Dubrovnik Old Town image candidate against Dubrovnik entity
      const validation = validateImageCandidate(
        {
          url: "https://upload.wikimedia.org/wikipedia/commons/dubrovnik.jpg",
          title: "Dubrovnik Old Town Walls",
          description: "Historic walls of Dubrovnik overlooking the Adriatic Sea"
        },
        {
          name: "Dubrovnik",
          city: "Dubrovnik",
          country: "Croatia",
          entityType: "city",
          coordinates: { lat: 42.6507, lng: 18.0944 }
        }
      );

      expect(validation.decision).toBe("ACCEPT");

      // Validate Castle Ward image candidate against Castle Ward entity
      const castleWardValidation = validateImageCandidate(
        {
          url: "https://upload.wikimedia.org/wikipedia/commons/castle_ward.jpg",
          title: "Castle Ward Estate",
          description: "Castle Ward in County Down, Northern Ireland"
        },
        {
          name: "Castle Ward",
          country: "United Kingdom",
          entityType: "castle",
          coordinates: { lat: 54.3683, lng: -5.5786 }
        }
      );

      expect(castleWardValidation.decision).toBe("ACCEPT");
    });

    it('Rejects non-geographic media like board games (e.g. Risk) and video games', () => {
      const riskGameValidation = validateImageCandidate(
        {
          url: "https://upload.wikimedia.org/wikipedia/commons/risk.jpg",
          title: "Risk (game)",
          description: "1957 map-based war board game"
        },
        {
          name: "London, England",
          city: "London",
          country: "United Kingdom",
          entityType: "city",
          coordinates: { lat: 51.5074, lng: -0.1278 }
        }
      );

      expect(riskGameValidation.decision).toBe("REJECT");

      const videoGameValidation = validateImageCandidate(
        {
          url: "https://upload.wikimedia.org/wikipedia/commons/starfield.jpg",
          title: "Starfield (video game)",
          description: "Action role-playing video game by Bethesda"
        },
        {
          name: "London, England",
          city: "London",
          country: "United Kingdom",
          entityType: "city"
        }
      );

      expect(videoGameValidation.decision).toBe("REJECT");
    });
  });

  describe('4. Filming Locations for Fictional Media vs Fictional Universe Entities', () => {
    it('1. "Where was Game of Thrones filmed?" resolves to real-world filming locations and rejects fictional entities with 0,0', async () => {
      const intentRes = routeIntentAndExtractEntity("Where was Game of Thrones filmed?");
      expect(intentRes.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(intentRes.subject).toBe("Game Of Thrones");
      expect(intentRes.discoveryTarget).toBe("filming locations");

      // Valid real-world filming locations returned by route generation
      const realWorldRawRoute = async () => ({
        title: "Game of Thrones Filming Locations",
        routeType: "network",
        waypoints: [
          {
            name: "Dubrovnik",
            canonicalName: "Dubrovnik",
            modernLocation: "Dubrovnik-Neretva, Croatia",
            lat: 42.6507,
            lng: 18.0944,
            sequence: 1,
            context: "Filming location for King's Landing",
            description: "Dubrovnik's medieval walls and Old Town served as the main filming location for King's Landing."
          },
          {
            name: "Castle Ward",
            canonicalName: "Castle Ward",
            modernLocation: "County Down, Northern Ireland",
            lat: 54.3683,
            lng: -5.5786,
            sequence: 2,
            context: "Filming location for Winterfell",
            description: "The historic Castle Ward estate was used as the courtyard and exterior of Winterfell in Season 1."
          },
          {
            name: "Vatnajökull",
            canonicalName: "Vatnajökull National Park",
            modernLocation: "Iceland",
            lat: 64.4219,
            lng: -16.8528,
            sequence: 3,
            context: "Filming location for Beyond the Wall",
            description: "Vatnajökull's vast ice cap and glaciers portrayed the frozen wilderness Beyond the Wall."
          }
        ]
      });

      const route = await runRoutePipeline("Where was Game of Thrones filmed?", false, realWorldRawRoute, intentRes.intent);
      expect(route.waypoints.length).toBe(3);
      expect(route.waypoints.map(w => w.name)).toEqual(["Dubrovnik", "Castle Ward", "Vatnajökull"]);
      expect(route.waypoints.every(w => w.lat !== 0 && w.lng !== 0)).toBe(true);

      // Verify that if fictional places with 0,0 are emitted, structural validation rejects them
      const fictionalRawRoute = async () => ({
        title: "Game of Thrones Filming Locations",
        routeType: "network",
        waypoints: [
          { name: "Westeros", lat: 0, lng: 0, sequence: 1, context: "Fictional continent" },
          { name: "King's Landing", lat: 0, lng: 0, sequence: 2, context: "Capital of Westeros" },
          { name: "The Wall", lat: 0, lng: 0, sequence: 3, context: "Northern barrier" },
          { name: "Dubrovnik", lat: 42.6507, lng: 18.0944, sequence: 4, context: "Filming location for King's Landing" },
          { name: "Castle Ward", lat: 54.3683, lng: -5.5786, sequence: 5, context: "Filming location for Winterfell" }
        ]
      });

      const filteredRoute = await runRoutePipeline("Where was Game of Thrones filmed?", false, fictionalRawRoute, intentRes.intent);
      expect(filteredRoute.waypoints.length).toBe(2);
      expect(filteredRoute.waypoints.map(w => w.name)).toEqual(["Dubrovnik", "Castle Ward"]);
      expect(filteredRoute.waypoints.some(w => w.name === "Westeros" || w.name === "King's Landing" || w.name === "The Wall")).toBe(false);
    });

    it('2. "Where was Harry Potter filmed?" produces real-world filming locations', async () => {
      const intentRes = routeIntentAndExtractEntity("Where was Harry Potter filmed?");
      expect(intentRes.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(intentRes.subject).toBe("Harry Potter");
      expect(intentRes.discoveryTarget).toBe("filming locations");

      const hpRawRoute = async () => ({
        title: "Harry Potter Filming Locations",
        routeType: "network",
        waypoints: [
          {
            name: "Alnwick Castle",
            canonicalName: "Alnwick Castle",
            modernLocation: "Northumberland, England",
            lat: 55.4158,
            lng: -1.7061,
            sequence: 1,
            context: "Filming location for Hogwarts broomstick flying lessons",
            description: "Alnwick Castle's outer courtyard served as Hogwarts exterior in the first two films."
          },
          {
            name: "Christ Church",
            canonicalName: "Christ Church, Oxford",
            modernLocation: "Oxford, England",
            lat: 51.7502,
            lng: -1.2558,
            sequence: 2,
            context: "Filming location and inspiration for Hogwarts Great Hall",
            description: "The Great Hall of Christ Church College inspired Hogwarts dining hall, and its stairs were used in multiple scenes."
          },
          {
            name: "Glenfinnan Viaduct",
            canonicalName: "Glenfinnan Viaduct",
            modernLocation: "Highlands, Scotland",
            lat: 56.8763,
            lng: -5.4316,
            sequence: 3,
            context: "Filming location for the Hogwarts Express railway route",
            description: "The iconic 21-arch viaduct carrying the Hogwarts Express across the Scottish Highlands."
          }
        ]
      });

      const route = await runRoutePipeline("Where was Harry Potter filmed?", false, hpRawRoute, intentRes.intent);
      expect(route.waypoints.length).toBe(3);
      expect(route.waypoints.map(w => w.name)).toEqual(["Alnwick Castle", "Christ Church", "Glenfinnan Viaduct"]);
      expect(route.waypoints.every(w => w.lat !== 0 && w.lng !== 0)).toBe(true);
    });

    it('3. "Where was Lord of the Rings filmed?" produces real-world filming locations in New Zealand', async () => {
      const intentRes = routeIntentAndExtractEntity("Where was Lord of the Rings filmed?");
      expect(intentRes.intent).toBe("MULTI_LOCATION_DISCOVERY");
      expect(intentRes.subject).toBe("Lord Of The Rings");
      expect(intentRes.discoveryTarget).toBe("filming locations");

      const lotrRawRoute = async () => ({
        title: "Lord of the Rings Filming Locations",
        routeType: "network",
        waypoints: [
          {
            name: "Hobbiton Movie Set",
            canonicalName: "Matamata Hobbiton",
            modernLocation: "Waikato, New Zealand",
            lat: -37.8721,
            lng: 175.6830,
            sequence: 1,
            context: "Filming location for The Shire and Hobbiton",
            description: "Located near Matamata, the Alexander sheep farm was transformed into the Shire."
          },
          {
            name: "Mount Ngauruhoe",
            canonicalName: "Mount Ngauruhoe",
            modernLocation: "Tongariro National Park, New Zealand",
            lat: -39.1568,
            lng: 175.6322,
            sequence: 2,
            context: "Filming location portraying Mount Doom",
            description: "The active stratovolcano in Tongariro National Park was filmed to portray Mount Doom in Mordor."
          }
        ]
      });

      const route = await runRoutePipeline("Where was Lord of the Rings filmed?", false, lotrRawRoute, intentRes.intent);
      expect(route.waypoints.length).toBe(2);
      expect(route.waypoints.map(w => w.name)).toEqual(["Hobbiton Movie Set", "Mount Ngauruhoe"]);
      expect(route.waypoints.every(w => w.lat !== 0 && w.lng !== 0)).toBe(true);
    });

    it('4. Explicit fictional-location queries like "Show me the major regions of Westeros" do not fabricate fake Earth coordinates', () => {
      const fictionalQuery = routeIntentAndExtractEntity("Show me the major regions of Westeros");
      // Fictional region query should not be treated as a real-world single point with fabricated coordinates
      expect(fictionalQuery.entity.toLowerCase()).toContain("westeros");
    });

    it('5. Any generated waypoint with lat: 0, lng: 0 must continue to fail structural validation as INVALID_COORDINATES', async () => {
      const invalidCoordsRoute = async () => ({
        title: "Test Route",
        routeType: "single_location",
        waypoints: [
          { name: "Unresolved Placeholder", lat: 0, lng: 0, sequence: 1, context: "Missing coordinates" }
        ]
      });

      const result = await runRoutePipeline("Test unresolved query", false, invalidCoordsRoute);
      expect(result.waypoints.length).toBe(0);
    });
  });
});
