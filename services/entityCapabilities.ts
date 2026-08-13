import { EntityType, EntityCategory } from '../domain';

export interface EntityCapabilities {
    supportsPopulation: boolean;
    supportsClimate: boolean;
    supportsNews: boolean;
    supportsLocation: boolean;
}

export const CATEGORY_CAPABILITIES: Record<EntityCategory, EntityCapabilities> = {
    "place": { supportsPopulation: true, supportsClimate: true, supportsNews: true, supportsLocation: true },
    "person": { supportsPopulation: false, supportsClimate: false, supportsNews: true, supportsLocation: true },
    "event": { supportsPopulation: false, supportsClimate: false, supportsNews: true, supportsLocation: true },
    "organization": { supportsPopulation: false, supportsClimate: false, supportsNews: true, supportsLocation: true },
    "artifact": { supportsPopulation: false, supportsClimate: false, supportsNews: true, supportsLocation: true },
    "route": { supportsPopulation: false, supportsClimate: true, supportsNews: true, supportsLocation: true }
};

export const TYPE_CAPABILITY_OVERRIDES: Partial<Record<EntityType, Partial<EntityCapabilities>>> = {
    "mountain": { supportsPopulation: false },
    "volcano": { supportsPopulation: false },
    "river": { supportsPopulation: false },
    "lake": { supportsPopulation: false },
    "ocean": { supportsPopulation: false },
    "sea": { supportsPopulation: false },
    "desert": { supportsPopulation: false },
    "ship": { supportsPopulation: false, supportsClimate: false },
    "shipwreck": { supportsPopulation: false, supportsClimate: false },
    "archaeological_site": { supportsPopulation: false, supportsClimate: false }
};

export const getEntityCapabilities = (category: EntityCategory, type: EntityType): EntityCapabilities => {
    const base = CATEGORY_CAPABILITIES[category];
    const overrides = TYPE_CAPABILITY_OVERRIDES[type];
    
    if (overrides) {
        return { ...base, ...overrides };
    }
    return base;
};
