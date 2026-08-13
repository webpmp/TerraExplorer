import { ResolvedEntity, PresentationModel, MetadataLoadState } from '../domain';

export const selectEntityTitle = (entity: ResolvedEntity): string => {
    return entity.subject.identity.canonicalName ?? entity.subject.primaryLocation.label;
};

export const selectEntitySubtitle = (entity: ResolvedEntity): string => {
    const loc = entity.subject.primaryLocation.location;
    if (loc.address) {
        if (loc.address.full) return loc.address.full;
        if (loc.address.city && loc.address.country) return `${loc.address.city}, ${loc.address.country}`;
        if (loc.address.country) return loc.address.country;
    }
    return '';
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
            notable: !!entity.metadata?.notable?.summary,
            news: loadState.news
        },
        loadState
    };
};
