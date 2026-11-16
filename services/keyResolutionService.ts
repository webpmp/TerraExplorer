import { UserSettings } from '../types';

export type KeyName =
  | 'GEMINI_API_KEY'
  | 'VITE_CARTO_API_KEY'
  | 'VITE_NYT_API_KEY'
  | 'VITE_NEWS_API_KEY'
  | 'VITE_NEWS_DATA_API_KEY';

const isNonEmpty = (val: unknown): val is string => {
  return typeof val === 'string' && val.trim().length > 0;
};

/**
 * Single source of truth for resolving all five application API keys.
 *
 * Rules:
 * - Priority 1: User settings (passed object first, then localStorage 'terraExplorerSettings').
 *   Empty strings never shadow environment keys; only trimmed non-empty values are returned.
 * - Priority 2: Custom envGetter if supplied (used for dependency injection / tests).
 * - Priority 3: Static import.meta.env references (populated automatically by Vite from .env / .env.local).
 * - Priority 4: Process environment (process.env) for Node or test environments.
 */
export const resolveApiKey = (
  keyName: KeyName,
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  // 1. Check passed settings object
  if (settings) {
    let settingVal: string | undefined;
    switch (keyName) {
      case 'GEMINI_API_KEY':
        settingVal = settings.geminiApiKey;
        break;
      case 'VITE_CARTO_API_KEY':
        settingVal = settings.cartoApiKey;
        break;
      case 'VITE_NYT_API_KEY':
        settingVal = settings.nytApiKey;
        break;
      case 'VITE_NEWS_API_KEY':
        settingVal = settings.newsApiKey;
        break;
      case 'VITE_NEWS_DATA_API_KEY':
        settingVal = settings.newsDataApiKey;
        break;
    }
    if (isNonEmpty(settingVal)) {
      return settingVal.trim();
    }
  }

  // 2. Check localStorage if available and not found above
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      const saved = localStorage.getItem('terraExplorerSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        let storageVal: string | undefined;
        switch (keyName) {
          case 'GEMINI_API_KEY':
            storageVal = parsed.geminiApiKey;
            break;
          case 'VITE_CARTO_API_KEY':
            storageVal = parsed.cartoApiKey;
            break;
          case 'VITE_NYT_API_KEY':
            storageVal = parsed.nytApiKey;
            break;
          case 'VITE_NEWS_API_KEY':
            storageVal = parsed.newsApiKey;
            break;
          case 'VITE_NEWS_DATA_API_KEY':
            storageVal = parsed.newsDataApiKey;
            break;
        }
        if (isNonEmpty(storageVal)) {
          return storageVal.trim();
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  // 3. Check custom envGetter if supplied (e.g. tests)
  if (envGetter) {
    const customEnv = envGetter();
    if (customEnv) {
      if (keyName === 'GEMINI_API_KEY') {
        const val = customEnv.GEMINI_API_KEY || customEnv.API_KEY || customEnv.VITE_GEMINI_API_KEY;
        if (isNonEmpty(val)) return val.trim();
      } else {
        const val = customEnv[keyName];
        if (isNonEmpty(val)) return val.trim();
      }
    }
  }

  // 4. Static import.meta.env lookup (Required for Vite bundle static replacement)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    let metaVal: string | undefined;
    switch (keyName) {
      case 'GEMINI_API_KEY':
        metaVal = (import.meta.env as any).GEMINI_API_KEY || (import.meta.env as any).API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        break;
      case 'VITE_CARTO_API_KEY':
        metaVal = import.meta.env.VITE_CARTO_API_KEY;
        break;
      case 'VITE_NYT_API_KEY':
        metaVal = import.meta.env.VITE_NYT_API_KEY;
        break;
      case 'VITE_NEWS_API_KEY':
        metaVal = import.meta.env.VITE_NEWS_API_KEY;
        break;
      case 'VITE_NEWS_DATA_API_KEY':
        metaVal = import.meta.env.VITE_NEWS_DATA_API_KEY;
        break;
    }
    if (isNonEmpty(metaVal)) {
      return metaVal.trim();
    }
  }

  // 5. process.env fallback (for Node / Vitest environments or define replacements)
  if (typeof process !== 'undefined' && process.env) {
    let procVal: string | undefined;
    switch (keyName) {
      case 'GEMINI_API_KEY':
        procVal = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
        break;
      case 'VITE_CARTO_API_KEY':
        procVal = process.env.VITE_CARTO_API_KEY;
        break;
      case 'VITE_NYT_API_KEY':
        procVal = process.env.VITE_NYT_API_KEY;
        break;
      case 'VITE_NEWS_API_KEY':
        procVal = process.env.VITE_NEWS_API_KEY;
        break;
      case 'VITE_NEWS_DATA_API_KEY':
        procVal = process.env.VITE_NEWS_DATA_API_KEY;
        break;
    }
    if (isNonEmpty(procVal)) {
      return procVal.trim();
    }
  }

  return undefined;
};

// Convenience helpers delegating directly to resolveApiKey
export const getEffectiveGeminiKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveApiKey('GEMINI_API_KEY', settings, envGetter);
};

export const getCartoKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveApiKey('VITE_CARTO_API_KEY', settings, envGetter);
};

export const getNytKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveApiKey('VITE_NYT_API_KEY', settings, envGetter);
};

export const getNewsApiKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveApiKey('VITE_NEWS_API_KEY', settings, envGetter);
};

export const getNewsDataKey = (
  settings?: Partial<UserSettings>,
  envGetter?: () => Record<string, string | undefined>
): string | undefined => {
  return resolveApiKey('VITE_NEWS_DATA_API_KEY', settings, envGetter);
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
