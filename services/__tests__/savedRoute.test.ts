import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveGeographicMetadata } from '../geographic/geographicResolver';
import { getInfoFromFeature } from '../geminiService';
import { MapMarker } from '../../types';

// Mock dependencies
vi.mock('../geographic/geographicResolver', () => ({
    resolveGeographicMetadata: vi.fn(async (marker) => ({
        ...marker,
        country: 'South Georgia and the South Sandwich Islands',
        osmId: 'node/123',
        population: { value: 20, status: 'available' },
        metadataMode: 'natural_feature' // Just for mocking
    }))
}));

vi.mock('../geminiService', () => ({
    getInfoFromFeature: vi.fn(async (geoMarker) => ({
        ...geoMarker,
        description: 'A historic whaling station.',
        climate: 'Cold polar/subpolar maritime',
        notable: [{ name: 'Shackleton Grave' }],
        news: []
    })),
    getDeterministicImageSearchTerm: vi.fn()
}));

describe('Saved Route Identity and Enrichment Pipeline', () => {
    const grytvikenWaypoint = {
        id: 'grytviken-wp',
        name: 'Grytviken',
        lat: -54.2811,
        lng: -36.5092,
        type: 'historical_waypoint',
        description: 'Shackleton grave site.'
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('processes a Saved Route waypoint deterministically and enriches it', async () => {
        const markerAnchor: MapMarker = {
            id: grytvikenWaypoint.id,
            name: grytvikenWaypoint.name,
            lat: grytvikenWaypoint.lat,
            lng: grytvikenWaypoint.lng,
            type: grytvikenWaypoint.type,
            populationClass: 'small'
        };

        // 1. Enters deterministic geographic identity resolution
        const geoMarker = await resolveGeographicMetadata(markerAnchor);
        
        // 2. Retains original waypoint coordinates and name
        expect(geoMarker.name).toBe('Grytviken');
        expect(geoMarker.lat).toBe(-54.2811);
        expect(geoMarker.lng).toBe(-36.5092);

        // 3. Receives correct geographic identity
        expect(geoMarker.country).toBe('South Georgia and the South Sandwich Islands');
        expect(geoMarker.osmId).toBe('node/123');

        // 4. Reaches the exact same enrichment pipeline
        const enrichedData = await getInfoFromFeature(geoMarker);
        
        // 5. Receives all fields available to a globe-selected entity
        expect(enrichedData.description).toBe('A historic whaling station.');
        expect(enrichedData.climate).toBe('Cold polar/subpolar maritime');
        expect(enrichedData.notable?.length).toBe(1);
        expect(enrichedData.population?.value).toBe(20);
        
        // Ensures the LLM gets the deterministic context!
        expect(getInfoFromFeature).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Grytviken',
                country: 'South Georgia and the South Sandwich Islands'
            })
        );
    });
});
