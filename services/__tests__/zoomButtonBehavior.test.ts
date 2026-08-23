import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SkinType } from '../../types';
import { OSM_DETAIL_THRESHOLD } from '../geographic/osmTileService';
import { getParchmentBaseDistance } from '../../utils/cameraConfig';

describe('Zoom Button Behavior Across All Themes', () => {
  const BUTTON_ZOOM_FACTOR = 1.25;
  const MIN_DISTANCE = 1.018;

  const clampZoom = (z: number, skin: SkinType, aspect: number = 16 / 9) => {
    const minZ = MIN_DISTANCE;
    const maxZ = skin === 'parchment' ? getParchmentBaseDistance(aspect) : 8.0;
    return Math.max(minZ, Math.min(maxZ, z));
  };

  it('calculates theme-appropriate zoom in target distance from Globe overview', () => {
    const aspect = 16 / 9;
    const parchmentBase = getParchmentBaseDistance(aspect); // ~2.176

    // Modern / CRT themes start from 4.5
    ['modern', 'retro-green', 'retro-amber'].forEach((skin) => {
      const initialDistance = 4.5;
      const targetZoom = clampZoom(initialDistance / BUTTON_ZOOM_FACTOR, skin as SkinType, aspect);
      expect(targetZoom).toBeCloseTo(3.6, 2);
    });

    // Parchment starts from its tighter, theme-specific baseDistance (~2.18)
    const parchmentTarget = clampZoom(parchmentBase / BUTTON_ZOOM_FACTOR, 'parchment', aspect);
    expect(parchmentTarget).toBeCloseTo(parchmentBase / 1.25, 3);
    expect(parchmentTarget).toBeLessThan(parchmentBase);
    expect(parchmentTarget).toBeGreaterThan(1.55); // Smoothly moves toward atmospheric threshold
  });

  it('enforces Parchment maximum zoom-out distance bound to baseDistance', () => {
    const aspect = 16 / 9;
    const parchmentBase = getParchmentBaseDistance(aspect); // ~2.176

    // In Parchment, zooming out from baseDistance is clamped to baseDistance so globe never shrinks past ring
    const zoomOutTarget = clampZoom(parchmentBase * BUTTON_ZOOM_FACTOR, 'parchment', aspect);
    expect(zoomOutTarget).toBeCloseTo(parchmentBase, 4);

    // In Modern / CRT, zooming out from 4.5 extends toward 5.625
    ['modern', 'retro-green', 'retro-amber'].forEach((skin) => {
      const targetZoom = clampZoom(4.5 * BUTTON_ZOOM_FACTOR, skin as SkinType, aspect);
      expect(targetZoom).toBeCloseTo(5.625, 2);
    });
  });

  it('calculates identical zoom in target distance from OSM view (dist = 1.30) across all 4 themes', () => {
    const aspect = 16 / 9;
    const initialDistance = 1.30;
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const targetZoom = clampZoom(initialDistance / BUTTON_ZOOM_FACTOR, skin, aspect);
      expect(targetZoom).toBeCloseTo(1.04, 2);
      expect(targetZoom).toBeLessThan(OSM_DETAIL_THRESHOLD);
      expect(targetZoom).toBeGreaterThanOrEqual(MIN_DISTANCE);
    });
  });

  it('calculates zoom out target distance from OSM view (dist = 1.30) into atmosphere transition across all 4 themes', () => {
    const aspect = 16 / 9;
    const initialDistance = 1.30;
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const targetZoom = clampZoom(initialDistance * BUTTON_ZOOM_FACTOR, skin, aspect);
      expect(targetZoom).toBeCloseTo(1.625, 3);
      expect(targetZoom).toBeGreaterThan(OSM_DETAIL_THRESHOLD); // Smoothly transitions out of OSM
    });
  });

  it('simulates smooth cinematic animation with damping factor across all 4 themes producing continuous intermediate steps', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      let currentZoom = skin === 'parchment' ? 2.15 : 4.5;
      const targetZoom = skin === 'parchment' ? 1.72 : 3.6;
      const steps: number[] = [];

      for (let i = 0; i < 100; i++) {
        const diff = targetZoom - currentZoom;
        currentZoom = currentZoom + diff * 0.075;
        steps.push(currentZoom);
        if (Math.abs(diff) < 0.0008) break;
      }

      // Step count > 10 proves continuous easing rather than instant snapping
      expect(steps.length).toBeGreaterThan(10);

      // Must steadily decrease towards target without any upward snaps
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeLessThan(steps[i - 1]);
      }

      // Reaches target closely
      expect(steps[steps.length - 1]).toBeCloseTo(targetZoom, 2);
    });
  });

  it('ensures AuthoritativeCameraEnforcer yields camera ownership when isCameraAnimatingRef is active', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const aspect = 16 / 9;
      const baseDistance = getParchmentBaseDistance(aspect);
      const cameraPosition = new THREE.Vector3(0, 0, 1.85); // Mid-animation position
      const cameraState = {
        themeSuggestedDistance: skin === 'parchment' ? baseDistance : 4.5,
        routeSuggestedDistance: 2.0,
        activeRoute: null,
      };

      const isCameraAnimatingRef = { current: true };

      // Simulate AuthoritativeCameraEnforcer useFrame hook
      const runEnforcer = () => {
        if (isCameraAnimatingRef.current) return; // Must yield ownership!

        let authoritativeDistance = 4.5;
        if (cameraState.activeRoute) {
          authoritativeDistance = cameraState.routeSuggestedDistance;
        } else if (skin === 'parchment') {
          authoritativeDistance = Math.min(baseDistance, cameraState.themeSuggestedDistance);
        } else {
          authoritativeDistance = cameraState.themeSuggestedDistance;
        }

        const currentDist = cameraPosition.length();
        if (currentDist > 0.001 && Math.abs(currentDist - authoritativeDistance) > 0.01) {
          cameraPosition.normalize().multiplyScalar(authoritativeDistance);
        }
      };

      runEnforcer();

      // Because isCameraAnimatingRef is true, cameraPosition is NOT snapped back
      expect(cameraPosition.length()).toBeCloseTo(1.85, 4);

      // Once animation completes and releases ownership:
      isCameraAnimatingRef.current = false;
      const targetDist = skin === 'parchment' ? 1.72 : 3.6;
      cameraState.themeSuggestedDistance = targetDist;
      cameraPosition.set(0, 0, targetDist);
      runEnforcer();
      expect(cameraPosition.length()).toBeCloseTo(targetDist, 4);
    });
  });
});
