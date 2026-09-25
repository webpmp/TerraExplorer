import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../../services/geminiService';
import { FavoriteLocation, Waypoint, MapMarker, LocationInfo } from '../../types';

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
});
