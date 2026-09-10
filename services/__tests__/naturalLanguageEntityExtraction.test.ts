import { describe, it, expect } from 'vitest';
import { routeIntentAndExtractEntity } from '../geminiService';
import { isInvalidCanonicalName, validateEntityIdentity } from '../geographic/entityIdentityValidator';
import { runSearchPipeline, SearchStage, ResolutionStage } from '../pipeline';
import { classifyGeographicEntity } from '../classifierService';

describe('Natural Language Entity Extraction and Coordinate Trust Suite', () => {
  describe('1. Natural Language Query Entity Extraction', () => {
    it('extracts "pyramids of gaza" from "where are the pyramids of gaza"', () => {
      const extracted = routeIntentAndExtractEntity('where are the pyramids of gaza');
      expect(extracted.entity.toLowerCase()).toBe('pyramids of gaza');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts "pyramids of giza" from "where are the pyramids of giza"', () => {
      const extracted = routeIntentAndExtractEntity('where are the pyramids of giza');
      expect(extracted.entity.toLowerCase()).toBe('pyramids of giza');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts "grand canyon" from "where is the grand canyon"', () => {
      const extracted = routeIntentAndExtractEntity('where is the grand canyon');
      expect(extracted.entity.toLowerCase()).toBe('grand canyon');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts "eiffel tower" from "what is the eiffel tower"', () => {
      const extracted = routeIntentAndExtractEntity('what is the eiffel tower');
      expect(extracted.entity.toLowerCase()).toBe('eiffel tower');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts "antelope canyon" from "show me antelope canyon"', () => {
      const extracted = routeIntentAndExtractEntity('show me antelope canyon');
      expect(extracted.entity.toLowerCase()).toBe('antelope canyon');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts "mount everest" from "take me to mount everest"', () => {
      const extracted = routeIntentAndExtractEntity('take me to mount everest');
      expect(extracted.entity.toLowerCase()).toBe('mount everest');
      expect(extracted.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
    });

    it('extracts additional natural language command wrappers', () => {
      expect(routeIntentAndExtractEntity('can you show me Machu Picchu').entity.toLowerCase()).toBe('machu picchu');
      expect(routeIntentAndExtractEntity('how to get to Mount Everest').entity.toLowerCase()).toBe('mount everest');
      expect(routeIntentAndExtractEntity('tell me about the Colosseum').entity.toLowerCase()).toBe('colosseum');
      expect(routeIntentAndExtractEntity('find Stonehenge?').entity.toLowerCase()).toBe('stonehenge');
      expect(routeIntentAndExtractEntity('where is located the Taj Mahal?').entity.toLowerCase()).toBe('taj mahal');
    });
  });

  describe('2. Direct Entity Queries Preserved', () => {
    it('preserves direct entity queries with DIRECT intent and shape', () => {
      const directCases = [
        { query: 'Pyramids of Giza', expected: 'Pyramids of Giza' },
        { query: 'Grand Canyon', expected: 'Grand Canyon' },
        { query: 'Eiffel Tower', expected: 'Eiffel Tower' },
        { query: 'Antelope Canyon', expected: 'Antelope Canyon' },
        { query: 'Mount Everest', expected: 'Mount Everest' }
      ];

      for (const tc of directCases) {
        const extracted = routeIntentAndExtractEntity(tc.query);
        expect(extracted.entity).toBe(tc.expected);
        expect(extracted.intent).toBe('DIRECT');
        expect(extracted.queryShape).toBe('DIRECT');
      }
    });
  });

  describe('3. Canonical-Name Sanity Protection (isInvalidCanonicalName)', () => {
    it('rejects natural-language questions and commands as canonical names', () => {
      const invalidNames = [
        'where is the Eiffel Tower',
        'where are the pyramids of giza',
        'what is the Eiffel Tower',
        'what are the pyramids of giza',
        'tell me about the Grand Canyon',
        'show me Antelope Canyon',
        'find Mount Everest',
        'take me to the Grand Canyon',
        'how to get to Mount Everest',
        'where are the pyramids of gaza',
        'Is the Eiffel Tower tall?',
        'Any entity ending with a question mark?'
      ];

      for (const name of invalidNames) {
        expect(isInvalidCanonicalName(name), `Expected "${name}" to be rejected as invalid canonical name`).toBe(true);
      }
    });

    it('accepts legitimate geographic names', () => {
      const validNames = [
        'Pyramids of Giza',
        'Grand Canyon',
        'Eiffel Tower',
        'Antelope Canyon',
        'Mount Everest',
        'Cook County',
        'Point Reyes',
        'Cape of Good Hope',
        'Isle of Wight',
        'Paris, France',
        'Plano, Texas'
      ];

      for (const name of validNames) {
        expect(isInvalidCanonicalName(name), `Expected "${name}" to be accepted as valid canonical name`).toBe(false);
      }
    });

    it('guards validateEntityIdentity against accepting natural-language question canonical names', () => {
      const res = validateEntityIdentity('where are the pyramids of gaza', 'where are the pyramids of gaza');
      expect(res.matches).toBe(false);
      expect(res.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
    });
  });

  describe('4. Landmark Classification Protection', () => {
    it('classifies "Pyramids of Giza" as archaeological_site, not settlement', async () => {
      const entityType = await classifyGeographicEntity(
        'Pyramids of Giza',
        { lat: 29.9792, lng: 31.1342 },
        ['city', 'governorate', 'tourism=attraction'],
        { type: 'city', city: 'Giza', country: 'Egypt' }
      );
      expect(entityType).toBe('archaeological_site');
    });

    it('classifies "Eiffel Tower" as monument or landmark, not settlement', async () => {
      const entityType = await classifyGeographicEntity(
        'Eiffel Tower',
        { lat: 48.8584, lng: 2.2945 },
        ['city', 'tourism=attraction'],
        { type: 'city', city: 'Paris', country: 'France' }
      );
      expect(entityType === 'monument' || entityType === 'landmark').toBe(true);
    });
  });

  describe('5. End-to-End Pipeline Resolution for "where are the pyramids of gaza"', () => {
    it('correctly resolves "where are the pyramids of gaza" to Pyramids of Giza in Egypt', async () => {
      const searchStageResult = SearchStage({ rawQuery: 'where are the pyramids of gaza' });
      expect(searchStageResult.entity.toLowerCase()).toBe('pyramids of gaza');
      expect(searchStageResult.intentResult.queryShape).toBe('NATURAL_LANGUAGE_QUESTION');
      expect(searchStageResult.intentResult.intent).toBe('NATURAL_LOCATION');

      const pipelineResult = await runSearchPipeline({ rawQuery: 'where are the pyramids of gaza' });

      expect(pipelineResult.isValid).toBe(true);
      expect(pipelineResult.error).toBeUndefined();
      expect(pipelineResult.entity).toBeDefined();

      const entity = pipelineResult.entity!;
      expect(entity.subject.identity.canonicalName).toMatch(/Pyramids of Giza|Giza Pyramid Complex/i);
      expect(entity.subject.identity.entityType).toBe('archaeological_site');

      const coords = entity.subject.primaryLocation.location.coordinates;
      expect(coords.lat).toBeGreaterThan(29.0);
      expect(coords.lat).toBeLessThan(31.0);
      expect(coords.lng).toBeGreaterThan(30.0);
      expect(coords.lng).toBeLessThan(32.0);

      // Verify coordinate source and trust are verified, and not invented Saudi Arabian coordinates (~21.96, 38.05)
      expect(coords.lat).not.toBeCloseTo(21.9657, 1);
      expect(coords.lng).not.toBeCloseTo(38.0546, 1);
      expect(entity.subject.primaryLocation.identityStatus).toBe('verified');
    });
  });

  describe('6. AI Coordinate Trust Gate Regression', () => {
    it('rejects provisional and unverified AI coordinates from becoming navigation targets', async () => {
      const mockUnverifiedEntityResult = {
        intentResult: {
          normalized: {
            request: { rawQuery: 'where is the lost city of atlantis' },
            normalizedQuery: 'where is the lost city of atlantis'
          },
          intent: 'NATURAL_LOCATION' as any,
          queryShape: 'NATURAL_LANGUAGE_QUESTION'
        },
        entity: 'lost city of atlantis'
      };

      const result = await ResolutionStage(mockUnverifiedEntityResult);
      // Coordinates should either be undefined or rejected if resolved only through unverified AI
      if ((result as any).data?.coordinates) {
        const trust = (result as any).data.coordinateTrust;
        const status = (result as any).data.identityStatus;
        if (trust === 'unverified' || (trust === 'provisional' && status === 'unverified')) {
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('UNRESOLVED_ENTITY');
        }
      } else {
        expect(result.isValid).toBe(false);
      }
    });
  });
});
