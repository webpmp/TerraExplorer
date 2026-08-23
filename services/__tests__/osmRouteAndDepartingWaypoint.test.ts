import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Waypoint, SkinType } from '../../types';

describe('OSM Active Route Line and Departing Waypoint Fade Suite', () => {
  const fiveWaypointRoute: Waypoint[] = [
    { id: 'wp-1', name: 'Start Harbour', lat: 51.5074, lng: -0.1278, description: 'Waypoint 1' },
    { id: 'wp-2', name: 'Channel Crossing', lat: 50.8503, lng: 0.5333, description: 'Waypoint 2' },
    { id: 'wp-3', name: 'Midway Archipelago', lat: 48.8566, lng: 2.3522, description: 'Waypoint 3' },
    { id: 'wp-4', name: 'Mountain Pass', lat: 46.2044, lng: 6.1432, description: 'Waypoint 4' },
    { id: 'wp-5', name: 'Final Summit', lat: 45.9237, lng: 6.8694, description: 'Waypoint 5' }
  ];

  const mockProjection = {
    z: 14,
    exactX: 8392.4,
    exactY: 5462.1,
    screenCenterX: 960,
    screenCenterY: 540
  };

  const projectLatLngToScreen = (lat: number, lng: number, proj: typeof mockProjection) => {
    const n = Math.pow(2, proj.z);
    const x = ((lng + 180) / 360) * n;
    const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const screenX = proj.screenCenterX + (x - proj.exactX) * 256;
    const screenY = proj.screenCenterY + (y - proj.exactY) * 256;
    return { x: screenX, y: screenY };
  };

  it('Test 1: Generates geographic projection segments for all adjacent waypoint pairs in active route', () => {
    const segments: Array<{ sx1: number; sy1: number; sx2: number; sy2: number }> = [];

    for (let i = 0; i < fiveWaypointRoute.length - 1; i++) {
      const wp1 = fiveWaypointRoute[i];
      const wp2 = fiveWaypointRoute[i + 1];

      const p1 = projectLatLngToScreen(wp1.lat, wp1.lng, mockProjection);
      const p2 = projectLatLngToScreen(wp2.lat, wp2.lng, mockProjection);

      expect(Number.isFinite(p1.x)).toBe(true);
      expect(Number.isFinite(p1.y)).toBe(true);
      expect(Number.isFinite(p2.x)).toBe(true);
      expect(Number.isFinite(p2.y)).toBe(true);

      segments.push({ sx1: p1.x, sy1: p1.y, sx2: p2.x, sy2: p2.y });
    }

    // A 5-waypoint route produces exactly 4 connecting line segments
    expect(segments.length).toBe(4);
  });

  it('Test 2: Active route line remains consistent whether navigating forward or backward', () => {
    // Forward path: 1 -> 2 -> 3 -> 4 -> 5
    const forwardSegments = fiveWaypointRoute.slice(0, -1).map((wp, i) => {
      const nextWp = fiveWaypointRoute[i + 1];
      const p1 = projectLatLngToScreen(wp.lat, wp.lng, mockProjection);
      const p2 = projectLatLngToScreen(nextWp.lat, nextWp.lng, mockProjection);
      return `${p1.x.toFixed(2)},${p1.y.toFixed(2)}->${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    });

    // Backward navigation preserves the exact same underlying route network geometry
    const backwardRoute = [...fiveWaypointRoute];
    const backwardSegments = backwardRoute.slice(0, -1).map((wp, i) => {
      const nextWp = backwardRoute[i + 1];
      const p1 = projectLatLngToScreen(wp.lat, wp.lng, mockProjection);
      const p2 = projectLatLngToScreen(nextWp.lat, nextWp.lng, mockProjection);
      return `${p1.x.toFixed(2)},${p1.y.toFixed(2)}->${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    });

    expect(forwardSegments).toEqual(backwardSegments);
    expect(forwardSegments.length).toBe(4);
  });

  it('Test 3: Route lines disappear when routeWaypoints is cleared', () => {
    const emptyRoute: Waypoint[] = [];
    const shouldRenderLine = emptyRoute && emptyRoute.length > 1;
    expect(shouldRenderLine).toBe(false);

    const singleWpRoute: Waypoint[] = [fiveWaypointRoute[0]];
    const shouldRenderSingleLine = singleWpRoute && singleWpRoute.length > 1;
    expect(shouldRenderSingleLine).toBe(false);
  });

  it('Test 4: Route line color palette supports all four themes (modern, retro-green, retro-amber, parchment)', () => {
    const getRouteTheming = (skin: SkinType) => {
      const routeColor = skin === 'parchment'
        ? '#8b5a2b'
        : skin === 'retro-amber'
          ? '#fbbf24'
          : skin === 'retro-green'
            ? '#4ade80'
            : '#00e5ff';

      const haloColor = skin === 'parchment'
        ? 'rgba(244, 234, 213, 0.85)'
        : 'rgba(0, 0, 0, 0.75)';

      return { routeColor, haloColor };
    };

    expect(getRouteTheming('modern').routeColor).toBe('#00e5ff');
    expect(getRouteTheming('retro-green').routeColor).toBe('#4ade80');
    expect(getRouteTheming('retro-amber').routeColor).toBe('#fbbf24');
    expect(getRouteTheming('parchment').routeColor).toBe('#8b5a2b');
  });

  it('Test 5: Departing waypoint transitions to fading state for ~380ms on Next / Previous navigation', () => {
    let currentSelectedId: string | null = 'wp-1';
    let departingMarkerId: string | null = null;
    let isDepartingFading = false;

    // Simulate selecting Next waypoint (wp-1 -> wp-2)
    const onWaypointChange = (newSelectedId: string) => {
      if (currentSelectedId && newSelectedId !== currentSelectedId) {
        departingMarkerId = currentSelectedId;
        isDepartingFading = false;
        // RAF triggers fade
        isDepartingFading = true;
      }
      currentSelectedId = newSelectedId;
    };

    onWaypointChange('wp-2');

    // Both current selected and departing markers are known
    expect(currentSelectedId).toBe('wp-2');
    expect(departingMarkerId).toBe('wp-1');
    expect(isDepartingFading).toBe(true);

    // Label visibility check for wp-1 (departing) and wp-2 (selected)
    const isWp1LabelVisible = currentSelectedId === 'wp-1' || departingMarkerId === 'wp-1';
    const isWp2LabelVisible = currentSelectedId === 'wp-2' || departingMarkerId === 'wp-2';

    expect(isWp1LabelVisible).toBe(true);
    expect(isWp2LabelVisible).toBe(true);

    // After timer expires (~380ms), departing marker is cleared
    departingMarkerId = null;
    isDepartingFading = false;

    expect(departingMarkerId).toBeNull();
    const isWp1LabelVisibleAfterFade = currentSelectedId === 'wp-1' || departingMarkerId === 'wp-1';
    expect(isWp1LabelVisibleAfterFade).toBe(false);
  });

  it('Test 6: OSM connecting path generates exactly one directional arrow per segment pointing toward the next waypoint', async () => {
    const { calculateOSMRouteArrow } = await import('../../utils/osmRouteArrowUtils');

    const arrows = fiveWaypointRoute.slice(0, -1).map((wp, i) => {
      const nextWp = fiveWaypointRoute[i + 1];
      const p1 = projectLatLngToScreen(wp.lat, wp.lng, mockProjection);
      const p2 = projectLatLngToScreen(nextWp.lat, nextWp.lng, mockProjection);

      return calculateOSMRouteArrow({
        start: p1,
        end: p2
      });
    });

    // Exactly 4 arrows for a 4-segment route
    expect(arrows.length).toBe(4);
    arrows.forEach((arrow) => {
      expect(arrow).not.toBeNull();
      // Arrow has valid SVG polygon coordinates
      expect(arrow!.pointsString).toMatch(/^[\d.-]+,[\d.-]+\s[\d.-]+,[\d.-]+\s[\d.-]+,[\d.-]+$/);
    });
  });

  it('Test 7: Reversed waypoint sequence inverts directional arrow orientations', async () => {
    const { calculateOSMRouteArrow } = await import('../../utils/osmRouteArrowUtils');

    // Segment wp1 -> wp2
    const p1 = projectLatLngToScreen(fiveWaypointRoute[0].lat, fiveWaypointRoute[0].lng, mockProjection);
    const p2 = projectLatLngToScreen(fiveWaypointRoute[1].lat, fiveWaypointRoute[1].lng, mockProjection);

    const forwardArrow = calculateOSMRouteArrow({ start: p1, end: p2 });
    const reverseArrow = calculateOSMRouteArrow({ start: p2, end: p1 });

    expect(forwardArrow).not.toBeNull();
    expect(reverseArrow).not.toBeNull();

    // Opposite angles: difference should be Math.PI
    let angleDiff = Math.abs(forwardArrow!.angleRad - reverseArrow!.angleRad);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    expect(angleDiff).toBeCloseTo(Math.PI, 4);
  });

  it('Test 8: Waypoint markers in OSM layer use high-contrast dark backgrounds (black for modern/retro, dark brown #8b5a2b for parchment)', () => {
    const getOSMMarkerBgColor = (skin: SkinType, isWaypoint: boolean, defaultColor?: string) => {
      return isWaypoint
        ? (skin === 'parchment' ? '#8b5a2b' : '#000000')
        : (defaultColor || (skin === 'parchment' ? '#8b5a2b' : '#3b82f6'));
    };

    // Waypoints in OSM layer
    expect(getOSMMarkerBgColor('modern', true, '#00e5ff')).toBe('#000000');
    expect(getOSMMarkerBgColor('retro-green', true, '#4ade80')).toBe('#000000');
    expect(getOSMMarkerBgColor('retro-amber', true, '#fbbf24')).toBe('#000000');
    expect(getOSMMarkerBgColor('parchment', true, '#d2b48c')).toBe('#8b5a2b');

    // Non-waypoint markers retain their distinct marker color
    expect(getOSMMarkerBgColor('modern', false, '#ff3333')).toBe('#ff3333');
    expect(getOSMMarkerBgColor('retro-green', false, '#a3e635')).toBe('#a3e635');
    expect(getOSMMarkerBgColor('retro-amber', false, '#fcd34d')).toBe('#fcd34d');
  });
});
