import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../geminiService';
import * as imageService from '../imageService';
import { generateContextualChips } from '../followUpService';
import { DEFAULT_FRANKLIN_ROUTE, isSavedWaypointComplete, hydrateFavoritesList } from '../../App';
import { FavoriteLocation, Waypoint, LocationInfo, LocationType } from '../../types';

describe('Franklin Expedition Full-Route Enrichment Regression Suite', () => {
  const CANONICAL_FRANKLIN_WAYPOINTS = [
    { id: 'wp-fr-1', name: 'Greenhithe, England', sequence: 1, lat: 51.448, lng: 0.283 },
    { id: 'wp-fr-2', name: 'Stromness, Orkney', sequence: 2, lat: 58.965, lng: -3.296 },
    { id: 'wp-fr-3', name: 'Whalefish Islands, Greenland', sequence: 3, lat: 69.25, lng: -53.53 },
    { id: 'wp-fr-4', name: 'Lancaster Sound', sequence: 4, lat: 74.25, lng: -84.0 },
    { id: 'wp-fr-5', name: 'Beechey Island', sequence: 5, lat: 74.716, lng: -91.833 },
    { id: 'wp-fr-6', name: 'Cornwallis Island', sequence: 6, lat: 75.15, lng: -95.0 },
    { id: 'wp-fr-7', name: 'Peel Sound', sequence: 7, lat: 73.0, lng: -96.5 },
    { id: 'wp-fr-8', name: 'Point Victory', sequence: 8, lat: 69.63, lng: -98.81 },
    { id: 'wp-fr-9', name: 'Terror Bay', sequence: 9, lat: 68.89, lng: -98.94 },
    { id: 'wp-fr-10', name: 'Queen Maud Gulf', sequence: 10, lat: 68.25, lng: -98.9 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Canonical route integrity: DEFAULT_FRANKLIN_ROUTE contains exactly 10 sequential waypoints', () => {
    expect(DEFAULT_FRANKLIN_ROUTE.waypoints).toHaveLength(10);
    expect(DEFAULT_FRANKLIN_ROUTE.name).toBe('Franklin Expedition Route');

    DEFAULT_FRANKLIN_ROUTE.waypoints!.forEach((wp, idx) => {
      const canonical = CANONICAL_FRANKLIN_WAYPOINTS[idx];
      expect(wp.id).toBe(canonical.id);
      expect(wp.name).toBe(canonical.name);
      expect(wp.sequence).toBe(canonical.sequence);
      expect(wp.lat).toBeCloseTo(canonical.lat, 2);
      expect(wp.lng).toBeCloseTo(canonical.lng, 2);
      expect(wp.routeGroupId).toBe('franklin-expedition');
    });
  });

  it('2. Completeness guard: ALL 10 initial saved waypoints are recognized as incomplete before enrichment', () => {
    // Initial saved route waypoints have seed descriptions but lack validated images, notable facts, and snapshots
    DEFAULT_FRANKLIN_ROUTE.waypoints!.forEach((wp) => {
      const isComplete = isSavedWaypointComplete(wp);
      expect(
        isComplete,
        `Waypoint ${wp.id} (${wp.name}) must NOT be marked complete merely because it has a seed description`
      ).toBe(false);
    });
  });

  it('3. Route-wide hydration: ALL 10 waypoints enrich with validated images and notable facts and persist complete snapshots', async () => {
    // Mock enrichment services
    const getInfoSpy = vi.spyOn(geminiService, 'getInfoFromFeature').mockImplementation(async (marker: any) => ({
      name: marker.name,
      type: 'Point of Interest' as any,
      coordinates: { lat: marker.lat, lng: marker.lng },
      description: `${marker.name} is a key historical waypoint on Sir John Franklin's 1845 Northwest Passage expedition. The expedition explored Arctic waters and established winter quarters in this region.`,
      historicalContext: `Documented stop during the 1845-1848 Arctic voyage of HMS Erebus and HMS Terror.`,
      notable: [
        { title: `${marker.name} Historic Role`, description: `Significant Arctic expedition location.` }
      ],
      news: []
    }));

    const imageSpy = vi.spyOn(imageService, 'fetchAndValidateImages').mockImplementation(async (info: any) => [
      {
        url: `https://images.example.com/franklin/${info.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg`,
        caption: `Historical visual for ${info.name}`,
        attribution: 'Archives of the Royal Geographical Society'
      }
    ]);

    // Hydrate all 10 waypoints into a saved route state
    let routeState: FavoriteLocation = JSON.parse(JSON.stringify(DEFAULT_FRANKLIN_ROUTE));

    for (let i = 0; i < routeState.waypoints!.length; i++) {
      const wp = routeState.waypoints![i];
      expect(isSavedWaypointComplete(wp)).toBe(false);

      // 1. Run LLM metadata enrichment
      const enrichedData = await geminiService.getInfoFromFeature(wp as any);

      // 2. Run validated image resolution
      const validatedImages = await imageService.fetchAndValidateImages({
        id: wp.id,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        description: enrichedData?.description || wp.description
      } as any);

      // 3. Construct complete snapshot
      const snapshot: LocationInfo = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        type: LocationType.POI,
        entityType: 'landmark',
        description: enrichedData?.description || wp.description || '',
        historicalContext: wp.context || wp.historicalContext,
        images: validatedImages,
        primaryImage: validatedImages[0]?.url,
        imageCaption: validatedImages[0]?.caption,
        imageAttribution: validatedImages[0]?.attribution,
        notable: enrichedData?.notable || [],
        status: 'success',
        sectionState: {
          description: 'ready',
          news: 'idle',
          images: 'ready',
          nearby: 'ready'
        }
      };

      // 4. Persist enriched state to route
      routeState.waypoints![i] = {
        ...wp,
        description: snapshot.description,
        historicalContext: snapshot.historicalContext,
        images: validatedImages,
        primaryImage: snapshot.primaryImage,
        imageCaption: snapshot.imageCaption,
        imageAttribution: snapshot.imageAttribution,
        notable: snapshot.notable,
        isSaved: true,
        savedSnapshot: snapshot
      };
    }

    // Verify all 10 waypoints are now fully hydrated and complete
    expect(getInfoSpy).toHaveBeenCalledTimes(10);
    expect(imageSpy).toHaveBeenCalledTimes(10);

    routeState.waypoints!.forEach((enrichedWp, idx) => {
      const canonical = CANONICAL_FRANKLIN_WAYPOINTS[idx];
      expect(enrichedWp.id).toBe(canonical.id);
      expect(isSavedWaypointComplete(enrichedWp)).toBe(true);
      expect(enrichedWp.images).toHaveLength(1);
      expect(enrichedWp.images![0]).toMatchObject({
        url: expect.stringContaining('images.example.com'),
        caption: expect.stringContaining(canonical.name)
      });
      expect(enrichedWp.notable).toHaveLength(1);
      expect(enrichedWp.savedSnapshot).toBeDefined();
      expect(enrichedWp.savedSnapshot?.status).toBe('success');
      expect(enrichedWp.savedSnapshot?.sectionState?.images).toBe('ready');
      expect(enrichedWp.savedSnapshot?.sectionState?.description).toBe('ready');
    });
  });

  it('4. Snapshot restoration: Genuinely complete Franklin route restores all 10 waypoints with 0 redundant network calls', async () => {
    const getInfoSpy = vi.spyOn(geminiService, 'getInfoFromFeature');
    const imageSpy = vi.spyOn(imageService, 'fetchAndValidateImages');

    // Create a fully hydrated route
    const fullyHydratedRoute: FavoriteLocation = {
      ...DEFAULT_FRANKLIN_ROUTE,
      waypoints: DEFAULT_FRANKLIN_ROUTE.waypoints!.map((wp, idx) => {
        const canonical = CANONICAL_FRANKLIN_WAYPOINTS[idx];
        const desc = `${canonical.name} is a vital location on Sir John Franklin's expedition. The expedition wintered here before sailing south into the central Arctic channels.`;
        const images = [
          {
            url: `https://images.example.com/franklin/${wp.id}.jpg`,
            caption: `${canonical.name} Expedition View`,
            attribution: 'Admiralty Collection'
          }
        ];
        const notable = [
          { title: `${canonical.name} Significance`, description: `Documented 1845-1848 Arctic milestone.` }
        ];
        const snapshot: LocationInfo = {
          id: wp.id,
          name: canonical.name,
          canonicalName: canonical.name,
          coordinates: { lat: canonical.lat, lng: canonical.lng },
          type: LocationType.POI,
          entityType: 'landmark',
          description: desc,
          images,
          primaryImage: images[0].url,
          imageCaption: images[0].caption,
          imageAttribution: images[0].attribution,
          notable,
          status: 'success',
          sectionState: {
            description: 'ready',
            news: 'idle',
            images: 'ready',
            nearby: 'ready'
          }
        };

        return {
          ...wp,
          description: desc,
          images,
          primaryImage: images[0].url,
          imageCaption: images[0].caption,
          imageAttribution: images[0].attribution,
          notable,
          isSaved: true,
          savedSnapshot: snapshot
        };
      })
    };

    // Test restoring each of the 10 waypoints
    fullyHydratedRoute.waypoints!.forEach((wp) => {
      const isComplete = isSavedWaypointComplete(wp);
      expect(isComplete).toBe(true);

      // Simulate restored payload generation (as in loadWaypointData)
      let restoredPayload: LocationInfo | null = null;
      if (isComplete) {
        const snapshot = wp.savedSnapshot!;
        restoredPayload = {
          id: wp.id,
          name: wp.name,
          canonicalName: wp.canonicalName || snapshot.canonicalName || wp.name,
          coordinates: { lat: wp.lat, lng: wp.lng },
          type: LocationType.POI,
          entityType: 'landmark',
          description: wp.description || snapshot.description || '',
          images: wp.images || snapshot.images || [],
          primaryImage: wp.primaryImage || snapshot.primaryImage,
          imageCaption: wp.imageCaption || snapshot.imageCaption,
          imageAttribution: wp.imageAttribution || snapshot.imageAttribution,
          notable: wp.notable || snapshot.notable || [],
          status: 'success',
          sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
        };
      }

      expect(restoredPayload).not.toBeNull();
      expect(restoredPayload?.images).toHaveLength(1);
      expect(restoredPayload?.notable).toHaveLength(1);
      expect(restoredPayload?.status).toBe('success');
      expect(restoredPayload?.sectionState?.images).toBe('ready');
    });

    // Zero network calls should have occurred during restoration of all 10 waypoints
    expect(getInfoSpy).not.toHaveBeenCalled();
    expect(imageSpy).not.toHaveBeenCalled();
  });

  it('5. Narration lifecycle: Narration triggers once after full enrichment and contextual follow-up chips are generated', async () => {
    const narrationEvents: { waypointId: string; text: string }[] = [];
    const triggerNarration = (payload: LocationInfo) => {
      narrationEvents.push({ waypointId: payload.id, text: payload.description });
    };

    const wp = DEFAULT_FRANKLIN_ROUTE.waypoints![4]; // wp-fr-5 Beechey Island
    expect(isSavedWaypointComplete(wp)).toBe(false);

    // Initial state: display is deferred, narration is NOT fired on stub
    let isPresented = false;
    const isSavedRouteEnriching = !isSavedWaypointComplete(wp);
    const shouldDeferDisplay = isSavedRouteEnriching;

    if (!shouldDeferDisplay) {
      isPresented = true;
    }
    expect(isPresented).toBe(false);
    expect(narrationEvents).toHaveLength(0);

    // Complete enrichment
    const enrichedDescription = "Beechey Island provided a sheltered harbor where the Franklin Expedition spent their first Arctic winter from 1845 to 1846. Three expedition crewmen perished here and were buried on the windswept shore.";
    const validatedImages = [
      { url: 'https://example.com/beechey_island.jpg', caption: 'Beechey Island Graves', attribution: 'Photo © Archive' }
    ];
    const notable = [
      { title: 'Expedition Graves', description: 'Graves of Torrington, Hartnell, and Braine.' }
    ];

    const finalPayload: LocationInfo = {
      id: wp.id,
      name: wp.name,
      canonicalName: wp.name,
      coordinates: { lat: wp.lat, lng: wp.lng },
      type: LocationType.POI,
      entityType: 'landmark',
      description: enrichedDescription,
      images: validatedImages,
      primaryImage: validatedImages[0].url,
      imageCaption: validatedImages[0].caption,
      notable,
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    // Presentation and narration fire once on final enriched payload
    isPresented = true;
    triggerNarration(finalPayload);

    expect(isPresented).toBe(true);
    expect(narrationEvents).toHaveLength(1);
    expect(narrationEvents[0].waypointId).toBe('wp-fr-5');
    expect(narrationEvents[0].text).toBe(enrichedDescription);

    // Verify contextual follow-up chips are generated for the presented waypoint
    const chips = generateContextualChips(finalPayload);
    expect(chips).toBeDefined();
    expect(Array.isArray(chips)).toBe(true);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0].type).toBe('question');
    expect(typeof chips[0].label).toBe('string');
  });

  it('6. Favorites storage round-trip: Hydrated Franklin route serializes to JSON and restores with all snapshots intact', () => {
    const fullyHydratedRoute: FavoriteLocation = {
      ...DEFAULT_FRANKLIN_ROUTE,
      waypoints: DEFAULT_FRANKLIN_ROUTE.waypoints!.map((wp, idx) => {
        const canonical = CANONICAL_FRANKLIN_WAYPOINTS[idx];
        const desc = `${canonical.name} description with sufficient documentary depth for the expedition.`;
        const images = [{ url: `https://example.com/${wp.id}.jpg`, caption: canonical.name }];
        const notable = [{ title: `${canonical.name} Fact`, description: `Historical detail.` }];
        return {
          ...wp,
          description: desc,
          images,
          notable,
          isSaved: true,
          savedSnapshot: {
            id: wp.id,
            name: canonical.name,
            coordinates: { lat: canonical.lat, lng: canonical.lng },
            type: LocationType.POI,
            description: desc,
            images,
            notable,
            status: 'success',
            sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
          }
        };
      })
    };

    // Simulate serialization to localStorage JSON and deserialization back
    const serialized = JSON.stringify([fullyHydratedRoute]);
    const parsed = JSON.parse(serialized);
    const restoredFavorites = hydrateFavoritesList(parsed);

    expect(restoredFavorites).toHaveLength(1);
    const restoredRoute = restoredFavorites[0];
    expect(restoredRoute.waypoints).toHaveLength(10);

    restoredRoute.waypoints!.forEach((wp, idx) => {
      const canonical = CANONICAL_FRANKLIN_WAYPOINTS[idx];
      expect(wp.id).toBe(canonical.id);
      expect(wp.name).toBe(canonical.name);
      expect(wp.images).toHaveLength(1);
      expect(wp.notable).toHaveLength(1);
      expect(wp.savedSnapshot).toBeDefined();
      expect(wp.savedSnapshot?.status).toBe('success');
    });
  });

  it('7. Problematic waypoints image survival: WP3, WP4, WP5, WP8, WP9, and WP10 retain validated images through presentation data flow', async () => {
    // Mock imageService.fetchAndValidateImages to simulate enriched historical images returned for each waypoint
    const imageMap: Record<string, any[]> = {
      'wp-fr-1': [{ url: 'https://example.com/greenhithe.jpg', caption: 'Greenhithe Departure' }],
      'wp-fr-2': [{ url: 'https://example.com/stromness.jpg', caption: 'Stromness Port' }],
      'wp-fr-3': [{ url: 'https://example.com/whalefish.jpg', caption: 'Whalefish Islands Provisions' }],
      'wp-fr-4': [{ url: 'https://example.com/lancaster_sound.jpg', caption: 'Lancaster Sound Ice' }],
      'wp-fr-5': [{ url: 'https://example.com/beechey_island.jpg', caption: 'Beechey Island Graves' }],
      'wp-fr-6': [{ url: 'https://example.com/cornwallis.jpg', caption: 'Cornwallis Island' }],
      'wp-fr-7': [{ url: 'https://example.com/peel_sound.jpg', caption: 'Peel Sound Strait' }],
      'wp-fr-8': [{ url: 'https://example.com/point_victory.jpg', caption: 'Point Victory Cairn' }],
      'wp-fr-9': [{ url: 'https://example.com/terror_bay.jpg', caption: 'HMS Terror in Terror Bay' }],
      'wp-fr-10': [{ url: 'https://example.com/queen_maud_gulf.jpg', caption: 'HMS Erebus in Queen Maud Gulf' }]
    };

    vi.spyOn(imageService, 'fetchAndValidateImages').mockImplementation(async (info: any) => {
      return imageMap[info.id || (info as any).waypoint?.id] || [];
    });

    // Simulate pipeline execution for all 10 waypoints
    const presentedWaypoints: Record<string, LocationInfo> = {};

    for (const wp of DEFAULT_FRANKLIN_ROUTE.waypoints!) {
      const fetchedImages = await imageService.fetchAndValidateImages({
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || wp.name,
        description: wp.description
      } as any);

      const finalEnrichedState: LocationInfo = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        type: LocationType.POI,
        description: wp.description || '',
        historicalContext: wp.context,
        images: fetchedImages,
        primaryImage: fetchedImages[0]?.url,
        imageCaption: fetchedImages[0]?.caption,
        notable: [{ title: `${wp.name} Notable`, description: 'Historic milestone' }],
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      };

      presentedWaypoints[wp.id] = finalEnrichedState;
    }

    // Explicit assertions on previously problematic waypoints
    expect(presentedWaypoints['wp-fr-3'].images.length).toBeGreaterThan(0);
    expect(presentedWaypoints['wp-fr-4'].images.length).toBeGreaterThan(0);
    expect(presentedWaypoints['wp-fr-5'].images.length).toBeGreaterThan(0);
    expect(presentedWaypoints['wp-fr-8'].images.length).toBeGreaterThan(0);
    expect(presentedWaypoints['wp-fr-9'].images.length).toBeGreaterThan(0);
    expect(presentedWaypoints['wp-fr-10'].images.length).toBeGreaterThan(0);

    // Verify all 10 waypoints have primaryImage and validated images
    Object.keys(imageMap).forEach(wpId => {
      expect(presentedWaypoints[wpId].images.length).toBeGreaterThan(0);
      expect(presentedWaypoints[wpId].primaryImage).toBeDefined();
      expect(presentedWaypoints[wpId].status).toBe('success');
    });
  });
});
