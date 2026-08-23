/**
 * OSM Route Connecting Path Directional Arrow Utilities
 *
 * Provides pure geometry, collision avoidance, and SVG polygon generation
 * for subtle directional arrows rendered on OpenStreetMap connecting paths.
 */

export const DEFAULT_ARROW_BACK_OFFSET = 22;
export const MARKER_CLEARANCE = 6;
export const LABEL_COLLISION_MARGIN = 8;
export const ARROW_LENGTH = 12;
export const ARROW_WIDTH = 8;
export const MIN_ARROW_SEGMENT_LENGTH = 32;

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OSMRouteArrowOptions {
  /** Screen position of start waypoint (sx1, sy1) */
  start: Point2D;
  /** Screen position of destination waypoint (sx2, sy2) */
  end: Point2D;
  /** Radius of start waypoint marker (default ~8px) */
  startMarkerRadius?: number;
  /** Radius of destination waypoint marker (default ~8px) */
  destinationMarkerRadius?: number;
  /** Visual screen center of destination marker if offset (defaults to end point) */
  destinationMarkerCenter?: Point2D;
  /** Estimated or rendered bounds of destination waypoint label (screen px) */
  destinationLabelBounds?: BoundingBox | null;
  /** Custom default backward offset from destination (defaults to DEFAULT_ARROW_BACK_OFFSET) */
  defaultBackOffset?: number;
  /** Minimum segment length required to show an arrow (defaults to MIN_ARROW_SEGMENT_LENGTH) */
  minSegmentLength?: number;
}

export interface OSMRouteArrowResult {
  /** Arrowhead tip position in screen px */
  tip: Point2D;
  /** Arrowhead base center position */
  baseCenter: Point2D;
  /** Polygon corner points for SVG rendering: [tip, leftCorner, rightCorner] */
  polygonPoints: [Point2D, Point2D, Point2D];
  /** Formatted SVG points string for <polygon points="..." /> */
  pointsString: string;
  /** Angle in radians pointing from start to end (Math.atan2(dy, dx)) */
  angleRad: number;
  /** Angle in degrees */
  angleDeg: number;
  /** Distance in px from destination waypoint */
  offsetFromDestination: number;
}

/**
 * Checks if a circle (center, radius) overlaps an axis-aligned bounding box.
 */
export function circleIntersectsRect(
  circleCenter: Point2D,
  circleRadius: number,
  rect: BoundingBox
): boolean {
  const closestX = Math.max(rect.left, Math.min(circleCenter.x, rect.right));
  const closestY = Math.max(rect.top, Math.min(circleCenter.y, rect.bottom));

  const distanceX = circleCenter.x - closestX;
  const distanceY = circleCenter.y - closestY;

  return distanceX * distanceX + distanceY * distanceY < circleRadius * circleRadius;
}

/**
 * Checks if a line segment between p1 and p2 intersects or comes within radius of a circle center.
 */
export function lineSegmentIntersectsCircle(
  p1: Point2D,
  p2: Point2D,
  circleCenter: Point2D,
  circleRadius: number
): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    const distSq =
      (p1.x - circleCenter.x) * (p1.x - circleCenter.x) +
      (p1.y - circleCenter.y) * (p1.y - circleCenter.y);
    return distSq < circleRadius * circleRadius;
  }

  // Projection scalar t of circleCenter onto segment p1-p2
  const t = Math.max(
    0,
    Math.min(
      1,
      ((circleCenter.x - p1.x) * dx + (circleCenter.y - p1.y) * dy) / lengthSq
    )
  );

  const closestX = p1.x + t * dx;
  const closestY = p1.y + t * dy;

  const distSq =
    (closestX - circleCenter.x) * (closestX - circleCenter.x) +
    (closestY - circleCenter.y) * (closestY - circleCenter.y);

  return distSq < circleRadius * circleRadius;
}

/**
 * Checks if a point lies within or on an axis-aligned bounding box.
 */
export function pointInRect(point: Point2D, rect: BoundingBox): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

/**
 * Checks if a point is inside a triangle defined by p1, p2, p3.
 */
export function pointInTriangle(pt: Point2D, p1: Point2D, p2: Point2D, p3: Point2D): boolean {
  const d1 = (pt.x - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (pt.y - p2.y);
  const d2 = (pt.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (pt.y - p3.y);
  const d3 = (pt.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (pt.y - p1.y);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

/**
 * Checks if a line segment between p1 and p2 intersects an axis-aligned bounding box.
 */
export function lineIntersectsRect(p1: Point2D, p2: Point2D, rect: BoundingBox): boolean {
  if (pointInRect(p1, rect) || pointInRect(p2, rect)) {
    return true;
  }

  // Check intersection with the 4 sides of the rectangle
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) {
    return false;
  }

  // Liang-Barsky / parametric clip test
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const p = [-dx, dx, -dy, dy];
  const q = [
    p1.x - rect.left,
    rect.right - p1.x,
    p1.y - rect.top,
    rect.bottom - p1.y
  ];

  let u1 = 0;
  let u2 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return false;
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return false;
        if (t < u2) u2 = t;
      }
    }
  }

  return u1 <= u2;
}

