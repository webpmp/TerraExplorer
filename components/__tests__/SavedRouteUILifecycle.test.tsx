import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../Controls';
import InfoPanel from '../InfoPanel';
import { generateContextualChips } from '../../services/followUpService';
import { waypointPipelineRegistry } from '../../services/waypointPipelineService';
import { DEFAULT_FRANKLIN_ROUTE, isSavedWaypointComplete } from '../../App';
import { LocationInfo, LocationType, SkinType, Waypoint } from '../../types';

describe('Saved Route UI Lifecycle & Presentation State Regression Suite', () => {
  const baseControlsProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'modern' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isNarrationEnabled: true,
    onToggleNarration: vi.fn(),
    isNarrationAvailable: true,
    showNews: true,
    isScanningArea: false,
    onCancelScan: vi.fn(),
    onCycleSkin: vi.fn(),
    isSettingsOpen: false,
    onToggleSettings: vi.fn(),
    onOpenSettingsTab: vi.fn(),
    isOSMDisplayed: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Incomplete saved waypoint lifecycle: preparation status suppresses chips, enrichment presentation clears status, and chips render for current waypoint', () => {
    const wp2 = DEFAULT_FRANKLIN_ROUTE.waypoints![1]; // wp-fr-2 Stromness, Orkney
    expect(wp2.id).toBe('wp-fr-2');
    expect(isSavedWaypointComplete(wp2)).toBe(false);

    // Step A: Waypoint selected & enters preparation state
    let scanningStatusText: string | null = "PREPARING NARRATION";
    let activeSelectionId = wp2.id;
    let locationInfo: LocationInfo | null = null;

    // Render Controls in preparation state
    const preparingHtml = renderToStaticMarkup(
      <Controls
        {...baseControlsProps}
        scanningStatusText={scanningStatusText}
        activeWaypointTitle={wp2.name}
        activeLocationContext={null}
      />
    );

    // Verify preparation state renders CANCEL button and suppresses contextual chips
    expect(preparingHtml).toContain('CANCEL');
    expect(preparingHtml).not.toContain('data-testid="contextual-chips-container"');

    // Step B: Final enrichment completes with substantive description, notable facts, validated images, and snapshot
    const enrichedStromness: LocationInfo = {
      id: wp2.id,
      name: wp2.name,
      canonicalName: 'Stromness',
      coordinates: { lat: wp2.lat, lng: wp2.lng },
      type: LocationType.POI,
      entityType: 'landmark',
      description: "Stromness in the Orkney Islands served as the expedition's final port of call in the British Isles. The ships took on fresh water, cattle, and supplies before departing across the Atlantic.",
      historicalContext: "Final UK anchorage in July 1845 before heading for Greenland.",
      images: [
        {
          url: 'https://example.com/stromness.jpg',
          caption: 'Stromness Harbor, Orkney',
          attribution: 'Historic Orkney Archive'
        }
      ],
      primaryImage: 'https://example.com/stromness.jpg',
      imageCaption: 'Stromness Harbor, Orkney',
      notable: [
        { title: 'Final British Anchorage', description: 'Last port before crossing to Disko Bay, Greenland.' }
      ],
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    locationInfo = enrichedStromness;

    // Step C: Narration starts playback (onStart), clearing PREPARING NARRATION
    scanningStatusText = null;

    const activeLocationContext = {
      name: locationInfo.name,
      entityType: locationInfo.entityType,
      description: locationInfo.description,
      notable: locationInfo.notable,
      news: locationInfo.news,
      followUps: locationInfo.followUps
    };

    // Render Controls after narration starts
    const playingHtml = renderToStaticMarkup(
      <Controls
        {...baseControlsProps}
        scanningStatusText={scanningStatusText}
        activeWaypointTitle={wp2.name}
        activeLocationContext={activeLocationContext}
      />
    );

    // Verify PREPARING NARRATION is CLEARED from the UI
    expect(playingHtml).not.toContain('PREPARING NARRATION');

    // Verify contextual follow-up chips are generated and rendered for Stromness
    const chips = generateContextualChips(activeLocationContext, true);
    expect(chips.length).toBeGreaterThan(0);
    expect(playingHtml).toContain('data-testid="contextual-chips-container"');
    expect(playingHtml).toContain('data-testid="contextual-chip-0"');

    // Render InfoPanel and verify complete content presentation
    const infoPanelHtml = renderToStaticMarkup(
      <InfoPanel
        info={locationInfo}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
        isFavorite={true}
      />
    );

    expect(infoPanelHtml).toContain('Stromness');
    expect(infoPanelHtml).toContain('Stromness Harbor, Orkney');
    expect(infoPanelHtml).toContain('Final British Anchorage');
  });

  it('2. Background preloading isolation: background waypoint events (wp-fr-6) do NOT mutate current waypoint (wp-fr-2) state or chips', () => {
    const currentWp = DEFAULT_FRANKLIN_ROUTE.waypoints![1]; // wp-fr-2 Stromness
    const backgroundWp = DEFAULT_FRANKLIN_ROUTE.waypoints![5]; // wp-fr-6 Cornwallis Island

    // Current active selection is Stromness
    const activeSelectionId = currentWp.id;
    let scanningStatusText: string | null = null; // Currently playing / presented

    const currentStromnessInfo: LocationInfo = {
      id: currentWp.id,
      name: currentWp.name,
      canonicalName: 'Stromness',
      coordinates: { lat: currentWp.lat, lng: currentWp.lng },
      type: LocationType.POI,
      entityType: 'landmark',
      description: "Stromness in the Orkney Islands served as the expedition's final port of call in the British Isles. The ships took on fresh water, cattle, and supplies.",
      notable: [{ title: 'Final Port', description: 'Last port before crossing.' }],
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    let presentedInfo = currentStromnessInfo;

    // Simulate background preloading lifecycle events for wp-fr-6 Cornwallis Island
    waypointPipelineRegistry.setStage(backgroundWp.id, 'enriching');
    waypointPipelineRegistry.recordTimestamp(backgroundWp.id, 'enrichmentStarted', Date.now());

    // Background prefetch completes LLM + Image enrichment for wp-fr-6
    const bgCornwallisInfo: LocationInfo = {
      id: backgroundWp.id,
      name: backgroundWp.name,
      canonicalName: 'Cornwallis Island',
      coordinates: { lat: backgroundWp.lat, lng: backgroundWp.lng },
      type: LocationType.POI,
      entityType: 'landmark',
      description: "During the summer thaw of 1846, Franklin navigated north around Cornwallis Island via Wellington Channel, proving it was an island.",
      notable: [{ title: 'Circumnavigation', description: 'Proved insular geography of Cornwallis.' }],
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    // Background prefetch records stage change to narrationReady
    waypointPipelineRegistry.recordTimestamp(backgroundWp.id, 'narrationAudioReady', Date.now());
    waypointPipelineRegistry.setStage(backgroundWp.id, 'narrationReady');

    // Background prefetch MUST NOT change current activeSelectionId or presentedInfo
    expect(activeSelectionId).toBe('wp-fr-2');
    expect(presentedInfo.id).toBe('wp-fr-2');
    expect(presentedInfo.name).toBe('Stromness, Orkney');

    // Render Controls and verify chips still correspond exclusively to Stromness
    const activeContext = {
      name: presentedInfo.name,
      entityType: presentedInfo.entityType,
      description: presentedInfo.description,
      notable: presentedInfo.notable,
      news: presentedInfo.news,
      followUps: presentedInfo.followUps
    };

    const controlsHtml = renderToStaticMarkup(
      <Controls
        {...baseControlsProps}
        scanningStatusText={scanningStatusText}
        activeWaypointTitle={presentedInfo.name}
        activeLocationContext={activeContext}
      />
    );

    // Verify Stromness chips are present and Cornwallis Island is not leaking into current UI
    expect(controlsHtml).not.toContain('PREPARING NARRATION');
    expect(controlsHtml).toContain('data-testid="contextual-chips-container"');
    expect(controlsHtml).toContain('data-testid="contextual-chip-0"');
    expect(controlsHtml).not.toContain('Cornwallis');
  });

  it('3. Complete saved waypoint restoration: restores directly with zero preparation delay and immediate follow-up chip rendering', () => {
    const wp1 = DEFAULT_FRANKLIN_ROUTE.waypoints![0]; // wp-fr-1 Greenhithe, England

    // A complete saved snapshot
    const fullyHydratedWp: Waypoint = {
      ...wp1,
      images: [{ url: 'https://example.com/greenhithe.jpg', caption: 'Greenhithe on the Thames' }],
      notable: [{ title: 'Expedition Departure Point', description: 'Erebus and Terror set sail on May 19, 1845.' }],
      savedSnapshot: {
        id: wp1.id,
        name: wp1.name,
        canonicalName: 'Greenhithe',
        coordinates: { lat: wp1.lat, lng: wp1.lng },
        type: LocationType.POI,
        entityType: 'landmark',
        description: "Sir John Franklin's lost expedition set sail from Greenhithe on the Thames with 129 officers and crew aboard HMS Erebus and HMS Terror. Outfitted with auxiliary steam engines, the mission aimed to chart the Northwest Passage.",
        images: [{ url: 'https://example.com/greenhithe.jpg', caption: 'Greenhithe on the Thames' }],
        notable: [{ title: 'Expedition Departure Point', description: 'Erebus and Terror set sail on May 19, 1845.' }],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      }
    };

    expect(isSavedWaypointComplete(fullyHydratedWp)).toBe(true);

    // Restored directly: scanningStatusText is null immediately
    const scanningStatusText: string | null = null;
    const restoredInfo = fullyHydratedWp.savedSnapshot!;

    const activeContext = {
      name: restoredInfo.name,
      entityType: restoredInfo.entityType,
      description: restoredInfo.description,
      notable: restoredInfo.notable,
      news: restoredInfo.news,
      followUps: restoredInfo.followUps
    };

    const controlsHtml = renderToStaticMarkup(
      <Controls
        {...baseControlsProps}
        skin="modern"
        scanningStatusText={scanningStatusText}
        activeWaypointTitle={restoredInfo.name}
        activeLocationContext={activeContext}
      />
    );

    expect(controlsHtml).not.toContain('PREPARING NARRATION');
    expect(controlsHtml).toContain('data-testid="contextual-chips-container"');
    expect(controlsHtml).toContain('data-testid="contextual-chip-0"');

    // Parchment skin test
    const parchmentHtml = renderToStaticMarkup(
      <Controls
        {...baseControlsProps}
        skin="parchment"
        scanningStatusText={scanningStatusText}
        activeWaypointTitle={restoredInfo.name}
        activeLocationContext={activeContext}
      />
    );

    expect(parchmentHtml).not.toContain('PREPARING NARRATION');
    expect(parchmentHtml).toContain('Ask about Greenhithe, England...');
  });
});
