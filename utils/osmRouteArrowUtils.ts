/**
 * OSM Route Connecting Path Directional Arrow Utilities
 *
 * Provides pure geometry, collision avoidance, and SVG polygon generation
 * for subtle directional arrows rendered on OpenStreetMap connecting paths.
 */

export const DEFAULT_ARROW_BACK_OFFSET = 14;
export const MARKER_CLEARANCE = 4;
export const LABEL_COLLISION_MARGIN = 6;
export const ARROW_LENGTH = 9;
export const ARROW_WIDTH = 6;
export const MIN_ARROW_SEGMENT_LENGTH = 20;

// Shared Route Connecting Line Dash & Visual Styling Constants (Single Source of Truth)
export const ROUTE_LINE_DASH_ARRAY = '4 2.67';
export const ROUTE_LINE_DASH_LENGTH = 4;
export const ROUTE_LINE_GAP_LENGTH = 2.67;
export const ROUTE_LINE_STROKE_WIDTH = 1.75;

import { SkinType, Waypoint } from '../types';
import * as THREE from 'three';
import { getConnectingLineColor } from './routeLineColor';
import { vector3ToLatLng, latLngToVector3 } from './globeCoordinates';
import { isRouteSequential } from './routeSequenceUtils';

export { isRouteSequential };

/**
 * Resolves the theme-aware opacity for connecting route lines and directional arrows across OSM and Globe.
 */
export function getRouteLineOpacity(theme: SkinType): number {
  return theme === 'modern' ? 0.95 : 0.9;
}

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

/**
 * Spherical linear interpolation between two unit vectors.
 */
export function slerpUnitVectors(v1: THREE.Vector3, v2: THREE.Vector3, t: number): THREE.Vector3 {
  const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
  const theta = Math.acos(dot);
  if (theta < 0.0001) {
    return v1.clone().lerp(v2, t).normalize();
  }
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;
  return new THREE.Vector3(
    v1.x * a + v2.x * b,
    v1.y * a + v2.y * b,
    v1.z * a + v2.z * b
  ).normalize();
}

export interface GlobeRouteGeometryOptions {
  waypoints: Waypoint[];
  skin: SkinType;
  markerPositions?: Map<string, THREE.Vector3>;
  lineRadius?: number;
  isSequential?: boolean;
  routeType?: string;
}

/**
 * Builds custom 3D BufferGeometry containing dashed line ribbons and directional arrows
 * for waypoint connecting lines on the 3D globe.
 * 
 * Reuses the exact same 6:4 dash ratio, stroke proportion, directional arrow aspect ratio (12:8),
 * placement, orientation, and theme-aware / contrast-aware colors as the OSM connecting line.
 */
