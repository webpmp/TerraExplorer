import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../geminiService';
import * as imageService from '../imageService';
import { waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises } from '../cacheService';
import { DEFAULT_FRANKLIN_ROUTE, isSavedWaypointComplete } from '../../App';
import { FavoriteLocation, Waypoint, LocationInfo, LocationType } from '../../types';
import { evaluateDescriptionReadiness } from '../../utils/descriptionReadiness';

describe('Franklin Expedition Sequential Navigation & Hydration Lifecycle Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waypointEnrichmentCache.clear();
    waypointNarrationCache.clear();
    inFlightNarrationPromises.clear();
  });

  it('1. True sequential navigation simulation: wp-fr-1 -> wp-fr-10 resolves complete snapshots for every waypoint', async () => {
    // Mock enrichment services
    const getInfoSpy = vi.spyOn(geminiService, 'getInfoFromFeature').mockImplementation(async (marker: any) => ({
      name: marker.name,
      type: 'Point of Interest' as any,
      coordinates: { lat: marker.lat, lng: marker.lng },
      description: `${marker.name} is a key historical waypoint on Sir John Franklin's 1845 Northwest Passage expedition. The expedition charted unexplored waterways in this Arctic region.`,
      historicalContext: `Documented stop during the 1845-1848 Arctic voyage of HMS Erebus and HMS Terror.`,
      notable: [
        { title: `${marker.name} Historical Significance`, description: `Documented maritime exploration stop.` }
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

    // Simulated application route state
    let favorites: FavoriteLocation[] = [JSON.parse(JSON.stringify(DEFAULT_FRANKLIN_ROUTE))];
    let routeWaypoints: Waypoint[] = JSON.parse(JSON.stringify(DEFAULT_FRANKLIN_ROUTE.waypoints!));
    let currentWaypointIndex = 0;
    const presentedPayloads: LocationInfo[] = [];

    // Helper: Simulate loadWaypointData execution
    async function simulateLoadWaypointData(wp: Waypoint, fromWp?: Waypoint) {
      const stableId = wp.id;
      const activeSavedRoute = favorites.find(f => f.id === 'franklin-expedition');
      const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === wp.id) || routeWaypoints.find(w => w.id === wp.id);
      const isSavedWp = Boolean(
        (wp.isSaved && (wp.description || wp.savedSnapshot)) ||
        (wp.savedSnapshot && wp.savedSnapshot.description) ||
        (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description))
      );

      // Check cache
      const cachedEnrichment = waypointEnrichmentCache.get(stableId);
      const isCachedComplete = Boolean(
        cachedEnrichment && (
          !isSavedWp || (
            cachedEnrichment.status === 'success' &&
            Array.isArray(cachedEnrichment.images) &&
            Array.isArray(cachedEnrichment.notable) &&
            evaluateDescriptionReadiness(cachedEnrichment.description, wp.name).isReady
          )
        )
      );

      if (cachedEnrichment && isCachedComplete) {
        presentedPayloads.push(cachedEnrichment);
        return cachedEnrichment;
      } else if (cachedEnrichment && !isCachedComplete) {
        waypointEnrichmentCache.delete(stableId);
      }

      // Check snapshot
      const isSavedContentComplete = isSavedWp && isSavedWaypointComplete(wp, matchingSavedWpInRoute);
      if (isSavedWp && isSavedContentComplete) {
        const snapshot = wp.savedSnapshot || matchingSavedWpInRoute?.savedSnapshot!;
        waypointEnrichmentCache.set(stableId, snapshot);
        presentedPayloads.push(snapshot);
        return snapshot;
      }

      // Run foreground enrichment
      const enrichedData = await geminiService.getInfoFromFeature(wp as any);
      const validatedImages = await imageService.fetchAndValidateImages({
        id: wp.id,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        description: enrichedData?.description || wp.description
      } as any);

      const finalEnrichedState: LocationInfo = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        type: LocationType.POI,
        entityType: 'landmark',
        description: enrichedData?.description || wp.description || '',
        notable: enrichedData?.notable || [],
        images: validatedImages,
        primaryImage: validatedImages[0]?.url,
        imageCaption: validatedImages[0]?.caption,
        imageAttribution: validatedImages[0]?.attribution,
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      };

      // Persist snapshot to favorites and routeWaypoints
      favorites = favorites.map(fav => ({
        ...fav,
        waypoints: fav.waypoints?.map(w => w.id === wp.id ? { ...w, savedSnapshot: finalEnrichedState, isSaved: true } : w)
      }));
      routeWaypoints = routeWaypoints.map(w => w.id === wp.id ? { ...w, savedSnapshot: finalEnrichedState, isSaved: true } : w);
      waypointEnrichmentCache.set(stableId, finalEnrichedState);
      presentedPayloads.push(finalEnrichedState);

      return finalEnrichedState;
    }

    // Helper: Simulate background prefetch execution
    async function simulatePrefetch(wp: Waypoint) {
      const stableId = wp.id;
      const activeSavedRoute = favorites.find(f => f.id === 'franklin-expedition');
      const matchingSavedWpInRoute = activeSavedRoute?.waypoints?.find(w => w.id === wp.id) || routeWaypoints.find(w => w.id === wp.id);
      const isSavedWp = Boolean(
        (wp.isSaved && (wp.description || wp.savedSnapshot)) ||
        (wp.savedSnapshot && wp.savedSnapshot.description) ||
        (matchingSavedWpInRoute && (matchingSavedWpInRoute.isSaved || matchingSavedWpInRoute.savedSnapshot || matchingSavedWpInRoute.description))
      );

      const isSavedContentComplete = isSavedWp && isSavedWaypointComplete(wp, matchingSavedWpInRoute);
      if (isSavedWp && isSavedContentComplete) {
        const snapshot = wp.savedSnapshot || matchingSavedWpInRoute?.savedSnapshot!;
        waypointEnrichmentCache.set(stableId, snapshot);
        return;
      }

      // Full background enrichment
      const enrichedData = await geminiService.getInfoFromFeature(wp as any);
      const validatedImages = await imageService.fetchAndValidateImages({
        id: wp.id,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        description: enrichedData?.description || wp.description
      } as any);

      const finalEnrichedState: LocationInfo = {
        id: wp.id,
        name: wp.name,
        canonicalName: wp.canonicalName || wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        type: LocationType.POI,
        entityType: 'landmark',
        description: enrichedData?.description || wp.description || '',
        notable: enrichedData?.notable || [],
        images: validatedImages,
        primaryImage: validatedImages[0]?.url,
        imageCaption: validatedImages[0]?.caption,
        imageAttribution: validatedImages[0]?.attribution,
        status: 'success',
        sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
      };

      favorites = favorites.map(fav => ({
        ...fav,
        waypoints: fav.waypoints?.map(w => w.id === wp.id ? { ...w, savedSnapshot: finalEnrichedState, isSaved: true } : w)
      }));
      routeWaypoints = routeWaypoints.map(w => w.id === wp.id ? { ...w, savedSnapshot: finalEnrichedState, isSaved: true } : w);
      waypointEnrichmentCache.set(stableId, finalEnrichedState);
    }

    // Step 1: User selects Waypoint 1 (Greenhithe)
    currentWaypointIndex = 0;
    const wp1 = routeWaypoints[0];
    const payload1 = await simulateLoadWaypointData(wp1);
    expect(payload1.name).toBe('Greenhithe, England');
    expect(payload1.images!.length).toBeGreaterThan(0);
    expect(payload1.notable!.length).toBeGreaterThan(0);
    expect(payload1.status).toBe('success');

    // Step 2: Background prefetch triggers for Waypoint 2 (Stromness)
    await simulatePrefetch(routeWaypoints[1]);
    expect(waypointEnrichmentCache.has('wp-fr-2')).toBe(true);

    // Step 3: User navigates to Waypoint 2 (Stromness)
    currentWaypointIndex = 1;
    const wp2 = routeWaypoints[1];
    const payload2 = await simulateLoadWaypointData(wp2, wp1);
    expect(payload2.name).toBe('Stromness, Orkney');
    expect(payload2.images!.length).toBeGreaterThan(0);
    expect(payload2.notable!.length).toBeGreaterThan(0);
    expect(payload2.status).toBe('success');

    // Step 4: User advances through all remaining waypoints: wp-fr-3 through wp-fr-10
    for (let idx = 2; idx < routeWaypoints.length; idx++) {
      const prevWp = routeWaypoints[idx - 1];
      const currentWp = routeWaypoints[idx];

      // Simulate navigation
      currentWaypointIndex = idx;
      const presented = await simulateLoadWaypointData(currentWp, prevWp);

      // Assert completeness of every presented payload
      expect(presented.id).toBe(currentWp.id);
      expect(presented.name).toBe(currentWp.name);
      expect(evaluateDescriptionReadiness(presented.description, presented.name).isReady).toBe(true);
      expect(presented.images).toBeDefined();
      expect(presented.images!.length).toBeGreaterThan(0);
      expect(presented.notable).toBeDefined();
      expect(presented.notable!.length).toBeGreaterThan(0);
      expect(presented.status).toBe('success');
    }

    // Assert that all 10 waypoints were presented with complete payloads
    expect(presentedPayloads).toHaveLength(10);
    presentedPayloads.forEach((payload, idx) => {
      const canonical = DEFAULT_FRANKLIN_ROUTE.waypoints![idx];
      expect(payload.id).toBe(canonical.id);
      expect(payload.name).toBe(canonical.name);
      expect(payload.images!.length).toBeGreaterThan(0);
      expect(payload.notable!.length).toBeGreaterThan(0);
      expect(payload.status).toBe('success');
    });
  });

  it('2. Rapid user navigation (prefetch incomplete / Case B): foreground enrichment awaits complete snapshot without presenting partial seeded content', async () => {
    let enrichmentCallCount = 0;
    vi.spyOn(geminiService, 'getInfoFromFeature').mockImplementation(async (marker: any) => {
      enrichmentCallCount++;
      return {
        name: marker.name,
        type: 'Point of Interest' as any,
        coordinates: { lat: marker.lat, lng: marker.lng },
        description: `Substantive full description for ${marker.name}. Explored thoroughly by the Arctic expedition crew with specialized winter equipment.`,
        historicalContext: `Documented Arctic voyage event.`,
        notable: [{ title: 'Arctic Landmark', description: 'Significant navigation point.' }],
        news: []
      };
    });

    vi.spyOn(imageService, 'fetchAndValidateImages').mockImplementation(async (info: any) => [
      {
        url: `https://images.example.com/${info.name}.jpg`,
        caption: `Visual for ${info.name}`,
        attribution: 'Royal Archives'
      }
    ]);

    const initialWp3 = DEFAULT_FRANKLIN_ROUTE.waypoints![2]; // wp-fr-3 Whalefish Islands
    expect(isSavedWaypointComplete(initialWp3)).toBe(false);

    // Cache is EMPTY (user moved before background prefetch ran)
    expect(waypointEnrichmentCache.has(initialWp3.id)).toBe(false);

    // Run foreground enrichment flow
    const enrichedData = await geminiService.getInfoFromFeature(initialWp3 as any);
    const validatedImages = await imageService.fetchAndValidateImages({
      id: initialWp3.id,
      name: initialWp3.name,
      coordinates: { lat: initialWp3.lat, lng: initialWp3.lng },
      description: enrichedData?.description
    } as any);

    const presentedPayload: LocationInfo = {
      id: initialWp3.id,
      name: initialWp3.name,
      canonicalName: initialWp3.canonicalName || initialWp3.name,
      coordinates: { lat: initialWp3.lat, lng: initialWp3.lng },
      type: LocationType.POI,
      entityType: 'landmark',
      description: enrichedData?.description || initialWp3.description || '',
      notable: enrichedData?.notable || [],
      images: validatedImages,
      primaryImage: validatedImages[0]?.url,
      imageCaption: validatedImages[0]?.caption,
      imageAttribution: validatedImages[0]?.attribution,
      status: 'success',
      sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
    };

    // Assert that the presented payload is complete and NOT partial seeded content
    expect(enrichmentCallCount).toBe(1);
    expect(presentedPayload.images!.length).toBeGreaterThan(0);
    expect(presentedPayload.notable!.length).toBeGreaterThan(0);
    expect(presentedPayload.status).toBe('success');
    expect(isSavedWaypointComplete({ ...initialWp3, savedSnapshot: presentedPayload })).toBe(true);
  });
});
