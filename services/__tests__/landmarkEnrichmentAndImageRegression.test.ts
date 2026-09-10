import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import { evaluateEnrichmentCompleteness, logEnrichmentCompleteness } from '../entityValidation';
import * as geminiService from '../geminiService';
import {
  deriveEntityAliases,
  classifyImageEvidence,
  validateImageCandidate,
  resolveImageIntent,
  ImageCandidate
} from '../imageService';

describe('Landmark Enrichment Completeness, Metadata Recovery, and Image Relationship Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('A. Partial Deterministic Landmark Enrichment', () => {
    it('evaluates status as PARTIAL and triggers metadata recovery when notable and contextNotes are empty', async () => {
      const partialData = {
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        description: 'The Pyramids of Giza are an ancient Egyptian necropolis complex comprising three major pyramid structures.',
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        },
        notable: [],
        contextNotes: [],
        news: []
      };

      const completeness = evaluateEnrichmentCompleteness(partialData, 'Pyramids of Giza', 'archaeological_site');

      expect(completeness.status).toBe('PARTIAL');
      expect(completeness.recoveryRequired).toBe(true);
      expect(completeness.missingFields).toContain('notable');
      expect(completeness.missingFields).toContain('contextNotes');
      expect(completeness.newsStatus).toBe('optional/empty');

      // Test recovery behavior in pipeline
      const recoverSpy = vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'The Pyramids of Giza are iconic ancient monuments situated on the Giza Plateau.',
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'Oldest and largest of the Giza pyramids.' }
        ],
        contextNotes: [
          'Constructed during the Fourth Dynasty of the Old Kingdom of Egypt.'
        ],
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        }
      });

      const result = await runSearchPipeline({
        rawQuery: 'Pyramids of Giza'
      });

      expect(result.isValid).toBe(true);
      expect(recoverSpy).toHaveBeenCalled();
      expect(result.entity?.metadata.notable?.length).toBeGreaterThan(0);
      expect(result.entity?.metadata.contextNotes?.length).toBeGreaterThan(0);
      expect(result.entity?.subject.primaryLocation.coordinateSource).toBe('deterministic');
    });
  });

  describe('B. Complete Enrichment', () => {
    it('evaluates status as COMPLETE and does NOT trigger metadata recovery when all core fields are populated, even if news is empty', async () => {
      const completeData = {
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        coordinates: { lat: 29.9792, lng: 31.1342 },
        country: 'Egypt',
        state: 'Giza Governorate',
        city: 'Giza',
        description: 'The Pyramids of Giza are an ancient Egyptian necropolis complex comprising three major pyramid structures.',
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        },
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'Oldest and largest of the Giza pyramids.' }
        ],
        contextNotes: [
          'Constructed during the Fourth Dynasty of the Old Kingdom of Egypt.'
        ],
        news: []
      };

      const completeness = evaluateEnrichmentCompleteness(completeData, 'Pyramids of Giza', 'archaeological_site');

      expect(completeness.status).toBe('COMPLETE');
      expect(completeness.recoveryRequired).toBe(false);
      expect(completeness.missingFields.length).toBe(0);
      expect(completeness.newsStatus).toBe('optional/empty');

      // Test in pipeline: mock resolveLocationQuery to return complete data
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        locationInfo: completeData as any,
        suggestedZoom: 10,
        aiUsed: false
      });

      const recoverSpy = vi.spyOn(geminiService, 'recoverLocationMetadata');

      const result = await runSearchPipeline({
        rawQuery: 'Pyramids of Giza'
      });

      expect(result.isValid).toBe(true);
      expect(recoverSpy).not.toHaveBeenCalled();
      expect(result.entity?.metadata.notable?.length).toBe(1);
      expect(result.entity?.metadata.contextNotes?.length).toBe(1);
    });
  });

  describe('C. Natural-Language End-to-End Regression', () => {
    it('resolves "where are the pyramids of gaza?" to deterministic Pyramids of Giza with substantive enrichment and NO AI coordinate resolution', async () => {
      const aiCoordinateRecoverySpy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi');
      const recoverMetadataSpy = vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'The Pyramids of Giza stand on the Giza Plateau on the outskirts of Cairo, Egypt, as the most famous monumental tombs of ancient Egyptian civilization.',
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'The only surviving wonder of the ancient world.' },
          { name: 'Pyramid of Khafre', significance: 'Second-tallest pyramid retaining its original polished casing stones at the apex.' }
        ],
        contextNotes: [
          'Built during Egypt\'s Fourth Dynasty (c. 2575–c. 2465 BCE).',
          'Adjacent to the Great Sphinx and associated mortuary temples.'
        ],
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        }
      });

      const result = await runSearchPipeline({
        rawQuery: 'where are the pyramids of gaza?'
      });

      expect(result.isValid).toBe(true);
      expect(result.entity).toBeDefined();

      // Canonical name & deterministic coordinates
      expect(result.entity?.subject.identity.canonicalName).toMatch(/Pyramids of Giza/i);
      expect(result.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(29.9792, 3);
      expect(result.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(31.1342, 3);
      expect(result.entity?.subject.primaryLocation.coordinateSource).toBe('deterministic');
      expect(result.entity?.subject.primaryLocation.identityStatus).toBe('verified');
      expect(result.entity?.subject.identity.entityType).toBe('archaeological_site');

      // Substantive enrichment
      expect(result.entity?.metadata.description).toBeTruthy();
      expect(result.entity?.metadata.description?.length).toBeGreaterThan(30);
      expect(result.entity?.metadata.notable?.length).toBeGreaterThan(0);
      expect(result.entity?.metadata.contextNotes?.length).toBeGreaterThan(0);

      // AI coordinate resolution must NOT have been called
      expect(aiCoordinateRecoverySpy).not.toHaveBeenCalled();
    });
  });

  describe('D. Image Identity and Relationship Regression', () => {
    const entity = {
      name: 'Pyramids of Giza',
      canonicalName: 'Pyramids of Giza',
      entityType: 'archaeological_site',
      aliases: ['pyramids of gaza'],
      country: 'Egypt'
    };

    it('classifies "Pyramids of Gaza" as an ALIAS of Pyramids of Giza', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/pyramids-gaza.jpg',
        title: 'Pyramids of Gaza',
        description: 'Ancient pyramids at the Giza Plateau'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('ALIAS');
      expect(evidence.evidenceType).toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Great Sphinx of Giza as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/sphinx.jpg',
        title: 'Great Sphinx of Giza',
        description: 'Limestone statue of a reclining sphinx at the Giza Plateau'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Pyramid of Khafre as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/khafre.jpg',
        title: 'Pyramid of Khafre',
        description: 'Second-tallest pyramid of the Giza pyramid complex'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Pyramid of Menkaure as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/menkaure.jpg',
        title: 'Pyramid of Menkaure',
        description: 'Smallest of the three main pyramids at the Giza complex'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('accepts COMPONENT candidates as Tier 2 supporting gallery images under LANDMARK_ENTITY policy without falsely labeling them as alias matches', () => {
      const landmarkIntent = resolveImageIntent(entity);
      expect(landmarkIntent.policy).toBe('LANDMARK_ENTITY');

      const sphinxCandidate: ImageCandidate = {
        url: 'https://images.example.com/sphinx.jpg',
        title: 'Great Sphinx of Giza',
        description: 'Limestone statue of a reclining sphinx at the Giza Plateau',
        coordinates: { lat: 29.9753, lng: 31.1376 }
      };

      const validation = validateImageCandidate(sphinxCandidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(2);
      expect(validation.reason).toBe('COMPONENT_LANDMARK_MATCH');
    });
  });
});
