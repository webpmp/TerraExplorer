import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DocumentaryController,
  DOCUMENTARY_TARGET_DISTANCE,
  DOCUMENTARY_DURATIONS,
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
});
