/**
 * OSM & Transition Performance Telemetry Service
 *
 * Lightweight, non-rendering performance collector for:
 * 1. OSM Transition Timeline (activation, fog, tile request/load/visible, ready)
 * 2. Tile Request & Processing Telemetry (counts, durations, timing buckets, slow samples)
 * 3. Frame Rate Monitoring (before OSM, fog transition, OSM loading, settle, frames > 33/50/100ms)
 * 4. Fog/Smoke Performance & Camera Animation overlap
 * 5. WebGL / Device / Browser Telemetry (GPU renderer, memory, viewport, DPR, cores)
 *
 * Designed to zero-overhead track metrics via mutable refs / singleton state without triggering React renders.
 */

import { isMobileOrTablet } from '../utils/device';

export interface OSMTelemetryTimeline {
  perfStartTime: number; // reference epoch ms
  osmPerfStart: number | null; // +ms
  fogBegin: number | null;
  osmActivation: number | null;
  firstTileRequest: number | null;
  firstTileLoaded: number | null;
  firstTileVisible: number | null;
  fogEnd: number | null;
  osmReady: number | null;
  osmLoadingComplete: number | null;
  userPerceivedOSMTransitionMs: number | null;
}

export interface OSMTileTelemetry {
  provider: string;
  urlPattern: string;
  tileDimensions: string;
  zoomLevel: number | null;
  minZoom: number;
  maxZoom: number;
  initialViewportRequested: number;
  actuallyVisible: number;
  outsideViewportEstimated: number;
  multipleZoomsSimultaneous: boolean;
  prefetched: boolean;
  duplicateRequests: number;
  disposedCount: number;

  totalRequested: number;
  queued: number;
  started: number;
  activeInFlight: number;
  maxObservedActiveCount: number;
  completed: number;
  failed: number;
  cancelled: number;
  rendered: number;

  sources: {
    maplibreVector: number;
    rasterService: number;
    rasterImg: number;
    viewportCalc: number;
  };

  firstRequestTime: number | null;
  firstSuccessTime: number | null;
  lastSuccessTime: number | null;
  totalDurationMs: number | null;
  averageDurationMs: number | null;
  slowestDurationMs: number | null;

  bucketUnder1s: number;
  bucket1to3s: number;
  bucket3to5s: number;
  bucket5to10s: number;
  bucketOver10s: number;

  slowestSamples: Array<{ url: string; durationMs: number; status: string; source?: string }>;
}

export interface FrameRateTelemetry {
  fpsBeforeOSM: number | null;
  fpsFogTransition: number | null;
  fpsOSMLoading: number | null;
  fpsAfterOSM: number | null;
  minFPS: number | null;
  avgFPSTransition: number | null;
  maxFrameTimeMs: number | null;
  framesOver33ms: number;
  framesOver50ms: number;
  framesOver100ms: number;
}

export interface FogCameraTelemetry {
  fogStart: number | null;
  fogEnd: number | null;
  fpsBeforeFog: number | null;
  fpsFogOnly: number | null;
  fpsFogAndOSM: number | null;
  fpsAfterFog: number | null;

  cameraNavStart: number | null;
  cameraNavEnd: number | null;
  cameraActiveDuringOSMBegin: boolean;
  cameraOverlapsFogOSM: boolean;
}

export interface DeviceGPUInfo {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  userAgent: string;
  platform: string;
  isMobileOrTablet: boolean;
  transitionMode: 'desktop-fog' | 'mobile-direct';
  hardwareConcurrency: number | string;
  deviceMemory: number | string;
  webGLRenderer: string;
  webGLVendor: string;
  activeTextures?: number | string;
  renderedTileMeshes?: number | string;
  gpuMemoryStatus?: string;
}

export interface OSMPerfSnapshot {
  timeline: OSMTelemetryTimeline;
  tiles: OSMTileTelemetry;
  frames: FrameRateTelemetry;
  fogCamera: FogCameraTelemetry;
  device: DeviceGPUInfo;
  isActive: boolean;
  lastUpdated: number;
}

class OSMTelemetryManager {
  private snapshot: OSMPerfSnapshot;
  private listeners: Array<(snapshot: OSMPerfSnapshot) => void> = [];

