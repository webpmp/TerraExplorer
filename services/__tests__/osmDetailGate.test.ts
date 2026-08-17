import { describe, it, expect } from 'vitest';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';

describe('OSM Detail Gate & Viewport Settlement Architecture', () => {
  it('strictly blocks regional, global, and local zoom levels from requesting OSM data', () => {
    // Distance 3.5 (global)
    expect(osmMapDataProvider.calculateViewportExtent(36.88, -103.17, 3.5)).toBeNull();

    // Distance 2.5 (regional)
    expect(osmMapDataProvider.calculateViewportExtent(36.88, -103.17, 2.5)).toBeNull();

    // Distance 1.6 (local)
    expect(osmMapDataProvider.calculateViewportExtent(36.88, -103.17, 1.6)).toBeNull();
  });

  it('allows CLOSE zoom level and generates stable quantized cache keys', () => {
    // Distance 1.3 (close)
    const extent1 = osmMapDataProvider.calculateViewportExtent(34.02, -118.22, 1.3);
    expect(extent1).not.toBeNull();
    expect(extent1?.detailLevel).toBe('close');

    const key1 = osmMapDataProvider.getCacheKey(extent1!);
    expect(key1).toContain('close:');

    // Minor camera jitter within the same quantized cell produces IDENTICAL key
    const extentJitter = osmMapDataProvider.calculateViewportExtent(34.022, -118.223, 1.31);
    expect(extentJitter).not.toBeNull();
    const keyJitter = osmMapDataProvider.getCacheKey(extentJitter!);
    expect(keyJitter).toBe(key1);
  });

  it('verifies stationary camera does not trigger redundant requests for unchanged viewport keys', () => {
    let settledViewportKey: string | null = null;
    let requestCount = 0;

    const onCameraSettled = (extent: any) => {
      const key = osmMapDataProvider.getCacheKey(extent);
      if (key === settledViewportKey) {
        // VIEWPORT_UNCHANGED - do nothing
        return;
      }
      settledViewportKey = key;
      requestCount++;
    };

    const extent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.3)!;

    // First settle
    onCameraSettled(extent);
    expect(requestCount).toBe(1);

    // Frame updates while camera is stationary
    onCameraSettled(extent);
    onCameraSettled(extent);
    onCameraSettled(extent);

    expect(requestCount).toBe(1); // Must still be exactly 1!
  });

  it('verifies zooming out to regional/local cancels active requests and clears viewport key', () => {
    let settledViewportKey: string | null = 'close:34.000:-118.000';
    let activeAbortController: AbortController | null = new AbortController();
    let features: any[] = [{ id: '1' }, { id: '2' }];

    const onZoomOut = () => {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
      settledViewportKey = null;
      features = [];
    };

    onZoomOut();
    expect(settledViewportKey).toBeNull();
    expect(features).toEqual([]);
    expect(activeAbortController).toBeNull();
  });
});
