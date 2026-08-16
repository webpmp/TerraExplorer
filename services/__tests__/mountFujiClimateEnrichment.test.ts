import { describe, it, expect, vi } from 'vitest';
import { isClimateConflicting, getEstimatedClimate } from '../geographic/climateEstimator';
import { validateResolvedEntity } from '../entityValidation';
import { mergeLocationInfo } from '../locationService';
import * as geminiService from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Mount Fuji & Deterministic Climate Protection Regression', () => {
  const canonicalMountFuji: any = {
    id: 'fuji-1',
    pipelineVersion: 2,
    revision: 1,
    subject: {
      identity: {
        id: 'fuji-id',
        originalQuery: 'Mount Fuji',
        canonicalName: 'Mount Fuji',
        category: 'place',
        entityType: 'mountain',
        entityProvenance: { provider: 'Nominatim', timestamp: Date.now(), cache: false },
        diagnostics: {}
      },
      primaryLocation: {
        label: 'Mount Fuji',
        featureType: 'mountain',
        location: {
          coordinates: { lat: 35.3606, lng: 138.7274, source: 'deterministic' },
          address: {
            country: 'Japan',
            state: 'Shizuoka',
            city: 'Fujinomiya'
          }
        },
        coordinateSource: 'deterministic',
        identityStatus: 'verified',
        provenance: { provider: 'DeterministicDB', timestamp: Date.now(), cache: false },
        diagnostics: {}
      }
    }
  };

  it('1. isClimateConflicting detects Humid Subtropical (Cfa) as conflicting with mountain/alpine terrain', () => {
    const candidateClimate = {
      name: 'Humid subtropical climate',
      koppenCode: 'Cfa',
      description: 'Humid subtropical conditions with hot summers.'
    };
    const deterministicClimate = {
      name: 'Alpine / Mountain Climate',
      koppenCode: 'ET',
      description: 'Cold temperatures, alpine conditions, and brief summers typical of mountain terrain.'
    };

    const conflict = isClimateConflicting(
      candidateClimate,
      deterministicClimate,
      35.3606,
      138.7274,
      'Shizuoka',
      'Japan',
      'mountain'
    );

    expect(conflict.isConflict).toBe(true);
    expect(conflict.reason).toContain('alpine/mountain terrain');
  });

  it('2. recoverLocationMetadata rejects contradictory LLM climate and preserves valid description, notable, and contextNotes', async () => {
    const rawFujiResponse = JSON.stringify({
      description: 'Mount Fuji is an active stratovolcano located on the Japanese island of Honshu, standing as the highest peak in Japan at 3,776.24 meters.',
      climate: {
        name: 'Humid subtropical climate',
        koppenCode: 'Cfa',
        description: 'Humid subtropical climate with warm summers.'
      },
      notable: [
        { name: 'Highest peak in Japan', type: 'geography' },
        { name: 'UNESCO World Heritage Site', type: 'culture' }
      ],
      contextNotes: ['Sacred mountain in Shinto tradition', 'Last erupted in 1707']
    });

    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: rawFujiResponse
    } as any);

    try {
      const recovered = await geminiService.recoverLocationMetadata(
        'Mount Fuji',
        { lat: 35.3606, lng: 138.7274 },
        {
          canonicalName: 'Mount Fuji',
          entityType: 'mountain',
          coordinates: { lat: 35.3606, lng: 138.7274 },
          country: 'Japan',
          state: 'Shizuoka',
          climate: {
            name: 'Alpine / Mountain Climate',
            koppenCode: 'ET'
          }
        }
      );

      expect(recovered).not.toBeNull();
      // Description must be accepted
      expect(recovered?.description).toBeDefined();
      expect((recovered?.description as any).text || recovered?.description).toContain('stratovolcano');
      // Notable must be accepted
      expect(recovered?.notable).toBeDefined();
      expect(recovered?.notable?.length).toBe(2);
      // Context notes must be accepted
      expect(recovered?.contextNotes).toBeDefined();
      expect(recovered?.contextNotes?.length).toBe(2);
      // Contradictory LLM climate must be REJECTED (not present in recovered metadata)
      expect(recovered?.climate).toBeUndefined();
    } finally {
      spyMetadata.mockRestore();
    }
  });

  it('3. Pipeline end-to-end: retains deterministic Alpine climate and accepts valid recovered metadata', async () => {
    const rawFujiResponse = JSON.stringify({
      description: 'Mount Fuji is an active stratovolcano on Honshu, standing as Japan\'s tallest mountain at 3,776 meters with year-round summit snow.',
      climate: {
        name: 'Humid subtropical climate',
        koppenCode: 'Cfa',
        description: 'Humid subtropical climate.'
      },
      notable: [
        { name: 'Sacred Volcano', type: 'volcano' }
      ],
      contextNotes: ['Cultural symbol of Japan']
    });

    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: rawFujiResponse
    } as any);

    try {
      const result = await runSearchPipeline({
        rawQuery: 'Mount Fuji',
        intent: 'NATURAL_LOCATION',
        entity: 'Mount Fuji'
      });

      expect(result.isValid).toBe(true);
      expect(result.entity).toBeDefined();

      const metadata = result.entity!.metadata;
      // Climate must be Alpine / Mountain Climate (ET)
      expect(metadata.climate.koppenCode).toBe('ET');
      expect(metadata.climate.name).toMatch(/Alpine/i);

      // Description, notable, and contextNotes are accepted
      expect(metadata.description.text).toContain('stratovolcano');
      expect(metadata.notable.length).toBeGreaterThan(0);
      expect(metadata.contextNotes.length).toBeGreaterThan(0);

      // Final validation succeeds
      expect(validateResolvedEntity(result.entity!)).toBe(true);
    } finally {
      spyMetadata.mockRestore();
    }
  });

  it('4. mergeLocationInfo protects deterministic climate from being overwritten by contradictory incoming climate', () => {
    const prev = {
      name: 'Mount Fuji',
      entityType: 'mountain',
      coordinates: { lat: 35.3606, lng: 138.7274 },
      country: 'Japan',
      climate: {
        name: 'Alpine / Mountain Climate',
        koppenCode: 'ET',
        description: 'Cold temperatures and alpine conditions.'
      },
      description: 'Mount Fuji is an iconic volcanic peak.'
    };

    const next = {
      climate: {
        name: 'Humid subtropical climate',
        koppenCode: 'Cfa',
        description: 'Humid subtropical conditions.'
      },
      description: 'Mount Fuji is an active stratovolcano on the island of Honshu with cultural prominence.'
    };

    const merged = mergeLocationInfo(prev, next);

    // Climate must remain the authoritative Alpine climate
    expect(merged.climate.koppenCode).toBe('ET');
    expect(merged.climate.name).toBe('Alpine / Mountain Climate');

    // Richer description is accepted
    expect(merged.description).toContain('active stratovolcano');
  });

  it('5. validateResolvedEntity passes with Enrichment valid: true for Mount Fuji with Alpine climate and rich description', () => {
    const entity: any = {
      ...canonicalMountFuji,
      metadata: {
        description: {
          text: 'Mount Fuji is an active stratovolcano on Honshu, standing at 3,776 meters elevation with distinctive symmetrical snow-capped cone.',
          provenance: { provider: 'Gemini', timestamp: Date.now(), cache: false }
        },
        climate: {
          name: 'Alpine / Mountain Climate',
          koppenCode: 'ET',
          description: 'Cold temperatures and alpine conditions.'
        },
        notable: [{ name: 'UNESCO World Heritage Site', entityType: 'culture' }],
        contextNotes: [{ text: 'Famous pilgrimage destination' }]
      }
    };

    expect(validateResolvedEntity(entity)).toBe(true);
  });
});
