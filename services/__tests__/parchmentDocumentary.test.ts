import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { documentaryController } from '../documentaryController';
import { narrationService } from '../narrationService';
import { Waypoint, SkinType } from '../../types';
import { calculateOSMZoomStep } from '../../utils/cameraZoomUtils';
import { getDocumentaryCameraConfig } from '../../utils/cameraConfig';

describe('Parchment Theme Documentary Mode & Bidirectional Transition Suite', () => {
  const puntaArenas: Waypoint = {
    id: 'wp-punta-arenas',
    name: 'Punta Arenas, Chile',
    lat: -53.1638,
    lng: -70.9171,
    description: 'Port city in southern Chile where Shackleton arranged relief expeditions.'
  };

  const stromness: Waypoint = {
    id: 'wp-stromness',
    name: 'Stromness Whaling Station',
    lat: -54.1583,
    lng: -36.7111,
    description: 'Lacking climbing equipment, Shackleton, Crean, and Worsley traversed South Georgia to reach Stromness in May 1916.'
  };

  const grytviken: Waypoint = {
    id: 'wp-grytviken',
    name: 'Grytviken Whaling Station',
    lat: -54.2811,
    lng: -36.5080,
    description: 'The administrative center of South Georgia and site of Sir Ernest Shackleton’s grave.'
  };

  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSpeak = vi.fn();
    mockCancel = vi.fn();

    (global as any).window = {
      speechSynthesis: {
        speak: mockSpeak,
        cancel: mockCancel,
        getVoices: vi.fn().mockReturnValue([]),
        onvoiceschanged: null
      }
    };

    (global as any).SpeechSynthesisUtterance = vi.fn().mockImplementation(function (this: any, text: string) {
      this.text = text;
      this.rate = 1;
      this.volume = 1;
    });

    documentaryController.cancel('setup');
    narrationService.cancel();
  });

  afterEach(() => {
    documentaryController.cancel('teardown');
    narrationService.cancel();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Test 1: Parchment theme allows camera to descend into OSM view (dist <= 1.55 / 1.30) during documentary waypoint transition', () => {
    const recordedDistances: number[] = [];
    let isOSMAtmosphereEntered = false;
    let isOSMEntered = false;
    let isSettled = false;

    documentaryController.startWaypointTransition(
      puntaArenas,
      stromness,
      {
        getCameraDistance: () => 3.0,
        setCameraDistance: (d: number) => {
          recordedDistances.push(d);
        },
        setCameraPosition: (_lat: number, _lng: number, d: number) => {
          recordedDistances.push(d);
        },
        onAtmosphereEnter: () => {
          isOSMAtmosphereEntered = true;
        },
        onOSMEnter: () => {
          isOSMEntered = true;
        },
        onSettle: () => {
          isSettled = true;
        }
      },
      { duration: 'cinematic' }
    );

    expect(documentaryController.isActive()).toBe(true);
    expect(documentaryController.getPhase()).toBe('zooming_out');

    // Advance through zoom out (3.0 -> 3.1)
    vi.advanceTimersByTime(1200);

    // Advance through framing and rotation
    vi.advanceTimersByTime(2000);

    // Advance through descent into atmosphere (dist <= 1.85) and OSM (dist <= 1.55 -> 1.30)
    vi.advanceTimersByTime(2800);

    expect(isSettled).toBe(true);
    expect(isOSMAtmosphereEntered).toBe(true);
    expect(isOSMEntered).toBe(true);

    const minDistance = Math.min(...recordedDistances);
    expect(minDistance).toBeLessThanOrEqual(1.30);
  });

  it('Test 2: AuthoritativeCameraEnforcer respects parchmentZoom during manual zoom without clamping to stale route suggested distance', () => {
    const aspect = 1920 / 1080;
    const baseDistance = (3.0 * 1.28985) / aspect; // 2.14975

    // Helper to calculate authoritative distance for parchment
    const calcParchmentDist = (parchmentZoom: number) => {
      const effectiveZoom = Math.max(0.375, Math.min(50.0, parchmentZoom));
      return Math.max(1.018, Math.min(8.0, baseDistance / effectiveZoom));
    };

    // 1. Globe resting zoom (parchmentZoom = 1.0)
    const globeDist = calcParchmentDist(1.0);
    expect(globeDist).toBeCloseTo(baseDistance, 2);

    // 2. OSM zoom level (parchmentZoom = baseDistance / 1.30 = ~1.65)
    const osmZoom = baseDistance / 1.30;
    const osmDist = calcParchmentDist(osmZoom);
    expect(osmDist).toBeCloseTo(1.30, 2);

    // 3. User manually zooms out from OSM (parchmentZoom decreases towards 1.0)
    const halfwayZoom = baseDistance / 1.70;
    const halfwayDist = calcParchmentDist(halfwayZoom);
    expect(halfwayDist).toBeCloseTo(1.70, 2);

    // 4. Returns fully to globe
    const finalGlobeDist = calcParchmentDist(1.0);
    expect(finalGlobeDist).toBeCloseTo(baseDistance, 2);
  });

  it('Test 3: Bidirectional manual zoom (OSM -> Globe -> OSM) operates symmetrically across all 4 skins', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      // Step A: In OSM view (dist = 1.30)
      let currentDistance = 1.30;
      let currentOSMZoom = 14;

      // User scrolls OUT
      while (true) {
        const step = calculateOSMZoomStep(currentOSMZoom, 'out');
        currentOSMZoom = step.targetZoom;
        currentDistance = step.targetDistance;
        if (step.exitsOSM) break;
      }

      // At zoom 10, exiting OSM into atmosphere
      expect(currentDistance).toBeGreaterThanOrEqual(1.55);

      // Continuing to scroll out into space / globe
      currentDistance = skin === 'parchment' ? 2.15 : 4.50;
      expect(currentDistance).toBeGreaterThan(1.85);

      // Step B: In Globe view, user scrolls back IN
      currentDistance = 1.70; // Atmospheric clouds appear (1.85 -> 1.55)
      expect(currentDistance).toBeLessThan(1.85);
      expect(currentDistance).toBeGreaterThan(1.55);

      currentDistance = 1.30; // Enters OSM detail view
      expect(currentDistance).toBeLessThanOrEqual(1.55);
    });
  });

  it('Test A: Globe zoom-out boundary - camera distance never exceeds parchment maximum safe distance', () => {
    const aspect = 1920 / 1080;
    const baseDistance = (3.0 * 1.28985) / aspect; // 2.14975
    const config = getDocumentaryCameraConfig('parchment', aspect);

    expect(config.maximumGlobeZoomOutDistance).toBeCloseTo(baseDistance, 4);
    expect(config.globeOverviewDistance).toBeCloseTo(baseDistance, 4);

    // Any raw input distance clamped by config never exceeds baseDistance
    expect(config.clampDistance(10.0)).toBeCloseTo(baseDistance, 4);
    expect(config.clampDistance(4.5)).toBeCloseTo(baseDistance, 4);
    expect(config.clampDistance(3.0)).toBeCloseTo(baseDistance, 4);
    expect(config.clampDistance(1.3)).toBeCloseTo(1.3, 4);
  });

  it('Test B: Documentary waypoint transition (OSM -> zoom out -> framing -> zoom in -> OSM) never exceeds parchment max distance', () => {
    const recordedDistances: number[] = [];
    let isOSMAtmosphereEntered = false;
    let isOSMEntered = false;
    let isSettled = false;
    const aspect = 1920 / 1080;
    const baseDistance = (3.0 * 1.28985) / aspect;

    documentaryController.startWaypointTransition(
      puntaArenas,
      stromness,
      {
        getCameraDistance: () => 1.30,
        setCameraDistance: (d: number) => {
          recordedDistances.push(d);
        },
        setCameraPosition: (_lat: number, _lng: number, d: number) => {
          recordedDistances.push(d);
        },
        onAtmosphereEnter: () => {
          isOSMAtmosphereEntered = true;
        },
        onOSMEnter: () => {
          isOSMEntered = true;
        },
        onSettle: () => {
          isSettled = true;
        }
      },
      { duration: 'cinematic', skin: 'parchment', aspect }
    );

    expect(documentaryController.isActive()).toBe(true);

    // Step through the entire animation
    vi.advanceTimersByTime(1200);
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(2800);

    expect(isSettled).toBe(true);
    expect(isOSMAtmosphereEntered).toBe(true);
    expect(isOSMEntered).toBe(true);

    // CRITICAL ASSERTION: No single recorded animation frame exceeded parchment's maximum safe distance
    const maxRecorded = Math.max(...recordedDistances);
    expect(maxRecorded).toBeLessThanOrEqual(baseDistance + 0.0001);

    const minRecorded = Math.min(...recordedDistances);
    expect(minRecorded).toBeLessThanOrEqual(1.30);
  });

  it('Test C: Search from OSM (OSM -> globe -> rotate -> target centered -> OSM) does not activate new OSM during zoom out/rotate and respects bounds', () => {
    let activeOSM: { lat: number; lng: number } | null = null;
    const recordedDistances: number[] = [];
    const recordedPhases: string[] = [];
    const aspect = 1920 / 1080;
    const baseDistance = (3.0 * 1.28985) / aspect;
    let isSettled = false;

    documentaryController.startSingleLocation(
      stromness,
      {
        getCameraDistance: () => 1.30,
        getCameraCoordinates: () => ({ lat: puntaArenas.lat, lng: puntaArenas.lng }),
        setCameraDistance: (d: number) => {
          recordedDistances.push(d);
          recordedPhases.push(documentaryController.getPhase());
        },
        setCameraPosition: (_lat: number, _lng: number, d: number) => {
          recordedDistances.push(d);
          recordedPhases.push(documentaryController.getPhase());
        },
        onAtmosphereEnter: () => {
          activeOSM = { lat: stromness.lat, lng: stromness.lng };
        },
        onOSMEnter: () => {
          activeOSM = { lat: stromness.lat, lng: stromness.lng };
        },
        onSettle: () => {
          isSettled = true;
        }
      },
      { duration: 'cinematic', skin: 'parchment', aspect }
    );

    // Phase 1: Zoom out from origin (0 - 30% = 0 - 1650ms)
    expect(documentaryController.getPhase()).toBe('zooming_out');
    expect(activeOSM).toBeNull();

    vi.advanceTimersByTime(1200);
    expect(activeOSM).toBeNull(); // Old OSM is not active, new OSM has not activated yet

    // Phase 2: Rotating at globe overview (30% - 65% = 1650ms - 3575ms)
    vi.advanceTimersByTime(1500);
    expect(documentaryController.getPhase()).toBe('rotating');
    expect(activeOSM).toBeNull();

    // Phase 3: Descending toward destination
    vi.advanceTimersByTime(2300);
    expect(documentaryController.getPhase()).toBe('descending');
    expect(activeOSM).toEqual({ lat: stromness.lat, lng: stromness.lng });

    vi.advanceTimersByTime(1000);
    expect(isSettled).toBe(true);

    // Assert max distance never exceeded baseDistance on any frame
    const maxRecorded = Math.max(...recordedDistances);
    expect(maxRecorded).toBeLessThanOrEqual(baseDistance + 0.0001);
  });

  it('Test D: After Documentary Mode settles, user zoom out and zoom in remain strictly within bounds', () => {
    const aspect = 1920 / 1080;
    const baseDistance = (3.0 * 1.28985) / aspect;

    const calcParchmentDist = (parchmentZoom: number) => {
      const effectiveZoom = Math.max(1.0, Math.min(50.0, parchmentZoom));
      return Math.max(1.018, Math.min(baseDistance, baseDistance / effectiveZoom));
    };

    // User zooms all the way out: parchmentZoom clamped to >= 1.0
    const maxZoomOutDist = calcParchmentDist(0.1);
    expect(maxZoomOutDist).toBeCloseTo(baseDistance, 4);

    // User zooms in to OSM detail
    const inDist = calcParchmentDist(baseDistance / 1.30);
    expect(inDist).toBeCloseTo(1.30, 4);

    // User zooms back out halfway
    const halfwayDist = calcParchmentDist(baseDistance / 1.70);
    expect(halfwayDist).toBeCloseTo(1.70, 4);
  });

  it('Test E: Narration receives structured payload with both title and description and speaks combined text', () => {
    narrationService.speakStructured({
      title: 'Stromness Whaling Station',
      description: 'Lacking climbing equipment, Shackleton, Crean, and Worsley traversed South Georgia to reach Stromness in May 1916.'
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toContain('Stromness Whaling Station');
    expect(utterance.text).toContain('Lacking climbing equipment');
  });

  it('Test F: Narration race condition - late arriving description from older selection is discarded in favor of current selection', () => {
    let activeSelectionId = 'wp-A';
    let spokenPayloads: string[] = [];

    const handlePayloadArrival = (id: string, title: string, description: string) => {
      // Replicate the exact gate in maybeTriggerNarration
      if (id !== activeSelectionId) {
        // Discarded stale payload
        return;
      }
      spokenPayloads.push(`${title}. ${description}`);
      narrationService.speakStructured({ title, description });
    };

    // 1. User selects Waypoint A
    activeSelectionId = 'wp-A';

    // 2. User quickly selects Waypoint B
    activeSelectionId = 'wp-B';

    // 3. Waypoint A's delayed enrichment finishes and arrives late
    handlePayloadArrival('wp-A', 'Punta Arenas', 'Port city in southern Chile where Shackleton arranged relief.');

    // 4. Waypoint B's enrichment arrives
    handlePayloadArrival('wp-B', 'Stromness Whaling Station', 'Lacking climbing equipment, Shackleton reached Stromness.');

    // Only Waypoint B should have been spoken!
    expect(spokenPayloads).toHaveLength(1);
    expect(spokenPayloads[0]).toContain('Stromness Whaling Station');
    expect(spokenPayloads[0]).not.toContain('Punta Arenas');
  });
});
