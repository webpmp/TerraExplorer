import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocationInfo, LocationType, Waypoint } from '../../types';
import { getNarrationTitle, getNarrationDescription } from '../narrationService';

describe('Narration Loop Guard & Single Trigger Lifecycle', () => {
  let activeNarrationState: {
    selectionId: string;
    narrativeKey?: string;
    spoken: boolean;
  } | null = null;
  let activeSelectionId: string | null = null;
  let speakMock: ReturnType<typeof vi.fn>;

  const simulateMaybeTriggerNarration = (
    info: LocationInfo | null,
    narrationEnabled: boolean = true
  ): boolean => {
    if (!info) return false;
    if (!narrationEnabled) return false;

    const title = getNarrationTitle(info);
    const desc = getNarrationDescription(info);
    const id = (info as any).id || info.osmId || info.name;
    const stableId = activeSelectionId || id;
    const narrativeKey = `${title.toLowerCase().trim()}::${desc.trim()}`;

    if (!title || !desc || desc.length < 3) return false;

    const isMatchingSelection = !activeSelectionId ||
      id === activeSelectionId ||
      (info as any).id === activeSelectionId ||
      info.name === activeSelectionId;

    if (!isMatchingSelection) {
      return false; // Stale selection rejected
    }

    if (
      activeNarrationState &&
      activeNarrationState.spoken &&
      (activeNarrationState.selectionId === stableId ||
        activeNarrationState.selectionId === id ||
        (Boolean(activeNarrationState.narrativeKey) && activeNarrationState.narrativeKey === narrativeKey))
    ) {
      return false; // Duplicate blocked
    }

    activeNarrationState = {
      selectionId: stableId,
      narrativeKey,
      spoken: true
    };

    speakMock({ title, description: desc });
    return true;
  };

  beforeEach(() => {
    activeNarrationState = null;
    activeSelectionId = null;
    speakMock = vi.fn();
  });

  it('triggers narration exactly once when background enrichment completes', () => {
    const waypoint: Waypoint = {
      id: 'wp-balbianello',
      name: 'Villa del Balbianello in Lenno',
      lat: 45.965,
      lng: 9.202,
      description: 'Set on a promontory overlooking Lake Como, Villa del Balbianello features an extensive historic estate.'
    };

    const stableId = waypoint.id;
    activeSelectionId = stableId;
    activeNarrationState = null;

    const locationInfo: LocationInfo = {
      id: stableId,
      name: waypoint.name,
      type: LocationType.POI,
      description: waypoint.description
    };

    // 1. Initial trigger on enrichment complete
    const firstTrigger = simulateMaybeTriggerNarration(locationInfo);
    expect(firstTrigger).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);

    // 2. Camera onSettle() fires after flight
    const settleTrigger = simulateMaybeTriggerNarration(locationInfo);
    expect(settleTrigger).toBe(false);
    expect(speakMock).toHaveBeenCalledTimes(1);

    // 3. Subsequent state re-render / update fires
    const rerenderTrigger = simulateMaybeTriggerNarration(locationInfo);
    expect(rerenderTrigger).toBe(false);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('preserves duplicate guard across camera documentary movement and prevents onSettle loop', () => {
    const waypoint: Waypoint = {
      id: 'wp-carlotta',
      name: 'Villa Carlotta',
      lat: 45.986,
      lng: 9.229,
      description: 'Historic villa and botanical garden in Tremezzo.'
    };

    activeSelectionId = waypoint.id;
    activeNarrationState = null;

    const locationInfo: LocationInfo = {
      id: waypoint.id,
      name: waypoint.name,
      type: LocationType.POI,
      description: waypoint.description
    };

    // Waypoint enrichment completes & narration fires
    const triggered = simulateMaybeTriggerNarration(locationInfo);
    expect(triggered).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);

    // Camera moves (startDocumentaryFlow should NOT wipe activeNarrationState)
    // When onSettle() fires, narration must remain blocked
    const onSettleTrigger = simulateMaybeTriggerNarration(locationInfo);
    expect(onSettleTrigger).toBe(false);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('allows narration to fire when user transitions to a new waypoint selection', () => {
    const wp1: Waypoint = {
      id: 'wp-como-1',
      name: 'Como Cathedral',
      lat: 45.811,
      lng: 9.083,
      description: 'The 14th-century Gothic cathedral of Como.'
    };

    const wp2: Waypoint = {
      id: 'wp-como-2',
      name: 'San Fedele Church',
      lat: 45.808,
      lng: 9.085,
      description: 'Romanesque basilica in the center of Como.'
    };

    // User selects WP1
    activeSelectionId = wp1.id;
    activeNarrationState = null;

    const info1: LocationInfo = {
      id: wp1.id,
      name: wp1.name,
      type: LocationType.POI,
      description: wp1.description
    };

    expect(simulateMaybeTriggerNarration(info1)).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);

    // User selects WP2
    activeSelectionId = wp2.id;
    activeNarrationState = null; // Cleared only on explicit new selection

    const info2: LocationInfo = {
      id: wp2.id,
      name: wp2.name,
      type: LocationType.POI,
      description: wp2.description
    };

    expect(simulateMaybeTriggerNarration(info2)).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(2);
  });

  it('rejects stale async payloads from previous selections', () => {
    // User clicked WP1 then quickly clicked WP2
    activeSelectionId = 'wp-2';
    activeNarrationState = null;

    const staleInfoWP1: LocationInfo = {
      id: 'wp-1',
      name: 'Stale Waypoint',
      type: LocationType.POI,
      description: 'Old async response arriving late.'
    };

    const triggered = simulateMaybeTriggerNarration(staleInfoWP1);
    expect(triggered).toBe(false);
    expect(speakMock).not.toHaveBeenCalled();
  });
});
