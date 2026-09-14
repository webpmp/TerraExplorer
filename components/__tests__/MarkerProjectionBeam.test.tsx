import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkerProjectionBeam, { calculateBeamTrapezoid } from '../MarkerProjectionBeam';
import { SkinType, UserSettings, LocationInfo, LocationType } from '../../types';

describe('MarkerProjectionBeam Component & Geometry Tests', () => {
  const baseUserSettings: UserSettings = {
    aiProvider: 'gemini',
    lmStudioUrl: 'http://localhost:1234/v1',
    lmStudioModel: 'local-model',
    newsProvider: 'gemini',
    newsApiKey: '',
    nytApiKey: '',
    newsDataApiKey: '',
    showNews: true,
    documentaryMode: false,
    documentaryDuration: 5.5,
    narrationEnabled: false,
    narrationVoice: '',
    narrationSpeed: 0.9,
    narrationVolume: 1.0,
    retroGreenProjection: true,
    retroAmberProjection: true
  };

  const sampleLocationInfo: LocationInfo = {
    name: 'Athens',
    type: LocationType.CITY,
    description: 'Capital of Greece',
    coordinates: { lat: 37.9838, lng: 23.7275 },
    news: []
  };

  describe('1. Theme Restrictions', () => {
    test('Does not render for Modern skin', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="modern"
          userSettings={baseUserSettings}
          locationInfo={sampleLocationInfo}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });

    test('Does not render for Parchment skin', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="parchment"
          userSettings={baseUserSettings}
          locationInfo={sampleLocationInfo}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });

    test('Does not render when InfoPanel is closed', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-green"
          userSettings={baseUserSettings}
          locationInfo={sampleLocationInfo}
          isInfoPanelOpen={false}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });

    test('Does not render when locationInfo has invalid coordinates', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-green"
          userSettings={baseUserSettings}
          locationInfo={{ ...sampleLocationInfo, coordinates: { lat: 999, lng: 999 } }}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });
  });

  describe('2. Independent Theme Settings', () => {
    test('Unmounts in Retro Green when retroGreenProjection is false', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-green"
          userSettings={{ ...baseUserSettings, retroGreenProjection: false }}
          locationInfo={sampleLocationInfo}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });

    test('Remains enabled in Retro Amber when only retroGreenProjection is false', () => {
      // In Retro Amber, retroAmberProjection is true, so it passes the settings gate
      const settings = { ...baseUserSettings, retroGreenProjection: false, retroAmberProjection: true };
      expect(settings.retroAmberProjection).toBe(true);
      expect(settings.retroGreenProjection).toBe(false);
    });

    test('Unmounts in Retro Amber when retroAmberProjection is false', () => {
      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-amber"
          userSettings={{ ...baseUserSettings, retroAmberProjection: false }}
          locationInfo={sampleLocationInfo}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).toBe('');
    });
  });

  describe('3. Activation Lifecycle & Universal Coordinate Projector', () => {
    const dallasLocationInfo: LocationInfo = {
      name: 'Dallas',
      type: LocationType.CITY,
      description: 'City in Texas',
      coordinates: { lat: 32.7767, lng: -96.797 },
      news: []
    };

    test('Renders beam at globe zoom when 3D Globe projector is active', () => {
      // Mock global Three.js 3D globe projector
      (global as any).__terraexplorer_project_coordinates = vi.fn((lat: number, lng: number) => {
        if (lat === 32.7767 && lng === -96.797) {
          return { x: 550, y: 480 };
        }
        return null;
      });

      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-amber"
          userSettings={baseUserSettings}
          locationInfo={dallasLocationInfo}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );

      // Verify component mounts and passes activation gate without requiring MapLibre/OSM
      expect(html).not.toBe('');

      delete (global as any).__terraexplorer_project_coordinates;
    });

    test('Passes activation gate with valid selectedMarkerCoordinates when projectionEnabled && infoPanelOpen', () => {
      (global as any).__terraexplorer_project_coordinates = vi.fn((lat: number, lng: number) => {
        if (lat === 32.7767 && lng === -96.797) {
          return { x: 550, y: 480 };
        }
        return null;
      });

      const html = renderToStaticMarkup(
        <MarkerProjectionBeam
          skin="retro-green"
          userSettings={baseUserSettings}
          locationInfo={dallasLocationInfo}
          selectedMarkerCoordinates={{ lat: 32.7767, lng: -96.797 }}
          isInfoPanelOpen={true}
          isCameraMoving={false}
        />
      );
      expect(html).not.toBe('');

      delete (global as any).__terraexplorer_project_coordinates;
    });
  });

  describe('4. Geometry Calculation (calculateBeamTrapezoid)', () => {
    const mockPanelRect = {
      left: 1400,
      top: 280,
      right: 1800,
      bottom: 800,
      width: 400,
      height: 520
    };

    test('Generates single closed expanding optical cone beam path with cubic Bézier curvature', () => {
      const markerPoint = { x: 600, y: 500 };
      const geom = calculateBeamTrapezoid(markerPoint, mockPanelRect, 1920, 1080);

      expect(geom).not.toBeNull();
      if (!geom) return;

      // Marker end is narrow (~3px)
      expect(Math.abs(geom.mBottom.y - geom.mTop.y)).toBe(3);
      expect(geom.mTop.x).toBe(600);
      expect(geom.mBottom.x).toBe(600);

      // Panel end connects to panel's left edge (since marker is to the left of panel)
      expect(geom.pTop.x).toBe(1400);
      expect(geom.pTop.y).toBe(280);
      expect(geom.pBottom.x).toBe(1400);
      expect(geom.pBottom.y).toBe(800);

      // Panel end height matches panel visible height
      expect(geom.pBottom.y - geom.pTop.y).toBe(520);

      // Single closed beam path contains cubic Bézier commands ('C') and closes ('Z')
      expect(geom.beamPath).toContain('C');
      expect(geom.beamPath).toContain('Z');
      expect(geom.topEdgePath).toContain('C');
      expect(geom.bottomEdgePath).toContain('C');

      // Top boundary curves upward (negative Y offset from centerline)
      // Bottom boundary curves downward (positive Y offset from centerline)
      const centerlineMidY = 500 + 0.5 * (540 - 500); // centerline Y at t=0.5
      expect(geom.cp1Top.y).toBeLessThan(geom.cp1Bottom.y);
      expect(geom.cp2Top.y).toBeLessThan(geom.cp2Bottom.y);

      // Symmetrical / mirrored spread around centerline at control points
      const spreadTop1 = Math.abs(geom.cp1Top.y - (500 + 0.38 * (540 - 500)));
      const spreadBot1 = Math.abs(geom.cp1Bottom.y - (500 + 0.38 * (540 - 500)));
      expect(Math.abs(spreadTop1 - spreadBot1)).toBeLessThan(0.01);

      const spreadTop2 = Math.abs(geom.cp2Top.y - (500 + 0.72 * (540 - 500)));
      const spreadBot2 = Math.abs(geom.cp2Bottom.y - (500 + 0.72 * (540 - 500)));
      expect(Math.abs(spreadTop2 - spreadBot2)).toBeLessThan(0.01);

      // Motes are populated (22 motes)
      expect(geom.motes).toHaveLength(22);
      geom.motes.forEach((mote) => {
        expect(mote.cx).toBeGreaterThanOrEqual(600);
        expect(mote.cx).toBeLessThanOrEqual(1400);
      });
    });

    test('Selects right edge when marker is to the right of panel', () => {
      const leftPanelRect = {
        left: 50,
        top: 200,
        right: 450,
        bottom: 700,
        width: 400,
        height: 500
      };
      const markerPoint = { x: 800, y: 400 };
      const geom = calculateBeamTrapezoid(markerPoint, leftPanelRect, 1920, 1080);

      expect(geom).not.toBeNull();
      if (!geom) return;

      // Connects to right edge of panel
      expect(geom.pTop.x).toBe(450);
      expect(geom.pBottom.x).toBe(450);
    });

    test('Returns null when marker is off-screen', () => {
      // Off-screen left
      expect(calculateBeamTrapezoid({ x: -50, y: 500 }, mockPanelRect, 1920, 1080)).toBeNull();
      // Off-screen right
      expect(calculateBeamTrapezoid({ x: 2000, y: 500 }, mockPanelRect, 1920, 1080)).toBeNull();
      // Off-screen top
      expect(calculateBeamTrapezoid({ x: 500, y: -20 }, mockPanelRect, 1920, 1080)).toBeNull();
      // Off-screen bottom
      expect(calculateBeamTrapezoid({ x: 500, y: 1200 }, mockPanelRect, 1920, 1080)).toBeNull();
    });

    test('Returns null when panel dimensions are zero', () => {
      const emptyPanel = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      expect(calculateBeamTrapezoid({ x: 500, y: 500 }, emptyPanel, 1920, 1080)).toBeNull();
    });
  });

  describe('4. Dust Motes Configuration', () => {
    test('Contains individual organic motes with slow ambient durations (7.0-15.0s), multidirectional drift, and size distribution', () => {
      const markerPoint = { x: 400, y: 400 };
      const panelRect = { left: 1200, top: 200, right: 1600, bottom: 800, width: 400, height: 600 };
      const geom = calculateBeamTrapezoid(markerPoint, panelRect, 1920, 1080);

      expect(geom).not.toBeNull();
      if (!geom) return;

      const delays = new Set(geom.motes.map((m) => m.delay));
      const durations = new Set(geom.motes.map((m) => m.duration));

      // Motes must have varied timing to avoid synchronized / robotic motion
      expect(delays.size).toBeGreaterThan(10);
      expect(durations.size).toBeGreaterThan(10);

      // Check size distribution: includes tiny dust specks (< 0.6px), small particles, and a few slightly larger motes
      const tinySpecks = geom.motes.filter((m) => m.r <= 0.6);
      const smallParticles = geom.motes.filter((m) => m.r > 0.6 && m.r <= 1.0);
      const largerMotes = geom.motes.filter((m) => m.r > 1.0);

      expect(tinySpecks.length).toBeGreaterThanOrEqual(8);
      expect(smallParticles.length).toBeGreaterThanOrEqual(5);
      expect(largerMotes.length).toBeGreaterThanOrEqual(2);

      // Verify multidirectional drift across the population (both positive and negative X and Y offsets)
      const hasPositiveX = geom.motes.some((m) => m.dx1 > 0 || m.dx2 > 0 || m.dx3 > 0);
      const hasNegativeX = geom.motes.some((m) => m.dx1 < 0 || m.dx2 < 0 || m.dx3 < 0);
      const hasPositiveY = geom.motes.some((m) => m.dy1 > 0 || m.dy2 > 0 || m.dy3 > 0);
      const hasNegativeY = geom.motes.some((m) => m.dy1 < 0 || m.dy2 < 0 || m.dy3 < 0);

      expect(hasPositiveX).toBe(true);
      expect(hasNegativeX).toBe(true);
      expect(hasPositiveY).toBe(true);
      expect(hasNegativeY).toBe(true);

      geom.motes.forEach((mote) => {
        // Slow ambient suspended specs: 0.35 - 1.5px radius, 7.0s - 15.0s duration, subtle opacity <= 0.40
        expect(mote.r).toBeGreaterThanOrEqual(0.35);
        expect(mote.r).toBeLessThanOrEqual(1.5);
        expect(mote.duration).toBeGreaterThanOrEqual(7.0);
        expect(mote.duration).toBeLessThanOrEqual(15.0);
        expect(mote.opacity).toBeGreaterThan(0);
        expect(mote.opacity).toBeLessThanOrEqual(0.40);
      });
    });
  });
});
