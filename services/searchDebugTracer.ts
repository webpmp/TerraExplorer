export type SearchDebugStatus =
  | 'ENTRY'
  | 'SUCCESS'
  | 'RETURN'
  | 'NO_RESULT'
  | 'NETWORK_START'
  | 'NETWORK_COMPLETE'
  | 'NETWORK_ERROR'
  | 'EXCEPTION'
  | 'VALIDATION_FAILED'
  | 'FINAL_RESULT'
  | 'CAMERA_TARGET_PREPARE'
  | 'CAMERA_NAVIGATION_CALLED'
  | 'CAMERA_NAVIGATION_COMPLETED'
  | 'FOLLOWUP_GENERATION_ENTRY'
  | 'FOLLOWUP_GENERATION_SUCCESS'
  | string;

export interface SearchDebugEvent {
  id: number;
  timestamp: string;
  stage: string;
  query?: string;
  entity?: string;
  intent?: string;
  provider?: string;
  status: SearchDebugStatus;
  category?: '1_VALID_LOCATION' | '2_NO_LOCATION' | '3_GEOCODER_NO_RESULT' | '4_NETWORK_FAILED' | '5_JS_EXCEPTION' | '6_UNEXPECTED_SHAPE';
  coordinates?: { lat: number; lng: number; source?: string };
  networkInfo?: {
    url: string;
    method?: string;
    status?: number;
    ok?: boolean;
    elapsedMs?: number;
    error?: string;
  };
  details?: Record<string, any>;
  errorMessage?: string;
  errorStack?: string;
}

let eventCounter = 0;
const debugHistory: SearchDebugEvent[] = [];
let lastEvent: SearchDebugEvent | null = null;
let activeListeners: Array<(event: SearchDebugEvent, allEvents: SearchDebugEvent[]) => void> = [];

export function subscribeSearchDebug(listener: (event: SearchDebugEvent, allEvents: SearchDebugEvent[]) => void): () => void {
  activeListeners.push(listener);
  return () => {
    activeListeners = activeListeners.filter(l => l !== listener);
  };
}

export function logTerraSearchDebug(event: Omit<SearchDebugEvent, 'id' | 'timestamp'>): SearchDebugEvent {
  const fullEvent: SearchDebugEvent = {
    ...event,
    id: ++eventCounter,
    timestamp: new Date().toISOString()
  };

  debugHistory.push(fullEvent);
  if (debugHistory.length > 100) {
    debugHistory.shift();
  }
  lastEvent = fullEvent;

  // Format rich console log
  const prefix = `[TERRA_SEARCH_DEBUG][${fullEvent.stage}][${fullEvent.status}]`;
  const infoParts: string[] = [];
  if (fullEvent.query) infoParts.push(`query="${fullEvent.query}"`);
  if (fullEvent.entity) infoParts.push(`entity="${fullEvent.entity}"`);
  if (fullEvent.intent) infoParts.push(`intent="${fullEvent.intent}"`);
  if (fullEvent.provider) infoParts.push(`provider="${fullEvent.provider}"`);
  if (fullEvent.coordinates) infoParts.push(`coords=${fullEvent.coordinates.lat},${fullEvent.coordinates.lng}`);
  if (fullEvent.category) infoParts.push(`category="${fullEvent.category}"`);
  if (fullEvent.networkInfo) {
    infoParts.push(`url="${fullEvent.networkInfo.url}" status=${fullEvent.networkInfo.status} elapsed=${fullEvent.networkInfo.elapsedMs}ms`);
  }
  if (fullEvent.errorMessage) infoParts.push(`ERROR="${fullEvent.errorMessage}"`);

  console.log(`${prefix} ${infoParts.join(' | ')}`, fullEvent.details || '');
  if (fullEvent.errorStack) {
    console.error(`[TERRA_SEARCH_DEBUG][EXCEPTION_STACK]`, fullEvent.errorStack);
  }

  // Also attach to window for iPad Safari Web Inspector inspection
  if (typeof window !== 'undefined') {
    (window as any).__TERRA_SEARCH_DEBUG_LAST__ = fullEvent;
    (window as any).__TERRA_SEARCH_DEBUG_HISTORY__ = debugHistory;
  }

  activeListeners.forEach(l => {
    try {
      l(fullEvent, debugHistory);
    } catch (err) {
      console.warn('[searchDebugTracer] listener error:', err);
    }
  });

  return fullEvent;
}

export function getSearchDebugHistory(): SearchDebugEvent[] {
  return [...debugHistory];
}

export function getLastSearchDebugEvent(): SearchDebugEvent | null {
  return lastEvent;
}

export function clearSearchDebugHistory(): void {
  debugHistory.length = 0;
  lastEvent = null;
}
