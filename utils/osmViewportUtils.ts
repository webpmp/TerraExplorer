/**
 * OSM Viewport Geographic Bounds and Visibility Utilities
 *
 * Provides accurate calculation of the geographic bounding box of the OSM screen viewport,
 * including configurable 2-5% edge buffer and robust ±180° antimeridian wrapping.
 */

export interface OSMViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
  zoom: number;
  // Bounding box with 2-5% geographic buffer
  bufferedMinLat: number;
  bufferedMaxLat: number;
  bufferedMinLng: number;
  bufferedMaxLng: number;
  crossesAntimeridian: boolean;
}

/**
 * Calculates geographic bounds of the OSM viewport given center coordinate, zoom level, and screen dimensions.
 * Includes a configurable 2-5% geographic buffer (default 4%) around the viewport edge.
 */
export function calculateOSMViewportBounds(
  centerLat: number,
  centerLng: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  bufferRatio: number = 0.04 // 4% geographic buffer
): OSMViewportBounds {
  const n = Math.pow(2, zoom);
  const exactX = ((centerLng + 180) / 360) * n;
  const latRad = (Math.max(-85.0511, Math.min(85.0511, centerLat)) * Math.PI) / 180;
  const exactY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const halfWidthPx = viewportWidth / 2;
  const halfHeightPx = viewportHeight / 2;

  // Unbuffered fractional tile bounds
  const leftTileX = exactX - halfWidthPx / 256;
  const rightTileX = exactX + halfWidthPx / 256;
  const topTileY = exactY - halfHeightPx / 256;
  const bottomTileY = exactY + halfHeightPx / 256;

  // Buffered fractional tile bounds
  const bufHalfWidthPx = halfWidthPx * (1 + bufferRatio);
  const bufHalfHeightPx = halfHeightPx * (1 + bufferRatio);
  const bufLeftTileX = exactX - bufHalfWidthPx / 256;
  const bufRightTileX = exactX + bufHalfWidthPx / 256;
  const bufTopTileY = exactY - bufHalfHeightPx / 256;
  const bufBottomTileY = exactY + bufHalfHeightPx / 256;

  const tileYToLat = (y: number): number => {
    const clampedY = Math.max(0, Math.min(n, y));
    const nMerc = Math.PI * (1 - (2 * clampedY) / n);
    return (180 / Math.PI) * Math.atan(Math.sinh(nMerc));
  };

  const tileXToLng = (x: number): number => {
    let lng = (x / n) * 360 - 180;
    while (lng < -180) lng += 360;
    while (lng > 180) lng -= 360;
    return lng;
  };

  const maxLat = tileYToLat(topTileY);
  const minLat = tileYToLat(bottomTileY);
  const minLng = tileXToLng(leftTileX);
  const maxLng = tileXToLng(rightTileX);

  const bufferedMaxLat = tileYToLat(bufTopTileY);
  const bufferedMinLat = tileYToLat(bufBottomTileY);
  const bufferedMinLng = tileXToLng(bufLeftTileX);
  const bufferedMaxLng = tileXToLng(bufRightTileX);

  // Check if viewport crosses the antimeridian (±180°)
  const crossesAntimeridian = bufLeftTileX < 0 || bufRightTileX > n || bufferedMinLng > bufferedMaxLng;

  return {
    minLat: Number(minLat.toFixed(6)),
    maxLat: Number(maxLat.toFixed(6)),
    minLng: Number(minLng.toFixed(6)),
    maxLng: Number(maxLng.toFixed(6)),
    centerLat: Number(centerLat.toFixed(6)),
    centerLng: Number(centerLng.toFixed(6)),
    zoom,
    bufferedMinLat: Number(bufferedMinLat.toFixed(6)),
    bufferedMaxLat: Number(bufferedMaxLat.toFixed(6)),
    bufferedMinLng: Number(bufferedMinLng.toFixed(6)),
    bufferedMaxLng: Number(bufferedMaxLng.toFixed(6)),
    crossesAntimeridian
  };
}

/**
 * Determines whether a marker's geographic coordinate falls inside the buffered OSM viewport bounds.
 */
export function isMarkerInOSMViewport(
  lat: number,
  lng: number,
  bounds: OSMViewportBounds
): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return false;
  }

  // Normalize marker longitude to [-180, 180]
  let normLng = lng;
  while (normLng < -180) normLng += 360;
  while (normLng > 180) normLng -= 360;

  // Latitude check
  if (lat < bounds.bufferedMinLat || lat > bounds.bufferedMaxLat) {
    return false;
  }

  // Longitude check with antimeridian handling
  if (bounds.crossesAntimeridian) {
    return normLng >= bounds.bufferedMinLng || normLng <= bounds.bufferedMaxLng;
  }

  return normLng >= bounds.bufferedMinLng && normLng <= bounds.bufferedMaxLng;
}

/**
 * Filters a list of markers down to only those whose geographic coordinates fall inside the current OSM viewport.
 * Does not mutate or delete from the source marker list.
 */
export function filterMarkersByOSMViewport<T extends { lat?: number; lng?: number }>(
  markers: T[],
  bounds: OSMViewportBounds | null
): T[] {
  if (!bounds || !markers || markers.length === 0) return [];
  return markers.filter((m) => {
    if (typeof m.lat !== 'number' || typeof m.lng !== 'number') return false;
    return isMarkerInOSMViewport(m.lat, m.lng, bounds);
  });
}

