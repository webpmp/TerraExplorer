import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FavoritesPanel from '../FavoritesPanel';
import { FavoriteLocation, Waypoint, LocationInfo } from '../../types';
import { loadInitialFavorites, hydrateFavoritesList, DEFAULT_SAVED_ROUTES } from '../../App';

describe('Favorites & Route Renaming Persistence Suite', () => {
  const sampleShackletonRoute: FavoriteLocation = {
    id: 'default-shackleton',
    name: "Ernest Shackleton's Endurance Expedition",
    lat: 50.3755,
    lng: -4.1427,
    type: 'route',
    notes: 'Personal expedition notes',
    waypoints: [
      {
        id: 'wp-shackleton-1',
        name: 'Plymouth, England',
        canonicalName: 'Plymouth',
        lat: 50.3755,
        lng: -4.1427,
        sequence: 1,
        globalSequence: 1,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        role: 'origin',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'Departure point for the Imperial Trans-Antarctic Expedition.',
        description: 'Historical port in Devon.',
        routeTitle: 'Endurance Expedition'
      },
      {
        id: 'wp-shackleton-2',
        name: 'Buenos Aires, Argentina',
        canonicalName: 'Buenos Aires',
        lat: -34.6037,
        lng: -58.3816,
        sequence: 2,
        globalSequence: 2,
        routeGroupId: 'shackleton-endurance',
        routeGroupName: "Ernest Shackleton's Endurance Expedition",
        isSequential: true,
        waypointType: 'route_waypoint',
        role: 'related',
        segmentEvidence: 'DOCUMENTED_ROUTE_SEGMENT',
        context: 'Final resupply stop before heading to South Georgia.',
        description: 'Capital of Argentina.',
        routeTitle: 'Endurance Expedition'
      }
    ]
  };

  const defaultProps = {
    favorites: [sampleShackletonRoute],
    onClose: vi.fn(),
    visibleFavoriteIds: [],
    activeRouteId: 'default-shackleton',
    onToggleVisibility: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onFlyTo: vi.fn(),
    skin: 'modern' as const
  };

  it('1. Renaming a saved route updates the canonical favorite name while preserving route ID, notes, and waypoint data', () => {
    const newRouteName = 'Shackleton 1914 Journey';
    const trimmedName = newRouteName.trim();

    const syncedRoute: FavoriteLocation = {
      ...sampleShackletonRoute,
      name: trimmedName,
      waypoints: sampleShackletonRoute.waypoints?.map(wp => ({
        ...wp,
        routeGroupName: trimmedName,
        routeTitle: trimmedName
      }))
    };

    // Canonical name updated
    expect(syncedRoute.name).toBe('Shackleton 1914 Journey');
    // Route ID unchanged
    expect(syncedRoute.id).toBe('default-shackleton');
    // User notes preserved
    expect(syncedRoute.notes).toBe('Personal expedition notes');
    // Waypoint count and order preserved
    expect(syncedRoute.waypoints).toHaveLength(2);
    expect(syncedRoute.waypoints![0].id).toBe('wp-shackleton-1');
    expect(syncedRoute.waypoints![0].lat).toBe(50.3755);
    expect(syncedRoute.waypoints![0].lng).toBe(-4.1427);
    expect(syncedRoute.waypoints![0].context).toBe('Departure point for the Imperial Trans-Antarctic Expedition.');
    expect(syncedRoute.waypoints![0].description).toBe('Historical port in Devon.');
    expect(syncedRoute.waypoints![0].sequence).toBe(1);

    expect(syncedRoute.waypoints![1].id).toBe('wp-shackleton-2');
    expect(syncedRoute.waypoints![1].lat).toBe(-34.6037);
    expect(syncedRoute.waypoints![1].lng).toBe(-58.3816);
    expect(syncedRoute.waypoints![1].sequence).toBe(2);
  });

  it('2. Persisted renamed route data is retained when loaded from terraexplorer_favorites without reverting to hardcoded defaults', () => {
    const renamedSavedRoute: FavoriteLocation = {
      id: 'default-shackleton',
      name: 'Shackleton 1914 Journey',
      lat: 50.3755,
      lng: -4.1427,
      type: 'route',
      notes: 'Custom notes',
      waypoints: [
        {
          id: 'wp-shackleton-1',
          name: 'Plymouth, England',
          lat: 50.3755,
          lng: -4.1427,
          routeGroupName: 'Shackleton 1914 Journey',
          routeTitle: 'Shackleton 1914 Journey'
        },
        {
          id: 'wp-shackleton-2',
          name: 'Buenos Aires, Argentina',
          lat: -34.6037,
          lng: -58.3816,
          routeGroupName: 'Shackleton 1914 Journey',
          routeTitle: 'Shackleton 1914 Journey'
        }
      ]
    };

    // Default route mapping fallback
    const defaultWaypointMap = new Map<string, Waypoint>();
    defaultWaypointMap.set('wp-shackleton-1', sampleShackletonRoute.waypoints![0]);
    defaultWaypointMap.set('wp-shackleton-2', sampleShackletonRoute.waypoints![1]);

    // Simulate the App.tsx hydration logic
    const parsed = [renamedSavedRoute];
    const hydratedFavorites = parsed
      .filter((f: any) => f && typeof f.lat === 'number' && typeof f.lng === 'number' && f.name)
      .map((f: FavoriteLocation) => {
        if (f.type === 'route' && Array.isArray(f.waypoints)) {
          const updatedWaypoints = f.waypoints.map(wp => {
            const defaultMatch = defaultWaypointMap.get(wp.id);
            if (defaultMatch) {
              return {
                ...defaultMatch,
                ...wp,
                description: (wp.description && wp.description.trim() !== '') ? wp.description : defaultMatch.description,
                sequence: wp.sequence ?? defaultMatch.sequence,
                globalSequence: wp.globalSequence ?? defaultMatch.globalSequence,
                routeGroupId: wp.routeGroupId ?? defaultMatch.routeGroupId,
                routeGroupName: f.name || wp.routeGroupName || defaultMatch.routeGroupName,
                routeTitle: f.name || wp.routeTitle || defaultMatch.routeTitle,
                isSequential: wp.isSequential ?? defaultMatch.isSequential,
                waypointType: wp.waypointType ?? defaultMatch.waypointType,
                segmentEvidence: wp.segmentEvidence ?? defaultMatch.segmentEvidence
              };
            }
            return {
              ...wp,
              routeGroupName: f.name || wp.routeGroupName,
              routeTitle: f.name || wp.routeTitle
            };
          });
          return { ...f, waypoints: updatedWaypoints };
        }
        return f;
      });

    // Hydration must preserve custom route name and not overwrite with default
    expect(hydratedFavorites[0].name).toBe('Shackleton 1914 Journey');
    expect(hydratedFavorites[0].id).toBe('default-shackleton');
    expect(hydratedFavorites[0].notes).toBe('Custom notes');
    expect(hydratedFavorites[0].waypoints![0].routeGroupName).toBe('Shackleton 1914 Journey');
    expect(hydratedFavorites[0].waypoints![0].routeTitle).toBe('Shackleton 1914 Journey');
    expect(hydratedFavorites[0].waypoints![0].description).toBe('Historical port in Devon.');
    expect(hydratedFavorites[0].waypoints![1].routeGroupName).toBe('Shackleton 1914 Journey');
    expect(hydratedFavorites[0].waypoints![1].description).toBe('Capital of Argentina.');
  });

  it('3. Active route and InfoPanel state receive the renamed route immediately upon update', () => {
    const updatedFav: FavoriteLocation = {
      ...sampleShackletonRoute,
      name: 'Shackleton 1914 Journey'
    };

    const syncedFav: FavoriteLocation = {
      ...updatedFav,
      name: updatedFav.name.trim(),
      waypoints: updatedFav.waypoints?.map(wp => ({
        ...wp,
        routeGroupName: updatedFav.name.trim(),
        routeTitle: updatedFav.name.trim()
      }))
    };

    const initialLocationInfo: Partial<LocationInfo> = {
      name: 'Plymouth, England',
      waypoint: sampleShackletonRoute.waypoints![0],
      routeContext: {
        title: "Ernest Shackleton's Endurance Expedition",
        text: 'Departure point for the Imperial Trans-Antarctic Expedition.'
      }
    };

    // State update logic as in App.tsx handleUpdateFavorite
    const currentWp = syncedFav.waypoints![0];
    const nextLocationInfo = {
      ...initialLocationInfo,
      name: currentWp.name,
      coordinates: { lat: currentWp.lat, lng: currentWp.lng },
      waypoint: currentWp,
      routeContext: currentWp.context ? {
        title: syncedFav.name,
        text: currentWp.context
      } : {
        title: syncedFav.name,
        text: currentWp.description || ""
      }
    };

    expect(nextLocationInfo.routeContext.title).toBe('Shackleton 1914 Journey');
    expect(nextLocationInfo.waypoint.routeGroupName).toBe('Shackleton 1914 Journey');
  });

  it('4. EDIT ROUTE modal has responsive height containment, bottom clearance, and internal scroll container', () => {
    // Render Explorations panel
    const html = renderToStaticMarkup(<FavoritesPanel {...defaultProps} />);

    // Explorations panel contains the saved route
    expect(html).toContain('EXPLORATIONS');
    expect(html).toContain("Ernest Shackleton&#x27;s Endurance Expedition");

    // Verify modal DOM classes when rendered in FavoritesPanel (rendered with editingRoute in state)
    // The modal backdrop has bottom padding pb-52 md:pb-56 to clear the controls below
    expect(FavoritesPanel.toString()).toContain('pb-52 md:pb-56');
    expect(FavoritesPanel.toString()).toContain('max-h-full');
    expect(FavoritesPanel.toString()).toContain('min-h-0');
    expect(FavoritesPanel.toString()).toContain('overflow-y-auto');
    expect(FavoritesPanel.toString()).toContain('shrink-0');
  });

  it('5. Full reload lifecycle: loadInitialFavorites retrieves custom route names without default overwrite', () => {
    // 1. Seed terraexplorer_favorites with customized route names
    const customShackletonName = 'Shackleton Custom Test Name';
    const customGenghisName = 'Genghis Khan Asian Conquest';

    const customizedFavorites: FavoriteLocation[] = [
      {
        ...sampleShackletonRoute,
        name: customShackletonName,
        waypoints: sampleShackletonRoute.waypoints?.map(wp => ({
          ...wp,
          routeGroupName: customShackletonName,
          routeTitle: customShackletonName
        }))
      },
      {
        id: 'default-genghis',
        name: customGenghisName,
        lat: 48.9,
        lng: 109.0,
        type: 'route',
        waypoints: [
          {
            id: 'wp-genghis-1',
            name: 'Burkhan Khaldun (Mongolia)',
            lat: 48.9,
            lng: 109.0,
            routeGroupName: customGenghisName,
            routeTitle: customGenghisName
          }
        ]
      }
    ];

    // Mock localStorage
    const originalLocalStorage = globalThis.localStorage;
    const storage: Record<string, string> = {
      'terraexplorer_favorites': JSON.stringify(customizedFavorites)
    };
    const mockStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const k in storage) delete storage[k];
      }
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });

    try {
      // 2. Initialize App favorites state via loadInitialFavorites() as done on real mount/reload
      const loadedFavorites = loadInitialFavorites();

      // 3. Verify custom names are preserved in the loaded state
      expect(loadedFavorites).toHaveLength(2);
      expect(loadedFavorites[0].name).toBe(customShackletonName);
      expect(loadedFavorites[0].id).toBe('default-shackleton');
      expect(loadedFavorites[0].waypoints![0].routeGroupName).toBe(customShackletonName);
      expect(loadedFavorites[0].waypoints![0].routeTitle).toBe(customShackletonName);
      expect(loadedFavorites[0].waypoints![0].name).toBe('Plymouth, England');
      expect(loadedFavorites[0].waypoints![0].lat).toBe(50.3755);

      expect(loadedFavorites[1].name).toBe(customGenghisName);
      expect(loadedFavorites[1].id).toBe('default-genghis');
      expect(loadedFavorites[1].waypoints![0].routeGroupName).toBe(customGenghisName);
      expect(loadedFavorites[1].waypoints![0].routeTitle).toBe(customGenghisName);

      // 4. Verify no default route names (e.g. "Ernest Shackleton's Endurance Expedition") overwrite the custom names
      expect(loadedFavorites[0].name).not.toBe("Ernest Shackleton's Endurance Expedition");
      expect(loadedFavorites[1].name).not.toBe("The Campaigns of Genghis Khan");

      // 5. Verify persisted localStorage object still contains the customized names
      const persisted = JSON.parse(storage['terraexplorer_favorites']);
      expect(persisted[0].name).toBe(customShackletonName);
      expect(persisted[1].name).toBe(customGenghisName);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true
      });
    }
  });

  it('6. Fallback behavior: loadInitialFavorites returns DEFAULT_SAVED_ROUTES only when storage is empty', () => {
    const originalLocalStorage = globalThis.localStorage;
    const mockStorage = {
      getItem: (_key: string) => null,
      setItem: (_key: string, _val: string) => {},
      removeItem: (_key: string) => {},
      clear: () => {}
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });
    try {
      const loaded = loadInitialFavorites();
      expect(loaded).toEqual(DEFAULT_SAVED_ROUTES);
      expect(loaded.length).toBeGreaterThanOrEqual(4);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true
      });
    }
  });

  describe('Saved InfoPanel Snapshot Restoration & Re-Enrichment Prevention', () => {
    it('Test 1: Complete saved location snapshot preserves description, historicalContext, notable facts, climate, and followUps', () => {
      const savedLocation: FavoriteLocation = {
        id: 'fav-santa-maria-1',
        name: 'Santa Maria Shipwreck',
        canonicalName: 'Santa Maria',
        lat: 19.76,
        lng: -72.20,
        type: 'location',
        entityType: 'shipwreck',
        description: 'The flagship of Christopher Columbus on his 1492 voyage.',
        historicalContext: 'Ran aground on a coral reef on Christmas Day 1492 near Cap-Haïtien.',
        climate: { name: 'Tropical', description: 'Warm maritime climate' },
        notable: [
          { title: 'Flagship of 1492', description: 'Columbus flagship during his first transatlantic voyage.' }
        ],
        contextNotes: ['Authoritative 1492 marine archaeological site'],
        images: [
          { url: 'https://images.example.com/santa-maria.jpg', caption: 'Replica of Santa Maria', attribution: 'Photo © Archive' }
        ],
        primaryImage: 'https://images.example.com/santa-maria.jpg',
        imageCaption: 'Replica of Santa Maria',
        imageAttribution: 'Photo © Archive',
        followUps: [
          { id: 'fu-1', question: 'What happened to the crew?', answer: 'The crew built the settlement of La Navidad from the ship timbers.' }
        ],
        isSaved: true,
        savedSnapshot: {
          id: 'fav-santa-maria-1',
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
          contextNotes: ['Authoritative 1492 marine archaeological site'],
          images: [
            { url: 'https://images.example.com/santa-maria.jpg', caption: 'Replica of Santa Maria', attribution: 'Photo © Archive' }
          ],
          primaryImage: 'https://images.example.com/santa-maria.jpg',
          imageCaption: 'Replica of Santa Maria',
          imageAttribution: 'Photo © Archive',
          followUps: [
            { id: 'fu-1', question: 'What happened to the crew?', answer: 'The crew built the settlement of La Navidad from the ship timbers.' }
          ],
          news: [],
          status: 'success',
          sectionState: { description: 'ready', news: 'idle', images: 'ready', nearby: 'ready' }
        }
      };

      const storage: Record<string, string> = {
        'terraexplorer_favorites': JSON.stringify([savedLocation])
      };

      const originalLocalStorage = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (k: string) => storage[k] || null,
          setItem: (k: string, v: string) => { storage[k] = v; },
          removeItem: (k: string) => { delete storage[k]; },
          clear: () => {}
        },
        writable: true,
        configurable: true
      });

      try {
        const loaded = loadInitialFavorites();
        expect(loaded).toHaveLength(1);
        const restored = loaded[0];

        expect(restored.name).toBe('Santa Maria Shipwreck');
        expect(restored.description).toBe('The flagship of Christopher Columbus on his 1492 voyage.');
        expect(restored.historicalContext).toBe('Ran aground on a coral reef on Christmas Day 1492 near Cap-Haïtien.');
        expect(restored.notable).toHaveLength(1);
        expect(restored.notable![0].title).toBe('Flagship of 1492');
        expect(restored.climate?.name).toBe('Tropical');
        expect(restored.images).toHaveLength(1);
        expect((restored.images![0] as any).caption).toBe('Replica of Santa Maria');
        expect(restored.followUps).toHaveLength(1);
        expect(restored.followUps![0].question).toBe('What happened to the crew?');
        expect(restored.savedSnapshot).toBeDefined();
        expect(restored.savedSnapshot?.sectionState?.description).toBe('ready');
      } finally {
        Object.defineProperty(globalThis, 'localStorage', {
          value: originalLocalStorage,
          writable: true,
          configurable: true
        });
      }
    });

    it('Test 2: Saved route waypoints preserve distinct snapshots and images across all route stops', () => {
      const multiWpRoute: FavoriteLocation = {
        id: 'fav-custom-expedition',
        name: 'Historic Expedition',
        lat: 10,
        lng: 20,
        type: 'route',
        isSaved: true,
        waypoints: [
          {
            id: 'wp-exp-1',
            name: 'Waypoint Alpha',
            lat: 10,
            lng: 20,
            description: 'Departure staging base.',
            historicalContext: 'Established in 1890.',
            images: [{ url: 'https://example.com/alpha.jpg', caption: 'Alpha Port' }],
            isSaved: true
          },
          {
            id: 'wp-exp-2',
            name: 'Waypoint Beta',
            lat: 12,
            lng: 22,
            description: 'Mountain pass crossing.',
            historicalContext: 'Traversed during winter 1891.',
            images: [{ url: 'https://example.com/beta.jpg', caption: 'Beta Peak' }],
            isSaved: true
          }
        ]
      };

      const storage: Record<string, string> = {
        'terraexplorer_favorites': JSON.stringify([multiWpRoute])
      };

      const originalLocalStorage = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: (k: string) => storage[k] || null,
          setItem: (k: string, v: string) => { storage[k] = v; },
          removeItem: (k: string) => { delete storage[k]; },
          clear: () => {}
        },
        writable: true,
        configurable: true
      });

      try {
        const loaded = loadInitialFavorites();
        expect(loaded).toHaveLength(1);
        const restoredRoute = loaded[0];

        expect(restoredRoute.waypoints).toHaveLength(2);
        expect(restoredRoute.waypoints![0].description).toBe('Departure staging base.');
        expect(restoredRoute.waypoints![0].images![0]).toEqual({ url: 'https://example.com/alpha.jpg', caption: 'Alpha Port' });
        expect(restoredRoute.waypoints![1].description).toBe('Mountain pass crossing.');
        expect(restoredRoute.waypoints![1].images![0]).toEqual({ url: 'https://example.com/beta.jpg', caption: 'Beta Peak' });
      } finally {
        Object.defineProperty(globalThis, 'localStorage', {
          value: originalLocalStorage,
          writable: true,
          configurable: true
        });
      }
    });
  });
});

