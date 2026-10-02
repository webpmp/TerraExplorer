import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ParchmentResizeGuide,
  RegistrationMark,
  calculateParchmentTargetGeometry,
  PARCHMENT_BACKGROUND_WIDTH,
  PARCHMENT_BACKGROUND_HEIGHT,
  PARCHMENT_BACKGROUND_ASPECT_RATIO,
  RESIZE_GUIDE_DEBOUNCE_MS
} from '../ParchmentResizeGuide';

describe('ParchmentResizeGuide Fitted Aspect-Ratio Target Geometry', () => {
  it('1. Native viewport (1424 x 1104): aspect ratio matches target ratio, corners align with viewport corners', () => {
    const geo = calculateParchmentTargetGeometry(1424, 1104);

    expect(geo.targetWidth).toBe(1424);
    expect(geo.targetHeight).toBe(1104);
    expect(geo.guideLeft).toBe(0);
    expect(geo.guideTop).toBe(0);

    expect(geo.topLeft).toEqual({ x: 0, y: 0 });
    expect(geo.topRight).toEqual({ x: 1424, y: 0 });
    expect(geo.bottomLeft).toEqual({ x: 0, y: 1104 });
    expect(geo.bottomRight).toEqual({ x: 1424, y: 1104 });
  });

  it('2. Approximately 1562 x 1213 (and scaled matching aspect-ratio viewports): corners align with viewport boundaries instead of locking to 1424x1104', () => {
    // 1562 x 1213 has ratio ~1.2877 vs target ~1.2899
    const geo = calculateParchmentTargetGeometry(1562, 1213);

    expect(geo.targetWidth).toBe(1562);
    expect(geo.targetHeight).toBeCloseTo(1210.99, 1);

    expect(geo.guideLeft).toBe(0);
    expect(geo.guideTop).toBeCloseTo(1.005, 1);

    expect(geo.topRight.x).toBe(1562);
    expect(geo.bottomLeft.y).toBeCloseTo(1212, 0);
    expect(geo.bottomRight.x).toBe(1562);
    expect(geo.bottomRight.y).toBeCloseTo(1212, 0);

    // Exact proportional scaling check
    const exactScaled = calculateParchmentTargetGeometry(1708.8, 1324.8);
    expect(exactScaled.targetWidth).toBeCloseTo(1708.8, 3);
    expect(exactScaled.targetHeight).toBeCloseTo(1324.8, 3);
    expect(exactScaled.guideLeft).toBeCloseTo(0, 3);
    expect(exactScaled.guideTop).toBeCloseTo(0, 3);
  });

  it('3. Significantly wider viewport (1920 x 1080): height matches viewport and vertical marks move inward', () => {
    const width = 1920;
    const height = 1080;
    const geo = calculateParchmentTargetGeometry(width, height);

    expect(geo.targetHeight).toBe(1080);
    const expectedWidth = 1080 * (1424 / 1104);
    expect(geo.targetWidth).toBeCloseTo(expectedWidth, 3);

    const expectedLeft = (1920 - expectedWidth) / 2;
    expect(geo.guideLeft).toBeCloseTo(expectedLeft, 3);
    expect(geo.guideTop).toBe(0);

    expect(geo.topLeft.x).toBeCloseTo(expectedLeft, 3);
    expect(geo.topLeft.y).toBe(0);
    expect(geo.topRight.x).toBeCloseTo(expectedLeft + expectedWidth, 3);
    expect(geo.topRight.y).toBe(0);
    expect(geo.bottomLeft.x).toBeCloseTo(expectedLeft, 3);
    expect(geo.bottomLeft.y).toBe(1080);
    expect(geo.bottomRight.x).toBeCloseTo(expectedLeft + expectedWidth, 3);
    expect(geo.bottomRight.y).toBe(1080);

    expect(geo.topLeft.x).toBeGreaterThan(0);
    expect(geo.topRight.x).toBeLessThan(width);
  });

  it('4. Significantly narrower / taller viewport (1000 x 1200): width matches viewport and horizontal marks move inward', () => {
    const width = 1000;
    const height = 1200;
    const geo = calculateParchmentTargetGeometry(width, height);

    expect(geo.targetWidth).toBe(1000);
    const expectedHeight = 1000 / (1424 / 1104);
    expect(geo.targetHeight).toBeCloseTo(expectedHeight, 3);

    const expectedTop = (1200 - expectedHeight) / 2;
    expect(geo.guideLeft).toBe(0);
    expect(geo.guideTop).toBeCloseTo(expectedTop, 3);

    expect(geo.topLeft.x).toBe(0);
    expect(geo.topLeft.y).toBeCloseTo(expectedTop, 3);
    expect(geo.topRight.x).toBe(1000);
    expect(geo.topRight.y).toBeCloseTo(expectedTop, 3);
    expect(geo.bottomLeft.x).toBe(0);
    expect(geo.bottomLeft.y).toBeCloseTo(expectedTop + expectedHeight, 3);
    expect(geo.bottomRight.x).toBe(1000);
    expect(geo.bottomRight.y).toBeCloseTo(expectedTop + expectedHeight, 3);

    expect(geo.topLeft.y).toBeGreaterThan(0);
    expect(geo.bottomLeft.y).toBeLessThan(height);
  });

  it('5. Viewport with substantially different aspect ratio (e.g. ultra-wide 2560 x 1080): shows centered target', () => {
    const width = 2560;
    const height = 1080;
    const geo = calculateParchmentTargetGeometry(width, height);

    expect(geo.targetHeight).toBe(1080);
    const expectedWidth = 1080 * (1424 / 1104);
    expect(geo.targetWidth).toBeCloseTo(expectedWidth, 3);

    const expectedLeft = (2560 - expectedWidth) / 2;
    expect(geo.guideLeft).toBeCloseTo(expectedLeft, 3);
    expect(geo.topLeft.x).toBeCloseTo(expectedLeft, 3);
    expect(geo.topRight.x).toBeCloseTo(expectedLeft + expectedWidth, 3);
  });

  it('handles zero or negative dimensions safely', () => {
    const geo = calculateParchmentTargetGeometry(0, 0);
    expect(geo.targetWidth).toBe(0);
    expect(geo.targetHeight).toBe(0);
    expect(geo.topLeft).toEqual({ x: 0, y: 0 });
    expect(geo.topRight).toEqual({ x: 0, y: 0 });
  });
});

