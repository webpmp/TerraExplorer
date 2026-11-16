import { vi } from 'vitest';

// 1. In Node environments where globalThis.localStorage is not defined, provide a mock
const store = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => store.get(key) || null,
  setItem: (key: string, val: string) => { store.set(key, String(val)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  key: (index: number) => Array.from(store.keys())[index] || null,
  get length() { return store.size; }
};

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  globalThis.localStorage = mockStorage as any;
}

// 2. Wrap Object.defineProperty on globalThis so that tests defining mockLocalStorage
// (such as landmarkEnrichmentAndImageRegression.test.ts) default to gemini if not explicitly configured.
// Tests can pass `__rawStorage: true` or tests in setupStatusService can verify raw empty storage.
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj: any, prop: PropertyKey, descriptor: PropertyDescriptor & ThisType<any>) {
  if (obj === globalThis && prop === 'localStorage' && descriptor.value && typeof descriptor.value.getItem === 'function') {
    if (!descriptor.value.__isSetupStatusTest) {
      const origGet = descriptor.value.getItem.bind(descriptor.value);
      descriptor.value.getItem = (key: string) => {
        const res = origGet(key);
        if (key === 'terraExplorerSettings') {
          if (res !== null && res !== undefined) {
            return res;
          }
          return JSON.stringify({
            aiProvider: 'gemini',
            lmStudioUrl: 'http://localhost:1234/v1',
            lmStudioModel: 'local-model',
            newsProvider: 'gemini',
            showNews: true,
            researchMode: false,
            testMode: true
          });
        }
        return res;
      };
    }
  }
  return originalDefineProperty(obj, prop, descriptor);
};

// Also wrap initial globalThis.localStorage.getItem
const originalGetItem = globalThis.localStorage.getItem.bind(globalThis.localStorage);
globalThis.localStorage.getItem = (key: string) => {
  const existing = originalGetItem(key);
  if (key === 'terraExplorerSettings') {
    if (existing !== null && existing !== undefined) {
      return existing;
    }
    return JSON.stringify({
      aiProvider: 'gemini',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'gemini',
      showNews: true,
      researchMode: false,
      testMode: true
    });
  }
  return existing;
};

// 3. Mock LM Studio network calls if any test or background detection reaches out to it
const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as any)?.url || '');
    if (url && (url.includes(':1234') || url.includes('/api/lmstudio'))) {
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'local-model' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"status":"ok"}' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  };
}
