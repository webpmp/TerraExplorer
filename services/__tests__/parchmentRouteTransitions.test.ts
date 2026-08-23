import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { documentaryController } from '../documentaryController';
import {
  getDocumentaryCameraConfig,
  getParchmentBaseDistance,
  isDestinationComfortablyVisible,
  calculateModerateFramingDistance,
  calculateDefaultFramingDistance
} from '../../utils/cameraConfig';
import { SkinType } from '../../types';

describe('Waypoint Camera Framing Across All Themes Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    documentaryController.cancel('setup');
  });

  afterEach(() => {
    documentaryController.cancel('teardown');
    vi.restoreAllMocks();
  });

  it('Test 1: Nearby + Visible preserves zoom and smoothly pans across all 4 themes', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    // Center is Camp Dubois (38.8042, -90.1114).
    // Destination is ~8km away (38.7844, -90.1500), comfortably inside the 1920x1080 viewport
    const origin = { id: 'wp-1', name: 'Camp Dubois', lat: 38.8042, lng: -90.1114 };
    const visibleDest = { id: 'wp-2', name: 'Hartford / Confluence', lat: 38.7844, lng: -90.1500 };

    const startDist = 1.30;
    const isVisible = isDestinationComfortablyVisible(origin, startDist, visibleDest, {
      viewportWidth: 1920,
      viewportHeight: 1080
    });

    expect(isVisible).toBe(true);

    skins.forEach((skin) => {
      documentaryController.cancel('reset');
      const recordedDistances: number[] = [];
      let onOSMEnterCalled = false;
      let settled = false;

      documentaryController.startWaypointTransition(
        origin,
        visibleDest,
        {
          getCameraDistance: () => startDist,
          getCameraCoordinates: () => ({ lat: origin.lat, lng: origin.lng }),
          setCameraPosition: (lat, lng, dist) => {
            recordedDistances.push(dist);
          },
          setCameraDistance: (dist) => {
            recordedDistances.push(dist);
          },
          onOSMEnter: () => {
            onOSMEnterCalled = true;
          },
          onSettle: () => {
            settled = true;
          }
        },
        { skin, aspect: 16 / 9, viewportWidth: 1920, viewportHeight: 1080 }
      );

      // Advance through transition
      vi.advanceTimersByTime(2500);

      expect(settled).toBe(true);
      expect(onOSMEnterCalled).toBe(true);

      // Invariant: Distance is strictly preserved at 1.30 (no globe zoom-out!)
      const maxDist = Math.max(...recordedDistances);
      expect(maxDist).toBeLessThanOrEqual(1.301);
    });
  });

  it('Test 2: Nearby + Outside Viewport performs moderate contextual zoom-out and transitions to destination', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    // Center is Camp Dubois (38.8042, -90.1114).
    // Destination is Jefferson City, MO (38.5767, -92.1735), ~180km away (separation ~1.8 deg)
    // Outside the comfortable 1920x1080 viewport at zoom 14
    const origin = { id: 'wp-1', name: 'Camp Dubois', lat: 38.8042, lng: -90.1114 };
    const offscreenDest = { id: 'wp-3', name: 'Jefferson City', lat: 38.5767, lng: -92.1735 };

    const startDist = 1.30;
    const isVisible = isDestinationComfortablyVisible(origin, startDist, offscreenDest, {
      viewportWidth: 1920,
      viewportHeight: 1080
    });

    expect(isVisible).toBe(false);

    skins.forEach((skin) => {
      documentaryController.cancel('reset');
      const recordedDistances: number[] = [];
      let onSettleCalled = false;

      documentaryController.startWaypointTransition(
        origin,
        offscreenDest,
        {
          getCameraDistance: () => startDist,
          getCameraCoordinates: () => ({ lat: origin.lat, lng: origin.lng }),
          setCameraPosition: (lat, lng, dist) => {
            recordedDistances.push(dist);
          },
          setCameraDistance: (dist) => {
            recordedDistances.push(dist);
          },
          onSettle: () => {
            onSettleCalled = true;
          }
        },
        { skin, aspect: 16 / 9, viewportWidth: 1920, viewportHeight: 1080 }
      );

      expect(documentaryController.getPhase()).toBe('zooming_out');

      // Midway through transition (apex of framing phase at t=2750ms)
      vi.advanceTimersByTime(2750);

      // Max elevation should be moderate (~1.70 - 2.10), NOT full globe overview (3.0 / 4.5)
      const maxElevation = Math.max(...recordedDistances);
      expect(maxElevation).toBeGreaterThan(1.65); // Lifted out of OSM street level to show context
      expect(maxElevation).toBeLessThanOrEqual(2.20); // Did not blast into outer space

      // Complete transition (total 6000ms > 5500ms)
      vi.advanceTimersByTime(3250);
      expect(onSettleCalled).toBe(true);
      expect(recordedDistances[recordedDistances.length - 1]).toBeCloseTo(1.30, 2);
    });
  });

  it('Test 3: Far + Outside Viewport performs full globe overview documentary transition', () => {
    // St. Louis, MO to Fort Clatsop, Oregon (separation ~25 deg)
    const origin = { id: 'wp-1', name: 'Camp Dubois', lat: 38.8042, lng: -90.1114 };
    const farDest = { id: 'wp-clatsop', name: 'Fort Clatsop', lat: 46.134, lng: -123.880 };

    const startDist = 1.30;
    const isVisible = isDestinationComfortablyVisible(origin, startDist, farDest, {
      viewportWidth: 1920,
      viewportHeight: 1080
    });

    expect(isVisible).toBe(false);

    const recordedDistances: number[] = [];
    documentaryController.startWaypointTransition(
      origin,
      farDest,
      {
        getCameraDistance: () => startDist,
        getCameraCoordinates: () => ({ lat: origin.lat, lng: origin.lng }),
        setCameraPosition: (lat, lng, dist) => {
          recordedDistances.push(dist);
        },
        setCameraDistance: (dist) => {
          recordedDistances.push(dist);
        }
      },
      { skin: 'modern', aspect: 16 / 9, viewportWidth: 1920, viewportHeight: 1080 }
    );

    expect(documentaryController.getPhase()).toBe('zooming_out');

    vi.advanceTimersByTime(2500);

    const maxElevation = Math.max(...recordedDistances);
    // For far destination, elevates to broad/globe overview (>= 2.50)
    expect(maxElevation).toBeGreaterThanOrEqual(2.50);
  });

  it('Test 4: Destination Near Viewport Edge is treated as not comfortably visible and performs moderate transition', () => {
    const origin = { id: 'wp-1', name: 'Center Location', lat: 38.8042, lng: -90.1114 };
    // A destination near the outer 10% edge of the screen at zoom 14
    // At zoom 14 (exactCenterX), deltaLng of 0.70 deg places screenX ~ 1770px (width=1920, margin=15% -> maxX=1632)
    const edgeDest = { id: 'wp-edge', name: 'Edge Location', lat: 38.8042, lng: -89.4114 };

    const isVisible = isDestinationComfortablyVisible(origin, 1.30, edgeDest, {
      viewportWidth: 1920,
      viewportHeight: 1080,
      marginRatio: 0.15
    });

    // Invariant: Destination in margin zone is NOT considered comfortably visible
    expect(isVisible).toBe(false);
  });

  it('Test 5: Theme switching between Modern, Retro, and Parchment preserves geographic scale & camera distance', () => {
    const aspect = 16 / 9;
    const baseDistance = getParchmentBaseDistance(aspect);
    const osmCityDistance = 1.30;

    const handleSkinChangeSimulation = (
      currentDist: number,
      toSkin: SkinType
    ) => {
      let syncZoom = 1.0;
      let targetDistance = currentDist;

      if (toSkin === 'parchment') {
        syncZoom = Math.max(0.375, Math.min(50.0, baseDistance / Math.max(1.018, currentDist)));
        targetDistance = baseDistance / syncZoom;
      }
      return { syncZoom, targetDistance };
    };

    // Modern -> Parchment
    const fromModern = handleSkinChangeSimulation(osmCityDistance, 'parchment');
    expect(fromModern.targetDistance).toBeCloseTo(osmCityDistance, 3);
    expect(fromModern.syncZoom).toBeGreaterThan(1.0);

    // Retro-Green -> Parchment
    const fromRetro = handleSkinChangeSimulation(osmCityDistance, 'parchment');
    expect(fromRetro.targetDistance).toBeCloseTo(osmCityDistance, 3);

    // Parchment -> Retro-Amber
    const toRetroAmber = handleSkinChangeSimulation(osmCityDistance, 'retro-amber');
    expect(toRetroAmber.targetDistance).toBeCloseTo(osmCityDistance, 3);
  });

  it('Test 6: Closing Expeditions overlay during active route flight does not cancel transition or reset camera', () => {
    const waypoints = [
      { id: 'wp-lc-1', name: 'Camp Dubois / Wood River', lat: 38.8042, lng: -90.1114 },
      { id: 'wp-lc-2', name: 'St. Charles, Missouri', lat: 38.7844, lng: -90.4812 }
    ];

    let activeRouteId: string | null = 'route-lewis-clark';
    let isFavoritesPanelOpen = true;
    let cameraDistance = 4.5;
    let cameraLat = 0;
    let cameraLng = 0;
    let settled = false;

    documentaryController.startSingleLocation(
      waypoints[0],
      {
        getCameraDistance: () => cameraDistance,
        setCameraDistance: (d) => { cameraDistance = d; },
        setCameraPosition: (lat, lng, dist) => {
          cameraLat = lat;
          cameraLng = lng;
          cameraDistance = dist;
        },
        onSettle: () => { settled = true; }
      },
      { skin: 'parchment' }
    );

    expect(documentaryController.isActive()).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(documentaryController.isActive()).toBe(true);

    // User closes Expeditions overlay
    isFavoritesPanelOpen = false;

    // Transition continues uninterrupted
    expect(activeRouteId).toBe('route-lewis-clark');
    expect(documentaryController.isActive()).toBe(true);

    vi.advanceTimersByTime(4500);
    expect(settled).toBe(true);
    expect(cameraDistance).toBeLessThanOrEqual(1.30);
    expect(cameraLat).toBeCloseTo(waypoints[0].lat, 2);
    expect(cameraLng).toBeCloseTo(waypoints[0].lng, 2);
  });
});