export type CameraPresentationState =
  | 'GLOBE'
  | 'REGIONAL'
  | 'LOCAL'
  | 'OSM_TRANSITION'
  | 'OSM_ACTIVE';

export type CameraTransitionDecision =
  | 'PAN_CURRENT_OSM'
  | 'ZOOM_CURRENT_OSM'
  | 'TRANSITION_TO_OSM'
  | 'PRESERVE_CURRENT_OSM_ZOOM'
  | 'REDIRECT_CURRENT_TRANSITION'
  | 'NO_CAMERA_MOVEMENT';

export interface CameraDecisionContext {
  currentDistance: number;
  isOSMActive: boolean;
  isDocumentaryActive: boolean;
  marker: { lat?: number; lng?: number; name?: string };
  osmViewportBounds: OSMViewportBounds | null;
  cameraCenter?: { lat: number; lng: number };
  targetDistance?: number;
  osmRequired?: boolean;
}

export interface CameraDecisionResult {
  currentState: CameraPresentationState;
  targetState: CameraPresentationState;
  currentDistance: number;
  targetDistance: number;
  markerInView: boolean;
  osmActive: boolean;
  osmRequired: boolean;
  transitionDecision: CameraTransitionDecision;
}

export function evaluateCameraTransitionDecision(
  ctx: CameraDecisionContext
): CameraDecisionResult {
  const currentDistance = ctx.currentDistance;
  const isOSMActive = ctx.isOSMActive;
  const isDocActive = ctx.isDocumentaryActive;
  const targetDistance = ctx.targetDistance ?? 1.30;
  const osmRequired = ctx.osmRequired ?? true;

  // Determine current presentation state
  let currentState: CameraPresentationState;
  if (isOSMActive && currentDistance <= 1.45) {
    currentState = 'OSM_ACTIVE';
  } else if (currentDistance <= 1.55) {
    currentState = 'OSM_TRANSITION';
  } else if (currentDistance <= 2.0) {
    currentState = 'LOCAL';
  } else if (currentDistance <= 3.2) {
    currentState = 'REGIONAL';
  } else {
    currentState = 'GLOBE';
  }

  const targetState: CameraPresentationState = osmRequired ? 'OSM_ACTIVE' : 'GLOBE';

  // Determine marker visibility
  let markerInView = false;
  const lat = ctx.marker.lat;
  const lng = ctx.marker.lng;

  if (typeof lat === 'number' && typeof lng === 'number') {
    if (ctx.osmViewportBounds) {
      markerInView = isMarkerInOSMViewport(lat, lng, ctx.osmViewportBounds);
    } else if (currentState === 'OSM_ACTIVE' || currentState === 'OSM_TRANSITION' || currentState === 'LOCAL') {
      const center = ctx.cameraCenter && (ctx.cameraCenter.lat !== 0 || ctx.cameraCenter.lng !== 0)
        ? ctx.cameraCenter
        : { lat, lng };
      const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const computedBounds = calculateOSMViewportBounds(center.lat, center.lng, 14, w, h, 0.04);
      markerInView = isMarkerInOSMViewport(lat, lng, computedBounds);
    } else {
      markerInView = false;
    }
  }

  // Evaluate transition decision
  let transitionDecision: CameraTransitionDecision;

  if (currentState === 'OSM_ACTIVE') {
    if (markerInView) {
      const centerLat = ctx.osmViewportBounds?.centerLat ?? ctx.cameraCenter?.lat ?? lat;
      const centerLng = ctx.osmViewportBounds?.centerLng ?? ctx.cameraCenter?.lng ?? lng;
      const dLat = typeof lat === 'number' ? Math.abs(lat - (centerLat ?? lat)) : 0;
      let dLng = typeof lng === 'number' ? Math.abs(lng - (centerLng ?? lng)) : 0;
      if (dLng > 180) dLng = 360 - dLng;

      if (dLat < 0.001 && dLng < 0.001) {
        transitionDecision = 'NO_CAMERA_MOVEMENT';
      } else {
        transitionDecision = 'PAN_CURRENT_OSM';
      }
    } else {
      transitionDecision = 'PRESERVE_CURRENT_OSM_ZOOM';
    }
  } else if (isDocActive) {
    transitionDecision = 'REDIRECT_CURRENT_TRANSITION';
  } else {
    // Globe, regional, or local camera approaching OSM
    transitionDecision = 'TRANSITION_TO_OSM';
  }

  return {
    currentState,
    targetState,
    currentDistance,
    targetDistance,
    markerInView,
    osmActive: isOSMActive,
    osmRequired,
    transitionDecision
  };
}

export function logCameraDecision(result: CameraDecisionResult): void {
  console.log(
    `[Documentary Camera] CURRENT_STATE=${result.currentState}\n` +
    `[Documentary Camera] TARGET_STATE=${result.targetState}\n` +
    `[Documentary Camera] CURRENT_DISTANCE=${result.currentDistance.toFixed(4)}\n` +
    `[Documentary Camera] TARGET_DISTANCE=${result.targetDistance.toFixed(4)}\n` +
    `[Documentary Camera] MARKER_IN_VIEW=${result.markerInView}\n` +
    `[Documentary Camera] OSM_ACTIVE=${result.osmActive}\n` +
    `[Documentary Camera] OSM_REQUIRED=${result.osmRequired}\n` +
    `[Documentary Camera] TRANSITION_DECISION=${result.transitionDecision}`
  );
}

