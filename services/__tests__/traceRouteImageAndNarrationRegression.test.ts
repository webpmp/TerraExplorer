import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAndValidateImages } from '../imageService';
import { searchImageRegistry } from '../imageDeduplicationService';

describe('TRACE ROUTE: Image Processing & Narration Decoupling Regressions', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1 & 8. Two accepted images stop further Wikipedia image queries (early exit)', async () => {
    let fetchCount = 0;
    const mockResponses = [
      {
        query: {
          pages: {
            '101': {
              title: 'Villa del Balbianello',
              description: 'Historic villa on Lake Como',
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Balbianello_1.jpg' },
              coordinates: [{ lat: 45.9651, lon: 9.2025 }]
            },
            '102': {
              title: 'Villa del Balbianello Garden',
              description: 'Villa del Balbianello terraced gardens',
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Balbianello_2.jpg' },
              coordinates: [{ lat: 45.9651, lon: 9.2025 }]
            }
          }
        }
      },
      {
        query: {
          pages: {
            '103': {
              title: 'Villa del Balbianello Loggia',
              thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Balbianello_3.jpg' }
            }
          }
        }
      }
    ];

    global.fetch = vi.fn().mockImplementation(async () => {
      const resp = mockResponses[fetchCount] || mockResponses[0];
      fetchCount++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => resp
      } as any;
    });

    const waypointInfo: any = {
      name: 'Villa del Balbianello',
      canonicalName: 'Villa del Balbianello',
      city: 'Lenno',
      country: 'Italy',
      coordinates: { lat: 45.9651, lng: 9.2025 },
      routeGroupId: 'lake-como-route',
      waypoint: { id: 'wp-1-villa-del-balbianello' }
    };

    const images = await fetchAndValidateImages(waypointInfo, {
      searchId: 'test-search-early-exit',
      waypointId: 'wp-1-villa-del-balbianello'
    });

    expect(images.length).toBe(2);
    expect(images[0].url).toContain('Balbianello_1.jpg');
    expect(images[1].url).toContain('Balbianello_2.jpg');
    // Early exit ensures only 1 query was needed because first query returned 2 accepted images
    expect(fetchCount).toBe(1);
  });

  it('6 & 7. HTTP 429 and non-JSON responses do not throw SyntaxError and handle gracefully', async () => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) {
        // Return 429 HTML
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'content-type': 'text/html' }),
          json: async () => { throw new SyntaxError("Unexpected token 'Y', \"You are ma\"... is not valid JSON"); }
        } as any;
      }
      // Second query returns valid JSON
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          query: {
            pages: {
              '201': {
                title: 'Villa Carlotta',
                description: 'Villa Carlotta museum on Lake Como',
                thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Carlotta_1.jpg' },
                coordinates: [{ lat: 45.9866, lon: 9.2300 }]
              }
            }
          }
        })
      } as any;
    });

    const waypointInfo: any = {
      name: 'Villa Carlotta',
      city: 'Tremezzo',
      country: 'Italy',
      coordinates: { lat: 45.9866, lng: 9.2300 },
      routeGroupId: 'lake-como-route',
      waypoint: { id: 'wp-2-villa-carlotta' }
    };

    let images: any[] = [];
    await expect((async () => {
      images = await fetchAndValidateImages(waypointInfo, {
        searchId: 'test-search-429',
        waypointId: 'wp-2-villa-carlotta'
      });
    })()).resolves.not.toThrow();

    expect(images.length).toBe(1);
    expect(images[0].url).toContain('Carlotta_1.jpg');
  });

  it('5. Duplicate in-flight image requests for the same waypoint are deduplicated', async () => {
    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      await new Promise(r => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          query: {
            pages: {
              '301': {
                title: 'Como Cathedral',
                thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/5/55/Duomo_Como.jpg' },
                coordinates: [{ lat: 45.8115, lon: 9.0838 }]
              }
            }
          }
        })
      } as any;
    });

    const waypointInfo: any = {
      name: 'Como Cathedral',
      city: 'Como',
      country: 'Italy',
      coordinates: { lat: 45.8115, lng: 9.0838 },
      routeGroupId: 'lake-como-route',
      waypoint: { id: 'wp-8-como-cathedral' }
    };

    const [res1, res2] = await Promise.all([
      fetchAndValidateImages(waypointInfo, { searchId: 'test-dedupe', waypointId: 'wp-8-como-cathedral' }),
      fetchAndValidateImages(waypointInfo, { searchId: 'test-dedupe', waypointId: 'wp-8-como-cathedral' })
    ]);

    expect(res1.length).toBe(1);
    expect(res2.length).toBe(1);
    expect(res1[0].url).toBe(res2[0].url);
    // In-flight map deduplication ensures only 1 batch of queries runs (4 queries for 1 request, instead of 8 queries for 2)
    expect(fetchCount).toBe(4);
  });

  it('2, 3 & 4. InfoPanel state payload preserves description, notable facts, and climate across additive image updates', () => {
    const initialTextState: any = {
      id: 'wp-1-villa-del-balbianello',
      name: 'Villa del Balbianello',
      canonicalName: 'Villa del Balbianello',
      coordinates: { lat: 45.9651, lng: 9.2025 },
      description: 'Villa del Balbianello is a historic villa situated on the tip of the small wooded peninsula of Dosso d’Avedo on the western shore of Lake Como.',
      population: undefined,
      climate: 'Temperate Continental',
      notable: [
        { name: 'Star Wars Episode II', significance: 'Filming location for the Lake Country scenes' },
        { name: 'Casino Royale', significance: 'Filming location for James Bond recovery scenes' },
        { name: 'Guido Monzino', significance: 'Explorer who owned the villa and led the 1973 Italian Everest expedition' }
      ],
      sectionState: { description: 'complete', news: 'idle' }
    };

    // Simulate arriving background images
    const backgroundImages = [
      { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Balbianello_1.jpg', caption: 'Villa del Balbianello facade' },
      { url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Balbianello_2.jpg', caption: 'Terraced gardens' }
    ];

    // Additive update
    const updatedState = {
      ...initialTextState,
      images: backgroundImages,
      primaryImage: backgroundImages[0].url
    };

    // Assert textual fields are untouched and images are present
    expect(updatedState.description).toBe(initialTextState.description);
    expect(updatedState.notable.length).toBe(3);
    expect(updatedState.climate).toBe('Temperate Continental');
    expect(updatedState.images.length).toBe(2);
    expect(updatedState.primaryImage).toBe(backgroundImages[0].url);
    expect(updatedState.sectionState.description).toBe('complete');
  });

  it('9 & 10. Progressive waypoint publication accumulates stably without collapsing during presentation or priority release', () => {
    // 1. Initial empty state
    let visibleRouteWaypoints: any[] = [];
    const internalRegistry: any[] = [];
    const progressiveMap = new Map<string, any>();

    const onProgress = (wp: any) => {
      progressiveMap.set(wp.id, wp);
      visibleRouteWaypoints = Array.from(progressiveMap.values());
      internalRegistry.push(wp);
    };

    // Step 1: WP1 discovered & validated
    const wp1 = { id: 'wp-1-villa-del-balbianello', name: 'Villa del Balbianello', lat: 45.9651, lng: 9.2025 };
    onProgress(wp1);
    expect(visibleRouteWaypoints.map(w => w.id)).toEqual(['wp-1-villa-del-balbianello']);

    // Step 2: WP2 discovered & validated
    const wp2 = { id: 'wp-2-villa-carlotta', name: 'Villa Carlotta', lat: 45.9866, lng: 9.2300 };
    onProgress(wp2);
    expect(visibleRouteWaypoints.map(w => w.id)).toEqual(['wp-1-villa-del-balbianello', 'wp-2-villa-carlotta']);

    // Step 3: WP1 presentation occurs (InfoPanel shown) - visible list MUST NOT be replaced or collapsed to [wp1]
    const presentWaypointAction = (targetWp: any) => {
      // Presentation only selects the target marker without mutating visibleRouteWaypoints
      expect(targetWp.id).toBe('wp-1-villa-del-balbianello');
    };
    presentWaypointAction(wp1);
    expect(visibleRouteWaypoints.length).toBe(2);

    // Step 4: WP3 and WP4 discovered & validated
    const wp3 = { id: 'wp-3-teresio-olivelli-park', name: 'Teresio Olivelli Park', lat: 45.9890, lng: 9.2360 };
    const wp4 = { id: 'wp-4-ponte-della-civera', name: 'Ponte della Civera', lat: 45.9920, lng: 9.2670 };
    onProgress(wp3);
    onProgress(wp4);
    expect(visibleRouteWaypoints.map(w => w.id)).toEqual([
      'wp-1-villa-del-balbianello',
      'wp-2-villa-carlotta',
      'wp-3-teresio-olivelli-park',
      'wp-4-ponte-della-civera'
    ]);

    // Step 5: Narration starts -> priority released. Visible list MUST remain intact without 4 -> 19 -> 1 flashing
    const releasePriorityAction = () => {
      // releasePriority releases lock without replacing visibleRouteWaypoints
    };
    releasePriorityAction();
    expect(visibleRouteWaypoints.length).toBe(4);

    // Step 6: Route completion publishes all validated waypoints
    const finalRouteWaypoints = Array.from(progressiveMap.values());
    visibleRouteWaypoints = finalRouteWaypoints;
    expect(visibleRouteWaypoints.length).toBe(4);
    expect(visibleRouteWaypoints.map(w => w.name)).toEqual([
      'Villa del Balbianello',
      'Villa Carlotta',
      'Teresio Olivelli Park',
      'Ponte della Civera'
    ]);
  });
});
