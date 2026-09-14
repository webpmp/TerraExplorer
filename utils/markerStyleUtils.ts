import { SkinType } from '../types';
import { getRouteGroupColorIndex, MODERN_ROUTE_PALETTE_GLOBE } from './routeLineColor';

export interface MarkerColors {
  fill: string;
  outline: string;
}

export interface MarkerNumberStyle {
  color: string;
  fontWeight: 'bold';
  lineHeight: number;
  textShadow?: string;
}

export const MIN_GLOBE_MARKER_DIAMETER = 22;
export const MIN_MARKER_FONT_SIZE = 7.0;

/**
 * Calculates zoom-aware visual marker scale factor based on camera distance to globe center.
 * As camera zooms in (distance decreases towards OSM_DETAIL_THRESHOLD 1.45), markers scale smoothly
 * from 1.0 (overview distance >= 5.0) to 0.72 (close zoom distance <= 1.45).
 */
export function calculateGlobeMarkerZoomScale(
  cameraDistance: number,
  minScale: number = 0.72,
  maxScale: number = 1.0,
  minDist: number = 1.45,
  maxDist: number = 5.0
): number {
  if (cameraDistance <= minDist) return minScale;
  if (cameraDistance >= maxDist) return maxScale;
  const t = (cameraDistance - minDist) / (maxDist - minDist);
  return Math.round((minScale + t * (maxScale - minScale)) * 1000) / 1000;
}

/**
 * Calculates the dynamic pixel diameter for a 3D globe marker given camera distance, base diameter, and role scale.
 * - Parchment: base diameter 26px at overview (distance >= 5.0), scaling with zoomScale down to 22px clamp near OSM threshold (unchanged).
 * - Modern, Retro Green, Retro Amber: ~17.5px at maximum zoom-out (distance >= 5.0), smoothly and continuously growing to 22.0px
 *   as the camera zooms in towards the location (distance -> 1.45) with zero jumps, plateaus, or thresholds.
 */
export function calculateGlobeMarkerDiameter(
  cameraDistance: number,
  baseDiameter?: number,
  roleScale: number = 1.0,
  minDiameter?: number,
  skin?: SkinType
): number {
  const isParchment = skin === 'parchment' || (!skin && baseDiameter === 26);
  if (isParchment) {
    const effectiveBase = baseDiameter ?? 26;
    const effectiveMin = minDiameter ?? MIN_GLOBE_MARKER_DIAMETER;
    const zoomScale = calculateGlobeMarkerZoomScale(cameraDistance);
    const calculatedMarkerSize = Math.round(effectiveBase * zoomScale * roleScale * 10) / 10;
    return Math.max(calculatedMarkerSize, effectiveMin);
  }

  // Modern, Retro Green, Retro Amber (and default themes):
  // Far overview (max zoom-out, distance >= 5.0): strictly 17.5px (within 16-18px target)
  // Close camera approach (distance <= 1.45): 22.0px (larger close-range marker)
  // Continuous smooth linear interpolation based on cameraDistance:
  // cameraDistance decreases -> marker diameter increases
  const FAR_DIAMETER = 17.5;
  const NEAR_DIAMETER = 22.0;
  const effectiveMin = minDiameter ?? 16.0;

  const minDist = 1.45;
  const maxDist = 5.0;
  const clampedDist = Math.max(minDist, Math.min(maxDist, cameraDistance));
  const t = (clampedDist - minDist) / (maxDist - minDist); // 0 at close zoom (1.45), 1 at max zoom-out (5.0)

  // Smooth continuous interpolation:
  // When t = 1 (distance >= 5.0): size = FAR_DIAMETER (17.5px)
  // When t = 0 (distance <= 1.45): size = NEAR_DIAMETER (22.0px)
  const interpolatedSize = NEAR_DIAMETER - t * (NEAR_DIAMETER - FAR_DIAMETER);
  const calculatedMarkerSize = Math.round(interpolatedSize * roleScale * 10) / 10;
  return Math.max(calculatedMarkerSize, effectiveMin);
}

/**
 * Calculates proportional font size for waypoint numbers based on marker diameter and digit count.
 * Single-digit markers scale at ~58% of diameter (e.g. 9.3px on 16px, 12.8px on 22px, 15.1px on 26px).
 * Multi-digit markers (10+) scale at ~44% of diameter (e.g. 7.0px on 16px, 9.7px on 22px, 11.4px on 26px).
 * Clamps to a readable minimum threshold (7.0px for multi-digit, 9.0px for single-digit).
 */
export function calculateMarkerFontSize(
  diameter: number,
  isMultiDigit: boolean = false,
  minFontSize: number = isMultiDigit ? MIN_MARKER_FONT_SIZE : 9.0
): number {
  const ratio = isMultiDigit ? 0.44 : 0.58;
  const calculatedNumberSize = Math.round(diameter * ratio * 10) / 10;
  return Math.max(calculatedNumberSize, minFontSize);
}

