import { describe, it, expect } from 'vitest';
import {
  calculateProgressiveZoomSensitivity,
  calculateMaxZoomStep,
  normalizeWheelDelta,
  calculateClampedZoomDelta
} from '../../utils/cameraZoomUtils';

describe('Camera Zoom & Wheel Input Architecture Suite', () => {
  describe('1. Wheel Delta Normalization', () => {
    it('preserves standard pixel delta unchanged (deltaMode 0)', () => {
      expect(normalizeWheelDelta(100, 0)).toBe(100);
      expect(normalizeWheelDelta(-120, 0)).toBe(-120);
    });

    it('scales line delta correctly (deltaMode 1)', () => {
      expect(normalizeWheelDelta(3, 1)).toBe(3 * 28);
      expect(normalizeWheelDelta(-4, 1)).toBe(-4 * 28);
    });

    it('scales page delta correctly (deltaMode 2)', () => {
      expect(normalizeWheelDelta(1, 2)).toBe(280);
      expect(normalizeWheelDelta(-1, 2)).toBe(-280);
    });

    it('handles NaN delta safely', () => {
      expect(normalizeWheelDelta(NaN, 0)).toBe(0);
    });
  });

  describe('2. Progressive Zoom Sensitivity', () => {
    it('provides higher sensitivity at global distances and lower sensitivity near ground', () => {
      const globalSens = calculateProgressiveZoomSensitivity(4.5);
      const continentalSens = calculateProgressiveZoomSensitivity(2.2);
      const atmosphericSens = calculateProgressiveZoomSensitivity(1.7);
      const osmTransitionSens = calculateProgressiveZoomSensitivity(1.45);
      const streetSens = calculateProgressiveZoomSensitivity(1.1);

      expect(globalSens).toBeGreaterThan(continentalSens);
      expect(continentalSens).toBeGreaterThan(atmosphericSens);
      expect(atmosphericSens).toBeGreaterThan(osmTransitionSens);
      expect(osmTransitionSens).toBeGreaterThan(streetSens);
    });

    it('produces continuous and strictly positive values within expected bounds', () => {
      for (let d = 1.0; d <= 8.0; d += 0.25) {
        const s = calculateProgressiveZoomSensitivity(d);
        expect(s).toBeGreaterThan(0.0004);
        expect(s).toBeLessThan(0.0040);
      }
    });

    it('handles out-of-range or NaN distances safely', () => {
      expect(calculateProgressiveZoomSensitivity(NaN)).toBeGreaterThan(0);
      expect(calculateProgressiveZoomSensitivity(-5)).toBe(calculateProgressiveZoomSensitivity(1.0));
      expect(calculateProgressiveZoomSensitivity(100)).toBe(calculateProgressiveZoomSensitivity(8.0));
    });
  });

  describe('3. Maximum Zoom Step Clamping', () => {
    it('clamps maximum step proportionally to camera distance to prevent threshold skips', () => {
      const maxGlobal = calculateMaxZoomStep(4.5);
      const maxAtmospheric = calculateMaxZoomStep(1.70);
      const maxStreet = calculateMaxZoomStep(1.20);

      expect(maxGlobal).toBeGreaterThan(maxAtmospheric);
      expect(maxAtmospheric).toBeGreaterThan(maxStreet);

      // Max step in atmospheric range (~0.09) prevents skipping the 0.55 unit transition in a single gesture
      expect(maxAtmospheric).toBeLessThan(0.12);
    });
  });

  describe('4. Clamped Zoom Delta Calculations', () => {
    it('produces controlled camera-distance step for normal wheel gestures', () => {
      // Normal single wheel notch deltaY = -100
      const globalDelta = calculateClampedZoomDelta(-100, 0, 4.5);
      const atmosphericDelta = calculateClampedZoomDelta(-100, 0, 1.70);
      const streetDelta = calculateClampedZoomDelta(-100, 0, 1.20);

      expect(Math.abs(globalDelta)).toBeGreaterThan(Math.abs(atmosphericDelta));
      expect(Math.abs(atmosphericDelta)).toBeGreaterThan(Math.abs(streetDelta));

      // At atmospheric distance, a single normal wheel event changes distance by ~0.05-0.08 units
      expect(Math.abs(atmosphericDelta)).toBeGreaterThan(0.04);
      expect(Math.abs(atmosphericDelta)).toBeLessThan(0.10);
    });

    it('clamps huge wheel deltas (e.g. aggressive flick deltaY = -2000)', () => {
      const hugeDelta = calculateClampedZoomDelta(-2000, 0, 1.70);
      const maxAllowed = calculateMaxZoomStep(1.70);

      expect(hugeDelta).toBe(-maxAllowed);
    });

    it('requires multiple wheel steps to traverse the full atmospheric descent (1.90 -> 1.35)', () => {
      let currentDist = 1.90;
      let stepCount = 0;
      const normalWheelTick = -100; // Zooming in

      while (currentDist > 1.35 && stepCount < 30) {
        const delta = calculateClampedZoomDelta(normalWheelTick, 0, currentDist);
        currentDist += delta;
        stepCount++;
      }

      // Must require between 7 and 14 normal wheel clicks to traverse the atmospheric transition
      expect(stepCount).toBeGreaterThanOrEqual(7);
      expect(stepCount).toBeLessThanOrEqual(15);
    });
  });
});
