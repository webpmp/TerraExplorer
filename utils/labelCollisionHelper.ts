export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MarkerScreenTarget {
  id: string;
  x: number;
  y: number;
  radius: number; // visual radius in pixels
  hitRadius: number; // interactive hit radius in pixels (e.g. 20px for 40px hit area)
}

export type CandidatePlacement = 'UR' | 'UL' | 'LR' | 'LL' | 'T' | 'B';

export interface CandidateLayout {
  placement: CandidatePlacement;
  labelRect: ScreenRect;
  lineStart: { x: number; y: number };
  lineEnd: { x: number; y: number };
  svgBox: { left: number; top: number; width: number; height: number };
  svgLine: { x1: number; y1: number; x2: number; y2: number };
  labelOffset: { left: number; top: number };
  collisionPenalty: number;
  collisions: number;
  displacement: number;
}

export const CANDIDATE_DIRECTIONS: Array<{ placement: CandidatePlacement; dx: number; dy: number; labelAnchor: { x: number; y: number } }> = [
  { placement: 'UR', dx: 32, dy: -32, labelAnchor: { x: 0, y: 1 } },     // Bottom-left of label
  { placement: 'UL', dx: -32, dy: -32, labelAnchor: { x: 1, y: 1 } },    // Bottom-right of label
  { placement: 'LR', dx: 32, dy: 32, labelAnchor: { x: 0, y: 0 } },      // Top-left of label
  { placement: 'LL', dx: -32, dy: 32, labelAnchor: { x: 1, y: 0 } },     // Top-right of label
  { placement: 'T', dx: 0, dy: -42, labelAnchor: { x: 0.5, y: 1 } },     // Bottom-center of label
  { placement: 'B', dx: 0, dy: 42, labelAnchor: { x: 0.5, y: 0 } }       // Top-center of label
];

/**
 * Calculates overlap area between two axis-aligned bounding boxes
 */
export function calculateRectOverlap(r1: ScreenRect, r2: ScreenRect): number {
  const overlapWidth = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
  const overlapHeight = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
  return overlapWidth * overlapHeight;
}

/**
 * Tests if a rectangle overlaps with a circle (e.g. marker visual circle or hit area)
 */
export function rectIntersectsCircle(rect: ScreenRect, cx: number, cy: number, radius: number): boolean {
  const closestX = Math.max(rect.left, Math.min(cx, rect.right));
  const closestY = Math.max(rect.top, Math.min(cy, rect.bottom));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (radius * radius);
}

/**
 * Evaluates candidate label positions against other visible markers, other visible labels, and viewport bounds.
 */
