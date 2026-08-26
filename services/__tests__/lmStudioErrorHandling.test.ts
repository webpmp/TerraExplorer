import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  generateContentWithRetry,
  getInfoFromFeature,
  LMStudioNoModelError,
  isLMStudioNoModelError
} from '../geminiService';
import { mergeLocationInfo } from '../locationService';
import InfoPanel from '../../components/InfoPanel';
import { LocationInfo, LocationType, MapMarker } from '../../types';

describe('LM Studio Missing Model Error Handling', () => {
  const originalFetch = global.fetch;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    // Mock userSettings in localStorage to select LM Studio
    const settings = {
      aiProvider: 'lmstudio',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      showNews: true
    };
    
    // Set localStorage mock
    const store: Record<string, string> = {
      terraExplorerSettings: JSON.stringify(settings)
    };
    
    global.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k in store) delete store[k]; },
      length: Object.keys(store).length,
      key: (i: number) => Object.keys(store)[i] || null
    } as unknown as Storage;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  it('1 & 2. Converts HTTP 400 "No models loaded" into LMStudioNoModelError', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    await expect(
      generateContentWithRetry({ contents: 'Test prompt' })
    ).rejects.toThrow(LMStudioNoModelError);

    try {
      await generateContentWithRetry({ contents: 'Test prompt' });
    } catch (err: any) {
      expect(isLMStudioNoModelError(err)).toBe(true);
      expect(err.name).toBe('LMStudioNoModelError');
      expect(err.message).toBe('No model loaded. Please load a model in LM Studio.');
      // Raw LM Studio internal details are NOT in the error message
      expect(err.message).not.toContain('developer page');
      expect(err.message).not.toContain('lms load');
    }
  });

  it('6. An unrelated LM Studio HTTP 400 error continues through the generic error path', async () => {
    const unrelatedError = "Invalid temperature parameter specified.";
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => unrelatedError
    } as unknown as Response);

    let caughtError: any = null;
    try {
      await generateContentWithRetry({ contents: 'Test prompt' });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(isLMStudioNoModelError(caughtError)).toBe(false);
    expect(caughtError.message).toContain('LM Studio request failed');
    expect(caughtError.message).toContain('Invalid temperature parameter');
  });

  it('7. A successful LM Studio request returns content and does not display an error', async () => {
    const mockSuccessResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: 'Burj Khalifa',
              description: 'Burj Khalifa is the tallest structure in the world, located in Dubai, United Arab Emirates.',
              notable: [{ title: 'Architecture', description: 'Stands at 828 meters.' }]
            })
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSuccessResponse
    } as unknown as Response);

    const result = await generateContentWithRetry({ contents: 'Enrich Burj Khalifa' });
    expect(result.text).toContain('Burj Khalifa');
  });

  it('Propagates LMStudioNoModelError through getInfoFromFeature with clean user-facing error fields', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    const marker: MapMarker = {
      id: 'test-burj',
      name: 'Burj Khalifa',
      lat: 25.1972,
      lng: 55.2744,
      populationClass: 'large'
    };

    const enriched = await getInfoFromFeature(marker);

    expect(enriched).toBeDefined();
    expect(enriched?.name).toBe('Burj Khalifa');
    expect(enriched?.errorType).toBe('LM_STUDIO_NO_MODEL');
    expect(enriched?.errorMessage).toBe('No model loaded. Please load a model in LM Studio.');
    expect(enriched?.errorInstruction).toBe('Load a model in LM Studio or select another provider in Settings.');

    // 5. Verify raw LM Studio details are not in the user-facing properties
    expect(enriched?.errorMessage).not.toContain('developer page');
    expect(enriched?.errorMessage).not.toContain('lms load');
    expect(enriched?.errorMessage).not.toContain('400');
    expect(enriched?.errorInstruction).not.toContain('developer page');
    expect(enriched?.errorInstruction).not.toContain('lms load');
  });

  it('3, 4 & 5. InfoPanel UI displays friendly error message and instruction, suppressing raw API details', () => {
    const locationWithMissingModel: LocationInfo = {
      name: 'Burj Khalifa',
      coordinates: { lat: 25.1972, lng: 55.2744 },
      type: LocationType.POI,
      entityType: 'point_of_interest',
      status: 'error',
      errorType: 'LM_STUDIO_NO_MODEL',
      errorMessage: 'No model loaded. Please load a model in LM Studio.',
      errorInstruction: 'Load a model in LM Studio or select another provider in Settings.',
      description: '',
      news: []
    };

    const markup = renderToStaticMarkup(
      React.createElement(InfoPanel, {
        info: locationWithMissingModel,
        isLoading: false,
        skin: 'modern',
        onClose: () => {}
      })
    );

    // 3. UI displays "No model loaded. Please load a model in LM Studio."
    expect(markup).toContain('No model loaded. Please load a model in LM Studio.');

    // 4. UI also instructs "Load a model in LM Studio or select another provider in Settings."
    expect(markup).toContain('Load a model in LM Studio or select another provider in Settings.');

    // Location identity is preserved (Burj Khalifa is visible)
    expect(markup).toContain('Burj Khalifa');

    // 5. Raw API implementation details are NOT displayed
    expect(markup).not.toContain('developer page');
    expect(markup).not.toContain('lms load');
    expect(markup).not.toContain('HTTP 400');
    expect(markup).not.toContain('Status: 400');
    expect(markup).not.toContain('http://localhost:1234');
  });

  it('8. Switching providers / receiving successful enrichment clears error state correctly in mergeLocationInfo', () => {
    const errorState: LocationInfo = {
      name: 'Burj Khalifa',
      coordinates: { lat: 25.1972, lng: 55.2744 },
      type: LocationType.POI,
      errorType: 'LM_STUDIO_NO_MODEL',
      errorMessage: 'No model loaded. Please load a model in LM Studio.',
      errorInstruction: 'Load a model in LM Studio or select another provider in Settings.',
      news: []
    };

    const successfulData: Partial<LocationInfo> = {
      name: 'Burj Khalifa',
      description: 'Burj Khalifa is a skyscraper in Dubai, United Arab Emirates.',
      notable: [{ title: 'World Record', description: 'Tallest building in the world.' } as any]
    };

    const merged = mergeLocationInfo(errorState, successfulData);

    expect(merged.description).toBe('Burj Khalifa is a skyscraper in Dubai, United Arab Emirates.');
    expect(merged.errorType).toBeUndefined();
    expect(merged.errorMessage).toBeUndefined();
    expect(merged.errorInstruction).toBeUndefined();
  });
});
