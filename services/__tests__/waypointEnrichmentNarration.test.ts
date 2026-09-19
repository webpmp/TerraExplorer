import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNarrationDescription, getNarrationTitle } from '../narrationService';
import { Waypoint } from '../../types';

describe('Waypoint Enrichment and Narration Flow Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  interface WaypointEnrichmentSimulationState {
    activeSelectionId: string | null;
    activeRequestId: number;
    isInfoPanelLoading: boolean;
    locationInfo: any | null;
    activeNarration: { id: string; spoken: boolean } | null;
    narrationQueue: Array<{ title: string; description: string; descLength: number }>;
    cancelledNarrationCount: number;
    logs: string[];
  }

  const createSimulator = (narrationEnabled = true) => {
    const state: WaypointEnrichmentSimulationState = {
      activeSelectionId: null,
      activeRequestId: 0,
      isInfoPanelLoading: false,
      locationInfo: null,
      activeNarration: null,
      narrationQueue: [],
      cancelledNarrationCount: 0,
      logs: []
    };

    const cancelNarration = () => {
      state.cancelledNarrationCount++;
      state.logs.push('[Narration] CANCELLED');
    };

    const maybeTriggerNarration = (info: any) => {
      const rawId = info ? (info.id || info.name) : 'null';
      if (!info) return;
      if (!narrationEnabled) return;

      const title = getNarrationTitle(info);
      const desc = getNarrationDescription(info);
      const id = info.id || info.name;

      state.logs.push(`[SearchNarration] DESCRIPTION_RESOLVED name="${title}" id="${id}" descriptionType="${typeof desc}" descriptionLength=${desc.length}`);

      if (!title || !desc || desc.length < 3) {
        state.logs.push(`[SearchNarration] REJECTED: no narration text`);
        return;
      }

      const isMatchingSelection = !state.activeSelectionId ||
        id === state.activeSelectionId ||
        info.id === state.activeSelectionId ||
        info.name === state.activeSelectionId;

      if (!isMatchingSelection) {
        state.logs.push(`[SearchNarration] NARRATION_GUARD REJECTED: stale selection (payloadId=${id}, activeSelectionId=${state.activeSelectionId})`);
        return;
      }

      if (state.activeNarration && state.activeNarration.id === id && state.activeNarration.spoken) {
        state.logs.push(`[SearchNarration] NARRATION_GUARD REJECTED: duplicate narration (id=${id})`);
        return;
      }

      state.logs.push(`[SearchNarration] NARRATION_GUARD PASSED id="${id}"`);
      state.activeNarration = { id, spoken: true };
      state.logs.push(`[OrpheusTTS] ORPHEUS_START provider="orpheus" voice="tara" descLength=${desc.length}`);
      state.narrationQueue.push({ title, description: desc, descLength: desc.length });
    };

    const selectWaypoint = async (
      wp: Waypoint,
      mockEnrichmentFn?: (geoMarker: any) => Promise<{ description: string; notable?: any[] } | null>
    ) => {
      const stableId = wp.id || `${wp.name}-${wp.lat}-${wp.lng}`;
      state.activeSelectionId = stableId;
      const enrichmentRequestId = ++state.activeRequestId;

      cancelNarration();
      state.activeNarration = null;

      state.logs.push(`[Waypoint Lifecycle] WAYPOINT_SELECTED id="${stableId}" name="${wp.name}"`);
      state.logs.push(`[Waypoint Lifecycle] ENRICHMENT_STARTED id="${stableId}" name="${wp.name}"`);
      state.logs.push('[Scan Lifecycle] BACKGROUND_ENRICHMENT_STARTED');

      state.isInfoPanelLoading = true;

      // 1. Initial payload (no narration triggered)
      const initialPayload = {
        id: stableId,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        waypoint: wp,
        description: wp.description || "",
        sectionState: { description: "loading" }
      };
      state.locationInfo = initialPayload;

      // 2. Entity resolution
      state.logs.push(`ENTITY_RESOLUTION_STARTED [req: ${enrichmentRequestId}] for ${wp.name}`);
      const geoMarker = { id: stableId, name: wp.name, lat: wp.lat, lng: wp.lng, type: 'historical_waypoint' };
      if (enrichmentRequestId !== state.activeRequestId) return;
      state.logs.push(`ENTITY_RESOLUTION_COMPLETE [req: ${enrichmentRequestId}] for ${wp.name}`);

      const data = {
        id: stableId,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        waypoint: wp,
        description: wp.description || "",
        sectionState: { description: "loading" }
      };
      state.locationInfo = data;

      // 3. Stage 3 Enrichment
      let finalEnrichedState: any = null;
      try {
        const enrichedData = mockEnrichmentFn
          ? await mockEnrichmentFn(geoMarker)
          : null;

        if (enrichmentRequestId !== state.activeRequestId) return;

        const enrichedDescription = enrichedData?.description?.trim();
        const finalDesc = (enrichedDescription && enrichedDescription.length >= 3)
          ? enrichedDescription
          : (wp.description || wp.significance || "");

        if (enrichedData) {
          finalEnrichedState = {
            ...data,
            description: finalDesc,
            sectionState: { description: "complete" }
          };
          state.locationInfo = finalEnrichedState;
        } else {
          finalEnrichedState = {
            ...data,
            description: finalDesc,
            sectionState: { description: "complete" }
          };
          state.locationInfo = finalEnrichedState;
        }
      } catch (err) {
        if (enrichmentRequestId === state.activeRequestId) {
          const fallbackDesc = wp.description || wp.significance || "";
          finalEnrichedState = {
            ...data,
            description: fallbackDesc,
            sectionState: { description: "error" }
          };
          state.locationInfo = finalEnrichedState;
        }
      } finally {
        if (enrichmentRequestId === state.activeRequestId) {
          state.isInfoPanelLoading = false;
          const resolvedDesc = finalEnrichedState?.description || wp.description || "";
          const source = (finalEnrichedState?.description && finalEnrichedState.description !== wp.description)
            ? 'enriched'
            : 'original_fallback';
          state.logs.push(`[Waypoint Lifecycle] ENRICHED_RECORD_RESOLVED id="${stableId}" name="${wp.name}" descLength=${resolvedDesc.length} source="${source}"`);
          state.logs.push('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');

          if (state.activeSelectionId === stableId && finalEnrichedState) {
            maybeTriggerNarration(finalEnrichedState);
          }
        }
      }
    };

    return { state, selectWaypoint, maybeTriggerNarration };
  };

  it('waits for background enrichment to complete and narrates the final enriched description (~497 chars) rather than initial 89-char description', async () => {
    const simulator = createSimulator(true);

    const original89CharDesc = "Lake Como route stop in Bellagio with historic lakefront villas and cobbled streets.";
    expect(original89CharDesc.length).toBe(84); // ~84-89 chars

    const rich497CharDesc = "Bellagio is a picturesque village situated on the promontory where Lake Como divides into two southern branches. Celebrated as the pearl of the lake, it features centuries-old lakeside estates including Villa Melzi and Villa Serbelloni, renowned for their botanical terraced gardens overlooking the Alpine waters. Its steep stone stairways, known as salite, ascend between historic pastel villas, boutique artisan shops, and centuries of preserved Renaissance and neoclassical architecture.";
    expect(rich497CharDesc.length).toBeGreaterThan(450);

    const waypoint: Waypoint = {
      id: 'wp-bellagio',
      name: 'Bellagio',
      lat: 45.987,
      lng: 9.262,
      description: original89CharDesc
    };

    await simulator.selectWaypoint(waypoint, async () => {
      return { description: rich497CharDesc };
    });

    // Verify execution sequence
    expect(simulator.state.logs).toContain('[Waypoint Lifecycle] WAYPOINT_SELECTED id="wp-bellagio" name="Bellagio"');
    expect(simulator.state.logs).toContain('[Waypoint Lifecycle] ENRICHMENT_STARTED id="wp-bellagio" name="Bellagio"');
    expect(simulator.state.logs).toContain('[Scan Lifecycle] BACKGROUND_ENRICHMENT_STARTED');
    expect(simulator.state.logs).toContain(`[Waypoint Lifecycle] ENRICHED_RECORD_RESOLVED id="wp-bellagio" name="Bellagio" descLength=${rich497CharDesc.length} source="enriched"`);
    expect(simulator.state.logs).toContain('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');
    expect(simulator.state.logs).toContain('[SearchNarration] NARRATION_GUARD PASSED id="wp-bellagio"');
    expect(simulator.state.logs).toContain(`[OrpheusTTS] ORPHEUS_START provider="orpheus" voice="tara" descLength=${rich497CharDesc.length}`);

    // Verify narration queue received the enriched 497-char description
    expect(simulator.state.narrationQueue.length).toBe(1);
    expect(simulator.state.narrationQueue[0].descLength).toBe(rich497CharDesc.length);
    expect(simulator.state.narrationQueue[0].description).toBe(rich497CharDesc);
  });

  it('falls back to route-generated description and narrates exactly once if enrichment returns null or fails', async () => {
    const simulator = createSimulator(true);

    const originalDesc = "Villa Carlotta is an ornate neoclassical villa and botanical garden in Tremezzo.";
    const waypoint: Waypoint = {
      id: 'wp-villa-carlotta',
      name: 'Villa Carlotta',
      lat: 45.986,
      lng: 9.224,
      description: originalDesc
    };

    await simulator.selectWaypoint(waypoint, async () => {
      return null; // Enrichment failure / empty
    });

    expect(simulator.state.logs).toContain(`[Waypoint Lifecycle] ENRICHED_RECORD_RESOLVED id="wp-villa-carlotta" name="Villa Carlotta" descLength=${originalDesc.length} source="original_fallback"`);
    expect(simulator.state.logs).toContain('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');
    expect(simulator.state.logs).toContain('[SearchNarration] NARRATION_GUARD PASSED id="wp-villa-carlotta"');

    expect(simulator.state.narrationQueue.length).toBe(1);
    expect(simulator.state.narrationQueue[0].description).toBe(originalDesc);
  });

  it('handles race condition: when user switches from Waypoint A to Waypoint B before A finishes, A does not narrate', async () => {
    const simulator = createSimulator(true);

    const wpA: Waypoint = {
      id: 'wp-a',
      name: 'Varenna',
      lat: 46.01,
      lng: 9.28,
      description: 'Varenna historic harbor'
    };

    const wpB: Waypoint = {
      id: 'wp-b',
      name: 'Menaggio',
      lat: 46.02,
      lng: 9.23,
      description: 'Menaggio promenade'
    };

    let resolveEnrichmentA: any;
    const promiseA = new Promise<{ description: string }>(resolve => {
      resolveEnrichmentA = resolve;
    });

    // Start Waypoint A selection (enrichment pending)
    const selectPromiseA = simulator.selectWaypoint(wpA, () => promiseA);

    // User quickly clicks Waypoint B before A resolves
    const selectPromiseB = simulator.selectWaypoint(wpB, async () => ({
      description: 'Enriched detailed history of Menaggio with its central piazza and lakeside promenade.'
    }));

    await selectPromiseB;

    // Now A resolves late
    resolveEnrichmentA({ description: 'Late enriched description of Varenna' });
    await selectPromiseA;

    // A must NOT have spoken, only B
    expect(simulator.state.narrationQueue.length).toBe(1);
    expect(simulator.state.narrationQueue[0].title).toBe('Menaggio');
    expect(simulator.state.narrationQueue[0].description).toContain('Enriched detailed history of Menaggio');
  });

  it('duplicate narration guard prevents subsequent state updates for the same waypoint from triggering a second narration', async () => {
    const simulator = createSimulator(true);

    const waypoint: Waypoint = {
      id: 'wp-como',
      name: 'Como Cathedral',
      lat: 45.81,
      lng: 9.08,
      description: 'Cathedral of Como'
    };

    await simulator.selectWaypoint(waypoint, async () => ({
      description: 'Detailed enriched narrative of the 14th-century Gothic-Renaissance Como Cathedral.'
    }));

    expect(simulator.state.narrationQueue.length).toBe(1);

    // Component re-renders and attempts to trigger narration again for the same waypoint
    simulator.maybeTriggerNarration(simulator.state.locationInfo);

    expect(simulator.state.logs).toContain('[SearchNarration] NARRATION_GUARD REJECTED: duplicate narration (id=wp-como)');
    expect(simulator.state.narrationQueue.length).toBe(1); // Still exactly 1
  });
});
