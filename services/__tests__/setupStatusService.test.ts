import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateSyncSetupStatus,
  isSetupRequiredMissing,
  getCartoKey,
  getNytKey,
  getNewsApiKey,
  getNewsDataKey,
  getEffectiveGeminiKey,
  resolveApiKey
} from '../../services/setupStatusService';
import { testMapConnectionService, testNewsConnectionService } from '../../components/SettingsPanel';
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
    vi.stubEnv('VITE_CARTO_API_KEY', '');
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('API_KEY', '');
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      (import.meta as any).env.VITE_CARTO_API_KEY = '';
      (import.meta as any).env.VITE_GEMINI_API_KEY = '';
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('2. Status computation for fresh install: AI missing/unreachable, Map missing, News missing', () => {
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
    expect(status.news.status).toBe('missing');
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

  it('6. News provider status: missing news key shows missing but does NOT mark required setup as missing, and any news key marks ready', () => {
    const settingsWithoutNews: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
      cartoApiKey: 'test-carto-key',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'nyt',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    const statusWithoutNews = evaluateSyncSetupStatus(settingsWithoutNews, undefined, () => ({}));
    expect(statusWithoutNews.ai.status).toBe('ready');
    expect(statusWithoutNews.map.status).toBe('ready');
    expect(statusWithoutNews.news.status).toBe('missing');
    // Crucial requirement: app is fully usable and required checklist is satisfied!
    expect(isSetupRequiredMissing(statusWithoutNews)).toBe(false);

    // Any one of the 3 news provider keys configured via settings marks news ready
    const settingsWithNyt: UserSettings = {
      ...settingsWithoutNews,
      nytApiKey: 'test-nyt-key'
    };
    expect(evaluateSyncSetupStatus(settingsWithNyt, undefined, () => ({})).news.status).toBe('ready');

    const settingsWithNewsApi: UserSettings = {
      ...settingsWithoutNews,
      newsApiKey: 'test-newsapi-key'
    };
    expect(evaluateSyncSetupStatus(settingsWithNewsApi, undefined, () => ({})).news.status).toBe('ready');

    const settingsWithNewsData: UserSettings = {
      ...settingsWithoutNews,
      newsDataApiKey: 'test-newsdata-key'
    };
    expect(evaluateSyncSetupStatus(settingsWithNewsData, undefined, () => ({})).news.status).toBe('ready');

    // Or via environment variable
    const statusWithEnvNews = evaluateSyncSetupStatus(settingsWithoutNews, undefined, () => ({
      VITE_NYT_API_KEY: 'env-nyt-key'
    }));
    expect(statusWithEnvNews.news.status).toBe('ready');
    expect(isSetupRequiredMissing(statusWithEnvNews)).toBe(false);
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

  it('8. Carto API key resolution: present only in env with empty saved settings marks map row READY', () => {
    // Empty settings
    const emptySettings: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
      cartoApiKey: '',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };

    // Ensure localStorage has no cartoApiKey
    storageMap.clear();

    // Key present only in process.env / custom envGetter
    const customEnv = { VITE_CARTO_API_KEY: 'env-carto-key-456' };
    const resolvedKey = getCartoKey(emptySettings, () => customEnv);
    expect(resolvedKey).toBe('env-carto-key-456');

    // Evaluate setup status with key in env only
    const status = evaluateSyncSetupStatus(emptySettings, undefined, () => customEnv);
    expect(status.map.status).toBe('ready');
    expect(isSetupRequiredMissing(status)).toBe(false);

    // Also test process.env fallback directly
    vi.stubEnv('VITE_CARTO_API_KEY', 'process-env-carto-key-789');
    const resolvedKeyFromProcessEnv = getCartoKey(emptySettings);
    expect(resolvedKeyFromProcessEnv).toBe('process-env-carto-key-789');

    const statusFromProcessEnv = evaluateSyncSetupStatus(emptySettings);
    expect(statusFromProcessEnv.map.status).toBe('ready');
  });

  it('9. Regression: vi.stubEnv on import.meta.env with EMPTY saved settings resolves all 5 keys and checks modal/settings agreement', async () => {
    // 1. Clear saved settings so localStorage is completely empty
    storageMap.clear();

    const emptySettings: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: '',
      cartoApiKey: '',
      nytApiKey: '',
      newsApiKey: '',
      newsDataApiKey: '',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini'
    };

    // Also verify empty string saved in settings does not shadow env
    const emptyStringSavedSettings: UserSettings = {
      aiProvider: 'gemini',
      geminiApiKey: '   ',
      cartoApiKey: '',
      nytApiKey: '',
      newsApiKey: '   ',
      newsDataApiKey: '',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'nyt'
    };

    // Stub import.meta.env for all 5 keys
    vi.stubEnv('VITE_CARTO_API_KEY', 'stub-carto-key');
    vi.stubEnv('VITE_NYT_API_KEY', 'stub-nyt-key');
    vi.stubEnv('VITE_NEWS_API_KEY', 'stub-newsapi-key');
    vi.stubEnv('VITE_NEWS_DATA_API_KEY', 'stub-newsdata-key');
    vi.stubEnv('GEMINI_API_KEY', 'stub-gemini-key');

    // A) Shared resolver returns each of the five keys with empty saved settings
    expect(resolveApiKey('GEMINI_API_KEY', emptySettings)).toBe('stub-gemini-key');
    expect(resolveApiKey('VITE_CARTO_API_KEY', emptySettings)).toBe('stub-carto-key');
    expect(resolveApiKey('VITE_NYT_API_KEY', emptySettings)).toBe('stub-nyt-key');
    expect(resolveApiKey('VITE_NEWS_API_KEY', emptySettings)).toBe('stub-newsapi-key');
    expect(resolveApiKey('VITE_NEWS_DATA_API_KEY', emptySettings)).toBe('stub-newsdata-key');

    // B) Empty-string saved key does NOT shadow the env key
    expect(resolveApiKey('GEMINI_API_KEY', emptyStringSavedSettings)).toBe('stub-gemini-key');
    expect(resolveApiKey('VITE_CARTO_API_KEY', emptyStringSavedSettings)).toBe('stub-carto-key');
    expect(resolveApiKey('VITE_NYT_API_KEY', emptyStringSavedSettings)).toBe('stub-nyt-key');
    expect(resolveApiKey('VITE_NEWS_API_KEY', emptyStringSavedSettings)).toBe('stub-newsapi-key');
    expect(resolveApiKey('VITE_NEWS_DATA_API_KEY', emptyStringSavedSettings)).toBe('stub-newsdata-key');

    // C) Map row is READY with Carto key only in env
    const statusWithEnvOnly = evaluateSyncSetupStatus(emptySettings);
    expect(statusWithEnvOnly.map.status).toBe('ready');

    // D) News row is READY with any single news key and NEEDS ATTENTION with none
    // All 3 present:
    expect(statusWithEnvOnly.news.status).toBe('ready');

    // Clear news env keys
    vi.stubEnv('VITE_NYT_API_KEY', '');
    vi.stubEnv('VITE_NEWS_API_KEY', '');
    vi.stubEnv('VITE_NEWS_DATA_API_KEY', '');
    const statusNoNews = evaluateSyncSetupStatus(emptySettings);
    expect(statusNoNews.news.status).toBe('missing');

    // With NYT only
    vi.stubEnv('VITE_NYT_API_KEY', 'nyt-only');
    expect(evaluateSyncSetupStatus(emptySettings).news.status).toBe('ready');
    vi.stubEnv('VITE_NYT_API_KEY', '');

    // With NewsAPI only
    vi.stubEnv('VITE_NEWS_API_KEY', 'newsapi-only');
    expect(evaluateSyncSetupStatus(emptySettings).news.status).toBe('ready');
    vi.stubEnv('VITE_NEWS_API_KEY', '');

    // With NewsData only
    vi.stubEnv('VITE_NEWS_DATA_API_KEY', 'newsdata-only');
    expect(evaluateSyncSetupStatus(emptySettings).news.status).toBe('ready');

    // E) The modal and the Settings test helper agree for each service
    // Restore all keys in env
    vi.stubEnv('VITE_CARTO_API_KEY', 'stub-carto-key');
    vi.stubEnv('VITE_NYT_API_KEY', 'stub-nyt-key');

    // Setup modal status:
    const finalModalStatus = evaluateSyncSetupStatus(emptySettings);
    expect(finalModalStatus.map.status).toBe('ready');
    expect(finalModalStatus.news.status).toBe('ready');

    // Settings test helpers:
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('cartocdn.com')) {
        return { ok: true, status: 200 } as any;
      }
      if (urlStr.includes('api.nytimes.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ response: { docs: [{ headline: { main: 'Test' } }] } })
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const mapTestResult = await testMapConnectionService('carto', 'modern');
    expect(mapTestResult.outcome).toBe('SUCCESS');

    const newsTestResult = await testNewsConnectionService('nyt', emptySettings);
    expect(newsTestResult.outcome).toBe('SUCCESS');

    fetchSpy.mockRestore();
  });
});
