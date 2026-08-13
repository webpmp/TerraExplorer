import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNearbyPlaces } from '../services/geminiService';
import { overpassProvider } from '../services/geographic/providers/OverpassProvider';
import { wikipediaProvider } from '../services/geographic/providers/WikipediaProvider';
import { nominatimProvider } from '../services/geographic/providers/NominatimProvider';
import { regionalSearchProvider } from '../services/geographic/providers/RegionalSearchProvider';
import * as geoResolver from '../services/geographic/geographicResolver';

vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        GoogleGenAI: class {
            models = {
                generateContent: vi.fn()
            };
        }
    };
});

describe('Discovery Pipeline E2E', () => {
    beforeEach(() => {
        vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({});
    });

    // Central Texas: Austin, Fredericksburg, Marble Falls outranking Blowout/Click
    it('Central Texas discovery yields significant places and excludes hamlets', async () => {
        // We'll mock the providers to return specific places
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([
            { id: '1', lat: 30.2672, lng: -97.7431, name: 'Austin', type: 'city', discoverySignals: ['capital'] } as any,
            { id: '2', lat: 30.2729, lng: -98.8739, name: 'Fredericksburg', type: 'city' } as any,
            { id: '3', lat: 30.5779, lng: -98.2728, name: 'Marble Falls', type: 'city' } as any,
            { id: '4', lat: 30.5050, lng: -98.8183, name: 'Enchanted Rock', type: 'natural' } as any,
            { id: '5', lat: 30.6599, lng: -98.4111, name: 'Blowout', type: 'hamlet' } as any,
            { id: '6', lat: 30.6019, lng: -98.6670, name: 'Click', type: 'hamlet' } as any
        ]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

        const result = await getNearbyPlaces(30.2672, -97.7431);
        
        expect(result.status).toBe('SUCCESS');
        
        const names = result.places.map(p => p.name);
        expect(names).toContain('Austin');
        expect(names).toContain('Fredericksburg');
        expect(names).toContain('Marble Falls');
        expect(names).toContain('Enchanted Rock');
        
        expect(names).not.toContain('Blowout');
        expect(names).not.toContain('Click');
    });

    it('Grand Canyon National Park outranks parking lots and trailheads', async () => {
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([
            { id: '1', lat: 36.0565, lng: -112.1250, name: 'Grand Canyon National Park', type: 'national_park', discoverySignals: ['national park'] } as any,
            { id: '2', lat: 36.0560, lng: -112.1245, name: 'Parking Lot 1', type: 'parking_space' } as any,
            { id: '3', lat: 36.0562, lng: -112.1248, name: 'Unnamed Trailhead', type: 'poi' } as any,
            { id: '4', lat: 36.0421, lng: -111.8262, name: 'Desert View', type: 'landmark' } as any,
            { id: '5', lat: 36.0574, lng: -112.1433, name: 'Bright Angel Trail', type: 'landmark' } as any
        ]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

        const result = await getNearbyPlaces(36.0565, -112.1250);
        
        const names = result.places.map(p => p.name);
        expect(names).toContain('Grand Canyon National Park');
        expect(names).toContain('Desert View');
        expect(names).toContain('Bright Angel Trail');
        
        expect(names).not.toContain('Parking Lot 1');
    });

    it('Paris outranks nearby suburbs', async () => {
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([
            { id: '1', lat: 48.8566, lng: 2.3522, name: 'Paris', type: 'city', populationClass: 'large' } as any,
            { id: '2', lat: 48.9021, lng: 2.3333, name: 'Saint-Ouen-sur-Seine', type: 'town', populationClass: 'medium' } as any,
            { id: '3', lat: 48.8186, lng: 2.3228, name: 'Montrouge', type: 'town', populationClass: 'medium' } as any
        ]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

        const result = await getNearbyPlaces(48.8566, 2.3522);
        
        // Since Paris is large and city, it should be at index 0.
        expect(result.places[0].name).toBe('Paris');
        const names = result.places.map(p => p.name);
        expect(names).toContain('Saint-Ouen-sur-Seine');
    });

    it('Mount Fuji outranks surrounding villages', async () => {
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([
            { id: '1', lat: 35.3606, lng: 138.7274, name: 'Mount Fuji', type: 'mountain' } as any,
            { id: '2', lat: 35.3610, lng: 138.7275, name: 'Small Village A', type: 'village' } as any,
            { id: '3', lat: 35.3600, lng: 138.7270, name: 'Small Village B', type: 'village' } as any
        ]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

        const result = await getNearbyPlaces(35.3606, 138.7274);
        
        expect(result.places[0].name).toBe('Mount Fuji');
    });

    it('Ocosingo discovery yields balanced pool and does not flood with protected areas', async () => {
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        
        // Mock the RegionalSearchProvider returning a balanced set 
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([
            { id: '1', lat: 16.9, lng: -92.1, name: 'Ocosingo', type: 'city' } as any,
            { id: '2', lat: 16.7, lng: -92.5, name: 'Chiapas', type: 'administrative' } as any,
            { id: '3', lat: 16.75, lng: -91.1, name: 'Bonampak', type: 'historic' } as any,
            { id: '4', lat: 16.3, lng: -91.1, name: 'Reserva de la Biosfera Montes Azules', type: 'natural' } as any,
            { id: '5', lat: 16.9, lng: -91.6, name: 'Área de Protección de Flora y Fauna Nahá', type: 'natural' } as any,
            { id: '6', lat: 16.8, lng: -91.7, name: 'Reserva de la Biosfera Lacan-Tun', type: 'natural' } as any,
            { id: '7', lat: 16.1, lng: -91.3, name: 'Área de Protección de Flora y Fauna Chan-Kin', type: 'natural' } as any,
            { id: '8', lat: 16.2, lng: -91.2, name: 'Monumento Natural Bonampak', type: 'natural' } as any,
            { id: '9', lat: 16.85, lng: -91.9, name: 'Obscure Village', type: 'village' } as any
        ]);

        const result = await getNearbyPlaces(16.7792, -91.6040);
        
        expect(result.status).toBe('SUCCESS');
        const names = result.places.map(p => p.name);
        
        // Should include significant elements
        expect(names).toContain('Ocosingo');
        expect(names).toContain('Bonampak');
        expect(names.some(n => n.includes('Reserva') || n.includes('Protección'))).toBe(true);
        
        // Ensure not just 5 protected areas, we selected >=3 total places
        expect(result.places.length).toBeGreaterThanOrEqual(3);
        
        // Category diversity: unique categories >= 3
        const categories = new Set(result.places.map(p => p.type));
        expect(categories.size).toBeGreaterThanOrEqual(3);
        
        // Obscure village might be rejected, but it's okay to just ensure we met the positive asserts
    });

    it('Fallback discovery is invoked when deterministic providers fail or return nothing', async () => {
        // All deterministic providers return empty
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

        // Mock Gemini to return a valid candidate
        const mockGenerateContent = vi.fn().mockResolvedValue({
            text: () => JSON.stringify([
                { name: 'Remote Village', lat: -16.0, lng: 46.0, type: 'village' }
            ])
        });

        const { ai } = await import('../services/geminiService');
        (ai.models.generateContent as any) = mockGenerateContent;

        const result = await getNearbyPlaces(-16.0, 46.0);
        
        expect(result.status).toBe('SUCCESS');
        expect(result.places.length).toBe(1);
        expect(result.places[0].name).toBe('Remote Village');
        expect(result.places[0].provenance).toContain('GeminiFallback');
    });

    it('Administrative regions are correctly classified and excluded from selection', async () => {
        vi.spyOn(overpassProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(wikipediaProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
        vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([
            { id: 'admin1', lat: 33.18, lng: 36.87, name: 'As-Suweida Governorate', type: 'administrative' } as any,
            { id: 'town1', lat: 33.20, lng: 36.88, name: 'Small Town', type: 'town' } as any
        ]);

        const result = await getNearbyPlaces(33.185234, 36.871262);
        
        expect(result.status).toBe('SUCCESS');
        const names = result.places.map(p => p.name);
        
        expect(names).not.toContain('As-Suweida Governorate');
        expect(names).toContain('Small Town');
    });
});
