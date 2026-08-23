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
}

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

/**
 * Resolves the contrast-appropriate connecting line color for a route segment or dash mark.
 */
export function getConnectingLineColor(options: ConnectingLineColorOptions): string {
  const { theme, mapLayer, backgroundContext } = options;

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
    return '#111111';
  }

  // Modern Globe: Check if underlying terrain is bright
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

  return '#00e5ff'; // Vibrant cyan on dark globe background
}