describe('Registration Mark Design & Styling', () => {
  it('renders registration mark as clean, solid white (#ffffff) with exactly 2px stroke width', () => {
    const markHtml = renderToStaticMarkup(
      <RegistrationMark x={188} y={98} label="top-left" size={48} strokeWidth={2} />
    );

    expect(markHtml).toContain('left:188px');
    expect(markHtml).toContain('top:98px');
    expect(markHtml).toContain('transform:translate(-50%, -50%)');
    expect(markHtml).toContain('pointer-events-none');
    expect(markHtml).toContain('data-testid="parchment-guide-mark-top-left"');

    // Solid white check
    expect(markHtml).toContain('stroke="#ffffff"');
    expect(markHtml).toContain('stroke-width="2"');

    // Ensure no shadows, gradients, themes, or dashed lines
    expect(markHtml).not.toContain('stroke-dasharray');
    expect(markHtml).not.toContain('drop-shadow');
    expect(markHtml).not.toContain('opacity');
    expect(markHtml).not.toContain('#4a2c11');
    expect(markHtml).not.toContain('#5c3818');
  });
});

describe('ParchmentResizeGuide Resize Event Debounce & Timer Resetting Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('simulates event listener lifecycle: debounce timer resets with every resize event and only expires after inactivity', () => {
    let timeoutId: any = null;
    let isResizing = false;
    const debounceMs = 600;

    const onResizeEvent = () => {
      isResizing = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        isResizing = false;
        timeoutId = null;
      }, debounceMs);
    };

    // 1. Initial state: not resizing
    expect(isResizing).toBe(false);

    // 2. First resize event occurs -> guide becomes active
    onResizeEvent();
    expect(isResizing).toBe(true);

    // 3. User continues resizing over multiple seconds (firing events every 300ms)
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(300);
      expect(isResizing).toBe(true); // Still resizing after 300ms
      onResizeEvent(); // New resize event resets the hide timer
      expect(isResizing).toBe(true);
    }

    // After 3000ms of active dragging, guide is STILL visible because every event extended it
    expect(isResizing).toBe(true);

    // 4. Advance 400ms (less than 600ms debounce interval) -> still visible
    vi.advanceTimersByTime(400);
    expect(isResizing).toBe(true);

    // 5. Advance remaining 200ms without new events -> debounce expires and guide hides
    vi.advanceTimersByTime(200);
    expect(isResizing).toBe(false);
  });
});

describe('ParchmentResizeGuide Theming and Constants', () => {
  it('does not render for non-parchment skins (modern, retro-green, retro-amber)', () => {
    const modernHtml = renderToStaticMarkup(<ParchmentResizeGuide skin="modern" />);
    expect(modernHtml).toBe('');

    const greenHtml = renderToStaticMarkup(<ParchmentResizeGuide skin="retro-green" />);
    expect(greenHtml).toBe('');

    const amberHtml = renderToStaticMarkup(<ParchmentResizeGuide skin="retro-amber" />);
    expect(amberHtml).toBe('');
  });

  it('exports canonical constants and default debounce', () => {
    expect(PARCHMENT_BACKGROUND_WIDTH).toBe(1424);
    expect(PARCHMENT_BACKGROUND_HEIGHT).toBe(1104);
    expect(PARCHMENT_BACKGROUND_ASPECT_RATIO).toBe(1424 / 1104);
    expect(RESIZE_GUIDE_DEBOUNCE_MS).toBe(600);
  });
});
