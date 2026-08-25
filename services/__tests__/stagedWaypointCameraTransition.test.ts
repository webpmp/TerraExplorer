import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentaryController, DocumentaryDestination } from '../documentaryController';

describe('Staged Waypoint Camera Transition Suite (OSM -> Globe -> OSM)', () => {
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

  it('1. Next waypoint: strictly maintains origin coordinates during Phase 1 (Zoom Out), constant altitude during Phase 2 (Rotate), and locks to destination in Phase 3 (Zoom In)', () => {
    const wp1: DocumentaryDestination = { name: 'Dubrovnik Old Town', lat: 42.6507, lng: 18.0944, sequence: 1 };
    const wp2: DocumentaryDestination = { name: 'Castle Ward', lat: 54.3683, lng: -5.5786, sequence: 2 };

    const sampledPositions: { t: number; lat: number; lng: number; dist: number }[] = [];
    let currentTime = 0;
    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      sampledPositions.push({ t: currentTime, lat, lng, dist });
    });
    const onSettle = vi.fn();
    let isOSMActiveDuringRotation = false;

    const consoleSpy = vi.spyOn(console, 'log');

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

    expect(controller.getPhase()).toBe('zooming_out');

    // Sample across the entire 5500ms duration at 100ms intervals
    for (let t = 100; t <= 5500; t += 100) {
      currentTime = t;
      vi.advanceTimersByTime(100);

      // If in Phase 2 (Globe Rotate), verify camera distance is >= 2.40 (safely above OSM threshold 1.45 and atmosphere 1.85)
      if (controller.getPhase() === 'framing') {
        const lastDist = sampledPositions[sampledPositions.length - 1]?.dist ?? 0;
        if (lastDist < 1.85) {
          isOSMActiveDuringRotation = true;
        }
      }
    }

    // Phase 1 (0 to 35% of 5500ms -> t < 1925ms):
    // Coordinates MUST be locked to WP1 (Dubrovnik). WP2 coordinates are NOT introduced until Phase 2!
    const phase1Samples = sampledPositions.filter(p => p.t <= 1800);
    expect(phase1Samples.length).toBeGreaterThan(0);
    for (const sample of phase1Samples) {
      expect(sample.lat).toBeCloseTo(wp1.lat, 4);
      expect(sample.lng).toBeCloseTo(wp1.lng, 4);
      expect(sample.dist).toBeGreaterThanOrEqual(1.30);
    }

    // Phase 2 (35% to 67% of 5500ms -> 1925ms <= t < 3685ms):
    // Camera distance remains at globe overview distance (2.40 - 2.65), OSM is NOT active
    const phase2Samples = sampledPositions.filter(p => p.t >= 2100 && p.t <= 3500);
    expect(phase2Samples.length).toBeGreaterThan(0);
    for (const sample of phase2Samples) {
      expect(sample.dist).toBeGreaterThanOrEqual(2.40);
      expect(sample.dist).toBeLessThanOrEqual(2.66);
    }
    expect(isOSMActiveDuringRotation).toBe(false);

    // Phase 3 (67% to 100% of 5500ms -> t >= 3685ms):
    // Coordinates MUST be locked to WP2 (Castle Ward) as camera descends to 1.30
    const phase3Samples = sampledPositions.filter(p => p.t >= 3800);
    expect(phase3Samples.length).toBeGreaterThan(0);
    for (const sample of phase3Samples) {
      expect(sample.lat).toBeCloseTo(wp2.lat, 4);
      expect(sample.lng).toBeCloseTo(wp2.lng, 4);
    }

    // Final settlement
    vi.advanceTimersByTime(200);
    expect(controller.getPhase()).toBe('completed');
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Castle Ward' }));

    // Verify the required diagnostic logs were emitted in correct order with distance values
    const loggedMessages = consoleSpy.mock.calls.map(c => c[0]);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=ZOOM_OUT_START'))).toBe(true);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=ZOOM_OUT_COMPLETE'))).toBe(true);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=GLOBE_ROTATE_START'))).toBe(true);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=GLOBE_ROTATE_COMPLETE'))).toBe(true);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=ZOOM_IN_START'))).toBe(true);
    expect(loggedMessages.some(m => typeof m === 'string' && m.includes('[Documentary] NEXT waypoint=2 phase=COMPLETE'))).toBe(true);

    consoleSpy.mockRestore();
  });

  it('2. Previous waypoint: uses the identical staged transition (Zoom Out -> Rotate -> Zoom In)', () => {
    const wp2: DocumentaryDestination = { name: 'Castle Ward', lat: 54.3683, lng: -5.5786, sequence: 2 };
    const wp1: DocumentaryDestination = { name: 'Dubrovnik Old Town', lat: 42.6507, lng: 18.0944, sequence: 1 };

    const sampledPositions: { t: number; lat: number; lng: number; dist: number }[] = [];
    let currentTime = 0;
    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      sampledPositions.push({ t: currentTime, lat, lng, dist });
    });

    controller.startWaypointTransition(
      wp2,
      wp1,
      {
        getCameraDistance: () => 1.30,
        setCameraDistance: vi.fn(),
        setCameraPosition
      },
      { duration: 'cinematic' }
    );

    // Initial phase must be zooming_out from WP2
    expect(controller.getPhase()).toBe('zooming_out');

    for (let t = 100; t <= 5500; t += 100) {
      currentTime = t;
      vi.advanceTimersByTime(100);
    }

    // Phase 1: locked to WP2
    const phase1Samples = sampledPositions.filter(p => p.t <= 1800);
    for (const sample of phase1Samples) {
      expect(sample.lat).toBeCloseTo(wp2.lat, 4);
      expect(sample.lng).toBeCloseTo(wp2.lng, 4);
    }

    // Phase 3: locked to WP1
    const phase3Samples = sampledPositions.filter(p => p.t >= 3800);
    for (const sample of phase3Samples) {
      expect(sample.lat).toBeCloseTo(wp1.lat, 4);
      expect(sample.lng).toBeCloseTo(wp1.lng, 4);
    }
  });

  it('3. Race condition prevention: rapidly clicking Next cancels previous animation cleanly', () => {
    const wp1: DocumentaryDestination = { name: 'WP1', lat: 10, lng: 10, sequence: 1 };
    const wp2: DocumentaryDestination = { name: 'WP2', lat: 20, lng: 20, sequence: 2 };
    const wp3: DocumentaryDestination = { name: 'WP3', lat: 30, lng: 30, sequence: 3 };

    const setCameraPosition1 = vi.fn();
    const onSettle1 = vi.fn();
    const setCameraPosition2 = vi.fn();
    const onSettle2 = vi.fn();

    // Start transition to WP2
    const id1 = controller.startWaypointTransition(
      wp1,
      wp2,
      {
        getCameraDistance: () => 1.30,
        setCameraDistance: vi.fn(),
        setCameraPosition: setCameraPosition1,
        onSettle: onSettle1
      },
      { duration: 'cinematic' }
    );

    vi.advanceTimersByTime(500);

    // Rapidly start transition to WP3
    const id2 = controller.startWaypointTransition(
      wp2,
      wp3,
      {
        getCameraDistance: () => 1.80,
        setCameraDistance: vi.fn(),
        setCameraPosition: setCameraPosition2,
        onSettle: onSettle2
      },
      { duration: 'cinematic' }
    );

    expect(id2).toBeGreaterThan(id1);

    // Advance to end of second animation
    vi.advanceTimersByTime(6000);

    // First transition's onSettle must NOT have been called
    expect(onSettle1).not.toHaveBeenCalled();
    // Second transition completes
    expect(onSettle2).toHaveBeenCalledWith(expect.objectContaining({ name: 'WP3' }));
  });
});
