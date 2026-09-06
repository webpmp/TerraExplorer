import { describe, it, expect } from 'vitest';
import {
  validateImageCandidate,
  detectGeographicMismatch,
  isDifferentNamedEntity,
  resolveImageIntent,
  ImageCandidate
} from '../imageService';
import {
  isRouteSequential,
  groupWaypointsByRoute,
  getSequentialRouteSegments,
  Waypoint
} from '../../utils/routeSequenceUtils';

describe('Historical Image Geographic Disambiguation & Route Segment Prevention', () => {
  describe('Problem 1: Image Entity Matching & Geographic Disambiguation', () => {
    const florenceEntity = {
      name: 'Florence, Italy',
      canonicalName: 'Florence',
      city: 'Florence',
      country: 'Italy',
      coordinates: { lat: 43.7696, lng: 11.2558 },
      entityType: 'historical_waypoint',
      historicalPeriod: 'Renaissance',
      routeTitle: 'Where did the Renaissance take place?'
    };

    const florenceIntent = resolveImageIntent(florenceEntity);

    it('rejects "ADX Florence" (correctional facility/prison)', () => {
      const candidate: ImageCandidate = {
        title: 'USP Florence ADMAX',
        description: 'Federal supermax prison near Florence, Colorado, USA',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Adx_florence.jpg'
      };

      expect(isDifferentNamedEntity(candidate.title, candidate.description, florenceEntity.name)).toBe(true);

      const result = validateImageCandidate(candidate, florenceEntity, florenceIntent);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Florence Nightingale" (biographical person / nurse)', () => {
      const candidate: ImageCandidate = {
        title: 'Florence Nightingale',
        description: 'English social reformer, statistician and the founder of modern nursing',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Florence_Nightingale.jpg'
      };

      expect(isDifferentNamedEntity(candidate.title, candidate.description, florenceEntity.name)).toBe(true);

      const result = validateImageCandidate(candidate, florenceEntity, florenceIntent);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Florence Welch" (biographical person / musician)', () => {
      const candidate: ImageCandidate = {
        title: 'Florence Welch performing live',
        description: 'English singer and songwriter of Florence and the Machine',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Florence_Welch.jpg'
      };

      expect(isDifferentNamedEntity(candidate.title, candidate.description, florenceEntity.name)).toBe(true);

      const result = validateImageCandidate(candidate, florenceEntity, florenceIntent);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Florence (drug)" (disambiguation / pharmaceutical)', () => {
      const candidate: ImageCandidate = {
        title: 'Florence (drug)',
        description: 'Pharmaceutical medication tablets',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Florence_drug.jpg'
      };

      expect(isDifferentNamedEntity(candidate.title, candidate.description, florenceEntity.name)).toBe(true);

      const result = validateImageCandidate(candidate, florenceEntity, florenceIntent);
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Milan, Ohio" when target entity is Milan, Italy', () => {
      const milanEntity = {
        name: 'Milan, Italy',
        canonicalName: 'Milan',
        city: 'Milan',
        country: 'Italy',
        coordinates: { lat: 45.4642, lng: 9.19 },
        entityType: 'historical_waypoint',
        historicalPeriod: 'Renaissance'
      };

      const candidate: ImageCandidate = {
        title: 'Main Street in Milan, Ohio',
        description: 'Birthplace of Thomas Edison in Milan, Ohio, United States',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Milan_Ohio.jpg'
      };

      const geo = detectGeographicMismatch(candidate, milanEntity);
      expect(geo.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, milanEntity, resolveImageIntent(milanEntity));
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Rome, Georgia" when target entity is Rome, Italy', () => {
      const romeEntity = {
        name: 'Rome, Italy',
        canonicalName: 'Rome',
        city: 'Rome',
        country: 'Italy',
        coordinates: { lat: 41.9028, lng: 12.4964 },
        entityType: 'historical_waypoint',
        historicalPeriod: 'Renaissance'
      };

      const candidate: ImageCandidate = {
        title: 'Clocktower in Rome, Georgia',
        description: 'Historic clocktower in Rome, Georgia, USA',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rome_Georgia.jpg'
      };

      const geo = detectGeographicMismatch(candidate, romeEntity);
      expect(geo.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, romeEntity, resolveImageIntent(romeEntity));
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "Venice, Florida" when target entity is Venice, Italy', () => {
      const veniceEntity = {
        name: 'Venice, Italy',
        canonicalName: 'Venice',
        city: 'Venice',
        country: 'Italy',
        coordinates: { lat: 45.4408, lng: 12.3155 },
        entityType: 'historical_waypoint',
        historicalPeriod: 'Renaissance'
      };

      const candidate: ImageCandidate = {
        title: 'Venice, Florida Beach',
        description: 'Coastal shoreline of Venice in Sarasota County, Florida, United States',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Venice_Florida.jpg'
      };

      const geo = detectGeographicMismatch(candidate, veniceEntity);
      expect(geo.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, veniceEntity, resolveImageIntent(veniceEntity));
      expect(result.decision).toBe('REJECT');
    });

    it('rejects "London, Ontario" when target entity is London, England', () => {
      const londonEntity = {
        name: 'London, England',
        canonicalName: 'London',
        city: 'London',
        country: 'United Kingdom',
        coordinates: { lat: 51.5074, lng: -0.1278 },
        entityType: 'historical_waypoint',
        historicalPeriod: 'Renaissance'
      };

      const candidate: ImageCandidate = {
        title: 'Downtown London, Ontario',
        description: 'City of London located in Ontario, Canada',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/London_Ontario.jpg'
      };

      const geo = detectGeographicMismatch(candidate, londonEntity);
      expect(geo.mismatch).toBe(true);

      const result = validateImageCandidate(candidate, londonEntity, resolveImageIntent(londonEntity));
      expect(result.decision).toBe('REJECT');
    });

    it('accepts authentic Florence Cathedral / historical site imagery for Florence, Italy', () => {
      const candidate: ImageCandidate = {
        title: 'Florence Cathedral (Santa Maria del Fiore)',
        description: 'Duomo di Firenze in Florence, Tuscany, Italy',
        url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Florence_Duomo.jpg'
      };

      const result = validateImageCandidate(candidate, florenceEntity, florenceIntent);
      expect(result.decision).toBe('ACCEPT');
    });
  });

  describe('Problem 2: Sequence Numbers Must NOT Draw Route Lines', () => {
    const renaissanceWaypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Florence, Italy', sequence: 1, lat: 43.7696, lng: 11.2558 },
      { id: 'wp-2', name: 'Venice, Italy', sequence: 2, lat: 45.4408, lng: 12.3155 },
      { id: 'wp-3', name: 'Rome, Italy', sequence: 3, lat: 41.9028, lng: 12.4964 },
      { id: 'wp-4', name: 'Milan, Italy', sequence: 4, lat: 45.4642, lng: 9.19 },
      { id: 'wp-5', name: 'London, England', sequence: 5, lat: 51.5074, lng: -0.1278 }
    ];

    const renaissanceRouteContext = {
      title: 'Where did the Renaissance take place?',
      routeType: 'regional_event',
      isSequential: false
    };

    it('determines that the Renaissance query is non-sequential', () => {
      const isSeq = isRouteSequential(renaissanceWaypoints, renaissanceRouteContext);
      expect(isSeq).toBe(false);
    });

    it('groups waypoints with isSequential: false when route is non-sequential', () => {
      const groups = groupWaypointsByRoute(renaissanceWaypoints, renaissanceRouteContext);
      expect(groups.length).toBe(1);
      expect(groups[0].isSequential).toBe(false);
      expect(groups[0].waypoints.length).toBe(5);
    });

    it('returns 0 connecting route segments despite having sequence 1..5', () => {
      const segments = getSequentialRouteSegments(renaissanceWaypoints, renaissanceRouteContext);
      expect(segments).toEqual([]);
      expect(segments.length).toBe(0);
    });
  });
});
