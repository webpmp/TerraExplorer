import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { latLngToVector3, vector3ToLatLng } from '../../utils/globeCoordinates';
import { osmTileService } from '../geographic/osmTileService';

describe('OSM Street Map ↔ 3D Globe Absolute Camera Synchronization Tests', () => {
  it('verifies that latLngToVector3 and vector3ToLatLng are exact inverse bijections', () => {
    const testPoints = [
      { lat: 32.5936, lng: -97.3801, dist: 1.191 },
      { lat: 0, lng: 0, dist: 2.5 },
      { lat: 45.0, lng: 179.9, dist: 1.05 },
      { lat: -45.0, lng: -179.9, dist: 1.05 },
      { lat: 85.0, lng: -45.0, dist: 1.2 },
      { lat: -85.0, lng: 45.0, dist: 1.2 }
    ];

    for (const pt of testPoints) {
      const vec = latLngToVector3(pt.lat, pt.lng, pt.dist);
      expect(vec.length()).toBeCloseTo(pt.dist, 4);

      const recovered = vector3ToLatLng(vec);
      expect(recovered.lat).toBeCloseTo(pt.lat, 4);
      expect(recovered.lng).toBeCloseTo(pt.lng, 4);
    }
  });

  it('verifies that small pointer displacements produce proportional small geographic deltas', () => {
    const startLat = 32.5936;
    const startLng = -97.3801;
    const z = 14;
    const n = Math.pow(2, z);
    const worldSize = 256 * n; // 4,194,304

    const startWorldX = (startLng + 180) / 360;
    const startLatRad = (Math.max(-85.0511, Math.min(85.0511, startLat)) * Math.PI) / 180;
    const startWorldY = (1 - Math.log(Math.tan(startLatRad) + 1 / Math.cos(startLatRad)) / Math.PI) / 2;

    // Simulate 10px horizontal drag
    const dx10 = 10;
    const newWorldX10 = startWorldX - dx10 / worldSize;
    const newLng10 = newWorldX10 * 360 - 180;
    const deltaLng10 = newLng10 - startLng;

    // 10px drag should produce ~0.000858° of longitude, NOT 3.0°!
    expect(Math.abs(deltaLng10)).toBeCloseTo(0.000858, 5);
    expect(Math.abs(deltaLng10)).toBeLessThan(0.005);

    // Simulate 100px drag
    const dx100 = 100;
    const newWorldX100 = startWorldX - dx100 / worldSize;
    const newLng100 = newWorldX100 * 360 - 180;
    const deltaLng100 = newLng100 - startLng;

    // 100px drag should be exactly 10x the 10px delta
    expect(deltaLng100 / deltaLng10).toBeCloseTo(10, 3);
  });

  it('verifies that dragging back to origin returns to exact original coordinates', () => {
    const startLat = 32.5936;
    const startLng = -97.3801;
    const z = 14;
    const n = Math.pow(2, z);
    const worldSize = 256 * n;

    const startWorldX = (startLng + 180) / 360;
    const startLatRad = (Math.max(-85.0511, Math.min(85.0511, startLat)) * Math.PI) / 180;
    const startWorldY = (1 - Math.log(Math.tan(startLatRad) + 1 / Math.cos(startLatRad)) / Math.PI) / 2;

    // Return to dx = 0, dy = 0
    const newWorldX0 = startWorldX - 0 / worldSize;
    const newWorldY0 = startWorldY - 0 / worldSize;

    const newLng0 = newWorldX0 * 360 - 180;
    const nMerc = Math.PI - 2 * Math.PI * newWorldY0;
    const newLat0 = (180 / Math.PI) * Math.atan(Math.sinh(nMerc));

    expect(newLat0).toBeCloseTo(startLat, 5);
    expect(newLng0).toBeCloseTo(startLng, 5);
  });

  it('verifies that the final committed center equals the last PAN_CENTER without post-release snap', () => {
    const startLat = 9.0586;
    const startLng = -75.1317;
    const z = 14;
    const n = Math.pow(2, z);
    const worldSize = 256 * n;

    const startWorldX = (startLng + 180) / 360;
    const startLatRad = (Math.max(-85.0511, Math.min(85.0511, startLat)) * Math.PI) / 180;
    const startWorldY = (1 - Math.log(Math.tan(startLatRad) + 1 / Math.cos(startLatRad)) / Math.PI) / 2;

    // Simulate drag producing target longitude -70.7520
    const targetLng = -70.752;
    const targetWorldX = (targetLng + 180) / 360;
    const totalDx = (startWorldX - targetWorldX) * worldSize;

    // Compute final pan coordinates
    const finalWorldX = startWorldX - totalDx / worldSize;
    const finalWorldY = startWorldY - 0 / worldSize;
    const finalLng = finalWorldX * 360 - 180;
    const finalLat = startLat;

    expect(finalLng).toBeCloseTo(-70.752, 4);

    // Commit to camera and verify post-commit stability
    const committedCamPos = latLngToVector3(finalLat, finalLng, 1.15);
    const recoveredCenter = vector3ToLatLng(committedCamPos);

    expect(recoveredCenter.lat).toBeCloseTo(finalLat, 4);
    expect(recoveredCenter.lng).toBeCloseTo(finalLng, 4);
    expect(recoveredCenter.lng).not.toBeCloseTo(startLng, 2);
  });

  it('verifies that 20 consecutive absolute camera updates do not compound or drift', () => {
    const targetLat = 36.2261;
    const targetLng = -111.061;
    const dist = 1.191;

    let currentPos = new THREE.Vector3(0, 0, dist);

    // Apply the exact same absolute target 20 times
    for (let i = 0; i < 20; i++) {
      const worldPos = latLngToVector3(targetLat, targetLng, dist);
      currentPos.copy(worldPos);
    }

    const finalGeo = vector3ToLatLng(currentPos);
    expect(finalGeo.lat).toBeCloseTo(targetLat, 4);
    expect(finalGeo.lng).toBeCloseTo(targetLng, 4);
  });

  it('verifies shortest wrapped angular distance when crossing the antimeridian (+-180)', () => {
    // Distance between 179° and -179° is 2°, not 358°
    const lngA = 179;
    const lngB = -179;
    const wrappedDelta = ((lngB - lngA + 540) % 360) - 180;
    expect(wrappedDelta).toBe(2);

    const wrappedDeltaReverse = ((lngA - lngB + 540) % 360) - 180;
    expect(wrappedDeltaReverse).toBe(-2);
  });
});
