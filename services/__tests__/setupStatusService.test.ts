import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateSyncSetupStatus,
  isSetupRequiredMissing,
  getCartoKey,
  getEffectiveGeminiKey
} from '../../services/setupStatusService';
import { getUserSettings, getGeminiApiKey } from '../../services/geminiService';
import { UserSettings } from '../../types';

describe('Setup Status Model & First-Run Experience Tests', () => {
  const originalEnv = { ...process.env };
  const originalImportMetaEnv = typeof import.meta !== 'undefined' ? { ...(import.meta as any).env } : {};
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map();
    vi.stubGlobal('localStorage', {
      __isSetupStatusTest: true,
      getItem: (key: string) => storageMap.get(key) || null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear()
    });
    delete process.env.API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
    delete process.env.VITE_CARTO_API_KEY;
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      delete (import.meta as any).env.VITE_CARTO_API_KEY;
      delete (import.meta as any).env.VITE_GEMINI_API_KEY;
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      (import.meta as any).env = { ...originalImportMetaEnv };
    }
    vi.restoreAllMocks();
  });

  it('1. Fresh clone defaults: aiProvider defaults to "lmstudio" without overriding existing saved user settings', () => {
    // Fresh clone: no localStorage
    storageMap.clear();
    const defaults = getUserSettings();
    expect(defaults.aiProvider).toBe('lmstudio');
    expect(defaults.lmStudioUrl).toBe('http://localhost:1234/v1');

    // Existing user who saved gemini in the past
    storageMap.set('terraExplorerSettings', JSON.stringify({
      aiProvider: 'gemini',
      lmStudioUrl: 'http://localhost:1234/v1',
      newsProvider: 'nyt'
    }));
    const existing = getUserSettings();
    expect(existing.aiProvider).toBe('gemini');
    expect(existing.newsProvider).toBe('nyt');
  });

  it('2. Status computation for fresh install: AI missing/unreachable, Map missing, News not_configured', () => {
    const settings: UserSettings = {
      aiProvider: 'lmstudio',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const status = evaluateSyncSetupStatus(settings, {
      outcome: 'ERROR',
      message: 'Failed to connect to LM Studio'
    }, () => ({}));

    expect(status.ai.status).toBe('unreachable');
    expect(status.map.status).toBe('missing');
    expect(status.news.status).toBe('not_configured');
    expect(isSetupRequiredMissing(status)).toBe(true);
  });

  it('3. Status computation when LM Studio server is running but has no model loaded', () => {
    const settings: UserSettings = {
      aiProvider: 'lmstudio',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const status = evaluateSyncSetupStatus(settings, {
      outcome: 'NO_MODELS',
      message: 'No models found at endpoint'
    });

    expect(status.ai.status).toBe('no_model');
    expect(isSetupRequiredMissing(status)).toBe(true);
  });

  it('4. Status computation when LM Studio has a loaded model: AI ready', () => {
    const settings: UserSettings = {
      aiProvider: 'lmstudio',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const status = evaluateSyncSetupStatus(settings, {
      outcome: 'SUCCESS',
      message: 'Detected 1 model'
    });

    expect(status.ai.status).toBe('ready');
  });

  it('5. Status computation when Carto API key is provided in settings or env', () => {
    const settingsWithKey: UserSettings = {
      aiProvider: 'lmstudio',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: '',
      cartoApiKey: 'test-carto-key'
    };

    const status = evaluateSyncSetupStatus(settingsWithKey, { outcome: 'SUCCESS' });
    expect(status.map.status).toBe('ready');
    expect(status.ai.status).toBe('ready');
    expect(isSetupRequiredMissing(status)).toBe(false);
  });

  it('6. News provider status: optional news missing does NOT mark required setup as missing', () => {
    const settings: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
      cartoApiKey: 'test-carto-key',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'nyt', // but no nyt key
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const status = evaluateSyncSetupStatus(settings, undefined, () => ({}));
    expect(status.ai.status).toBe('ready');
    expect(status.map.status).toBe('ready');
    expect(status.news.status).toBe('not_configured');
    // Crucial requirement: app is fully usable and required checklist is satisfied!
    expect(isSetupRequiredMissing(status)).toBe(false);
  });

  it('7. Keys precedence: settings storage first, then environment', () => {
    const mockEnv = { GEMINI_API_KEY: 'env-gemini-key' };
    const settingsWithCustomGemini: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: 'settings-gemini-key',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const effectiveGemini = getEffectiveGeminiKey(settingsWithCustomGemini, () => mockEnv);
    expect(effectiveGemini).toBe('settings-gemini-key');

    // Without settings key, falls back to env
    const effectiveFromEnv = getEffectiveGeminiKey({ ...settingsWithCustomGemini, geminiApiKey: '' }, () => mockEnv);
    expect(effectiveFromEnv).toBe('env-gemini-key');
  });
});
