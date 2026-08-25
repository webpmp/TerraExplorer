import { describe, it, expect } from 'vitest';
import {
  calculateOSMViewportBounds,
  isMarkerInOSMViewport,
  filterMarkersByOSMViewport,
  OSMViewportBounds
} from '../../utils/osmViewportUtils';

describe('OSM Viewport Marker Visibility & Geographic Bounds Suite', () => {
  // Test scenario matching the user requirement
  const discoveryCenter = { lat: 25.8207, lng: 56.1244 };
  const zoom = 14;
  const screenWidth = 1920;
  const screenHeight = 1080;

  const discoveryResults = [
    { id: 'm-wadi-bih', name: 'Wadi Bih', lat: 25.8207, lng: 56.1244, distanceKm: 0.0, score: 100 },
    { id: 'm-local-village', name: 'Local Village', lat: 25.8450, lng: 56.1350, distanceKm: 3.2, score: 90 },
    { id: 'm-jabal-qihwi', name: 'Jabal Qihwi', lat: 25.4380, lng: 56.1244, distanceKm: 42.4, score: 85 },
    { id: 'm-umm-al-fayyarin', name: 'Umm al-Fayyarin', lat: 26.2340, lng: 56.1244, distanceKm: 45.9, score: 80 },
    { id: 'm-qadaah', name: 'Qada\'ah', lat: 25.8207, lng: 56.6180, distanceKm: 49.4, score: 75 },
    { id: 'm-jabal-qadaah', name: 'Jabal Qada\'ah', lat: 25.8207, lng: 55.6260, distanceKm: 49.9, score: 70 },
    { id: 'm-yinas', name: 'Yinas', lat: 25.3580, lng: 56.1244, distanceKm: 51.3, score: 65 },
    { id: 'm-far-bih', name: 'Far Bih Post', lat: 25.3510, lng: 56.1244, distanceKm: 52.1, score: 60 }
  ];

  describe('1. Accurate Geographic Viewport Bounds Calculation', () => {
    it('calculates the geographic bounds for center (25.8207, 56.1244) at zoom 14', () => {
      const bounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight,
        0.04 // 4% buffer
      );

      // Verify center
      expect(bounds.centerLat).toBeCloseTo(25.8207, 4);
      expect(bounds.centerLng).toBeCloseTo(56.1244, 4);
      expect(bounds.zoom).toBe(14);

      // Verify geographic extent for 1920x1080 screen
      expect(bounds.maxLat).toBeGreaterThan(bounds.minLat);
      expect(bounds.maxLng).toBeGreaterThan(bounds.minLng);
      expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.084, 2); // ~9 km lat span (1080px)
      expect(bounds.maxLng - bounds.minLng).toBeCloseTo(0.165, 2); // ~17 km lng span (1920px)

      // Verify 4% buffer extends bounds beyond raw viewport
      expect(bounds.bufferedMaxLat).toBeGreaterThan(bounds.maxLat);
      expect(bounds.bufferedMinLat).toBeLessThan(bounds.minLat);
      expect(bounds.bufferedMaxLng).toBeGreaterThan(bounds.maxLng);
      expect(bounds.bufferedMinLng).toBeLessThan(bounds.minLng);
    });
  });

  describe('2. Separation of Discovery Radius from OSM Marker Visibility', () => {
    it('renders only markers inside the OSM viewport and excludes distant discovery results', () => {
      const bounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight,
        0.04
      );

      const visible = filterMarkersByOSMViewport(discoveryResults, bounds);
      const visibleIds = visible.map((m) => m.id);

      // Wadi Bih and Local Village are inside the viewport (~0-3 km)
      expect(visibleIds).toContain('m-wadi-bih');
      expect(visibleIds).toContain('m-local-village');

      // Distant discovery results (40-52 km) MUST NOT be rendered
      expect(visibleIds).not.toContain('m-jabal-qihwi');
      expect(visibleIds).not.toContain('m-umm-al-fayyarin');
      expect(visibleIds).not.toContain('m-qadaah');
      expect(visibleIds).not.toContain('m-jabal-qadaah');
      expect(visibleIds).not.toContain('m-yinas');
      expect(visibleIds).not.toContain('m-far-bih');

      expect(visible.length).toBe(2);
    });

    it('preserves the global discovery results array without mutation or deletion', () => {
      const bounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight
      );

      const originalCount = discoveryResults.length;
      const originalFirst = { ...discoveryResults[0] };

      const visible = filterMarkersByOSMViewport(discoveryResults, bounds);

      // Source array is completely untouched
      expect(discoveryResults.length).toBe(originalCount);
      expect(discoveryResults[0]).toEqual(originalFirst);
      expect(visible.length).toBeLessThan(discoveryResults.length);
    });
  });

  describe('3. Dynamic Marker Visibility on Panning and Camera Movement', () => {
    it('automatically displays a marker when panning toward it, and hides departing markers', () => {
      // Step A: Initial viewport at discoveryCenter (Wadi Bih)
      const initialBounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight
      );

      let visible = filterMarkersByOSMViewport(discoveryResults, initialBounds);
      expect(visible.some((m) => m.name === 'Wadi Bih')).toBe(true);
      expect(visible.some((m) => m.name === 'Jabal Qihwi')).toBe(false);

      // Step B: User pans 42 km south toward Jabal Qihwi (lat: 25.4380, lng: 56.1244)
      const pannedBounds = calculateOSMViewportBounds(
        25.4380,
        56.1244,
        zoom,
        screenWidth,
        screenHeight
      );

      visible = filterMarkersByOSMViewport(discoveryResults, pannedBounds);

      // Jabal Qihwi is now in the viewport -> visible!
      expect(visible.some((m) => m.name === 'Jabal Qihwi')).toBe(true);
      // Wadi Bih is now out of the viewport -> hidden!
      expect(visible.some((m) => m.name === 'Wadi Bih')).toBe(false);

      // Step C: User pans back toward Wadi Bih
      visible = filterMarkersByOSMViewport(discoveryResults, initialBounds);
      expect(visible.some((m) => m.name === 'Wadi Bih')).toBe(true);
      expect(visible.some((m) => m.name === 'Jabal Qihwi')).toBe(false);
    });
  });

  describe('4. Zoom-level Dynamic Re-filtering', () => {
    it('shrinks the visible marker set as camera zooms in to street detail', () => {
      // At zoom 12 (wide city view)
      const boundsZ12 = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        12,
        screenWidth,
        screenHeight
      );

      // At zoom 18 (dense block view)
      const boundsZ18 = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        18,
        screenWidth,
        screenHeight
      );

      // A marker 2km away
      const marker2km = { id: 'm-2km', name: 'Nearby Ridge', lat: 25.8380, lng: 56.1244 };

      // Visible at zoom 12 city overview
      expect(isMarkerInOSMViewport(marker2km.lat, marker2km.lng, boundsZ12)).toBe(true);

      // Hidden at zoom 18 block detail (viewport is only ~300m across)
      expect(isMarkerInOSMViewport(marker2km.lat, marker2km.lng, boundsZ18)).toBe(false);
    });
  });

  describe('5. Antimeridian Longitude Wrapping (±180°)', () => {
    it('correctly filters markers when the viewport straddles the antimeridian', () => {
      // Viewport centered at 179.95° longitude (crossing ±180°)
      const antimeridianCenter = { lat: 20.0, lng: 179.95 };
      const bounds = calculateOSMViewportBounds(
        antimeridianCenter.lat,
        antimeridianCenter.lng,
        14,
        screenWidth,
        screenHeight,
        0.04
      );

      expect(bounds.crossesAntimeridian).toBe(true);

      const antimeridianMarkers = [
        { id: 'm-east', name: 'East Side', lat: 20.01, lng: 179.92 }, // Inside east of 180
        { id: 'm-west', name: 'West Side', lat: 20.01, lng: -179.98 }, // Inside west of 180
        { id: 'm-far', name: 'Far Hawaii', lat: 20.01, lng: -155.0 } // Far away outside
      ];

      const visible = filterMarkersByOSMViewport(antimeridianMarkers, bounds);
      const ids = visible.map((m) => m.id);

      expect(ids).toContain('m-east');
      expect(ids).toContain('m-west');
      expect(ids).not.toContain('m-far');
    });
  });

  describe('6. 2-5% Geographic Edge Buffer Stability', () => {
    it('includes markers in the small 4% buffer zone to prevent rapid popping', () => {
      const bounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight,
        0.04 // 4% buffer
      );

      // Marker positioned just 1% outside raw maxLat
      const latJustOutside = bounds.maxLat + (bounds.maxLat - bounds.minLat) * 0.01;
      const markerNearEdge = { id: 'm-edge', lat: latJustOutside, lng: discoveryCenter.lng };

      // In raw bounds it would be outside, but with buffer it is safely visible
      expect(latJustOutside > bounds.maxLat).toBe(true);
      expect(latJustOutside <= bounds.bufferedMaxLat).toBe(true);
      expect(isMarkerInOSMViewport(markerNearEdge.lat, markerNearEdge.lng, bounds)).toBe(true);

      // Marker positioned 10% outside
      const latFarOutside = bounds.maxLat + (bounds.maxLat - bounds.minLat) * 0.10;
      expect(isMarkerInOSMViewport(latFarOutside, discoveryCenter.lng, bounds)).toBe(false);
    });
  });

  describe('7. Independence from Discovery Ranking, Score, and Category', () => {
    it('bases visibility strictly on geographic coordinates, ignoring score or ranking', () => {
      const bounds = calculateOSMViewportBounds(
        discoveryCenter.lat,
        discoveryCenter.lng,
        zoom,
        screenWidth,
        screenHeight
      );

      // High score but far away -> hidden
      const highRankFar = { id: 'm-high-far', lat: 20.0, lng: 56.1244, score: 9999, rank: 1 };
      // Low score but geographically inside -> visible
      const lowRankNear = { id: 'm-low-near', lat: 25.8207, lng: 56.1244, score: 1, rank: 9999 };

      const visible = filterMarkersByOSMViewport([highRankFar, lowRankNear], bounds);

      expect(visible.map((m) => m.id)).toEqual(['m-low-near']);
    });
  });
});
