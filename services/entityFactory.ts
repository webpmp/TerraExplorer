import { 
    SearchIdentity, 
    EntityCategory, 
    EntityType, 
    ResolvedSubject, 
    GeographicRecord, 
    EnrichmentResult, 
    ResolvedEntity,
    ClassificationDiagnostics,
    GeoLocation
} from '../domain';

export const createIdentity = (
    originalQuery: string,
    canonicalName: string,
    category: EntityCategory,
    entityType: EntityType,
    diagnostics: ClassificationDiagnostics,
    options?: {
        geographicScope?: any;
        singleLocation?: boolean;
    }
): SearchIdentity => {
    if (!canonicalName || canonicalName.trim() === '') {
        throw new Error("canonicalName cannot be empty");
    }

    return {
        id: crypto.randomUUID(),
        originalQuery,
        canonicalName,
        category,
        entityType,
        geographicScope: options?.geographicScope,
        singleLocation: options?.singleLocation,
        entityProvenance: {
            provider: 'System',
            timestamp: Date.now(),
            cache: false
        },
        diagnostics
    };
};

export const createResolvedSubject = (
    identity: SearchIdentity,
    primaryLocation: GeographicRecord,
    additionalLocations?: GeographicRecord[]
): ResolvedSubject => {
    const isNonPoint = identity.singleLocation === false || (identity.geographicScope && identity.geographicScope !== 'POINT_EVENT');
    if (!isNonPoint) {
        if (!primaryLocation.location.coordinates || typeof primaryLocation.location.coordinates.lat !== 'number' || typeof primaryLocation.location.coordinates.lng !== 'number') {
            throw new Error("GeographicRecord must contain valid coordinates");
        }
    }

    return {
        identity,
        primaryLocation,
        additionalLocations
    };
};

export const createMetadata = (
    initialData?: Partial<EnrichmentResult>
): EnrichmentResult => {
    return {
        description: initialData?.description,
        image: initialData?.image,
        climate: initialData?.climate,
        population: initialData?.population,
        notable: initialData?.notable || [],
        news: initialData?.news || [],
        contextNotes: initialData?.contextNotes || []
    };
};

export const createResolvedEntity = (
    subject: ResolvedSubject,
    metadata: EnrichmentResult,
    previous?: ResolvedEntity
): ResolvedEntity => {
    const revision = previous ? previous.revision + 1 : 1;
    const id = previous ? previous.id : crypto.randomUUID();

    return {
        id,
        pipelineVersion: 2,
        revision,
        subject,
        metadata
    };
};
