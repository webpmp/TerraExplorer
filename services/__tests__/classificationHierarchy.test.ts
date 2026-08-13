import { describe, it, expect } from 'vitest';
import { classifyEntityType } from '../classifierService';
import { createResolvedEntity, createResolvedSubject, createIdentity, createMetadata } from '../entityFactory';
import { ResolutionStage, IntentStage } from '../pipeline';

describe('Classification Hierarchy and Metadata Contract', () => {
    
    // 1. Entity Classification Tests (No Network)
    describe('Entity Classification', () => {
        it('Dead Sea should classify as natural_feature', async () => {
            const type = await classifyEntityType('Show me the Dead Sea', 'Dead Sea');
            expect(type).toBe('natural_feature');
        });

        it('Amazon River should classify as natural_feature', async () => {
            const type = await classifyEntityType('Amazon River', 'Amazon River');
            expect(type).toBe('natural_feature');
        });

        it('Sahara Desert should classify as natural_feature', async () => {
            const type = await classifyEntityType('Sahara Desert', 'Sahara Desert');
            expect(type).toBe('natural_feature');
        });

        it('Mount Everest should classify as natural_feature', async () => {
            const type = await classifyEntityType('Mount Everest', 'Mount Everest');
            expect(type).toBe('natural_feature');
        });

        it('Grand Canyon should classify as natural_feature', async () => {
            const type = await classifyEntityType('Grand Canyon', 'Grand Canyon');
            expect(type).toBe('natural_feature');
        });

        it('Paris should classify as city by default fallback', async () => {
            const type = await classifyEntityType('Paris', 'Paris');
            expect(type).toBe('city');
        });
        
        it('Tokyo should classify as city by default fallback', async () => {
            const type = await classifyEntityType('Tokyo', 'Tokyo');
            expect(type).toBe('city');
        });
    });

    // 2. Metadata Contract Tests (No Network)
    describe('Metadata Contract', () => {
        it('createResolvedEntity should not spread metadata onto the root object', () => {
            const identity = createIdentity('Dead Sea', 'Dead Sea', 'place', 'natural_feature', {});
            const subject = createResolvedSubject(identity, {
                label: 'Dead Sea',
                featureType: 'natural_feature',
                location: { coordinates: { lat: 0, lng: 0 } },
                provenance: { provider: 'test', timestamp: 0, cache: true },
                diagnostics: {}
            });
            
            const metadata = createMetadata({
                description: { text: 'A salt lake', provenance: { provider: 'test', timestamp: 0, cache: true } },
                climate: { value: 'Arid', description: 'Hot', provenance: { provider: 'test', timestamp: 0, cache: true } },
                population: { value: 0, status: 'not_applicable', provenance: { provider: 'test', timestamp: 0, cache: true } }
            } as any);

            // Cast as any because we might have extra fields we want to pass in test
            const entity = createResolvedEntity(subject, metadata) as any;

            // Verify canonical contract
            expect(entity.id).toBeDefined();
            expect(entity.subject).toBeDefined();
            expect(entity.metadata).toBeDefined();
            
            // Verify no root spreading
            expect(entity.description).toBeUndefined();
            expect(entity.climate).toBeUndefined();
            expect(entity.population).toBeUndefined();
            
            // Verify data is safely in metadata
            expect(entity.metadata.description.text).toBe('A salt lake');
            expect(entity.metadata.climate.value).toBe('Arid');
        });
    });
});
