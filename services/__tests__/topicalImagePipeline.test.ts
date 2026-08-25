import { describe, it, expect, vi } from 'vitest';
import {
  resolveImageIntent,
  buildEntityImageQueries,
  validateImageCandidate,
  classifyTopicMatch,
  logImageIntent
} from '../imageService';

describe('Topical Image Search Pipeline & Intent Separation', () => {
  describe('1. Image Intent Resolution (Requirement 1, 4, 5)', () => {
    it('resolves generic topical query "Where was Game of Thrones filmed?" to GENERIC_TOPIC', () => {
      const intent = resolveImageIntent('Where was Game of Thrones filmed?');

      expect(intent.type).toBe('GENERIC_TOPIC');
      expect(intent.topic).toBe('Game of Thrones filming locations');
      expect(intent.entityRequired).toBe(false);
      expect(intent.geographicConstraint).toBe(false);
      expect(intent.source).toBe('USER_QUERY');
    });

    it('resolves entity-specific query "Show me pictures of Kingston Upon Mersey" to ENTITY_SPECIFIC', () => {
      const intent = resolveImageIntent('Show me pictures of Kingston Upon Mersey');

      expect(intent.type).toBe('ENTITY_SPECIFIC');
      expect(intent.entity).toBe('Kingston Upon Mersey');
      expect(intent.entityRequired).toBe(true);
      expect(intent.geographicConstraint).toBe(true);
      expect(intent.source).toBe('USER_QUERY');
    });

    it('treats unknown intent as UNRESOLVED pipeline state with fallback to original query if meaningful', () => {
      const unresolvedWithQuery = resolveImageIntent({
        name: 'Kingston Upon Mersey',
        intent: 'unknown',
        query: 'Where was Game of Thrones filmed?'
      });

      expect(unresolvedWithQuery.type).toBe('UNRESOLVED');
      expect(unresolvedWithQuery.topic).toBe('Where was Game of Thrones filmed?');
      expect(unresolvedWithQuery.entity).toBe('Kingston Upon Mersey');
      expect(unresolvedWithQuery.entityRequired).toBe(false);
      expect(unresolvedWithQuery.geographicConstraint).toBe(false);
      expect(unresolvedWithQuery.fallback).toBe('ORIGINAL_QUERY');

      const unresolvedEmpty = resolveImageIntent({
        name: 'Kingston Upon Mersey',
        intent: 'unknown'
      });

      expect(unresolvedEmpty.type).toBe('UNRESOLVED');
      expect(unresolvedEmpty.fallback).toBe('NONE');
      expect(unresolvedEmpty.entityRequired).toBe(false);
      expect(unresolvedEmpty.geographicConstraint).toBe(false);
    });

    it('logs image intent matching the required specification format', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const topicalIntent = resolveImageIntent('Where was Game of Thrones filmed?');
      topicalIntent.entity = 'Kingston Upon Mersey';
      logImageIntent(topicalIntent);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[IMAGE INTENT]'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('type=GENERIC_TOPIC'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('topic="Game of Thrones filming locations"'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('entity="Kingston Upon Mersey"'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('entityRequired=false'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('geographicConstraint=false'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('source=USER_QUERY'));

      logSpy.mockRestore();
    });
  });

  describe('2. Query Construction for Topical and Unresolved Queries (Requirement 1, 2, 4)', () => {
    it('generates topical filming queries for Game of Thrones and does not generate Kingston Lacy queries', () => {
      const queries = buildEntityImageQueries({
        name: 'Kingston Upon Mersey',
        city: 'Sale',
        country: 'United Kingdom',
        rawQuery: 'Where was Game of Thrones filmed?'
      });

      expect(queries).toContain('Game of Thrones filming locations');
      expect(queries).toContain('Game of Thrones filming locations Northern Ireland');
      expect(queries).toContain('Game of Thrones filming locations Croatia');
      expect(queries).toContain('Game of Thrones filming locations Iceland');
      expect(queries).toContain('Game of Thrones filming locations Spain');

      // Crucial: Must NEVER generate Kingston Lacy or substitute the selected waypoint name into the topic query
      expect(queries).not.toContain('Kingston Lacy');
      expect(queries).not.toContain('Kingston Lacy Game of Thrones filming');
      expect(queries).not.toContain('Kingston Lacy Liverpool');
      expect(queries).not.toContain('Kingston Lacy United Kingdom');
      expect(queries).not.toContain('Kingston Upon Mersey Game of Thrones filming');
    });

    it('generates fallback query for UNRESOLVED intent when original query is present', () => {
      const queries = buildEntityImageQueries({
        name: 'Kingston Upon Mersey',
        intent: 'unknown',
        query: 'Where was Game of Thrones filmed?'
      });

      expect(queries).toEqual(['Where was Game of Thrones filmed?']);
      expect(queries).not.toContain('Kingston Lacy');
      expect(queries).not.toContain('Kingston Upon Mersey');
    });

    it('returns empty queries for UNRESOLVED intent without meaningful query rather than searching unrelated entity', () => {
      const queries = buildEntityImageQueries({
        name: 'Kingston Upon Mersey',
        intent: 'unknown'
      });

      expect(queries).toEqual([]);
    });

    it('generates entity-specific queries for genuine entity searches', () => {
      const queries = buildEntityImageQueries({
        name: 'Kingston Upon Mersey',
        city: 'Sale',
        country: 'United Kingdom'
      });

      expect(queries.some(q => q.includes('Kingston Upon Mersey'))).toBe(true);
      expect(queries).not.toContain('Kingston Lacy');
    });
  });

  describe('3. Candidate Validation for GENERIC_TOPIC Searches (Requirement 1, 3, 6)', () => {
    const gotTopicalIntent = {
      type: 'GENERIC_TOPIC' as const,
      topic: 'Game of Thrones filming locations',
      entity: 'Kingston Upon Mersey',
      entityRequired: false,
      geographicConstraint: false,
      source: 'USER_QUERY' as const
    };

    const kingstonUponMerseyEntity = {
      name: 'Kingston Upon Mersey',
      city: 'Sale',
      state: 'Greater Manchester',
      country: 'United Kingdom',
      coordinates: { lat: 53.4272, lng: -2.3164 },
      entityType: 'village',
      imageIntent: gotTopicalIntent
    };

    it('accepts authentic filming location imagery (Castle Ward, Dubrovnik) without requiring entity or geographic match', () => {
      const castleWardCandidate = {
        url: 'https://upload.wikimedia.org/castle_ward.jpg',
        title: 'Castle Ward',
        description: 'Castle Ward estate in County Down, Northern Ireland, used as the location for Winterfell in Game of Thrones.',
        coordinates: { lat: 54.3683, lng: -5.5786 } // ~240km away from Kingston Upon Mersey
      };

      const result = validateImageCandidate(castleWardCandidate, kingstonUponMerseyEntity, gotTopicalIntent);

      expect(result.decision).toBe('ACCEPT');
      expect(result.reason).toBe('TOPIC_RELEVANT');
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('rejects unrelated candidate "Kingston Lacy" even if returned by search engine', () => {
      const kingstonLacyCandidate = {
        url: 'https://upload.wikimedia.org/kingston_lacy.jpg',
        title: 'Kingston Lacy',
        description: 'Kingston Lacy is a country house and estate near Wimborne Minster, Dorset, England.',
        coordinates: { lat: 50.8122, lng: -2.0083 }
      };

      const result = validateImageCandidate(kingstonLacyCandidate, kingstonUponMerseyEntity, gotTopicalIntent);

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toBe('INSUFFICIENT_TOPIC_RELEVANCE');
    });

    it('logs candidate validation matching the required specification format', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const castleWardCandidate = {
        url: 'https://upload.wikimedia.org/castle_ward.jpg',
        title: 'Castle Ward',
        description: 'Used as Winterfell in Game of Thrones filming.'
      };

      validateImageCandidate(castleWardCandidate, kingstonUponMerseyEntity, gotTopicalIntent);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[IMAGE CANDIDATE]'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Title="Castle Ward"'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('TopicMatch=STRONG'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('EntityMatch=NONE'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GeographicConstraintApplied=false'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Decision=ACCEPT'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reason=TOPIC_RELEVANT'));

      logSpy.mockRestore();
    });
  });

  describe('4. Safeguards for ENTITY_SPECIFIC Searches (Requirement 7)', () => {
    const kingstonUponMerseySpecific = {
      name: 'Kingston Upon Mersey',
      city: 'Sale',
      state: 'Greater Manchester',
      country: 'United Kingdom',
      coordinates: { lat: 53.4272, lng: -2.3164 },
      entityType: 'village',
      imageIntent: {
        type: 'ENTITY_SPECIFIC' as const,
        entity: 'Kingston Upon Mersey',
        entityRequired: true,
        geographicConstraint: true,
        source: 'USER_QUERY' as const
      }
    };

    it('rejects Kingston Lacy (297km away) for ENTITY_SPECIFIC search of Kingston Upon Mersey', () => {
      const kingstonLacyCandidate = {
        url: 'https://upload.wikimedia.org/kingston_lacy.jpg',
        title: 'Kingston Lacy',
        description: 'Kingston Lacy country house in Dorset, United Kingdom.',
        coordinates: { lat: 50.8122, lng: -2.0083 } // 297km from Kingston Upon Mersey
      };

      const result = validateImageCandidate(kingstonLacyCandidate, kingstonUponMerseySpecific);

      expect(result.decision).toBe('REJECT');
      expect(result.decision).not.toBe('ACCEPT');
    });

    it('accepts authentic Kingston Upon Mersey image for ENTITY_SPECIFIC search', () => {
      const validCandidate = {
        url: 'https://upload.wikimedia.org/st_mary_kingston_upon_mersey.jpg',
        title: 'St Mary Church, Kingston upon Mersey',
        description: 'Parish church in Kingston upon Mersey, Greater Manchester.',
        coordinates: { lat: 53.4275, lng: -2.3160 }
      };

      const result = validateImageCandidate(validCandidate, kingstonUponMerseySpecific);

      expect(result.decision).toBe('ACCEPT');
      expect(result.score).toBeGreaterThanOrEqual(50);
    });
  });

  describe('5. Topic Match Classification', () => {
    it('correctly classifies STRONG, MODERATE, and NONE topic matches', () => {
      const gotCandidate = {
        url: 'https://example.com/dubrovnik.jpg',
        title: 'Dubrovnik Old Town',
        description: 'Filming location for King\'s Landing in Game of Thrones.'
      };
      expect(classifyTopicMatch(gotCandidate, 'Game of Thrones filming locations')).toBe('STRONG');

      const genericFilmCandidate = {
        url: 'https://example.com/film.jpg',
        title: 'Historical Castle',
        description: 'A popular film location for television series.'
      };
      expect(classifyTopicMatch(genericFilmCandidate, 'Game of Thrones filming locations')).toBe('MODERATE');

      const unrelatedCandidate = {
        url: 'https://example.com/unrelated.jpg',
        title: 'Kingston Lacy House',
        description: 'Country estate in Dorset, England.'
      };
      expect(classifyTopicMatch(unrelatedCandidate, 'Game of Thrones filming locations')).toBe('NONE');
    });
  });
});
