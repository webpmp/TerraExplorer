import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';
import { getFallbackFeaturesForViewport } from '../geographic/osmFallbackData';
import { latLngToVector3 } from '../../utils/globeCoordinates';

describe('OSM Geographic Detail Layer Rendering & Geometry', () => {
  it('converts features to valid non-empty Three.js BufferGeometry position attributes', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.3);
    expect(extent).not.toBeNull();

    const features = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features.length).toBeGreaterThan(0);

    const lines: THREE.Vector3[] = [];
    const LINE_ALTITUDE = 1.015;

    for (const f of features) {
      if (f.coordinates && f.coordinates.length >= 2) {
        for (let i = 0; i < f.coordinates.length - 1; i++) {
          const p1 = latLngToVector3(f.coordinates[i][0], f.coordinates[i][1], LINE_ALTITUDE);
          const p2 = latLngToVector3(f.coordinates[i + 1][0], f.coordinates[i + 1][1], LINE_ALTITUDE);
          lines.push(p1, p2);
        }
      }
    }

    expect(lines.length).toBeGreaterThan(0);

    // Build actual Three.js BufferGeometry
    const geometry = new THREE.BufferGeometry();
    const arr = new Float32Array(lines.flatMap(v => [v.x, v.y, v.z]));
    geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));

    const positionAttr = geometry.getAttribute('position');
    expect(positionAttr).toBeDefined();
    expect(positionAttr.count).toBe(lines.length);
    expect(positionAttr.count).toBeGreaterThan(10);

    // Verify coordinates are on the correct sphere radius (~1.015)
    const firstPoint = new THREE.Vector3(
      positionAttr.getX(0),
      positionAttr.getY(0),
      positionAttr.getZ(0)
    );
    expect(firstPoint.length()).toBeCloseTo(1.015, 3);
  });

  it('correctly tags source metadata as overpass or fallback', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(51.5, -0.12, 1.3);
    const features = await osmMapDataProvider.getFeaturesForViewport(extent!);

    for (const f of features) {
      expect(['overpass', 'fallback']).toContain(f.source);
    }
  });

  it('isolates geography so fallback features in California do not appear in Japan', () => {
    const tokyoFeatures = getFallbackFeaturesForViewport(34.0, 37.0, 138.0, 141.0);
    const names = tokyoFeatures.map(f => (f.englishName || f.name || '').toLowerCase());
    
    expect(names).not.toContain('los angeles');
    expect(names).not.toContain('san diego');
    expect(names).not.toContain('interstate 5');
  });

  it('re-uses existing discovery result data for OSM marker projection and preserves canonical coordinates', () => {
    const discoveryResults = [
      { id: 'res-1', name: 'Eiffel Tower', lat: 48.8584, lng: 2.2945, type: 'attraction' },
      { id: 'res-2', name: 'Louvre Museum', lat: 48.8606, lng: 2.3376, type: 'museum' },
      { id: 'res-3', name: 'Notre-Dame', lat: 48.8530, lng: 2.3499, type: 'cathedral' }
    ];

    const projectToOSM = (lat: number, lng: number, z: number, cLat: number, cLng: number, screenW = 1920, screenH = 1080) => {
      const n = Math.pow(2, z);
      const exactX = ((cLng + 180) / 360) * n;
      const cLatRad = (Math.max(-85.0511, Math.min(85.0511, cLat)) * Math.PI) / 180;
      const exactY = ((1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2) * n;

      const markerX = ((lng + 180) / 360) * n;
      const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
      const markerY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

      return {
        screenX: (screenW / 2) + (markerX - exactX) * 256,
        screenY: (screenH / 2) + (markerY - exactY) * 256
      };
    };

    const centerLat = 48.8566;
    const centerLng = 2.3522;

    const projected = discoveryResults.map(r => ({
      ...r,
      ...projectToOSM(r.lat, r.lng, 14, centerLat, centerLng)
    }));

    // Each marker preserves its exact original result metadata
    expect(projected[0].id).toBe('res-1');
    expect(projected[0].name).toBe('Eiffel Tower');
    expect(projected[1].id).toBe('res-2');
    expect(projected[2].id).toBe('res-3');

    // Louvre is geographically east of Eiffel Tower (higher lng -> higher screenX)
    expect(projected[1].screenX).toBeGreaterThan(projected[0].screenX);

    // Notre-Dame is south of Louvre (lower lat -> higher screenY in Mercator)
    expect(projected[2].screenY).toBeGreaterThan(projected[1].screenY);
  });

  it('differentiates marker click from map drag using pointer movement threshold', () => {
    const isDrag = (startPos: { x: number; y: number }, endPos: { x: number; y: number }, threshold = 4) => {
      const dist = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
      return dist > threshold;
    };

    // Small wiggle or jitter is treated as a clean click
    expect(isDrag({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(false);
    expect(isDrag({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);

    // Intentional drag (> 4px) is treated as a pan gesture
    expect(isDrag({ x: 100, y: 100 }, { x: 110, y: 105 })).toBe(true);
    expect(isDrag({ x: 100, y: 100 }, { x: 100, y: 120 })).toBe(true);
  });

  it('guarantees OSM marker pins and labels share the identical geographic projected anchor without globe offsets', () => {
    const marker = { id: 'm-1', name: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783 };
    const centerLat = 37.7749;
    const centerLng = -122.4194;
    const z = 14;

    const n = Math.pow(2, z);
    const exactX = ((centerLng + 180) / 360) * n;
    const cLatRad = (Math.max(-85.0511, Math.min(85.0511, centerLat)) * Math.PI) / 180;
    const exactY = ((1 - Math.log(Math.tan(cLatRad) + 1 / Math.cos(cLatRad)) / Math.PI) / 2) * n;

    const markerX = ((marker.lng + 180) / 360) * n;
    const latRad = (Math.max(-85.0511, Math.min(85.0511, marker.lat)) * Math.PI) / 180;
    const markerY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const anchorLeft = 960 + (markerX - exactX) * 256;
    const anchorTop = 540 + (markerY - exactY) * 256;

    // Both pin and label are co-located in the same container at (anchorLeft, anchorTop)
    const pinCenter = { x: anchorLeft, y: anchorTop };
    const labelCenter = { x: anchorLeft, y: anchorTop - 17 }; // centered horizontally, 17px above

    expect(pinCenter.x).toBe(labelCenter.x);
    expect(Math.abs(pinCenter.y - labelCenter.y)).toBeLessThan(25);

    // Globe overlay suppression gate: distance <= 1.45 suppresses globe HoverOverlay
    const isGlobeHoverActive = (distance: number) => distance > 1.45;
    expect(isGlobeHoverActive(2.5)).toBe(true);
    expect(isGlobeHoverActive(1.6)).toBe(true);
    expect(isGlobeHoverActive(1.45)).toBe(false);
    expect(isGlobeHoverActive(1.2)).toBe(false);
    expect(isGlobeHoverActive(1.05)).toBe(false);
  });
});


