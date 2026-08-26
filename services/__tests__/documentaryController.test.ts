import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DocumentaryController,
  DOCUMENTARY_TARGET_DISTANCE,
  DOCUMENTARY_DURATIONS,
  resolveDocumentaryDuration,
  calculateGreatCircleDistance,
  calculateGreatCircleMidpoint,
  calculateFramingDistance,
  interpolateCoordinates
} from '../documentaryController';

describe('DocumentaryController Suite', () => {
  let controller: DocumentaryController;

  beforeEach(() => {
    vi.useFakeTimers();
    controller = DocumentaryController.getInstance();
    controller.cancel('test_setup');
  });

  afterEach(() => {
    controller.cancel('test_teardown');
    vi.useRealTimers();
  });

  it('1. Single-location starting from OSM (< 2.2) executes 3-phase transition: ZOOM_OUT -> ROTATE -> DESCEND', () => {
    let currentDist = 1.30;
    const originCoords = { lat: 37.7749, lng: -122.4194 }; // San Francisco OSM
    const destCoords = { lat: 35.6762, lng: 139.6503 }; // Tokyo

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      currentDist = dist;
    });
    const onAtmosphereEnter = vi.fn();
    const onOSMEnter = vi.fn();
    const onSettle = vi.fn();

    const seqId = controller.startSingleLocation(
      { name: 'Tokyo', lat: destCoords.lat, lng: destCoords.lng },
      {
        getCameraDistance: () => currentDist,
        getCameraCoordinates: () => originCoords,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onAtmosphereEnter,
        onOSMEnter,
        onSettle
      },
      { duration: 'cinematic' } // 5500ms
    );

    expect(seqId).toBeGreaterThan(0);
    expect(controller.isActive()).toBe(true);
    expect(controller.getPhase()).toBe('zooming_out');

    // Phase 1: Zoom out (0 - 30% of 5500ms = 0 - 1650ms)
    vi.advanceTimersByTime(1000);
    expect(controller.getPhase()).toBe('zooming_out');
    expect(currentDist).toBeGreaterThan(1.30);
    expect(setCameraPosition).toHaveBeenCalled();
    // During zoom out, camera position stays at San Francisco
    const call1 = setCameraPosition.mock.calls[setCameraPosition.mock.calls.length - 1];
    expect(call1[0]).toBeCloseTo(originCoords.lat, 1);
    expect(call1[1]).toBeCloseTo(originCoords.lng, 1);

    // Phase 2: Rotate (30% - 65% of 5500ms = 1650ms - 3575ms)
    vi.advanceTimersByTime(1500); // at t = 2500ms
    expect(controller.getPhase()).toBe('rotating');
    expect(currentDist).toBeGreaterThanOrEqual(4.0);

    // Phase 3: Descend into Tokyo (65% - 100% of 5500ms = 3575ms - 5500ms)
    vi.advanceTimersByTime(1800); // at t = 4300ms
    expect(controller.getPhase()).toBe('descending');
    const call3 = setCameraPosition.mock.calls[setCameraPosition.mock.calls.length - 1];
    expect(call3[0]).toBeCloseTo(destCoords.lat, 1);
    expect(call3[1]).toBeCloseTo(destCoords.lng, 1);

    // Complete duration (total 5500ms)
    vi.advanceTimersByTime(1500);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tokyo' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('2. Single-location starting from Globe (>= 2.2) executes 2-phase transition: ROTATE -> DESCEND', () => {
    let currentDist = 4.5;
    const originCoords = { lat: 10, lng: 10 };
    const destCoords = { lat: 40, lng: 40 };

    const setCameraPosition = vi.fn();
    const onSettle = vi.fn();

    controller.startSingleLocation(
      { name: 'Dest', lat: destCoords.lat, lng: destCoords.lng },
      {
        getCameraDistance: () => currentDist,
        getCameraCoordinates: () => originCoords,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 'cinematic' }
    );

    // Phase 1: Rotate (0 - 40% of 5500ms = 0 - 2200ms)
    vi.advanceTimersByTime(1000);
    expect(controller.getPhase()).toBe('rotating');
    expect(setCameraPosition).toHaveBeenCalled();
    const rotateCall = setCameraPosition.mock.calls[setCameraPosition.mock.calls.length - 1];
    // Coordinate must be in transit between 10 and 40, not snapped to 40
    expect(rotateCall[0]).toBeGreaterThan(10);
    expect(rotateCall[0]).toBeLessThan(40);
    expect(rotateCall[1]).toBeGreaterThan(10);
    expect(rotateCall[1]).toBeLessThan(40);
    expect(rotateCall[2]).toBeCloseTo(4.5, 1);

    // Phase 2: Descend (40% - 100% of 5500ms = 2200ms - 5500ms)
    vi.advanceTimersByTime(2500); // at t = 3500ms
    expect(controller.getPhase()).toBe('descending');
    const descendCall = setCameraPosition.mock.calls[setCameraPosition.mock.calls.length - 1];
    expect(descendCall[0]).toBeCloseTo(destCoords.lat, 1);
    expect(descendCall[1]).toBeCloseTo(destCoords.lng, 1);
    expect(descendCall[2]).toBeLessThan(4.5);

    vi.advanceTimersByTime(2500);
    expect(onSettle).toHaveBeenCalled();
  });

  it('3. Waypoint transition executes sequential ZOOM_OUT -> FRAMING -> DESCEND order', () => {
    const wp1 = { name: 'Plymouth, England', lat: 50.3755, lng: -4.1427 };
    const wp2 = { name: 'Buenos Aires, Argentina', lat: -34.6037, lng: -58.3816 };

    const setCameraPosition = vi.fn();
    const onSettle = vi.fn();

    controller.startWaypointTransition(
      wp1,
      wp2,
      {
        getCameraDistance: () => 1.30, // currently in WP1 OSM view
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 'cinematic' } // 5500ms
    );

    expect(controller.getTransitionType()).toBe('waypoint');
    expect(controller.getPhase()).toBe('zooming_out');

    // Phase 1 (0 - 50%): Zoom out to midpoint and framing distance
    vi.advanceTimersByTime(1000);
    expect(controller.getPhase()).toBe('zooming_out');

    vi.advanceTimersByTime(1200); // t = 2200ms -> reaching framing midpoint
    expect(controller.getPhase()).toBe('framing');

    // Phase 2 (50% - 100%): Zoom in from midpoint toward WP2
    vi.advanceTimersByTime(1500); // t = 3700ms
    expect(controller.getPhase()).toBe('descending');

    // Finish
    vi.advanceTimersByTime(2000);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Buenos Aires, Argentina' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('4. interpolateCoordinates handles normal interpolation and antimeridian crossing', () => {
    // Normal interpolation
    const midNormal = interpolateCoordinates(10, 20, 30, 40, 0.5);
    expect(midNormal.lat).toBeCloseTo(20);
    expect(midNormal.lng).toBeCloseTo(30);

    // Antimeridian crossing: 170 to -170 (20 degree gap across 180)
    const midAnti = interpolateCoordinates(0, 170, 0, -170, 0.5);
    expect(midAnti.lat).toBeCloseTo(0);
    expect(Math.abs(midAnti.lng)).toBeCloseTo(180);
  });

  it('5. Skip immediately settles camera at destination coordinates and target altitude (1.30)', () => {
    const dest = { name: 'Mount Everest', lat: 27.9881, lng: 86.925 };
    const setCameraPosition = vi.fn();
    const onSettle = vi.fn();

    controller.startSingleLocation(
      dest,
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => ({ lat: 0, lng: 0 }),
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 'long' }
    );

    vi.advanceTimersByTime(1000);
    expect(onSettle).not.toHaveBeenCalled();

    controller.skip();

    expect(setCameraPosition).toHaveBeenCalledWith(dest.lat, dest.lng, DOCUMENTARY_TARGET_DISTANCE);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mount Everest' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('6. User interruption cancels active sequence immediately', () => {
    const onCancel = vi.fn();
    const onSettle = vi.fn();

    controller.startSingleLocation(
      { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
      {
        getCameraDistance: () => 4.5,
        setCameraDistance: vi.fn(),
        onSettle,
        onCancel
      },
      { duration: 'cinematic' }
    );

    expect(controller.isActive()).toBe(true);

    controller.cancel('user_drag');

    expect(controller.isActive()).toBe(false);
    expect(controller.getPhase()).toBe('cancelled');
    expect(onCancel).toHaveBeenCalledWith('user_drag');
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('7. resolveDocumentaryDuration accurately maps numeric slider values and handles clamps and presets', () => {
    // Exact seconds mapping
    expect(resolveDocumentaryDuration(2.0)).toBe(2000);
    expect(resolveDocumentaryDuration(3.2)).toBe(3200);
    expect(resolveDocumentaryDuration(4.0)).toBe(4000);
    expect(resolveDocumentaryDuration(5.0)).toBe(5000);
    expect(resolveDocumentaryDuration(5.4)).toBe(5400);
    expect(resolveDocumentaryDuration(6.0)).toBe(6000);
    expect(resolveDocumentaryDuration(8.0)).toBe(8000);
    expect(resolveDocumentaryDuration(10.0)).toBe(10000);

    // Clamping behavior: min 2.0s (2000ms), max 10.0s (10000ms)
    expect(resolveDocumentaryDuration(0.5)).toBe(2000);
    expect(resolveDocumentaryDuration(15.0)).toBe(10000);

    // Legacy preset strings backwards compatibility
    expect(resolveDocumentaryDuration('short')).toBe(3200);
    expect(resolveDocumentaryDuration('cinematic')).toBe(5500);
    expect(resolveDocumentaryDuration('long')).toBe(8000);

    // Default fallback
    expect(resolveDocumentaryDuration(undefined)).toBe(5500);
    expect(resolveDocumentaryDuration(NaN as any)).toBe(5500);
  });

  it('8. Single-location transition precisely respects user-selected slider duration (e.g. 7.5s)', () => {
    const onSettle = vi.fn();
    const setCameraPosition = vi.fn();

    controller.startSingleLocation(
      { name: 'Rome', lat: 41.9028, lng: 12.4964 },
      {
        getCameraDistance: () => 4.5,
        getCameraCoordinates: () => ({ lat: 40.7128, lng: -74.006 }), // New York
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 7.5 } // 7500ms
    );

    expect(controller.isActive()).toBe(true);

    // At t = 2000ms (within rotation phase: 0 - 3000ms of 7500ms)
    vi.advanceTimersByTime(2000);
    expect(controller.getPhase()).toBe('rotating');
    expect(onSettle).not.toHaveBeenCalled();

    // At t = 5000ms (within descent phase: 3000ms - 7500ms)
    vi.advanceTimersByTime(3000);
    expect(controller.getPhase()).toBe('descending');
    expect(onSettle).not.toHaveBeenCalled();

    // Reaching 7500ms total
    vi.advanceTimersByTime(2600);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rome' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('9. Waypoint transition precisely respects user-selected slider duration (e.g. 4.0s)', () => {
    const wp1 = { name: 'London', lat: 51.5074, lng: -0.1278 };
    const wp2 = { name: 'Paris', lat: 48.8566, lng: 2.3522 };
    const onSettle = vi.fn();

    controller.startWaypointTransition(
      wp1,
      wp2,
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => ({ lat: wp1.lat, lng: wp1.lng }),
        setCameraDistance: vi.fn(),
        setCameraPosition: vi.fn(),
        onSettle
      },
      { duration: 4.0 } // 4000ms
    );

    // Advance 3000ms -> should not be settled yet
    vi.advanceTimersByTime(3000);
    expect(onSettle).not.toHaveBeenCalled();

    // Advance remaining 1100ms -> total 4100ms -> settled
    vi.advanceTimersByTime(1100);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Paris' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('10. Tulsa -> Dallas while at OSM floor (cameraDistance=1.30, sepDeg=3.4°) forces outbound zoom phase (distant_osm_to_globe) and does NOT select local_pan', () => {
    const tulsaCoords = { lat: 36.1563, lng: -95.9928 }; // Tulsa, OK
    const dallasCoords = { lat: 32.7767, lng: -96.7970 }; // Dallas, TX
    let currentDist = 1.30; // At OSM floor

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      currentDist = dist;
    });
    const onSettle = vi.fn();

    const seqId = controller.startSingleLocation(
      { name: 'Dallas, Texas', lat: dallasCoords.lat, lng: dallasCoords.lng },
      {
        getCameraDistance: () => currentDist,
        getCameraCoordinates: () => tulsaCoords,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 5.5 }
    );

    expect(seqId).toBeGreaterThan(0);
    expect(controller.isActive()).toBe(true);
    // Must be in zooming_out phase, NOT descending/local_pan
    expect(controller.getPhase()).toBe('zooming_out');

    // Advance through zoom out phase (0 - 30% = 0 - 1650ms)
    vi.advanceTimersByTime(1000);
    expect(controller.getPhase()).toBe('zooming_out');
    expect(currentDist).toBeGreaterThan(1.30);

    // Advance to rotating phase (30% - 60% = 1650ms - 3300ms)
    vi.advanceTimersByTime(1000);
    expect(controller.getPhase()).toBe('rotating');
    expect(currentDist).toBeGreaterThanOrEqual(4.0);

    // Advance to descending phase (60% - 100%)
    vi.advanceTimersByTime(1500);
    expect(controller.getPhase()).toBe('descending');

    // Finish
    vi.advanceTimersByTime(2500);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dallas, Texas' }));
    expect(controller.getPhase()).toBe('completed');
  });

  it('11. Same-destination search while already at target distance (sepDeg=0.0°) selects same_location_at_target / local_pan without zoom-out', () => {
    const dallasCoords = { lat: 32.7767, lng: -96.7970 };
    let currentDist = 1.30;

    const setCameraPosition = vi.fn();
    const onSettle = vi.fn();

    controller.startSingleLocation(
      { name: 'Dallas, Texas', lat: dallasCoords.lat, lng: dallasCoords.lng },
      {
        getCameraDistance: () => currentDist,
        getCameraCoordinates: () => dallasCoords,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 5.5 }
    );

    // For same location at target distance, it should not zoom out to globe
    expect(controller.getPhase()).toBe('descending');
  });

  it('12. Rapid destination changes (Tulsa -> Dallas -> San Diego) ensure only the latest transition controls the camera', () => {
    const tulsaCoords = { lat: 36.1563, lng: -95.9928 };
    const dallasCoords = { lat: 32.7767, lng: -96.7970 };
    const sanDiegoCoords = { lat: 32.7157, lng: -117.1611 };

    const tulsaSettle = vi.fn();
    const dallasSettle = vi.fn();
    const sanDiegoSettle = vi.fn();

    // 1. Start Tulsa
    controller.startSingleLocation(
      { name: 'Tulsa', lat: tulsaCoords.lat, lng: tulsaCoords.lng },
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => tulsaCoords,
        setCameraDistance: vi.fn(),
        onSettle: tulsaSettle
      }
    );

    // 2. Rapidly start Dallas
    controller.startSingleLocation(
      { name: 'Dallas, Texas', lat: dallasCoords.lat, lng: dallasCoords.lng },
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => tulsaCoords,
        setCameraDistance: vi.fn(),
        onSettle: dallasSettle
      }
    );

    // 3. Rapidly start San Diego
    const seq3 = controller.startSingleLocation(
      { name: 'San Diego, California', lat: sanDiegoCoords.lat, lng: sanDiegoCoords.lng },
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => dallasCoords,
        setCameraDistance: vi.fn(),
        onSettle: sanDiegoSettle
      }
    );

    expect(controller.getSequenceId()).toBe(seq3);
    expect(controller.getCurrentDestination()?.name).toBe('San Diego, California');

    // Run timers to completion
    vi.advanceTimersByTime(10000);

    expect(tulsaSettle).not.toHaveBeenCalled();
    expect(dallasSettle).not.toHaveBeenCalled();
    expect(sanDiegoSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'San Diego, California' }));
  });
});
