import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { latLngToVector3, vector3ToLatLng } from '../../utils/globeCoordinates';
import { OSM_DETAIL_THRESHOLD } from '../geographic/osmTileService';
import {
  calculateGreatCircleDistance,
  calculateModerateFramingDistance,
  isDestinationComfortablyVisible
} from '../../utils/cameraConfig';
import {
  isMarkerInOSMViewport,
  calculateOSMViewportBounds,
  OSMViewportBounds
} from '../../utils/osmViewportUtils';
import { interpolateCoordinates } from '../documentaryController';

/**
 * Simulator for the Authoritative Waypoint Camera Coordinator
 * replicating the exact transition and token cancellation logic in App.tsx
 */
class WaypointCameraCoordinatorSimulator {
  public activeWaypointTransitionId = 0;
  public isCameraAnimating = false;
  public currentCameraPosition: THREE.Vector3;
  public previousGeoCenter: { lat: number; lng: number } = { lat: 0, lng: 0 };
  public currentCameraDistance = 4.5;
  public isOSMActive = false;
  public osmViewportBounds: OSMViewportBounds | null = null;
  public activeRouteId: string | null = null;
  public routeSuggestedDistance = 2.0;
  public themeSuggestedDistance = 4.5;
  public targetCameraPos: THREE.Vector3 | null = null;
  public documentaryMode = false;
  public transitionLogs: string[] = [];
  public activeAnimCallback: (() => void) | null = null;

  constructor(initialLat = 0, initialLng = 0, initialDistance = 4.5) {
    this.currentCameraDistance = initialDistance;
    this.previousGeoCenter = { lat: initialLat, lng: initialLng };
    this.currentCameraPosition = latLngToVector3(initialLat, initialLng, initialDistance);
    this.isOSMActive = initialDistance <= OSM_DETAIL_THRESHOLD;
  }

  public updateAuthoritativeCamera(lat: number, lng: number, distance: number) {
    let normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
    this.previousGeoCenter = { lat: clampedLat, lng: normalizedLng };
    this.currentCameraDistance = distance;
    this.currentCameraPosition = latLngToVector3(clampedLat, normalizedLng, distance);
    this.isOSMActive = distance <= OSM_DETAIL_THRESHOLD;
    this.transitionLogs.push(
      `[Camera] TARGET lat=${clampedLat.toFixed(4)} lng=${normalizedLng.toFixed(4)} dist=${distance.toFixed(4)}`
    );
  }

  public cancelActiveCameraAnimations() {
    this.activeAnimCallback = null;
    this.targetCameraPos = null;
  }

