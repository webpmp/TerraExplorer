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

export interface EnvVariableSpec {
  name: string;
  required: boolean;
  provider: 'ai' | 'map' | 'news';
  powers: string;
  notes?: string;
  exampleValue: string;
}

export const ENV_VARIABLES_SPEC: EnvVariableSpec[] = [
  {
    name: 'GEMINI_API_KEY',
    required: true,
    provider: 'ai',
    powers: 'Location descriptions, notable facts, and routes (fallback if not using local LM Studio).',
    notes: 'Recommended: LM Studio (local, free, runs at http://localhost:1234/v1, no key needed).',
    exampleValue: 'your_gemini_api_key'
  },
  {
    name: 'VITE_CARTO_API_KEY',
    required: true,
    provider: 'map',
    powers: 'Street-level and vector map tiles in Earth view.',
    notes: 'Get a key at https://carto.com/developers/basemap-styles/',
    exampleValue: 'your_carto_api_key'
  },
  {
    name: 'VITE_NYT_API_KEY',
    required: false,
    provider: 'news',
    powers: 'Contextual local news from New York Times.',
    notes: 'Get a key at https://developer.nytimes.com/get-started',
    exampleValue: 'your_nytimes_api_key'
  },
  {
    name: 'VITE_NEWS_API_KEY',
    required: false,
    provider: 'news',
    powers: 'Contextual local news from NewsAPI.org.',
    notes: 'Get a key at https://newsapi.org/',
    exampleValue: 'your_newsapi_org_key'
  },
  {
    name: 'VITE_NEWS_DATA_API_KEY',
    required: false,
    provider: 'news',
    powers: 'Contextual local news from NewsData.io.',
    notes: 'Get a key at https://newsdata.io/',
    exampleValue: 'your_newsdata_io_key'
  }
];

export const resolveKeyFromSources = (
  settingVal?: string,
  storageKey?: string,
  envVarName?: string,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  if (settingVal && settingVal.trim()) {
    return settingVal.trim();
  }
  if (storageKey && typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      const saved = localStorage.getItem('terraExplorerSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[storageKey] && typeof parsed[storageKey] === 'string' && parsed[storageKey].trim()) {
          return parsed[storageKey].trim();
        }
      }
    } catch {
      // Ignore
    }
  }
  if (envVarName) {
    if (envGetter) {
      const customEnv = envGetter();
      return customEnv?.[envVarName] && customEnv[envVarName]!.trim()
        ? customEnv[envVarName]!.trim()
        : undefined;
    }
    const metaEnvKey =
      typeof import.meta !== 'undefined' && import.meta.env
        ? (import.meta.env as any)[envVarName]
        : undefined;
    if (metaEnvKey && typeof metaEnvKey === 'string' && metaEnvKey.trim()) {
      return metaEnvKey.trim();
    }
    const procEnvKey =
      typeof process !== 'undefined' && process.env
        ? (process.env as any)[envVarName]
        : undefined;
    if (procEnvKey && typeof procEnvKey === 'string' && procEnvKey.trim()) {
      return procEnvKey.trim();
    }
  }
  return undefined;
};

export const getCartoKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveKeyFromSources(
    settings?.cartoApiKey,
    'cartoApiKey',
    'VITE_CARTO_API_KEY',
    envGetter
  );
};

export const getNytKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveKeyFromSources(
    settings?.nytApiKey,
    'nytApiKey',
    'VITE_NYT_API_KEY',
    envGetter
  );
};

export const getNewsApiKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveKeyFromSources(
    settings?.newsApiKey,
    'newsApiKey',
    'VITE_NEWS_API_KEY',
    envGetter
  );
};

export const getNewsDataKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveKeyFromSources(
    settings?.newsDataApiKey,
    'newsDataApiKey',
    'VITE_NEWS_DATA_API_KEY',
    envGetter
  );
};

export const hasAnyNewsKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): boolean => {
  return Boolean(
    getNytKey(settings, envGetter) ||
    getNewsApiKey(settings, envGetter) ||
    getNewsDataKey(settings, envGetter)
  );
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

  // 3. News Provider Status (Optional / Non-blocking)
  // Needs attention when no news key is configured, and ready once any one of the 3 providers has a key
  const hasNews = hasAnyNewsKey(settings, () => env);
  const newsStatus: ServiceStatus = hasNews ? 'ready' : 'missing';

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
