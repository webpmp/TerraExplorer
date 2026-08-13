import { EntityType, ResolverResult } from '../types';
import { resolveGeographicEntity } from './geographic/geographicResolver';
import { recoverCoordinatesFromAi } from './geminiService';

export type ResolverStrategy = (query: string, canonicalName: string, subjectType: EntityType) => Promise<ResolverResult | null>;

const wrapGeographicResolver: ResolverStrategy = async (query, canonicalName, subjectType) => {
    console.log("[WRAP_INPUT]", JSON.stringify({ query, canonicalName, subjectType }, null, 2));
    const geoResult = await resolveGeographicEntity(canonicalName);
    console.log("[GEOGRAPHIC_RESOLVER_OUTPUT]", JSON.stringify(geoResult, null, 2));
    if (!geoResult || 'status' in geoResult) return null;

    // Map GeographicResolution to ResolverResult
    const result: ResolverResult = {
        strategy: 'GeographicResolver',
        confidence: geoResult.confidence || 0,
        subjectType,
        canonicalName,
        resolvedName: geoResult.name,
        displayName: canonicalName,
        coordinates: geoResult.coordinates,
        geographicSource: geoResult.source,
        originalEntityType: geoResult.entityType,
        suggestedZoom: geoResult.suggestedZoom,
        diagnostics: {
            nameSimilarity: 100, // Placeholder
            subjectCompatibility: 100, // Placeholder
            contextScore: 100, // Placeholder
            totalScore: (geoResult.confidence || 0) * 100
        }
    };
    console.log("[WRAP_OUTPUT]", JSON.stringify(result, null, 2));
    return result;
};

const wrapAiFallback = (strategyName: string): ResolverStrategy => {
    return async (query, canonicalName, subjectType) => {
        // AI Fallback resolver
        const coords = await recoverCoordinatesFromAi(query, 'specific_location', canonicalName);
        if (!coords) return null;

        return {
            strategy: strategyName,
            confidence: 0.9,
            subjectType,
            canonicalName,
            resolvedName: canonicalName,
            displayName: canonicalName,
            coordinates: coords,
            metadataMode: 'point_of_interest',
            diagnostics: {
                nameSimilarity: 100,
                subjectCompatibility: 100,
                contextScore: 100,
                totalScore: 90
            }
        };
    };
};

export const GeographicResolver = wrapGeographicResolver;
export const HistoricalLocationResolver = wrapAiFallback('HistoricalLocationResolver');
export const HistoricalObjectResolver = wrapAiFallback('HistoricalObjectResolver');
export const HistoricalEventResolver = wrapAiFallback('HistoricalEventResolver');
export const BiographyResolver = wrapAiFallback('BiographyResolver');
export const OrganizationResolver = wrapAiFallback('OrganizationResolver');
export const HistoricalRegionResolver = wrapAiFallback('HistoricalRegionResolver');
export const RouteResolver = wrapAiFallback('RouteResolver');

export const getResolverForSubject = (subjectType: EntityType): ResolverStrategy => {
    switch (subjectType) {
        case 'city':
        case 'town':
        case 'village':
        case 'country':
        case 'continent':
        case 'ocean':
        case 'sea':
        case 'lake':
        case 'river':
        case 'mountain':
        case 'volcano':
        case 'desert':
        case 'island':
        case 'archipelago':
        case 'administrative_region':
        case 'natural_feature':
        case 'building':
        case 'monument':
        case 'landmark':
        case 'bridge':
        case 'archaeological_site':
            return GeographicResolver;
        case 'ship':
        case 'shipwreck':
        case 'artifact':
            return HistoricalObjectResolver;
        case 'historical_event':
        case 'battle':
            return HistoricalEventResolver;
        case 'historical_person':
            return BiographyResolver;
        case 'organization':
        case 'civilization':
            return OrganizationResolver;
        case 'historical_region':
            return HistoricalRegionResolver;
        case 'route':
            return RouteResolver;
        default:
            return GeographicResolver;
    }
};
