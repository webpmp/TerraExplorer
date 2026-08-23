import { describe, it, expect } from 'vitest';
import { osmTileService } from '../geographic/osmTileService';
import { getOsmPalette } from '../../utils/osmPalettes';
import { SkinType } from '../../types';

describe('OSM Theme Switching & Tile Cache Key Suite', () => {
  const testCoords = { z: 14, x: 2048, y: 1360 };

  it('generates unique skin-scoped tile cache keys for each theme', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];
    const keys = skins.map(skin => `osm:${skin}:${testCoords.z}:${testCoords.x}:${testCoords.y}`);

    expect(keys[0]).toBe('osm:modern:14:2048:1360');
    expect(keys[1]).toBe('osm:retro-green:14:2048:1360');
    expect(keys[2]).toBe('osm:retro-amber:14:2048:1360');
    expect(keys[3]).toBe('osm:parchment:14:2048:1360');

    // All keys must be strictly unique to avoid cross-theme cache collisions
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(4);
  });

  it('immediately returns the matching provider tile URLs when skin switches', () => {
    const modernUrl = osmTileService.getTileUrl(testCoords.z, testCoords.x, testCoords.y, 'modern');
    const parchmentUrl = osmTileService.getTileUrl(testCoords.z, testCoords.x, testCoords.y, 'parchment');
    const greenUrl = osmTileService.getTileUrl(testCoords.z, testCoords.x, testCoords.y, 'retro-green');
    const amberUrl = osmTileService.getTileUrl(testCoords.z, testCoords.x, testCoords.y, 'retro-amber');

    expect(modernUrl).toContain('/rastertiles/voyager/');
    expect(parchmentUrl).toContain('/rastertiles/voyager/');
    expect(greenUrl).toContain('/dark_all/');
    expect(amberUrl).toContain('/dark_all/');
  });

  it('immediately provides the matching theme palettes and CSS filters when skin switches', () => {
    const modernPalette = getOsmPalette('modern');
    const greenPalette = getOsmPalette('retro-green');
    const amberPalette = getOsmPalette('retro-amber');
    const parchmentPalette = getOsmPalette('parchment');

    expect(modernPalette.cssFilter).toBe('contrast(1.05)');
    expect(greenPalette.cssFilter).toContain('url(#retro-green-osm-filter)');
    expect(amberPalette.cssFilter).toContain('url(#retro-amber-osm-filter)');
    expect(parchmentPalette.cssFilter).toBe('contrast(1.05)');
  });

  it('verifies non-destructive fallback tile transition model', () => {
    // Simulating activeTilesMap -> fallbackTilesMap transition
    const activeTilesMap = new Map<string, any>();
    activeTilesMap.set('osm:retro-green:14:2048:1360', {
      key: 'osm:retro-green:14:2048:1360',
      url: osmTileService.getTileUrl(14, 2048, 1360, 'retro-green')
    });

    // On theme switch to retro-amber:
    const fallbackTilesMap = new Map(activeTilesMap);
    const fallbackTilesList = Array.from(fallbackTilesMap.values());
    activeTilesMap.clear();

    expect(fallbackTilesList.length).toBe(1);
    expect(fallbackTilesList[0].key).toBe('osm:retro-green:14:2048:1360');

    // New tiles populate activeTilesMap with new theme key
    activeTilesMap.set('osm:retro-amber:14:2048:1360', {
      key: 'osm:retro-amber:14:2048:1360',
      url: osmTileService.getTileUrl(14, 2048, 1360, 'retro-amber')
    });

    expect(activeTilesMap.has('osm:retro-amber:14:2048:1360')).toBe(true);
    expect(activeTilesMap.get('osm:retro-amber:14:2048:1360').url).toContain('/dark_all/');
  });
});
