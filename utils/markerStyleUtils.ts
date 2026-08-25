import { SkinType } from '../types';

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
 * Enforces a readable minimum marker size threshold (MIN_GLOBE_MARKER_DIAMETER = 22px) so markers never shrink
 * below legible dimensions at close zoom levels immediately preceding OSM transition.
 */
export function calculateGlobeMarkerDiameter(
  cameraDistance: number,
  baseDiameter: number = 26,
  roleScale: number = 1.0,
  minDiameter: number = MIN_GLOBE_MARKER_DIAMETER
): number {
  const zoomScale = calculateGlobeMarkerZoomScale(cameraDistance);
  const calculatedMarkerSize = Math.round(baseDiameter * zoomScale * roleScale * 10) / 10;
  return Math.max(calculatedMarkerSize, minDiameter);
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
  } = {}
): MarkerColors {
  const { isWaypoint = false, isFavorite = false, isAnchor = false, customColor, highwayOutlineColor } = options;

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
  if (isAnchor) {
    return { fill: '#3b82f6', outline: '#ffffff' };
  }
  if (isFavorite) {
    return { fill: '#d946ef', outline: '#ffffff' };
  }
  if (isWaypoint) {
    return { fill: '#00e5ff', outline: '#ffffff' };
  }
  return {
    fill: customColor || '#ff0000',
    outline: '#ffffff'
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
