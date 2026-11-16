import { UserSettings, NewsProvider } from '../types';
import { getGeminiApiKey } from './geminiService';
import { detectLMStudioModels, testMapConnectionService } from '../components/SettingsPanel';

export type ServiceStatus = 'ready' | 'missing' | 'invalid' | 'unreachable' | 'no_model' | 'not_configured';

export interface SetupStatusState {
  ai: {
    status: ServiceStatus;
    provider: 'lmstudio' | 'gemini';
    detail?: string;
  };
  map: {
    status: ServiceStatus;
    detail?: string;
  };
  news: {
    status: ServiceStatus;
    provider: NewsProvider;
    detail?: string;
  };
}

export const getCartoKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  if (settings?.cartoApiKey && settings.cartoApiKey.trim()) {
    return settings.cartoApiKey.trim();
  }
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      const saved = localStorage.getItem('terraExplorerSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cartoApiKey && typeof parsed.cartoApiKey === 'string' && parsed.cartoApiKey.trim()) {
          return parsed.cartoApiKey.trim();
        }
      }
    } catch {
      // Ignore
    }
  }
  if (envGetter) {
    const customEnv = envGetter();
    return customEnv?.VITE_CARTO_API_KEY && customEnv.VITE_CARTO_API_KEY.trim()
      ? customEnv.VITE_CARTO_API_KEY.trim()
      : undefined;
  }
  const metaEnvKey =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_CARTO_API_KEY
      : undefined;
  if (metaEnvKey && typeof metaEnvKey === 'string' && metaEnvKey.trim()) {
    return metaEnvKey.trim();
  }
  const procEnvKey =
    typeof process !== 'undefined' && process.env
      ? process.env.VITE_CARTO_API_KEY
      : undefined;
  if (procEnvKey && typeof procEnvKey === 'string' && procEnvKey.trim()) {
    return procEnvKey.trim();
  }
  return undefined;
};

export const getEffectiveGeminiKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  if (settings?.geminiApiKey && settings.geminiApiKey.trim()) {
    return settings.geminiApiKey.trim();
  }
  const defaultGetEnv = () => typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as any) : (typeof process !== 'undefined' ? process.env : {});
  const env = (envGetter || defaultGetEnv)();
  if (envGetter) {
    return env?.GEMINI_API_KEY || env?.API_KEY || env?.VITE_GEMINI_API_KEY;
  }
  return env?.GEMINI_API_KEY || env?.API_KEY || env?.VITE_GEMINI_API_KEY || getGeminiApiKey();
};

export const evaluateSyncSetupStatus = (
  settings: UserSettings,
  lmStudioProbeResult?: { outcome: 'SUCCESS' | 'NO_MODELS' | 'ERROR'; message?: string },
  envGetter?: () => Record<string, string | undefined>
): SetupStatusState => {
  const defaultGetEnv = () => typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as any) : (typeof process !== 'undefined' ? process.env : {});
  const env = (envGetter || defaultGetEnv)();

  // 1. AI Provider Status
  let aiStatus: ServiceStatus = 'missing';
  let aiDetail = '';
  const effectiveProvider = settings.aiProvider || 'lmstudio';

  if (effectiveProvider === 'lmstudio') {
    if (lmStudioProbeResult) {
      if (lmStudioProbeResult.outcome === 'SUCCESS') {
        aiStatus = 'ready';
      } else if (lmStudioProbeResult.outcome === 'NO_MODELS') {
        aiStatus = 'no_model';
        aiDetail = lmStudioProbeResult.message || 'No model loaded in LM Studio';
      } else {
        aiStatus = 'unreachable';
        aiDetail = lmStudioProbeResult.message || 'Cannot reach LM Studio server';
      }
    } else {
      // Default initial optimistic/pending check
      aiStatus = 'missing';
    }
  } else {
    // Gemini provider
    const geminiKey = getEffectiveGeminiKey(settings, () => env);
    const hasGemini = Boolean(geminiKey && geminiKey.trim() && geminiKey.trim() !== 'dummy-key-for-ts-check');
    if (hasGemini) {
      aiStatus = 'ready';
    } else {
      aiStatus = 'missing';
      aiDetail = 'Gemini API key is not configured';
    }
  }

  // 2. Map Provider Status
  let mapStatus: ServiceStatus = 'missing';
  let mapDetail = '';
  const cartoKey = getCartoKey(settings, () => env);
  if (cartoKey && cartoKey.trim()) {
    mapStatus = 'ready';
  } else {
    mapStatus = 'missing';
    mapDetail = 'Carto API key is not configured';
  }

  // 3. News Provider Status (Optional)
  let newsStatus: ServiceStatus = 'not_configured';
  const nytKey = settings.nytApiKey || env?.VITE_NYT_API_KEY;
  const newsApiKey = settings.newsApiKey || env?.VITE_NEWS_API_KEY;
  const newsDataKey = settings.newsDataApiKey || env?.VITE_NEWS_DATA_API_KEY;

  if (settings.newsProvider === 'gemini') {
    const geminiKey = getEffectiveGeminiKey(settings, () => env);
    if (geminiKey && geminiKey.trim() && geminiKey.trim() !== 'dummy-key-for-ts-check') {
      newsStatus = 'ready';
    } else {
      newsStatus = 'not_configured';
    }
  } else if (settings.newsProvider === 'nyt') {
    newsStatus = nytKey && nytKey.trim() ? 'ready' : 'not_configured';
  } else if (settings.newsProvider === 'newsapi') {
    newsStatus = newsApiKey && newsApiKey.trim() ? 'ready' : 'not_configured';
  } else if (settings.newsProvider === 'newsdata') {
    newsStatus = newsDataKey && newsDataKey.trim() ? 'ready' : 'not_configured';
  } else {
    if ((nytKey && nytKey.trim()) || (newsApiKey && newsApiKey.trim()) || (newsDataKey && newsDataKey.trim())) {
      newsStatus = 'ready';
    } else {
      newsStatus = 'not_configured';
    }
  }

  return {
    ai: {
      status: aiStatus,
      provider: effectiveProvider,
      detail: aiDetail
    },
    map: {
      status: mapStatus,
      detail: mapDetail
    },
    news: {
      status: newsStatus,
      provider: settings.newsProvider || 'gemini'
    }
  };
};

export const isSetupRequiredMissing = (status: SetupStatusState): boolean => {
  return status.ai.status !== 'ready' || status.map.status !== 'ready';
};
