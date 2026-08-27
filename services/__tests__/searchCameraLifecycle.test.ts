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
});
