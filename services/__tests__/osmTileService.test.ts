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
});