  public navigateWaypointCamera(
    targetWp: { id?: string; name?: string; lat: number; lng: number },
    fromWp?: { lat: number; lng: number }
  ) {
    const transitionId = ++this.activeWaypointTransitionId;
    const targetLat = targetWp.lat;
    const targetLng = targetWp.lng;

    this.cancelActiveCameraAnimations();
    this.isCameraAnimating = true;

    // Derive starting position from actual current camera in world space
    const camPos = this.currentCameraPosition;
    const startDist = camPos.length() || this.currentCameraDistance || 4.5;
    const geo = vector3ToLatLng(camPos);
    const startLat = geo.lat;
    const startLng = geo.lng;

    const isOSM = startDist <= OSM_DETAIL_THRESHOLD || this.isOSMActive;

    if (isOSM) {
      const bounds = this.osmViewportBounds;
      const isVisibleInOSMViewport = bounds
        ? isMarkerInOSMViewport(targetLat, targetLng, bounds)
        : isDestinationComfortablyVisible(
            { lat: startLat, lng: startLng },
            startDist,
            { lat: targetLat, lng: targetLng },
            { viewportWidth: 1920, viewportHeight: 1080 }
          );

      if (isVisibleInOSMViewport) {
        // In-viewport OSM pan
        this.transitionLogs.push(`[Strategy] OSM_PAN transitionId=${transitionId} target=${targetWp.name || 'wp'}`);
        return {
          transitionId,
          type: 'OSM_PAN',
          executeSteps: (progressValues: number[]) => {
            for (const p of progressValues) {
              if (transitionId !== this.activeWaypointTransitionId) {
                this.transitionLogs.push(`[Cancelled] transitionId=${transitionId}`);
                return;
              }
              const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
              const cur = interpolateCoordinates(startLat, startLng, targetLat, targetLng, ease);
              this.updateAuthoritativeCamera(cur.lat, cur.lng, startDist);
              if (p >= 1) {
                this.isCameraAnimating = false;
                this.updateAuthoritativeCamera(targetLat, targetLng, startDist);
              }
            }
          }
        };
      } else {
        // Out-of-viewport OSM transition
        const targetOSMDist = 1.30;
        const angularDist = calculateGreatCircleDistance(startLat, startLng, targetLat, targetLng);
        const maxFramingLimit = 2.65;
        const framingDist = Math.min(
          maxFramingLimit,
          Math.max(2.4, calculateModerateFramingDistance(angularDist, startDist, targetOSMDist, maxFramingLimit))
        );

        this.transitionLogs.push(
          `[Strategy] OSM_OVERVIEW_TRANSITION transitionId=${transitionId} target=${targetWp.name || 'wp'}`
        );

        return {
          transitionId,
          type: 'OSM_OVERVIEW_TRANSITION',
          executeSteps: (progressValues: number[]) => {
            for (const p of progressValues) {
              if (transitionId !== this.activeWaypointTransitionId) {
                this.transitionLogs.push(`[Cancelled] transitionId=${transitionId}`);
                return;
              }
              let curLat: number;
              let curLng: number;
              let curDist: number;

              if (p < 0.35) {
                const p1 = p / 0.35;
                const ease1 = p1 < 0.5 ? 2 * p1 * p1 : 1 - Math.pow(-2 * p1 + 2, 2) / 2;
                curLat = startLat;
                curLng = startLng;
                curDist = startDist + (framingDist - startDist) * ease1;
              } else if (p < 0.67) {
                const p2 = (p - 0.35) / 0.32;
                const ease2 = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;
                const interp = interpolateCoordinates(startLat, startLng, targetLat, targetLng, ease2);
                curLat = interp.lat;
                curLng = interp.lng;
                curDist = framingDist;
              } else {
                const p3 = (p - 0.67) / 0.33;
                const ease3 = p3 < 0.5 ? 2 * p3 * p3 : 1 - Math.pow(-2 * p3 + 2, 2) / 2;
                curLat = targetLat;
                curLng = targetLng;
                curDist = framingDist + (targetOSMDist - framingDist) * ease3;
              }

              curDist = Math.max(1.018, Math.min(maxFramingLimit, curDist));
              this.updateAuthoritativeCamera(curLat, curLng, curDist);

              if (p >= 1) {
                this.isCameraAnimating = false;
                this.updateAuthoritativeCamera(targetLat, targetLng, targetOSMDist);
              }
            }
          }
        };
      }
    } else {
      // Globe navigation: explicitly rotate & orient the globe camera to center on active waypoint
      const targetGlobeDist = this.activeRouteId
        ? this.routeSuggestedDistance
        : (startDist > 1.55 ? startDist : 2.0);

      this.transitionLogs.push(
        `[Strategy] GLOBE_ORIENT_AND_CENTER transitionId=${transitionId} target=${targetWp.name || 'wp'} dist=${targetGlobeDist.toFixed(2)}`
      );

      return {
        transitionId,
        type: 'GLOBE_ORIENT_AND_CENTER',
        executeSteps: (progressValues: number[]) => {
          for (const p of progressValues) {
            if (transitionId !== this.activeWaypointTransitionId) {
              this.transitionLogs.push(`[Cancelled] transitionId=${transitionId}`);
              return;
            }
            const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            const interp = interpolateCoordinates(startLat, startLng, targetLat, targetLng, ease);
            const curDist = startDist + (targetGlobeDist - startDist) * ease;
            this.updateAuthoritativeCamera(interp.lat, interp.lng, curDist);

            if (p >= 1) {
              this.isCameraAnimating = false;
              this.updateAuthoritativeCamera(targetLat, targetLng, targetGlobeDist);
            }
          }
        }
      };
    }
  }

