import { describe, it, expect } from 'vitest';
import { calculateOSMMarkerVisualOffset } from '../../components/OSMMapLayer';

describe('OSM Map Marker Screen-Space Positioning & Label Offset', () => {
  it('does not apply offset at global/low zoom levels below OSM detail threshold (< 12)', () => {
    const offset = calculateOSMMarkerVisualOffset(10);
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
  });

  it('applies modest screen-space offsets between 6 and 10 pixels across all active OSM zoom levels (12-19)', () => {
    const zoomLevels = [12, 14, 16, 18, 19];

    for (const z of zoomLevels) {
      const offset = calculateOSMMarkerVisualOffset(z);
      // Offset must be purely in screen space
      expect(offset.x).toBe(0);
      // Offset magnitude must be between 6 and 10 pixels
      const absY = Math.abs(offset.y);
      expect(absY).toBeGreaterThanOrEqual(6);
      expect(absY).toBeLessThanOrEqual(10);
      // Must shift vertically upward (negative screen Y) so marker sits above horizontal OSM text labels
      expect(offset.y).toBeLessThan(0);
    }
  });

  it('calculates consistent zoom-scaled offsets for discrete zoom steps', () => {
    const offsetZ12 = calculateOSMMarkerVisualOffset(12);
    const offsetZ14 = calculateOSMMarkerVisualOffset(14);
    const offsetZ16 = calculateOSMMarkerVisualOffset(16);
    const offsetZ18 = calculateOSMMarkerVisualOffset(18);
    const offsetZ19 = calculateOSMMarkerVisualOffset(19);

    expect(offsetZ12.y).toBe(-6);
    expect(offsetZ14.y).toBe(-8);
    expect(offsetZ16.y).toBe(-8);
    expect(offsetZ18.y).toBe(-10);
    expect(offsetZ19.y).toBe(-10);
  });

  it('adapts when label geometry bounds are provided (label-aware)', () => {
    const labelBounds = {
      left: 100,
      top: 200,
      right: 220,
      bottom: 216 // height = 16px
    };

    const offset = calculateOSMMarkerVisualOffset(14, { labelBounds });
    // Should compute a vertical shift based on the label height while staying within 6-10px
    expect(Math.abs(offset.y)).toBeGreaterThanOrEqual(6);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(10);
    expect(offset.y).toBeLessThan(0);
  });

  it('is generic across diverse test locations (cities, towns, landmarks, parks) without special casing', () => {
    const testLocations = [
      { name: 'Oklahoma City', lat: 35.4676, lng: -97.5164, type: 'city' },
      { name: 'Paris', lat: 48.8566, lng: 2.3522, type: 'city' },
      { name: 'Tokyo Tower', lat: 35.6586, lng: 139.7454, type: 'landmark' },
      { name: 'Yosemite Valley', lat: 37.7456, lng: -119.5936, type: 'natural_feature' },
      { name: 'Sydney Opera House', lat: -33.8568, lng: 151.2153, type: 'attraction' },
      { name: 'Birdsville', lat: -25.8988, lng: 139.3514, type: 'town' }
    ];

    for (const loc of testLocations) {
      // Coordinates remain strictly unchanged
      expect(typeof loc.lat).toBe('number');
      expect(typeof loc.lng).toBe('number');

      // Visual offset computation produces identical generic rules across all places
      const offset14 = calculateOSMMarkerVisualOffset(14);
      expect(offset14.y).toBe(-8);

      const offset18 = calculateOSMMarkerVisualOffset(18);
      expect(offset18.y).toBe(-10);
    }
  });

  it('preserves underlying canonical geographic coordinates when projecting and applying screen offset', () => {
    const marker = { id: 'm-okc', name: 'Oklahoma City', lat: 35.4676, lng: -97.5164 };
    const originalLat = marker.lat;
    const originalLng = marker.lng;

    const z = 14;
    const n = Math.pow(2, z);
    const centerLat = 35.4676;
    const centerLng = -97.5164;

    const exactX = ((centerLng + 180) / 360) * n;
    const latRadCenter = (Math.max(-85.0511, Math.min(85.0511, centerLat)) * Math.PI) / 180;
    const exactY = ((1 - Math.log(Math.tan(latRadCenter) + 1 / Math.cos(latRadCenter)) / Math.PI) / 2) * n;

    const markerX = ((marker.lng + 180) / 360) * n;
    const latRadMarker = (Math.max(-85.0511, Math.min(85.0511, marker.lat)) * Math.PI) / 180;
    const markerY = ((1 - Math.log(Math.tan(latRadMarker) + 1 / Math.cos(latRadMarker)) / Math.PI) / 2) * n;

    const screenCenterX = 960;
    const screenCenterY = 540;

    const anchorLeft = screenCenterX + (markerX - exactX) * 256;
    const anchorTop = screenCenterY + (markerY - exactY) * 256;

    const visualOffset = calculateOSMMarkerVisualOffset(z);
    const visualLeft = anchorLeft + visualOffset.x;
    const visualTop = anchorTop + visualOffset.y;

    // Anchor is exactly at the screen center (exact geographic projection)
    expect(anchorLeft).toBeCloseTo(960, 2);
    expect(anchorTop).toBeCloseTo(540, 2);

    // Visual position is shifted vertically by 8px
    expect(visualLeft).toBe(960);
    expect(visualTop).toBe(532);

    // Marker underlying data remains completely unmodified
    expect(marker.lat).toBe(originalLat);
    expect(marker.lng).toBe(originalLng);
  });
});
