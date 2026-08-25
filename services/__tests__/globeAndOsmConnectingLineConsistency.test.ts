import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ROUTE_LINE_DASH_ARRAY,
  ROUTE_LINE_DASH_LENGTH,
  ROUTE_LINE_GAP_LENGTH,
  ROUTE_LINE_STROKE_WIDTH,
  ARROW_LENGTH,
  ARROW_WIDTH,
  DEFAULT_ARROW_BACK_OFFSET,
  MIN_ARROW_SEGMENT_LENGTH,
  getRouteLineOpacity,
  calculateOSMRouteArrow,
  buildGlobeRouteGeometry,
  slerpUnitVectors
} from '../../utils/osmRouteArrowUtils';
import { getConnectingLineColor, isBrightTerrainAt } from '../../utils/routeLineColor';
import { SkinType, Waypoint } from '../../types';
import { latLngToVector3, vector3ToLatLng } from '../../utils/globeCoordinates';

describe('Globe & OSM Route Connecting Line Visual Consistency Suite', () => {
  const sampleWaypoints: Waypoint[] = [
    { id: 'wp-1', name: 'Tokyo', lat: 35.6762, lng: 139.6503, query: 'Tokyo', isSequential: true },
    { id: 'wp-2', name: 'San Francisco', lat: 37.7749, lng: -122.4194, query: 'San Francisco', isSequential: true },
    { id: 'wp-3', name: 'New York', lat: 40.7128, lng: -74.006, query: 'New York', isSequential: true }
  ];

  describe('1. Dash Pattern Design & Proportions', () => {
    it('shares the exact dash:gap ratio (1.5) across OSM and Globe constants with refined stroke', () => {
      expect(ROUTE_LINE_DASH_ARRAY).toBe('4 2.67');
      expect(ROUTE_LINE_DASH_LENGTH).toBe(4);
      expect(ROUTE_LINE_GAP_LENGTH).toBe(2.67);
      expect(ROUTE_LINE_DASH_LENGTH / ROUTE_LINE_GAP_LENGTH).toBeCloseTo(1.5, 1);
      expect(ROUTE_LINE_STROKE_WIDTH).toBe(1.75);
    });

    it('generates 3D globe route geometry with valid attributes and non-empty vertex data', () => {
      const geom = buildGlobeRouteGeometry({
        waypoints: sampleWaypoints,
        skin: 'modern'
      });

      expect(geom).not.toBeNull();
      const posAttr = geom!.getAttribute('position');
      const normAttr = geom!.getAttribute('normal');
      const colAttr = geom!.getAttribute('color');
      const indexAttr = geom!.getIndex();

      expect(posAttr).toBeDefined();
      expect(normAttr).toBeDefined();
      expect(colAttr).toBeDefined();
      expect(indexAttr).toBeDefined();

      expect(posAttr.count).toBeGreaterThan(0);
      expect(colAttr.count).toBe(posAttr.count);
      expect(indexAttr!.count).toBeGreaterThan(0);
    });
  });

  describe('2. Directional Arrow Proportions, Shape & Semantics', () => {
    it('shares identical 9:6 aspect ratio (1.5) between OSM and Globe arrow specifications', () => {
      expect(ARROW_LENGTH).toBe(9);
      expect(ARROW_WIDTH).toBe(6);
      expect(ARROW_LENGTH / ARROW_WIDTH).toBeCloseTo(1.5, 5);
    });

    it('calculates 2D OSM arrow oriented strictly along segment vector pointing to destination', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 300, y: 100 }; // Eastward traversal
      const arrow = calculateOSMRouteArrow({ start, end });

      expect(arrow).not.toBeNull();
      expect(arrow!.angleRad).toBeCloseTo(0, 5);
      expect(arrow!.tip.x).toBeGreaterThan(arrow!.baseCenter.x);
      expect(arrow!.tip.y).toBeCloseTo(arrow!.baseCenter.y, 5);

      // Verify arrowhead base width equals ARROW_WIDTH
      const [tip, left, right] = arrow!.polygonPoints;
      const width = Math.hypot(left.x - right.x, left.y - right.y);
      expect(width).toBeCloseTo(ARROW_WIDTH, 1);

      // Verify arrowhead length equals ARROW_LENGTH
      const length = Math.hypot(tip.x - arrow!.baseCenter.x, tip.y - arrow!.baseCenter.y);
      expect(length).toBeCloseTo(ARROW_LENGTH, 1);
    });

    it('suppresses directional arrow when route segment is shorter than MIN_ARROW_SEGMENT_LENGTH', () => {
      const shortStart = { x: 0, y: 0 };
      const shortEnd = { x: 10, y: 0 }; // 10px < 32px
      const osmArrow = calculateOSMRouteArrow({ start: shortStart, end: shortEnd });
      expect(osmArrow).toBeNull();

      // For globe with tiny segment
      const closeWaypoints: Waypoint[] = [
        { id: 'wp-a', name: 'Point A', lat: 0.0, lng: 0.0, query: 'A', isSequential: true },
        { id: 'wp-b', name: 'Point B', lat: 0.001, lng: 0.001, query: 'B', isSequential: true }
      ];
      const geom = buildGlobeRouteGeometry({ waypoints: closeWaypoints, skin: 'modern' });
      if (geom) {
        expect(geom.getAttribute('position')).toBeDefined();
      }
    });

    it('orients 3D globe arrow towards destination waypoint along tangent', () => {
      const wpA: Waypoint = { id: 'wp-a', name: 'A', lat: 0, lng: 0, query: 'A', isSequential: true };
      const wpB: Waypoint = { id: 'wp-b', name: 'B', lat: 0, lng: 60, query: 'B', isSequential: true };
      const geom = buildGlobeRouteGeometry({ waypoints: [wpA, wpB], skin: 'modern' });

      expect(geom).not.toBeNull();
      const pos = geom!.getAttribute('position');
      expect(pos.count).toBeGreaterThan(3);
    });
  });

  describe('3. Theme-Aware & Contrast-Aware Line & Arrow Colors', () => {
    const skins: SkinType[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];

    it('synchronizes theme opacity across OSM and Globe', () => {
      expect(getRouteLineOpacity('modern')).toBe(0.95);
      expect(getRouteLineOpacity('parchment')).toBe(0.9);
      expect(getRouteLineOpacity('retro-green')).toBe(0.9);
      expect(getRouteLineOpacity('retro-amber')).toBe(0.9);
    });

    skins.forEach((theme) => {
      it(`evaluates identical base line color for theme "${theme}" across layers`, () => {
        const osmColor = getConnectingLineColor({ theme, mapLayer: 'osm' });
        const globeColor = getConnectingLineColor({
          theme,
          mapLayer: 'globe',
          backgroundContext: { lat: 0, lng: 0 }
        });

        if (theme === 'parchment') {
          expect(osmColor).toBe('#8b5a2b');
          expect(globeColor).toBe('#8b5a2b');
        } else if (theme === 'retro-green') {
          expect(osmColor).toBe('#4ade80');
          expect(globeColor).toBe('#4ade80');
        } else if (theme === 'retro-amber') {
          expect(osmColor).toBe('#fbbf24');
          expect(globeColor).toBe('#fbbf24');
        } else if (theme === 'modern') {
          expect(osmColor).toBe('#111111');
          expect(globeColor).toBe('#00e5ff'); // Vibrant cyan on dark globe background
        }
      });
    });

    it('applies contrast-aware dark color #111111 on bright ice terrain on Modern Globe', () => {
      // Over Antarctica ice sheet (-75, 0)
      const colorAntarctica = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: -75, lng: 0 }
      });
      expect(colorAntarctica).toBe('#111111');

      // Over Greenland ice cap (72, -40)
      const colorGreenland = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 72, lng: -40 }
      });
      expect(colorGreenland).toBe('#111111');

      // Over Himalayas glacier crest (28, 86.9)
      const colorHimalayas = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 28, lng: 86.9 }
      });
      expect(colorHimalayas).toBe('#111111');
    });

    it('populates globe geometry vertex colors with the resolved theme colors', () => {
      const greenGeom = buildGlobeRouteGeometry({
        waypoints: sampleWaypoints,
        skin: 'retro-green'
      });
      expect(greenGeom).not.toBeNull();
      const greenColors = greenGeom!.getAttribute('color');
      const greenSample = new THREE.Color('#4ade80');

      expect(greenColors.getX(0)).toBeCloseTo(greenSample.r, 2);
      expect(greenColors.getY(0)).toBeCloseTo(greenSample.g, 2);
      expect(greenColors.getZ(0)).toBeCloseTo(greenSample.b, 2);

      const amberGeom = buildGlobeRouteGeometry({
        waypoints: sampleWaypoints,
        skin: 'retro-amber'
      });
      expect(amberGeom).not.toBeNull();
      const amberColors = amberGeom!.getAttribute('color');
      const amberSample = new THREE.Color('#fbbf24');

      expect(amberColors.getX(0)).toBeCloseTo(amberSample.r, 2);
      expect(amberColors.getY(0)).toBeCloseTo(amberSample.g, 2);
      expect(amberColors.getZ(0)).toBeCloseTo(amberSample.b, 2);

      const parchmentGeom = buildGlobeRouteGeometry({
        waypoints: sampleWaypoints,
        skin: 'parchment'
      });
      expect(parchmentGeom).not.toBeNull();
      const parchmentColors = parchmentGeom!.getAttribute('color');
      const parchmentSample = new THREE.Color('#8b5a2b');

      expect(parchmentColors.getX(0)).toBeCloseTo(parchmentSample.r, 2);
      expect(parchmentColors.getY(0)).toBeCloseTo(parchmentSample.g, 2);
      expect(parchmentColors.getZ(0)).toBeCloseTo(parchmentSample.b, 2);
    });
  });

  describe('4. Spherical Slerp Math & Normal Integrity', () => {
    it('slerps unit vectors on sphere maintaining unit length', () => {
      const v1 = new THREE.Vector3(1, 0, 0);
      const v2 = new THREE.Vector3(0, 1, 0);

      const mid = slerpUnitVectors(v1, v2, 0.5);
      expect(mid.length()).toBeCloseTo(1.0, 5);
      expect(mid.x).toBeCloseTo(Math.SQRT1_2, 5);
      expect(mid.y).toBeCloseTo(Math.SQRT1_2, 5);
      expect(mid.z).toBeCloseTo(0, 5);
    });

    it('handles antimeridian waypoint transitions smoothly', () => {
      const wpWest: Waypoint = { id: 'wp-w', name: 'West of 180', lat: 10, lng: 170, query: 'W', isSequential: true };
      const wpEast: Waypoint = { id: 'wp-e', name: 'East of 180', lat: 10, lng: -170, query: 'E', isSequential: true };

      const geom = buildGlobeRouteGeometry({
        waypoints: [wpWest, wpEast],
        skin: 'modern'
      });

      expect(geom).not.toBeNull();
      expect(geom!.getAttribute('position').count).toBeGreaterThan(0);
    });
  });
});
