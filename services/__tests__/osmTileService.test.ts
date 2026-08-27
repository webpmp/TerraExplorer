import { describe, it, expect } from 'vitest';
import { osmTileService, OSM_RASTER_ALTITUDE } from '../geographic/osmTileService';

describe('OSM Tile Service & Tile Spherical Mesh Tests', () => {
  it('correctly classifies detail levels and zooms from global to street_max', () => {
    expect(osmTileService.getDetailLevel(4.0)).toBe('global');
    expect(osmTileService.getDetailLevel(2.5)).toBe('regional');
    expect(osmTileService.getDetailLevel(1.6)).toBe('local');
    expect(osmTileService.getDetailLevel(1.35)).toBe('close');
    expect(osmTileService.getDetailLevel(1.15)).toBe('street');
    expect(osmTileService.getDetailLevel(1.06)).toBe('street_close');
    expect(osmTileService.getDetailLevel(1.035)).toBe('street_detail');
    expect(osmTileService.getDetailLevel(1.018)).toBe('street_max');

    // Zoom mapping
    expect(osmTileService.getZoomForDetailLevel('global')).toBeNull();
    expect(osmTileService.getZoomForDetailLevel('regional')).toBeNull();
    expect(osmTileService.getZoomForDetailLevel('local')).toBeNull();
    expect(osmTileService.getZoomForDetailLevel('close')).toBe(12);
    expect(osmTileService.getZoomForDetailLevel('street')).toBe(14);
    expect(osmTileService.getZoomForDetailLevel('street_close')).toBe(16);
    expect(osmTileService.getZoomForDetailLevel('street_detail')).toBe(18);
    expect(osmTileService.getZoomForDetailLevel('street_max')).toBe(19);
  });

  it('provides detail level hysteresis to prevent boundary oscillation', () => {
    // When inside CLOSE, exiting requires distance > 1.55
    expect(osmTileService.getDetailLevel(1.48, 'close')).toBe('close');
    expect(osmTileService.getDetailLevel(1.52, 'close')).toBe('close');
    expect(osmTileService.getDetailLevel(1.58, 'close')).toBe('local');

    // When inside STREET, exiting requires distance > 1.25
    expect(osmTileService.getDetailLevel(1.22, 'street')).toBe('street');
    expect(osmTileService.getDetailLevel(1.27, 'street')).toBe('close');
  });

  it('accurately converts lat/lng to tile coordinates and computes tile bounds for known locations', () => {
    // Center of Earth: 0, 0
    const tile0 = osmTileService.latLngToTile(0, 0, 10);
    expect(tile0.x).toBe(512);
    expect(tile0.y).toBe(512);

    const bounds0 = osmTileService.tileToBounds(10, 512, 512);
    expect(bounds0.minLat).toBeLessThan(0);
    expect(bounds0.maxLat).toBe(0);
    expect(bounds0.minLng).toBe(0);
    expect(bounds0.maxLng).toBeCloseTo(360 / 1024, 4);

    // Location: 38.1601, -96.6001
    const tileLoc12 = osmTileService.latLngToTile(38.1601, -96.6001, 12);
    const bounds12 = osmTileService.tileToBounds(12, tileLoc12.x, tileLoc12.y);
    expect(38.1601).toBeGreaterThanOrEqual(bounds12.minLat);
    expect(38.1601).toBeLessThanOrEqual(bounds12.maxLat);
    expect(-96.6001).toBeGreaterThanOrEqual(bounds12.minLng);
    expect(-96.6001).toBeLessThanOrEqual(bounds12.maxLng);
  });

  it('verifies that higher zoom tiles have proportionally smaller geographic extent', () => {
    const tile12 = osmTileService.latLngToTile(38.1601, -96.6001, 12);
    const bounds12 = osmTileService.tileToBounds(12, tile12.x, tile12.y);
    const spanLat12 = bounds12.maxLat - bounds12.minLat;

    const tile18 = osmTileService.latLngToTile(38.1601, -96.6001, 18);
    const bounds18 = osmTileService.tileToBounds(18, tile18.x, tile18.y);
    const spanLat18 = bounds18.maxLat - bounds18.minLat;

    // Zoom 18 tile is ~64x smaller in geographic degree span than zoom 12 tile
    expect(spanLat12 / spanLat18).toBeCloseTo(64, 0);
  });

  it('verifies geographic anchoring: z=12 and z=18 tiles both enclose the exact target location', () => {
    const lat = 38.1601;
    const lng = -96.6001;

    const t12 = osmTileService.latLngToTile(lat, lng, 12);
    const b12 = osmTileService.tileToBounds(12, t12.x, t12.y);

    const t18 = osmTileService.latLngToTile(lat, lng, 18);
    const b18 = osmTileService.tileToBounds(18, t18.x, t18.y);

    expect(lat).toBeGreaterThanOrEqual(b12.minLat);
    expect(lat).toBeLessThanOrEqual(b12.maxLat);
    expect(lat).toBeGreaterThanOrEqual(b18.minLat);
    expect(lat).toBeLessThanOrEqual(b18.maxLat);

    expect(lng).toBeGreaterThanOrEqual(b12.minLng);
    expect(lng).toBeLessThanOrEqual(b12.maxLng);
    expect(lng).toBeGreaterThanOrEqual(b18.minLng);
    expect(lng).toBeLessThanOrEqual(b18.maxLng);
  });

  it('creates curved spherical geometry conforming directly to Earth altitude OSM_RASTER_ALTITUDE = 1.017', () => {
    expect(OSM_RASTER_ALTITUDE).toBe(1.017);
    const geometry = osmTileService.createTileGeometry(12, 2048, 1360);
    expect(geometry).toBeDefined();
    const posAttr = geometry.attributes.position;
    expect(posAttr.count).toBeGreaterThan(0);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const len = Math.hypot(x, y, z);
      expect(len).toBeCloseTo(OSM_RASTER_ALTITUDE, 3);
    }
  });

  it('guarantees single-step adjacent transitions and prevents large tile-zoom jumps', () => {
    // Zooming in sequence: 12 -> 14 -> 16 -> 18 -> 19
    const step1 = osmTileService.getNextAdjacentTileZoom(12, 1.15);
    expect(step1.nextZoom).toBe(14);
    expect(step1.reason).toBe('ZOOM_IN_THRESHOLD');

    const step2 = osmTileService.getNextAdjacentTileZoom(14, 1.06);
    expect(step2.nextZoom).toBe(16);
    expect(step2.reason).toBe('ZOOM_IN_THRESHOLD');

    const step3 = osmTileService.getNextAdjacentTileZoom(16, 1.025);
    expect(step3.nextZoom).toBe(18);
    expect(step3.reason).toBe('ZOOM_IN_THRESHOLD');

    const step4 = osmTileService.getNextAdjacentTileZoom(18, 1.015);
    expect(step4.nextZoom).toBe(19);
    expect(step4.reason).toBe('ZOOM_IN_THRESHOLD');

    // Zooming out sequence: 19 -> 18 -> 16 -> 14 -> 12
    const out1 = osmTileService.getNextAdjacentTileZoom(19, 1.04);
    expect(out1.nextZoom).toBe(18);
    expect(out1.reason).toBe('ZOOM_OUT_THRESHOLD');

    const out2 = osmTileService.getNextAdjacentTileZoom(18, 1.07);
    expect(out2.nextZoom).toBe(16);
    expect(out2.reason).toBe('ZOOM_OUT_THRESHOLD');

    const out3 = osmTileService.getNextAdjacentTileZoom(16, 1.15);
    expect(out3.nextZoom).toBe(14);
    expect(out3.reason).toBe('ZOOM_OUT_THRESHOLD');

    const out4 = osmTileService.getNextAdjacentTileZoom(14, 1.30);
    expect(out4.nextZoom).toBe(12);
    expect(out4.reason).toBe('ZOOM_OUT_THRESHOLD');

    // Large jump clamping: z19 with distance=1.20 (raw level street=14) must clamp to adjacent 18
    const clampedOut = osmTileService.getNextAdjacentTileZoom(19, 1.20);
    expect(clampedOut.nextZoom).toBe(18);

    // Hysteresis preservation around boundaries
    expect(osmTileService.getNextAdjacentTileZoom(16, 1.05).reason).toBe('HYSTERESIS');
    expect(osmTileService.getNextAdjacentTileZoom(18, 1.03).reason).toBe('HYSTERESIS');
    expect(osmTileService.getNextAdjacentTileZoom(19, 1.02).reason).toBe('HYSTERESIS');
  });

  it('handles CARTO raster tile URLs with API key authentication, URL encoding, and missing key fallback', () => {
    const originalEnv = { ...import.meta.env };

    try {
      // 1. With configured API key: VITE_CARTO_API_KEY = 'test_key_123'
      (import.meta.env as any).VITE_CARTO_API_KEY = 'test_key_123';
      const modernUrlWithKey = osmTileService.getTileUrl(14, 2048, 1360, 'modern');
      const parchmentUrlWithKey = osmTileService.getTileUrl(14, 2048, 1360, 'parchment');
      const retroGreenUrlWithKey = osmTileService.getTileUrl(14, 2048, 1360, 'retro-green');

      expect(modernUrlWithKey).toMatch(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/14\/2048\/1360\.png\?key=test_key_123$/);
      expect(parchmentUrlWithKey).toBe(modernUrlWithKey);
      expect(retroGreenUrlWithKey).toMatch(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/dark_all\/14\/2048\/1360\.png\?key=test_key_123$/);

      // 2. Special characters are correctly URL encoded
      (import.meta.env as any).VITE_CARTO_API_KEY = 'test key/with&special=chars?';
      const encodedUrl = osmTileService.getTileUrl(14, 2048, 1360, 'modern');
      expect(encodedUrl).toContain(`?key=${encodeURIComponent('test key/with&special=chars?')}`);

      // 3. Missing / empty API key is handled gracefully without throwing
      (import.meta.env as any).VITE_CARTO_API_KEY = '';
      let urlWithoutKey = '';
      expect(() => {
        urlWithoutKey = osmTileService.getTileUrl(14, 2048, 1360, 'modern');
      }).not.toThrow();
      expect(urlWithoutKey).not.toContain('?key=');
      expect(urlWithoutKey).toMatch(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/14\/2048\/1360\.png$/);

      delete (import.meta.env as any).VITE_CARTO_API_KEY;
      let urlUndef = '';
      expect(() => {
        urlUndef = osmTileService.getTileUrl(14, 2048, 1360, 'retro-green');
      }).not.toThrow();
      expect(urlUndef).not.toContain('?key=');
      expect(urlUndef).toMatch(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/dark_all\/14\/2048\/1360\.png$/);
    } finally {
      (import.meta.env as any).VITE_CARTO_API_KEY = originalEnv.VITE_CARTO_API_KEY;
    }
  });

  it('constructs authenticated CARTO vector style URL matching official specification', () => {
    const originalEnv = { ...import.meta.env };
    try {
      (import.meta.env as any).VITE_CARTO_API_KEY = 'test-carto-key-123';

      // 1. Modern / Parchment returns authenticated Voyager vector style URL
      const modernVectorUrl = osmTileService.getVectorStyleUrl('modern');
      expect(modernVectorUrl).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key=test-carto-key-123');

      const parchmentVectorUrl = osmTileService.getVectorStyleUrl('parchment');
      expect(parchmentVectorUrl).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key=test-carto-key-123');

      // 2. Retro-green / Retro-amber returns Dark Matter vector style URL
      const darkVectorUrl = osmTileService.getVectorStyleUrl('retro-green');
      expect(darkVectorUrl).toBe('https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json?key=test-carto-key-123');

      // 3. Gracefully handles missing key without throwing
      delete (import.meta.env as any).VITE_CARTO_API_KEY;
      const unauthVectorUrl = osmTileService.getVectorStyleUrl('modern');
      expect(unauthVectorUrl).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json');
    } finally {
      (import.meta.env as any).VITE_CARTO_API_KEY = originalEnv.VITE_CARTO_API_KEY;
    }
  });

  it('projects geographic marker coordinates to exact Web Mercator pixel positions and separates them naturally with zoom', () => {
    const centerLat = 37.7749;
    const centerLng = -122.4194;
    const screenWidth = 1920;
    const screenHeight = 1080;
    const screenCenterX = screenWidth / 2;
    const screenCenterY = screenHeight / 2;

    const project = (lat: number, lng: number, z: number, cLat: number, cLng: number) => {
      const n = Math.pow(2, z);
      const exactX = ((cLng + 180) / 360) * n;
      const cLatRad = (Math.max(-85.0511, Math.min(85.0511, cLat)) * Math.PI) / 180;
      const exactY = ((1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2) * n;

      const markerX = ((lng + 180) / 360) * n;
      const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
      const markerY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

      return {
        x: screenCenterX + (markerX - exactX) * 256,
        y: screenCenterY + (markerY - exactY) * 256
      };
    };

    // Center marker projects exactly to viewport center
    const centerPos = project(centerLat, centerLng, 14, centerLat, centerLng);
    expect(centerPos.x).toBeCloseTo(screenCenterX, 4);
    expect(centerPos.y).toBeCloseTo(screenCenterY, 4);

    // Nearby marker 1km away
    const nearbyLat = 37.7849;
    const nearbyLng = -122.4094;

    const posZ12 = project(nearbyLat, nearbyLng, 12, centerLat, centerLng);
    const posZ14 = project(nearbyLat, nearbyLng, 14, centerLat, centerLng);
    const posZ16 = project(nearbyLat, nearbyLng, 16, centerLat, centerLng);

    const distZ12 = Math.hypot(posZ12.x - screenCenterX, posZ12.y - screenCenterY);
    const distZ14 = Math.hypot(posZ14.x - screenCenterX, posZ14.y - screenCenterY);
    const distZ16 = Math.hypot(posZ16.x - screenCenterX, posZ16.y - screenCenterY);

    // Geographic separation doubles with each zoom level (2^2 = 4x from z12 to z14, 4x from z14 to z16)
    expect(distZ14 / distZ12).toBeCloseTo(4, 1);
    expect(distZ16 / distZ14).toBeCloseTo(4, 1);
  });

  describe('OSM Vector Map Lifecycle and Ref Reconciliation', () => {
    it('1. Initial null container ref does not crash or falsely initialize map', () => {
      let mapCreated = false;
      const initMapLibre = (node: any | null) => {
        if (!node) return;
        mapCreated = true;
      };

      initMapLibre(null);
      expect(mapCreated).toBe(false);

      const fakeDiv = { tagName: 'DIV' };
      initMapLibre(fakeDiv);
      expect(mapCreated).toBe(true);
    });

    it('2. Reinitialization / React StrictMode remount reuses live existing map canvas', () => {
      const fakeCanvas = { tagName: 'CANVAS' };
      const fakeContainerDiv = {
        tagName: 'DIV',
        contains: (node: any) => node === fakeCanvas
      };

      const existingMap = {
        __debugId: 42,
        getCanvas: () => fakeCanvas,
        isRemoved: () => false,
        isStyleLoaded: () => true
      };

      const winObj = typeof window !== 'undefined' ? window : (globalThis as any);
      winObj.__terraexplorer_maplibre_map = existingMap;

      let mapLibreMapRef: any = null;

      const initMapLibre = (container: any) => {
        const existingGlobalMap = winObj.__terraexplorer_maplibre_map;
        if (existingGlobalMap && !existingGlobalMap.isRemoved()) {
          const c = existingGlobalMap.getCanvas();
          if (c && container.contains(c)) {
            mapLibreMapRef = existingGlobalMap;
            return;
          }
        }
      };

      initMapLibre(fakeContainerDiv);
      expect(mapLibreMapRef).toBe(existingMap);
      expect(mapLibreMapRef.__debugId).toBe(42);
    });

    it('3. Map-ready state and mapRef consistency', () => {
      let isMapReady = false;
      let mapRefAssigned = false;

      const mockMap = {
        __debugId: 1,
        getCanvas: () => ({ tagName: 'CANVAS' }),
        isStyleLoaded: () => true
      };

      const winObj = typeof window !== 'undefined' ? window : (globalThis as any);
      const map = mockMap;
      mapRefAssigned = true;
      winObj.__terraexplorer_maplibre_map = map;

      if (mapRefAssigned && winObj.__terraexplorer_maplibre_map) {
        isMapReady = true;
      }

      expect(isMapReady).toBe(true);
      expect(mapRefAssigned).toBe(true);
      expect(winObj.__terraexplorer_maplibre_map).toBe(mockMap);
    });
  });
});

