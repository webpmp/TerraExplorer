import { ResolvedEntity, PresentationModel, MetadataLoadState } from '../domain';
import { formatUserFacingCategory } from '../utils/categoryFormatting';
import { normalizeSemanticEntityTitle } from '../services/queryNormalizer';

export const selectEntityTitle = (entity: ResolvedEntity): string => {
    const raw = entity.subject.identity.canonicalName ?? entity.subject.primaryLocation.label;
    return normalizeSemanticEntityTitle({
        explicitTitle: raw,
        canonicalName: entity.subject.identity.canonicalName,
        displayName: entity.subject.primaryLocation.label,
        name: raw,
        description: entity.metadata?.description,
        historicalContext: entity.metadata?.historicalContext,
        coordinates: entity.subject.primaryLocation.location?.coordinates
    });
};

export const selectEntitySubtitle = (entity: ResolvedEntity): string => {
    const loc = entity.subject.primaryLocation.location;
    if (loc.address) {
        if (loc.address.full) return loc.address.full;
        if (loc.address.city && loc.address.country) return `${loc.address.city}, ${loc.address.country}`;
        if (loc.address.country) return loc.address.country;
    }
    return entity.subject.identity.entityType || '';
};

export const selectMetadataLoadState = (entity: ResolvedEntity): MetadataLoadState => {
    const md = entity.metadata;
    return {
        description: !!md?.description,
        image: !!md?.image,
        climate: !!md?.climate,
        population: !!md?.population,
        news: (md?.news?.length ?? 0) > 0
    };
};

export const selectPresentationModel = (entity: ResolvedEntity): PresentationModel & { coordinates: { lat: number, lng: number } } => {
    const loadState = selectMetadataLoadState(entity);
    return {
        title: selectEntityTitle(entity),
        subtitle: selectEntitySubtitle(entity),
        coordinates: entity.subject.primaryLocation.location.coordinates,
        sections: {
            overview: loadState.description || loadState.image,
            climate: loadState.climate,
            population: loadState.population,
            notable: !!(entity.metadata?.notable && entity.metadata.notable.length > 0),
            news: loadState.news
        },
        loadState
    };
};
