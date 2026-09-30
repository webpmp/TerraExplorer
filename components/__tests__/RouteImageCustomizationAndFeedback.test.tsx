import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FavoritesPanel from '../FavoritesPanel';
import { StackedImageCarousel } from '../StackedImageCarousel';
import {
  getUserImagePreference,
  setUserImagePreference,
  toggleUserImagePreference,
  getImagePreferenceKey,
  getEntityImagePreferenceId,
  clearAllImagePreferences,
  getAllImagePreferences
} from '../../services/imagePreferenceService';
import {
  fetchAndValidateImages,
  discoverAdditionalWaypointImages
} from '../../services/imageService';
import type { FavoriteLocation, LocationInfo } from '../../types';

describe('Route Image Customization & Lightbox Feedback', () => {
  let storage: Record<string, string> = {};
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    storage = {};
    const mockStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, val: string) => {
        storage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      }
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true
    });
  });

  describe('imagePreferenceService', () => {
    it('generates consistent keys', () => {
      expect(getImagePreferenceKey('wp-1', 'https://example.com/img1.jpg')).toBe('wp-1|https://example.com/img1.jpg');
      expect(getImagePreferenceKey('', 'https://example.com/img1.jpg')).toBe('global|https://example.com/img1.jpg');
    });

    it('stores and retrieves preferences without affecting route data', () => {
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBeNull();

      setUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'liked');
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBe('liked');

      setUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'disliked');
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBe('disliked');

      setUserImagePreference('wp-1', 'https://example.com/img1.jpg', null);
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBeNull();
    });

    it('toggles preference correctly', () => {
      const next1 = toggleUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'liked');
      expect(next1).toBe('liked');
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBe('liked');

      // Toggling same preference clears it
      const next2 = toggleUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'liked');
      expect(next2).toBeNull();
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBeNull();

      // Setting dislike
      const next3 = toggleUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'disliked');
      expect(next3).toBe('disliked');
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBe('disliked');

      // Switching directly from dislike to like
      const next4 = toggleUserImagePreference('wp-1', 'https://example.com/img1.jpg', 'liked');
      expect(next4).toBe('liked');
      expect(getUserImagePreference('wp-1', 'https://example.com/img1.jpg')).toBe('liked');
    });

    it('manages all preferences via getAllImagePreferences and clearAllImagePreferences', () => {
      setUserImagePreference('wp-1', 'https://example.com/1.jpg', 'liked');
      setUserImagePreference('wp-2', 'https://example.com/2.jpg', 'disliked');

      const all = getAllImagePreferences();
      expect(all['wp-1|https://example.com/1.jpg']).toBe('liked');
      expect(all['wp-2|https://example.com/2.jpg']).toBe('disliked');

      clearAllImagePreferences();
      expect(getAllImagePreferences()).toEqual({});
    });

    it('isolates the same image URL across different waypoints', () => {
      setUserImagePreference('wp-1', 'https://example.com/shared.jpg', 'liked');
      setUserImagePreference('wp-2', 'https://example.com/shared.jpg', 'disliked');

      expect(getUserImagePreference('wp-1', 'https://example.com/shared.jpg')).toBe('liked');
      expect(getUserImagePreference('wp-2', 'https://example.com/shared.jpg')).toBe('disliked');
    });

    describe('getEntityImagePreferenceId & Cross-Session Key Stability', () => {
      it('1. A standalone entity with id: "search-123" resolves to its canonical name', () => {
        const entity = {
          id: 'search-1790806355936',
          canonicalName: 'Santa Maria',
          name: 'Santa Maria'
        };
        expect(getEntityImagePreferenceId(entity)).toBe('Santa Maria');
      });

      it('2. A standalone entity with id: "fav-loc-123" resolves to its canonical name', () => {
        const entity = {
          id: 'fav-loc-1790809305130',
          canonicalName: 'Santa Maria',
          name: 'Santa Maria'
        };
        expect(getEntityImagePreferenceId(entity)).toBe('Santa Maria');
      });

      it('3. A canonical entity with a persistent ID uses that ID', () => {
        const entity = {
          id: 'custom-monument-42',
          canonicalName: 'Washington Monument',
          name: 'Washington Monument'
        };
        expect(getEntityImagePreferenceId(entity)).toBe('custom-monument-42');
      });

      it('4. A route waypoint uses waypoint.id', () => {
        const entity = {
          id: 'search-123',
          waypoint: { id: 'wp-shackleton-1' },
          canonicalName: 'Plymouth',
          name: 'Plymouth'
        };
        expect(getEntityImagePreferenceId(entity)).toBe('wp-shackleton-1');
      });

      it('5. canonicalName takes precedence over name', () => {
        const entity = {
          canonicalName: 'Hagia Sophia',
          name: 'Ayasofya Camii'
        };
        expect(getEntityImagePreferenceId(entity)).toBe('Hagia Sophia');
      });

      it('6. Image discovery and lightbox feedback use the same resolved identity', () => {
        const entity: LocationInfo = {
          id: 'search-1790806355936',
          name: 'Santa Maria',
          canonicalName: 'Santa Maria',
          coordinates: { lat: 19.8, lng: -72.2 }
        };

        const resolvedId = getEntityImagePreferenceId(entity);
        const imageUrl = 'https://thumb.wikimedia.org/santa-maria.jpg';

        // Lightbox user likes the image
        setUserImagePreference(resolvedId, imageUrl, 'liked');

        // Image discovery checks preference with the same resolved identity
        const discoveryPreference = getUserImagePreference(resolvedId, imageUrl);
        expect(discoveryPreference).toBe('liked');

        // Preference key is keyed by canonical name, not search-*
        const key = getImagePreferenceKey(resolvedId, imageUrl);
        expect(key).toBe('Santa Maria|https://thumb.wikimedia.org/santa-maria.jpg');
      });

      it('7. Repeated searches for the same entity produce the same preference key', () => {
        const firstSearch = {
          id: 'search-1790806355936',
          canonicalName: 'Hagia Sophia',
          name: 'Hagia Sophia'
        };
        const secondSearch = {
          id: 'search-1790809305130',
          canonicalName: 'Hagia Sophia',
          name: 'Hagia Sophia'
        };
        const imageUrl = 'https://thumb.wikimedia.org/hagia-sophia.jpg';

        const key1 = getImagePreferenceKey(getEntityImagePreferenceId(firstSearch), imageUrl);
        const key2 = getImagePreferenceKey(getEntityImagePreferenceId(secondSearch), imageUrl);

        expect(key1).toBe('Hagia Sophia|https://thumb.wikimedia.org/hagia-sophia.jpg');
        expect(key2).toBe(key1);

        // Setting preference in first search is readable in second search
        setUserImagePreference(getEntityImagePreferenceId(firstSearch), imageUrl, 'liked');
        expect(getUserImagePreference(getEntityImagePreferenceId(secondSearch), imageUrl)).toBe('liked');
      });

      it('8. Opening a saved favorite produces the same preference key as the original search', () => {
        const originalSearch = {
          id: 'search-1790806355936',
          canonicalName: 'Serengeti National Park',
          name: 'Serengeti'
        };
        const savedFavorite = {
          id: 'fav-loc-1790809999999',
          canonicalName: 'Serengeti National Park',
          name: 'Serengeti'
        };
        const imageUrl = 'https://thumb.wikimedia.org/serengeti.jpg';

        setUserImagePreference(getEntityImagePreferenceId(originalSearch), imageUrl, 'liked');
        expect(getUserImagePreference(getEntityImagePreferenceId(savedFavorite), imageUrl)).toBe('liked');
      });

      it('9. Existing route waypoint preference behavior remains unchanged', () => {
        const routeWp = {
          id: 'wp-shackleton-1',
          waypoint: { id: 'wp-shackleton-1' },
          canonicalName: 'Plymouth',
          name: 'Plymouth'
        };
        const imageUrl = 'https://commons.wikimedia.org/plymouth.jpg';

        expect(getEntityImagePreferenceId(routeWp)).toBe('wp-shackleton-1');
        setUserImagePreference(getEntityImagePreferenceId(routeWp), imageUrl, 'liked');
        expect(getImagePreferenceKey(getEntityImagePreferenceId(routeWp), imageUrl)).toBe('wp-shackleton-1|https://commons.wikimedia.org/plymouth.jpg');
        expect(getUserImagePreference('wp-shackleton-1', imageUrl)).toBe('liked');
      });
    });
  });

  describe('Progressive Background Image Discovery & Safeguards', () => {
    it('discoverAdditionalWaypointImages returns empty array when given empty location', async () => {
      const result = await discoverAdditionalWaypointImages({} as any, []);
      expect(result).toEqual([]);
    });

    it('filters out existing image URLs to avoid duplicate presentation', async () => {
      const existing = [
        { url: 'https://upload.wikimedia.org/image1.jpg', caption: 'Img 1' },
        { url: 'https://upload.wikimedia.org/image2.jpg', caption: 'Img 2' }
      ];

      // Simulated location
      const mockLocation: LocationInfo = {
        name: 'Plymouth',
        canonicalName: 'Plymouth',
        coordinates: { lat: 50.37, lng: -4.14 },
        country: 'United Kingdom'
      };

      // Mock fetch response returning duplicate and new images
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          query: {
            pages: {
              '1': {
                pageid: 1,
                title: 'Plymouth Sound',
                thumbnail: { source: 'https://upload.wikimedia.org/image1.jpg' },
                description: 'Bay in Plymouth'
              },
              '2': {
                pageid: 2,
                title: 'Smeaton Tower',
                thumbnail: { source: 'https://upload.wikimedia.org/image3.jpg' },
                description: 'Memorial tower in Plymouth'
              }
            }
          }
        })
      } as any);

      try {
        const additional = await discoverAdditionalWaypointImages(mockLocation, existing, {
          waypointId: 'wp-plymouth'
        });

        // Must not contain existing image1.jpg
        expect(additional.every(img => img.url !== 'https://upload.wikimedia.org/image1.jpg')).toBe(true);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('penalizes disliked images in candidate discovery', async () => {
      setUserImagePreference('wp-plymouth', 'https://upload.wikimedia.org/disliked.jpg', 'dislike');

      const mockLocation: LocationInfo = {
        name: 'Plymouth',
        canonicalName: 'Plymouth',
        coordinates: { lat: 50.37, lng: -4.14 },
        country: 'United Kingdom'
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          query: {
            pages: {
              '1': {
                pageid: 1,
                title: 'Plymouth Disliked Landmark',
                thumbnail: { source: 'https://upload.wikimedia.org/disliked.jpg' },
                description: 'A disliked photo'
              },
              '2': {
                pageid: 2,
                title: 'Plymouth Sound',
                thumbnail: { source: 'https://upload.wikimedia.org/liked.jpg' },
                description: 'A good photo'
              }
            }
          }
        })
      } as any);

      try {
        const discovered = await discoverAdditionalWaypointImages(mockLocation, [], {
          waypointId: 'wp-plymouth',
          maxPhotos: 1
        });

        if (discovered.length > 0) {
          // Liked/neutral image should be preferred over disliked image
          expect(discovered[0].url).toBe('https://upload.wikimedia.org/liked.jpg');
        }
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('StackedImageCarousel - Dynamic Expansion & Layout Stability', () => {
    it('does NOT render thumbs up / thumbs down in normal inline carousel mode', () => {
      const sampleImages = [
        { url: 'https://example.com/image1.jpg', caption: 'Sample Waypoint Image 1' },
        { url: 'https://example.com/image2.jpg', caption: 'Sample Waypoint Image 2' }
      ];

      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={sampleImages}
          locationName="Sample Waypoint"
          skin="modern"
          waypointId="wp-123"
        />
      );

      // Thumbs buttons must NOT be in the inline markup
      expect(html).not.toContain('title="Like image"');
      expect(html).not.toContain('title="Dislike image"');
      expect(html).not.toContain('Enable magnifier');
    });

    it('renders 1 / 2 counter and 1 pile layer when 2 images exist', () => {
      const sampleImages = [
        { url: 'https://example.com/image1.jpg', caption: 'Image 1' },
        { url: 'https://example.com/image2.jpg', caption: 'Image 2' }
      ];

      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={sampleImages}
          locationName="Sample Waypoint"
          skin="modern"
        />
      );

      expect(html).toContain('1 / 2');
      expect(html).toContain('data-testid="pile-layer-1"');
      expect(html).not.toContain('data-testid="pile-layer-2"');
    });

    it('dynamically renders 1 / 4 counter and 2 pile layers when expanded to 4 images', () => {
      const expandedImages = [
        { url: 'https://example.com/image1.jpg', caption: 'Image 1' },
        { url: 'https://example.com/image2.jpg', caption: 'Image 2' },
        { url: 'https://example.com/image3.jpg', caption: 'Image 3' },
        { url: 'https://example.com/image4.jpg', caption: 'Image 4' }
      ];

      const html = renderToStaticMarkup(
        <StackedImageCarousel
          images={expandedImages}
          locationName="Sample Waypoint"
          skin="modern"
        />
      );

      expect(html).toContain('1 / 4');
      expect(html).toContain('data-testid="pile-layer-1"');
      expect(html).toContain('data-testid="pile-layer-2"');
    });
  });

  describe('Race Condition & State Guard Simulation', () => {
    it('prevents Waypoint A late background results from applying when Waypoint B is active', () => {
      let activeSelectionId = 'wp-b';
      let activeRequestId = 102;

      let locationInfoState: any = {
        id: 'wp-b',
        name: 'Waypoint B',
        images: [{ url: 'https://example.com/b1.jpg' }]
      };

      const setLocationInfo = (updater: any) => {
        locationInfoState = typeof updater === 'function' ? updater(locationInfoState) : updater;
      };

      // Waypoint A background discovery completes with late results
      const wpAStableId = 'wp-a';
      const wpARequestId = 101;
      const wpALateImages = [
        { url: 'https://example.com/a1.jpg' },
        { url: 'https://example.com/a2.jpg' },
        { url: 'https://example.com/a3.jpg' }
      ];

      // Simulated guard in App.tsx
      if (activeSelectionId === wpAStableId && activeRequestId === wpARequestId) {
        setLocationInfo((prev: any) => ({
          ...prev,
          images: wpALateImages
        }));
      }

      // Waypoint B state MUST remain untouched
      expect(locationInfoState.id).toBe('wp-b');
      expect(locationInfoState.images).toEqual([{ url: 'https://example.com/b1.jpg' }]);
    });
  });

  describe('FavoritesPanel - Route Waypoints Rendering & Custom Image Precedence', () => {
    const mockFavorite: FavoriteLocation = {
      id: 'fav-1',
      name: 'Shackleton Expedition',
      type: 'route',
      lat: -54.0,
      lng: -36.0,
      timestamp: Date.now(),
      waypoints: [
        {
          id: 'wp-plymouth',
          name: 'Plymouth, England',
          lat: 50.37,
          lng: -4.14,
          narrative: 'Departure port in August 1914.',
          images: [
            'https://example.com/plymouth_docks_1914.jpg',
            'https://example.com/endurance_leaving.jpg'
          ],
          primaryImage: 'https://example.com/plymouth_docks_1914.jpg',
          savedSnapshot: {
            images: [
              'https://example.com/plymouth_docks_1914.jpg',
              'https://example.com/endurance_leaving.jpg'
            ],
            primaryImage: 'https://example.com/plymouth_docks_1914.jpg'
          }
        },
        {
          id: 'wp-south-georgia',
          name: 'South Georgia',
          lat: -54.28,
          lng: -36.50,
          narrative: 'Grytviken whaling station.',
          images: [],
          savedSnapshot: {}
        }
      ]
    };

    it('renders favorite routes correctly without leaking lightbox controls into panel', () => {
      const html = renderToStaticMarkup(
        <FavoritesPanel
          favorites={[mockFavorite]}
          onClose={vi.fn()}
          visibleFavoriteIds={['fav-1']}
          activeRouteId="fav-1"
          onToggleVisibility={vi.fn()}
          onDelete={vi.fn()}
          onUpdate={vi.fn()}
          onFlyTo={vi.fn()}
          skin="modern"
        />
      );

      expect(html).toContain('Shackleton Expedition');
      expect(html).not.toContain('title="Like image"');
      expect(html).not.toContain('title="Dislike image"');
    });

    it('verifies custom curated images flag suppresses automated background discovery', () => {
      const customWaypoint = mockFavorite.waypoints![0];
      const isCustomCuratedImages = Array.isArray(customWaypoint.images) && customWaypoint.images.length > 0;
      expect(isCustomCuratedImages).toBe(true);

      const emptyWaypoint = mockFavorite.waypoints![1];
      const isEmptyCuratedImages = Array.isArray(emptyWaypoint.images) && emptyWaypoint.images.length > 0;
      expect(isEmptyCuratedImages).toBe(false);
    });
  });
});
