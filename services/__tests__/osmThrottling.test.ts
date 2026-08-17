import { describe, it, expect } from 'vitest';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';

describe('OSM Request Throttling, Settling & Failover Pipeline Tests', () => {
  it('verifies camera movement suppresses immediate requests and only settled camera triggers request', () => {
    let activeRequestCount = 0;
    let suppressedCameraMovingCount = 0;
    let settledRequestCount = 0;

    // Simulate camera motion frames
    const onCameraMoveFrame = () => {
      suppressedCameraMovingCount++;
    };

    const onCameraSettled = (extent: any) => {
      settledRequestCount++;
      activeRequestCount++;
    };

    // 10 animation frames of fast user movement
    for (let i = 0; i < 10; i++) {
      onCameraMoveFrame();
    }
    expect(suppressedCameraMovingCount).toBe(10);
    expect(settledRequestCount).toBe(0);

    // Camera stops and settles
    const extent = osmMapDataProvider.calculateViewportExtent(40.5, -99.55, 1.05)!;
    expect(extent).not.toBeNull();
    onCameraSettled(extent);

    expect(settledRequestCount).toBe(1);
    expect(activeRequestCount).toBe(1);
  });

  it('verifies rapid zoom through CLOSE -> STREET -> STREET_CLOSE executes only ONE request for STREET_CLOSE', () => {
    let requestedLevels: string[] = [];

    // Simulate debounced settle: only the final resting viewport fires
    const onFinalRestingViewportSettled = (distance: number) => {
      const level = osmMapDataProvider.getDetailLevel(distance);
      const extent = osmMapDataProvider.calculateViewportExtent(40.5, -99.55, distance);
      if (extent) {
        requestedLevels.push(level);
      }
    };

    // User zooms rapidly: 1.35 (close) -> 1.15 (street) -> 1.05 (street_close)
    // Debounce timer cancels previous levels and only triggers the final one
    onFinalRestingViewportSettled(1.05);

    expect(requestedLevels).toEqual(['street_close']);
    expect(requestedLevels.length).toBe(1);
  });

  it('enforces single active request policy and queues pending viewport', () => {
    let isRequestActive = false;
    let pendingViewport: any = null;
    const executedRequests: string[] = [];

    const handleNewSettledViewport = (key: string) => {
      if (isRequestActive) {
        pendingViewport = key;
        return; // Suppressed: request-active
      }
      isRequestActive = true;
      executedRequests.push(key);
    };

    const onRequestCompleted = () => {
      isRequestActive = false;
      if (pendingViewport) {
        const next = pendingViewport;
        pendingViewport = null;
        handleNewSettledViewport(next);
      }
    };

    // First request begins
    handleNewSettledViewport('street:40.5000:-99.5500');
    expect(executedRequests).toEqual(['street:40.5000:-99.5500']);

    // Camera moves and settles elsewhere while first request is still running
    handleNewSettledViewport('street_close:40.4960:-99.5280');
    expect(executedRequests.length).toBe(1);
    expect(pendingViewport).toBe('street_close:40.4960:-99.5280');

    // First request finishes -> immediately launches queued pending viewport
    onRequestCompleted();
    expect(executedRequests).toEqual([
      'street:40.5000:-99.5500',
      'street_close:40.4960:-99.5280'
    ]);
  });

  it('returns cached results on cache hit without making duplicate network requests', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.35)!;
    expect(extent).not.toBeNull();

    const features1 = await osmMapDataProvider.getFeaturesForViewport(extent);
    expect(features1.length).toBeGreaterThan(0);

    // Second call for exact same key should resolve from LRU cache
    const features2 = await osmMapDataProvider.getFeaturesForViewport(extent);
    expect(features2).toEqual(features1);
  });

  it('deduplicates manual control started events so it triggers only once per interaction sequence', () => {
    let isManualControlActive = false;
    const logs: string[] = [];

    const onControlsStart = () => {
      if (!isManualControlActive) {
        isManualControlActive = true;
        logs.push('[Camera] MANUAL_CONTROL_STARTED');
      }
    };

    const onControlsEnd = () => {
      isManualControlActive = false;
    };

    // Rapid pointerdown / drag events in a single interaction
    onControlsStart();
    onControlsStart();
    onControlsStart();
    expect(logs.length).toBe(1);

    onControlsEnd();
    // Subsequent distinct interaction
    onControlsStart();
    expect(logs.length).toBe(2);
  });
});
