import { describe, test, expect } from 'vitest';
import { normalizeCoordinates } from '../geminiService';

describe('normalizeCoordinates', () => {
  const expected = { lat: 39.9042, lng: 32.8736 };

  test('Format A: { lat, lng }', () => {
    expect(normalizeCoordinates({ lat: 39.9042, lng: 32.8736 })).toEqual(expected);
  });

  test('Format B: { latitude, longitude }', () => {
    expect(normalizeCoordinates({ latitude: 39.9042, longitude: 32.8736 })).toEqual(expected);
  });

  test('Format C: [lat, lng]', () => {
    expect(normalizeCoordinates([39.9042, 32.8736])).toEqual(expected);
  });

  test('Format D: { coordinates: [lat, lng] }', () => {
    expect(normalizeCoordinates({ coordinates: [39.9042, 32.8736] })).toEqual(expected);
  });

  test('Format D nested: { coordinates: { latitude, longitude } }', () => {
    expect(normalizeCoordinates({ coordinates: { latitude: 39.9042, longitude: 32.8736 } })).toEqual(expected);
  });

  test('Invalid inputs', () => {
    expect(normalizeCoordinates(null)).toBeUndefined();
    expect(normalizeCoordinates({})).toBeUndefined();
    expect(normalizeCoordinates({ lat: '39' } as any)).toBeUndefined();
    expect(normalizeCoordinates({ lat: 0, lng: 0 })).toBeUndefined();
    expect(normalizeCoordinates({ lat: 100, lng: 100 })).toBeUndefined();
  });

  test('Coordinate swapping regressions', () => {
    expect(normalizeCoordinates({ lat: -112.064857, lng: 36.094481 })).toEqual({ lat: 36.094481, lng: -112.064857 });
    expect(normalizeCoordinates({ lat: 31.5590, lng: 35.4732 })).toEqual({ lat: 31.5590, lng: 35.4732 });
    expect(normalizeCoordinates({ lat: 48.8566, lng: 2.3522 })).toEqual({ lat: 48.8566, lng: 2.3522 });
  });
});