  // Frame monitoring mutable tracking
  private frameTimestamps: number[] = [];
  private currentStage: 'BEFORE_OSM' | 'FOG_ONLY' | 'FOG_AND_OSM' | 'OSM_LOADING' | 'AFTER_OSM' | 'IDLE' = 'IDLE';
  private stageFrames: Record<string, number[]> = {
    BEFORE_OSM: [],
    FOG_ONLY: [],
    FOG_AND_OSM: [],
    OSM_LOADING: [],
    AFTER_OSM: []
  };

  private tileRequestStartTimes = new Map<string, number>();
  private tileDurations: number[] = [];
  private seenTileKeys = new Set<string>();

  constructor() {
    this.snapshot = this.createInitialSnapshot();
    this.populateDeviceInfo();
  }

  private createInitialSnapshot(): OSMPerfSnapshot {
    return {
      timeline: {
        perfStartTime: 0,
        osmPerfStart: null,
        fogBegin: null,
        osmActivation: null,
        firstTileRequest: null,
        firstTileLoaded: null,
        firstTileVisible: null,
        fogEnd: null,
        osmReady: null,
        osmLoadingComplete: null,
        userPerceivedOSMTransitionMs: null
      },
      tiles: {
        provider: 'CartoDB Voyager / Dark Matter (MapLibre & Raster fallback)',
        urlPattern: 'https://{s}.basemaps.cartocdn.com/.../{z}/{x}/{y}.png',
        tileDimensions: '256x256',
        zoomLevel: null,
        minZoom: 12,
        maxZoom: 19,
        initialViewportRequested: 0,
        actuallyVisible: 0,
        outsideViewportEstimated: 0,
        multipleZoomsSimultaneous: false,
        prefetched: false,
        duplicateRequests: 0,
        disposedCount: 0,

        totalRequested: 0,
        queued: 0,
        started: 0,
        activeInFlight: 0,
        maxObservedActiveCount: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        rendered: 0,

        sources: {
          maplibreVector: 0,
          rasterService: 0,
          rasterImg: 0,
          viewportCalc: 0
        },

        firstRequestTime: null,
        firstSuccessTime: null,
        lastSuccessTime: null,
        totalDurationMs: null,
        averageDurationMs: null,
        slowestDurationMs: null,

        bucketUnder1s: 0,
        bucket1to3s: 0,
        bucket3to5s: 0,
        bucket5to10s: 0,
        bucketOver10s: 0,

        slowestSamples: []
      },
      frames: {
        fpsBeforeOSM: null,
        fpsFogTransition: null,
        fpsOSMLoading: null,
        fpsAfterOSM: null,
        minFPS: null,
        avgFPSTransition: null,
        maxFrameTimeMs: null,
        framesOver33ms: 0,
        framesOver50ms: 0,
        framesOver100ms: 0
      },
      fogCamera: {
        fogStart: null,
        fogEnd: null,
        fpsBeforeFog: null,
        fpsFogOnly: null,
        fpsFogAndOSM: null,
        fpsAfterFog: null,

        cameraNavStart: null,
        cameraNavEnd: null,
        cameraActiveDuringOSMBegin: false,
        cameraOverlapsFogOSM: false
      },
      device: {
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 768,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        platform: typeof navigator !== 'undefined' ? (navigator as any).platform || 'unknown' : 'unknown',
        isMobileOrTablet: isMobileOrTablet(),
        transitionMode: isMobileOrTablet() ? 'mobile-direct' : 'desktop-fog',
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 'N/A' : 'N/A',
        deviceMemory: typeof navigator !== 'undefined' ? (navigator as any).deviceMemory || 'N/A' : 'N/A',
        webGLRenderer: 'Detecting...',
        webGLVendor: 'Detecting...',
        gpuMemoryStatus: 'Safari/WebKit does not expose exact GPU memory directly'
      },
      isActive: false,
      lastUpdated: Date.now()
    };
  }

