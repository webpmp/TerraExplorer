import { vi } from 'vitest';

export interface MockNetworkOptions {
  nominatim?: {
    reverseHandler?: (lat: number, lng: number, url: string) => any;
    searchHandler?: (query: string, url: string) => any;
  };
  wikipedia?: {
    queryHandler?: (url: string) => any;
  };
  gemini?: {
    responseHandler?: (url: string, body?: any) => any;
  };
  overpass?: {
    responseHandler?: (url: string, body?: any) => any;
  };
  customHandler?: (url: string, init?: RequestInit) => any;
}

/**
 * Creates and installs a deterministic global fetch mock that routes requests
 * to Nominatim, Wikipedia/Wikimedia/Wikidata, Overpass mirrors, and Gemini APIs.
 *
 * Returns a teardown function or use afterEach(vi.unstubAllGlobals).
 */
export function setupMockNetwork(options: MockNetworkOptions = {}) {
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as any)?.url || '');

    // Allow custom handler to override first
    if (options.customHandler) {
      const customRes = options.customHandler(url, init);
      if (customRes !== undefined) {
        if (customRes instanceof Response) return customRes;
        return new Response(JSON.stringify(customRes), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 1. Nominatim Reverse Geocoding
    if (url.includes('nominatim.openstreetmap.org/reverse')) {
      const parsedUrl = new URL(url);
      const lat = parseFloat(parsedUrl.searchParams.get('lat') || '0');
      const lng = parseFloat(parsedUrl.searchParams.get('lon') || '0');

      if (options.nominatim?.reverseHandler) {
        const handlerRes = options.nominatim.reverseHandler(lat, lng, url);
        if (handlerRes instanceof Response) return handlerRes;
        if (handlerRes !== undefined) {
          return new Response(JSON.stringify(handlerRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Vasa in Stockholm Harbor
      if (Math.abs(lat - 59.3275) < 0.1 && Math.abs(lng - 18.0911) < 0.1) {
        return new Response(JSON.stringify({
          place_id: 11111,
          osm_type: 'node',
          osm_id: 22222,
          lat: String(lat),
          lon: String(lng),
          display_name: 'Stockholm, Sweden',
          address: {
            city: 'Stockholm',
            country: 'Sweden',
            country_code: 'se'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Lusitania off Old Head of Kinsale, Ireland (allowedCountries: ['Ireland'])
      if (Math.abs(lat - 51.3) < 0.1 && Math.abs(lng - (-8.55)) < 0.1) {
        return new Response(JSON.stringify({
          place_id: 33333,
          osm_type: 'node',
          osm_id: 44444,
          lat: String(lat),
          lon: String(lng),
          display_name: 'County Cork, Ireland',
          address: {
            county: 'County Cork',
            country: 'Ireland',
            country_code: 'ie'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Battle of Waterloo in Belgium (lat: ~50.68, lng: ~4.4116)
      if (Math.abs(lat - 50.68) < 0.1 && Math.abs(lng - 4.4116) < 0.1) {
        return new Response(JSON.stringify({
          place_id: 55555,
          osm_type: 'node',
          osm_id: 66666,
          lat: String(lat),
          lon: String(lng),
          display_name: 'Waterloo, Walloon Brabant, Belgium',
          address: {
            town: 'Waterloo',
            state: 'Walloon Brabant',
            country: 'Belgium',
            country_code: 'be'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Battle of Trafalgar off Cape Trafalgar, Spain (lat: ~36.18, lng: ~-6.03)
      if (Math.abs(lat - 36.18) < 0.1 && Math.abs(lng - (-6.03)) < 0.1) {
        return new Response(JSON.stringify({
          place_id: 77777,
          osm_type: 'node',
          osm_id: 88888,
          lat: String(lat),
          lon: String(lng),
          display_name: 'Barbate, Cádiz, Andalusia, Spain',
          address: {
            town: 'Barbate',
            state: 'Andalusia',
            country: 'Spain',
            country_code: 'es'
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Default deterministic reverse geocode response:
      // If coordinates are in deep open ocean (e.g. lat 25 lng -45, or lat -45 lng -140),
      // return a water/open area reverse geocode so geographic validation detects ocean/water.
      const isDeepOcean =
        (lat === 25 && lng === -45) ||
        (lat === -45 && lng === -140) ||
        (lat === -28.4903 && lng === 113.7933) ||
        (lat === 41.7269 && lng === -49.9483) ||
        (lat === 63.3333 && lng === -31.8333) ||
        (lat === 63.33 && lng === -31.83);

      if (isDeepOcean) {
        return new Response(JSON.stringify({
          error: 'Unable to geocode',
          display_name: 'Water / Open Area'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        place_id: 12345,
        osm_type: 'node',
        osm_id: 67890,
        lat: String(lat),
        lon: String(lng),
        display_name: 'United States',
        address: {
          country: 'United States',
          country_code: 'us'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Nominatim Search Geocoding
    if (url.includes('nominatim.openstreetmap.org/search')) {
      const parsedUrl = new URL(url);
      const q = parsedUrl.searchParams.get('q') || '';

      if (options.nominatim?.searchHandler) {
        const handlerRes = options.nominatim.searchHandler(q, url);
        if (handlerRes instanceof Response) return handlerRes;
        if (handlerRes !== undefined) {
          return new Response(JSON.stringify(handlerRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Default empty search array
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Wikipedia / Wikimedia / Wikidata
    if (
      url.includes('wikipedia.org') ||
      url.includes('wikimedia.org') ||
      url.includes('wikidata.org')
    ) {
      if (options.wikipedia?.queryHandler) {
        const handlerRes = options.wikipedia.queryHandler(url);
        if (handlerRes instanceof Response) return handlerRes;
        if (handlerRes !== undefined) {
          return new Response(JSON.stringify(handlerRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Wikidata entity search/claims
      if (url.includes('wbsearchentities')) {
        return new Response(JSON.stringify({ search: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('wbgetclaims')) {
        return new Response(JSON.stringify({ claims: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Wikimedia / Wikipedia queries
      return new Response(JSON.stringify({
        batchcomplete: '',
        query: {
          pages: {
            '1': {
              pageid: 1,
              title: 'Mock Page',
              extract: 'Mock Wikipedia extract for hermetic testing.',
              thumbnail: {
                source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Mock.jpg/800px-Mock.jpg',
                width: 800,
                height: 600
              }
            }
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Overpass API Mirrors
    if (url.includes('overpass')) {
      if (options.overpass?.responseHandler) {
        const handlerRes = options.overpass.responseHandler(url, init?.body);
        if (handlerRes instanceof Response) return handlerRes;
        if (handlerRes !== undefined) {
          return new Response(JSON.stringify(handlerRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Return 503 so osmMapDataProvider falls back to fallback data (getFallbackFeaturesForViewport)
      // or returns offline state without crashing or waiting for live servers.
      return new Response(JSON.stringify({ error: 'Overpass mock unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. Google Gemini REST API
    if (url.includes('generativelanguage.googleapis.com')) {
      if (options.gemini?.responseHandler) {
        const handlerRes = options.gemini.responseHandler(url, init?.body);
        if (handlerRes instanceof Response) return handlerRes;
        if (handlerRes !== undefined) {
          return new Response(JSON.stringify(handlerRes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    name: 'Mock Place',
                    type: 'settlement',
                    description: 'Mock description for hermetic testing.',
                    notable: [],
                    coordinates: { lat: 35.0, lng: -85.0 }
                  })
                }
              ]
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Localhost or other URLs: allow or fallback
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  vi.stubGlobal('fetch', mockFetch);
  return () => {
    vi.unstubAllGlobals();
  };
}
