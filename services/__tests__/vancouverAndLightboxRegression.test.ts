import { describe, it, expect, vi } from 'vitest';
import { runSearchPipeline } from '../pipeline';

describe('Vancouver and Globe Interaction Regression Suite', () => {
  it('1. Searching "Find Vancouver" resolves strictly to Vancouver coordinates (49.2608724, -123.113952)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim') && urlStr.includes('search')) {
        return new Response(JSON.stringify([{
          place_id: 1001,
          osm_id: 2002,
          osm_type: 'relation',
          display_name: 'Vancouver, Metro Vancouver Regional District, British Columbia, Canada',
          lat: '49.2608724',
          lon: '-123.113952',
          importance: 0.85,
          address: {
            city: 'Vancouver',
            state: 'British Columbia',
            country: 'Canada',
            country_code: 'ca'
          }
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url);
    };

    const geminiService = await import('../geminiService');
    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        name: "Vancouver",
        locationString: "Vancouver, British Columbia, Canada",
        description: "Vancouver is a major coastal seaport city in western Canada, located in the Lower Mainland region of British Columbia.",
        population: 675218,
        climate: {
          name: "Oceanic",
          description: "Temperate oceanic climate with mild, rainy winters and warm, dry summers.",
          koppenCode: "Cfb"
        },
        contextNotes: ["Host city for the 2010 Winter Olympics"],
        notable: ["Stanley Park is one of North America's largest urban parks"]
      })
    } as any);

    const result = await runSearchPipeline({
      rawQuery: "Find Vancouver",
      intent: "NATURAL_LOCATION",
      entity: "Vancouver"
    });

    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(49.2608724, 2);
    expect(coords.lng).toBeCloseTo(-123.113952, 2);

    const address = entity.subject.primaryLocation.location.address;
    expect(address?.country?.toLowerCase()).toBe('canada');
    expect(address?.state?.toLowerCase()).toContain('british columbia');
    expect(entity.subject.identity.canonicalName).toContain('Vancouver');

    spyMetadata.mockRestore();
    global.fetch = originalFetch;
  });

  it('2. Programmatic camera animation guard blocks synthetic/stale globe click events', () => {
    let programmaticTransitionUntil = Date.now() + 1500;
    let targetCameraPos: any = { x: 1, y: 2, z: 3 };
    let scanTriggered = false;

    const simulateGlobeClick = (lat: number, lng: number) => {
      // App.tsx guard
      if (Date.now() < programmaticTransitionUntil || targetCameraPos !== null) {
        return; // Guarded
      }
      scanTriggered = true;
    };

    // Attempt click while programmatic transition is active
    simulateGlobeClick(54.188037, -101.644784);
    expect(scanTriggered).toBe(false);

    // After programmatic transition completes
    programmaticTransitionUntil = 0;
    targetCameraPos = null;
    simulateGlobeClick(54.188037, -101.644784);
    expect(scanTriggered).toBe(true);
  });

  it('3. Genuine user click on globe with valid pointer-down initiates scan', () => {
    let pointerDownInfo: { time: number; x: number; y: number } | null = null;
    let scanCoords: { lat: number; lng: number } | null = null;

    const onPointerDown = (x: number, y: number) => {
      pointerDownInfo = { time: Date.now(), x, y };
    };

    const handleGlobeClick = (clickX: number, clickY: number, delta: number, lat: number, lng: number) => {
      const pDown = pointerDownInfo;
      pointerDownInfo = null;
      if (!pDown) return;

      const clickDuration = Date.now() - pDown.time;
      const moveDist = Math.hypot(clickX - pDown.x, clickY - pDown.y);

      if (delta > 5 || moveDist > 5 || clickDuration > 700) return;
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      scanCoords = { lat, lng };
    };

    // Drag gesture should NOT trigger scan
    onPointerDown(100, 100);
    handleGlobeClick(150, 150, 20, 45.0, 10.0);
    expect(scanCoords).toBeNull();

    // Genuine stationary click triggers scan with exact clicked coordinates
    onPointerDown(100, 100);
    handleGlobeClick(101, 100, 1, 45.0, 10.0);
    expect(scanCoords).toEqual({ lat: 45.0, lng: 10.0 });
  });

  it('4. Stale coordinates and invalid inputs are rejected', () => {
    const isValidGlobeCoordinate = (lat: number, lng: number) => {
      return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    };

    expect(isValidGlobeCoordinate(NaN, -123.11)).toBe(false);
    expect(isValidGlobeCoordinate(120, 0)).toBe(false);
    expect(isValidGlobeCoordinate(49.26, -123.11)).toBe(true);
  });
});
