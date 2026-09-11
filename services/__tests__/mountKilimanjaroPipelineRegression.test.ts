import { describe, it, expect, vi } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import * as geminiService from '../geminiService';
import { isClimateConflicting } from '../geographic/climateEstimator';
import { validateResolvedEntity } from '../entityValidation';

describe('Mount Kilimanjaro Climate Rejection & Pipeline Integrity Regression', () => {
  it('1. isClimateConflicting detects Humid Subtropical / Cwa as conflicting with mountain entity type', () => {
    const candidateClimate = {
      name: 'Humid subtropical climate',
      koppenCode: 'Cwa',
      description: 'Humid subtropical climate with dry winters.'
    };
    
    const conflict = isClimateConflicting(
      candidateClimate,
      undefined,
      -3.0925,
      36.8554,
      'Kilimanjaro Region',
      'Tanzania',
      'mountain'
    );

    expect(conflict.isConflict).toBe(true);
    expect(conflict.reason).toContain('alpine/mountain terrain');
  });

  it('2. Pipeline correctly rejects contradictory climate for Mount Kilimanjaro, excludes it from merge, and falls back to estimated alpine climate', async () => {
    // Mock resolveLocationQuery in geminiService to return coordinates for Mount Kilimanjaro
    const spyResolve = vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      locationInfo: {
        name: 'Mount Kilimanjaro',
        canonicalName: 'Mount Kilimanjaro',
        coordinates: { lat: -3.0674, lng: 37.3556 },
        country: 'Tanzania',
        region: 'Kilimanjaro Region',
        state: 'Kilimanjaro Region',
        type: 'mountain',
        entityType: 'mountain'
      } as any,
      error: undefined
    });

    // Mock recoverLocationMetadata LLM generation returning contradictory Cwa climate
    const rawKilimanjaroResponse = JSON.stringify({
      description: 'Mount Kilimanjaro is a dormant volcano in Tanzania with three volcanic cones (Kibo, Mawenzi, and Shira). It is the highest mountain in Africa and the highest single free-standing mountain above sea level in the world at 5,895 metres.',
      climate: {
        name: 'Humid subtropical climate',
        koppenCode: 'Cwa',
        description: 'Humid subtropical conditions.'
      },
      notable: [
        { title: 'Highest Peak in Africa', description: 'Stands at 5,895 meters above sea level as the roof of Africa.' },
        { title: 'Three Volcanic Cones', description: 'Composed of Kibo, Mawenzi, and Shira volcanic cones.' }
      ],
      contextNotes: [
        'Located inside Kilimanjaro National Park',
        'Iconic snow-capped equatorial summit'
      ]
    });

    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: rawKilimanjaroResponse
    } as any);

    try {
      const result = await runSearchPipeline({
        rawQuery: 'Show me Mount Kilimanjaro',
        previousLocations: []
      });

      expect(result.isValid).toBe(true);
      expect(result.entity).toBeDefined();

      const entity = result.entity!;
      expect(entity.subject.identity.canonicalName).toBe('Mount Kilimanjaro');
      expect(entity.subject.identity.entityType).toBe('mountain');

      // The LLM-generated Humid Subtropical climate MUST NOT be present
      expect(entity.metadata.climate).toBeDefined();
      const climateName = (entity.metadata.climate?.name || '').toLowerCase();
      expect(climateName).not.toContain('humid subtropical');
      expect(climateName).toContain('alpine');

      // Recovered valid fields MUST be present
      expect(entity.metadata.description).toBeDefined();
      expect(typeof entity.metadata.description === 'string' || typeof entity.metadata.description?.text === 'string').toBe(true);
      expect(entity.metadata.notable?.length).toBeGreaterThan(0);
      expect(entity.metadata.contextNotes?.length).toBeGreaterThan(0);

      // validateResolvedEntity must pass
      expect(validateResolvedEntity(entity)).toBe(true);
    } finally {
      spyResolve.mockRestore();
      spyMetadata.mockRestore();
    }
  });
});
