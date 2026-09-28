import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  generateContentWithRetry,
  getInfoFromFeature,
  generateRoute,
  isGeminiConfigured,
  ai,
  LMStudioNoModelError,
  isLMStudioNoModelError,
  LM_STUDIO_NO_MODEL_MESSAGE,
  LM_STUDIO_NO_MODEL_INSTRUCTION
} from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { mergeLocationInfo } from '../locationService';
import InfoPanel from '../../components/InfoPanel';
import Controls from '../../components/Controls';
import { LocationInfo, LocationType, MapMarker, SkinType } from '../../types';

describe('LM Studio Missing Model Error Handling & Gemini Fallback', () => {
  const originalFetch = global.fetch;
  const originalLocalStorage = global.localStorage;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env for each test
    delete process.env.API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;

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
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1 & 2. When Gemini is not configured, converts HTTP 400 "No models loaded" into LMStudioNoModelError', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    const warnSpy = vi.spyOn(console, 'warn');

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

    expect(warnSpy).toHaveBeenCalledWith('[AI Provider] LM Studio has no loaded model');
    expect(warnSpy).toHaveBeenCalledWith('[AI Provider] No fallback provider available');
  });

  it('2b. isLMStudioNoModelError reliably detects error instances, errorTypes, error names, and message strings', () => {
    expect(isLMStudioNoModelError(new LMStudioNoModelError())).toBe(true);
    expect(isLMStudioNoModelError({ isLMStudioNoModelError: true })).toBe(true);
    expect(isLMStudioNoModelError({ name: 'LMStudioNoModelError' })).toBe(true);
    expect(isLMStudioNoModelError({ errorType: 'LM_STUDIO_NO_MODEL' })).toBe(true);
    expect(isLMStudioNoModelError({ error: 'LM_STUDIO_NO_MODEL' })).toBe(true);
    expect(isLMStudioNoModelError(new Error("No model loaded. Please load a model in LM Studio."))).toBe(true);
    expect(isLMStudioNoModelError(new Error("No models loaded. Please load a model."))).toBe(true);
    expect(isLMStudioNoModelError(new Error("No AI model is currently loaded. Please load a model and try again."))).toBe(true);
    expect(isLMStudioNoModelError("LMStudioNoModelError: No model loaded")).toBe(true);

    // Should return false for unrelated errors
    expect(isLMStudioNoModelError(new Error("Network timeout"))).toBe(false);
    expect(isLMStudioNoModelError(new Error("Unable to resolve location."))).toBe(false);
    expect(isLMStudioNoModelError(null)).toBe(false);
    expect(isLMStudioNoModelError(undefined)).toBe(false);
  });

  it('3. When LM Studio is selected in Settings, does NOT silently fall back to Gemini even if Gemini API key exists', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    expect(isGeminiConfigured()).toBe(true);

    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    const generateContentSpy = vi.spyOn(ai.models, 'generateContent');
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');

    await expect(
      generateContentWithRetry({ contents: 'Trace Cherokee Trail of Tears' })
    ).rejects.toThrow(LMStudioNoModelError);

    expect(generateContentSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[AI Provider] LM Studio generation started');
    expect(warnSpy).toHaveBeenCalledWith('[AI Provider] LM Studio has no loaded model');
    expect(warnSpy).toHaveBeenCalledWith('[AI Provider] No fallback provider available');
  });

  it('3b. TRACE ROUTE respects LM Studio settings and passes configured model to LM Studio endpoint', async () => {
    const mockSuccessResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Shackleton Expedition',
              route: [
                { id: 'wp-1', name: 'South Georgia', lat: -54.4296, lng: -36.5879, sequence: 1 }
              ]
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

    const generateContentSpy = vi.spyOn(ai.models, 'generateContent');
    const logSpy = vi.spyOn(console, 'log');

    const result = await generateRoute('Custom Antarctic Journey');

    expect(generateContentSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Route Generation] Using configured AI provider: LM Studio (model: local-model)'));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('4. generateRoute re-throws LMStudioNoModelError when LM Studio has no model loaded, preventing empty route swallowing', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    await expect(
      generateRoute('Non-canonical Custom Expedition')
    ).rejects.toThrow(LMStudioNoModelError);
  });

  it('5. runSearchPipeline catches LMStudioNoModelError and returns error: "LM_STUDIO_NO_MODEL" for route queries', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    const pipelineResult = await runSearchPipeline({
      rawQuery: 'Route from Paris to Rome',
      selectedLocation: null
    });

    expect(pipelineResult.mode).toBe('route');
    expect(pipelineResult.isValid).toBe(false);
    expect((pipelineResult as any).error).toBe('LM_STUDIO_NO_MODEL');
    expect(pipelineResult.waypoints).toEqual([]);
  });

  it('5b. runSearchPipeline returns error: "LM_STUDIO_NO_MODEL" for location queries when no model is loaded', async () => {
    const rawLMStudioError = "No models loaded. Please load a model in the developer page or use the 'lms load' command.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => rawLMStudioError
    } as unknown as Response);

    const pipelineResult = await runSearchPipeline({
      rawQuery: 'Fictional Unlisted Point XYZ',
      selectedLocation: null
    });

    expect(pipelineResult.isValid).toBe(false);
    expect((pipelineResult as any).error).toBe('LM_STUDIO_NO_MODEL');
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

  it('Propagates LMStudioNoModelError through getInfoFromFeature with clean user-facing error fields when no fallback', async () => {
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
    expect(enriched?.errorMessage).toBe(LM_STUDIO_NO_MODEL_MESSAGE);
    expect(enriched?.errorInstruction).toBe(LM_STUDIO_NO_MODEL_INSTRUCTION);

    // Verify raw LM Studio details are not in the user-facing properties
    expect(enriched?.errorMessage).not.toContain('developer page');
    expect(enriched?.errorMessage).not.toContain('lms load');
    expect(enriched?.errorMessage).not.toContain('400');
    expect(enriched?.errorInstruction).not.toContain('developer page');
    expect(enriched?.errorInstruction).not.toContain('lms load');
  });

  it('InfoPanel UI displays friendly error message and separate parenthetical guidance, suppressing raw API details', () => {
    const locationWithMissingModel: LocationInfo = {
      name: 'Burj Khalifa',
      coordinates: { lat: 25.1972, lng: 55.2744 },
      type: LocationType.POI,
      entityType: 'point_of_interest',
      status: 'error',
      errorType: 'LM_STUDIO_NO_MODEL',
      errorMessage: LM_STUDIO_NO_MODEL_MESSAGE,
      errorInstruction: LM_STUDIO_NO_MODEL_INSTRUCTION,
      description: '',
      news: []
    };

    const onOpenSettingsTab = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(InfoPanel, {
        info: locationWithMissingModel,
        isLoading: false,
        skin: 'modern',
        onClose: () => {},
        onOpenSettingsTab
      })
    );

    // UI displays primary error message
    expect(markup).toContain('No AI model is currently loaded. Please load a model and try again.');

    // UI displays separate parenthetical guidance
    expect(markup).toContain('Settings &gt; Providers');
    expect(markup).toContain('(');
    expect(markup).toContain(')');

    // Location identity is preserved (Burj Khalifa is visible)
    expect(markup).toContain('Burj Khalifa');

    // Raw API implementation details are NOT displayed
    expect(markup).not.toContain('developer page');
    expect(markup).not.toContain('lms load');
    expect(markup).not.toContain('HTTP 400');
    expect(markup).not.toContain('Status: 400');
    expect(markup).not.toContain('http://localhost:1234');
  });

  it('Controls UI displays friendly search error with separate parenthetical guidance for LM Studio no-model failure', () => {
    const errorString = `${LM_STUDIO_NO_MODEL_MESSAGE} ${LM_STUDIO_NO_MODEL_INSTRUCTION}`;
    const onOpenSettingsTab = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(Controls, {
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onSearch: vi.fn(),
        onTraceRoute: vi.fn(),
        isSearching: false,
        searchError: errorString,
        onClearError: vi.fn(),
        skin: 'modern' as SkinType,
        showFavorites: false,
        onToggleShowFavorites: vi.fn(),
        paused: false,
        isTraceModalOpen: false,
        onToggleTraceModal: vi.fn(),
        isZoomLocked: false,
        onToggleZoomLock: vi.fn(),
        onOpenSettingsTab
      })
    );

    // Primary message
    expect(markup).toContain('No AI model is currently loaded. Please load a model and try again.');
    // Parenthetical guidance
    expect(markup).toContain('Settings &gt; Providers');
    expect(markup).toContain('(');
    expect(markup).toContain(')');
  });

  it('Switching providers / receiving successful enrichment clears error state correctly in mergeLocationInfo', () => {
    const errorState: LocationInfo = {
      name: 'Burj Khalifa',
      coordinates: { lat: 25.1972, lng: 55.2744 },
      type: LocationType.POI,
      errorType: 'LM_STUDIO_NO_MODEL',
      errorMessage: LM_STUDIO_NO_MODEL_MESSAGE,
      errorInstruction: LM_STUDIO_NO_MODEL_INSTRUCTION,
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

  it('Omits response_format: { type: "json_object" } from LM Studio requests to prevent HTTP 400 rejection', async () => {
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Lewis and Clark Expedition',
                  waypoints: []
                })
              }
            }
          ]
        })
      } as unknown as Response;
    });

    await generateContentWithRetry({
      contents: 'Generate structured JSON route data',
      config: { responseMimeType: 'application/json' }
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.model).toBe('local-model');
    // Crucial check: response_format must be omitted to prevent LM Studio 400 Bad Request
    expect(capturedBody.response_format).toBeUndefined();
  });
});