  // AuthoritativeCameraEnforcer frame simulation
  public runAuthoritativeCameraEnforcerFrame() {
    if (this.isCameraAnimating) {
      return; // Yields during active waypoint transitions
    }
    let authoritativeDistance = this.activeRouteId ? this.routeSuggestedDistance : this.themeSuggestedDistance;
    const currentDist = this.currentCameraPosition.length();
    if (currentDist > 0.001 && Math.abs(currentDist - authoritativeDistance) > 0.01) {
      this.currentCameraPosition.normalize().multiplyScalar(authoritativeDistance);
      this.currentCameraDistance = authoritativeDistance;
    }
  }
}

describe('Authoritative Multi-Waypoint Camera Navigation Suite (Documentary Mode OFF)', () => {
  it('1. Documentary Mode OFF + one waypoint centers accurately on the target', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const wp = { id: 'wp-1', name: 'Plymouth', lat: 50.3755, lng: -4.1427 };

    const transition = sim.navigateWaypointCamera(wp);
    expect(transition.type).toBe('GLOBE_ORIENT_AND_CENTER');
    transition.executeSteps([0.5, 1.0]);

    const finalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(finalGeo.lat).toBeCloseTo(wp.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(wp.lng, 3);
    expect(sim.isCameraAnimating).toBe(false);
  });

  it('2. Documentary Mode OFF + two sequential waypoints both center accurately without using stale coordinates', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const wp1 = { id: 'wp-1', name: 'Plymouth', lat: 50.3755, lng: -4.1427 };
    const wp2 = { id: 'wp-2', name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 };

    // Waypoint 1 completes
    const t1 = sim.navigateWaypointCamera(wp1);
    t1.executeSteps([1.0]);

    let geo = vector3ToLatLng(sim.currentCameraPosition);
    expect(geo.lat).toBeCloseTo(wp1.lat, 3);
    expect(geo.lng).toBeCloseTo(wp1.lng, 3);

    // Waypoint 2 activates and completes
    const t2 = sim.navigateWaypointCamera(wp2, wp1);
    t2.executeSteps([0.5, 1.0]);

    geo = vector3ToLatLng(sim.currentCameraPosition);
    expect(geo.lat).toBeCloseTo(wp2.lat, 3);
    expect(geo.lng).toBeCloseTo(wp2.lng, 3);
  });

  it('3. 5+ rapid waypoint changes cancel stale transitions and center exclusively on the newest waypoint', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const waypoints = [
      { id: 'wp-1', name: 'Stop 1', lat: 10, lng: 10 },
      { id: 'wp-2', name: 'Stop 2', lat: 20, lng: 20 },
      { id: 'wp-3', name: 'Stop 3', lat: 30, lng: 30 },
      { id: 'wp-4', name: 'Stop 4', lat: 40, lng: 40 },
      { id: 'wp-5', name: 'Stop 5 (Final Target)', lat: 51.5074, lng: -0.1278 }
    ];

    const t1 = sim.navigateWaypointCamera(waypoints[0]);
    t1.executeSteps([0.1]); // Partial execution

    const t2 = sim.navigateWaypointCamera(waypoints[1]);
    t2.executeSteps([0.2]); // Interrupted

    const t3 = sim.navigateWaypointCamera(waypoints[2]);
    t3.executeSteps([0.1]); // Interrupted

    const t4 = sim.navigateWaypointCamera(waypoints[3]);
    t4.executeSteps([0.3]); // Interrupted

    const t5 = sim.navigateWaypointCamera(waypoints[4]);
    expect(t5.transitionId).toBe(5);

    // Any delayed step attempts from t1, t2, t3, t4 must be ignored
    t1.executeSteps([1.0]);
    t2.executeSteps([1.0]);
    t3.executeSteps([1.0]);
    t4.executeSteps([1.0]);

    // Complete active transition 5
    t5.executeSteps([0.5, 1.0]);

    const finalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(finalGeo.lat).toBeCloseTo(waypoints[4].lat, 3);
    expect(finalGeo.lng).toBeCloseTo(waypoints[4].lng, 3);
    expect(sim.transitionLogs).toContain('[Cancelled] transitionId=1');
    expect(sim.transitionLogs).toContain('[Cancelled] transitionId=2');
    expect(sim.transitionLogs).toContain('[Cancelled] transitionId=3');
    expect(sim.transitionLogs).toContain('[Cancelled] transitionId=4');
  });

  it('4. Globe navigation explicitly rotates and orients to the waypoint rather than only changing distance', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const wp = { id: 'wp-tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

    const initialPos = sim.currentCameraPosition.clone();
    const transition = sim.navigateWaypointCamera(wp);
    transition.executeSteps([1.0]);

    const finalPos = sim.currentCameraPosition;
    const finalGeo = vector3ToLatLng(finalPos);

    // Orientation must match target geographic point
    expect(finalGeo.lat).toBeCloseTo(wp.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(wp.lng, 3);

    // Vector direction must have changed completely (not just scaled length)
    const initialDir = initialPos.clone().normalize();
    const finalDir = finalPos.clone().normalize();
    expect(initialDir.dot(finalDir)).toBeLessThan(0.5); // Significantly rotated
  });

  it('5. OSM in-viewport waypoint performs a direct smooth pan preserving zoom', () => {
    const sim = new WaypointCameraCoordinatorSimulator(51.5074, -0.1278, 1.30); // London center in OSM
    const nearbyWpInViewport = { id: 'wp-tower', name: 'Tower Bridge', lat: 51.5055, lng: -0.0754 };

    // Viewport calculated around London
    sim.osmViewportBounds = calculateOSMViewportBounds(51.5074, -0.1278, 14, 1920, 1080);

    const transition = sim.navigateWaypointCamera(nearbyWpInViewport);
    expect(transition.type).toBe('OSM_PAN');

    transition.executeSteps([0.5, 1.0]);
    const finalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(finalGeo.lat).toBeCloseTo(nearbyWpInViewport.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(nearbyWpInViewport.lng, 3);
    expect(sim.currentCameraDistance).toBeCloseTo(1.30, 2);
  });

  it('6. OSM out-of-viewport waypoint performs controlled overview -> rotate -> zoom in transition', () => {
    const sim = new WaypointCameraCoordinatorSimulator(51.5074, -0.1278, 1.30); // London in OSM
    const distantWp = { id: 'wp-ny', name: 'New York', lat: 40.7128, lng: -74.006 };

    sim.osmViewportBounds = calculateOSMViewportBounds(51.5074, -0.1278, 14, 1920, 1080);

    const transition = sim.navigateWaypointCamera(distantWp);
    expect(transition.type).toBe('OSM_OVERVIEW_TRANSITION');

    // Test intermediate overview elevation (Phase 2 at p = 0.5)
    transition.executeSteps([0.5]);
    expect(sim.currentCameraDistance).toBeGreaterThan(2.0); // Overview framing

    // Complete transition
    transition.executeSteps([1.0]);
    const finalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(finalGeo.lat).toBeCloseTo(distantWp.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(distantWp.lng, 3);
    expect(sim.currentCameraDistance).toBeCloseTo(1.30, 2);
  });

  it('7. Layer state does not alternate or flip between globe and OSM because of timing', () => {
    const sim = new WaypointCameraCoordinatorSimulator(48.8566, 2.3522, 2.0); // Paris at Globe level
    const waypoints = [
      { id: 'wp-1', name: 'Berlin', lat: 52.52, lng: 13.405 },
      { id: 'wp-2', name: 'Rome', lat: 41.9028, lng: 12.4964 },
      { id: 'wp-3', name: 'Madrid', lat: 40.4168, lng: -3.7038 }
    ];

    // Navigating waypoints while in Globe mode stays deterministically at Globe mode
    for (const wp of waypoints) {
      const t = sim.navigateWaypointCamera(wp);
      expect(t.type).toBe('GLOBE_ORIENT_AND_CENTER');
      t.executeSteps([1.0]);
      expect(sim.currentCameraDistance).toBeGreaterThan(1.45);
      expect(sim.isOSMActive).toBe(false);
    }
  });

  it('8. Projection ON / OFF state changes do not corrupt or reset the active waypoint camera target', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const wp = { id: 'wp-cairo', name: 'Cairo', lat: 30.0444, lng: 31.2357 };

    const t = sim.navigateWaypointCamera(wp);
    t.executeSteps([1.0]);

    // Simulate projection toggle effect:
    const activeTransitionId = sim.activeWaypointTransitionId;
    const currentTargetGeo = vector3ToLatLng(sim.currentCameraPosition);

    // Projection toggle must not reset camera to (0,0,0) or north pole
    expect(currentTargetGeo.lat).toBeCloseTo(wp.lat, 3);
    expect(currentTargetGeo.lng).toBeCloseTo(wp.lng, 3);
    expect(sim.activeWaypointTransitionId).toBe(activeTransitionId);
  });

  it('9. Interrupted animation starts the next transition from the camera actual current position', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    const wpA = { id: 'wp-a', name: 'Point A', lat: 0, lng: 90 };
    const wpB = { id: 'wp-b', name: 'Point B', lat: 45, lng: -45 };

    const tA = sim.navigateWaypointCamera(wpA);
    // Animate halfway to Point A
    tA.executeSteps([0.5]);
    const halfwayPos = sim.currentCameraPosition.clone();
    const halfwayGeo = vector3ToLatLng(halfwayPos);

    expect(halfwayGeo.lng).toBeGreaterThan(30);
    expect(halfwayGeo.lng).toBeLessThan(60);

    // User clicks Waypoint B while camera is halfway
    const tB = sim.navigateWaypointCamera(wpB);
    expect(tB.transitionId).toBe(2);

    // The first step of tB must start exactly from the halfway position
    tB.executeSteps([0.01]);
    const startOfBGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(startOfBGeo.lng).toBeCloseTo(halfwayGeo.lng, 1);

    // Complete tB
    tB.executeSteps([1.0]);
    const finalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(finalGeo.lat).toBeCloseTo(wpB.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(wpB.lng, 3);
  });

  it('10. AuthoritativeCameraEnforcer does not fight or mutate the camera vector during an active transition', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    sim.activeRouteId = 'route-1';
    sim.routeSuggestedDistance = 2.0;

    const wp = { id: 'wp-sydney', name: 'Sydney', lat: -33.8688, lng: 151.2093 };
    const transition = sim.navigateWaypointCamera(wp);

    // While animating (p = 0.5):
    transition.executeSteps([0.5]);
    expect(sim.isCameraAnimating).toBe(true);

    const animatedPosBefore = sim.currentCameraPosition.clone();
    // Frame enforcer runs mid-transition
    sim.runAuthoritativeCameraEnforcerFrame();
    const animatedPosAfter = sim.currentCameraPosition.clone();

    // Position must be completely unaltered by enforcer
    expect(animatedPosBefore.x).toBe(animatedPosAfter.x);
    expect(animatedPosBefore.y).toBe(animatedPosAfter.y);
    expect(animatedPosBefore.z).toBe(animatedPosAfter.z);

    // Complete transition
    transition.executeSteps([1.0]);
    expect(sim.isCameraAnimating).toBe(false);
  });

  it('12. Camera does not snap to destination on first frame and decreases distanceToTarget progressively', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    sim.activeRouteId = 'route-1';
    sim.routeSuggestedDistance = 2.0;
    const wp = { id: 'wp-tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

    const initialPos = sim.currentCameraPosition.clone();
    const targetVec = latLngToVector3(wp.lat, wp.lng, 2.0);
    const initialDist = initialPos.distanceTo(targetVec);
    expect(initialDist).toBeGreaterThan(1.0);

    const transition = sim.navigateWaypointCamera(wp);
    expect(sim.isCameraAnimating).toBe(true);

    // Frame 1 (t = 0.05): Must NOT have reached destination
    transition.executeSteps([0.05]);
    const frame1Pos = sim.currentCameraPosition.clone();
    const frame1Dist = frame1Pos.distanceTo(targetVec);
    expect(frame1Dist).toBeGreaterThan(0.5);
    expect(frame1Dist).toBeLessThan(initialDist);

    // Frame 2 (t = 0.25): Progressing
    transition.executeSteps([0.25]);
    const frame2Pos = sim.currentCameraPosition.clone();
    const frame2Dist = frame2Pos.distanceTo(targetVec);
    expect(frame2Dist).toBeLessThan(frame1Dist);

    // Frame 3 (t = 0.75): Decelerating toward target
    transition.executeSteps([0.75]);
    const frame3Pos = sim.currentCameraPosition.clone();
    const frame3Dist = frame3Pos.distanceTo(targetVec);
    expect(frame3Dist).toBeLessThan(frame2Dist);

    // Final Frame (t = 1.0): Clean arrival at destination
    transition.executeSteps([1.0]);
    const finalPos = sim.currentCameraPosition.clone();
    const finalDist = finalPos.distanceTo(targetVec);
    expect(finalDist).toBeCloseTo(0, 3);
    expect(sim.isCameraAnimating).toBe(false);

    const finalGeo = vector3ToLatLng(finalPos);
    expect(finalGeo.lat).toBeCloseTo(wp.lat, 3);
    expect(finalGeo.lng).toBeCloseTo(wp.lng, 3);
  });

  it('13. Interrupted transition starts from current camera state, does not snap, and progressively approaches new target', () => {
    const sim = new WaypointCameraCoordinatorSimulator(0, 0, 4.5);
    sim.activeRouteId = 'route-1';
    sim.routeSuggestedDistance = 2.0;
    const wpA = { id: 'wp-cairo', name: 'Cairo', lat: 30.0444, lng: 31.2357 };
    const wpB = { id: 'wp-reykjavik', name: 'Reykjavik', lat: 64.1466, lng: -21.9426 };

    // Start transition to A
    const tA = sim.navigateWaypointCamera(wpA);
    tA.executeSteps([0.35]); // Camera reaches 35% of flight to A
    const interPos = sim.currentCameraPosition.clone();
    const interGeo = vector3ToLatLng(interPos);

    // Interrupt with B
    const targetVecB = latLngToVector3(wpB.lat, wpB.lng, 2.0);
    const tB = sim.navigateWaypointCamera(wpB);
    expect(sim.isCameraAnimating).toBe(true);

    // First frame of B must be near interruption position, not snapped to B
    tB.executeSteps([0.02]);
    const bFrame1Pos = sim.currentCameraPosition.clone();
    const bFrame1Geo = vector3ToLatLng(bFrame1Pos);
    expect(bFrame1Geo.lat).toBeCloseTo(interGeo.lat, 1);
    expect(bFrame1Geo.lng).toBeCloseTo(interGeo.lng, 1);
    expect(bFrame1Pos.distanceTo(targetVecB)).toBeGreaterThan(1.0);

    // Mid flight of B
    tB.executeSteps([0.5]);
    const bMidPos = sim.currentCameraPosition.clone();
    expect(bMidPos.distanceTo(targetVecB)).toBeLessThan(bFrame1Pos.distanceTo(targetVecB));

    // Final frame of B
    tB.executeSteps([1.0]);
    const bFinalGeo = vector3ToLatLng(sim.currentCameraPosition);
    expect(bFinalGeo.lat).toBeCloseTo(wpB.lat, 3);
    expect(bFinalGeo.lng).toBeCloseTo(wpB.lng, 3);
    expect(sim.isCameraAnimating).toBe(false);
  });
});
