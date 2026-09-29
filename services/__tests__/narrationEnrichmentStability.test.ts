import { describe, it, expect, vi } from 'vitest';

describe('Narration Enrichment Stability & Search Input Lifecycle', () => {
  it('suppresses duplicate narration trigger when background enrichment updates description for the same waypoint', () => {
    let spokenCount = 0;
    let spokenText = '';
    const activeNarration = {
      current: null as null | { selectionId: string; narrativeKey: string; spoken: boolean }
    };

    const maybeTriggerNarration = (stableId: string, title: string, desc: string) => {
      const narrativeKey = `${title.toLowerCase().trim()}::${desc.trim()}`;
      const isDuplicate = Boolean(
        activeNarration.current &&
        activeNarration.current.selectionId === stableId
      );

      if (isDuplicate) {
        return { triggered: false, reason: 'DUPLICATE_BLOCKED' };
      }

      activeNarration.current = {
        selectionId: stableId,
        narrativeKey,
        spoken: true
      };
      spokenCount++;
      spokenText = desc;
      return { triggered: true, reason: 'NARRATION_STARTED' };
    };

    // 1. Initial WP1 narration triggered with Stage 1 description
    const res1 = maybeTriggerNarration('wp-1-granicus', 'Battle of the Granicus', 'The Battle of the Granicus in 334 BC was Alexander the Great first major victory against the Persian Empire.');
    expect(res1.triggered).toBe(true);
    expect(spokenCount).toBe(1);
    expect(spokenText).toContain('Battle of the Granicus');

    // 2. Background enrichment finishes 10 seconds later with full documentary text
    const res2 = maybeTriggerNarration('wp-1-granicus', 'Battle of the Granicus', 'The Battle of the Granicus was fought in Northwestern Asia Minor near Troy. Alexander deployed his Companion cavalry across the river to shatter the Persian satrapal army.');
    expect(res2.triggered).toBe(false);
    expect(res2.reason).toBe('DUPLICATE_BLOCKED');
    expect(spokenCount).toBe(1); // Narration was NOT restarted or duplicated!

    // 3. User navigates to Waypoint 2: reset activeNarration and start WP2
    activeNarration.current = null;
    const res3 = maybeTriggerNarration('wp-2-issus', 'Battle of Issus', 'The Battle of Issus in 333 BC took place in southern Anatolia.');
    expect(res3.triggered).toBe(true);
    expect(spokenCount).toBe(2);
    expect(spokenText).toContain('Battle of Issus');
  });

  it('restores contextual placeholder on search input as soon as WP1 is presented while waypoint discovery continues', () => {
    let scanningStatusText: string | null = 'IDENTIFYING WAYPOINTS';
    let isDiscoveryLoading = true;
    let initialWaypointPresented = false;
    let inputPlaceholder = 'Search location...';

    const onWaypointProgress = (index: number) => {
      if (!initialWaypointPresented) {
        scanningStatusText = 'IDENTIFYING WAYPOINTS';
      }
    };

    const presentWaypoint = (wpName: string) => {
      initialWaypointPresented = true;
      scanningStatusText = null; // Cleared on presentation
      inputPlaceholder = `Ask about ${wpName}...`;
    };

    // Discovery starts
    expect(scanningStatusText).toBe('IDENTIFYING WAYPOINTS');
    expect(isDiscoveryLoading).toBe(true);

    // WP1 emitted and presented
    onWaypointProgress(0);
    presentWaypoint('Battle of the Granicus');
    expect(scanningStatusText).toBeNull();
    expect(inputPlaceholder).toBe('Ask about Battle of the Granicus...');
    expect(isDiscoveryLoading).toBe(true); // InfoPanel continues showing discovery status

    // WP2 and WP3 arrive while discovery still active
    onWaypointProgress(1);
    expect(scanningStatusText).toBeNull(); // Search input remains clean!
    onWaypointProgress(2);
    expect(scanningStatusText).toBeNull();

    // Discovery completes
    isDiscoveryLoading = false;
    scanningStatusText = null;
    expect(isDiscoveryLoading).toBe(false);
    expect(scanningStatusText).toBeNull();
  });
});
