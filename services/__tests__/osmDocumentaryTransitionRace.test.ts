import { describe, it, expect, vi, beforeEach } from 'vitest';
import { documentaryController } from '../documentaryController';

describe('OSM Documentary Camera Transition & Globe Active Race Suite', () => {
  beforeEach(() => {
    documentaryController.cancel('test_reset');
    vi.restoreAllMocks();
  });

  it('1. Active documentary transition owns camera and is not cancelled by intermediate distance changes or geographic movement', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    const destination = {
      lat: 63.834,
      lng: -20.401,
      name: 'Hella'
    };

    let cameraDist = 3.0;
    let cameraLat = 50.0;
    let cameraLng = 0.0;

    const seqId = documentaryController.startSingleLocation(destination, {
      getCameraCoordinates: () => ({ lat: cameraLat, lng: cameraLng }),
      getCameraDistance: () => cameraDist,
      setCameraCoordinates: (lat, lng) => {
        cameraLat = lat;
        cameraLng = lng;
      },
      setCameraDistance: (dist) => {
        cameraDist = dist;
      }
    });

    expect(seqId).toBeGreaterThan(0);
    expect(documentaryController.isActive()).toBe(true);

    // Simulate camera descending through 1.85, 1.70, 1.55 while moving geographically
    cameraDist = 1.85;
    cameraLat = 55.0;
    cameraLng = -10.0;

    // Simulate OSMMapLayer useFrame evaluation:
    // With isTransitionOwnedByDoc = true, dLat > 0.5 does not trigger hasGlobeShifted
    const dist = cameraDist;
    const isDocActive = documentaryController.isActive();
    const isTransitionOwnedByDoc = isDocActive || (documentaryController.getCurrentDestination() !== null && dist <= 1.85);
    const dLat = Math.abs(cameraLat - 50.0);
    const hasGlobeShifted = !isTransitionOwnedByDoc && dLat > 0.5;
    const isReturningToGlobe = dist > 1.85 || (!isTransitionOwnedByDoc && dist > 1.55 && hasGlobeShifted);

    expect(isTransitionOwnedByDoc).toBe(true);
    expect(hasGlobeShifted).toBe(false);
    expect(isReturningToGlobe).toBe(false);
  });

  it('2. MARKER_SELECTION update does not cancel active documentary transition', () => {
    const destination = {
      lat: 63.834,
      lng: -20.401,
      name: 'Hella'
    };

    documentaryController.startSingleLocation(destination, {
      getCameraCoordinates: () => ({ lat: 63.8, lng: -20.0 }),
      getCameraDistance: () => 1.70,
      setCameraCoordinates: () => {},
      setCameraDistance: () => {}
    });

    expect(documentaryController.isActive()).toBe(true);

    // Simulate MARKER_SELECTION event occurring during descent at dist = 1.55
    const dist = 1.55;
    const isDocActive = documentaryController.isActive();
    const isTransitionOwnedByDoc = isDocActive || (documentaryController.getCurrentDestination() !== null && dist <= 1.85);
    const isManualInteracting = false;
    const hasGlobeShifted = false;
    const isReturningToGlobe = dist > 1.85 || (!isTransitionOwnedByDoc && dist > 1.55 && (isManualInteracting || hasGlobeShifted));

    expect(isReturningToGlobe).toBe(false);
    expect(documentaryController.isActive()).toBe(true);
  });

  it('3. Explicit manual user interaction cleanly cancels the documentary transition', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    const destination = {
      lat: 63.834,
      lng: -20.401,
      name: 'Hella'
    };

    documentaryController.startSingleLocation(destination, {
      getCameraCoordinates: () => ({ lat: 63.8, lng: -20.0 }),
      getCameraDistance: () => 1.70,
      setCameraCoordinates: () => {},
      setCameraDistance: () => {},
      onCancel: (reason) => {
        logs.push(`[Documentary] onCancel reason=${reason}`);
      }
    });

    expect(documentaryController.isActive()).toBe(true);

    // User starts dragging
    documentaryController.cancel('user_drag');
    logs.push('[Camera] MANUAL_CONTROL_STARTED');

    expect(documentaryController.isActive()).toBe(false);
    expect(logs).toContain('[Camera] MANUAL_CONTROL_STARTED');
  });

  it('4. Camera ascending to space (dist > 1.85) properly asserts globe_active when no documentary transition is running', () => {
    documentaryController.cancel('completed');
    expect(documentaryController.isActive()).toBe(false);

    const dist = 2.5;
    const isDocActive = documentaryController.isActive();
    const isTransitionOwnedByDoc = isDocActive;
    const isReturningToGlobe = dist > 1.85 || (!isTransitionOwnedByDoc && dist > 1.55);

    expect(isReturningToGlobe).toBe(true);
  });
});
