import { describe, it, expect } from 'vitest';
import { mergeLocationInfo } from '../locationService';

describe('mergeLocationInfo', () => {
    it('preserves valid primaryImage when incoming is undefined', () => {
        const prev = { primaryImage: 'https://valid.com/image.jpg' };
        const next = { primaryImage: undefined };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/image.jpg');
    });

    it('preserves valid primaryImage when incoming is null', () => {
        const prev = { primaryImage: 'https://valid.com/image.jpg' };
        const next = { primaryImage: null };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/image.jpg');
    });

    it('preserves valid primaryImage when incoming is empty string', () => {
        const prev = { primaryImage: 'https://valid.com/image.jpg' };
        const next = { primaryImage: '' };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/image.jpg');
    });

    it('preserves valid primaryImage when incoming is placeholder', () => {
        const prev = { primaryImage: 'https://valid.com/image.jpg' };
        const next = { primaryImage: 'placeholder.jpg' };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/image.jpg');
    });

    it('accepts incoming primaryImage when existing is missing', () => {
        const prev = {};
        const next = { primaryImage: 'https://valid.com/new.jpg' };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/new.jpg');
    });

    it('accepts newer valid primaryImage over existing valid primaryImage', () => {
        const prev = { primaryImage: 'https://valid.com/old.jpg' };
        const next = { primaryImage: 'https://valid.com/new.jpg' };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.primaryImage).toBe('https://valid.com/new.jpg');
    });

    it('preserves notable array with images when incoming notable lacks images', () => {
        const prev = { notable: [{ name: 'Person A', image: 'https://valid.com/personA.jpg' }] };
        const next = { notable: [{ name: 'Person B' }] };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.notable).toEqual(prev.notable);
    });

    it('protects deterministic fields from AI overwrite', () => {
        const prev = {
            name: 'True Name',
            coordinates: { lat: 10, lng: 20 },
            country: 'True Country',
            population: { value: 100, status: 'available' }
        };
        const next = {
            name: 'AI Name',
            coordinates: { lat: 0, lng: 0 },
            country: 'AI Country',
            population: { value: 999, status: 'estimated' }
        };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.name).toBe('True Name');
        expect(merged.coordinates.lat).toBe(10);
        expect(merged.country).toBe('True Country');
        expect(merged.population.value).toBe(100);
    });

    it('protects deterministic fields from missing AI fallback', () => {
        const prev = { name: 'True Name' };
        const next = { name: undefined };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.name).toBe('True Name');
    });

    it('accepts AI fallback when deterministic field is missing', () => {
        const prev = { name: undefined, coordinates: undefined };
        const next = { name: 'AI Name', coordinates: { lat: 1, lng: 2 } };
        const merged = mergeLocationInfo(prev, next);
        expect(merged.name).toBe('AI Name');
        expect(merged.coordinates).toEqual({ lat: 1, lng: 2 });
    });
});
