import { describe, it, expect } from 'vitest';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';

describe('OSM Expanded Zoom Depth Hierarchy Tests', () => {
  it('correctly maps camera distances to continuous detail levels', () => {
    expect(osmMapDataProvider.getDetailLevel(4.0)).toBe('global');
    expect(osmMapDataProvider.getDetailLevel(2.5)).toBe('regional');
    expect(osmMapDataProvider.getDetailLevel(1.6)).toBe('local');
    expect(osmMapDataProvider.getDetailLevel(1.35)).toBe('close');
    expect(osmMapDataProvider.getDetailLevel(1.15)).toBe('street');
    expect(osmMapDataProvider.getDetailLevel(1.05)).toBe('street_close');
  });

  it('enforces that calculateViewportExtent returns null for regional and local, but valid extents for close, street, and street_close', () => {
    // Regional and Local -> Gate CLOSED
    expect(osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 2.5)).toBeNull();
    expect(osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.6)).toBeNull();

    // Close -> Gate OPEN
    const closeExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.35);
    expect(closeExtent).not.toBeNull();
    expect(closeExtent?.detailLevel).toBe('close');

    // Street -> Gate OPEN
    const streetExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.15);
    expect(streetExtent).not.toBeNull();
    expect(streetExtent?.detailLevel).toBe('street');

    // Street Close -> Gate OPEN
    const streetCloseExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.05);
    expect(streetCloseExtent).not.toBeNull();
    expect(streetCloseExtent?.detailLevel).toBe('street_close');

    // Viewport hierarchy scaling: CLOSE > STREET > STREET_CLOSE
    const closeSpan = closeExtent!.maxLat - closeExtent!.minLat;
    const streetSpan = streetExtent!.maxLat - streetExtent!.minLat;
    const streetCloseSpan = streetCloseExtent!.maxLat - streetCloseExtent!.minLat;

    expect(closeSpan).toBeGreaterThan(streetSpan);
    expect(streetSpan).toBeGreaterThan(streetCloseSpan);
  });

  it('generates distinct quantized cache keys across zoom levels', () => {
    const closeExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.35)!;
    const streetExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.15)!;
    const streetCloseExtent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.05)!;

    const closeKey = osmMapDataProvider.getCacheKey(closeExtent);
    const streetKey = osmMapDataProvider.getCacheKey(streetExtent);
    const streetCloseKey = osmMapDataProvider.getCacheKey(streetCloseExtent);

    expect(closeKey).toContain('close:');
    expect(streetKey).toContain('street:');
    expect(streetCloseKey).toContain('street_close:');
    expect(closeKey).not.toBe(streetKey);
    expect(streetKey).not.toBe(streetCloseKey);
  });
});