  private populateDeviceInfo() {
    if (typeof window === 'undefined') return;

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          this.snapshot.device.webGLRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Generic WebGL';
          this.snapshot.device.webGLVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Generic Vendor';
        } else {
          this.snapshot.device.webGLRenderer = (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).RENDERER) || 'WebGL Default';
          this.snapshot.device.webGLVendor = (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VENDOR) || 'WebGL Default';
        }
      } else {
        this.snapshot.device.webGLRenderer = 'No WebGL Context';
      }
    } catch (_) {
      this.snapshot.device.webGLRenderer = 'Unavailable';
    }
  }

  public subscribe(listener: (snapshot: OSMPerfSnapshot) => void): () => void {
    this.listeners.push(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.snapshot.lastUpdated = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (_) {}
    }
    if (typeof window !== 'undefined') {
      (window as any).__TERRA_OSM_PERF_SNAPSHOT__ = this.snapshot;
    }
  }

  public getSnapshot(): OSMPerfSnapshot {
    return { ...this.snapshot };
  }

  public startSession(reason: string = 'OSM_PERF_START') {
    const now = Date.now();
    this.snapshot.isActive = true;
    this.snapshot.timeline.perfStartTime = now;
    this.snapshot.timeline.osmPerfStart = 0;
    this.currentStage = 'BEFORE_OSM';

    // Clear frame tracking
    this.frameTimestamps = [];
    Object.keys(this.stageFrames).forEach((k) => (this.stageFrames[k] = []));
    this.tileRequestStartTimes.clear();
    this.tileDurations = [];
    this.seenTileKeys.clear();

    console.log(`[OSM PERF TELEMETRY] Session started: reason=${reason}`);
    this.notify();
  }

  public recordTimelineEvent(
    event:
      | 'fogBegin'
      | 'osmActivation'
      | 'firstTileRequest'
      | 'firstTileLoaded'
      | 'firstTileVisible'
      | 'fogEnd'
      | 'osmReady'
      | 'osmLoadingComplete'
      | 'userPerceivedOSMTransitionMs'
  ) {
    if (!this.snapshot.timeline.perfStartTime) {
      this.startSession('AUTO_INIT');
    }

    // If on mobile/tablet, completely ignore fogBegin and fogEnd events (since fog is bypassed)
    if (isMobileOrTablet() && (event === 'fogBegin' || event === 'fogEnd')) {
      return;
    }

    const elapsed = Date.now() - this.snapshot.timeline.perfStartTime;
    if (this.snapshot.timeline[event] === null) {
      this.snapshot.timeline[event] = elapsed;
      console.log(`[OSM PERF TIMELINE] ${event} +${elapsed}ms`);

      // On mobile/tablet where fog is bypassed, when osmReady or osmLoadingComplete occurs,
      // record userPerceivedOSMTransitionMs immediately as OSM is ready and interactive
      if (
        isMobileOrTablet() &&
        (event === 'osmReady' || event === 'osmLoadingComplete') &&
        this.snapshot.timeline.userPerceivedOSMTransitionMs === null
      ) {
        this.snapshot.timeline.userPerceivedOSMTransitionMs = elapsed;
        console.log(`[OSM PERF TIMELINE] userPerceivedOSMTransitionMs (Mobile/iPad direct OSM) +${elapsed}ms`);
      }

      this.notify();
    }
  }

  public setStage(stage: 'BEFORE_OSM' | 'FOG_ONLY' | 'FOG_AND_OSM' | 'OSM_LOADING' | 'AFTER_OSM' | 'IDLE') {
    this.currentStage = stage;
  }

  /**
   * Lightweight frame time recorder called in RAF or useFrame.
   * Zero allocations, zero React re-renders.
   */
  public recordFrame(deltaSeconds: number) {
    const frameTimeMs = deltaSeconds * 1000;
    if (frameTimeMs <= 0 || frameTimeMs > 2000) return;

    if (this.currentStage !== 'IDLE') {
      const arr = this.stageFrames[this.currentStage];
      if (arr) {
        arr.push(frameTimeMs);
        if (arr.length > 300) arr.shift();
      }
    }

    if (frameTimeMs > 33.3) this.snapshot.frames.framesOver33ms++;
    if (frameTimeMs > 50) this.snapshot.frames.framesOver50ms++;
    if (frameTimeMs > 100) this.snapshot.frames.framesOver100ms++;

    if (this.snapshot.frames.maxFrameTimeMs === null || frameTimeMs > this.snapshot.frames.maxFrameTimeMs) {
      this.snapshot.frames.maxFrameTimeMs = Math.round(frameTimeMs);
    }

    const fps = Math.min(120, Math.max(1, 1000 / frameTimeMs));
    if (this.snapshot.frames.minFPS === null || fps < this.snapshot.frames.minFPS) {
      this.snapshot.frames.minFPS = Math.round(fps);
    }

    this.recalculateFPS();
  }

  private recalculateFPS() {
    const calcAvgFPS = (times: number[]) => {
      if (times.length === 0) return null;
      const sum = times.reduce((a, b) => a + b, 0);
      const avgMs = sum / times.length;
      return Math.round(1000 / avgMs);
    };

    this.snapshot.frames.fpsBeforeOSM = calcAvgFPS(this.stageFrames.BEFORE_OSM);
    this.snapshot.frames.fpsFogTransition = calcAvgFPS(this.stageFrames.FOG_ONLY);
    this.snapshot.frames.fpsOSMLoading = calcAvgFPS(this.stageFrames.OSM_LOADING);
    this.snapshot.frames.fpsAfterOSM = calcAvgFPS(this.stageFrames.AFTER_OSM);

    this.snapshot.fogCamera.fpsBeforeFog = this.snapshot.frames.fpsBeforeOSM;
    this.snapshot.fogCamera.fpsFogOnly = calcAvgFPS(this.stageFrames.FOG_ONLY);
    this.snapshot.fogCamera.fpsFogAndOSM = calcAvgFPS(this.stageFrames.FOG_AND_OSM);
    this.snapshot.fogCamera.fpsAfterFog = this.snapshot.frames.fpsAfterOSM;

    // Combined transition FPS
    const allTransitionTimes = [
      ...this.stageFrames.FOG_ONLY,
      ...this.stageFrames.FOG_AND_OSM,
      ...this.stageFrames.OSM_LOADING
    ];
    this.snapshot.frames.avgFPSTransition = calcAvgFPS(allTransitionTimes);
  }

  // --- Tile Loading Telemetry ---
  public recordTileQueued(
    key: string,
    url: string,
    source: 'maplibreVector' | 'rasterService' | 'rasterImg' | 'viewportCalc' = 'rasterService'
  ) {
    if (!this.snapshot.timeline.perfStartTime) {
      this.startSession('TILE_INIT');
    }
    this.snapshot.tiles.queued++;
    this.snapshot.tiles.totalRequested++;
    this.snapshot.tiles.sources[source]++;
    this.notify();
  }

  public recordTileStarted(
    key: string,
    url: string,
    z: number,
    source: 'maplibreVector' | 'rasterService' | 'rasterImg' | 'viewportCalc' = 'rasterService'
  ) {
    if (!this.snapshot.timeline.perfStartTime) {
      this.startSession('TILE_INIT');
    }
    const now = Date.now();
    const elapsed = now - this.snapshot.timeline.perfStartTime;

    if (this.seenTileKeys.has(key)) {
      this.snapshot.tiles.duplicateRequests++;
    } else {
      this.seenTileKeys.add(key);
    }

    if (this.snapshot.tiles.queued > 0) {
      this.snapshot.tiles.queued--;
    } else {
      this.snapshot.tiles.totalRequested++;
    }

    this.snapshot.tiles.started++;
    this.snapshot.tiles.activeInFlight++;
    if (this.snapshot.tiles.activeInFlight > this.snapshot.tiles.maxObservedActiveCount) {
      this.snapshot.tiles.maxObservedActiveCount = this.snapshot.tiles.activeInFlight;
    }
    this.snapshot.tiles.sources[source]++;
    this.snapshot.tiles.zoomLevel = z;
    this.tileRequestStartTimes.set(key, now);

    if (this.snapshot.tiles.firstRequestTime === null) {
      this.snapshot.tiles.firstRequestTime = elapsed;
      this.recordTimelineEvent('firstTileRequest');
    }

    this.notify();
  }

  public recordTileRequested(key: string, url: string, z: number) {
    this.recordTileStarted(key, url, z, 'rasterService');
  }

  public recordTileLoaded(
    key: string,
    url: string,
    status: 'SUCCESS' | 'ERROR' | 'ABORT' = 'SUCCESS',
    source: 'maplibreVector' | 'rasterService' | 'rasterImg' | 'viewportCalc' = 'rasterService'
  ) {
    const now = Date.now();
    const startTime = this.tileRequestStartTimes.get(key) || now;
    const duration = now - startTime;
    this.tileRequestStartTimes.delete(key);

    this.snapshot.tiles.activeInFlight = Math.max(0, this.snapshot.tiles.activeInFlight - 1);

    if (status === 'SUCCESS') {
      this.snapshot.tiles.completed++;
      this.snapshot.tiles.rendered++;
      this.tileDurations.push(duration);

      const elapsed = this.snapshot.timeline.perfStartTime ? now - this.snapshot.timeline.perfStartTime : duration;
      if (this.snapshot.tiles.firstSuccessTime === null) {
        this.snapshot.tiles.firstSuccessTime = elapsed;
        this.recordTimelineEvent('firstTileLoaded');
        this.recordTimelineEvent('firstTileVisible');
      }
      this.snapshot.tiles.lastSuccessTime = elapsed;

      // Bucketing
      if (duration < 1000) this.snapshot.tiles.bucketUnder1s++;
      else if (duration < 3000) this.snapshot.tiles.bucket1to3s++;
      else if (duration < 5000) this.snapshot.tiles.bucket3to5s++;
      else if (duration < 10000) this.snapshot.tiles.bucket5to10s++;
      else this.snapshot.tiles.bucketOver10s++;

      // Stats
      if (this.snapshot.tiles.slowestDurationMs === null || duration > this.snapshot.tiles.slowestDurationMs) {
        this.snapshot.tiles.slowestDurationMs = duration;
      }
      const sum = this.tileDurations.reduce((a, b) => a + b, 0);
      this.snapshot.tiles.averageDurationMs = Math.round(sum / this.tileDurations.length);
      this.snapshot.tiles.totalDurationMs = sum;

      if (duration > 1500) {
        if (this.snapshot.tiles.slowestSamples.length < 5) {
          this.snapshot.tiles.slowestSamples.push({ url, durationMs: duration, status, source });
        }
      }
    } else if (status === 'ERROR') {
      this.snapshot.tiles.failed++;
    } else if (status === 'ABORT') {
      this.snapshot.tiles.cancelled++;
    }

    this.notify();
  }

  public recordMapIdle() {
    this.snapshot.tiles.activeInFlight = 0;
    this.snapshot.tiles.queued = 0;
    this.recordTimelineEvent('osmLoadingComplete');
    this.notify();
  }

  public recordTileDisposed() {
    this.snapshot.tiles.disposedCount++;
  }

  public recordTileSetVolume(info: {
    initialViewportRequested: number;
    actuallyVisible: number;
    outsideViewportEstimated: number;
    multipleZoomsSimultaneous: boolean;
    prefetched: boolean;
  }) {
    this.snapshot.tiles.initialViewportRequested = info.initialViewportRequested;
    this.snapshot.tiles.actuallyVisible = info.actuallyVisible;
    this.snapshot.tiles.outsideViewportEstimated = info.outsideViewportEstimated;
    this.snapshot.tiles.multipleZoomsSimultaneous = info.multipleZoomsSimultaneous;
    this.snapshot.tiles.prefetched = info.prefetched;
    this.notify();
  }

  // --- Camera & Fog Lifecycle Telemetry ---
  public recordCameraNav(action: 'START' | 'END') {
    const now = Date.now();
    if (action === 'START') {
      this.snapshot.fogCamera.cameraNavStart = now;
    } else {
      this.snapshot.fogCamera.cameraNavEnd = now;
    }
  }

  public recordFogPhase(phase: number, opacity: number) {
    if (phase > 0 && this.snapshot.fogCamera.fogStart === null) {
      this.snapshot.fogCamera.fogStart = Date.now();
      this.recordTimelineEvent('fogBegin');
    }
    if (phase === 0 && this.snapshot.fogCamera.fogStart !== null && this.snapshot.fogCamera.fogEnd === null) {
      this.snapshot.fogCamera.fogEnd = Date.now();
      this.recordTimelineEvent('fogEnd');
    }
  }
}

export const osmTelemetry = new OSMTelemetryManager();
