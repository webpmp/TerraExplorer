import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveImageIntent,
  validateImageCandidate,
  classifyImageEvidence,
  deriveEntityAliases,
  detectGeographicMismatch,
  logImagePolicyRouting,
  logImageCandidateValidation,
  logImageFallback,
  ImageCandidate,
  LocationInfo
} from '../imageService';

describe('Landmark and Archaeological Site Image Validation Pipeline', () => {
  describe('1. Image Policy Routing for Standalone Landmarks vs Historical Waypoints', () => {
    it('routes Pyramids of Giza to LANDMARK_ENTITY (not HISTORICAL_WAYPOINT)', () => {
      const intent = resolveImageIntent({
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        type: 'archaeological_site',
        city: 'Giza',
        state: 'Aj Jiza',
        country: 'Egypt'
      });

      expect(intent.type).toBe('ENTITY_SPECIFIC');
      expect(intent.shape).toBe('SPECIFIC_ENTITY');
      expect(intent.policy).toBe('LANDMARK_ENTITY');
      expect(intent.entityRequired).toBe(true);
      expect(intent.geographicConstraint).toBe(true);
    });

    it('routes famous world landmarks and archaeological sites without route context to LANDMARK_ENTITY or STRICT_ENTITY', () => {
      const sites = [
        { name: 'Stonehenge', entityType: 'archaeological_site', country: 'United Kingdom' },
        { name: 'Machu Picchu', entityType: 'historic_site', country: 'Peru' },
        { name: 'Colosseum', entityType: 'monument', city: 'Rome', country: 'Italy' },
        { name: 'Acropolis of Athens', entityType: 'archaeological_site', city: 'Athens', country: 'Greece' },
        { name: 'Petra', entityType: 'archaeological_site', country: 'Jordan' }
      ];

      for (const site of sites) {
        const intent = resolveImageIntent(site);
        expect(intent.type).toBe('ENTITY_SPECIFIC');
        expect(intent.shape).toBe('SPECIFIC_ENTITY');
        expect(['LANDMARK_ENTITY', 'STRICT_ENTITY']).toContain(intent.policy);
        expect(intent.policy).not.toBe('HISTORICAL_WAYPOINT');
        expect(intent.entityRequired).toBe(true);
      }
    });

    it('preserves HISTORICAL_WAYPOINT policy for entities with active historical route context', () => {
      const trailOfTearsWaypoint = {
        name: 'Fort Gibson',
        routeTitle: 'Trail of Tears',
        routeGroupId: 'trail-of-tears',
        historicalRouteId: 'trail-of-tears',
        historicalContext: 'Trail of Tears military post and dispersal point',
        entityType: 'historic_site'
      };

      const intent = resolveImageIntent(trailOfTearsWaypoint);
      expect(intent.type).toBe('ENTITY_SPECIFIC');
      expect(intent.shape).toBe('SPECIFIC_ENTITY');
      expect(intent.policy).toBe('HISTORICAL_WAYPOINT');
      expect(intent.entityRequired).toBe(true);
    });

    it('preserves HISTORICAL_WAYPOINT policy for Lewis & Clark expedition waypoints', () => {
      const lewisAndClarkWaypoint = {
        name: 'Fort Clatsop',
        routeTitle: 'Lewis and Clark Expedition',
        routeGroupId: 'lewis-and-clark',
        historicalContext: 'Winter encampment of the Corps of Discovery 1805-1806'
      };

      const intent = resolveImageIntent(lewisAndClarkWaypoint);
      expect(intent.type).toBe('ENTITY_SPECIFIC');
      expect(intent.policy).toBe('HISTORICAL_WAYPOINT');
    });
  });

  describe('2. Alias-Aware and Inversion Matching for Landmarks', () => {
    it('derives symmetrical inversions, singular/plural, and component aliases for Pyramids of Giza', () => {
      const aliases = deriveEntityAliases('Pyramids of Giza', 'Pyramids of Giza');

      // Canonical and Inversion
      expect(aliases.canonicalAliases).toContain('pyramids of giza');
      expect(aliases.canonicalAliases).toContain('giza pyramids');
      expect(aliases.canonicalAliases).toContain('giza pyramid');

      // Component and Structural Features
      expect(aliases.componentAliases).toContain('great pyramid of giza');
      expect(aliases.componentAliases).toContain('pyramid of khufu');
      expect(aliases.componentAliases).toContain('pyramid of khafre');
      expect(aliases.componentAliases).toContain('pyramid of menkaure');
      expect(aliases.componentAliases).toContain('great sphinx of giza');
      expect(aliases.componentAliases).toContain('giza necropolis');
    });

    it('classifies image candidates with canonical and component aliases accurately', () => {
      const entity = {
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        aliases: ['pyramids of gaza'],
        country: 'Egypt'
      };

      const candidates: Array<{ candidate: ImageCandidate; expectedLevel: string }> = [
        {
          candidate: { url: 'https://img/1.jpg', title: 'Pyramids of Giza', description: 'The Giza pyramid complex in Egypt' },
          expectedLevel: 'EXACT'
        },
        {
          candidate: { url: 'https://img/2.jpg', title: 'Giza Pyramids', description: 'View of the ancient pyramids at Giza' },
          expectedLevel: 'CANONICAL'
        },
        {
          candidate: { url: 'https://img/3.jpg', title: 'Pyramids of Gaza', description: 'Ancient pyramids at Giza' },
          expectedLevel: 'ALIAS'
        },
        {
          candidate: { url: 'https://img/4.jpg', title: 'Pyramid of Khufu', description: 'Khufu pyramid at Giza Plateau' },
          expectedLevel: 'COMPONENT'
        },
        {
          candidate: { url: 'https://img/5.jpg', title: 'Pyramid of Khafre', description: 'Second pyramid of Giza Plateau' },
          expectedLevel: 'COMPONENT'
        },
        {
          candidate: { url: 'https://img/6.jpg', title: 'Pyramid of Menkaure', description: 'Third and smallest pyramid at Giza' },
          expectedLevel: 'COMPONENT'
        },
        {
          candidate: { url: 'https://img/7.jpg', title: 'Great Sphinx of Giza', description: 'Limestone statue of a reclining sphinx' },
          expectedLevel: 'COMPONENT'
        },
        {
          candidate: { url: 'https://img/8.jpg', title: 'Giza Necropolis', description: 'Archaeological site on the Giza Plateau' },
          expectedLevel: 'COMPONENT'
        }
      ];

      for (const { candidate, expectedLevel } of candidates) {
        const evidence = classifyImageEvidence(candidate, entity);
        expect(evidence.entityMatchLevel).toBe(expectedLevel);
      }
    });
  });

  describe('3. Geographic Evidence States (MATCHING, UNKNOWN, CONFLICTING)', () => {
    const entity = {
      name: 'Pyramids of Giza',
      canonicalName: 'Pyramids of Giza',
      entityType: 'archaeological_site',
      city: 'Giza',
      state: 'Aj Jiza',
      country: 'Egypt',
      coordinates: { lat: 29.979167, lng: 31.134222 }
    };
    const landmarkIntent = resolveImageIntent(entity);

    it('accepts strong entity match when geographic metadata is UNKNOWN (missing coordinates or location tags)', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/pyramids-unknown-geo.jpg',
        title: 'Pyramids of Giza',
        description: 'Ancient stone masonry under the desert sky'
        // No coordinates, no explicit country/city in text
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(1);
    });

    it('accepts alias entity match when geographic metadata is UNKNOWN', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/giza-pyramids.jpg',
        title: 'Giza Pyramids',
        description: 'Detail of ancient stone masonry'
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(1);
    });

    it('accepts component landmark match when geographic metadata is UNKNOWN as Tier 2 supporting image', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/khufu.jpg',
        title: 'Great Pyramid of Giza',
        description: 'Detail of casing stones and entrance'
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(2);
      expect(validation.reason).toBe('COMPONENT_LANDMARK_MATCH');
    });

    it('accepts strong entity match when geographic metadata is MATCHING', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/pyramids-egypt.jpg',
        title: 'Giza Pyramids',
        description: 'Panorama from Giza, Egypt',
        coordinates: { lat: 29.9792, lng: 31.1342 }
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(1);
      expect(validation.reason).toBe('STRONG_ENTITY_MATCH_GEO_VERIFIED');
    });

    it('rejects candidate with CONFLICTING geographic evidence even if title has exact string', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/sydney-pyramid.jpg',
        title: 'Pyramids of Giza Exhibition in Sydney',
        description: 'Temporary museum gallery in Sydney, Australia',
        coordinates: { lat: -33.8688, lng: 151.2093 }
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('REJECT');
      expect(validation.reason).toBe('GEOGRAPHIC_CONFLICT');
    });

    it('rejects candidate with DIFFERENT_ENTITY when title is a different entity', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/vegas-pyramid.jpg',
        title: 'Pyramids of Giza replica at Luxor Hotel',
        description: 'Casino resort in Nevada, United States'
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('REJECT');
      expect(validation.reason).toBe('DIFFERENT_ENTITY');
    });

    it('rejects candidate with NONE entity match', () => {
      const candidate: ImageCandidate = {
        url: 'https://example.com/cairo-tower.jpg',
        title: 'Cairo Tower',
        description: 'Free-standing concrete tower in Cairo, Egypt',
        coordinates: { lat: 30.0459, lng: 31.2243 }
      };

      const validation = validateImageCandidate(candidate, entity, landmarkIntent);
      expect(validation.decision).toBe('REJECT');
      expect(validation.reason).toBe('NO_ENTITY_SPECIFIC_EVIDENCE');
    });
  });

  describe('4. Diagnostic Logs and Fallback Pass', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('emits [IMAGE POLICY ROUTING] log with correct fields', () => {
      logImagePolicyRouting({
        entity: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        historicalContext: 'none',
        routeContext: 'none',
        selectedPolicy: 'LANDMARK_ENTITY',
        reason: 'Standalone landmark or archaeological site'
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[IMAGE POLICY ROUTING]'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('entity="Pyramids of Giza"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('selectedPolicy="LANDMARK_ENTITY"'));
    });

    it('emits [IMAGE CANDIDATE VALIDATION] log with entityMatch and geographicMatch states', () => {
      logImageCandidateValidation({
        candidate: 'Great Pyramid of Giza',
        entityMatch: 'ALIAS',
        entityMatchReason: 'Matched alias: great pyramid of giza',
        geographicMatch: 'UNKNOWN',
        geographicMatchReason: 'Geographic metadata unknown',
        policy: 'LANDMARK_ENTITY',
        accepted: true,
        rejectionReason: 'none'
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[IMAGE CANDIDATE VALIDATION]'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('entityMatch=ALIAS'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('geographicMatch=UNKNOWN'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('accepted=true'));
    });

    it('emits [IMAGE FALLBACK] log with candidate counts and policy', () => {
      logImageFallback({
        initialCandidateCount: 6,
        initialAcceptedCount: 0,
        fallbackTriggered: true,
        fallbackPolicy: 'LANDMARK_ENTITY',
        fallbackAcceptedCount: 2
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[IMAGE FALLBACK]'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('initialCandidateCount=6'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('initialAcceptedCount=0'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('fallbackTriggered=true'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('fallbackPolicy="LANDMARK_ENTITY"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('fallbackAcceptedCount=2'));
    });
  });
});
