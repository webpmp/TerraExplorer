/**
 * DocumentaryController
 * 
 * Orchestrates cinematic camera descent, atmosphere fog transition,
 * waypoint-to-waypoint framing transitions, OSM map settlement,
 * InfoPanel reveal, and narration coordination.
 */

import { DocumentaryDuration, GeoCoordinates, SkinType } from '../types';
import { OSM_DETAIL_THRESHOLD } from './geographic/osmTileService';
import {
  DocumentaryCameraConfig,
  getDocumentaryCameraConfig,
  calculateDefaultFramingDistance,
  calculateModerateFramingDistance,
  isDestinationComfortablyVisible
} from '../utils/cameraConfig';

export interface DocumentaryDestination {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  description?: string;
  [key: string]: unknown;
}

export type DocumentaryPhase =
  | 'idle'
  | 'loading'
  | 'zooming_out'
  | 'rotating'
  | 'framing'
  | 'descending'
  | 'settling'
  | 'revealed'
  | 'completed'
  | 'cancelled';

export type DocumentaryTransition = 'single-location' | 'waypoint';

export interface DocumentaryAdapterCallbacks {
  getCameraDistance: () => number;
  getCameraCoordinates?: () => { lat: number; lng: number };
  setCameraDistance: (dist: number) => void;
  setCameraPosition?: (lat: number, lng: number, distance: number) => void;
  onAtmosphereEnter?: () => void;
  onOSMEnter?: () => void;
  onSettle?: (destination: DocumentaryDestination) => void;
  onReveal?: (destination: DocumentaryDestination) => void;
  onComplete?: (destination: DocumentaryDestination) => void;
  onCancel?: (reason: string) => void;
}

export interface DocumentaryStartOptions {
  duration?: DocumentaryDuration;
  reducedMotion?: boolean;
  targetDistance?: number;
  skin?: SkinType;
  aspect?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  cameraConfig?: DocumentaryCameraConfig;
}

export const DOCUMENTARY_DURATIONS: Record<string, number> = {
  short: 3200,
  cinematic: 5500,
  long: 8000
};

export const resolveDocumentaryDuration = (duration?: DocumentaryDuration): number => {
  if (typeof duration === 'number' && !isNaN(duration)) {
    return Math.max(2000, Math.min(10000, Math.round(duration * 1000)));
  }
  if (typeof duration === 'string') {
    return DOCUMENTARY_DURATIONS[duration] ?? 5500;
  }
  return 5500;
};

// Target altitude for settled OSM view, cleanly below OSM_DETAIL_THRESHOLD (1.45)
export const DOCUMENTARY_TARGET_DISTANCE = 1.30;
export const DOCUMENTARY_ATMOSPHERE_DISTANCE = 1.85;
export const DOCUMENTARY_OSM_DISTANCE = 1.55;
export const DOCUMENTARY_GLOBE_ALTITUDE = 4.0;

export const safeRequestAnimationFrame = (cb: (time: number) => void): number => {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16) as unknown as number;
};

