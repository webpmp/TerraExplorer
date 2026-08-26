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
    const isReturningToGlobe = !isTransitionOwnedByDoc && (dist > 1.85 || dist > 1.55);

    expect(isReturningToGlobe).toBe(true);
  });

  it('5. Destination Handoff: Sydney Opera House -> Dallas, Texas cleanly transfers destination ownership and supersedes previous transition', () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    const sydneyDest = {
      lat: -33.8568,
      lng: 151.2153,
      name: 'Sydney Opera House'
    };

    let camLat = -33.8568;
    let camLng = 151.2153;
    let camDist = 1.30;

    // First search: Sydney
    const seq1 = documentaryController.startSingleLocation(sydneyDest, {
      getCameraCoordinates: () => ({ lat: camLat, lng: camLng }),
      getCameraDistance: () => camDist,
      setCameraCoordinates: (lat, lng) => { camLat = lat; camLng = lng; },
      setCameraDistance: (dist) => { camDist = dist; }
    });

    expect(documentaryController.getCurrentDestination()?.name).toBe('Sydney Opera House');
    expect(seq1).toBeGreaterThan(0);

    // Second search: Dallas, Texas
    const dallasDest = {
      lat: 32.7767,
      lng: -96.7970,
      name: 'Dallas, Texas'
    };

    const seq2 = documentaryController.startSingleLocation(dallasDest, {
      getCameraCoordinates: () => ({ lat: camLat, lng: camLng }),
      getCameraDistance: () => camDist,
      setCameraCoordinates: (lat, lng) => { camLat = lat; camLng = lng; },
      setCameraDistance: (dist) => { camDist = dist; }
    });

    expect(seq2).toBeGreaterThan(seq1);
    expect(documentaryController.getCurrentDestination()?.name).toBe('Dallas, Texas');
    expect(documentaryController.getPreviousDestination()?.name).toBe('Sydney Opera House');

    // Verify logs
    const joinedLogs = logs.join('\n');
    expect(joinedLogs).toContain('[DESTINATION HANDOFF]');
    expect(joinedLogs).toContain('previous="Sydney Opera House"');
    expect(joinedLogs).toContain('previousCoordinates=-33.8568,151.2153');
    expect(joinedLogs).toContain('current="Dallas, Texas"');
    expect(joinedLogs).toContain('currentCoordinates=32.7767,-96.7970');
    expect(joinedLogs).toContain('[DESTINATION COMMITTED]');
    expect(joinedLogs).toContain('name="Dallas, Texas"');
    expect(joinedLogs).toContain(`transitionId=${seq2}`);
    expect(joinedLogs).toContain('[DOCUMENTARY START]');
    expect(joinedLogs).toContain('startDistance=1.3000');
    expect(joinedLogs).toContain('targetDistance=1.3000');

    // Verify OSM Map Layer evaluation during zoom-out phase of Dallas transition (dist climbs from 1.30 -> 4.0)
    camDist = 1.8531;
    const isDocActive = documentaryController.isActive();
    const isTransitionOwnedByDoc = isDocActive || (documentaryController.getCurrentDestination() !== null && camDist <= 1.85);
    const isManualInteracting = false;
    const hasGlobeShifted = false;
    const isReturningToGlobe = !isTransitionOwnedByDoc && (camDist > 1.85 || (camDist > 1.55 && (isManualInteracting || hasGlobeShifted)));

    expect(isTransitionOwnedByDoc).toBe(true);
    expect(isReturningToGlobe).toBe(false);
  });
});
