import { describe, it, expect } from 'vitest';
import { classifyGeographicEntity } from '../classifierService';
import { createResolvedEntity, createResolvedSubject, createIdentity, createMetadata } from '../entityFactory';
import { ResolutionStage, IntentStage } from '../pipeline';

describe('Classification Hierarchy and Metadata Contract', () => {
    
    // 1. Entity Classification Tests (No Network)
    describe('Entity Classification', () => {
        it('Matterhorn should classify as mountain', async () => {
            const type = await classifyGeographicEntity('Matterhorn', { lat: 45.9765, lng: 7.6586 });
            expect(type).toBe('mountain');
            expect(type).not.toBe('minor_poi');
            expect(type).not.toBe('mountain_range');
        });

        it('Pennine Alps should classify as mountain_range', async () => {
            const type = await classifyGeographicEntity('Pennine Alps', { lat: 45.95, lng: 7.75 });
            expect(type).toBe('mountain_range');
        });

        it('Mount Fuji should classify as mountain', async () => {
            const type = await classifyGeographicEntity('Mount Fuji', { lat: 35.3606, lng: 138.7274 });
            expect(type).toBe('mountain');
        });

        it('Grand Canyon should classify as canyon', async () => {
            const type = await classifyGeographicEntity('Grand Canyon', { lat: 36.0544, lng: -112.1401 });
            expect(type).toBe('canyon');
        });

        it('Dead Sea should classify as lake', async () => {
            const type = await classifyGeographicEntity('Dead Sea', { lat: 31.5590, lng: 35.4732 });
            expect(type).toBe('lake');
        });

        it('Golden Gate Bridge should classify as infrastructure', async () => {
            const type = await classifyGeographicEntity('Golden Gate Bridge', { lat: 37.8199, lng: -122.4783 });
            expect(type).toBe('infrastructure');
        });

        it('OSM node representation does not force known natural feature into minor_poi', async () => {
            const type = await classifyGeographicEntity(
                'Matterhorn',
                { lat: 45.9765, lng: 7.6586 },
                ['node', 'peak'],
                { type: 'node', feature: 'Heiliger Bernhard' }
            );
            expect(type).toBe('mountain');
            expect(type).not.toBe('minor_poi');
        });

        it('Amazon River should classify as river', async () => {
            const type = await classifyGeographicEntity('Amazon River', null, [], { type: 'natural_feature' });
            expect(type).toBe('river');
        });

        it('Sahara Desert should classify as desert', async () => {
            const type = await classifyGeographicEntity('Sahara Desert', null, [], { type: 'natural_feature' });
            expect(type).toBe('desert');
        });

        it('Mount Everest should classify as mountain', async () => {
            const type = await classifyGeographicEntity('Mount Everest', null, [], { type: 'natural_feature' });
            expect(type).toBe('mountain');
        });

        it('Paris should classify as settlement by default fallback', async () => {
            const type = await classifyGeographicEntity('Paris', null, [], { type: 'city' });
            expect(type).toBe('settlement');
        });
        
        it('Tokyo should classify as settlement by default fallback', async () => {
            const type = await classifyGeographicEntity('Tokyo', null, [], { type: 'city' });
            expect(type).toBe('settlement');
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

    // 3. Pipeline Canonical Entity Lock
    describe('Pipeline Canonical Entity Lock', () => {
        it('Where is the Matterhorn? resolves to deterministic canonical entity with mountain entityType', async () => {
            const intentRes = IntentStage('Where is the Matterhorn?');
            expect(intentRes.entity).toBe('Matterhorn');

            const finalRes = await ResolutionStage(intentRes);
            expect(finalRes.entity).toBeDefined();
            expect(finalRes.entity?.subject.identity.canonicalName).toBe('Matterhorn');
            expect(finalRes.entity?.subject.identity.entityType).toBe('mountain');
            expect(finalRes.entity?.subject.identity.entityType).not.toBe('minor_poi');
            expect(finalRes.entity?.subject.identity.entityType).not.toBe('mountain_range');
            expect(finalRes.entity?.subject.primaryLocation.coordinateSource).toBe('deterministic');
            expect(finalRes.entity?.subject.primaryLocation.identityStatus).toBe('verified');
            expect(finalRes.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(45.9765, 4);
            expect(finalRes.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(7.6586, 4);
        });
    });
});
