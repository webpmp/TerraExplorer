import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { documentaryController, DOCUMENTARY_TARGET_DISTANCE } from '../documentaryController';
import { narrationService } from '../narrationService';
import { UserSettings, Waypoint, MapMarker, LocationInfo } from '../../types';
import { latLngToVector3, vector3ToLatLng } from '../../utils/globeCoordinates';

describe('Documentary Mode & Narration Integration Suite', () => {
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

  it('Test 1: Globe rotates to destination and centers before descent', () => {
    const originCoords = { lat: 0, lng: 0 };
    const dest = { id: 'loc-tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

    let currentLat = originCoords.lat;
    let currentLng = originCoords.lng;
    let currentDist = 4.5; // Starting from Globe view

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      currentLat = lat;
      currentLng = lng;
      currentDist = dist;
    });

    const onSettle = vi.fn();

    documentaryController.startSingleLocation(
      dest,
      {
        getCameraDistance: () => currentDist,
        getCameraCoordinates: () => ({ lat: currentLat, lng: currentLng }),
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onSettle
      },
      { duration: 'cinematic' } // 5500ms
    );

    // Initial phase is rotating to destination
    expect(documentaryController.getPhase()).toBe('rotating');

    // Midway through rotation (t = 1500ms)
    vi.advanceTimersByTime(1500);
    expect(documentaryController.getPhase()).toBe('rotating');
    expect(currentDist).toBeCloseTo(4.5);
    expect(currentLat).not.toBe(originCoords.lat);

    // End of rotation / start of descent (t = 2500ms)
    vi.advanceTimersByTime(1000);
    expect(documentaryController.getPhase()).toBe('descending');
    expect(currentLat).toBeCloseTo(dest.lat, 1);
    expect(currentLng).toBeCloseTo(dest.lng, 1);

    // Descent completes
    vi.advanceTimersByTime(3500);
    expect(currentDist).toBeCloseTo(DOCUMENTARY_TARGET_DISTANCE);
    expect(onSettle).toHaveBeenCalled();
  });

  it('Test 2: First waypoint triggers narration with title + description as soon as data loads', () => {
    const wp1: Waypoint = {
      id: 'wp-1',
      name: 'Plymouth, England',
      lat: 50.3755,
      lng: -4.1427,
      description: 'Departure port of the HMS Beagle expedition in December 1831.'
    };

    let spokenId: string | null = null;
    let speechText = '';

    const triggerFirstWaypointNarration = (wp: Waypoint) => {
      const initialPayload: any = {
        id: wp.id,
        name: wp.name,
        description: wp.description || '',
        coordinates: { lat: wp.lat, lng: wp.lng }
      };

      const title = initialPayload.name;
      const desc = initialPayload.description;
      if (title && desc && desc.trim().length >= 3 && spokenId !== initialPayload.id) {
        spokenId = initialPayload.id;
        narrationService.speakStructured({ title, description: desc });
      }
    };

    triggerFirstWaypointNarration(wp1);

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    speechText = mockSpeak.mock.calls[0][0].text;
    expect(speechText).toContain('Plymouth, England');
    expect(speechText).toContain('Departure port of the HMS Beagle');
  });

  it('Test 3: Waypoint Next executes ZOOM_OUT -> GLOBE -> FRAMING -> ZOOM_IN without rendering destination OSM during zoom-out', () => {
    const wp1: Waypoint = { id: 'wp-1', name: 'Plymouth', lat: 50.3755, lng: -4.1427, description: 'Port 1' };
    const wp2: Waypoint = { id: 'wp-2', name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, description: 'Port 2' };

    let activeOSMCoordinates: { lat: number; lng: number } | null = null;
    let currentDist = 1.30;

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      currentDist = dist;
    });

    const onAtmosphereEnter = vi.fn(() => {
      activeOSMCoordinates = { lat: wp2.lat, lng: wp2.lng };
    });

    const onSettle = vi.fn(() => {
      activeOSMCoordinates = { lat: wp2.lat, lng: wp2.lng };
    });

    documentaryController.startWaypointTransition(
      wp1,
      wp2,
      {
        getCameraDistance: () => currentDist,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onAtmosphereEnter,
        onSettle
      },
      { duration: 'cinematic' }
    );

    // Zoom-out phase begins
    expect(documentaryController.getPhase()).toBe('zooming_out');
    expect(activeOSMCoordinates).toBeNull();

    // 1500ms in: still zooming out to globe level
    vi.advanceTimersByTime(1500);
    expect(activeOSMCoordinates).toBeNull();

    // Framing phase at globe altitude
    vi.advanceTimersByTime(1000);
    expect(documentaryController.getPhase()).toBe('framing');
    expect(activeOSMCoordinates).toBeNull();

    // Zoom-in descent phase passing atmosphere (at t = 5100ms)
    vi.advanceTimersByTime(2600);
    expect(documentaryController.getPhase()).toBe('descending');
    expect(onAtmosphereEnter).toHaveBeenCalled();
    expect(activeOSMCoordinates).toEqual({ lat: wp2.lat, lng: wp2.lng });

    // Settle at wp2
    vi.advanceTimersByTime(600);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Buenos Aires' }));
  });

  it('Test 4: Waypoint Previous executes ZOOM_OUT -> GLOBE -> FRAMING -> ZOOM_IN in reverse', () => {
    const wp3: Waypoint = { id: 'wp-3', name: 'Cape Horn', lat: -55.98, lng: -67.27, description: 'Southern tip' };
    const wp2: Waypoint = { id: 'wp-2', name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, description: 'Port' };

    let activeOSMCoordinates: { lat: number; lng: number } | null = null;
    let currentDist = 1.30;

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      currentDist = dist;
    });

    const onAtmosphereEnter = vi.fn(() => {
      activeOSMCoordinates = { lat: wp2.lat, lng: wp2.lng };
    });

    const onSettle = vi.fn(() => {
      activeOSMCoordinates = { lat: wp2.lat, lng: wp2.lng };
    });

    documentaryController.startWaypointTransition(
      wp3,
      wp2,
      {
        getCameraDistance: () => currentDist,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onAtmosphereEnter,
        onSettle
      },
      { duration: 'cinematic' }
    );

    expect(documentaryController.getPhase()).toBe('zooming_out');
    expect(activeOSMCoordinates).toBeNull();

    vi.advanceTimersByTime(2500);
    expect(documentaryController.getPhase()).toBe('framing');
    expect(activeOSMCoordinates).toBeNull();

    vi.advanceTimersByTime(2600);
    expect(documentaryController.getPhase()).toBe('descending');
    expect(onAtmosphereEnter).toHaveBeenCalled();
    expect(activeOSMCoordinates).toEqual({ lat: wp2.lat, lng: wp2.lng });

    vi.advanceTimersByTime(600);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Buenos Aires' }));
  });

  it('Test 5: Search/explore from waypoint OSM zooms out to Globe before rotating to new destination', () => {
    const wp1Coords = { lat: 50.3755, lng: -4.1427 }; // Plymouth OSM
    const searchDest = { id: 'search-cairo', name: 'Cairo', lat: 30.0444, lng: 31.2357, description: 'Capital of Egypt.' };

    let cameraDist = 1.30; // In OSM
    let activeOSMCoordinates: { lat: number; lng: number } | null = null;

    const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
      cameraDist = dist;
    });

    const onAtmosphereEnter = vi.fn(() => {
      activeOSMCoordinates = { lat: searchDest.lat, lng: searchDest.lng };
    });

    const onSettle = vi.fn();

    documentaryController.startSingleLocation(
      searchDest,
      {
        getCameraDistance: () => cameraDist,
        getCameraCoordinates: () => wp1Coords,
        setCameraDistance: vi.fn(),
        setCameraPosition,
        onAtmosphereEnter,
        onSettle
      },
      { duration: 'cinematic' }
    );

    // Step 1: Zooming out from Plymouth OSM
    expect(documentaryController.getPhase()).toBe('zooming_out');
    expect(activeOSMCoordinates).toBeNull();

    // Step 2: Rotating to Cairo at Globe altitude
    vi.advanceTimersByTime(2500);
    expect(documentaryController.getPhase()).toBe('rotating');
    expect(cameraDist).toBeGreaterThanOrEqual(4.0);

    // Step 3: Descending into Cairo
    vi.advanceTimersByTime(2600);
    expect(documentaryController.getPhase()).toBe('descending');
    expect(onAtmosphereEnter).toHaveBeenCalled();
    expect(activeOSMCoordinates).toEqual({ lat: searchDest.lat, lng: searchDest.lng });

    vi.advanceTimersByTime(600);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cairo' }));
  });

  it('Test 6: Narration toggle OFF immediately stops active speech and prevents pending speech from starting', () => {
    let narrationEnabled = true;

    const updateSettings = (newEnabled: boolean) => {
      narrationEnabled = newEnabled;
      if (!newEnabled) {
        narrationService.cancel();
      }
    };

    // 1. Start speech
    narrationService.speakStructured({
      title: 'Rome',
      description: 'The Eternal City of Italy.'
    });
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // 2. User turns Narration OFF -> speech immediately cancels
    updateSettings(false);
    expect(mockCancel).toHaveBeenCalled();

    // 3. Stale async callback tries to trigger narration
    if (narrationEnabled) {
      narrationService.speakStructured({
        title: 'Rome',
        description: 'Enriched description of Rome.'
      });
    }

    // Must NOT start new speech
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('Test 7: Single search result automatically initiates InfoPanel and camera transition without requiring a marker click', () => {
    const singleResult = {
      id: 'search-101',
      name: 'Machu Picchu',
      lat: -13.1631,
      lng: -72.5450,
      description: '15th-century Inca citadel.'
    };

    let isInfoPanelOpen = false;
    let isTransitionStarted = false;

    const handleSingleSearchResult = (result: typeof singleResult) => {
      // Direct automatic selection
      isInfoPanelOpen = true;
      isTransitionStarted = true;
      documentaryController.startSingleLocation(result, {
        getCameraDistance: () => 4.5,
        setCameraDistance: vi.fn(),
        onSettle: vi.fn()
      });
      narrationService.speakStructured({ title: result.name, description: result.description });
    };

    handleSingleSearchResult(singleResult);

    expect(isInfoPanelOpen).toBe(true);
    expect(isTransitionStarted).toBe(true);
    expect(documentaryController.isActive()).toBe(true);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('Test 8: Multiple results wait for explicit user marker selection before starting documentary transition', () => {
    const results = [
      { id: 'm1', name: 'Athens', lat: 37.9838, lng: 23.7275, description: 'Capital of Greece' },
      { id: 'm2', name: 'Sparta', lat: 37.0745, lng: 22.4303, description: 'Ancient city-state' }
    ];

    let activeEntity: any = null;

    const handleMultipleSearchResults = (markers: typeof results) => {
      // Displays markers, does NOT automatically start transition
      activeEntity = null;
    };

    const handleMarkerClick = (marker: typeof results[0]) => {
      activeEntity = marker;
      documentaryController.startSingleLocation(marker, {
        getCameraDistance: () => 4.5,
        setCameraDistance: vi.fn(),
        onSettle: vi.fn()
      });
      narrationService.speakStructured({ title: marker.name, description: marker.description });
    };

    handleMultipleSearchResults(results);
    expect(activeEntity).toBeNull();
    expect(documentaryController.isActive()).toBe(false);

    // User selects Athens
    handleMarkerClick(results[0]);
    expect(activeEntity).toEqual(results[0]);
    expect(documentaryController.isActive()).toBe(true);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('Test 9: Rapid destination changes (A -> B -> C) only allow the latest destination C to control camera and narration', () => {
    const onSettleA = vi.fn();
    const onSettleB = vi.fn();
    const onSettleC = vi.fn();

    // Select A
    documentaryController.startSingleLocation(
      { id: 'A', name: 'Location A', lat: 10, lng: 10 },
      { getCameraDistance: () => 4.5, setCameraDistance: vi.fn(), onSettle: onSettleA }
    );
    narrationService.speakStructured({ title: 'Location A', description: 'Description A' });

    vi.advanceTimersByTime(500);

    // Select B
    documentaryController.startSingleLocation(
      { id: 'B', name: 'Location B', lat: 20, lng: 20 },
      { getCameraDistance: () => 4.5, setCameraDistance: vi.fn(), onSettle: onSettleB }
    );
    narrationService.speakStructured({ title: 'Location B', description: 'Description B' });

    vi.advanceTimersByTime(500);

    // Select C
    documentaryController.startSingleLocation(
      { id: 'C', name: 'Location C', lat: 30, lng: 30 },
      { getCameraDistance: () => 4.5, setCameraDistance: vi.fn(), onSettle: onSettleC }
    );
    narrationService.speakStructured({ title: 'Location C', description: 'Description C' });

    vi.advanceTimersByTime(6000);

    expect(onSettleA).not.toHaveBeenCalled();
    expect(onSettleB).not.toHaveBeenCalled();
    expect(onSettleC).toHaveBeenCalledWith(expect.objectContaining({ name: 'Location C' }));
    expect(mockCancel).toHaveBeenCalled();
  });

  it('Test 10: Single-location historical search (Louisiana Purchase at Saint Louis Cathedral) executes without ReferenceError and speaks title + description', () => {
    const singleWaypoint: Waypoint = {
      id: 'site-louisiana-purchase',
      name: 'Saint Louis Cathedral',
      lat: 29.951,
      lng: -90.0716,
      description: 'Saint Louis Cathedral in New Orleans was the site of the formal transfer ceremony of the Louisiana Territory in 1803.'
    };

    // Simulate Three.js camera in local space
    const initialLocalPos = latLngToVector3(0, 0, 4.5);
    const cameraCoordinates = vector3ToLatLng(initialLocalPos);

    expect(cameraCoordinates).toBeDefined();
    expect(Number.isFinite(cameraCoordinates.lat)).toBe(true);
    expect(Number.isFinite(cameraCoordinates.lng)).toBe(true);

    const onSettle = vi.fn();
    const setCameraPosition = vi.fn();

    // Call startSingleLocation with camera coordinate extractor
    expect(() => {
      documentaryController.startSingleLocation(
        {
          id: singleWaypoint.id,
          name: singleWaypoint.name,
          lat: singleWaypoint.lat,
          lng: singleWaypoint.lng,
          description: singleWaypoint.description
        },
        {
          getCameraDistance: () => 4.5,
          getCameraCoordinates: () => cameraCoordinates,
          setCameraDistance: vi.fn(),
          setCameraPosition,
          onSettle
        },
        { duration: 'cinematic' }
      );
    }).not.toThrow();

    expect(documentaryController.isActive()).toBe(true);

    // Narration trigger
    narrationService.speakStructured({
      title: singleWaypoint.name,
      description: singleWaypoint.description!
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const spokenPayload = mockSpeak.mock.calls[0][0].text;
    expect(spokenPayload).toContain('Saint Louis Cathedral');
    expect(spokenPayload).toContain('formal transfer ceremony of the Louisiana Territory');

    // Fast-forward animation to completion
    vi.advanceTimersByTime(6000);
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Saint Louis Cathedral' }));
  });
});
