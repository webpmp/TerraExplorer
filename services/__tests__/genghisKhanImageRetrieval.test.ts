import { describe, it, expect } from 'vitest';
import {
  isHistoricalWaypointEntity,
  extractHistoricalImageContext,
  buildHistoricalImageQueries,
  validateImageCandidate,
  resolveImageIntent,
  classifyHistoricalImageCategory
} from '../imageService';
import { DEFAULT_GENGHIS_ROUTE } from '../../App';

describe('Genghis Khan Route Image Retrieval & Validation System', () => {
  const wp1 = DEFAULT_GENGHIS_ROUTE.waypoints![0]; // Burkhan Khaldun (Mongolia)
  const wp2 = DEFAULT_GENGHIS_ROUTE.waypoints![1]; // Yinchuan (Western Xia)
  const wp3 = DEFAULT_GENGHIS_ROUTE.waypoints![2]; // Zhongdu (Beijing)

  // Full LocationInfo payloads as created by App.tsx during waypoint selection
  const locationInfo1 = {
    id: wp1.id,
    name: wp1.name, // "Burkhan Khaldun (Mongolia)"
    canonicalName: wp1.canonicalName, // "Burkhan Khaldun"
    coordinates: { lat: wp1.lat, lng: wp1.lng },
    waypoint: wp1,
    country: 'Mongolia',
    state: 'Khentii',
    entityType: 'historical_waypoint',
    description: wp1.description,
    historicalContext: wp1.context,
    routeTitle: wp1.routeTitle,
    routeGroupId: wp1.routeGroupId,
    routeContext: { title: wp1.routeGroupName, text: wp1.context }
  };

  const locationInfo2 = {
    id: wp2.id,
    name: wp2.name, // "Yinchuan (Western Xia)"
    canonicalName: wp2.canonicalName, // "Yinchuan"
    coordinates: { lat: wp2.lat, lng: wp2.lng },
    waypoint: wp2,
    country: 'China',
    state: 'Ningxia',
    city: 'Yinchuan',
    entityType: 'historical_waypoint',
    description: wp2.description,
    historicalContext: wp2.context,
    routeTitle: wp2.routeTitle,
    routeGroupId: wp2.routeGroupId,
    routeContext: { title: wp2.routeGroupName, text: wp2.context }
  };

  const locationInfo3 = {
    id: wp3.id,
    name: wp3.name, // "Zhongdu (Beijing)"
    canonicalName: wp3.canonicalName, // "Zhongdu"
    coordinates: { lat: wp3.lat, lng: wp3.lng },
    waypoint: wp3,
    country: 'China',
    city: 'Beijing',
    entityType: 'historical_waypoint',
    description: wp3.description,
    historicalContext: wp3.context,
    routeTitle: wp3.routeTitle,
    routeGroupId: wp3.routeGroupId,
    routeContext: { title: wp3.routeGroupName, text: wp3.context }
  };

  describe('1. Historical Waypoint Entity Detection', () => {
    it('identifies Genghis Khan waypoints as historical waypoint entities', () => {
      expect(isHistoricalWaypointEntity(wp1)).toBe(true);
      expect(isHistoricalWaypointEntity(wp2)).toBe(true);
      expect(isHistoricalWaypointEntity(wp3)).toBe(true);
      expect(isHistoricalWaypointEntity(locationInfo1)).toBe(true);
      expect(isHistoricalWaypointEntity(locationInfo2)).toBe(true);
      expect(isHistoricalWaypointEntity(locationInfo3)).toBe(true);
    });

    it('routes them to HISTORICAL_WAYPOINT image validation policy', () => {
      expect(resolveImageIntent(locationInfo1).policy).toBe('HISTORICAL_WAYPOINT');
      expect(resolveImageIntent(locationInfo2).policy).toBe('HISTORICAL_WAYPOINT');
      expect(resolveImageIntent(locationInfo3).policy).toBe('HISTORICAL_WAYPOINT');
    });
  });

  describe('2. Historical Image Context Extraction & Clean Queries', () => {
    it('strips parenthetical qualifiers from cleanLocationName while preserving historical context', () => {
      const ctx1 = extractHistoricalImageContext(locationInfo1);
      expect(ctx1.cleanLocationName).toBe('Burkhan Khaldun');
      expect(ctx1.year).toBe('1206');
      expect(ctx1.exploration).toBe('Campaigns of Genghis Khan');

      const ctx2 = extractHistoricalImageContext(locationInfo2);
      expect(ctx2.cleanLocationName).toBe('Yinchuan');
      expect(ctx2.year).toBe('1209');

      const ctx3 = extractHistoricalImageContext(locationInfo3);
      expect(ctx3.cleanLocationName).toBe('Zhongdu');
      expect(ctx3.year).toBe('1214');
    });

    it('generates clean search queries without raw parenthesis tokens', () => {
      const ctx1 = extractHistoricalImageContext(locationInfo1);
      const queries1 = buildHistoricalImageQueries(ctx1);
      expect(queries1.some(q => q.startsWith('Burkhan Khaldun'))).toBe(true);
      expect(queries1.some(q => q.includes('(Mongolia)'))).toBe(false);

      const ctx2 = extractHistoricalImageContext(locationInfo2);
      const queries2 = buildHistoricalImageQueries(ctx2);
      expect(queries2.some(q => q.startsWith('Yinchuan'))).toBe(true);
      expect(queries2.some(q => q.includes('(Western Xia)'))).toBe(false);

      const ctx3 = extractHistoricalImageContext(locationInfo3);
      const queries3 = buildHistoricalImageQueries(ctx3);
      expect(queries3.some(q => q.startsWith('Zhongdu'))).toBe(true);
      expect(queries3.some(q => q.includes('(Beijing)'))).toBe(false);
    });
  });

  describe('3. Waypoint 1: Burkhan Khaldun (Mongolia) Validation', () => {
    it('accepts legitimate Burkhan Khaldun and Khentii sacred mountain imagery', () => {
      const sacredMountain = {
        url: 'https://upload.wikimedia.org/burkhan_khaldun_mountain.jpg',
        title: 'Burkhan Khaldun',
        description: 'Sacred mountain in the Khentii Mountains of northeastern Mongolia, birthplace and refuge of Genghis Khan.'
      };
      const res = validateImageCandidate(sacredMountain, locationInfo1);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('accepts Great Burkhan Khaldun landscape candidates', () => {
      const landscape = {
        url: 'https://upload.wikimedia.org/great_burkhan_khaldun.jpg',
        title: 'Mount Burkhan Khaldun Sacred Landscape',
        description: 'The surrounding sacred landscape of Burkhan Khaldun in Khentii, Mongolia.'
      };
      const res = validateImageCandidate(landscape, locationInfo1);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('rejects unrelated mountains and modern municipal buildings', () => {
      const unrelatedMountain = {
        url: 'https://upload.wikimedia.org/mount_fuji.jpg',
        title: 'Mount Fuji',
        description: 'Volcano in Japan.'
      };
      const res1 = validateImageCandidate(unrelatedMountain, locationInfo1);
      expect(res1.decision).toBe('REJECT');

      const ulaanbaatarCityHall = {
        url: 'https://upload.wikimedia.org/ulaanbaatar_city_hall.jpg',
        title: 'Ulaanbaatar City Hall',
        description: 'Modern municipal government building in Ulaanbaatar, Mongolia.'
      };
      const res2 = validateImageCandidate(ulaanbaatarCityHall, locationInfo1);
      expect(res2.decision).toBe('REJECT');
    });
  });

  describe('4. Waypoint 2: Yinchuan (Western Xia) Validation', () => {
    it('accepts Western Xia imperial tombs and Yinchuan historic sites', () => {
      const westernXiaTombs = {
        url: 'https://upload.wikimedia.org/western_xia_tombs.jpg',
        title: 'Western Xia tombs',
        description: 'The Western Xia imperial tombs near Yinchuan, capital of the Western Xia dynasty.'
      };
      const res = validateImageCandidate(westernXiaTombs, locationInfo2);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('accepts Yinchuan historic pagoda and drum tower candidates', () => {
      const drumTower = {
        url: 'https://upload.wikimedia.org/yinchuan_drum_tower.jpg',
        title: 'Yinchuan Drum Tower',
        description: 'Historic drum tower in Yinchuan, Ningxia.'
      };
      const res = validateImageCandidate(drumTower, locationInfo2);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('rejects unrelated cities in China and modern commercial photos', () => {
      const shanghaiSkyline = {
        url: 'https://upload.wikimedia.org/shanghai_skyline.jpg',
        title: 'Shanghai modern skyline',
        description: 'Looking east on the modern skyline of Shanghai.'
      };
      const res = validateImageCandidate(shanghaiSkyline, locationInfo2);
      expect(res.decision).toBe('REJECT');
    });
  });

  describe('5. Waypoint 3: Zhongdu (Beijing) Validation', () => {
    it('accepts Jin dynasty Zhongdu capital wall and archaeological remains', () => {
      const zhongduWall = {
        url: 'https://upload.wikimedia.org/zhongdu_wall.jpg',
        title: 'Zhongdu city wall remains',
        description: 'Remains of the Jin dynasty capital city wall in Beijing.'
      };
      const res = validateImageCandidate(zhongduWall, locationInfo3);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('accepts Jin Zhongdu museum and imperial palace site artwork', () => {
      const jinZhongduSite = {
        url: 'https://upload.wikimedia.org/jin_zhongdu_palace.jpg',
        title: 'Jin dynasty Zhongdu palace reconstruction',
        description: 'Historical illustration of the Jin dynasty Zhongdu palace in 1214.'
      };
      const res = validateImageCandidate(jinZhongduSite, locationInfo3);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(70);
    });

    it('rejects modern Beijing airport / subway photography without historical relevance', () => {
      const modernAirport = {
        url: 'https://upload.wikimedia.org/beijing_capital_airport.jpg',
        title: 'Beijing Capital International Airport Terminal 3',
        description: 'Modern airport terminal in Beijing, China.'
      };
      const res = validateImageCandidate(modernAirport, locationInfo3);
      expect(res.decision).toBe('REJECT');
    });
  });
});
