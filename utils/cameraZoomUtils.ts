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
