import { describe, it, expect } from "vitest";
import {
  OSM_ZOOM_LEVELS,
  OSM_ZOOM_DISTANCES,
  OSM_EXIT_ZOOM_OUT_DISTANCE,
  OSM_WHEEL_STEP_THRESHOLD,
  calculateOSMZoomStep,
  normalizeWheelDelta
} from "../../utils/cameraZoomUtils";
import { osmTileService } from "../geographic/osmTileService";

describe("OSM Discrete Mouse-Wheel Zoom Step Tests", () => {
  describe("Zoom-In Step Progression", () => {
    it("advances exactly one discrete zoom level per zoom-in gesture", () => {
      // 12 -> 14
      const step1 = calculateOSMZoomStep(12, "in");
      expect(step1.targetZoom).toBe(14);
      expect(step1.targetDistance).toBe(OSM_ZOOM_DISTANCES[14]);
      expect(step1.exitsOSM).toBe(false);

      // 14 -> 16
      const step2 = calculateOSMZoomStep(14, "in");
      expect(step2.targetZoom).toBe(16);
      expect(step2.targetDistance).toBe(OSM_ZOOM_DISTANCES[16]);
      expect(step2.exitsOSM).toBe(false);

      // 16 -> 18
      const step3 = calculateOSMZoomStep(16, "in");
      expect(step3.targetZoom).toBe(18);
      expect(step3.targetDistance).toBe(OSM_ZOOM_DISTANCES[18]);
      expect(step3.exitsOSM).toBe(false);

      // 18 -> 19
      const step4 = calculateOSMZoomStep(18, "in");
      expect(step4.targetZoom).toBe(19);
      expect(step4.targetDistance).toBe(OSM_ZOOM_DISTANCES[19]);
      expect(step4.exitsOSM).toBe(false);
    });

    it("clamps at maximum zoom level 19 on subsequent zoom-in gestures", () => {
      const stepMax = calculateOSMZoomStep(19, "in");
      expect(stepMax.targetZoom).toBe(19);
      expect(stepMax.targetDistance).toBe(OSM_ZOOM_DISTANCES[19]);
      expect(stepMax.exitsOSM).toBe(false);
    });
  });

  describe("Zoom-Out Step Progression", () => {
    it("reverses exactly one discrete zoom level per zoom-out gesture", () => {
      // 19 -> 18
      const step1 = calculateOSMZoomStep(19, "out");
      expect(step1.targetZoom).toBe(18);
      expect(step1.targetDistance).toBe(OSM_ZOOM_DISTANCES[18]);
      expect(step1.exitsOSM).toBe(false);

      // 18 -> 16
      const step2 = calculateOSMZoomStep(18, "out");
      expect(step2.targetZoom).toBe(16);
      expect(step2.targetDistance).toBe(OSM_ZOOM_DISTANCES[16]);
      expect(step2.exitsOSM).toBe(false);

      // 16 -> 14
      const step3 = calculateOSMZoomStep(16, "out");
      expect(step3.targetZoom).toBe(14);
      expect(step3.targetDistance).toBe(OSM_ZOOM_DISTANCES[14]);
      expect(step3.exitsOSM).toBe(false);

      // 14 -> 12
      const step4 = calculateOSMZoomStep(14, "out");
      expect(step4.targetZoom).toBe(12);
      expect(step4.targetDistance).toBe(OSM_ZOOM_DISTANCES[12]);
      expect(step4.exitsOSM).toBe(false);
    });

    it("signals OSM exit and transitions to globe distance when zooming out below zoom 12", () => {
      const exitStep = calculateOSMZoomStep(12, "out");
      expect(exitStep.targetZoom).toBe(12);
      expect(exitStep.targetDistance).toBe(OSM_EXIT_ZOOM_OUT_DISTANCE);
      expect(exitStep.targetDistance).toBeGreaterThanOrEqual(1.55);
      expect(exitStep.exitsOSM).toBe(true);
    });
  });

  describe("Direction and Delta Semantics", () => {
    it("accepts negative numeric delta as zoom-in", () => {
      const step = calculateOSMZoomStep(14, -100);
      expect(step.targetZoom).toBe(16);
      expect(step.targetDistance).toBe(OSM_ZOOM_DISTANCES[16]);
      expect(step.exitsOSM).toBe(false);
    });

    it("accepts positive numeric delta as zoom-out", () => {
      const step = calculateOSMZoomStep(16, 100);
      expect(step.targetZoom).toBe(14);
      expect(step.targetDistance).toBe(OSM_ZOOM_DISTANCES[14]);
      expect(step.exitsOSM).toBe(false);
    });

    it("recovers gracefully from non-standard initial zoom levels", () => {
      // Zoom 10 clamped to 12
      const stepLow = calculateOSMZoomStep(10, "in");
      expect(stepLow.targetZoom).toBe(14);

      // Zoom 22 clamped to 19
      const stepHigh = calculateOSMZoomStep(22, "out");
      expect(stepHigh.targetZoom).toBe(18);
    });
  });

  describe("Authoritative Camera Distance Consistency", () => {
    it("verifies that each zoom level distance is within the stable hysteresis band of osmTileService", () => {
      for (const zoom of OSM_ZOOM_LEVELS) {
        const dist = OSM_ZOOM_DISTANCES[zoom];
        expect(dist).toBeDefined();

        const check = osmTileService.getNextAdjacentTileZoom(zoom, dist);
        expect(check.nextZoom).toBe(zoom);
        expect(check.reason).toBe("HYSTERESIS");
      }
    });

    it("verifies that OSM_EXIT_ZOOM_OUT_DISTANCE is above the OSM transition threshold", () => {
      expect(OSM_EXIT_ZOOM_OUT_DISTANCE).toBeGreaterThan(1.55);
    });
  });

  describe("Wheel Normalization & Accumulation Invariants", () => {
    it("normalizes pixel and line mode wheel deltas correctly", () => {
      const pixelDelta = normalizeWheelDelta(-100, 0);
      expect(pixelDelta).toBe(-100);

      const lineDelta = normalizeWheelDelta(-3, 1);
      expect(lineDelta).toBe(-84);

      const pageDelta = normalizeWheelDelta(1, 2);
      expect(pageDelta).toBe(280);
    });

    it("single normal mouse-wheel notch exceeds OSM_WHEEL_STEP_THRESHOLD to trigger 1 step", () => {
      const singleNotch = Math.abs(normalizeWheelDelta(-100, 0));
      expect(singleNotch).toBeGreaterThanOrEqual(OSM_WHEEL_STEP_THRESHOLD);

      const firefoxNotch = Math.abs(normalizeWheelDelta(-3, 1));
      expect(firefoxNotch).toBeGreaterThanOrEqual(OSM_WHEEL_STEP_THRESHOLD);
    });

    it("small trackpad micro-deltas accumulate to trigger exactly 1 step without skipping", () => {
      const trackpadDeltas = [-5, -8, -12, -15, -12]; // sum = -52
      let accumulated = 0;
      let stepsTriggered = 0;

      for (const d of trackpadDeltas) {
        accumulated += d;
        if (Math.abs(accumulated) >= OSM_WHEEL_STEP_THRESHOLD) {
          stepsTriggered++;
          accumulated = 0;
        }
      }

      expect(stepsTriggered).toBe(1);
    });

    it("identifies discrete physical mouse wheel events vs trackpad micro deltas", () => {
      const isDiscreteWheel = (rawDeltaY: number, deltaMode: number) => {
        const normalized = normalizeWheelDelta(rawDeltaY, deltaMode);
        return deltaMode !== 0 || Math.abs(rawDeltaY) >= 50 || Math.abs(normalized) >= 50;
      };

      // Physical mouse wheels:
      expect(isDiscreteWheel(-100, 0)).toBe(true);  // Standard Chrome/Safari notch
      expect(isDiscreteWheel(120, 0)).toBe(true);   // Standard Windows notch
      expect(isDiscreteWheel(-3, 1)).toBe(true);    // Firefox / Windows line scroll
      expect(isDiscreteWheel(1, 2)).toBe(true);     // Page scroll

      // Trackpad micro-deltas:
      expect(isDiscreteWheel(-4, 0)).toBe(false);
      expect(isDiscreteWheel(12, 0)).toBe(false);
      expect(isDiscreteWheel(-25, 0)).toBe(false);
    });
  });
});
