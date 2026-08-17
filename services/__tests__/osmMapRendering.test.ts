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
});
