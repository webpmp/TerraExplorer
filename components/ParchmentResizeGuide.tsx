import React, { useState, useEffect, useRef } from 'react';
import { SkinType } from '../types';

export const PARCHMENT_BACKGROUND_WIDTH = 1424;
export const PARCHMENT_BACKGROUND_HEIGHT = 1104;
export const PARCHMENT_BACKGROUND_ASPECT_RATIO =
  PARCHMENT_BACKGROUND_WIDTH / PARCHMENT_BACKGROUND_HEIGHT; // ~1.289855072463768
export const RESIZE_GUIDE_DEBOUNCE_MS = 600;

export interface ParchmentNativeCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
  targetWidth: number;
  targetHeight: number;
  guideLeft: number;
  guideTop: number;
}

/**
 * Calculates the exact on-screen coordinates for the aspect-ratio target rectangle
 * centered in the current viewport.
 *
 * The guide represents the intended uncropped artwork area that fits within the viewport
 * while preserving the Parchment artwork's canonical aspect ratio (1424 / 1104):
 * - If the viewport is wider than the target aspect ratio, the target height matches
 *   the viewport height and the target width is (viewportHeight * PARCHMENT_BACKGROUND_ASPECT_RATIO),
 *   centered horizontally with guideLeft = (viewportWidth - targetWidth) / 2.
 * - If the viewport is taller/narrower than the target aspect ratio, the target width
 *   matches the viewport width and the target height is (viewportWidth / PARCHMENT_BACKGROUND_ASPECT_RATIO),
 *   centered vertically with guideTop = (viewportHeight - targetHeight) / 2.
 * - If the viewport aspect ratio matches the target ratio, target matches viewport (0, 0, W, H).
 */
export function calculateParchmentTargetGeometry(
  viewportWidth: number,
  viewportHeight: number,
  targetRatio: number = PARCHMENT_BACKGROUND_ASPECT_RATIO
): ParchmentNativeCorners {
  const safeVw = Math.max(0, viewportWidth);
  const safeVh = Math.max(0, viewportHeight);

  if (safeVw === 0 || safeVh === 0 || targetRatio <= 0) {
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      targetWidth: 0,
      targetHeight: 0,
      guideLeft: 0,
      guideTop: 0
    };
  }

  const currentRatio = safeVw / safeVh;
  let targetWidth: number;
  let targetHeight: number;

  if (currentRatio > targetRatio) {
    // Viewport is wider than target ratio: constrained by height
    targetHeight = safeVh;
    targetWidth = safeVh * targetRatio;
  } else {
    // Viewport is taller/narrower than target ratio: constrained by width
    targetWidth = safeVw;
    targetHeight = safeVw / targetRatio;
  }

  const guideLeft = (safeVw - targetWidth) / 2;
  const guideTop = (safeVh - targetHeight) / 2;

  return {
    topLeft: { x: guideLeft, y: guideTop },
    topRight: { x: guideLeft + targetWidth, y: guideTop },
    bottomLeft: { x: guideLeft, y: guideTop + targetHeight },
    bottomRight: { x: guideLeft + targetWidth, y: guideTop + targetHeight },
    targetWidth,
    targetHeight,
    guideLeft,
    guideTop
  };
}

interface ParchmentResizeGuideProps {
  skin: SkinType;
  debounceMs?: number;
}

/**
 * Registration Mark SVG: Clean, solid white + symbol whose center aligns exactly with the target coordinate.
 * - Solid white (#ffffff)
 * - Exactly 2px stroke width
 * - No transparency, no gradients, no theme colors, no shadows, no dashed lines
 * - pointer-events: none, visually isolated, print registration style
 */
export const RegistrationMark: React.FC<{
  x: number;
  y: number;
  label: string;
  size?: number;
  strokeWidth?: number;
}> = ({ x, y, label, size = 48, strokeWidth = 2 }) => {
  const halfSize = size / 2;
  return (
    <div
      data-testid={`parchment-guide-mark-${label}`}
      className="absolute pointer-events-none select-none transition-none"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        width: `${size}px`,
        height: `${size}px`,
        zIndex: 50
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full overflow-visible"
      >
        {/* Solid white horizontal stroke */}
        <line
          x1={0}
          y1={halfSize}
          x2={size}
          y2={halfSize}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
        />
        {/* Solid white vertical stroke */}
        <line
          x1={halfSize}
          y1={0}
          x2={halfSize}
          y2={size}
          stroke="#ffffff"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
        />
      </svg>
    </div>
  );
};

export const ParchmentResizeGuide: React.FC<ParchmentResizeGuideProps> = ({
  skin,
  debounceMs = RESIZE_GUIDE_DEBOUNCE_MS
}) => {
  if (skin !== 'parchment') {
    return null;
  }

  return <ParchmentResizeGuideInner debounceMs={debounceMs} />;
};

export const ParchmentResizeGuideInner: React.FC<{ debounceMs: number }> = ({ debounceMs }) => {
  const [isResizing, setIsResizing] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : PARCHMENT_BACKGROUND_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : PARCHMENT_BACKGROUND_HEIGHT
  }));

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
      setIsResizing(true);

      // Cancel previous hide timer on every incoming resize event
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Schedule new hide timer only after resize events stop
      timeoutRef.current = setTimeout(() => {
        setIsResizing(false);
        timeoutRef.current = null;
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [debounceMs]);

  if (!isResizing) {
    return null;
  }

  const geometry = calculateParchmentTargetGeometry(
    dimensions.width,
    dimensions.height,
    PARCHMENT_BACKGROUND_ASPECT_RATIO
  );

  return (
    <div
      data-testid="parchment-resize-guide"
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 45 }}
      aria-hidden="true"
    >
      <RegistrationMark x={geometry.topLeft.x} y={geometry.topLeft.y} label="top-left" strokeWidth={2} />
      <RegistrationMark x={geometry.topRight.x} y={geometry.topRight.y} label="top-right" strokeWidth={2} />
      <RegistrationMark x={geometry.bottomLeft.x} y={geometry.bottomLeft.y} label="bottom-left" strokeWidth={2} />
      <RegistrationMark x={geometry.bottomRight.x} y={geometry.bottomRight.y} label="bottom-right" strokeWidth={2} />
    </div>
  );
};

export default ParchmentResizeGuide;