/**
 * Calculates proportional border stroke width for visual markers.
 * For Parchment, uses a thinner ~6% ratio (~3px on ~49.4px diameter) so the perimeter does not dominate.
 * For standard themes, uses ~12% ratio (matching OSM's 2px on 16px).
 */
export function calculateMarkerBorderWidth(diameter: number, skin?: SkinType): number {
  const ratio = skin === 'parchment' ? 0.06 : 0.12;
  return Math.max(1.5, Math.round(diameter * ratio * 10) / 10);
}

/**
 * Resolves standard visual marker colors across themes.
 * Single source of truth for both OpenStreetMap and 3D Globe views.
 */
export function getThemeMarkerColors(
  skin: SkinType,
  options: {
    isWaypoint?: boolean;
    isFavorite?: boolean;
    isAnchor?: boolean;
    customColor?: string;
    highwayOutlineColor?: string;
    routeGroupId?: string;
  } = {}
): MarkerColors {
  const { isWaypoint = false, isFavorite = false, isAnchor = false, customColor, highwayOutlineColor, routeGroupId } = options;

  if (skin === 'parchment') {
    return {
      fill: isFavorite ? '#8b0000' : (isWaypoint ? '#8b5a2b' : (customColor || '#8b5a2b')),
      outline: '#f4ead5'
    };
  }

  if (skin === 'retro-green') {
    return {
      fill: isFavorite ? '#ffffff' : (isWaypoint ? '#000000' : (customColor || '#a3e635')),
      outline: highwayOutlineColor || '#4ade80'
    };
  }

  if (skin === 'retro-amber') {
    return {
      fill: isFavorite ? '#ffffff' : (isWaypoint ? '#000000' : (customColor || '#fcd34d')),
      outline: highwayOutlineColor || '#fbbf24'
    };
  }

  // Modern skin
  // Inner ring (outline) uses the exact same color as the center fill, while outer ring is rendered white via boxShadow.
  if (isAnchor) {
    return { fill: '#3b82f6', outline: '#3b82f6' };
  }
  if (isFavorite) {
    return { fill: '#d946ef', outline: '#d946ef' };
  }
  if (isWaypoint) {
    if (customColor) {
      return { fill: customColor, outline: customColor };
    }
    const colorIdx = getRouteGroupColorIndex(routeGroupId);
    const fill = MODERN_ROUTE_PALETTE_GLOBE[colorIdx];
    return { fill, outline: fill };
  }
  const fill = customColor || '#ff0000';
  return {
    fill,
    outline: fill
  };
}

/**
 * Resolves box shadow for markers across themes.
 * For Parchment, uses a subtle 1.5px white outer separation ring on selection (and 1px on unselected)
 * with a soft drop shadow, avoiding a heavy visual perimeter.
 */
export function getMarkerBoxShadow(skin: SkinType, isSelected: boolean): string {
  if (skin === 'parchment') {
    if (isSelected) {
      return '0 0 0 1.5px rgba(255, 255, 255, 0.85), 0 2px 6px rgba(0, 0, 0, 0.5)';
    }
    return '0 0 0 1px rgba(255, 255, 255, 0.6), 0 1px 4px rgba(0, 0, 0, 0.4)';
  }

  if (isSelected) {
    return '0 0 0 3px rgba(255, 255, 255, 0.85), 0 2px 6px rgba(0, 0, 0, 0.5)';
  }
  return '0 1px 4px rgba(0, 0, 0, 0.4)';
}

/**
 * Resolves waypoint number typography styles across themes.
 * Uses crisp white text (#ffffff) across MODERN, RETRO GREEN, RETRO AMBER, and PARCHMENT themes
 * for maximum legibility on dark/colored marker backgrounds.
 */
export function getWaypointNumberStyle(skin: SkinType): MarkerNumberStyle {
  if (skin === 'parchment') {
    return {
      color: '#ffffff',
      fontWeight: 'bold',
      lineHeight: 1
    };
  }

  if (skin === 'retro-green' || skin === 'retro-amber') {
    return {
      color: '#ffffff',
      fontWeight: 'bold',
      lineHeight: 1
    };
  }

  // Modern
  return {
    color: '#ffffff',
    fontWeight: 'bold',
    lineHeight: 1
  };
}

/**
 * Resolves base visual marker scale factor across themes.
 * Modern, Retro Green, and Retro Amber scale at 0.91 to render an approximately 20px visual marker
 * from the standard 22px base size, while Parchment retains 1.0 scale.
 */
export function getThemeMarkerScale(skin?: SkinType): number {
  if (skin === 'parchment') {
    return 1.0;
  }
  return 0.91;
}