export const safeCancelAnimationFrame = (id: number): void => {
  if (typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

export const safeNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

/**
 * Interpolates smoothly between two geographic lat/lng coordinates along the shortest spherical path.
 */
export function interpolateCoordinates(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  t: number
): { lat: number; lng: number } {
  const clampedT = Math.max(0, Math.min(1, t));
  const lat = lat1 + (lat2 - lat1) * clampedT;

  let deltaLng = (lng2 - lng1) % 360;
  if (deltaLng > 180) deltaLng -= 360;
  if (deltaLng < -180) deltaLng += 360;

  let lng = lng1 + deltaLng * clampedT;
  lng = ((lng + 180) % 360 + 360) % 360 - 180;

  return { lat, lng };
}

/**
 * Calculates great-circle angular distance (in radians) between two lat/lng coordinates.
 */
export function calculateGreatCircleDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaPhi = (lat2 - lat1) * toRad;
  const deltaLambda = (lng2 - lng1) * toRad;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Calculates great-circle midpoint between two lat/lng coordinates.
 */
export function calculateGreatCircleMidpoint(lat1: number, lng1: number, lat2: number, lng2: number): { lat: number; lng: number } {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const phi1 = lat1 * toRad;
  const lambda1 = lng1 * toRad;
  const phi2 = lat2 * toRad;
  const lambda2 = lng2 * toRad;

  const Bx = Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const By = Math.cos(phi2) * Math.sin(lambda2 - lambda1);

  const phi3 = Math.atan2(
    Math.sin(phi1) + Math.sin(phi2),
    Math.sqrt((Math.cos(phi1) + Bx) * (Math.cos(phi1) + Bx) + By * By)
  );
  const lambda3 = lambda1 + Math.atan2(By, Math.cos(phi1) + Bx);

  return {
    lat: phi3 * toDeg,
    lng: ((lambda3 * toDeg + 540) % 360) - 180
  };
}

/**
 * /**
 * Calculates dynamic camera framing distance based on angular separation.
 */
export function calculateFramingDistance(
  angularDistanceRad: number,
  startDistance: number = 1.30,
  targetDistance: number = 1.30,
  maxOverviewDistance: number = 4.5
): number {
  return calculateDefaultFramingDistance(angularDistanceRad, startDistance, targetDistance, maxOverviewDistance);
}

export class DocumentaryController {
  private static instance: DocumentaryController | null = null;

  private currentSequenceId = 0;
  private currentPhase: DocumentaryPhase = 'idle';
  private currentTransitionType: DocumentaryTransition = 'single-location';
  private currentDestination: DocumentaryDestination | null = null;
  private currentOrigin: DocumentaryDestination | null = null;
  private animFrameId: number | null = null;
  private activeCallbacks: DocumentaryAdapterCallbacks | null = null;
  private isAtmospherePassed = false;
  private isOSMPassed = false;

  public static getInstance(): DocumentaryController {
    if (!DocumentaryController.instance) {
      DocumentaryController.instance = new DocumentaryController();
    }
    return DocumentaryController.instance;
  }

  public getSequenceId(): number {
    return this.currentSequenceId;
  }

  public getPhase(): DocumentaryPhase {
    return this.currentPhase;
  }

  public getTransitionType(): DocumentaryTransition {
    return this.currentTransitionType;
  }

  public isActive(): boolean {
    return (
      this.currentPhase === 'zooming_out' ||
      this.currentPhase === 'rotating' ||
      this.currentPhase === 'framing' ||
      this.currentPhase === 'descending' ||
      this.currentPhase === 'loading' ||
      this.currentPhase === 'settling'
    );
  }

  public getCurrentDestination(): DocumentaryDestination | null {
    return this.currentDestination;
  }

  public getCurrentOrigin(): DocumentaryDestination | null {
    return this.currentOrigin;
  }

  /**
   * Alias to startSingleLocation for backward compatibility.
   */
  public start(
    destination: DocumentaryDestination,
    callbacks: DocumentaryAdapterCallbacks,
    options?: DocumentaryStartOptions
  ): number {
    return this.startSingleLocation(destination, callbacks, options);
  }

  /**
   * Starts single-location documentary camera descent.
   * If the current camera is at OSM level (< 2.2), performs a 3-phase transition:
   * 1. Zoom Out to Globe altitude (preserving current origin coordinates)
   * 2. Rotate to Destination at Globe altitude
   * 3. Zoom In (descent) into Destination down to target OSM view
   * If already at Globe level (>= 2.2):
   * 1. Rotate to Destination
   * 2. Zoom In (descent) into Destination
   */
  public startSingleLocation(
    destination: DocumentaryDestination,
    callbacks: DocumentaryAdapterCallbacks,
    options?: DocumentaryStartOptions
  ): number {
    this.cancel('new_single_location_selected');

    const sequenceId = ++this.currentSequenceId;
    this.currentTransitionType = 'single-location';
    this.currentOrigin = null;
    this.currentDestination = destination;
    this.activeCallbacks = callbacks;
    this.isAtmospherePassed = false;
    this.isOSMPassed = false;

    const config = options?.cameraConfig || getDocumentaryCameraConfig(options?.skin, options?.aspect);
    const maxAllowedDistance = config.maximumGlobeZoomOutDistance;
    const startDistance = Math.min(maxAllowedDistance, callbacks.getCameraDistance());
    const targetDistance = Math.max(config.osmDistance, Math.min(maxAllowedDistance, options?.targetDistance || config.osmDistance));
    const globeAltitude = Math.min(maxAllowedDistance, config.globeOverviewDistance);

    const isStartingFromOSM = startDistance < config.atmosphereStartDistance;
    this.currentPhase = isStartingFromOSM ? 'zooming_out' : 'rotating';
    const originCoords = callbacks.getCameraCoordinates
      ? callbacks.getCameraCoordinates()
      : { lat: destination.lat, lng: destination.lng };

    console.log(`[Documentary] theme=${config.skin} single-location descent started id=${sequenceId} to="${destination.name}" startDist=${startDistance.toFixed(2)} targetDist=${targetDistance.toFixed(2)} maxAllowedDistance=${maxAllowedDistance.toFixed(2)}`);

    const durationSetting = options?.duration;
    const isReducedMotion =
      options?.reducedMotion ??
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    const totalDurationMs = isReducedMotion ? 50 : resolveDocumentaryDuration(durationSetting);

    if (totalDurationMs <= 100) {
      if (callbacks.setCameraPosition) {
        callbacks.setCameraPosition(destination.lat, destination.lng, targetDistance);
      } else {
        callbacks.setCameraDistance(targetDistance);
      }
      this.finishSequence(sequenceId, destination, callbacks);
      return sequenceId;
    }

    const startTime = safeNow();

    const animate = (now: number) => {
      if (this.currentSequenceId !== sequenceId) {
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / totalDurationMs));

      let curLat = destination.lat;
      let curLng = destination.lng;
      let curDist = targetDistance;

      if (isStartingFromOSM) {
        if (progress < 0.3) {
          this.currentPhase = 'zooming_out';
          const p = progress / 0.3;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          curLat = originCoords.lat;
          curLng = originCoords.lng;
          curDist = startDistance + (globeAltitude - startDistance) * easedP;
        } else if (progress < 0.6) {
          this.currentPhase = 'rotating';
          const p = (progress - 0.3) / 0.3;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const interp = interpolateCoordinates(originCoords.lat, originCoords.lng, destination.lat, destination.lng, easedP);
          curLat = interp.lat;
          curLng = interp.lng;
          curDist = globeAltitude;
        } else {
          this.currentPhase = 'descending';
          const p = (progress - 0.6) / 0.4;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          curLat = destination.lat;
          curLng = destination.lng;
          curDist = globeAltitude + (targetDistance - globeAltitude) * easedP;
        }
      } else {
        if (progress < 0.4) {
          this.currentPhase = 'rotating';
          const p = progress / 0.4;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const interp = interpolateCoordinates(originCoords.lat, originCoords.lng, destination.lat, destination.lng, easedP);
          curLat = interp.lat;
          curLng = interp.lng;
          curDist = startDistance;
        } else {
          this.currentPhase = 'descending';
          const p = (progress - 0.4) / 0.6;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          curLat = destination.lat;
          curLng = destination.lng;
          curDist = startDistance + (targetDistance - startDistance) * easedP;
        }
      }

      // Hard clamp: guarantee camera distance never exceeds maxAllowedDistance or drops below osmDistance on any frame
      curDist = Math.max(config.osmDistance, Math.min(maxAllowedDistance, curDist));

      if (callbacks.setCameraPosition) {
        callbacks.setCameraPosition(curLat, curLng, curDist);
      } else {
        callbacks.setCameraDistance(curDist);
      }

      if (this.currentPhase === 'descending') {
        if (!this.isAtmospherePassed && curDist <= config.atmosphereStartDistance) {
          this.isAtmospherePassed = true;
          callbacks.onAtmosphereEnter?.();
        }

        if (!this.isOSMPassed && curDist <= config.atmosphereEndDistance) {
          this.isOSMPassed = true;
          console.log('[Documentary] OSM transition started');
          callbacks.onOSMEnter?.();
        }
      }

      if (progress < 1) {
        this.animFrameId = safeRequestAnimationFrame(animate);
      } else {
        this.animFrameId = null;
        this.finishSequence(sequenceId, destination, callbacks);
      }
    };

    this.animFrameId = safeRequestAnimationFrame(animate);
    return sequenceId;
  }

  /**
   * Starts a two-phase waypoint transition:
   * Phase 1: Zoom out & reorient toward destination / midpoint.
   * Phase 2: Zoom in toward destination waypoint to settled OSM view.
   * For nearby destinations, maintains local geographic scale without excess zoom-out.
   */
  public startWaypointTransition(
    current: DocumentaryDestination,
    destination: DocumentaryDestination,
    callbacks: DocumentaryAdapterCallbacks,
    options?: DocumentaryStartOptions
  ): number {
    this.cancel('new_waypoint_transition_selected');

    const sequenceId = ++this.currentSequenceId;
    this.currentTransitionType = 'waypoint';
    this.currentOrigin = current;
    this.currentDestination = destination;
    this.activeCallbacks = callbacks;
    this.isAtmospherePassed = false;
    this.isOSMPassed = false;

    const config = options?.cameraConfig || getDocumentaryCameraConfig(options?.skin, options?.aspect);
    const maxAllowedDistance = config.maximumGlobeZoomOutDistance;
    const currentCameraCoords = callbacks.getCameraCoordinates
      ? callbacks.getCameraCoordinates()
      : { lat: current.lat, lng: current.lng };
    const angularDist = calculateGreatCircleDistance(currentCameraCoords.lat, currentCameraCoords.lng, destination.lat, destination.lng);
    const sepDeg = (angularDist * 180) / Math.PI;
    const midpoint = calculateGreatCircleMidpoint(current.lat, current.lng, destination.lat, destination.lng);
    const startDistance = Math.min(maxAllowedDistance, callbacks.getCameraDistance());
    const targetDistance = Math.max(config.osmDistance, Math.min(maxAllowedDistance, options?.targetDistance || config.osmDistance));

    // Shared Viewport Visibility Evaluation
    const isComfortablyVisible = isDestinationComfortablyVisible(
      currentCameraCoords,
      startDistance,
      destination,
      {
        viewportWidth: options?.viewportWidth,
        viewportHeight: options?.viewportHeight,
        aspect: options?.aspect
      }
    );

    let framingDistance: number;
    let transitionCategory: 'visible_pan' | 'nearby_offscreen' | 'distant_globe';

    if (isComfortablyVisible) {
      // CASE 1: Destination is already comfortably visible in current viewport
      // -> Preserve current geographic scale and smoothly center on destination
      transitionCategory = 'visible_pan';
      framingDistance = Math.max(startDistance, targetDistance);
      this.currentPhase = 'descending';
      console.log(`[Documentary] waypoint transition: destination is comfortably visible in viewport -> preserving zoom distance=${startDistance.toFixed(2)}`);
    } else if (sepDeg <= 30.0) {
      // CASE 2: Destination is nearby but outside viewport
      // -> Moderate zoom-out to establish geographic context before descending
      transitionCategory = 'nearby_offscreen';
      framingDistance = Math.min(
        maxAllowedDistance,
        calculateModerateFramingDistance(angularDist, startDistance, targetDistance, maxAllowedDistance)
      );
      this.currentPhase = 'zooming_out';
      console.log(`[Documentary] waypoint transition: destination is nearby off-screen (sep=${sepDeg.toFixed(1)}°) -> moderate framing dist=${framingDistance.toFixed(2)}`);
    } else {
      // CASE 3: Destination is far away
      // -> Full globe-level documentary transition
      transitionCategory = 'distant_globe';
      framingDistance = Math.min(
        maxAllowedDistance,
        config.calculateFramingDistance(angularDist, startDistance, targetDistance)
      );
      this.currentPhase = 'zooming_out';
      console.log(`[Documentary] waypoint transition: destination is distant (sep=${sepDeg.toFixed(1)}°) -> globe transition dist=${framingDistance.toFixed(2)}`);
    }

    // If framing distance remains within OSM layer, immediately mark atmospheric & OSM status
    if (isComfortablyVisible || framingDistance <= config.atmosphereEndDistance) {
      this.isAtmospherePassed = true;
      this.isOSMPassed = true;
      callbacks.onAtmosphereEnter?.();
      callbacks.onOSMEnter?.();
    }

    console.log(`[Documentary] theme=${config.skin} state=${this.currentPhase} category=${transitionCategory} waypoint transition started id=${sequenceId} from="${current.name}" to="${destination.name}" separation=${sepDeg.toFixed(1)}° framingDist=${framingDistance.toFixed(2)} startDist=${startDistance.toFixed(2)} maxAllowedDistance=${maxAllowedDistance.toFixed(2)}`);

    const durationSetting = options?.duration;
    const isReducedMotion =
      options?.reducedMotion ??
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

    const baseDuration = resolveDocumentaryDuration(durationSetting);
    let totalDurationMs: number;

    if (isReducedMotion) {
      totalDurationMs = 50;
    } else if (isComfortablyVisible) {
      totalDurationMs = Math.min(baseDuration, 2200);
    } else {
      totalDurationMs = baseDuration;
    }

    if (totalDurationMs <= 100) {
      if (callbacks.setCameraPosition) {
        callbacks.setCameraPosition(destination.lat, destination.lng, targetDistance);
      } else {
        callbacks.setCameraDistance(targetDistance);
      }
      this.finishSequence(sequenceId, destination, callbacks);
      return sequenceId;
    }

    const startTime = safeNow();;

    const animate = (now: number) => {
      if (this.currentSequenceId !== sequenceId) {
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / totalDurationMs));

      let curLat: number;
      let curLng: number;
      let curDist: number;

      if (progress < 0.5) {
        // Phase 1: Zoom out FIRST to framing altitude and midpoint
        this.currentPhase = progress < 0.35 ? 'zooming_out' : 'framing';
        const p1 = progress / 0.5;
        const easedP1 = p1 < 0.5 ? 2 * p1 * p1 : 1 - Math.pow(-2 * p1 + 2, 2) / 2;

        const interp = interpolateCoordinates(current.lat, current.lng, midpoint.lat, midpoint.lng, easedP1);
        curLat = interp.lat;
        curLng = interp.lng;
        curDist = startDistance + (framingDistance - startDistance) * easedP1;
      } else {
        // Phase 2: Zoom in from midpoint to destination waypoint
        this.currentPhase = 'descending';
        const p2 = (progress - 0.5) / 0.5;
        const easedP2 = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;

        const interp = interpolateCoordinates(midpoint.lat, midpoint.lng, destination.lat, destination.lng, easedP2);
        curLat = interp.lat;
        curLng = interp.lng;
        curDist = framingDistance + (targetDistance - framingDistance) * easedP2;
      }

      // Hard clamp: guarantee camera distance never exceeds maxAllowedDistance or drops below osmDistance on any frame
      curDist = Math.max(config.osmDistance, Math.min(maxAllowedDistance, curDist));

      if (callbacks.setCameraPosition) {
        callbacks.setCameraPosition(curLat, curLng, curDist);
      } else {
        callbacks.setCameraDistance(curDist);
      }

      if (this.currentPhase === 'descending') {
        if (!this.isAtmospherePassed && curDist <= config.atmosphereStartDistance) {
          this.isAtmospherePassed = true;
          callbacks.onAtmosphereEnter?.();
        }

        if (!this.isOSMPassed && curDist <= config.atmosphereEndDistance) {
          this.isOSMPassed = true;
          console.log('[Documentary] OSM transition started');
          callbacks.onOSMEnter?.();
        }
      }

      if (progress < 1) {
        this.animFrameId = safeRequestAnimationFrame(animate);
      } else {
        this.animFrameId = null;
        this.finishSequence(sequenceId, destination, callbacks);
      }
    };

    this.animFrameId = safeRequestAnimationFrame(animate);
    return sequenceId;
  }

  private finishSequence(
    sequenceId: number,
    destination: DocumentaryDestination,
    callbacks: DocumentaryAdapterCallbacks
  ): void {
    if (this.currentSequenceId !== sequenceId) return;

    this.currentPhase = 'settling';
    console.log('[Documentary] sequence settled');
    callbacks.onSettle?.(destination);

    this.currentPhase = 'revealed';
    console.log('[Documentary] InfoPanel revealed');
    callbacks.onReveal?.(destination);

    this.currentPhase = 'completed';
    callbacks.onComplete?.(destination);
  }

  /**
   * Skips the cinematic animation and immediately transitions the camera
   * into the final settled OSM state, revealing the InfoPanel.
   */
  public skip(): void {
    if (!this.isActive() || !this.activeCallbacks || !this.currentDestination) {
      return;
    }

    const seqId = this.currentSequenceId;
    const dest = this.currentDestination;
    const callbacks = this.activeCallbacks;

    if (this.animFrameId !== null) {
      safeCancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    console.log(`[Documentary] sequence skipped id=${seqId}`);
    if (callbacks.setCameraPosition) {
      callbacks.setCameraPosition(dest.lat, dest.lng, DOCUMENTARY_TARGET_DISTANCE);
    } else {
      callbacks.setCameraDistance(DOCUMENTARY_TARGET_DISTANCE);
    }
    this.finishSequence(seqId, dest, callbacks);
  }

  /**
   * Cleanly cancels any ongoing documentary animation and sequence.
   */
  public cancel(reason: string = 'user_interruption'): void {
    if (this.animFrameId !== null) {
      safeCancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.isActive()) {
      console.log(`[Documentary] sequence cancelled reason="${reason}"`);
      this.activeCallbacks?.onCancel?.(reason);
    }

    this.currentPhase = 'cancelled';
    this.currentDestination = null;
    this.currentOrigin = null;
    this.activeCallbacks = null;
  }
}

export const documentaryController = DocumentaryController.getInstance();
