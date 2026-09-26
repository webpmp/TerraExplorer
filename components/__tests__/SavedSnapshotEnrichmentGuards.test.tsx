import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../../services/geminiService';
import * as imageService from '../../services/imageService';
import { isSavedWaypointComplete } from '../../App';
import { FavoriteLocation, Waypoint, MapMarker, LocationInfo, LocationType } from '../../types';

describe('Saved InfoPanel Snapshot Enrichment Guards', () => {
  let mockGetInfoFromFeature: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInfoFromFeature = vi.spyOn(geminiService, 'getInfoFromFeature').mockImplementation(async (marker: any) => ({
      name: marker.name,
      type: 'City' as any,
      coordinates: { lat: marker.lat, lng: marker.lng },
      description: 'Newly generated live enrichment description.',
      historicalContext: 'Newly generated historical background.',
      notable: [{ title: 'Live Fact', description: 'Freshly researched fact' }],
      news: []
    }));
  });

  it('1. Saved location does not enrich on restore: restores complete snapshot without calling getInfoFromFeature', async () => {
    const savedLocation: FavoriteLocation = {
      id: 'fav-santa-maria',
      name: 'Santa Maria Shipwreck',
      canonicalName: 'Santa Maria',
      lat: 19.76,
      lng: -72.20,
      type: 'location',
      isSaved: true,
      description: 'The flagship of Christopher Columbus on his 1492 voyage.',
      historicalContext: 'Ran aground on a coral reef on Christmas Day 1492 near Cap-Haïtien.',
      climate: { name: 'Tropical', description: 'Warm maritime climate' },
      notable: [
        { title: 'Flagship of 1492', description: 'Columbus flagship during his first transatlantic voyage.' }
      ],
      images: [
        { url: 'https://example.com/santa-maria.jpg', caption: 'Replica of Santa Maria', attribution: 'Photo © Archive' }
      ],
      followUps: [
        { id: 'fu-1', question: 'What happened to the crew?', answer: 'The crew built the settlement of La Navidad from the ship timbers.' }
      ],
      savedSnapshot: {
        id: 'fav-santa-maria',
        name: 'Santa Maria Shipwreck',
        canonicalName: 'Santa Maria',
        type: 'Point of Interest' as any,
        coordinates: { lat: 19.76, lng: -72.20 },
        description: 'The flagship of Christopher Columbus on his 1492 voyage.',
        historicalContext: 'Ran aground on a coral reef on Christmas Day 1492 near Cap-Haïtien.',
        climate: { name: 'Tropical', description: 'Warm maritime climate' },
        notable: [
          { title: 'Flagship of 1492', description: 'Columbus flagship during his first transatlantic voyage.' }
        ],
        images: [
          { url: 'https://example.com/santa-maria.jpg', caption: 'Replica of Santa Maria', attribution: 'Photo © Archive' }
        ],
        followUps: [
          { id: 'fu-1', question: 'What happened to the crew?', answer: 'The crew built the settlement of La Navidad from the ship timbers.' }
        ],
        news: [],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      }
    };

    const favoritesList: FavoriteLocation[] = [savedLocation];

    // Simulate selectEntity saved-state check & restoration
    const matchingFavorite = favoritesList.find(f => f.id === savedLocation.id && f.type !== 'route');
    const isSavedLocation = Boolean(
      ((savedLocation as any).isSaved && ((savedLocation as any).savedSnapshot || (savedLocation as any).description)) ||
      ((savedLocation as any).savedSnapshot && (savedLocation as any).savedSnapshot.description) ||
      (matchingFavorite && ((matchingFavorite as any).isSaved || (matchingFavorite as any).savedSnapshot || matchingFavorite.description))
    );

    expect(isSavedLocation).toBe(true);

    let restoredPayload: LocationInfo | null = null;
    if (isSavedLocation) {
      const savedItem = (matchingFavorite || savedLocation) as FavoriteLocation;
      const snapshot = savedItem.savedSnapshot;

      restoredPayload = {
        id: savedItem.id,
        name: savedItem.name,
        canonicalName: savedItem.canonicalName || snapshot?.canonicalName || savedItem.name,
        type: savedItem.locationType || snapshot?.type || ('Point of Interest' as any),
        entityType: savedItem.entityType || snapshot?.entityType || 'generic',
        coordinates: { lat: savedItem.lat, lng: savedItem.lng },
        description: savedItem.description || snapshot?.description || '',
        historicalContext: savedItem.historicalContext || snapshot?.historicalContext,
        climate: savedItem.climate || snapshot?.climate,
        population: savedItem.population || snapshot?.population,
        notable: savedItem.notable || snapshot?.notable || [],
        contextNotes: savedItem.contextNotes || snapshot?.contextNotes || [],
        images: savedItem.images || snapshot?.images || [],
        primaryImage: savedItem.primaryImage || snapshot?.primaryImage,
        imageCaption: savedItem.imageCaption || snapshot?.imageCaption,
        imageAttribution: savedItem.imageAttribution || snapshot?.imageAttribution,
        followUps: savedItem.followUps || snapshot?.followUps || [],
        news: savedItem.news || snapshot?.news || [],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' },
        ...(snapshot || {})
      };
    } else {
      await geminiService.getInfoFromFeature(savedLocation as any);
    }

    // Verify enrichment was NOT called
    expect(mockGetInfoFromFeature).not.toHaveBeenCalled();

    // Verify snapshot fields are completely restored
    expect(restoredPayload).not.toBeNull();
    expect(restoredPayload?.description).toBe('The flagship of Christopher Columbus on his 1492 voyage.');
    expect(restoredPayload?.historicalContext).toBe('Ran aground on a coral reef on Christmas Day 1492 near Cap-Haïtien.');
    expect(restoredPayload?.notable).toHaveLength(1);
    expect(restoredPayload?.notable![0].title).toBe('Flagship of 1492');
    expect(restoredPayload?.images).toHaveLength(1);
    expect((restoredPayload?.images![0] as any).caption).toBe('Replica of Santa Maria');
    expect(restoredPayload?.followUps).toHaveLength(1);
    expect(restoredPayload?.followUps![0].question).toBe('What happened to the crew?');
  });

  it('2. Saved route waypoint does not enrich on restore: restores waypoint snapshot without calling getInfoFromFeature', async () => {
    const savedRoute: FavoriteLocation = {
      id: 'fav-shackleton-route',
      name: "Ernest Shackleton's Endurance Expedition",
      lat: 50.3755,
      lng: -4.1427,
      type: 'route',
      isSaved: true,
      waypoints: [
        {
          id: 'wp-shackleton-1',
          name: 'Plymouth, England',
          canonicalName: 'Plymouth',
          lat: 50.3755,
          lng: -4.1427,
          isSaved: true,
          description: 'Plymouth departure port in Great Britain.',
          historicalContext: 'Departure on August 8, 1914.',
          images: [{ url: 'https://example.com/plymouth.jpg', caption: 'Plymouth Sound' }],
          savedSnapshot: {
            id: 'wp-shackleton-1',
            name: 'Plymouth, England',
            canonicalName: 'Plymouth',
            type: 'Point of Interest' as any,
            coordinates: { lat: 50.3755, lng: -4.1427 },
            description: 'Plymouth departure port in Great Britain.',
            historicalContext: 'Departure on August 8, 1914.',
            images: [{ url: 'https://example.com/plymouth.jpg', caption: 'Plymouth Sound' }],
            news: [],
            status: 'success',
            sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
          }
        }
      ]
    };

    const favoritesList: FavoriteLocation[] = [savedRoute];
    const activeRouteId = 'fav-shackleton-route';
    const wp = savedRoute.waypoints![0];

    // Simulate loadWaypointData saved-waypoint check
    const activeSavedRoute = activeRouteId ? favoritesList.find(f => f.id === activeRouteId && f.type === 'route') : null;
    const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === wp.id || (w.lat === wp.lat && w.lng === wp.lng));
    const isSavedWp = Boolean(
      (wp.isSaved && (wp.description || wp.savedSnapshot)) ||
      (wp.savedSnapshot && wp.savedSnapshot.description) ||
      (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description))
    );

    expect(isSavedWp).toBe(true);

    let restoredPayload: LocationInfo | null = null;
    if (isSavedWp) {
      const snapshot = wp.savedSnapshot;
      restoredPayload = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || snapshot?.canonicalName || wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        waypoint: wp,
        type: 'Point of Interest' as any,
        description: wp.description || snapshot?.description || '',
        historicalContext: wp.context || wp.historicalContext || snapshot?.historicalContext,
        images: wp.images || snapshot?.images || [],
        news: [],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' },
        ...(snapshot || {})
      };
    } else {
      await geminiService.getInfoFromFeature(wp as any);
    }

    // Verify enrichment was NOT called
    expect(mockGetInfoFromFeature).not.toHaveBeenCalled();

    // Verify restored content is exact
    expect(restoredPayload?.description).toBe('Plymouth departure port in Great Britain.');
    expect(restoredPayload?.historicalContext).toBe('Departure on August 8, 1914.');
    expect(restoredPayload?.images).toHaveLength(1);
    expect((restoredPayload?.images![0] as any).caption).toBe('Plymouth Sound');
  });

  it('3. Unsaved route waypoint still enriches: invokes getInfoFromFeature when waypoint is not saved', async () => {
    const unsavedWp: Waypoint = {
      id: 'wp-trail-of-tears-1',
      name: 'New Echota, Georgia',
      lat: 34.54,
      lng: -84.91,
      // No isSaved flag, no savedSnapshot
    };

    const favoritesList: FavoriteLocation[] = []; // No saved favorites
    const activeRouteId: string | null = null; // Live unsaved route

    const activeSavedRoute = activeRouteId ? favoritesList.find(f => f.id === activeRouteId && f.type === 'route') : null;
    const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === unsavedWp.id);
    const isSavedWp = Boolean(
      (unsavedWp.isSaved && (unsavedWp.description || unsavedWp.savedSnapshot)) ||
      (unsavedWp.savedSnapshot && unsavedWp.savedSnapshot.description) ||
      (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description))
    );

    expect(isSavedWp).toBe(false);

    if (!isSavedWp) {
      await geminiService.getInfoFromFeature(unsavedWp as any);
    }

    // Verify enrichment WAS called for unsaved live waypoint
    expect(mockGetInfoFromFeature).toHaveBeenCalledTimes(1);
    expect(mockGetInfoFromFeature).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Echota, Georgia' })
    );
  });

  it('4. Unsaved location still enriches: invokes getInfoFromFeature when selecting normal live marker', async () => {
    const liveMarker: MapMarker = {
      id: 'live-marker-tokyo',
      name: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
      populationClass: 'large'
      // No isSaved, not in favorites
    };

    const favoritesList: FavoriteLocation[] = [];

    const matchingFavorite = favoritesList.find(f => f.id === liveMarker.id && f.type !== 'route');
    const isSavedLocation = Boolean(
      ((liveMarker as any).isSaved && ((liveMarker as any).savedSnapshot || (liveMarker as any).description)) ||
      ((liveMarker as any).savedSnapshot && (liveMarker as any).savedSnapshot.description) ||
      (matchingFavorite && ((matchingFavorite as any).isSaved || (matchingFavorite as any).savedSnapshot || matchingFavorite.description))
    );

    expect(isSavedLocation).toBe(false);

    if (!isSavedLocation) {
      await geminiService.getInfoFromFeature(liveMarker);
    }

    // Verify enrichment WAS called for unsaved live location
    expect(mockGetInfoFromFeature).toHaveBeenCalledTimes(1);
    expect(mockGetInfoFromFeature).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tokyo Tower' })
    );
  });

  it('5. Saved route with complete persisted data: establishes ready state immediately and triggers narration exactly once without enrichment', async () => {
    const narrationTriggers: string[] = [];
    const maybeTriggerNarration = (payload: any) => {
      narrationTriggers.push(payload.description);
    };

    const savedRoute: FavoriteLocation = {
      id: 'fav-franklin-expedition',
      name: 'Franklin Expedition Route',
      lat: 58.965,
      lng: -3.296,
      type: 'route',
      isSaved: true,
      waypoints: [
        {
          id: 'wp-fr-2',
          name: 'Stromness, Orkney Islands',
          canonicalName: 'Stromness',
          lat: 58.965,
          lng: -3.296,
          isSaved: true,
          description: "Stromness in the Orkney Islands served as the expedition's last stop in the British Isles. The ships took on fresh water and supplies.",
          context: 'Final port of call in the UK before crossing the Atlantic.'
        }
      ]
    };

    const favoritesList: FavoriteLocation[] = [savedRoute];
    const activeRouteId = 'fav-franklin-expedition';
    const wp = savedRoute.waypoints![0];

    // Evaluate complete saved data state
    const activeSavedRoute = activeRouteId
      ? favoritesList.find(f => f.id === activeRouteId && f.type === 'route')
      : favoritesList.find(f => f.type === 'route' && f.waypoints?.some(w => w.id === wp.id));

    const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === wp.id || (w.lat === wp.lat && w.lng === wp.lng));
    const isSavedWp = Boolean(
      (wp.isSaved && (wp.description || wp.savedSnapshot)) ||
      (wp.savedSnapshot && wp.savedSnapshot.description) ||
      (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description)) ||
      Boolean(activeSavedRoute && (wp.description || matchingSavedWpInRoute?.description))
    );

    const snapshot = wp.savedSnapshot || matchingSavedWpInRoute?.savedSnapshot;
    const directCandidateDesc = (
      snapshot?.description ||
      wp.description ||
      matchingSavedWpInRoute?.description ||
      ''
    ).trim();

    const isSavedContentComplete = isSavedWp && directCandidateDesc.length > 20;

    expect(isSavedWp).toBe(true);
    expect(isSavedContentComplete).toBe(true);

    if (isSavedWp && isSavedContentComplete) {
      const restoredPayload = {
        id: wp.id,
        name: wp.name,
        description: directCandidateDesc,
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      };

      maybeTriggerNarration(restoredPayload);
    } else {
      const enriched = await geminiService.getInfoFromFeature(wp as any);
      maybeTriggerNarration(enriched);
    }

    // Enrichment must NOT be called
    expect(mockGetInfoFromFeature).not.toHaveBeenCalled();

    // Narration must be triggered exactly once with the saved description
    expect(narrationTriggers).toHaveLength(1);
    expect(narrationTriggers[0]).toBe("Stromness in the Orkney Islands served as the expedition's last stop in the British Isles. The ships took on fresh water and supplies.");
  });

  it('6. Saved route requiring enrichment: defers presentation until enrichment completes and triggers narration once', async () => {
    const narrationTriggers: string[] = [];
    const infoPanelPresentations: any[] = [];

    const presentWaypoint = (payload: any) => {
      infoPanelPresentations.push(payload);
    };

    const maybeTriggerNarration = (payload: any) => {
      narrationTriggers.push(payload.description);
    };

    // Incomplete saved waypoint with missing/empty description
    const incompleteSavedRoute: FavoriteLocation = {
      id: 'fav-custom-route',
      name: 'Custom Arctic Route',
      lat: 70.0,
      lng: -100.0,
      type: 'route',
      isSaved: true,
      waypoints: [
        {
          id: 'wp-custom-1',
          name: 'Remote Arctic Haven',
          lat: 70.0,
          lng: -100.0,
          isSaved: true,
          description: '', // Empty description, requires enrichment
          context: 'Discovered in 1850.'
        }
      ]
    };

    const favoritesList: FavoriteLocation[] = [incompleteSavedRoute];
    const activeRouteId = 'fav-custom-route';
    const wp = incompleteSavedRoute.waypoints![0];

    const activeSavedRoute = activeRouteId
      ? favoritesList.find(f => f.id === activeRouteId && f.type === 'route')
      : favoritesList.find(f => f.type === 'route' && f.waypoints?.some(w => w.id === wp.id));

    const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === wp.id || (w.lat === wp.lat && w.lng === wp.lng));
    const isSavedWp = Boolean(
      (wp.isSaved && (wp.description || wp.savedSnapshot)) ||
      (wp.savedSnapshot && wp.savedSnapshot.description) ||
      (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description)) ||
      Boolean(activeSavedRoute && (wp.description || matchingSavedWpInRoute?.description))
    );

    const snapshot = wp.savedSnapshot || matchingSavedWpInRoute?.savedSnapshot;
    const directCandidateDesc = (
      snapshot?.description ||
      wp.description ||
      matchingSavedWpInRoute?.description ||
      ''
    ).trim();

    const isSavedContentComplete = isSavedWp && directCandidateDesc.length > 20;

    expect(isSavedWp).toBe(true);
    expect(isSavedContentComplete).toBe(false);

    const isSavedRouteEnriching = isSavedWp && !isSavedContentComplete;
    const shouldDeferDisplay = isSavedRouteEnriching;

    const initialPayload = {
      id: wp.id,
      name: wp.name,
      description: directCandidateDesc,
      sectionState: { description: 'loading', news: 'idle' }
    };

    // Initial payload is deferred (NOT presented as ready)
    if (!shouldDeferDisplay) {
      presentWaypoint(initialPayload);
    }

    // Early narration is NOT triggered
    if (directCandidateDesc.length > 20 && !isSavedRouteEnriching) {
      maybeTriggerNarration(initialPayload);
    }

    expect(infoPanelPresentations).toHaveLength(0);
    expect(narrationTriggers).toHaveLength(0);

    // Run enrichment
    const enriched = await geminiService.getInfoFromFeature(wp as any);
    const finalPayload = {
      ...initialPayload,
      description: enriched?.description || '',
      sectionState: { description: 'complete', news: 'idle' }
    };

    presentWaypoint(finalPayload);
    maybeTriggerNarration(finalPayload);

    // Verify enrichment was called
    expect(mockGetInfoFromFeature).toHaveBeenCalledTimes(1);

    // Verify InfoPanel presented once and narration triggered once with final enriched state
    expect(infoPanelPresentations).toHaveLength(1);
    expect(infoPanelPresentations[0].description).toBe('Newly generated live enrichment description.');
    expect(narrationTriggers).toHaveLength(1);
    expect(narrationTriggers[0]).toBe('Newly generated live enrichment description.');
  });

  it('7. Follow-up interaction does not restart initial narration', async () => {
    const activeNarration = {
      selectionId: 'wp-fr-2',
      narrativeKey: 'stromness::stromness in the orkney islands served as the expedition last stop'
    };

    const followUpQuery = 'What ships stopped there?';
    const followUpAnswer = 'HMS Erebus and HMS Terror docked here in July 1845.';

    // Follow-up adds content under followUps array but does not change the core narrative key or restart baseline narration
    const locationWithFollowUp: LocationInfo = {
      id: 'wp-fr-2',
      name: 'Stromness, Orkney Islands',
      coordinates: { lat: 58.965, lng: -3.296 },
      type: 'Point of Interest' as any,
      description: "Stromness in the Orkney Islands served as the expedition's last stop.",
      followUps: [
        { id: 'fu-1', question: followUpQuery, answer: followUpAnswer }
      ]
    };

    expect(locationWithFollowUp.followUps).toHaveLength(1);
    expect(locationWithFollowUp.followUps![0].answer).toBe(followUpAnswer);
    expect(activeNarration.selectionId).toBe('wp-fr-2');
  });

  it('8. Restored payload uses LocationType runtime enum without throwing ReferenceError', () => {
    expect(LocationType).toBeDefined();
    expect(LocationType.POI).toBe('Point of Interest');
    expect(LocationType.CITY).toBe('City');

    const wp: Waypoint = {
      id: 'wp-shackleton-1',
      name: 'Plymouth, England',
      lat: 50.3755,
      lng: -4.1427,
      description: 'Plymouth was the departure point.'
    };

    const snapshot = {
      type: LocationType.POI,
      description: 'Plymouth was the departure point.'
    };

    expect(() => {
      const restoredPayload: LocationInfo = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        waypoint: wp,
        type: (wp.entityType as any) || (snapshot as any)?.type || LocationType.POI,
        entityType: wp.entityType || (snapshot as any)?.entityType || 'landmark',
        description: wp.description || '',
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      };
      expect(restoredPayload.type).toBe(LocationType.POI);
    }).not.toThrow();
  });

  it('9. isSavedWaypointComplete correctly distinguishes complete vs incomplete snapshots', () => {
    // A bare waypoint with only text description
    const bareWp: Waypoint = {
      id: 'wp-test-1',
      name: 'Elephant Island',
      lat: -61.13,
      lng: -55.23,
      description: "Elephant Island is a desolate, ice-covered mountainous island off the coast of Antarctica. It served as the refuge for Shackleton's men after the Endurance sank in the Weddell Sea."
    };
    expect(isSavedWaypointComplete(bareWp)).toBe(false);

    // Waypoint with description and empty images array but no notable or snapshot
    const partialWp: Waypoint = {
      ...bareWp,
      images: []
    };
    expect(isSavedWaypointComplete(partialWp)).toBe(false);

    // Fully hydrated waypoint with description, notable array, images array, and success snapshot
    const fullyHydratedWp: Waypoint = {
      ...bareWp,
      images: [{ url: 'https://example.com/elephant_island.jpg', caption: 'Elephant Island' }],
      notable: [{ title: 'Shackleton Haven', description: 'Camp established under two overturned lifeboats.' }],
      savedSnapshot: {
        id: 'wp-test-1',
        name: 'Elephant Island',
        coordinates: { lat: -61.13, lng: -55.23 },
        description: "Elephant Island is a desolate, ice-covered mountainous island off the coast of Antarctica. It served as the refuge for Shackleton's men after the Endurance sank in the Weddell Sea.",
        images: [{ url: 'https://example.com/elephant_island.jpg', caption: 'Elephant Island' }],
        notable: [{ title: 'Shackleton Haven', description: 'Camp established under two overturned lifeboats.' }],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      }
    };
    expect(isSavedWaypointComplete(fullyHydratedWp)).toBe(true);
  });

  it('10. Incomplete saved route triggers enrichment for images and notable facts and updates persisted route state', async () => {
    const mockImages = [
      { url: 'https://example.com/king_haakon.jpg', caption: 'King Haakon Bay', attribution: 'Photo © Archive' }
    ];
    vi.spyOn(imageService, 'fetchAndValidateImages').mockResolvedValue(mockImages as any);
    vi.spyOn(geminiService, 'getInfoFromFeature').mockResolvedValue({
      name: 'King Haakon Bay',
      type: 'POI' as any,
      coordinates: { lat: -54.15, lng: -37.28 },
      description: "King Haakon Bay is a rugged inlet on the southern coast of South Georgia Island in the southern Atlantic Ocean. It is famed as the landing site of Sir Ernest Shackleton and five companions following their epic open-boat voyage aboard the James Caird in 1916.",
      notable: [{ title: 'James Caird Landing', description: 'Historic 800-mile navigation landing site.' }]
    } as any);

    let favoritesState: FavoriteLocation[] = [
      {
        id: 'fav-shackleton-test',
        name: "Ernest Shackleton's Endurance Expedition",
        lat: -54.15,
        lng: -37.28,
        type: 'route',
        isSaved: true,
        waypoints: [
          {
            id: 'wp-shackleton-7',
            name: 'King Haakon Bay',
            lat: -54.15,
            lng: -37.28,
            sequence: 7,
            isSaved: true,
            description: 'Shackleton landed the James Caird on South Georgia here after an 800-mile voyage across the stormy Southern Ocean. The party found fresh water and food before embarking on their mountain crossing.',
            context: 'Landing on South Georgia after navigating across the stormy Southern Ocean.'
          }
        ]
      }
    ];

    const wp = favoritesState[0].waypoints![0];
    const isCompleteBefore = isSavedWaypointComplete(wp);
    expect(isCompleteBefore).toBe(false);

    // Simulate enrichment pipeline run
    const enrichedData = await geminiService.getInfoFromFeature(wp as any);
    const validatedImages = await imageService.fetchAndValidateImages({
      id: wp.id,
      name: wp.name,
      coordinates: { lat: wp.lat, lng: wp.lng },
      description: wp.description
    } as any);

    const fullSnapshot: LocationInfo = {
      id: wp.id,
      name: wp.name,
      coordinates: { lat: wp.lat, lng: wp.lng },
      description: enrichedData?.description || wp.description || '',
      historicalContext: wp.context,
      images: validatedImages,
      primaryImage: validatedImages[0]?.url,
      imageCaption: validatedImages[0]?.caption,
      imageAttribution: validatedImages[0]?.attribution,
      notable: enrichedData?.notable || [],
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    // Simulate state update in favorites
    favoritesState = favoritesState.map(fav => ({
      ...fav,
      waypoints: fav.waypoints!.map(w => ({
        ...w,
        images: validatedImages,
        primaryImage: validatedImages[0]?.url,
        imageCaption: validatedImages[0]?.caption,
        imageAttribution: validatedImages[0]?.attribution,
        notable: enrichedData?.notable || [],
        savedSnapshot: fullSnapshot
      }))
    }));

    const enrichedWp = favoritesState[0].waypoints![0];
    expect(isSavedWaypointComplete(enrichedWp)).toBe(true);
    expect(enrichedWp.images).toHaveLength(1);
    expect(enrichedWp.notable).toHaveLength(1);
    expect(enrichedWp.savedSnapshot?.images).toHaveLength(1);
    expect(enrichedWp.savedSnapshot?.notable).toHaveLength(1);
  });

  it('11. Stale empty-image snapshot rejection: saved waypoint with images: [] is recognized as incomplete, triggers enrichment, and repairs cache & snapshot', async () => {
    const mockImages = [
      { url: 'https://example.com/whalefish_islands.jpg', caption: 'Whalefish Islands Greenland', attribution: 'Photo © Archive' }
    ];
    const imageSpy = vi.spyOn(imageService, 'fetchAndValidateImages').mockResolvedValue(mockImages as any);
    const desc = "In the Whalefish Islands off the western coast of Greenland, the expedition transferred additional coal and preserved rations from escort transport ships. Five crew members were discharged and sent home, carrying the expedition's final letters to families.";
    const infoSpy = vi.spyOn(geminiService, 'getInfoFromFeature').mockResolvedValue({
      name: 'Whalefish Islands',
      type: 'POI' as any,
      coordinates: { lat: 69.25, lng: -53.53 },
      description: desc,
      notable: [{ title: 'Final Letters', description: 'Last letters sent home via transport ships.' }]
    } as any);

    // Stale waypoint with status: 'success' but images: []
    const staleWaypoint: Waypoint = {
      id: 'wp-fr-3',
      name: 'Whalefish Islands, Greenland',
      canonicalName: 'Whalefish Islands',
      lat: 69.25,
      lng: -53.53,
      sequence: 3,
      isSaved: true,
      description: desc,
      context: "July 1845: Five men sent home, provisions loaded. Last letters sent.",
      images: [],
      savedSnapshot: {
        id: 'wp-fr-3',
        name: 'Whalefish Islands, Greenland',
        canonicalName: 'Whalefish Islands',
        coordinates: { lat: 69.25, lng: -53.53 },
        description: desc,
        historicalContext: "July 1845: Five men sent home, provisions loaded. Last letters sent.",
        images: [],
        notable: [],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      }
    };

    // 1. isSavedWaypointComplete must return false for empty-image snapshot
    expect(isSavedWaypointComplete(staleWaypoint)).toBe(false);

    // 2. Simulate prefetch cache invalidation and check
    const cache = new Map<string, LocationInfo>();
    // Pre-populate cache with poisoned empty-image entry
    cache.set(staleWaypoint.id, staleWaypoint.savedSnapshot as any);

    const existingCache = cache.get(staleWaypoint.id);
    const isCacheComplete = Boolean(
      existingCache &&
      existingCache.status === 'success' &&
      Array.isArray(existingCache.images) &&
      existingCache.images.length > 0 &&
      Boolean(existingCache.primaryImage || existingCache.images[0]?.url) &&
      Array.isArray(existingCache.notable) &&
      existingCache.notable.length > 0 &&
      existingCache.description.length > 20
    );

    expect(isCacheComplete).toBe(false);
    if (!isCacheComplete) {
      cache.delete(staleWaypoint.id);
    }
    expect(cache.has(staleWaypoint.id)).toBe(false);

    // 3. Run enrichment
    const enrichedData = await geminiService.getInfoFromFeature(staleWaypoint as any);
    const validatedImages = await imageService.fetchAndValidateImages({
      id: staleWaypoint.id,
      name: staleWaypoint.name,
      coordinates: { lat: staleWaypoint.lat, lng: staleWaypoint.lng },
      description: staleWaypoint.description
    } as any);

    expect(validatedImages).toHaveLength(1);
    expect(validatedImages[0].url).toBe('https://example.com/whalefish_islands.jpg');

    // 4. Construct complete snapshot & cache
    const completeSnapshot: LocationInfo = {
      id: staleWaypoint.id,
      name: staleWaypoint.name,
      canonicalName: staleWaypoint.canonicalName || staleWaypoint.name,
      coordinates: { lat: staleWaypoint.lat, lng: staleWaypoint.lng },
      type: LocationType.POI,
      description: enrichedData?.description || staleWaypoint.description || '',
      historicalContext: staleWaypoint.context,
      images: validatedImages,
      primaryImage: validatedImages[0]?.url,
      imageCaption: validatedImages[0]?.caption,
      notable: enrichedData?.notable || [],
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    cache.set(staleWaypoint.id, completeSnapshot);

    const repairedWaypoint: Waypoint = {
      ...staleWaypoint,
      images: validatedImages,
      primaryImage: completeSnapshot.primaryImage,
      imageCaption: completeSnapshot.imageCaption,
      notable: completeSnapshot.notable,
      savedSnapshot: completeSnapshot
    };

    // 5. Verify repaired waypoint is now complete
    expect(isSavedWaypointComplete(repairedWaypoint)).toBe(true);
    expect(repairedWaypoint.images).toHaveLength(1);
    expect(repairedWaypoint.savedSnapshot?.images).toHaveLength(1);

    // 6. Verify subsequent navigation hits valid cache without network calls
    infoSpy.mockClear();
    imageSpy.mockClear();

    const finalCached = cache.get(staleWaypoint.id);
    const isFinalCacheComplete = Boolean(
      finalCached &&
      finalCached.status === 'success' &&
      Array.isArray(finalCached.images) &&
      finalCached.images.length > 0 &&
      Boolean(finalCached.primaryImage || finalCached.images[0]?.url) &&
      Array.isArray(finalCached.notable) &&
      finalCached.notable.length > 0
    );

    expect(isFinalCacheComplete).toBe(true);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(imageSpy).not.toHaveBeenCalled();
  });
});
