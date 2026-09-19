import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateRoute, SOURCE_RETRIEVAL_ERROR_MESSAGE } from '../geminiService';
import { extractReadableArticleText, formatSourceBlock } from '../sourceContentService';
import { runRoutePipeline } from '../routePipeline';

describe('TRACE ROUTE Source Grounding & Content Acquisition', () => {
  const originalLocalStorage = global.localStorage;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockStorage: Record<string, string> = {
      'terraExplorerSettings': JSON.stringify({
        aiProvider: 'lmstudio',
        lmStudioEndpoint: 'http://localhost:1234',
        lmStudioModel: 'qwen2.5-7b-instruct-1m'
      })
    };
    global.localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => {}
    } as any;

    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('nominatim.openstreetmap.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => []
        } as any;
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({})
      } as any;
    });
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. Source Acquisition Layer', () => {
    it('extracts clean readable text from HTML stripping scripts, styles, navigation, headers, footers and ads', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>36 Hours in Lake Como - The New York Times</title>
            <style>.banner { color: red; }</style>
            <script>console.log('tracker');</script>
          </head>
          <body>
            <header><nav>Home | Travel | Places</nav></header>
            <div class="cookie-banner">Accept cookies</div>
            <article>
              <h1>36 Hours in Lake Como</h1>
              <p>Nestled in the foothills of the Alps, Lake Como offers picturesque towns.</p>
              <p>In Bellagio, visitors explore Villa Melzi gardens overlooking the sparkling waters.</p>
              <p>6 p.m. Get on board a wooden boat to cruise the tranquil lake.</p>
            </article>
            <div class="advertisement">Buy luxury watches</div>
            <footer>Copyright 2026 The New York Times</footer>
          </body>
        </html>
      `;

      const { title, content } = extractReadableArticleText(sampleHtml);
      expect(title).toBe('36 Hours in Lake Como');
      expect(content).toContain('36 Hours in Lake Como');
      expect(content).toContain('In Bellagio, visitors explore Villa Melzi gardens');
      expect(content).not.toContain('console.log');
      expect(content).not.toContain('Accept cookies');
      expect(content).not.toContain('Buy luxury watches');
      expect(content).not.toContain('Copyright 2026');
    });

    it('formats source context block with clear delimiters', () => {
      const block = formatSourceBlock({
        url: 'https://example.com/como',
        title: 'Lake Como Guide',
        content: 'Bellagio is a village on a promontory.'
      });

      expect(block).toContain('SOURCE URL:\nhttps://example.com/como');
      expect(block).toContain('SOURCE TITLE:\nLake Como Guide');
      expect(block).toContain('SOURCE CONTENT:\n--- BEGIN SOURCE CONTENT ---');
      expect(block).toContain('Bellagio is a village on a promontory.');
      expect(block).toContain('--- END SOURCE CONTENT ---');
    });

    it('fails explicitly with clear error when URL retrieval fails and does not call LM Studio', async () => {
      // Mock fetch failing with CORS / network error
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const mockGenerateFn = vi.fn();

      await expect(
        generateRoute(
          'https://www.nytimes.com/interactive/2026/09/17/travel/things-to-do-lake-como.html',
          undefined,
          mockGenerateFn
        )
      ).rejects.toThrow(SOURCE_RETRIEVAL_ERROR_MESSAGE);

      expect(mockGenerateFn).not.toHaveBeenCalled();
    });

    it('passes acquired source content to Stage 1 prompt when URL retrieval succeeds', async () => {
      const sampleArticle = `
        <html>
          <head><title>Things to Do in Lake Como</title></head>
          <body>
            <article>
              <p>Lake Como is famous for its stunning lakeside towns.</p>
              <p>The picturesque village of Bellagio is known as the pearl of the lake.</p>
              <p>Visitors can tour historic villas along the shoreline.</p>
            </article>
          </body>
        </html>
      `;

      global.fetch = vi.fn().mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('nominatim.openstreetmap.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => []
          } as any;
        }
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticle,
          json: async () => ({})
        } as any;
      });

      let capturedPrompt = '';
      const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
        capturedPrompt = params.contents;
        return {
          text: JSON.stringify({
            title: 'Lake Como Visit',
            routeType: 'single_location',
            route: [
              {
                id: 'bellagio',
                name: 'Bellagio',
                lat: 45.987,
                lng: 9.262,
                sourceEvidence: 'The picturesque village of Bellagio is known as the pearl of the lake.'
              }
            ]
          })
        };
      });

      const route = await generateRoute(
        'https://example.com/lake-como-article',
        undefined,
        mockGenerateFn
      );

      expect(capturedPrompt).toContain('SOURCE CONTENT:');
      expect(capturedPrompt).toContain('The picturesque village of Bellagio is known as the pearl of the lake.');
      expect(route.waypoints.length).toBe(1);
      expect(route.waypoints[0].name).toBe('Bellagio');
    });
  });

  describe('2. Generic Prompt Decontamination', () => {
    it('ensures generic Stage 1 prompt contains NO hardcoded Trail of Tears waypoint examples', async () => {
      let capturedPrompt = '';
      const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
        capturedPrompt = params.contents;
        return {
          text: JSON.stringify({
            title: 'Test Query',
            routeType: 'point',
            route: []
          })
        };
      });

      await generateRoute('Things to do in Lake Como', undefined, mockGenerateFn);

      expect(capturedPrompt).not.toContain('New Echota');
      expect(capturedPrompt).not.toContain('Fort Cass');
      expect(capturedPrompt).not.toContain("Gunter's Landing");
      expect(capturedPrompt).not.toContain("Ross's Landing");
      expect(capturedPrompt).not.toContain('Fort Coffee');
    });
  });

  describe('3. Source Grounding & Deterministic Evidence Validation', () => {
    it('accepts supported source locations and rejects unsupported hallucinated locations even if model provides fake sourceEvidence', async () => {
      const sourceText = 'We visited the scenic village of Bellagio overlooking Lake Como.';

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'Lake Como Tour',
        routeType: 'single_location',
        metadata: { sourceText },
        waypoints: [
          {
            id: 'bellagio',
            name: 'Bellagio',
            canonicalName: 'Bellagio',
            lat: 45.987,
            lng: 9.262,
            sourceEvidence: 'scenic village of Bellagio'
          },
          {
            id: 'menaggio',
            name: 'Menaggio',
            canonicalName: 'Menaggio',
            lat: 46.02,
            lng: 9.23,
            sourceEvidence: 'The article mentions visiting Menaggio nearby.' // Fabricated evidence!
          }
        ]
      });

      const result = await runRoutePipeline('Lake Como Tour', false, mockGenerateRawRoute);

      expect(result.waypoints.map(w => w.name)).toContain('Bellagio');
      expect(result.waypoints.map(w => w.name)).not.toContain('Menaggio');
      expect(result.waypoints.length).toBe(1);
    });
  });

  describe('4. Itinerary / Activity Contamination Prevention', () => {
    it('rejects schedule time slots, editorial headlines, and itinerary actions from becoming waypoint identities', async () => {
      const sourceText = `
        36 Hours in Lake Como
        Master the Art of Breakfast: Enjoy fresh pastries.
        Stroll Storied Sites: Visit historical monuments in Bellagio.
        Savor the View: Look out from the hills of Varenna.
        Pick Up Local Provisions: Cheese and olive oil from local shops.
        Dine Somewhere Different: An intimate dinner.
        Get Lost in Gardens: Explore Villa Melzi.
        Wander a Quieter Coastal Town: Discover Menaggio.
        Village Hop: Take the ferry across the water.
        Dine Dockside: Lake fish at sunset.
        Lake Como Tourist Route: A complete itinerary.
        10:30 AM: Morning coffee.
      `;

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: '36 Hours in Lake Como',
        routeType: 'multi_location_campaign',
        metadata: { sourceText },
        waypoints: [
          { id: 'master-the-art-of-breakfast', name: 'Master the Art of Breakfast', lat: 45.987, lng: 9.262, sourceEvidence: 'Master the Art of Breakfast' },
          { id: 'stroll-storied-sites', name: 'Stroll Storied Sites', lat: 45.987, lng: 9.262, sourceEvidence: 'Stroll Storied Sites' },
          { id: 'savor-the-view', name: 'Savor the View', lat: 46.01, lng: 9.28, sourceEvidence: 'Savor the View' },
          { id: 'pick-up-local-provisions', name: 'Pick Up Local Provisions', lat: 45.987, lng: 9.262, sourceEvidence: 'Pick Up Local Provisions' },
          { id: 'dine-somewhere-different', name: 'Dine Somewhere Different', lat: 45.987, lng: 9.262, sourceEvidence: 'Dine Somewhere Different' },
          { id: 'get-lost-in-gardens', name: 'Get Lost in Gardens', lat: 45.987, lng: 9.262, sourceEvidence: 'Get Lost in Gardens' },
          { id: 'wander-a-quieter-coastal-town', name: 'Wander a Quieter Coastal Town', lat: 46.02, lng: 9.23, sourceEvidence: 'Wander a Quieter Coastal Town' },
          { id: 'village-hop', name: 'Village Hop', lat: 45.987, lng: 9.262, sourceEvidence: 'Village Hop' },
          { id: 'dine-dockside', name: 'Dine Dockside', lat: 45.987, lng: 9.262, sourceEvidence: 'Dine Dockside' },
          { id: 'lake-como-tourist-route', name: 'Lake Como Tourist Route', lat: 45.987, lng: 9.262, sourceEvidence: 'Lake Como Tourist Route' },
          { id: '10-30-am', name: '10:30 AM', lat: 45.987, lng: 9.262, sourceEvidence: '10:30 AM' },
          { id: 'bellagio', name: 'Bellagio', canonicalName: 'Bellagio', lat: 45.987, lng: 9.262, sourceEvidence: 'historical monuments in Bellagio' },
          { id: 'varenna', name: 'Varenna', canonicalName: 'Varenna', lat: 46.01, lng: 9.28, sourceEvidence: 'hills of Varenna' },
          { id: 'menaggio', name: 'Menaggio', canonicalName: 'Menaggio', lat: 46.02, lng: 9.23, sourceEvidence: 'Discover Menaggio' }
        ]
      });

      const result = await runRoutePipeline('36 Hours in Lake Como', false, mockGenerateRawRoute);

      const resultingNames = result.waypoints.map(w => w.name);
      expect(resultingNames).not.toContain('Master the Art of Breakfast');
      expect(resultingNames).not.toContain('Stroll Storied Sites');
      expect(resultingNames).not.toContain('Savor the View');
      expect(resultingNames).not.toContain('Pick Up Local Provisions');
      expect(resultingNames).not.toContain('Dine Somewhere Different');
      expect(resultingNames).not.toContain('Get Lost in Gardens');
      expect(resultingNames).not.toContain('Wander a Quieter Coastal Town');
      expect(resultingNames).not.toContain('Village Hop');
      expect(resultingNames).not.toContain('Dine Dockside');
      expect(resultingNames).not.toContain('Lake Como Tourist Route');
      expect(resultingNames).not.toContain('10:30 AM');

      expect(resultingNames).toContain('Bellagio');
      expect(resultingNames).toContain('Varenna');
      expect(resultingNames).toContain('Menaggio');
      expect(result.waypoints.length).toBe(3);
    });
  });

  describe('5. Pasted Article Input Handling', () => {
    it('passes pasted article text directly into prompt and Stage 3 grounding metadata', async () => {
      const pastedArticle = `Lake Como Travel Diary: We began our journey in Varenna, admiring the colorful pastel houses. Later in the afternoon, we took a passenger ferry to Bellagio where we stayed overnight. No other towns were visited during this excursion. The end of this lovely trip in Lombardy.`;

      let capturedPrompt = '';
      const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
        capturedPrompt = params.contents;
        return {
          text: JSON.stringify({
            title: 'Lake Como Excursion',
            routeType: 'multi_location_campaign',
            route: [
              {
                id: 'varenna',
                name: 'Varenna',
                lat: 46.01,
                lng: 9.28,
                sourceEvidence: 'We began our journey in Varenna'
              },
              {
                id: 'bellagio',
                name: 'Bellagio',
                lat: 45.987,
                lng: 9.262,
                sourceEvidence: 'ferry to Bellagio where we stayed overnight'
              },
              {
                id: 'stresa',
                name: 'Stresa',
                lat: 45.88,
                lng: 8.53,
                sourceEvidence: 'Stresa town center' // Not in text!
              }
            ]
          })
        };
      });

      const result = await generateRoute(pastedArticle, undefined, mockGenerateFn);

      expect(capturedPrompt).toContain('SOURCE CONTENT:');
      expect(capturedPrompt).toContain('We began our journey in Varenna');
      expect(capturedPrompt).toContain('MANDATORY PHYSICAL ENTITY EXTRACTION RULES:');
      expect(result.waypoints.map(w => w.name)).toContain('Varenna');
      expect(result.waypoints.map(w => w.name)).toContain('Bellagio');
      expect(result.waypoints.map(w => w.name)).not.toContain('Stresa');
    });

    it('unwraps real places from activity headings like "Get On Board (Villa Melzi)" and preserves physical entity', async () => {
      const sourceText = `
        Lake Como Guide:
        Get On Board (Villa Melzi): Tour the neoclassical grounds of Villa Melzi in Bellagio.
        Savor the View: Look out from Una Finestra sul Lago.
      `;

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'Lake Como Guide',
        routeType: 'regional_event',
        routeEvidenceMode: 'REGIONAL_EVENT',
        isSequential: false,
        metadata: { sourceText },
        waypoints: [
          {
            id: 'get-on-board-villa-melzi',
            name: 'Get On Board (Villa Melzi)',
            canonicalName: 'Villa Melzi',
            lat: 45.982,
            lng: 9.258,
            sourceEvidence: 'grounds of Villa Melzi in Bellagio'
          },
          {
            id: 'savor-the-view',
            name: 'Savor the View (Una Finestra sul Lago)',
            canonicalName: 'Una Finestra sul Lago',
            lat: 45.912,
            lng: 9.123,
            sourceEvidence: 'Look out from Una Finestra sul Lago'
          }
        ]
      });

      const result = await runRoutePipeline('Lake Como Guide', false, mockGenerateRawRoute);

      const names = result.waypoints.map(w => w.name);
      expect(names).not.toContain('Get On Board (Villa Melzi)');
      expect(names).not.toContain('Savor the View (Una Finestra sul Lago)');
      expect(names).toContain('Villa Melzi');
      expect(names).toContain('Una Finestra sul Lago');
      expect(result.isSequential).toBe(false);
    });

    it('does not classify a travel recommendation article as DOCUMENTED_ROUTE or invent sequential route closure', async () => {
      const sourceText = `
        A Weekend on Lake Como:
        Visit the historic village of Bellagio.
        Explore the quiet alleys of Varenna across the water.
        Take a stroll in Menaggio on the western shore.
      `;

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'Lake Como Highlights',
        routeType: 'regional_event',
        routeEvidenceMode: 'REGIONAL_EVENT',
        isSequential: false,
        metadata: { sourceText },
        waypoints: [
          {
            id: 'bellagio',
            name: 'Bellagio',
            canonicalName: 'Bellagio',
            lat: 45.987,
            lng: 9.262,
            sourceEvidence: 'historic village of Bellagio'
          },
          {
            id: 'varenna',
            name: 'Varenna',
            canonicalName: 'Varenna',
            lat: 46.01,
            lng: 9.28,
            sourceEvidence: 'quiet alleys of Varenna'
          },
          {
            id: 'menaggio',
            name: 'Menaggio',
            canonicalName: 'Menaggio',
            lat: 46.02,
            lng: 9.23,
            sourceEvidence: 'stroll in Menaggio'
          }
        ]
      });

      const result = await runRoutePipeline('Lake Como Highlights', false, mockGenerateRawRoute);

      expect(result.routeEvidenceMode).toBe('REGIONAL_EVENT');
      expect(result.isSequential).toBe(false);
      expect(result.waypoints.length).toBe(3);
    });
  });

  describe('6. Entity-First Coordinate Resolution & Duplicate-Coordinate Safeguard', () => {
    it('independently resolves multiple distinct entities that received identical model coordinates', async () => {
      const sourceText = 'We visited Paris and Amsterdam on our European vacation.';

      // Model provided the exact same guessed coordinate for two completely distinct cities
      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'European Vacation',
        routeType: 'regional_event',
        routeEvidenceMode: 'REGIONAL_EVENT',
        isSequential: false,
        metadata: { sourceText },
        waypoints: [
          {
            id: 'paris',
            name: 'Paris',
            canonicalName: 'Paris',
            lat: 45.7169, // Guessed duplicate
            lng: 9.2640,
            sourceEvidence: 'visited Paris'
          },
          {
            id: 'amsterdam',
            name: 'Amsterdam',
            canonicalName: 'Amsterdam',
            lat: 45.7169, // Guessed duplicate
            lng: 9.2640,
            sourceEvidence: 'and Amsterdam'
          }
        ]
      });

      const result = await runRoutePipeline('European Vacation', false, mockGenerateRawRoute);

      expect(result.waypoints.length).toBe(2);
      const parisWp = result.waypoints.find(w => w.name.includes('Paris'));
      const amsterdamWp = result.waypoints.find(w => w.name.includes('Amsterdam'));

      expect(parisWp).toBeDefined();
      expect(amsterdamWp).toBeDefined();

      // Verified resolved coordinates from DETERMINISTIC_LOCATION_DB / Resolver
      expect(parisWp!.lat).toBeCloseTo(48.8566, 2);
      expect(parisWp!.lng).toBeCloseTo(2.3522, 2);
      expect(amsterdamWp!.lat).toBeCloseTo(52.3676, 2);
      expect(amsterdamWp!.lng).toBeCloseTo(4.9041, 2);

      // Coordinates MUST NOT be identical
      expect(parisWp!.lat).not.toBe(amsterdamWp!.lat);
      expect(parisWp!.lng).not.toBe(amsterdamWp!.lng);
    });

    it('rejects an entity with duplicate guessed coordinates when geographic resolver cannot corroborate it', async () => {
      const sourceText = 'We stopped by Paris and a fictional place called NowherePlaza.';

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'Mixed Vacation',
        routeType: 'regional_event',
        routeEvidenceMode: 'REGIONAL_EVENT',
        isSequential: false,
        metadata: { sourceText },
        waypoints: [
          {
            id: 'paris',
            name: 'Paris',
            canonicalName: 'Paris',
            lat: 45.7169, // Guessed duplicate
            lng: 9.2640,
            sourceEvidence: 'stopped by Paris'
          },
          {
            id: 'nowhere-plaza',
            name: 'NowherePlaza',
            canonicalName: 'NowherePlaza',
            lat: 45.7169, // Guessed duplicate
            lng: 9.2640,
            sourceEvidence: 'NowherePlaza'
          }
        ]
      });

      const result = await runRoutePipeline('Mixed Vacation', false, mockGenerateRawRoute);

      const names = result.waypoints.map(w => w.name);
      expect(names.some(n => n.includes('Paris'))).toBe(true);
      expect(names.some(n => n.includes('NowherePlaza'))).toBe(false);
      expect(result.waypoints.length).toBe(1);
    });

    it('populates trusted coordinates for physical entities with missing (0,0) model coordinates in document mode', async () => {
      const sourceText = 'We enjoyed our stay in Boston.';

      const mockGenerateRawRoute = vi.fn().mockResolvedValue({
        title: 'Boston Trip',
        routeType: 'single_location',
        routeEvidenceMode: 'REGIONAL_EVENT',
        isSequential: false,
        metadata: { sourceText },
        waypoints: [
          {
            id: 'boston',
            name: 'Boston',
            canonicalName: 'Boston',
            lat: 0,
            lng: 0,
            sourceEvidence: 'stay in Boston'
          }
        ]
      });

      const result = await runRoutePipeline('Boston Trip', false, mockGenerateRawRoute);

      expect(result.waypoints.length).toBe(1);
      expect(result.waypoints[0].name).toContain('Boston');
      expect(result.waypoints[0].lat).toBeCloseTo(42.3601, 2);
      expect(result.waypoints[0].lng).toBeCloseTo(-71.0589, 2);
    });
  });
});
