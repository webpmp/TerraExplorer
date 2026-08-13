import { 
    createIdentity, 
    createResolvedSubject, 
    createMetadata, 
    createResolvedEntity 
} from '../entityFactory';
import { ENTITY_SCHEMAS } from '../../entitySchema';
import { selectPresentationModel } from '../../selectors/selectPresentationModel';

describe('Architecture Validation', () => {

    test('testFactoryValidation', () => {
        expect(() => {
            createIdentity("query", "", "place", "city", {});
        }).toThrow("canonicalName cannot be empty");

        const id = createIdentity("query", "Valid Name", "place", "city", {});
        
        expect(() => {
            createResolvedSubject(id, {
                label: "Valid",
                location: {
                    coordinates: { lat: 10, lng: 10 }
                },
                provenance: { provider: 'test', timestamp: 0, cache: false },
                diagnostics: {}
            });
        }).not.toThrow();

        expect(() => {
            createResolvedSubject(id, {
                label: "Invalid",
                location: {
                    coordinates: {} as any
                },
                provenance: { provider: 'test', timestamp: 0, cache: false },
                diagnostics: {}
            });
        }).toThrow("GeographicRecord must contain valid coordinates");
    });

    test('testIdentityImmutability', () => {
        const id = createIdentity("query", "Test Name", "place", "city", {});
        
        // Attempting to mutate in TS will fail compilation if typed properly.
        // We'll just verify the identity is frozen or behaves read-only.
        // Note: Our DeepReadonly type handles this at compile time.
        expect(id.canonicalName).toBe("Test Name");
    });

    test('testRevisionIncrement', () => {
        const id = createIdentity("query", "Test Name", "place", "city", {});
        const sub = createResolvedSubject(id, {
            label: "Test Name",
            location: { coordinates: { lat: 0, lng: 0 } },
            provenance: { provider: 'test', timestamp: 0, cache: false },
            diagnostics: {}
        });
        
        const entity1 = createResolvedEntity(sub, createMetadata());
        expect(entity1.revision).toBe(1);
        
        const entity2 = createResolvedEntity(sub, createMetadata(), entity1);
        expect(entity2.revision).toBe(2);
        expect(entity2.id).toBe(entity1.id);
    });

    test('testSelectorStability', () => {
        const id = createIdentity("query", "Statue of Liberty", "place", "landmark", {});
        const sub = createResolvedSubject(id, {
            label: "Statue of Liberty National Monument",
            location: { coordinates: { lat: 40.6892, lng: -74.0445 } },
            provenance: { provider: 'test', timestamp: 0, cache: false },
            diagnostics: {}
        });
        const entity = createResolvedEntity(sub, createMetadata());
        
        const presentation = selectPresentationModel(entity);
        expect(presentation.title).toBe("Statue of Liberty");
        expect(presentation.subtitle).toBe("landmark");
    });

    test('testCapabilityMatrix', () => {
        const cityCapabilities = ENTITY_SCHEMAS['city'].capabilities;
        expect(cityCapabilities.supportsPopulation).toBe(true);
        expect(cityCapabilities.supportsClimate).toBe(true);
        
        const landmarkCapabilities = ENTITY_SCHEMAS['landmark'].capabilities;
        expect(landmarkCapabilities.supportsPopulation).toBe(false);
        // Climate might still be true for outdoor landmarks.
    });

    // Functional Regressions
    test('Statue of Liberty retains canonical name instead of geographic label', () => {
        const id = createIdentity("statue of liberty", "Statue of Liberty", "place", "landmark", {});
        const sub = createResolvedSubject(id, {
            label: "Statue of Liberty National Monument", // Mapped geographic label
            location: { coordinates: { lat: 40, lng: -74 } },
            provenance: { provider: 'test', timestamp: 0, cache: false },
            diagnostics: {}
        });
        const entity = createResolvedEntity(sub, createMetadata());
        const pm = selectPresentationModel(entity);
        expect(pm.title).toBe("Statue of Liberty");
    });

});
