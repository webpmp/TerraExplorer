import { GeoCoordinates, NotableItem } from './types';

// ==========================================
// ARCHITECTURAL INVARIANTS
// ==========================================
// Invariant 1: Identity never changes after classification.
// Invariant 2: Resolution never changes identity.
// Invariant 3: Enrichment never changes identity or geography.
// Invariant 4: Presentation never mutates domain objects.
// Invariant 5: Pipeline stages strictly return new, immutable objects.
// ==========================================

export type DeepReadonly<T> =
  T extends (infer R)[] ? DeepReadonlyArray<R> :
  T extends Function ? T :
  T extends object ? DeepReadonlyObject<T> :
  T;

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}
type DeepReadonlyObject<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

export type EntityCategory = "place" | "person" | "event" | "organization" | "artifact" | "route";

export type GeographicEntityType = 
    | "settlement"
    | "landmark"
    | "archaeological_site"
    | "natural_feature"
    | "water_body"
    | "mountain"
    | "island"
    | "national_park"
    | "administrative_region"
    | "road"
    | "address"
    | "infrastructure"
    | "minor_poi"
    | "shipwreck_site"
    | "historical_site";

export type NonGeographicEntityType = 
    | "historical_person" 
    | "historical_event" 
    | "battle" 
    | "organization" 
    | "civilization" 
    | "historical_region" 
    | "historical_object" 
    | "vehicle" 
    | "artifact";

export type EntityType = GeographicEntityType | NonGeographicEntityType;

export interface CanonicalGeographicEntity {
  readonly canonicalName: string;
  readonly entityType: GeographicEntityType;
  readonly coordinates: GeoCoordinates;
  readonly providerSignals?: string[];
  readonly adminContext?: string[];
}

export interface Provenance {
    provider: string; 
    model?: string;
    timestamp: number;
    confidence?: number;
    cache: boolean;
}

export interface AddressInfo { country?: string; state?: string; city?: string; full?: string; }
export interface BoundingBox { north: number; south: number; east: number; west: number; }

export interface GeoLocation {
    coordinates: GeoCoordinates;
    address?: AddressInfo;
    boundingBox?: BoundingBox;
    suggestedZoom?: number;
}

export type ResolverStrategy = "Geographic" | "Historical" | "Biography" | "Route" | "AI";

export interface ClassificationDiagnostics {
    classifier?: string; 
    routingStrategy?: ResolverStrategy; 
    confidence?: number; 
    contextScore?: number;
}

export interface ResolutionDiagnostics {
    nameSimilarity?: number; 
    ambiguity?: boolean; 
    score?: number; 
    rejectionReason?: string;
}

export interface GeographicRecord {
    label: string; 
    featureType?: EntityType; 
    location: GeoLocation;
    provenance: Provenance;
    diagnostics: ResolutionDiagnostics;
    debug?: { rawProviderData?: unknown; }; 
}

export interface SearchIdentity {
    readonly id: string;
    readonly originalQuery: string;
    readonly canonicalName: string;
    readonly category: EntityCategory;
    readonly entityType: EntityType;
    readonly entityProvenance: Provenance;
    readonly diagnostics: ClassificationDiagnostics;
}

export interface ResolvedSubject {
    identity: SearchIdentity;
    primaryLocation: GeographicRecord;
    additionalLocations?: GeographicRecord[]; 
}

export type RelationshipKind = "same_city" | "same_region" | "same_country" | "historically_related" | "adjacent_feature" | "custom";

export interface RelatedEntity { name: string; entityType: EntityType; relationship: RelationshipKind; customRelationship?: string; provenance: Provenance; }
export interface NewsArticle { title: string; url: string; source: string; publishedAt: string; snippet?: string; imageUrl?: string; provenance: Provenance; }
export interface ImageInfo { imageUrl: string; imageType: string; verified: boolean; provenance: Provenance; }
export interface PopulationInfo { value: number | null; status: 'available' | 'not_applicable' | 'lookup_failed' | 'pending'; provenance: Provenance; }
export interface ClimateInfo { value: string; description: string; provenance: Provenance; }

export interface EnrichmentResult {
    description?: { text: string; provenance: Provenance };
    image?: ImageInfo;
    climate?: ClimateInfo;
    population?: PopulationInfo;
    notable?: NotableItem[];
    news?: NewsArticle[];
    contextNotes?: { text: string; provenance: Provenance }[];
    status?: "loading" | "success" | "error";
    errorMessage?: string;
}

export type PipelinePhase = "classification" | "resolution" | "enrichment" | "presentation";
export type PipelineStatus = "pending" | "running" | "completed" | "failed";
export interface PipelineExecution {
    phase: PipelinePhase;
    status: PipelineStatus;
}

export interface ResolvedEntity {
    readonly id: string;
    readonly pipelineVersion: 2;
    readonly revision: number;
    readonly subject: DeepReadonly<ResolvedSubject>;
    readonly metadata: DeepReadonly<EnrichmentResult>;
}

export interface MetadataLoadState {
    description: boolean; 
    image: boolean; 
    climate: boolean; 
    population: boolean; 
    news: boolean;
}

export interface PresentationModel {
    title: string; 
    subtitle?: string;
    sections: { overview?: boolean; climate?: boolean; population?: boolean; notable?: boolean; news?: boolean; };
    loadState: MetadataLoadState; 
}

export function createMetadata(props: any): EnrichmentResult {
    return {
        description: props.description,
        image: props.image,
        climate: props.climate,
        population: props.population,
        notable: props.notable,
        news: props.news,
        contextNotes: props.contextNotes,
        ...props
    };
}

export function createResolvedEntity(subject: any, metadata: any, loc?: any): ResolvedEntity {
    return {
        id: subject?.identity?.canonicalName?.toLowerCase().replace(/\s+/g, '-') || 'unknown-entity',
        pipelineVersion: 2,
        revision: 1,
        subject,
        metadata: { ...metadata, waypoint: loc?.waypoint }
    };
}

export function adaptLocationInfoToResolvedEntity(loc: any): ResolvedEntity {
    if (!loc) return loc;
    if (loc.pipelineVersion === 2) return loc as ResolvedEntity;
    
    const meta = createMetadata({
        description: loc.description ? { text: loc.description, provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() } as any } : undefined,
        climate: loc.climate,
        population: loc.population,
        notable: loc.notable,
        news: loc.news,
        contextNotes: loc.contextNotes?.map((t: string) => ({text: t, provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() } as any})),
        significance: loc.significance,
        highlights: loc.highlights,
        status: loc.status,
        errorMessage: loc.errorMessage
    } as any);

    const subject = {
        identity: {
            canonicalName: loc.name,
            alternateNames: [],
            entityType: loc.type || "city",
            category: "geopolitical"
        },
        primaryLocation: {
            label: loc.name,
            location: {
                type: "Point",
                coordinates: loc.coordinates || {lat: 0, lng: 0}
            },
            boundaries: null,
            confidence: 1
        }
    };
    
    return createResolvedEntity(subject as any, meta, loc);
}
