import { describe, test, expect, vi } from 'vitest';
import * as geminiService from '../geminiService';
import { runSearchPipeline, FinalLocationResult } from '../pipeline';

describe('Historical Route Pipeline', () => {
  test('Silk Road Route Generation', async () => {
    vi.spyOn(geminiService, 'generateRoute').mockResolvedValue({
      title: "Silk Road",
      waypoints: [
        { id: '1', name: "Xi'an", lat: 34.3416, lng: 108.9398, role: 'primary' },
        { id: '2', name: "Samarkand", lat: 39.6542, lng: 66.9597, role: 'primary' },
        { id: '3', name: "Constantinople", lat: 41.0082, lng: 28.9784, role: 'primary' }
      ]
    });

    const result: FinalLocationResult = await runSearchPipeline({
        rawQuery: "Follow the Silk Road from China to Europe"
    });

    expect(result.mode).toBe("route");
    expect(result.waypoints).toBeDefined();
    expect(result.waypoints!.length).toBeGreaterThanOrEqual(3);

    const hasSilkRoadExactMatch = result.waypoints!.some(w => w.name.toLowerCase() === "silk road");
    expect(hasSilkRoadExactMatch).toBe(false);

    const hasNYCFallback = result.waypoints!.some(w => Math.abs(w.lat - 40.7128) < 0.01 && Math.abs(w.lng - -74.006) < 0.01);
    expect(hasNYCFallback).toBe(false);
  });
});
