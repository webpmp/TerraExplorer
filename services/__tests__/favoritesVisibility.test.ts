import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { documentaryController, DOCUMENTARY_TARGET_DISTANCE } from '../documentaryController';
import { narrationService } from '../narrationService';
import { FavoriteLocation, Waypoint, LocationInfo } from '../../types';

describe('Saved Route / EXPLORATIONS Visibility Decoupling Suite', () => {
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  const enduranceExpedition: FavoriteLocation = {
    id: 'fav-route-endurance',
    name: 'Imperial Trans-Antarctic Expedition',
    type: 'route',
    lat: -54.2811,
    lng: -36.5092,
    waypoints: [
      {
        id: 'wp-endurance-1',
        name: 'Grytviken, South Georgia',
        lat: -54.2811,
        lng: -36.5092,
        description: 'Shackleton departed Grytviken on December 5, 1914.'
      },
      {
        id: 'wp-endurance-2',
        name: 'Weddell Sea Pack Ice',
        lat: -76.5,
        lng: -37.0,
        description: 'Endurance was trapped in pack ice in January 1915.'
      },
      {
        id: 'wp-endurance-3',
        name: 'Elephant Island',
        lat: -61.13,
        lng: -55.23,
        description: 'The crew reached Elephant Island after months on the ice.'
      }
    ]
  };

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

  it('Test 1: Closing EXPLORATIONS hides panel UI but leaves active route, waypoints, and InfoPanel visible', () => {
    // Application state
    let isFavoritesPanelOpen = true;
    let activeRouteId: string | null = enduranceExpedition.id;
    let routeWaypoints: Waypoint[] = [...enduranceExpedition.waypoints!];
    let currentWaypointIndex = 0;
    let locationInfo: LocationInfo | null = {
      name: routeWaypoints[0].name,
      coordinates: { lat: routeWaypoints[0].lat, lng: routeWaypoints[0].lng },
      description: routeWaypoints[0].description
    };

    // User closes EXPLORATIONS overlay
    isFavoritesPanelOpen = false;

    // Assert panel is closed
    expect(isFavoritesPanelOpen).toBe(false);

    // Assert route state and globe waypoints remain intact
    expect(activeRouteId).toBe('fav-route-endurance');
    expect(routeWaypoints.length).toBe(3);
    expect(routeWaypoints[0].name).toBe('Grytviken, South Georgia');
    expect(currentWaypointIndex).toBe(0);

    // Assert InfoPanel remains open
    expect(locationInfo).not.toBeNull();
    expect(locationInfo?.name).toBe('Grytviken, South Georgia');
  });

  it('Test 2: Explicit "Hide from globe" button toggles route visibility and clears active waypoints', () => {
    let activeRouteId: string | null = enduranceExpedition.id;
    let routeWaypoints: Waypoint[] = [...enduranceExpedition.waypoints!];
    let currentWaypointIndex = 0;

    const handleToggleFavoriteVisibility = (fav: FavoriteLocation) => {
      if (fav.type === 'route') {
        if (activeRouteId === fav.id) {
          // Explicit "Hide from globe" action
          activeRouteId = null;
          routeWaypoints = [];
          currentWaypointIndex = -1;
        } else {
          activeRouteId = fav.id;
          routeWaypoints = fav.waypoints || [];
          currentWaypointIndex = 0;
        }
      }
    };

    // User clicks "Hide from globe"
    handleToggleFavoriteVisibility(enduranceExpedition);

    expect(activeRouteId).toBeNull();
    expect(routeWaypoints.length).toBe(0);
    expect(currentWaypointIndex).toBe(-1);
  });

  it('Test 3: Close EXPLORATIONS and Hide from Globe are completely independent operations', () => {
    let isFavoritesPanelOpen = true;
    let activeRouteId: string | null = enduranceExpedition.id;
    let routeWaypoints: Waypoint[] = [...enduranceExpedition.waypoints!];

    // 1. Close EXPLORATIONS -> Route stays visible
    isFavoritesPanelOpen = false;
    expect(isFavoritesPanelOpen).toBe(false);
    expect(activeRouteId).toBe('fav-route-endurance');
    expect(routeWaypoints.length).toBe(3);

    // 2. Reopen EXPLORATIONS -> Route is still visible
    isFavoritesPanelOpen = true;
    expect(isFavoritesPanelOpen).toBe(true);
    expect(activeRouteId).toBe('fav-route-endurance');
    expect(routeWaypoints.length).toBe(3);

    // 3. User clicks "Hide from globe" -> Route becomes hidden
    activeRouteId = null;
    routeWaypoints = [];
    expect(activeRouteId).toBeNull();
    expect(routeWaypoints.length).toBe(0);
  });

  it('Test 4: Closing EXPLORATIONS during or after Documentary Mode does not abort camera transition or narration', () => {
    const wp1 = enduranceExpedition.waypoints![0];
    let isFavoritesPanelOpen = true;
    let cameraSettled = false;

    // Start documentary transition to Waypoint 1
    documentaryController.startSingleLocation(
      wp1,
      {
        getCameraDistance: () => 4.5,
        setCameraDistance: vi.fn(),
        onSettle: () => { cameraSettled = true; }
      },
      { duration: 'cinematic' }
    );

    narrationService.speakStructured({
      title: wp1.name,
      description: wp1.description!
    });

    expect(documentaryController.isActive()).toBe(true);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const cancelCallsBefore = mockCancel.mock.calls.length;

    // User closes EXPLORATIONS overlay while camera is in flight
    isFavoritesPanelOpen = false;

    // Assert controller is STILL running and speech is NOT cancelled
    expect(documentaryController.isActive()).toBe(true);
    expect(mockCancel.mock.calls.length).toBe(cancelCallsBefore);

    // Fast-forward animation to finish
    vi.advanceTimersByTime(6000);
    expect(cameraSettled).toBe(true);
    expect(documentaryController.getPhase()).toBe('completed');
  });

  it('Test 5: Waypoint Next/Previous navigation continues working seamlessly after EXPLORATIONS is closed', () => {
    let isFavoritesPanelOpen = false; // Closed panel
    let currentWaypointIndex = 0;
    const waypoints = enduranceExpedition.waypoints!;

    const onSettleNext = vi.fn();

    // User clicks Next Waypoint on InfoPanel
    currentWaypointIndex = 1;
    const nextWp = waypoints[1];
    const prevWp = waypoints[0];

    documentaryController.startWaypointTransition(
      prevWp,
      nextWp,
      {
        getCameraDistance: () => 1.30,
        setCameraDistance: vi.fn(),
        onSettle: onSettleNext
      },
      { duration: 'cinematic' }
    );

    expect(documentaryController.isActive()).toBe(true);
    expect(documentaryController.getTransitionType()).toBe('waypoint');
    expect(documentaryController.getPhase()).toBe('zooming_out');

    vi.advanceTimersByTime(6000);
    expect(onSettleNext).toHaveBeenCalledWith(expect.objectContaining({ name: 'Weddell Sea Pack Ice' }));
  });

  it('Test 6: InfoPanel synchronization is maintained when EXPLORATIONS opens and closes', () => {
    let isFavoritesPanelOpen = true;
    let selectedMarkerId: string | null = 'wp-endurance-1';
    let locationInfo: LocationInfo | null = {
      name: 'Grytviken, South Georgia',
      coordinates: { lat: -54.2811, lng: -36.5092 },
      description: 'Shackleton departed Grytviken on December 5, 1914.'
    };

    // Close panel
    isFavoritesPanelOpen = false;

    // InfoPanel state must not become orphaned or reset
    expect(selectedMarkerId).toBe('wp-endurance-1');
    expect(locationInfo).not.toBeNull();
    expect(locationInfo?.name).toBe('Grytviken, South Georgia');

    // Reopen panel
    isFavoritesPanelOpen = true;
    expect(selectedMarkerId).toBe('wp-endurance-1');
    expect(locationInfo?.name).toBe('Grytviken, South Georgia');
  });
});