export function evaluateLabelPlacement(
  targetMarker: { x: number; y: number; visualRadius: number; hitRadius: number; id: string },
  labelWidth: number,
  labelHeight: number,
  otherMarkers: MarkerScreenTarget[],
  otherLabels: ScreenRect[] = [],
  viewport: { width: number; height: number } = { width: 1920, height: 1080 }
): CandidateLayout {
  const markerX = targetMarker.x;
  const markerY = targetMarker.y;
  const pinRadius = Math.max(6, targetMarker.visualRadius);

  const candidates: CandidateLayout[] = [];

  for (const cand of CANDIDATE_DIRECTIONS) {
    // 1. Calculate anchor point where leader line meets label
    // dx and dy are starting offsets from marker center
    const mag = Math.hypot(cand.dx, cand.dy) || 1;
    const nx = cand.dx / mag;
    const ny = cand.dy / mag;

    // Line start at marker perimeter
    const lineStartX = nx * pinRadius;
    const lineStartY = ny * pinRadius;

    // Leader line end in relative coordinates from marker center
    const lineEndX = cand.dx;
    const lineEndY = cand.dy;

    // Compute label box in relative coordinates
    // Based on labelAnchor: {x: 0..1, y: 0..1} representing relative anchor point inside the label
    const labelRelativeLeft = lineEndX - (cand.labelAnchor.x * labelWidth);
    const labelRelativeTop = lineEndY - (cand.labelAnchor.y * labelHeight);

    // Screen-space label rectangle
    const labelRect: ScreenRect = {
      left: markerX + labelRelativeLeft,
      top: markerY + labelRelativeTop,
      right: markerX + labelRelativeLeft + labelWidth,
      bottom: markerY + labelRelativeTop + labelHeight,
      width: labelWidth,
      height: labelHeight
    };

    // Calculate SVG bounding box covering both the marker perimeter start point and lineEnd
    const minRelX = Math.min(lineStartX, lineEndX, 0) - 2;
    const maxRelX = Math.max(lineStartX, lineEndX, 0) + 2;
    const minRelY = Math.min(lineStartY, lineEndY, 0) - 2;
    const maxRelY = Math.max(lineStartY, lineEndY, 0) + 2;

    const svgBox = {
      left: minRelX,
      top: minRelY,
      width: Math.max(4, maxRelX - minRelX),
      height: Math.max(4, maxRelY - minRelY)
    };

    const svgLine = {
      x1: lineStartX - svgBox.left,
      y1: lineStartY - svgBox.top,
      x2: lineEndX - svgBox.left,
      y2: lineEndY - svgBox.top
    };

    // Collision evaluation
    let collisions = 0;
    let collisionPenalty = 0;

    // A. Collision with other visible markers (Highest Priority)
    for (const om of otherMarkers) {
      if (om.id === targetMarker.id) continue;
      // Test both hit area and visual radius
      const hitObstruction = rectIntersectsCircle(labelRect, om.x, om.y, om.hitRadius || 20);
      const visualObstruction = rectIntersectsCircle(labelRect, om.x, om.y, om.radius || 10);
      if (hitObstruction || visualObstruction) {
        collisions++;
        const dist = Math.hypot(markerX + labelRelativeLeft + labelWidth / 2 - om.x, markerY + labelRelativeTop + labelHeight / 2 - om.y);
        const severity = Math.max(1, 100 - dist);
        collisionPenalty += (visualObstruction ? 5000 : 2000) * severity;
      }
    }

    // B. Collision with other visible labels
    for (const ol of otherLabels) {
      const overlap = calculateRectOverlap(labelRect, ol);
      if (overlap > 0) {
        collisions++;
        collisionPenalty += 500 * (overlap / (labelWidth * labelHeight));
      }
    }

    // C. Viewport boundaries penalty
    const margin = 10;
    if (labelRect.left < margin) {
      collisionPenalty += 1000 * (margin - labelRect.left);
      collisions++;
    }
    if (labelRect.right > viewport.width - margin) {
      collisionPenalty += 1000 * (labelRect.right - (viewport.width - margin));
      collisions++;
    }
    if (labelRect.top < margin) {
      collisionPenalty += 1000 * (margin - labelRect.top);
      collisions++;
    }
    if (labelRect.bottom > viewport.height - margin) {
      collisionPenalty += 1000 * (labelRect.bottom - (viewport.height - margin));
      collisions++;
    }

    const displacement = Math.hypot(cand.dx, cand.dy);

    candidates.push({
      placement: cand.placement,
      labelRect,
      lineStart: { x: lineStartX, y: lineStartY },
      lineEnd: { x: lineEndX, y: lineEndY },
      svgBox,
      svgLine,
      labelOffset: { left: labelRelativeLeft, top: labelRelativeTop },
      collisionPenalty,
      collisions,
      displacement
    });
  }

  // Candidate priority index (UR = 0, UL = 1, LR = 2, LL = 3, T = 4, B = 5)
  const candidateIndexMap: Record<CandidatePlacement, number> = {
    UR: 0,
    UL: 1,
    LR: 2,
    LL: 3,
    T: 4,
    B: 5
  };

  // Sort candidates:
  // 1. 0 collisions first
  // 2. Lowest total collision penalty
  // 3. Smallest displacement / natural candidate preference (UR > UL > LR > LL > T > B)
  candidates.sort((a, b) => {
    if (a.collisions === 0 && b.collisions > 0) return -1;
    if (b.collisions === 0 && a.collisions > 0) return 1;
    if (Math.abs(a.collisionPenalty - b.collisionPenalty) > 0.001) {
      return a.collisionPenalty - b.collisionPenalty;
    }
    if (Math.abs(a.displacement - b.displacement) > 4) {
      return a.displacement - b.displacement;
    }
    return candidateIndexMap[a.placement] - candidateIndexMap[b.placement];
  });

  return candidates[0];
}
