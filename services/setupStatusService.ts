import { UserSettings, NewsProvider } from '../types';
import {
  resolveApiKey,
  getCartoKey,
  getNytKey,
  getNewsApiKey,
  getNewsDataKey,
  hasAnyNewsKey,
  getEffectiveGeminiKey
} from './keyResolutionService';

export {
  resolveApiKey,
  getCartoKey,
  getNytKey,
  getNewsApiKey,
  getNewsDataKey,
  hasAnyNewsKey,
  getEffectiveGeminiKey
};

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

export const evaluateSyncSetupStatus = (
  settings: UserSettings,
  lmStudioProbeResult?: { outcome: 'SUCCESS' | 'NO_MODELS' | 'ERROR'; message?: string },
  envGetter?: () => Record<string, string | undefined>
): SetupStatusState => {

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
    const geminiKey = getEffectiveGeminiKey(settings, envGetter);
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
  const cartoKey = getCartoKey(settings, envGetter);
  if (cartoKey && cartoKey.trim()) {
    mapStatus = 'ready';
  } else {
    mapStatus = 'missing';
    mapDetail = 'Carto API key is not configured';
  }

  // 3. News Provider Status (Optional / Non-blocking)
  // Needs attention when no news key is configured, and ready once any one of the 3 providers has a key
  const hasNews = hasAnyNewsKey(settings, envGetter);
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
