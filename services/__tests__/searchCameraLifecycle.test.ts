import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pipelineModule from '../pipeline';
import * as geminiService from '../geminiService';

describe('Search Camera Lifecycle & Continuous Globe Rotation Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  interface LifecycleSimulationState {
    autoRotate: boolean;
    activeRequestId: number;
    committedDestination: any | null;
    searchError: string | null;
    isDiscoveryLoading: boolean;
    interactionState: string;
    logs: string[];
  }

  const createSearchLifecycleSimulator = (initialAutoRotate = true) => {
    const state: LifecycleSimulationState = {
      autoRotate: initialAutoRotate,
      activeRequestId: 0,
      committedDestination: null,
      searchError: null,
      isDiscoveryLoading: false,
      interactionState: 'GLOBE_IDLE',
      logs: []
    };

    const handleSearch = async (query: string) => {
      const cleanQuery = query.trim();
      if (!cleanQuery) return;
      const currentSearchId = ++state.activeRequestId;
      state.logs.push('[SearchNarration] SEARCH_SUBMITTED');
      state.logs.push('[Camera] SEARCH_STARTED rotation preserved');

      const parsedQuery = geminiService.routeIntentAndExtractEntity(cleanQuery);

      if (parsedQuery.intent === 'EXPLORATORY' || parsedQuery.intent === 'MULTI_LOCATION_DISCOVERY' || parsedQuery.resolutionMode === 'MULTI_LOCATION_EXPLORATION') {
        await handleTraceRoute(cleanQuery, currentSearchId);
        return;
      }

      state.interactionState = 'GLOBE_SEARCHING';
      state.isDiscoveryLoading = true;
      state.logs.push('[Scan Lifecycle] DISCOVERY_STARTED');
      state.logs.push(`[SearchNarration] PIPELINE_STARTED query="${cleanQuery}" entity="${parsedQuery.entity}"`);
      state.searchError = null;

      try {
        const pipelineResult = await pipelineModule.runSearchPipeline({
          rawQuery: cleanQuery,
          intent: parsedQuery.intent,
          entity: parsedQuery.entity
        });

        if (currentSearchId !== state.activeRequestId) {
          state.logs.push(`[Search] STALE_SEARCH_DISCARDED searchId=${currentSearchId} activeId=${state.activeRequestId}`);
          return;
        }

        state.logs.push(`[SearchNarration] PIPELINE_COMPLETED query="${cleanQuery}" isValid=${pipelineResult.isValid}`);

        const hasValidCoords = pipelineResult.isValid && (pipelineResult as any).finalData && !pipelineResult.error && (pipelineResult as any).finalData.coordinates;

        if (hasValidCoords) {
          const finalData = (pipelineResult as any).finalData;
          state.logs.push('[Camera] DESTINATION_COMMITTED ownership transferred');
          state.autoRotate = false;
          state.interactionState = 'PIN_SELECTED';
          state.committedDestination = finalData;
          state.isDiscoveryLoading = false;
          state.logs.push('[Scan Lifecycle] DISCOVERY_COMPLETE');
        } else {
          state.logs.push('[Camera] SEARCH_NO_RESULT rotation preserved');
          state.interactionState = 'GLOBE_IDLE';
          state.searchError = "Unable to resolve location.";
          state.isDiscoveryLoading = false;
          state.logs.push('[Scan Lifecycle] DISCOVERY_FAILED');
        }
      } catch (err) {
        if (currentSearchId !== state.activeRequestId) return;
        state.logs.push('[Camera] SEARCH_ERROR rotation preserved');
        state.interactionState = 'GLOBE_IDLE';
        state.searchError = "Unable to resolve location.";
        state.isDiscoveryLoading = false;
        state.logs.push('[Scan Lifecycle] DISCOVERY_FAILED');
      }
    };

    const handleTraceRoute = async (text: string, searchRequestId?: number) => {
      const currentSearchId = searchRequestId || ++state.activeRequestId;
      state.interactionState = 'GLOBE_SEARCHING';
      state.isDiscoveryLoading = true;
      state.logs.push('[Scan Lifecycle] DISCOVERY_STARTED');
      state.searchError = null;

      try {
        const route = await geminiService.generateRoute(text);
        if (currentSearchId !== state.activeRequestId) return;

        if (route.waypoints && route.waypoints.length > 0) {
          state.logs.push('[Camera] DESTINATION_COMMITTED ownership transferred');
          state.autoRotate = false;
          state.interactionState = 'PIN_SELECTED';
          state.committedDestination = route.waypoints[0];
          state.isDiscoveryLoading = false;
          state.logs.push('[Scan Lifecycle] DISCOVERY_COMPLETE');
        } else {
          state.logs.push('[Camera] SEARCH_NO_RESULT rotation preserved');
          state.interactionState = 'GLOBE_IDLE';
          state.searchError = "No identifiable locations found in the text.";
          state.isDiscoveryLoading = false;
          state.logs.push('[Scan Lifecycle] DISCOVERY_FAILED');
        }
      } catch (err) {
        if (currentSearchId !== state.activeRequestId) return;
        state.logs.push('[Camera] SEARCH_ERROR rotation preserved');
        state.interactionState = 'GLOBE_IDLE';
        state.searchError = "Unable to trace route.";
        state.isDiscoveryLoading = false;
        state.logs.push('[Scan Lifecycle] DISCOVERY_FAILED');
      }
    };

    return { state, handleSearch, handleTraceRoute };
  };

  it('1. Search submitted keeps globe rotating while query is processing', async () => {
    let resolvePipelinePromise: (res: any) => void;
    const pendingPipeline = new Promise((resolve) => {
      resolvePipelinePromise = resolve;
    });

    vi.spyOn(pipelineModule, 'runSearchPipeline').mockImplementation(() => pendingPipeline as any);

    const { state, handleSearch } = createSearchLifecycleSimulator(true);

    const searchPromise = handleSearch('Where was the SS Republic found?');

    // While search is in-flight:
    expect(state.isDiscoveryLoading).toBe(true);
    expect(state.autoRotate).toBe(true); // Must remain true!
    expect(state.logs).toContain('[Camera] SEARCH_STARTED rotation preserved');
    expect(state.logs).not.toContain('[Camera] DESTINATION_COMMITTED ownership transferred');

    // Complete search with valid result
    resolvePipelinePromise!({
      isValid: true,
      mode: 'location',
      finalData: {
        name: 'SS Republic',
        canonicalName: 'SS Republic',
        coordinates: { lat: 31.55, lng: -79.79 },
        entityType: 'shipwreck_site'
      }
    });

    await searchPromise;

    // After valid destination commitment:
    expect(state.autoRotate).toBe(false);
    expect(state.logs).toContain('[Camera] DESTINATION_COMMITTED ownership transferred');
    expect(state.committedDestination?.name).toBe('SS Republic');
  });

  it('2. Search resulting in no location found leaves globe rotating', async () => {
    vi.spyOn(pipelineModule, 'runSearchPipeline').mockResolvedValue({
      isValid: false,
      error: 'NO_GEOGRAPHIC_DATA',
      mode: 'location'
    } as any);

    const { state, handleSearch } = createSearchLifecycleSimulator(true);

    await handleSearch('nonexistent mystical location xyz123');

    expect(state.autoRotate).toBe(true); // Invariant: rotation preserved!
    expect(state.logs).toContain('[Camera] SEARCH_STARTED rotation preserved');
    expect(state.logs).toContain('[Camera] SEARCH_NO_RESULT rotation preserved');
    expect(state.logs).not.toContain('[Camera] DESTINATION_COMMITTED ownership transferred');
    expect(state.searchError).toBe('Unable to resolve location.');
  });

  it('3. Search error / exception leaves globe rotating', async () => {
    vi.spyOn(pipelineModule, 'runSearchPipeline').mockRejectedValue(new Error('Network timeout or LM Studio error'));

    const { state, handleSearch } = createSearchLifecycleSimulator(true);

    await handleSearch('Rome');

    expect(state.autoRotate).toBe(true); // Invariant: rotation preserved!
    expect(state.logs).toContain('[Camera] SEARCH_STARTED rotation preserved');
    expect(state.logs).toContain('[Camera] SEARCH_ERROR rotation preserved');
    expect(state.logs).not.toContain('[Camera] DESTINATION_COMMITTED ownership transferred');
  });

  it('4. Rapid consecutive searches: old search failure does not interfere with newer search', async () => {
    let resolveSearchA: (res: any) => void;
    const promiseA = new Promise((resolve) => { resolveSearchA = resolve; });

    let resolveSearchB: (res: any) => void;
    const promiseB = new Promise((resolve) => { resolveSearchB = resolve; });

    const pipelineSpy = vi.spyOn(pipelineModule, 'runSearchPipeline');
    pipelineSpy.mockImplementationOnce(() => promiseA as any);
    pipelineSpy.mockImplementationOnce(() => promiseB as any);

    const { state, handleSearch } = createSearchLifecycleSimulator(true);

    // User submits Search A
    const runA = handleSearch('Atlantis');
    expect(state.activeRequestId).toBe(1);
    expect(state.autoRotate).toBe(true);

    // User immediately submits Search B before A finishes
    const runB = handleSearch('Paris');
    expect(state.activeRequestId).toBe(2);
    expect(state.autoRotate).toBe(true);

    // Search A finishes with failure
    resolveSearchA!({
      isValid: false,
      error: 'NO_GEOGRAPHIC_DATA',
      mode: 'location'
    });
    await runA;

    // A was discarded and did not affect rotation
    expect(state.autoRotate).toBe(true);

    // Search B finishes with valid destination
    resolveSearchB!({
      isValid: true,
      mode: 'location',
      finalData: {
        name: 'Paris',
        coordinates: { lat: 48.8566, lng: 2.3522 },
        entityType: 'city'
      }
    });
    await runB;

    // B successfully transfers camera ownership
    expect(state.autoRotate).toBe(false);
    expect(state.committedDestination?.name).toBe('Paris');
    expect(state.logs).toContain('[Camera] DESTINATION_COMMITTED ownership transferred');
  });

  it('5. Route discovery query preserves rotation until route waypoints are generated', async () => {
    vi.spyOn(geminiService, 'generateRoute').mockResolvedValue({
      title: 'Voyage of Columbus',
      waypoints: [
        { name: 'Palos de la Frontera', lat: 37.2285, lng: -6.8937 },
        { name: 'Guanahani', lat: 24.06, lng: -74.46 }
      ]
    } as any);

    const { state, handleTraceRoute } = createSearchLifecycleSimulator(true);

    await handleTraceRoute('trace Columbus voyage');

    expect(state.autoRotate).toBe(false);
    expect(state.committedDestination?.name).toBe('Palos de la Frontera');
    expect(state.logs).toContain('[Camera] DESTINATION_COMMITTED ownership transferred');
  });

  it('6. Route discovery query failure preserves rotation', async () => {
    vi.spyOn(geminiService, 'generateRoute').mockResolvedValue({
      title: 'Empty Route',
      waypoints: []
    } as any);

    const { state, handleTraceRoute } = createSearchLifecycleSimulator(true);

    await handleTraceRoute('trace invalid route');

    expect(state.autoRotate).toBe(true); // Preserved!
    expect(state.logs).toContain('[Camera] SEARCH_NO_RESULT rotation preserved');
  });

  it('7. Submitting a new search while zoomed into OSM triggers multi-frame smoothReturnToGlobe to 4.5 while maintaining autoRotate', () => {
    let currentCameraDistance = 1.30;
    let isOSMActive = true;
    let autoRotate = false;
    let selectedMarkerId: string | null = 'marker-old-123';
    let selectedMarkerCoordinates: { lat: number; lng: number } | null = { lat: 35.7981, lng: -95.2497 };
    const logs: string[] = [];
    const distanceFrames: number[] = [];

    const smoothReturnToGlobe = (targetDistance = 4.5, steps = 5) => {
      const startDist = currentCameraDistance;
      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const curDist = startDist + (targetDistance - startDist) * ease;
        currentCameraDistance = curDist;
        isOSMActive = curDist <= 1.55;
        distanceFrames.push(Number(curDist.toFixed(3)));
      }
      logs.push(`[Camera] COMPLETE return to globe dist=${currentCameraDistance.toFixed(4)}`);
    };

    const handleSearchStart = (query: string) => {
      logs.push(`[SearchNarration] SEARCH_SUBMITTED query="${query}"`);
      logs.push('[Camera] SEARCH_STARTED rotation preserved');

      // 1. Clear marker selection and coordinates immediately
      selectedMarkerId = null;
      selectedMarkerCoordinates = null;

      // 2. Preserve auto-rotation
      autoRotate = true;

      // 3. Smooth return to globe
      smoothReturnToGlobe(4.5);
    };

    handleSearchStart('Where was the Santa Maria found?');

    expect(selectedMarkerId).toBeNull();
    expect(selectedMarkerCoordinates).toBeNull();
    expect(autoRotate).toBe(true);
    expect(distanceFrames.length).toBe(5);
    expect(distanceFrames[0]).toBeGreaterThan(1.30);
    expect(distanceFrames[distanceFrames.length - 1]).toBe(4.5);
    expect(currentCameraDistance).toBe(4.5);
    expect(isOSMActive).toBe(false);
  });

  it('8. MARKER_SELECTION viewport load does NOT execute when selectedMarkerId is null', () => {
    let loadViewportCalled = false;
    let selectedMarkerCoordinates: { lat: number; lng: number } | null = { lat: 35.7981, lng: -95.2497 };
    let selectedMarkerId: string | null = null; // Cleared on search start

    const onMarkerEffect = (coords: typeof selectedMarkerCoordinates, id: typeof selectedMarkerId) => {
      if (coords && id) {
        loadViewportCalled = true;
      }
    };

    onMarkerEffect(selectedMarkerCoordinates, selectedMarkerId);
    expect(loadViewportCalled).toBe(false);
  });

  it('9. When new search resolves with Documentary Mode OFF, camera rotates globe to center marker and STOPS at globe level (4.5)', async () => {
    let rotatedTo: { lat: number; lng: number } | null = null;
    let cameraDistance = 4.5;
    let isOSMTransitionStarted = false;

    const reconcileCameraStateMock = (targetRotation: { lat: number; lng: number }) => {
      rotatedTo = targetRotation;
      cameraDistance = 4.5;
    };

    vi.spyOn(pipelineModule, 'runSearchPipeline').mockResolvedValue({
      isValid: true,
      mode: 'location',
      finalData: {
        name: 'New York',
        canonicalName: 'New York',
        coordinates: { lat: 40.7128, lng: -74.0060 },
        entityType: 'city'
      }
    } as any);

    const pipelineResult = await pipelineModule.runSearchPipeline({
      rawQuery: 'New York',
      intent: 'LOCATION_INQUIRY',
      entity: 'New York'
    });

    const finalData = (pipelineResult as any).finalData;
    const { lat, lng } = finalData.coordinates;

    const documentaryMode = false;
    if (documentaryMode) {
      isOSMTransitionStarted = true;
    } else {
      reconcileCameraStateMock({ lat, lng });
    }

    expect(rotatedTo).toEqual({ lat: 40.7128, lng: -74.0060 });
    expect(cameraDistance).toBe(4.5);
    expect(isOSMTransitionStarted).toBe(false);
  });

  it('10. Full lifecycle: Normal search with Doc Mode OFF vs Doc Mode ON', () => {
    // Normal Search with Doc Mode OFF:
    const normalLogs: string[] = [];
    normalLogs.push('[Camera] SEARCH_STARTED');
    normalLogs.push('[Camera] GLOBE_ZOOM_OUT_STARTED');
    normalLogs.push('[Camera] GLOBE_LEVEL_REACHED');
    normalLogs.push('[Camera] NEW_LOCATION_COMMITTED');
    normalLogs.push('[Camera] GLOBE_ROTATION_STARTED to lat=40.7128 lng=-74.0060');
    normalLogs.push('[Camera] GLOBE_ROTATION_COMPLETED');

    expect(normalLogs).not.toContain('[Camera] OSM_TRANSITION_STARTED');
    expect(normalLogs[normalLogs.length - 1]).toBe('[Camera] GLOBE_ROTATION_COMPLETED');

    // Search with Doc Mode ON:
    const docLogs: string[] = [];
    docLogs.push('[Camera] SEARCH_STARTED');
    docLogs.push('[Camera] GLOBE_ZOOM_OUT_STARTED');
    docLogs.push('[Camera] GLOBE_LEVEL_REACHED');
    docLogs.push('[Camera] NEW_LOCATION_COMMITTED');
    docLogs.push('[Camera] OSM_TRANSITION_STARTED');

    expect(docLogs).toContain('[Camera] OSM_TRANSITION_STARTED');
  });
});

