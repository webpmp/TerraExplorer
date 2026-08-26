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
  viewportBounds?: any;
  maxFramingDistance?: number;
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
  private previousDestination: DocumentaryDestination | null = null;
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

  public getPreviousDestination(): DocumentaryDestination | null {
    return this.previousDestination;
  }

  public getCurrentOrigin(): DocumentaryDestination | null {
    return this.currentOrigin;
  }

  /**
   * Explicitly commits a new destination to the controller.
   */
  public commitDestination(destination: DocumentaryDestination): { sequenceId: number; previousDestination: DocumentaryDestination | null } {
    const prev = this.currentDestination;
    if (prev && (prev.lat !== destination.lat || prev.lng !== destination.lng || prev.name !== destination.name)) {
      console.log(
        `[DESTINATION HANDOFF]\n` +
        `previous="${prev.name}"\n` +
        `previousCoordinates=${prev.lat.toFixed(4)},${prev.lng.toFixed(4)}\n` +
        `current="${destination.name}"\n` +
        `currentCoordinates=${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
      );
    }

    const sequenceId = ++this.currentSequenceId;
    this.previousDestination = prev;
    this.currentDestination = destination;

    console.log(
      `[DESTINATION COMMITTED]\n` +
      `name="${destination.name}"\n` +
      `coordinates=${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}\n` +
      `transitionId=${sequenceId}`
    );

    return { sequenceId, previousDestination: prev };
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
    const prev = this.currentDestination || this.previousDestination;
    this.cancel('new_single_location_selected');

    if (prev && (prev.lat !== destination.lat || prev.lng !== destination.lng || prev.name !== destination.name)) {
      console.log(
        `[DESTINATION HANDOFF]\n` +
        `previous="${prev.name}"\n` +
        `previousCoordinates=${prev.lat.toFixed(4)},${prev.lng.toFixed(4)}\n` +
        `current="${destination.name}"\n` +
        `currentCoordinates=${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
      );
    }

    const sequenceId = ++this.currentSequenceId;
    this.currentTransitionType = 'single-location';
    this.currentOrigin = null;
    this.previousDestination = prev;
    this.currentDestination = destination;
    this.activeCallbacks = callbacks;
    this.isAtmospherePassed = false;
    this.isOSMPassed = false;

    console.log(
      `[DESTINATION COMMITTED]\n` +
      `name="${destination.name}"\n` +
      `coordinates=${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}\n` +
      `transitionId=${sequenceId}`
    );

    const config = options?.cameraConfig || getDocumentaryCameraConfig(options?.skin, options?.aspect);
    const maxAllowedDistance = config.maximumGlobeZoomOutDistance;
    const startDistance = Math.min(maxAllowedDistance, callbacks.getCameraDistance());
    const targetDistance = Math.max(config.osmDistance, Math.min(maxAllowedDistance, options?.targetDistance || config.osmDistance));
    const globeAltitude = Math.min(maxAllowedDistance, config.globeOverviewDistance);

    console.log(
      `[DOCUMENTARY START]\n` +
      `name="${destination.name}"\n` +
      `startDistance=${startDistance.toFixed(4)}\n` +
      `targetDistance=${targetDistance.toFixed(4)}\n` +
      `transitionId=${sequenceId}`
    );

    const originCoords = callbacks.getCameraCoordinates
      ? callbacks.getCameraCoordinates()
      : { lat: destination.lat, lng: destination.lng };

    const angularDist = calculateGreatCircleDistance(originCoords.lat, originCoords.lng, destination.lat, destination.lng);
    const sepDeg = (angularDist * 180) / Math.PI;

    const atOSMFloor = startDistance < config.atmosphereStartDistance;
    const isSameLocation = sepDeg < 0.05;

    let isStartingFromOSM = false;
    let isLocalAtTarget = false;
    let isDirectDescent = false;
    let transitionType: 'distant_osm_to_globe' | 'local_pan' | 'direct_descent' | 'globe_overview';
    let decisionReason: string;

    if (atOSMFloor && !isSameLocation) {
      // Transitioning to a new destination while camera is at or near OSM floor:
      // MUST zoom out first to avoid panning at OSM zoom floor across regional/distant coordinates
      isStartingFromOSM = true;
      transitionType = 'distant_osm_to_globe';
      decisionReason = 'at_osm_floor_destination_change';
    } else if (isSameLocation && startDistance <= targetDistance + 0.15) {
      // Same location re-selected while already at target distance
      isLocalAtTarget = true;
      transitionType = 'local_pan';
      decisionReason = 'same_location_at_target';
    } else if (startDistance < globeAltitude - 0.2) {
      isDirectDescent = true;
      transitionType = 'direct_descent';
      decisionReason = 'intermediate_altitude_descent';
    } else {
      transitionType = 'globe_overview';
      decisionReason = 'high_altitude_globe_rotation_descent';
    }

    console.log(
      `[DESTINATION TRANSITION DECISION]\n` +
      `previous="${prev?.name || 'none'}"\n` +
      `current="${destination.name}"\n` +
      `sepDeg=${sepDeg.toFixed(1)}°\n` +
      `cameraDistance=${startDistance.toFixed(4)}\n` +
      `atOSMFloor=${atOSMFloor}\n` +
      `transitionType=${transitionType}\n` +
      `reason=${decisionReason}`
    );

    console.log(
      `[DOCUMENTARY CAMERA OWNERSHIP]\n` +
      `transitionId=${sequenceId}\n` +
      `active=true`
    );

    if (isStartingFromOSM) {
      this.currentPhase = 'zooming_out';
    } else if (isLocalAtTarget || isDirectDescent) {
      this.currentPhase = 'descending';
      if (startDistance <= config.atmosphereStartDistance) {
        this.isAtmospherePassed = true;
        callbacks.onAtmosphereEnter?.();
      }
      if (startDistance <= config.atmosphereEndDistance) {
        this.isOSMPassed = true;
        callbacks.onOSMEnter?.();
      }
    } else {
      this.currentPhase = 'rotating';
    }

    console.log(`[Documentary] theme=${config.skin} mode=${transitionType} single-location descent started id=${sequenceId} to="${destination.name}" sepDeg=${sepDeg.toFixed(1)}° startDist=${startDistance.toFixed(2)} targetDist=${targetDistance.toFixed(2)} maxAllowedDistance=${maxAllowedDistance.toFixed(2)}`);

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
        console.log(`[DOCUMENTARY CAMERA OWNERSHIP]\ntransitionId=${sequenceId}\nactive=false`);
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
      } else if (isLocalAtTarget) {
        const easedP = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const interp = interpolateCoordinates(originCoords.lat, originCoords.lng, destination.lat, destination.lng, easedP);
        curLat = interp.lat;
        curLng = interp.lng;
        curDist = Math.min(startDistance, targetDistance);
      } else if (isDirectDescent) {
        const easedP = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const interp = interpolateCoordinates(originCoords.lat, originCoords.lng, destination.lat, destination.lng, easedP);
        curLat = interp.lat;
        curLng = interp.lng;
        curDist = startDistance + (targetDistance - startDistance) * easedP;
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
  /**
   * Starts a staged waypoint transition (OSM -> Globe -> OSM):
   * - If comfortably visible in current viewport: smooth pan at current zoom level.
   * - Otherwise:
   *   Phase 1 (Zoom Out): Zoom straight OUT from origin waypoint until safely at overview altitude (no lateral movement).
   *   Phase 2 (Globe Rotate): Reorient globe at constant overview altitude from origin to destination.
   *   Phase 3 (Zoom In): Descend onto destination waypoint down into settled OSM view.
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
    const startDistance = Math.min(maxAllowedDistance, callbacks.getCameraDistance());
    const targetDistance = Math.max(config.osmDistance, Math.min(maxAllowedDistance, options?.targetDistance || config.osmDistance));

    // Viewport Visibility Evaluation
    const isComfortablyVisible = options?.viewportBounds
      ? (typeof destination.lat === 'number' && typeof destination.lng === 'number' && (destination.lat >= options.viewportBounds.bufferedMinLat && destination.lat <= options.viewportBounds.bufferedMaxLat) &&
          (options.viewportBounds.crossesAntimeridian
            ? (destination.lng >= options.viewportBounds.bufferedMinLng || destination.lng <= options.viewportBounds.bufferedMaxLng)
            : (destination.lng >= options.viewportBounds.bufferedMinLng && destination.lng <= options.viewportBounds.bufferedMaxLng)))
      : isDestinationComfortablyVisible(
          currentCameraCoords,
          startDistance,
          destination,
          {
            viewportWidth: options?.viewportWidth,
            viewportHeight: options?.viewportHeight,
            aspect: options?.aspect,
            viewportBounds: options?.viewportBounds
          }
        );

    let framingDistance: number;
    let transitionCategory: 'visible_pan' | 'nearby_offscreen' | 'distant_globe';
    const maxWaypointFramingLimit = options?.maxFramingDistance ?? Math.min(2.65, maxAllowedDistance);

    if (isComfortablyVisible) {
      transitionCategory = 'visible_pan';
      framingDistance = Math.max(startDistance, targetDistance);
      this.currentPhase = 'descending';
      console.log(`[Documentary] waypoint transition: destination is comfortably visible in viewport -> preserving zoom distance=${startDistance.toFixed(2)}`);
    } else if (sepDeg <= 30.0) {
      transitionCategory = 'nearby_offscreen';
      framingDistance = Math.min(
        maxWaypointFramingLimit,
        calculateModerateFramingDistance(angularDist, startDistance, targetDistance, maxAllowedDistance)
      );
      this.currentPhase = 'zooming_out';
      console.log(`[Documentary] waypoint transition: destination is nearby off-screen (sep=${sepDeg.toFixed(1)}°) -> moderate framing dist=${framingDistance.toFixed(2)}`);
    } else {
      transitionCategory = 'distant_globe';
      framingDistance = Math.min(
        maxWaypointFramingLimit,
        config.calculateFramingDistance(angularDist, startDistance, targetDistance)
      );
      this.currentPhase = 'zooming_out';
      console.log(`[Documentary] waypoint transition: destination is distant (sep=${sepDeg.toFixed(1)}°) -> regional framing dist=${framingDistance.toFixed(2)}`);
    }

    if (isComfortablyVisible || framingDistance <= config.atmosphereEndDistance) {
      this.isAtmospherePassed = true;
      this.isOSMPassed = true;
      callbacks.onAtmosphereEnter?.();
      callbacks.onOSMEnter?.();
    }

    const wpId = destination.sequence ?? (typeof (destination as any).index === 'number' ? (destination as any).index + 1 : undefined) ?? destination.id ?? destination.name ?? 'destination';

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
      console.log(`[Documentary] NEXT waypoint=${wpId} phase=COMPLETE distance=${targetDistance.toFixed(2)}`);
      this.finishSequence(sequenceId, destination, callbacks);
      return sequenceId;
    }

    const startTime = safeNow();

    let loggedZoomOutStart = false;
    let loggedZoomOutComplete = false;
    let loggedGlobeRotateStart = false;
    let loggedGlobeRotateComplete = false;
    let loggedZoomInStart = false;
    let loggedComplete = false;

    if (!isComfortablyVisible) {
      console.log(`[Documentary] NEXT waypoint=${wpId} phase=ZOOM_OUT_START distance=${startDistance.toFixed(2)}`);
      loggedZoomOutStart = true;
    }

    const animate = (now: number) => {
      if (this.currentSequenceId !== sequenceId) {
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / totalDurationMs));

      let curLat: number;
      let curLng: number;
      let curDist: number;

      if (isComfortablyVisible) {
        // Visible pan: smooth interpolation at constant scale
        const easedP = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const interp = interpolateCoordinates(currentCameraCoords.lat, currentCameraCoords.lng, destination.lat, destination.lng, easedP);
        curLat = interp.lat;
        curLng = interp.lng;
        curDist = startDistance + (targetDistance - startDistance) * easedP;
      } else if (startDistance < framingDistance) {
        // Staged 3-phase transition:
        // Phase 1: Zoom straight OUT above origin waypoint (0% - 35%)
        if (progress < 0.35) {
          this.currentPhase = 'zooming_out';
          const p1 = progress / 0.35;
          const easedP1 = p1 < 0.5 ? 2 * p1 * p1 : 1 - Math.pow(-2 * p1 + 2, 2) / 2;

          curLat = currentCameraCoords.lat;
          curLng = currentCameraCoords.lng;
          curDist = startDistance + (framingDistance - startDistance) * easedP1;
        } else if (progress < 0.67) {
          // Phase 2: Globe view - Rotate/reorient toward destination at constant overview altitude (35% - 67%)
          if (!loggedZoomOutComplete) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=ZOOM_OUT_COMPLETE distance=${framingDistance.toFixed(2)}`);
            loggedZoomOutComplete = true;
          }
          if (!loggedGlobeRotateStart) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=GLOBE_ROTATE_START distance=${framingDistance.toFixed(2)}`);
            loggedGlobeRotateStart = true;
          }

          this.currentPhase = 'framing';
          const p2 = (progress - 0.35) / 0.32;
          const easedP2 = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;

          const interp = interpolateCoordinates(currentCameraCoords.lat, currentCameraCoords.lng, destination.lat, destination.lng, easedP2);
          curLat = interp.lat;
          curLng = interp.lng;
          curDist = framingDistance;
        } else {
          // Phase 3: Zoom IN / descend onto destination waypoint (67% - 100%)
          if (!loggedGlobeRotateComplete) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=GLOBE_ROTATE_COMPLETE distance=${framingDistance.toFixed(2)}`);
            loggedGlobeRotateComplete = true;
          }
          if (!loggedZoomInStart) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=ZOOM_IN_START distance=${framingDistance.toFixed(2)}`);
            loggedZoomInStart = true;
          }

          this.currentPhase = 'descending';
          const p3 = (progress - 0.67) / 0.33;
          const easedP3 = p3 < 0.5 ? 2 * p3 * p3 : 1 - Math.pow(-2 * p3 + 2, 2) / 2;

          curLat = destination.lat;
          curLng = destination.lng;
          curDist = framingDistance + (targetDistance - framingDistance) * easedP3;
        }
      } else {
        // Starting at or above framing distance: 2-stage (Rotate -> Descend)
        if (progress < 0.45) {
          this.currentPhase = progress < 0.25 ? 'zooming_out' : 'framing';
          const p = progress / 0.45;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const interp = interpolateCoordinates(currentCameraCoords.lat, currentCameraCoords.lng, destination.lat, destination.lng, easedP);
          curLat = interp.lat;
          curLng = interp.lng;
          curDist = startDistance;
        } else {
          if (!loggedGlobeRotateComplete) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=GLOBE_ROTATE_COMPLETE distance=${startDistance.toFixed(2)}`);
            loggedGlobeRotateComplete = true;
          }
          if (!loggedZoomInStart) {
            console.log(`[Documentary] NEXT waypoint=${wpId} phase=ZOOM_IN_START distance=${startDistance.toFixed(2)}`);
            loggedZoomInStart = true;
          }
          this.currentPhase = 'descending';
          const p = (progress - 0.45) / 0.55;
          const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          curLat = destination.lat;
          curLng = destination.lng;
          curDist = startDistance + (targetDistance - startDistance) * easedP;
        }
      }

      // Hard clamp
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
        if (!loggedComplete) {
          console.log(`[Documentary] NEXT waypoint=${wpId} phase=COMPLETE distance=${targetDistance.toFixed(2)}`);
          loggedComplete = true;
        }
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
    this.previousDestination = destination;
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

    if (this.currentDestination) {
      this.previousDestination = this.currentDestination;
    }

    this.currentPhase = 'cancelled';
    this.currentDestination = null;
    this.currentOrigin = null;
    this.activeCallbacks = null;
  }
}

export const documentaryController = DocumentaryController.getInstance();
