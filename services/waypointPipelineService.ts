import { Waypoint, LocationInfo } from '../types';
import { CachedNarrationAudio, waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises } from './cacheService';
import { getWaypointStableId } from '../utils/routeSequenceUtils';
import { resolveCanonicalNarrative } from '../utils/narrativeResolver';
import { cleanNarrationText } from './narrationProviders';
import { getNarrationDescription, getNarrationTitle, narrationService } from './narrationService';

export type WaypointStage =
  | 'pending'
  | 'enriching'
  | 'topDescriptionReady'
  | 'enrichmentReady'
  | 'imagesLoading'
  | 'imagesReady'
  | 'narrationGenerating'
  | 'narrationReady'
  | 'playing'
  | 'complete'
  | 'error';

export interface WaypointLifecycleTimestamps {
  selected?: number;
  enrichmentStarted?: number;
  topDescriptionReady?: number;
  fullEnrichmentReady?: number;
  imageSearchStarted?: number;
  imagesReady?: number;
  narrationStarted?: number;
  narrationAudioReady?: number;
  narrationPlaybackStarted?: number;
  narrationPlaybackEnded?: number;
  preloadStatus?: 'cold' | 'partially_preloaded' | 'fully_preloaded';
}

export interface WaypointProcessingRecord {
  waypointId: string;
  stage: WaypointStage;
  locationInfo: LocationInfo | null;
  canonicalTitle: string;
  canonicalNarrative: string;
  cachedAudio: CachedNarrationAudio | null;
  images: any[];
  timestamps: WaypointLifecycleTimestamps;
  error?: string;
}

interface WaypointTimingState {
  activationTime: number;
  lastEventTime: number;
  name: string;
}

class WaypointPipelineRegistry {
  private records: Map<string, WaypointProcessingRecord> = new Map();
  private timingStates: Map<string, WaypointTimingState> = new Map();

  public getOrCreateRecord(waypointId: string): WaypointProcessingRecord {
    let record = this.records.get(waypointId);
    if (!record) {
      record = {
        waypointId,
        stage: 'pending',
        locationInfo: null,
        canonicalTitle: '',
        canonicalNarrative: '',
        cachedAudio: null,
        images: [],
        timestamps: {}
      };
      this.records.set(waypointId, record);
    }
    return record;
  }

  public getRecord(waypointId: string): WaypointProcessingRecord | undefined {
    return this.records.get(waypointId);
  }

  public setStage(waypointId: string, stage: WaypointStage): void {
    const record = this.getOrCreateRecord(waypointId);
    record.stage = stage;
    console.log(`[Waypoint Lifecycle] WAYPOINT_STAGE_CHANGE id="${waypointId}" stage="${stage}"`);
  }

  public recordTimestamp(waypointId: string, field: keyof WaypointLifecycleTimestamps, value: any = Date.now()): void {
    const record = this.getOrCreateRecord(waypointId);
    (record.timestamps as any)[field] = value;
  }

  public setWaypointActivated(waypointId: string, waypointName: string, timestamp: number = Date.now()): void {
    this.timingStates.set(waypointId, {
      activationTime: timestamp,
      lastEventTime: timestamp,
      name: waypointName || waypointId
    });
    this.recordTimestamp(waypointId, 'selected', timestamp);
    this.logTraceNarration(waypointId, waypointName, 'waypoint activated', undefined, timestamp);
  }

  public logTraceNarration(
    stableId: string,
    waypointName: string,
    event: string,
    details?: string,
    timestamp: number = Date.now()
  ): void {
    let timing = this.timingStates.get(stableId);
    if (!timing) {
      timing = {
        activationTime: timestamp,
        lastEventTime: timestamp,
        name: waypointName || stableId
      };
      this.timingStates.set(stableId, timing);
    }
    if (waypointName && (!timing.name || timing.name === stableId)) {
      timing.name = waypointName;
    }
    const displayName = waypointName || timing.name || stableId;
    const elapsedActivation = timestamp - timing.activationTime;
    const elapsedStep = timestamp - timing.lastEventTime;
    timing.lastEventTime = timestamp;

    const detailsSuffix = details ? ` | ${details}` : '';
    console.log(`[TRACE NARRATION] ${event} | id="${stableId}" (${displayName}) | +${elapsedActivation}ms (step +${elapsedStep}ms)${detailsSuffix}`);
  }

  public getTimingState(stableId: string): WaypointTimingState | undefined {
    return this.timingStates.get(stableId);
  }

  public logWaypointMilestones(waypointId: string, label?: string): void {
    const record = this.records.get(waypointId);
    if (!record) return;

    const ts = record.timestamps;
    const formatTime = (time?: number) => {
      if (!time) return 'N/A';
      const d = new Date(time);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      return `${hh}:${mm}:${ss}.${ms}`;
    };

    const header = label || `Waypoint ${waypointId}`;
    console.log(`\n[${header}]
selected: ${formatTime(ts.selected)}
enrichmentStarted: ${formatTime(ts.enrichmentStarted)}
topDescriptionReady: ${formatTime(ts.topDescriptionReady)}
enrichmentReady: ${formatTime(ts.fullEnrichmentReady)}
imageSearchStarted: ${formatTime(ts.imageSearchStarted)}
imagesReady: ${formatTime(ts.imagesReady)}
narrationStarted: ${formatTime(ts.narrationStarted)}
narrationAudioReady: ${formatTime(ts.narrationAudioReady)}
narrationPlaybackStarted: ${formatTime(ts.narrationPlaybackStarted)}
narrationPlaybackEnded: ${formatTime(ts.narrationPlaybackEnded)}
status: ${ts.preloadStatus || 'cold'}\n`);
  }

  public logScheduling(event: string, details?: string): void {
    const detailsSuffix = details ? ` | ${details}` : '';
    console.log(`[TRACE ROUTE] ${event}${detailsSuffix}`);
  }

  public logProviderStart(provider: 'LM Studio' | 'OrpheusTTS' | 'KokoroTTS', waypointName: string, id: string, details?: string): void {
    const detailsSuffix = details ? ` ${details}` : '';
    console.log(`[${provider}] START waypoint="${waypointName}" id="${id}"${detailsSuffix}`);
  }

  public logProviderComplete(provider: 'LM Studio' | 'OrpheusTTS' | 'KokoroTTS', waypointName: string, id: string, durationMs: number, details?: string): void {
    const detailsSuffix = details ? ` ${details}` : '';
    console.log(`[${provider}] COMPLETE waypoint="${waypointName}" id="${id}" duration=${durationMs}ms${detailsSuffix}`);
  }

  public clear(): void {
    this.records.clear();
    this.timingStates.clear();
  }
}

export const waypointPipelineRegistry = new WaypointPipelineRegistry();

export function logTraceNarration(
  stableId: string,
  waypointName: string,
  event: string,
  details?: string
): void {
  waypointPipelineRegistry.logTraceNarration(stableId, waypointName, event, details);
}

export function logRouteScheduling(event: string, details?: string): void {
  waypointPipelineRegistry.logScheduling(event, details);
}

export function logProviderStart(provider: 'LM Studio' | 'OrpheusTTS' | 'KokoroTTS', waypointName: string, id: string, details?: string): void {
  waypointPipelineRegistry.logProviderStart(provider, waypointName, id, details);
}

export function logProviderComplete(provider: 'LM Studio' | 'OrpheusTTS' | 'KokoroTTS', waypointName: string, id: string, durationMs: number, details?: string): void {
  waypointPipelineRegistry.logProviderComplete(provider, waypointName, id, durationMs, details);
}
