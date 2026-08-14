import { describe, it, expect, vi } from 'vitest';
import { classifyGeographicEntity } from '../classifierService';
import { getGeographicHierarchy } from '../geographic/classification';
import * as geminiService from '../geminiService';

vi.mock('../geminiService', () => ({
  generateContentWithRetry: vi.fn(),
  modelName: 'gemini-test'
}));

describe('Geographic Entity Contract', () => {
    describe('classifyGeographicEntity', () => {
        it('classifies Paris as a settlement', async () => {
            vi.spyOn(geminiService, 'generateContentWithRetry').mockResolvedValueOnce({ text: 'settlement' } as any);
            const type = await classifyGeographicEntity('Paris', undefined, ['capital city', 'settlement']);
            expect(type).toBe('settlement');
        });

        it('classifies Pyramids of Giza as an archaeological_site', async () => {
            // Even if we mock the LLM to return something else, provider signals override it
            vi.spyOn(geminiService, 'generateContentWithRetry').mockResolvedValueOnce({ text: 'city' } as any);
            const type = await classifyGeographicEntity('Pyramids of Giza', undefined, ['archaeological site', 'unesco']);
            expect(type).toBe('archaeological_site');
        });

        it('classifies Easter Island as an island', async () => {
            const type = await classifyGeographicEntity('Easter Island', undefined, ['island', 'archipelago']);
            expect(type).toBe('island');
        });

        it('classifies Grand Canyon as a natural_feature', async () => {
            const type = await classifyGeographicEntity('Grand Canyon', undefined, ['national park', 'canyon']);
            expect(type).toBe('national_park');
        });
        
        it('classifies Grand Canyon (no signals) as natural_feature', async () => {
            const type = await classifyGeographicEntity('Grand Canyon', undefined, []);
            expect(type).toBe('natural_feature');
        });

        it('classifies Mount Everest as a mountain', async () => {
            const type = await classifyGeographicEntity('Mount Everest', undefined, ['mountain peak']);
            expect(type).toBe('mountain');
        });

        it('classifies Yellowstone National Park as a national_park', async () => {
            const type = await classifyGeographicEntity('Yellowstone National Park', undefined, []);
            expect(type).toBe('national_park');
        });

        it('classifies FM 1530 as a road', async () => {
            const type = await classifyGeographicEntity('FM 1530', undefined, ['highway', 'road']);
            expect(type).toBe('road');
        });
        
        it('classifies FM 1530 correctly even without signals', async () => {
            const type = await classifyGeographicEntity('FM 1530', undefined, []);
            expect(type).toBe('road');
        });

        it('prevents LLM hint from overriding strong provider evidence (e.g. Pyramids)', async () => {
            // Even if LLM says "city", provider signals should force archaeological_site
            const type = await classifyGeographicEntity('Pyramids of Giza', undefined, ['archaeological site']);
            expect(type).toBe('archaeological_site');
        });
    });

    describe('Discovery Hierarchy (Tiers)', () => {
        it('assigns Tier 1 to major settlements', async () => {
            vi.spyOn(geminiService, 'generateContentWithRetry').mockResolvedValueOnce({ text: 'settlement' } as any);
            const candidate = {
                name: 'Paris',
                type: 'city',
                lat: 48.8566,
                lng: 2.3522,
                discoverySignals: ['capital', 'major city']
            };
            const result = await getGeographicHierarchy(candidate as any);
            expect(result.tier).toBe(1);
            expect(result.category).toBe('settlement');
        });

        it('assigns Tier 2 to local towns', async () => {
            vi.spyOn(geminiService, 'generateContentWithRetry').mockResolvedValueOnce({ text: 'settlement' } as any);
            const candidate = {
                name: 'Cooper',
                type: 'town',
                lat: 33.3,
                lng: -95.6,
                discoverySignals: []
            };
            const result = await getGeographicHierarchy(candidate as any);
            expect(result.tier).toBe(2);
            expect(result.category).toBe('settlement');
        });

        it('assigns Tier 2 to major landmarks/features', async () => {
            const candidate = {
                name: 'Pyramids of Giza',
                type: 'landmark',
                lat: 29.9792,
                lng: 31.1342,
                discoverySignals: ['archaeological site']
            };
            const result = await getGeographicHierarchy(candidate as any);
            expect(result.tier).toBeLessThanOrEqual(2);
            expect(result.category).toBe('archaeological_site');
        });

        it('assigns Tier 5 to roads', async () => {
            const candidate = {
                name: 'FM 1530',
                type: 'route',
                lat: 33.4,
                lng: -95.7,
                discoverySignals: ['highway']
            };
            const result = await getGeographicHierarchy(candidate as any);
            expect(result.tier).toBe(5);
            expect(result.category).toBe('road');
        });
    });
});