/**
 * Calculates SVG arrowhead corner vertices given tip point, orientation angle, length and width.
 */
export function calculateArrowheadCorners(
  tip: Point2D,
  angleRad: number,
  length: number = ARROW_LENGTH,
  width: number = ARROW_WIDTH
): { baseCenter: Point2D; leftCorner: Point2D; rightCorner: Point2D } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Base center is length units backward from tip
  const baseCenterX = tip.x - length * cos;
  const baseCenterY = tip.y - length * sin;

  const halfWidth = width / 2;
  // Perpendicular vector (-sin, cos)
  const leftX = baseCenterX + halfWidth * sin;
  const leftY = baseCenterY - halfWidth * cos;

  const rightX = baseCenterX - halfWidth * sin;
  const rightY = baseCenterY + halfWidth * cos;

  return {
    baseCenter: { x: baseCenterX, y: baseCenterY },
    leftCorner: { x: leftX, y: leftY },
    rightCorner: { x: rightX, y: rightY }
  };
}

/**
 * Checks whether the entire arrowhead polygon (tip, baseCenter, leftCorner, rightCorner, and bounding edges)
 * collides with the destination marker clearance zone or the expanded label bounding box.
 */
export function doesArrowheadCollide(
  tip: Point2D,
  angleRad: number,
  destMarkerCenter: Point2D,
  destMarkerForbiddenRadius: number,
  expandedLabelBounds: BoundingBox | null
): boolean {
  const { baseCenter, leftCorner, rightCorner } = calculateArrowheadCorners(
    tip,
    angleRad,
    ARROW_LENGTH,
    ARROW_WIDTH
  );

  const pointsToCheck = [tip, baseCenter, leftCorner, rightCorner];

  // 1. Check marker forbidden zone (vertices + edges + inside check)
  for (const pt of pointsToCheck) {
    const distSq =
      (pt.x - destMarkerCenter.x) * (pt.x - destMarkerCenter.x) +
      (pt.y - destMarkerCenter.y) * (pt.y - destMarkerCenter.y);
    if (distSq < destMarkerForbiddenRadius * destMarkerForbiddenRadius) {
      return true;
    }
  }

  if (
    lineSegmentIntersectsCircle(tip, leftCorner, destMarkerCenter, destMarkerForbiddenRadius) ||
    lineSegmentIntersectsCircle(tip, rightCorner, destMarkerCenter, destMarkerForbiddenRadius) ||
    lineSegmentIntersectsCircle(leftCorner, rightCorner, destMarkerCenter, destMarkerForbiddenRadius)
  ) {
    return true;
  }

  // 2. Check expanded label bounding box (vertices + edges + containment)
  if (expandedLabelBounds) {
    for (const pt of pointsToCheck) {
      if (pointInRect(pt, expandedLabelBounds)) {
        return true;
      }
    }
    // Check if any arrowhead edges intersect the rectangle
    if (
      lineIntersectsRect(tip, leftCorner, expandedLabelBounds) ||
      lineIntersectsRect(tip, rightCorner, expandedLabelBounds) ||
      lineIntersectsRect(leftCorner, rightCorner, expandedLabelBounds)
    ) {
      return true;
    }

    // Check if any corner of the expanded label is inside the arrowhead triangle
    const labelCorners: Point2D[] = [
      { x: expandedLabelBounds.left, y: expandedLabelBounds.top },
      { x: expandedLabelBounds.right, y: expandedLabelBounds.top },
      { x: expandedLabelBounds.left, y: expandedLabelBounds.bottom },
      { x: expandedLabelBounds.right, y: expandedLabelBounds.bottom }
    ];
    for (const corner of labelCorners) {
      if (pointInTriangle(corner, tip, leftCorner, rightCorner)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculates estimated label bounding box in screen pixels given marker anchor coordinate,
 * displayName, pin size, and theme/styling characteristics.
 */
export function estimateOSMLabelBounds(
  markerScreenPos: Point2D,
  displayName: string,
  pinSize: number = 16,
  labelPlacement: 'top' | 'bottom' | 'left' | 'right' = 'top'
): BoundingBox {
  // Approximate width based on 12px bold font + padding (px-2.5 = 10px on each side + border)
  const approxTextWidth = Math.max(30, displayName.length * 7.5);
  const totalWidth = approxTextWidth + 24;
  const totalHeight = 24; // text-xs font-bold + py-1 padding + border

  const centerX = markerScreenPos.x;
  const centerY = markerScreenPos.y;

  if (labelPlacement === 'bottom') {
    const top = centerY + pinSize / 2 + 8;
    return {
      left: centerX - totalWidth / 2,
      top: top,
      right: centerX + totalWidth / 2,
      bottom: top + totalHeight
    };
  }

  if (labelPlacement === 'left') {
    const right = centerX - pinSize / 2 - 8;
    return {
      left: right - totalWidth,
      top: centerY - totalHeight / 2,
      right: right,
      bottom: centerY + totalHeight / 2
    };
  }

  if (labelPlacement === 'right') {
    const left = centerX + pinSize / 2 + 8;
    return {
      left: left,
      top: centerY - totalHeight / 2,
      right: left + totalWidth,
      bottom: centerY + totalHeight / 2
    };
  }

  // Default 'top' placement (positioned above pin with bottom: pinSize / 2 + 8px)
  const bottom = centerY - (pinSize / 2 + 8);
  const top = bottom - totalHeight;
  return {
    left: centerX - totalWidth / 2,
    top: top,
    right: centerX + totalWidth / 2,
    bottom: bottom
  };
}

/**
 * Computes subtle directional arrow geometry and placement for an OSM connecting route segment.
 *
 * Returns `null` if the segment is too short or if clearance cannot be achieved within segment bounds.
 */
export function calculateOSMRouteArrow(
  options: OSMRouteArrowOptions
): OSMRouteArrowResult | null {
  const {
    start,
    end,
    startMarkerRadius = 8,
    destinationMarkerRadius = 8,
    destinationMarkerCenter = end,
    destinationLabelBounds = null,
    defaultBackOffset = DEFAULT_ARROW_BACK_OFFSET,
    minSegmentLength = MIN_ARROW_SEGMENT_LENGTH
  } = options;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength < minSegmentLength) {
    return null;
  }

  // Normalized path direction vector pointing start -> end
  const dirX = dx / segmentLength;
  const dirY = dy / segmentLength;
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Destination marker clearance zone
  const destMarkerForbiddenRadius = destinationMarkerRadius + MARKER_CLEARANCE;

  // Start marker clearance boundary (arrow base must not touch start marker zone)
  const startMarkerClearance = startMarkerRadius + MARKER_CLEARANCE + ARROW_LENGTH + 2;

  // Expanded label bounds with safety margin
  let expandedLabelBounds: BoundingBox | null = null;
  if (destinationLabelBounds) {
    expandedLabelBounds = {
      left: destinationLabelBounds.left - LABEL_COLLISION_MARGIN,
      top: destinationLabelBounds.top - LABEL_COLLISION_MARGIN,
      right: destinationLabelBounds.right + LABEL_COLLISION_MARGIN,
      bottom: destinationLabelBounds.bottom + LABEL_COLLISION_MARGIN
    };
  }

  // Start at initial back-offset from destination
  let currentOffset = Math.max(destMarkerForbiddenRadius + 2, defaultBackOffset);
  const maxAllowedOffset = segmentLength - startMarkerClearance;

  if (currentOffset > maxAllowedOffset) {
    currentOffset = maxAllowedOffset;
  }

  // Step backward along segment until no collision occurs
  const stepSize = 2; // px step for collision resolution
  let collisionFound = true;
  let resolvedTip: Point2D = { x: 0, y: 0 };

  while (currentOffset <= maxAllowedOffset) {
    // Tip position on the segment line
    const tipX = end.x - currentOffset * dirX;
    const tipY = end.y - currentOffset * dirY;
    const candidateTip = { x: tipX, y: tipY };

    const collides = doesArrowheadCollide(
      candidateTip,
      angleRad,
      destinationMarkerCenter,
      destMarkerForbiddenRadius,
      expandedLabelBounds
    );

    if (!collides) {
      collisionFound = false;
      resolvedTip = candidateTip;
      break;
    }

    currentOffset += stepSize;
  }

  if (collisionFound) {
    // Cannot place arrow on the segment without colliding with marker or label
    return null;
  }

  const { baseCenter, leftCorner, rightCorner } = calculateArrowheadCorners(
    resolvedTip,
    angleRad,
    ARROW_LENGTH,
    ARROW_WIDTH
  );

  const pTip = { x: Math.round(resolvedTip.x * 100) / 100, y: Math.round(resolvedTip.y * 100) / 100 };
  const pLeft = { x: Math.round(leftCorner.x * 100) / 100, y: Math.round(leftCorner.y * 100) / 100 };
  const pRight = { x: Math.round(rightCorner.x * 100) / 100, y: Math.round(rightCorner.y * 100) / 100 };

  const pointsString = `${pTip.x},${pTip.y} ${pLeft.x},${pLeft.y} ${pRight.x},${pRight.y}`;

  return {
    tip: resolvedTip,
    baseCenter,
    polygonPoints: [pTip, pLeft, pRight],
    pointsString,
    angleRad,
    angleDeg,
    offsetFromDestination: currentOffset
  };
}
