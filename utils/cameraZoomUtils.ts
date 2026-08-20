/**
 * Camera Zoom Utilities for TerraExplorer
 * Provides progressive sensitivity, wheel normalization, and clamped delta calculations
 * to ensure smooth, cinematic descent across planetary, atmospheric, and street-level views.
 */

/**
 * Calculates progressive zoom sensitivity based on current camera distance.
 * Distance range:
 * Global (> 2.5): fast / responsive
 * Continental (2.5 -> 2.0): slightly reduced
 * Regional (2.0 -> 1.75): moderate
 * Atmospheric Approach (1.75 -> 1.55): slow / deliberate
 * OSM Transition (1.55 -> 1.35): very slow, cinematic descent
 * Street level (< 1.35): precise micro-adjustments
 */
export const calculateProgressiveZoomSensitivity = (distance: number): number => {
  const clampedDist = Math.max(1.0, Math.min(8.0, isNaN(distance) ? 4.5 : distance));
  const normalized = (clampedDist - 1.0) / 7.0; // 0 at min (1.0), 1 at max (8.0)
  // Continuous smooth curve: ~0.00045 at 1.0 -> ~0.0035 at 8.0
  return 0.00045 + 0.00305 * Math.pow(normalized, 1.25);
};

/**
 * Calculates the maximum permitted distance change for a single wheel event
 * to prevent large wheel deltas or aggressive flicks from overshooting transition brackets.
 */
export const calculateMaxZoomStep = (distance: number): number => {
  // Scales smoothly with distance: ~0.045 at street/transition level to ~0.24 at global view
  const clampedDist = Math.max(1.0, Math.min(8.0, isNaN(distance) ? 4.5 : distance));
  return Math.max(0.045, Math.min(0.24, clampedDist * 0.055));
};

/**
 * Normalizes wheel delta across pixel, line, and page scrolling modes.
 */
export const normalizeWheelDelta = (deltaY: number, deltaMode: number = 0): number => {
  if (isNaN(deltaY)) return 0;
  if (deltaMode === 1) {
    // DOM_DELTA_LINE (Firefox / Windows line scrolling)
    return deltaY * 28;
  }
  if (deltaMode === 2) {
    // DOM_DELTA_PAGE (Page scrolling)
    return deltaY * 280;
  }
  return deltaY;
};

/**
 * Calculates the clamped delta change for target camera distance from a wheel event.
 */
export const calculateClampedZoomDelta = (
  rawDeltaY: number,
  deltaMode: number = 0,
  currentDistance: number = 4.5
): number => {
  const normalizedDelta = normalizeWheelDelta(rawDeltaY, deltaMode);
  const sensitivity = calculateProgressiveZoomSensitivity(currentDistance);
  const rawStep = normalizedDelta * sensitivity;
  const maxStep = calculateMaxZoomStep(currentDistance);
  return Math.max(-maxStep, Math.min(maxStep, rawStep));
};

/**
 * Authoritative discrete OSM tile zoom levels.
 */
export const OSM_ZOOM_LEVELS = [12, 14, 16, 18, 19] as const;
export type OSMZoomLevel = (typeof OSM_ZOOM_LEVELS)[number];

/**
 * Authoritative camera distance mapping corresponding to discrete OSM tile zooms.
 * Validated against osmTileService hysteresis and detail levels.
 */
export const OSM_ZOOM_DISTANCES: Record<OSMZoomLevel, number> = {
  12: 1.30,
  14: 1.12,
  16: 1.05,
  18: 1.025,
  19: 1.018,
};

/**
 * Authoritative camera distance for transitioning out of OSM back toward the 3D globe.
 */
export const OSM_EXIT_ZOOM_OUT_DISTANCE = 1.65;

/**
 * Minimum normalized wheel delta threshold to trigger one intentional discrete zoom step.
 */
export const OSM_WHEEL_STEP_THRESHOLD = 50;

export interface OSMZoomStepResult {
  targetZoom: OSMZoomLevel;
  targetDistance: number;
  exitsOSM: boolean;
}

/**
 * Calculates the next discrete OSM zoom level and corresponding authoritative camera distance
 * for an intentional zoom step.
 *
 * @param currentZoom - The current active tile zoom level (e.g. 12, 14, 16, 18, 19)
 * @param direction - 'in' | 'out' or a numeric delta where delta < 0 is 'in' (zoom in) and delta > 0 is 'out' (zoom out)
 */
export const calculateOSMZoomStep = (
  currentZoom: number,
  direction: 'in' | 'out' | number
): OSMZoomStepResult => {
  const isZoomIn = typeof direction === 'string' ? direction === 'in' : direction < 0;

  let currentIndex = OSM_ZOOM_LEVELS.indexOf(currentZoom as OSMZoomLevel);
  if (currentIndex === -1) {
    // Fallback: find closest valid zoom level
    if (currentZoom <= 12) currentIndex = 0;
    else if (currentZoom >= 19) currentIndex = OSM_ZOOM_LEVELS.length - 1;
    else {
      let minDiff = Infinity;
      OSM_ZOOM_LEVELS.forEach((lvl, idx) => {
        const diff = Math.abs(lvl - currentZoom);
        if (diff < minDiff) {
          minDiff = diff;
          currentIndex = idx;
        }
      });
    }
  }

  if (isZoomIn) {
    if (currentIndex >= OSM_ZOOM_LEVELS.length - 1) {
      // Clamped at maximum zoom 19
      return {
        targetZoom: 19,
        targetDistance: OSM_ZOOM_DISTANCES[19],
        exitsOSM: false
      };
    }
    const nextZoom = OSM_ZOOM_LEVELS[currentIndex + 1];
    return {
      targetZoom: nextZoom,
      targetDistance: OSM_ZOOM_DISTANCES[nextZoom],
      exitsOSM: false
    };
  } else {
    if (currentIndex <= 0) {
      // Zooming out below zoom 12: trigger transition out of OSM back to the 3D globe
      return {
        targetZoom: 12,
        targetDistance: OSM_EXIT_ZOOM_OUT_DISTANCE,
        exitsOSM: true
      };
    }
    const nextZoom = OSM_ZOOM_LEVELS[currentIndex - 1];
    return {
      targetZoom: nextZoom,
      targetDistance: OSM_ZOOM_DISTANCES[nextZoom],
      exitsOSM: false
    };
  }
};

