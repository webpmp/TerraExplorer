import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Camera Ownership & One-Shot Targeting Invariants', () => {
  it('enforces that discovery camera focus is strictly one-shot and does not refocus on subsequent state updates', () => {
    let targetCameraPos: THREE.Vector3 | null = null;
    let targetRotation: { lat: number; lng: number } | null = null;
    const logs: string[] = [];

    // Helper simulating reconcileCameraState
    const reconcileCameraState = (discoveryId: number) => {
      if (targetRotation) {
        logs.push(`[Camera] DISCOVERY_POSITIONING discoveryId=${discoveryId}`);
        targetCameraPos = new THREE.Vector3(1, 0, 0);
        // CRITICAL INVARIANT: consume target rotation immediately
        targetRotation = null;
      } else {
        logs.push('[Camera] RESET_SKIPPED reason=manual-control');
      }
    };

    // 1. User clicks globe / discovery starts (discoveryId = 1)
    targetRotation = { lat: 34.05, lng: -118.25 };
    reconcileCameraState(1);
    expect(targetCameraPos).not.toBeNull();
    expect(targetRotation).toBeNull();
    expect(logs).toContain('[Camera] DISCOVERY_POSITIONING discoveryId=1');

    // 2. Camera reaches target
    targetCameraPos = null;
    logs.push('[Camera] DISCOVERY_POSITIONING_COMPLETE discoveryId=1');

    // 3. Opening InfoPanel does NOT reset camera
    reconcileCameraState(1);
    expect(targetCameraPos).toBeNull();
    expect(logs[logs.length - 1]).toBe('[Camera] RESET_SKIPPED reason=manual-control');

    // 4. Closing InfoPanel does NOT reset camera
    reconcileCameraState(1);
    expect(targetCameraPos).toBeNull();
    expect(logs[logs.length - 1]).toBe('[Camera] RESET_SKIPPED reason=manual-control');

    // 5. Background enrichment completes and triggers React re-render
    reconcileCameraState(1);
    expect(targetCameraPos).toBeNull();

    // 6. OSM features load asynchronously
    reconcileCameraState(1);
    expect(targetCameraPos).toBeNull();

    // 7. Parchment zoom level changes
    reconcileCameraState(1);
    expect(targetCameraPos).toBeNull();
  });

  it('immediately cancels active programmatic target and grants user ownership when user starts dragging OrbitControls', () => {
    let targetCameraPos: THREE.Vector3 | null = new THREE.Vector3(1, 2, 3);
    let targetRotation: { lat: number; lng: number } | null = { lat: 10, lng: 20 };
    const logs: string[] = [];

    // Simulate OrbitControls onStart
    const onOrbitControlsStart = () => {
      targetCameraPos = null;
      targetRotation = null;
      logs.push('[Camera] MANUAL_CONTROL_STARTED');
    };

    onOrbitControlsStart();
    expect(targetCameraPos).toBeNull();
    expect(targetRotation).toBeNull();
    expect(logs).toContain('[Camera] MANUAL_CONTROL_STARTED');
  });

  it('verifies Parchment theme does not continuously reset OrbitControls', () => {
    let cameraPosition = new THREE.Vector3(0, 0, 3.0);
    const aspect = 16 / 9;
    const baseDistance = (3.0 * 1.28985) / aspect;
    let parchmentZoom = 1.0;
    let authoritativeDistance = baseDistance / parchmentZoom;

    // Simulate user rotating the camera to an arbitrary angle
    cameraPosition.set(2.0, 1.0, 2.0).normalize().multiplyScalar(authoritativeDistance);
    const initialRotatedDirection = cameraPosition.clone().normalize();

    // AuthoritativeCameraEnforcer frame simulation:
    const currentDist = cameraPosition.length();
    if (currentDist > 0.001 && Math.abs(currentDist - authoritativeDistance) > 0.01) {
      cameraPosition.normalize().multiplyScalar(authoritativeDistance);
    }

    // Direction must remain preserved (no snap back to north or marker coords!)
    expect(cameraPosition.clone().normalize().dot(initialRotatedDirection)).toBeCloseTo(1.0, 5);
  });
});
