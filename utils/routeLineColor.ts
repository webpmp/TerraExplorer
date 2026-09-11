import { SkinType } from '../types';

export type MapLayerType = 'globe' | 'osm';

export interface BackgroundContext {
  lat?: number;
  lng?: number;
  isBrightTerrain?: boolean;
}

export interface ConnectingLineColorOptions {
  theme: SkinType;
  mapLayer: MapLayerType;
  backgroundContext?: BackgroundContext;
  routeGroupId?: string;
}

// Deterministic, harmonious theme-based route color palettes for multi-route events
// Uses distinct shades and tints of cyan / teal / sky blue aligned with the Modern theme
export const MODERN_ROUTE_PALETTE_GLOBE = [
  '#00e5ff', // Vibrant Cyan (Default / Primary Route 1)
  '#00b4d8', // Vivid Cerulean / Sky (Route 2)
  '#22d3ee', // Bright Cyan 400 (Route 3)
  '#0ea5e9', // Ocean Sky 500 (Route 4)
  '#38bdf8', // Light Sky 400 (Route 5)
  '#06b6d4'  // Electric Cyan 500 (Route 6)
];

export const MODERN_ROUTE_PALETTE_OSM = [
  '#0891b2', // Deep Cyan 600 (Default / Primary Route 1)
  '#0284c7', // Deep Sky 600 (Route 2)
  '#0e7490', // Dark Cyan 700 (Route 3)
  '#0369a1', // Dark Sky 700 (Route 4)
  '#155e75', // Midnight Cyan 800 (Route 5)
  '#075985'  // Deep Navy Sky 800 (Route 6)
];

/**
 * Deterministically determines whether a geographic coordinate is over bright terrain,
 * such as permanent snow, continental ice sheets, glaciated mountain ranges, or bright salt flats.
 */
export function isBrightTerrainAt(lat: number, lng: number): boolean {
  // 1. Antarctica / Southern Ocean ice sheet
  if (lat <= -60) {
    return true;
  }

  // 2. Greenland Ice Sheet (60°N to 84°N, 75°W to 12°W)
  if (lat >= 60 && lat <= 84 && lng >= -75 && lng <= -12) {
    return true;
  }

  // 3. High Arctic / Northern Ice Caps (e.g. Ellesmere, Svalbard, Novaya Zemlya, Severnaya Zemlya)
  if (lat >= 72) {
    return true;
  }

  // 4. Alaska & St. Elias / Yukon Icefields (58°N to 64°N, 135°W to 155°W)
  if (lat >= 58 && lat <= 64 && lng >= -155 && lng <= -135) {
    return true;
  }

  // 5. Southern Patagonian Ice Field (46°S to 52°S, 72.5°W to 74.5°W)
  if (lat >= -52 && lat <= -46 && lng >= -74.5 && lng <= -72.5) {
    return true;
  }

  // 6. High Himalayas / Karakoram snow/glacier crests (27.5°N to 36.5°N, 74°E to 96°E)
  if (lat >= 27.5 && lat <= 36.5 && lng >= 74 && lng <= 96) {
    return true;
  }

  // 7. Salar de Uyuni & surrounding white salt flats (19.8°S to 20.8°S, 67.0°W to 68.2°W)
  if (lat >= -20.8 && lat <= -19.8 && lng >= -68.2 && lng <= -67.0) {
    return true;
  }

  return false;
}

export function getRouteGroupColorIndex(routeGroupId?: string): number {
  if (!routeGroupId || routeGroupId === 'default' || routeGroupId === 'main') {
    return 0;
  }
  const cleanId = routeGroupId.toLowerCase().trim();
  if (cleanId === 'northern-route') return 0;
  if (cleanId === 'benge-route') return 1;
  if (cleanId === 'bell-route') return 2;
  if (cleanId === 'water-route') return 3;

  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash << 5) - hash + cleanId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % MODERN_ROUTE_PALETTE_GLOBE.length;
}

/**
 * Resolves the contrast-appropriate connecting line color for a route segment or dash mark.
 */
export function getConnectingLineColor(options: ConnectingLineColorOptions): string {
  const { theme, mapLayer, backgroundContext, routeGroupId } = options;

  if (theme === 'parchment') {
    return '#8b5a2b';
  }
  if (theme === 'retro-green') {
    return '#4ade80';
  }
  if (theme === 'retro-amber') {
    return '#fbbf24';
  }

  // Modern theme
  if (mapLayer === 'osm') {
    if (routeGroupId && routeGroupId !== 'default' && routeGroupId !== 'main') {
      const colorIdx = getRouteGroupColorIndex(routeGroupId);
      return MODERN_ROUTE_PALETTE_OSM[colorIdx];
    }
    return '#111111';
  }

  // Modern Globe: Check if underlying terrain is bright
  const colorIdx = getRouteGroupColorIndex(routeGroupId);
  if (backgroundContext) {
    if (backgroundContext.isBrightTerrain === true) {
      return '#111111';
    }
    if (typeof backgroundContext.lat === 'number' && typeof backgroundContext.lng === 'number') {
      if (isBrightTerrainAt(backgroundContext.lat, backgroundContext.lng)) {
        return '#111111';
      }
    }
  }

  return MODERN_ROUTE_PALETTE_GLOBE[colorIdx];
}