export function buildGlobeRouteGeometry(
  options: GlobeRouteGeometryOptions
): THREE.BufferGeometry | null {
  const { waypoints, skin, markerPositions, lineRadius = 1.018, isSequential: explicitSequential, routeType } = options;
  if (!waypoints || waypoints.length < 2) return null;
  if (!isRouteSequential(waypoints, { isSequential: explicitSequential, routeType })) {
    return null;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  const globeRadius = 1.015;
  // Globe-specific scale factor (refined for subtle 1px-2px connecting line and small directional cues)
  const scale = 0.0008;
  const arrowLength = ARROW_LENGTH * scale; // ~0.0072 (proportions 9:6)
  const arrowWidth = ARROW_WIDTH * scale;   // ~0.0048
  const arrowBackOffset = DEFAULT_ARROW_BACK_OFFSET * scale; // ~0.0112
  const minSegmentLength = MIN_ARROW_SEGMENT_LENGTH * scale; // ~0.016

  const dashLength = ROUTE_LINE_DASH_LENGTH * scale; // ~0.0032
  const gapLength = ROUTE_LINE_GAP_LENGTH * scale;   // ~0.0021 (exact 1.5 dash:gap ratio)
  const cycleLength = dashLength + gapLength;        // ~0.0053
  const strokeWidth = ROUTE_LINE_STROKE_WIDTH * scale; // ~0.0014 (1.5px equivalent)
  const halfStroke = strokeWidth / 2;

  const defaultClearance = 0.010;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp1 = waypoints[i];
    const wp2 = waypoints[i + 1];

    if (
      typeof wp1.lat !== 'number' || typeof wp1.lng !== 'number' ||
      typeof wp2.lat !== 'number' || typeof wp2.lng !== 'number'
    ) {
      continue;
    }

    const startVec = (markerPositions?.get(wp1.id) || latLngToVector3(wp1.lat, wp1.lng, globeRadius)).clone().normalize();
    const endVec = (markerPositions?.get(wp2.id) || latLngToVector3(wp2.lat, wp2.lng, globeRadius)).clone().normalize();

    const angle = startVec.angleTo(endVec);
    if (angle < 0.0001) continue;

    const arcLength = angle * lineRadius;

    // Adaptively scale clearances for closely spaced waypoints so connecting line remains visible
    const startClearance = Math.min(defaultClearance, arcLength * 0.25);
    const endClearance = Math.min(defaultClearance, arcLength * 0.25);

    const hasArrow = arcLength >= minSegmentLength;

    let arrowBaseArc = arcLength - endClearance;

    // 1. Directional Arrow Geometry (pointing towards destination waypoint)
    if (hasArrow) {
      const sTip = Math.max(startClearance + arrowLength + 0.003, arcLength - arrowBackOffset);
      const sBase = sTip - arrowLength;
      arrowBaseArc = sBase;

      const tTip = sTip / arcLength;
      const tBase = sBase / arcLength;

      const pTip = slerpUnitVectors(startVec, endVec, tTip).multiplyScalar(lineRadius + 0.001);
      const pBase = slerpUnitVectors(startVec, endVec, tBase).multiplyScalar(lineRadius + 0.001);

      const norm = pBase.clone().normalize();
      const tangent = pTip.clone().sub(pBase).normalize();
      const bitangent = new THREE.Vector3().crossVectors(norm, tangent).normalize();

      const pLeft = pBase.clone().addScaledVector(bitangent, arrowWidth / 2).normalize().multiplyScalar(lineRadius + 0.001);
      const pRight = pBase.clone().addScaledVector(bitangent, -arrowWidth / 2).normalize().multiplyScalar(lineRadius + 0.001);

      const { lat: arrowLat, lng: arrowLng } = vector3ToLatLng(pTip);
      const arrowColorHex = getConnectingLineColor({
        theme: skin,
        mapLayer: 'globe',
        backgroundContext: { lat: arrowLat, lng: arrowLng }
      });
      const arrowColor = new THREE.Color(arrowColorHex);

      const tipIdx = vertexOffset;
      const leftIdx = vertexOffset + 1;
      const rightIdx = vertexOffset + 2;
      vertexOffset += 3;

      positions.push(pTip.x, pTip.y, pTip.z);
      positions.push(pLeft.x, pLeft.y, pLeft.z);
      positions.push(pRight.x, pRight.y, pRight.z);

      for (let k = 0; k < 3; k++) {
        normals.push(norm.x, norm.y, norm.z);
        colors.push(arrowColor.r, arrowColor.g, arrowColor.b);
      }

      indices.push(tipIdx, leftIdx, rightIdx);
      indices.push(tipIdx, rightIdx, leftIdx); // Double-sided
    }

    // 2. Dash Marks along Great Circle Arc (dashed pattern with rounded caps)
    const sStart = startClearance;
    const sEnd = hasArrow ? (arrowBaseArc - 0.003) : (arcLength - endClearance);
    const usableLength = sEnd - sStart;

    if (usableLength > 0.001) {
      const count = Math.max(1, Math.floor((usableLength + gapLength) / cycleLength));

      for (let j = 0; j < count; j++) {
        const d0 = sStart + j * cycleLength;
        const d1 = Math.min(sEnd, d0 + dashLength);
        if (d1 <= d0 + 0.0005) continue;

        const subSteps = 2; // 2 sub-quads per dash for spherical curvature
        const ringIndices: Array<[number, number]> = [];

        for (let m = 0; m <= subSteps; m++) {
          const dCurr = d0 + (m / subSteps) * (d1 - d0);
          const tCurr = dCurr / arcLength;
          const pCenter = slerpUnitVectors(startVec, endVec, tCurr).multiplyScalar(lineRadius);
          const norm = pCenter.clone().normalize();

          const tNext = Math.min(1.0, tCurr + 0.001);
          const pNext = slerpUnitVectors(startVec, endVec, tNext).multiplyScalar(lineRadius);
          const tangent = pNext.clone().sub(pCenter).normalize();
          const bitangent = new THREE.Vector3().crossVectors(norm, tangent).normalize();

          const vLeft = pCenter.clone().addScaledVector(bitangent, halfStroke);
          const vRight = pCenter.clone().addScaledVector(bitangent, -halfStroke);

          const { lat: dashLat, lng: dashLng } = vector3ToLatLng(pCenter);
          const dashColorHex = getConnectingLineColor({
            theme: skin,
            mapLayer: 'globe',
            backgroundContext: { lat: dashLat, lng: dashLng }
          });
          const dashColor = new THREE.Color(dashColorHex);

          const lIdx = vertexOffset;
          const rIdx = vertexOffset + 1;
          vertexOffset += 2;
          ringIndices.push([lIdx, rIdx]);

          positions.push(vLeft.x, vLeft.y, vLeft.z);
          positions.push(vRight.x, vRight.y, vRight.z);

          for (let k = 0; k < 2; k++) {
            normals.push(norm.x, norm.y, norm.z);
            colors.push(dashColor.r, dashColor.g, dashColor.b);
          }
        }

        // Quads between sub-steps
        for (let m = 0; m < subSteps; m++) {
          const [l0, r0] = ringIndices[m];
          const [l1, r1] = ringIndices[m + 1];

          indices.push(l0, r0, l1);
          indices.push(r0, r1, l1);
          // Double-sided
          indices.push(l0, l1, r0);
          indices.push(r0, l1, r1);
        }

        // Rounded End Caps (Fan triangles matching strokeLinecap="round")
        // Start Cap (m=0)
        const [startL, startR] = ringIndices[0];
        const tStart = d0 / arcLength;
        const pStartCenter = slerpUnitVectors(startVec, endVec, tStart).multiplyScalar(lineRadius);
        const startNorm = pStartCenter.clone().normalize();
        const tStartAhead = Math.min(1.0, tStart + 0.001);
        const pStartAhead = slerpUnitVectors(startVec, endVec, tStartAhead).multiplyScalar(lineRadius);
        const startTangent = pStartAhead.clone().sub(pStartCenter).normalize();
        const pStartCap = pStartCenter.clone().addScaledVector(startTangent, -halfStroke);

        const { lat: sLat, lng: sLng } = vector3ToLatLng(pStartCenter);
        const sColorHex = getConnectingLineColor({ theme: skin, mapLayer: 'globe', backgroundContext: { lat: sLat, lng: sLng } });
        const sColor = new THREE.Color(sColorHex);

        const startCapIdx = vertexOffset++;
        positions.push(pStartCap.x, pStartCap.y, pStartCap.z);
        normals.push(startNorm.x, startNorm.y, startNorm.z);
        colors.push(sColor.r, sColor.g, sColor.b);

        indices.push(startL, startR, startCapIdx);
        indices.push(startL, startCapIdx, startR);

        // End Cap (m=subSteps)
        const [endL, endR] = ringIndices[subSteps];
        const tEnd = d1 / arcLength;
        const pEndCenter = slerpUnitVectors(startVec, endVec, tEnd).multiplyScalar(lineRadius);
        const endNorm = pEndCenter.clone().normalize();
        const tEndAhead = Math.min(1.0, tEnd + 0.001);
        const pEndAhead = slerpUnitVectors(startVec, endVec, tEndAhead).multiplyScalar(lineRadius);
        const endTangent = pEndAhead.clone().sub(pEndCenter).normalize();
        const pEndCap = pEndCenter.clone().addScaledVector(endTangent, halfStroke);

        const { lat: eLat, lng: eLng } = vector3ToLatLng(pEndCenter);
        const eColorHex = getConnectingLineColor({ theme: skin, mapLayer: 'globe', backgroundContext: { lat: eLat, lng: eLng } });
        const eColor = new THREE.Color(eColorHex);

        const endCapIdx = vertexOffset++;
        positions.push(pEndCap.x, pEndCap.y, pEndCap.z);
        normals.push(endNorm.x, endNorm.y, endNorm.z);
        colors.push(eColor.r, eColor.g, eColor.b);

        indices.push(endL, endCapIdx, endR);
        indices.push(endL, endR, endCapIdx);
      }
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  return geometry;
}
