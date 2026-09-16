import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import * as geminiService from '../geminiService';

describe('Search and Globe-Click Cancellation Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('runSearchPipeline aborts immediately if AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runSearchPipeline({
      rawQuery: 'Tokyo',
      signal: controller.signal
    });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ABORTED');
  });

  test('runSearchPipeline respects signal aborted mid-flight during AI recovery', async () => {
    const controller = new AbortController();

    vi.spyOn(geminiService, 'resolveLocationQuery').mockImplementation(async () => {
      // simulate delay then abort
      controller.abort();
      return {
        locationInfo: { name: 'Nonexistent Location' } as any,
        suggestedZoom: 5,
        aiUsed: true,
        error: 'NO_GEOGRAPHIC_DATA'
      };
    });

    const result = await runSearchPipeline({
      rawQuery: 'Nonexistent Location',
      signal: controller.signal
    });

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ABORTED');
  });

  test('generateRoute stops and returns empty waypoints when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await geminiService.generateRoute('Tokyo to Kyoto', undefined, controller.signal);
    expect(result.waypoints).toEqual([]);
  });

  test('getNearbyPlaces returns empty places when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await geminiService.getNearbyPlaces(35.6762, 139.6503, 50, controller.signal);
    expect(result.places).toEqual([]);
    expect(result.status).toBe('NO_RESULTS');
  });

  test('generateContentWithRetry throws AbortError when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      geminiService.generateContentWithRetry({ contents: 'hello' }, 3, controller.signal)
    ).rejects.toThrow();
  });
});
