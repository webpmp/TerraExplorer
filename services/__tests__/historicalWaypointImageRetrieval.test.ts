import { describe, it, expect } from 'vitest';
import {
  isHistoricalWaypointEntity,
  extractHistoricalImageContext,
  buildHistoricalImageQueries,
  classifyHistoricalImageCategory,
  isModernLocationPhotography,
  validateImageCandidate
} from '../imageService';

describe('Historical Waypoint Image Retrieval & Ranking System', () => {
  // Test Scenario 1: Lewis and Clark Expedition - St. Charles, Missouri (1804)
  const lewisAndClarkStCharles = {
    name: 'St. Charles, Missouri',
    canonicalName: 'St. Charles',
    routeTitle: 'Lewis and Clark Expedition',
    significance: 'Final preparations before westward departure',
    description: 'The expedition made final preparations, recruited French-Canadian boatmen, balanced cargo, and waited for Captain Lewis.',
    historicalPeriod: 'May 16-21, 1804',
    entities: ['Meriwether Lewis', 'William Clark', 'Corps of Discovery'],
    state: 'Missouri',
    country: 'United States',
    entityType: 'historical_waypoint'
  };

  // Test Scenario 2: Historical Battle Waypoint - Battle of Waterloo (1815)
  const waterlooBattlefield = {
    name: 'Waterloo Battlefield, Belgium',
    canonicalName: 'Waterloo',
    routeTitle: 'Waterloo Campaign',
    significance: 'Decisive defeat of Napoleon Bonaparte',
    description: 'The Anglo-allied army under Wellington and the Prussian army under Blücher defeated Napoleon.',
    historicalPeriod: 'June 18, 1815',
    entities: ['Napoleon Bonaparte', 'Duke of Wellington', 'Gebhard Leberecht von Blücher'],
    country: 'Belgium',
    entityType: 'battlefield'
  };

  // Test Scenario 3: Historic Voyage / Maritime Expedition - HMS Beagle in Galápagos (1835)
  const beagleGalapagos = {
    name: 'San Cristóbal Island, Galápagos',
    canonicalName: 'San Cristóbal',
    routeTitle: 'Voyage of the HMS Beagle',
    significance: 'Charles Darwin observations of island fauna',
    description: 'HMS Beagle arrived in the Galápagos Islands where Charles Darwin collected geological and biological specimens.',
    historicalPeriod: 'September-October 1835',
    entities: ['Charles Darwin', 'Robert FitzRoy', 'HMS Beagle'],
    country: 'Ecuador',
    entityType: 'historical_waypoint'
  };

  // Test Scenario 4: Historic Migration Route - Oregon Trail at Independence Rock (1840s-1850s)
  const oregonTrailIndependenceRock = {
    name: 'Independence Rock, Wyoming',
    canonicalName: 'Independence Rock',
    routeTitle: 'Oregon Trail Migration',
    significance: 'Key landmark for westward emigrant wagon trains',
    description: 'Emigrants on the Oregon Trail carved their names into the granite rock aiming to reach it by July 4.',
    historicalPeriod: '1840s-1860s',
    entities: ['Oregon Trail Emigrants', 'Wagon Trains'],
    state: 'Wyoming',
    country: 'United States',
    entityType: 'historical_waypoint'
  };

  describe('1. Historical Waypoint Entity Detection', () => {
    it('accurately identifies historical waypoints, expeditions, and battlefields', () => {
      expect(isHistoricalWaypointEntity(lewisAndClarkStCharles)).toBe(true);
      expect(isHistoricalWaypointEntity(waterlooBattlefield)).toBe(true);
      expect(isHistoricalWaypointEntity(beagleGalapagos)).toBe(true);
      expect(isHistoricalWaypointEntity(oregonTrailIndependenceRock)).toBe(true);
    });

    it('does not treat standard modern cities or modern landmarks as historical waypoints', () => {
      expect(isHistoricalWaypointEntity({ name: 'Chicago', entityType: 'city' })).toBe(false);
      expect(isHistoricalWaypointEntity({ name: 'Eiffel Tower', entityType: 'landmark' })).toBe(false);
    });
  });

  describe('2. Structured Historical Context Extraction', () => {
    it('extracts complete historical context for Lewis and Clark St. Charles waypoint', () => {
      const context = extractHistoricalImageContext(lewisAndClarkStCharles);
      expect(context.exploration).toBe('Lewis and Clark Expedition');
      expect(context.year).toBe('1804');
      expect(context.cleanLocationName).toBe('St. Charles');
      expect(context.region).toBe('Missouri');
      expect(context.people).toContain('Meriwether Lewis');
      expect(context.people).toContain('William Clark');
      expect(context.activities).toContain('preparations');
      expect(context.activities).toContain('boatmen');
    });
  });

  describe('3. Dynamic Query Builder', () => {
    it('generates multi-faceted, ranked historical search queries for Lewis and Clark', () => {
      const context = extractHistoricalImageContext(lewisAndClarkStCharles);
      const queries = buildHistoricalImageQueries(context);

      expect(queries.some(q => q.includes('Lewis and Clark') && q.includes('1804'))).toBe(true);
      expect(queries.some(q => q.includes('Lewis and Clark') && q.includes('St. Charles'))).toBe(true);
      expect(queries.some(q => q.includes('Lewis and Clark') && q.includes('map'))).toBe(true);
      expect(queries.some(q => q.includes('Lewis and Clark') && q.includes('keelboat'))).toBe(true);
    });
  });

  describe('4. Historical Image Category Classification & Modern Photo Detection', () => {
    const context = extractHistoricalImageContext(lewisAndClarkStCharles);

    it('detects modern municipal/civic building photography', () => {
      expect(isModernLocationPhotography('St. Charles County Courthouse', 'Modern government building.')).toBe(true);
      expect(isModernLocationPhotography('Historic Saint Charles Main Street', 'Looking east on Main Street downtown.')).toBe(true);
    });

    it('classifies candidates into historical hierarchy', () => {
      const eventCandidate = {
        title: 'Corps of Discovery departure at St. Charles',
        description: 'Illustration depicting the Lewis and Clark Expedition departure preparations in May 1804.'
      };
      expect(classifyHistoricalImageCategory(eventCandidate, context)).toBe('EXPEDITION_EVENT');

      const mapCandidate = {
        title: 'Map of the Lewis and Clark Track Across the Western Portion of North America',
        description: 'Historical 1814 map showing the expedition route along the Missouri River.'
      };
      expect(classifyHistoricalImageCategory(mapCandidate, context)).toBe('HISTORICAL_MAP');

      const artifactCandidate = {
        title: 'Lewis and Clark Expedition Keelboat',
        description: 'Reconstruction of the 55-foot keelboat used on the Missouri River in 1804.'
      };
      expect(classifyHistoricalImageCategory(artifactCandidate, context)).toBe('HISTORICAL_ARTIFACT');

      const personCandidate = {
        title: 'Meriwether Lewis Portrait by Charles Willson Peale',
        description: 'Historical portrait of Captain Meriwether Lewis.'
      };
      expect(classifyHistoricalImageCategory(personCandidate, context)).toBe('HISTORICAL_PERSON');

      const modernCandidate = {
        title: 'St. Charles County Courthouse',
        description: 'The modern county courthouse located in downtown St. Charles, Missouri.'
      };
      expect(classifyHistoricalImageCategory(modernCandidate, context)).toBe('MODERN_LOCATION');
    });
  });

  describe('5. Validation & Scoring for St. Charles, Missouri (Lewis and Clark)', () => {
    it('HEAVILY prioritizes historical expedition imagery and illustrations over modern courthouse photos', () => {
      // 1. Expedition artwork
      const illustrationRes = validateImageCandidate({
        url: 'https://upload.wikimedia.org/lewis_clark_corps_departure.jpg',
        title: 'Corps of Discovery at St. Charles 1804',
        description: 'Historical painting depicting Lewis and Clark Expedition final preparations in St. Charles, Missouri.'
      }, lewisAndClarkStCharles);

      expect(illustrationRes.decision).toBe('ACCEPT');
      expect(illustrationRes.score).toBeGreaterThanOrEqual(80);

      // 2. Historical Map
      const mapRes = validateImageCandidate({
        url: 'https://upload.wikimedia.org/lewis_clark_1804_map.jpg',
        title: 'Lewis and Clark Expedition Missouri River Map',
        description: '1804 route map showing St. Charles on the Missouri River.'
      }, lewisAndClarkStCharles);

      expect(mapRes.decision).toBe('ACCEPT');
      expect(mapRes.score).toBeGreaterThanOrEqual(75);

      // 3. Modern St. Charles County Courthouse (MUST be suppressed / penalized)
      const modernCourthouseRes = validateImageCandidate({
        url: 'https://upload.wikimedia.org/st_charles_courthouse.jpg',
        title: 'St. Charles County Courthouse',
        description: 'County courthouse in downtown St. Charles, Missouri.'
      }, lewisAndClarkStCharles);

      expect(modernCourthouseRes.score).toBeLessThan(45);
      expect(modernCourthouseRes.decision).toBe('REJECT');
      expect(illustrationRes.score).toBeGreaterThan(modernCourthouseRes.score + 40);
    });
  });

  describe('6. Generalized Historical Scenarios', () => {
    it('Waterloo: prefers historical battle painting and campaign maps over modern town buildings', () => {
      const battlePainting = {
        url: 'https://upload.wikimedia.org/waterloo_battle.jpg',
        title: 'Battle of Waterloo 1815 Painting',
        description: 'Historical painting of the Battle of Waterloo on June 18, 1815.'
      };
      const modernWaterloo = {
        url: 'https://upload.wikimedia.org/waterloo_modern_street.jpg',
        title: 'Waterloo town center',
        description: 'Modern shopping district in Waterloo, Belgium.'
      };

      const pRes = validateImageCandidate(battlePainting, waterlooBattlefield);
      const mRes = validateImageCandidate(modernWaterloo, waterlooBattlefield);

      expect(pRes.decision).toBe('ACCEPT');
      expect(pRes.score).toBeGreaterThan(mRes.score + 40);
    });

    it('HMS Beagle: prefers voyage artwork, Darwin portraits, and island charts', () => {
      const beagleChart = {
        url: 'https://upload.wikimedia.org/beagle_galapagos_chart.jpg',
        title: 'HMS Beagle Chart of the Galapagos Islands 1835',
        description: 'Nautical chart compiled during the voyage of HMS Beagle.'
      };
      const res = validateImageCandidate(beagleChart, beagleGalapagos);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(75);
    });

    it('Oregon Trail: prefers pioneer wagon train illustrations and historic trail maps over modern highway photos', () => {
      const wagonTrain = {
        url: 'https://upload.wikimedia.org/oregon_trail_wagon_train.jpg',
        title: 'Oregon Trail Wagon Train at Independence Rock',
        description: 'Historical engraving showing emigrant wagon train in the 1840s.'
      };
      const res = validateImageCandidate(wagonTrain, oregonTrailIndependenceRock);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(80);
    });
  });
});
