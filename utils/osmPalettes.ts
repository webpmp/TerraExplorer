import { SkinType } from '../types';

export interface OsmThemePalette {
  water: string;
  land: string;
  ice: string;
  park: string;
  urban: string;
  roads: string;
  highways: string;
  labels: string;
  borders: string;
  cssFilter: string;
  svgFilterId?: string;
}

/**
 * High-contrast monochrome CRT Green palette:
 * Luminance hierarchy: Water (darkest, near-black) -> Land (dark-to-medium) -> Ice/Snow (noticeably lighter pale green)
 */
export const retroGreenOsmPalette: OsmThemePalette = {
  water: '#041409',     // Very dark green / near-black (luminance ~0.06)
  land: '#0f381c',      // Dark-to-medium green (luminance ~0.24)
  ice: '#86efac',       // Noticeably lighter pale/desaturated green (luminance ~0.72)
  park: '#16532d',      // Distinguishable from regular land without becoming bright (luminance ~0.32)
  urban: '#134223',     // Subtle variation from surrounding land (luminance ~0.26)
  roads: '#22c55e',     // Primary/secondary roads (luminance ~0.45)
  highways: '#4ade80',  // Major highways: most visible (luminance ~0.60)
  labels: '#bbf7d0',    // Readable light green against dark map (luminance ~0.80)
  borders: '#15803d',   // Subdued administrative boundaries (luminance ~0.35)
  cssFilter: 'url(#retro-green-osm-filter), grayscale(100%) brightness(0.78) sepia(100%) hue-rotate(90deg) contrast(1.75)',
  svgFilterId: 'retro-green-osm-filter'
};

/**
 * High-contrast monochrome CRT Amber palette:
 * Luminance hierarchy: Water (darkest, near-black) -> Land (dark-to-medium) -> Ice/Snow (noticeably lighter pale amber)
 */
export const retroAmberOsmPalette: OsmThemePalette = {
  water: '#140a02',     // Very dark brown / near-black (luminance ~0.06)
  land: '#3b200a',      // Dark-to-medium amber/brown (luminance ~0.24)
  ice: '#fef08a',       // Noticeably lighter pale/desaturated amber (luminance ~0.72)
  park: '#54300e',      // Distinguishable from regular land without becoming bright (luminance ~0.32)
  urban: '#44260d',     // Subtle variation from surrounding land (luminance ~0.26)
  roads: '#d97706',     // Primary/secondary roads (luminance ~0.45)
  highways: '#fbbf24',  // Major highways: most visible (luminance ~0.60)
  labels: '#fef3c7',    // Readable light amber against dark map (luminance ~0.80)
  borders: '#92400e',   // Subdued administrative boundaries (luminance ~0.35)
  cssFilter: 'url(#retro-amber-osm-filter), grayscale(100%) brightness(0.80) sepia(100%) hue-rotate(5deg) contrast(1.65)',
  svgFilterId: 'retro-amber-osm-filter'
};

/**
 * Standard Modern palette (unchanged)
 */
export const modernOsmPalette: OsmThemePalette = {
  water: '#a5bfdd',
  land: '#f4f3f0',
  ice: '#f8fcff',
  park: '#d8e8c8',
  urban: '#ece8e0',
  roads: '#ffffff',
  highways: '#ffc480',
  labels: '#4d5b6a',
  borders: '#808080',
  cssFilter: 'contrast(1.05)'
};

/**
 * Standard Parchment palette (unchanged)
 */
export const parchmentOsmPalette: OsmThemePalette = {
  water: '#c4b59a',
  land: '#f4ead5',
  ice: '#faf6ee',
  park: '#d4c7a3',
  urban: '#e8dcbf',
  roads: '#e8dfc8',
  highways: '#d2b48c',
  labels: '#3e2723',
  borders: '#8b5a2b',
  cssFilter: 'contrast(1.05)'
};

/**
 * Returns the theme-specific OSM palette for a given skin
 */
export function getOsmPalette(skin: SkinType): OsmThemePalette {
  switch (skin) {
    case 'retro-green':
      return retroGreenOsmPalette;
    case 'retro-amber':
      return retroAmberOsmPalette;
    case 'parchment':
      return parchmentOsmPalette;
    case 'modern':
    default:
      return modernOsmPalette;
  }
}

/**
 * Returns the theme-specific image filter for InfoPanel thumbnails and Lightbox enlarged views.
 * Restrained monochrome CRT phosphor treatment for Retro Green and Retro Amber:
 * - Reduced overall brightness
 * - Increased contrast
 * - Darker shadows and controlled highlights
 * - Desaturated source colors
 * - Subtle, photographic monochrome phosphor tint
 */
export function getImageFilter(skin: SkinType, layer: 'active' | 'pile1' | 'pile2' = 'active'): string | undefined {
  if (skin === 'retro-green') {
    if (layer === 'pile1') {
      return 'grayscale(100%) brightness(0.68) contrast(1.35) sepia(100%) hue-rotate(88deg) saturate(150%)';
    }
    if (layer === 'pile2') {
      return 'grayscale(100%) brightness(0.58) contrast(1.20) sepia(100%) hue-rotate(88deg) saturate(130%)';
    }
    return 'grayscale(100%) brightness(0.78) contrast(1.55) sepia(100%) hue-rotate(88deg) saturate(180%)';
  }

  if (skin === 'retro-amber') {
    if (layer === 'pile1') {
      return 'grayscale(100%) brightness(0.70) contrast(1.30) sepia(100%) hue-rotate(5deg) saturate(145%)';
    }
    if (layer === 'pile2') {
      return 'grayscale(100%) brightness(0.60) contrast(1.15) sepia(100%) hue-rotate(5deg) saturate(125%)';
    }
    return 'grayscale(100%) brightness(0.80) contrast(1.50) sepia(100%) hue-rotate(5deg) saturate(175%)';
  }

  return undefined;
}
