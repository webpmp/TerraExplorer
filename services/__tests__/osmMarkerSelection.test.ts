import { describe, it, expect } from 'vitest';
import {
  calculateOSMViewportBounds,
  isMarkerInOSMViewport,
  evaluateCameraTransitionDecision,
  logCameraDecision,
  OSMViewportBounds
} from '../../utils/osmViewportUtils';
import {
  DocumentaryController,
  DocumentaryAdapterCallbacks
} from '../documentaryController';

describe('Documentary Mode & OSM Marker Selection Transition Suite', () => {
  const centerCoord = { lat: 25.8207, lng: 56.1244 };
  const viewportBounds: OSMViewportBounds = calculateOSMViewportBounds(
    centerCoord.lat,
    centerCoord.lng,
    14,
    1920,
    1080,
    0.04
  );

  describe('TEST 1: Documentary mode → multiple markers → OSM active → click another visible marker', () => {
    it('returns PAN_CURRENT_OSM, keeps OSM active, preserves zoom, no globe transition', () => {
      const visibleMarker = {
        name: 'Local Oasis',
        lat: 25.8300,
        lng: 56.1300
      };

      const result = evaluateCameraTransitionDecision({
        currentDistance: 1.15,
        isOSMActive: true,
        isDocumentaryActive: false,
        marker: visibleMarker,
        osmViewportBounds: viewportBounds,
        cameraCenter: centerCoord,
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.currentState).toBe('OSM_ACTIVE');
      expect(result.targetState).toBe('OSM_ACTIVE');
      expect(result.osmActive).toBe(true);
      expect(result.osmRequired).toBe(true);
      expect(result.markerInView).toBe(true);
      expect(result.transitionDecision).toBe('PAN_CURRENT_OSM');
    });
  });

  describe('TEST 2: Documentary mode → multiple markers → globe/regional view → click marker that happens to be geographically visible', () => {
    it('returns TRANSITION_TO_OSM: being geographically visible does NOT suppress the OSM transition', () => {
      const regionalMarker = {
        name: 'Wadi Bih',
        lat: 25.8207,
        lng: 56.1244
      };

      // User zoomed out to regional distance (2.6) to view multiple markers
      const result = evaluateCameraTransitionDecision({
        currentDistance: 2.6,
        isOSMActive: false,
        isDocumentaryActive: false,
        marker: regionalMarker,
        osmViewportBounds: null,
        cameraCenter: centerCoord,
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.currentState).toBe('REGIONAL');
      expect(result.targetState).toBe('OSM_ACTIVE');
      expect(result.osmActive).toBe(false);
      expect(result.osmRequired).toBe(true);
      // The decision MUST be TRANSITION_TO_OSM to zoom into OSM, even though marker is in the regional view!
      expect(result.transitionDecision).toBe('TRANSITION_TO_OSM');
    });

    it('returns TRANSITION_TO_OSM when selecting from globe altitude (> 3.2)', () => {
      const globeMarker = {
        name: 'Tokyo',
        lat: 35.6762,
        lng: 139.6503
      };

      const result = evaluateCameraTransitionDecision({
        currentDistance: 4.5,
        isOSMActive: false,
        isDocumentaryActive: false,
        marker: globeMarker,
        osmViewportBounds: null,
        cameraCenter: { lat: 35.0, lng: 139.0 },
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.currentState).toBe('GLOBE');
      expect(result.targetState).toBe('OSM_ACTIVE');
      expect(result.transitionDecision).toBe('TRANSITION_TO_OSM');
    });
  });

  describe('TEST 3: Documentary mode → OSM active → click marker already visible', () => {
    it('executes smooth pan or no movement without zooming out or in', () => {
      const centerMarker = {
        name: 'Wadi Bih Center',
        lat: 25.8207,
        lng: 56.1244
      };

      const result = evaluateCameraTransitionDecision({
        currentDistance: 1.30,
        isOSMActive: true,
        isDocumentaryActive: false,
        marker: centerMarker,
        osmViewportBounds: viewportBounds,
        cameraCenter: centerCoord,
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.currentState).toBe('OSM_ACTIVE');
      expect(result.osmActive).toBe(true);
      expect(result.markerInView).toBe(true);
      expect(result.transitionDecision).toBe('NO_CAMERA_MOVEMENT');
    });
  });

  describe('TEST 4: Documentary mode → OSM active → click marker outside viewport', () => {
    it('returns PRESERVE_CURRENT_OSM_ZOOM to pan directly without returning to globe', () => {
      const offscreenMarker = {
        name: 'Jabal Qihwi',
        lat: 25.4380, // ~42 km south
        lng: 56.1244
      };

      const result = evaluateCameraTransitionDecision({
        currentDistance: 1.15,
        isOSMActive: true,
        isDocumentaryActive: false,
        marker: offscreenMarker,
        osmViewportBounds: viewportBounds,
        cameraCenter: centerCoord,
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.currentState).toBe('OSM_ACTIVE');
      expect(result.osmActive).toBe(true);
      expect(result.markerInView).toBe(false);
      expect(result.transitionDecision).toBe('PRESERVE_CURRENT_OSM_ZOOM');
    });
  });

  describe('TEST 5: Documentary transition toward Marker A → user clicks Marker B', () => {
    it('returns REDIRECT_CURRENT_TRANSITION when transition is in-flight', () => {
      const markerB = {
        name: 'Marker B',
        lat: 25.9000,
        lng: 56.2000
      };

      const result = evaluateCameraTransitionDecision({
        currentDistance: 2.1,
        isOSMActive: false,
        isDocumentaryActive: true, // Transition in flight
        marker: markerB,
        osmViewportBounds: null,
        cameraCenter: { lat: 25.85, lng: 56.15 },
        targetDistance: 1.30,
        osmRequired: true
      });

      expect(result.transitionDecision).toBe('REDIRECT_CURRENT_TRANSITION');
    });

    it('captures actual camera position at interruption moment and redirects without globe reset', () => {
      const controller = new DocumentaryController();
      let lastSampledLat = 0;
      let lastSampledLng = 0;
      let lastSampledDist = 0;

      // Start transition 1 toward Target A
      const targetA = { name: 'Target A', lat: 25.0, lng: 55.0 };
      const targetB = { name: 'Target B', lat: 26.0, lng: 56.0 };

      const callbacksA: DocumentaryAdapterCallbacks = {
        getCameraDistance: () => 2.2,
        getCameraCoordinates: () => ({ lat: 24.0, lng: 54.0 }),
        setCameraDistance: (d: number) => { lastSampledDist = d; },
        setCameraPosition: (lat: number, lng: number, d: number) => {
          lastSampledLat = lat;
          lastSampledLng = lng;
          lastSampledDist = d;
        }
      };

      controller.startSingleLocation(targetA, callbacksA, { duration: 5000 });

      // User interrupts halfway: actual camera is at lat=24.5, lng=54.5, dist=1.8
      const currentMidLat = 24.5;
      const currentMidLng = 54.5;
      const currentMidDist = 1.8;

      const callbacksB: DocumentaryAdapterCallbacks = {
        getCameraDistance: () => currentMidDist,
        getCameraCoordinates: () => ({ lat: currentMidLat, lng: currentMidLng }),
        setCameraDistance: (d: number) => { lastSampledDist = d; },
        setCameraPosition: (lat: number, lng: number, d: number) => {
          lastSampledLat = lat;
          lastSampledLng = lng;
          lastSampledDist = d;
        }
      };

      // Redirect toward Target B
      const seqB = controller.startSingleLocation(targetB, callbacksB, {
        duration: 3000,
        reducedMotion: true
      });

      expect(seqB).toBeGreaterThan(0);
      // Verify start distance remained at 1.8 without snapping back up to globe (4.0)
      expect(lastSampledDist).toBeLessThanOrEqual(1.8);
    });
  });

  describe('TEST 6: Documentary direct descent preserves strictly non-increasing distance', () => {
    it('never increases camera distance when descending from intermediate altitude', () => {
      const controller = new DocumentaryController();
      let maxObservedDistance = 0;
      const destination = { name: 'Target', lat: 25.8207, lng: 56.1244 };

      const callbacks: DocumentaryAdapterCallbacks = {
        getCameraDistance: () => 2.2,
        getCameraCoordinates: () => ({ lat: 25.8000, lng: 56.1000 }),
        setCameraDistance: (d: number) => {
          maxObservedDistance = Math.max(maxObservedDistance, d);
        },
        setCameraPosition: (lat: number, lng: number, d: number) => {
          maxObservedDistance = Math.max(maxObservedDistance, d);
        }
      };

      controller.startSingleLocation(destination, callbacks, {
        duration: 2000,
        reducedMotion: true
      });

      expect(maxObservedDistance).toBeLessThanOrEqual(2.2);
    });
  });
});
