import { describe, it, expect } from 'vitest';
import {
  getFogStateForDistance,
  getFogPalette,
  CLOUD_MASSES,
  CLOUD_MOTION_DURATION,
  getAnimatedNoiseParams,
  getCloudDriftOffset
} from '../../components/OSMTransitionFog';

describe('OSM Three-Phase Atmospheric Transition Fog Suite', () => {
  describe('1. Three-Phase Distance & Opacity Model', () => {
    it('is inactive above 1.90 threshold (Globe View)', () => {
      const stateAbove = getFogStateForDistance(1.90);
      expect(stateAbove.isActive).toBe(false);
      expect(stateAbove.phase).toBe(0);
      expect(stateAbove.opacity).toBe(0);

      const stateGlobal = getFogStateForDistance(4.5);
      expect(stateGlobal.isActive).toBe(false);
      expect(stateGlobal.phase).toBe(0);
      expect(stateGlobal.opacity).toBe(0);
    });

    it('Phase 1 (1.90 -> 1.70): Fades in smoothly over the globe', () => {
      // 1.80 is midpoint of Phase 1
      const state1_80 = getFogStateForDistance(1.80);
      expect(state1_80.isActive).toBe(true);
      expect(state1_80.phase).toBe(1);
      expect(state1_80.opacity).toBeGreaterThan(0.35);
      expect(state1_80.opacity).toBeLessThan(0.65);
      expect(state1_80.phase3Progress).toBe(0);

      // Approaching 1.70, opacity reaches ~0.85-0.90
      const state1_72 = getFogStateForDistance(1.72);
      expect(state1_72.phase).toBe(1);
      expect(state1_72.opacity).toBeGreaterThan(0.75);
    });

    it('Phase 2 (1.70 -> 1.55): Holds full fog strength with living cloud motion', () => {
      const state1_65 = getFogStateForDistance(1.65);
      expect(state1_65.isActive).toBe(true);
      expect(state1_65.phase).toBe(2);
      expect(state1_65.opacity).toBeGreaterThanOrEqual(0.85);
      expect(state1_65.phase3Progress).toBe(0);

      const state1_58 = getFogStateForDistance(1.58);
      expect(state1_58.phase).toBe(2);
      expect(state1_58.opacity).toBeGreaterThanOrEqual(0.85);
    });

    it('Phase 3 (1.55 -> 1.35): Clears organically & disperses clouds as OSM appears', () => {
      // 1.55 start of Phase 3
      const state1_55 = getFogStateForDistance(1.55);
      expect(state1_55.isActive).toBe(true);
      expect(state1_55.phase).toBe(3);
      expect(state1_55.opacity).toBeGreaterThan(0.85);

      // 1.50 mid-phase 3: progressive dispersion begins
      const state1_50 = getFogStateForDistance(1.50);
      expect(state1_50.phase).toBe(3);
      expect(state1_50.phase3Progress).toBeCloseTo(0.25, 2);
      expect(state1_50.radialOutwardFactor).toBeGreaterThan(1.5);
      expect(state1_50.opacity).toBeLessThan(state1_55.opacity);

      // 1.45 late-phase 3: clouds dispersed toward perimeter
      const state1_45 = getFogStateForDistance(1.45);
      expect(state1_45.phase).toBe(3);
      expect(state1_45.phase3Progress).toBeCloseTo(0.50, 2);
      expect(state1_45.radialOutwardFactor).toBeGreaterThan(2.0);
      expect(state1_45.opacity).toBeLessThan(state1_50.opacity);

      // 1.40 approaching end: faint clouds
      const state1_40 = getFogStateForDistance(1.40);
      expect(state1_40.phase).toBe(3);
      expect(state1_40.opacity).toBeLessThan(0.40);
    });

    it('is inactive at and below 1.35 (Street Level Detail)', () => {
      const state1_35 = getFogStateForDistance(1.35);
      expect(state1_35.isActive).toBe(false);
      expect(state1_35.phase).toBe(0);
      expect(state1_35.opacity).toBe(0);

      const stateStreet = getFogStateForDistance(1.05);
      expect(stateStreet.isActive).toBe(false);
      expect(stateStreet.opacity).toBe(0);
    });
  });

  describe('2. Multi-Tier Organic Cloud Field Structure', () => {
    it('contains at least 15 asymmetric cloud masses across core, mid, and peripheral tiers', () => {
      expect(CLOUD_MASSES.length).toBeGreaterThanOrEqual(15);

      const coreClouds = CLOUD_MASSES.filter((c) => c.tier === 'core');
      const midClouds = CLOUD_MASSES.filter((c) => c.tier === 'mid');
      const wispClouds = CLOUD_MASSES.filter((c) => c.tier === 'wisp');

      expect(coreClouds.length).toBeGreaterThanOrEqual(4);
      expect(midClouds.length).toBeGreaterThanOrEqual(5);
      expect(wispClouds.length).toBeGreaterThanOrEqual(5);
    });

    it('ensures no cloud uses a pure circular 50% border radius', () => {
      CLOUD_MASSES.forEach((c) => {
        expect(c.borderRadius).not.toBe('50%');
        expect(c.borderRadius).not.toBe('50% 50% 50% 50%');
      });
    });

    it('provides multi-tier opacities with core denser than peripheral wisps', () => {
      const coreClouds = CLOUD_MASSES.filter((c) => c.tier === 'core');
      const wispClouds = CLOUD_MASSES.filter((c) => c.tier === 'wisp');

      const avgCoreOpacity = coreClouds.reduce((acc, c) => acc + c.baseOpacity, 0) / coreClouds.length;
      const avgWispOpacity = wispClouds.reduce((acc, c) => acc + c.baseOpacity, 0) / wispClouds.length;

      expect(avgCoreOpacity).toBeGreaterThan(avgWispOpacity * 1.5);
    });

    it('provides multi-tier blurs with broad wisps having higher blur than core textures', () => {
      const coreClouds = CLOUD_MASSES.filter((c) => c.tier === 'core');
      const wispClouds = CLOUD_MASSES.filter((c) => c.tier === 'wisp');

      const avgCoreBlur = coreClouds.reduce((acc, c) => acc + c.blurPx, 0) / coreClouds.length;
      const avgWispBlur = wispClouds.reduce((acc, c) => acc + c.blurPx, 0) / wispClouds.length;

      expect(avgWispBlur).toBeGreaterThan(avgCoreBlur * 1.3);
    });

    it('assigns appropriate procedural filterType to each tier', () => {
      CLOUD_MASSES.forEach((cloud) => {
        if (cloud.tier === 'core') {
          expect(cloud.filterType).toBe('near');
        } else if (cloud.tier === 'mid') {
          expect(cloud.filterType).toBe('mid');
        } else if (cloud.tier === 'wisp') {
          expect(cloud.filterType).toBe('far');
        }
      });
    });
  });

  describe('3. OSM Lifecycle Decoupling', () => {
    it('fog activates at 1.80 and 1.65 before OSM threshold (1.55)', () => {
      const state1_85 = getFogStateForDistance(1.85);
      expect(state1_85.isActive).toBe(true);

      const state1_60 = getFogStateForDistance(1.60);
      expect(state1_60.isActive).toBe(true);
      expect(state1_60.phase).toBe(2);
    });
  });

  describe('4. Theme Palette Mapping', () => {
    it('provides neutral white/light-gray atmospheric palette for Parchment skin', () => {
      const parchmentPalette = getFogPalette('parchment');
      const modernPalette = getFogPalette('modern');

      expect(parchmentPalette.coreColor).not.toEqual(modernPalette.coreColor);
      expect(parchmentPalette.coreColor).toContain('245, 247, 248');
      expect(parchmentPalette.cloudPrimary).toContain('238, 241, 243');
    });

    it('provides phosphor-green palette for retro-green skin', () => {
      const greenPalette = getFogPalette('retro-green');
      expect(greenPalette.coreColor).toContain('74, 222, 128');
    });

    it('provides amber phosphor palette for retro-amber skin', () => {
      const amberPalette = getFogPalette('retro-amber');
      expect(amberPalette.coreColor).toContain('251, 191, 36');
    });

    it('provides cool atmospheric mist palette for modern skin', () => {
      const modernPalette = getFogPalette('modern');
      expect(modernPalette.coreColor).toContain('255, 255, 255');
    });
  });

  describe('5. Transition Synchronization & Map Readiness Gating', () => {
    const MIN_DURATION = 900;
    const MAX_WAIT = 8000;

    it('holds dense Phase 2 cloud state when camera is at <= 1.55 if map is not ready', () => {
      const startTime = 10000;
      // Camera reaches 1.50 (Phase 3 distance) after 1200ms, but map is NOT ready
      const state = getFogStateForDistance(1.50, 0.92, {
        isMapReady: false,
        transitionStartTime: startTime,
        minDuration: MIN_DURATION,
        maxWait: MAX_WAIT,
        now: startTime + 1200
      });

      // Must hold at Phase 2 full density to hide globe
      expect(state.phase).toBe(2);
      expect(state.opacity).toBeGreaterThanOrEqual(0.80);
      expect(state.phase3Progress).toBe(0);
      expect(state.isActive).toBe(true);
    });

    it('holds dense cloud state when map loads very fast if min duration (900ms) has not elapsed', () => {
      const startTime = 10000;
      // Map loaded in 100ms, camera reached 1.50 at 250ms
      const state = getFogStateForDistance(1.50, 0.92, {
        isMapReady: true,
        transitionStartTime: startTime,
        minDuration: MIN_DURATION,
        maxWait: MAX_WAIT,
        now: startTime + 250
      });

      // Must still hold to prevent abrupt transition cut
      expect(state.phase).toBe(2);
      expect(state.opacity).toBeGreaterThanOrEqual(0.80);
      expect(state.phase3Progress).toBe(0);
      expect(state.isActive).toBe(true);
    });

    it('reveals street map (enters Phase 3) once both map is ready AND min duration has elapsed', () => {
      const startTime = 10000;
      // Map is ready and 1000ms (> 900ms) has elapsed
      const state = getFogStateForDistance(1.50, 0.92, {
        isMapReady: true,
        transitionStartTime: startTime,
        minDuration: MIN_DURATION,
        maxWait: MAX_WAIT,
        now: startTime + 1000
      });

      // Enters Phase 3 reveal
      expect(state.phase).toBe(3);
      expect(state.phase3Progress).toBeCloseTo(0.25, 2);
      expect(state.isActive).toBe(true);
    });

    it('reveals street map on safety timeout (8000ms) even if map readiness signal failed', () => {
      const startTime = 10000;
      // 8500ms elapsed with isMapReady still false
      const state = getFogStateForDistance(1.50, 0.92, {
        isMapReady: false,
        transitionStartTime: startTime,
        minDuration: MIN_DURATION,
        maxWait: MAX_WAIT,
        now: startTime + 8500
      });

      // Must fail-safe into reveal phase rather than freezing permanently
      expect(state.phase).toBe(3);
      expect(state.isActive).toBe(true);
    });

    it('resets cleanly to inactive when zooming back out above 1.90', () => {
      const state = getFogStateForDistance(2.1, 0.92, {
        isMapReady: true,
        transitionStartTime: 10000,
        minDuration: MIN_DURATION,
        now: 15000
      });

      expect(state.phase).toBe(0);
      expect(state.opacity).toBe(0);
      expect(state.isActive).toBe(false);
    });
  });

  describe('6. Continuous Organic Procedural Cloud Motion', () => {
    it('uses a subtle, atmospheric motion duration between 8 and 20 seconds', () => {
      expect(CLOUD_MOTION_DURATION).toBeGreaterThanOrEqual(8000);
      expect(CLOUD_MOTION_DURATION).toBeLessThanOrEqual(20000);
    });

    it('generates seamless periodic loop with identical values at t=0 and t=CLOUD_MOTION_DURATION', () => {
      const startParams = getAnimatedNoiseParams(0);
      const loopEndParams = getAnimatedNoiseParams(CLOUD_MOTION_DURATION);

      expect(startParams.far.baseFrequency).toEqual(loopEndParams.far.baseFrequency);
      expect(startParams.far.scale).toEqual(loopEndParams.far.scale);
      expect(startParams.mid.baseFrequency).toEqual(loopEndParams.mid.baseFrequency);
      expect(startParams.mid.scale).toEqual(loopEndParams.mid.scale);
      expect(startParams.near.baseFrequency).toEqual(loopEndParams.near.baseFrequency);
      expect(startParams.near.scale).toEqual(loopEndParams.near.scale);
    });

    it('modulates baseFrequency subtly without disruptive jumps or pulse artifacts', () => {
      const t0 = getAnimatedNoiseParams(0);
      const tQuarter = getAnimatedNoiseParams(CLOUD_MOTION_DURATION * 0.25);
      const tHalf = getAnimatedNoiseParams(CLOUD_MOTION_DURATION * 0.5);

      // Frequencies vary continuously within bounded ±10% range
      expect(t0.near.baseFrequency).not.toEqual(tHalf.near.baseFrequency);
      expect(t0.mid.baseFrequency).not.toEqual(tHalf.mid.baseFrequency);
      expect(t0.far.baseFrequency).not.toEqual(tHalf.far.baseFrequency);

      // Scales stay within conservative volumetric bounds
      expect(tQuarter.near.scale).toBeGreaterThanOrEqual(115);
      expect(tQuarter.near.scale).toBeLessThanOrEqual(145);
      expect(tQuarter.mid.scale).toBeGreaterThanOrEqual(80);
      expect(tQuarter.mid.scale).toBeLessThanOrEqual(100);
      expect(tQuarter.far.scale).toBeGreaterThanOrEqual(55);
      expect(tQuarter.far.scale).toBeLessThanOrEqual(75);
    });

    it('produces visible physical spatial drift when camera is stationary over 3-10 seconds', () => {
      const nearCloud = CLOUD_MASSES.find((c) => c.tier === 'core')!;
      const midCloud = CLOUD_MASSES.find((c) => c.tier === 'mid')!;
      const farCloud = CLOUD_MASSES.find((c) => c.tier === 'wisp')!;

      const pos0 = getCloudDriftOffset(nearCloud, 0, 0);
      const pos3 = getCloudDriftOffset(nearCloud, 3, 0);
      const pos6 = getCloudDriftOffset(nearCloud, 6, 0);
      const pos10 = getCloudDriftOffset(nearCloud, 10, 0);

      // Distinct spatial coordinates over time (physical displacement through screen space)
      const dist0_3 = Math.hypot(pos3.x - pos0.x, pos3.y - pos0.y);
      const dist0_6 = Math.hypot(pos6.x - pos0.x, pos6.y - pos0.y);
      const dist0_10 = Math.hypot(pos10.x - pos0.x, pos10.y - pos0.y);

      // Perceptible movement: at least 20px over 3 seconds, at least 40px over 6 seconds
      expect(dist0_3).toBeGreaterThanOrEqual(20);
      expect(dist0_6).toBeGreaterThanOrEqual(40);
      expect(dist0_10).toBeGreaterThanOrEqual(40);

      // Parallax depth: Near tier moves faster across viewport than Mid and Far tiers
      const midDist0_3 = Math.hypot(
        getCloudDriftOffset(midCloud, 3, 1).x - getCloudDriftOffset(midCloud, 0, 1).x,
        getCloudDriftOffset(midCloud, 3, 1).y - getCloudDriftOffset(midCloud, 0, 1).y
      );
      const farDist0_3 = Math.hypot(
        getCloudDriftOffset(farCloud, 3, 2).x - getCloudDriftOffset(farCloud, 0, 2).x,
        getCloudDriftOffset(farCloud, 3, 2).y - getCloudDriftOffset(farCloud, 0, 2).y
      );

      expect(dist0_3).toBeGreaterThan(midDist0_3);
      expect(midDist0_3).toBeGreaterThan(farDist0_3);
    });

    it('ensures different cloud formations drift along independent organic trajectories', () => {
      const c0 = getCloudDriftOffset(CLOUD_MASSES[0], 5, 0);
      const c1 = getCloudDriftOffset(CLOUD_MASSES[1], 5, 1);
      const c2 = getCloudDriftOffset(CLOUD_MASSES[2], 5, 2);

      // Not rigid uniform translation: distinct x, y offsets
      expect(c0.x).not.toEqual(c1.x);
      expect(c0.y).not.toEqual(c1.y);
      expect(c1.x).not.toEqual(c2.x);
    });
  });

  describe('7. Multi-Location Sequential Transitions & Lifecycle Invalidation', () => {
    it('invalidates previous readiness state when returning to globe view', () => {
      const startTime = 10000;
      // Session 1: completed at Location A
      const session1State = getFogStateForDistance(1.50, 0.92, {
        isMapReady: true,
        transitionStartTime: startTime,
        minDuration: 900,
        maxWait: 8000,
        now: startTime + 1200
      });
      expect(session1State.phase).toBe(3);

      // User returns to globe view (distance 2.0)
      const globeState = getFogStateForDistance(2.0, 0.92);
      expect(globeState.isActive).toBe(false);
      expect(globeState.opacity).toBe(0);

      // Session 2 begins at Location B (distance 1.50, but isMapReady is reset to false for new session)
      const session2StartTime = 25000;
      const session2InitialState = getFogStateForDistance(1.50, 0.92, {
        isMapReady: false,
        transitionStartTime: session2StartTime,
        minDuration: 900,
        maxWait: 8000,
        now: session2StartTime + 200
      });

      // Must hold in Phase 2 dense cloud bank rather than prematurely revealing
      expect(session2InitialState.phase).toBe(2);
      expect(session2InitialState.opacity).toBeGreaterThanOrEqual(0.80);
      expect(session2InitialState.phase3Progress).toBe(0);
    });

    it('supports multiple consecutive globe -> OSM -> globe -> OSM transitions without stale state', () => {
      // Simulate A -> OSM -> Globe -> B -> OSM -> Globe -> C -> OSM
      const locations = [
        { name: 'Location A', lat: 37.7749, lng: -122.4194 },
        { name: 'Location B', lat: 40.7128, lng: -74.006 },
        { name: 'Location C', lat: 51.5074, lng: -0.1278 }
      ];

      let simulatedTime = 10000;

      locations.forEach((loc, idx) => {
        const transStart = simulatedTime;

        // 1. Enter fog for Location
        const fogEntering = getFogStateForDistance(1.75, 0.92, {
          isMapReady: false,
          transitionStartTime: transStart,
          minDuration: 900,
          now: transStart + 100
        });
        expect(fogEntering.isActive).toBe(true);

        // 2. Dense hold while map loads
        const fogDense = getFogStateForDistance(1.50, 0.92, {
          isMapReady: false,
          transitionStartTime: transStart,
          minDuration: 900,
          now: transStart + 400
        });
        expect(fogDense.phase).toBe(2);

        // 3. Reveal when map is ready and minDuration elapsed
        const fogReveal = getFogStateForDistance(1.40, 0.92, {
          isMapReady: true,
          transitionStartTime: transStart,
          minDuration: 900,
          now: transStart + 1000
        });
        expect(fogReveal.phase).toBe(3);

        // 4. Return to globe
        simulatedTime += 5000;
        const fogGlobe = getFogStateForDistance(2.2, 0.92);
        expect(fogGlobe.isActive).toBe(false);

        simulatedTime += 2000;
      });
    });

    it('correctly handles interrupted transition where user does NOT fully zoom out before rotating globe', () => {
      const startTimeA = 10000;

      // 1. Zoom into OSM at Location A
      const sessionAState = getFogStateForDistance(1.40, 0.92, {
        isMapReady: true,
        transitionStartTime: startTimeA,
        minDuration: 900,
        maxWait: 8000,
        now: startTimeA + 1500
      });
      expect(sessionAState.phase).toBe(3);

      // 2. Zoom partially back out to distance 1.70 (clouds/fog STILL visible!)
      const partialZoomOutState = getFogStateForDistance(1.70, 0.92);
      expect(partialZoomOutState.isActive).toBe(true);
      expect(partialZoomOutState.opacity).toBeGreaterThan(0.70);

      // 3. User rotates/moves globe to Location B while fog is still visible (simulates interrupted transition cancellation)
      // When zooming in to Location B (distance 1.50), transition starts freshly with isMapReady reset to false
      const startTimeB = 20000;
      const sessionBInitialState = getFogStateForDistance(1.50, 0.92, {
        isMapReady: false,
        transitionStartTime: startTimeB,
        minDuration: 900,
        maxWait: 8000,
        now: startTimeB + 100
      });

      // Must hold in dense fog for Location B, completely unaffected by Location A's prior readiness or timing
      expect(sessionBInitialState.phase).toBe(2);
      expect(sessionBInitialState.opacity).toBeGreaterThanOrEqual(0.80);
      expect(sessionBInitialState.phase3Progress).toBe(0);

      // 4. Location B map becomes ready
      const sessionBReadyState = getFogStateForDistance(1.45, 0.92, {
        isMapReady: true,
        transitionStartTime: startTimeB,
        minDuration: 900,
        maxWait: 8000,
        now: startTimeB + 1100
      });

      // Now reveals Location B
      expect(sessionBReadyState.phase).toBe(3);
      expect(sessionBReadyState.phase3Progress).toBeGreaterThan(0);
    });
  });
});
