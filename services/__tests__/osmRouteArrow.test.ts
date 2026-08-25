import { describe, it, expect } from 'vitest';
import {
  calculateOSMRouteArrow,
  calculateArrowheadCorners,
  estimateOSMLabelBounds,
  doesArrowheadCollide,
  DEFAULT_ARROW_BACK_OFFSET,
  MARKER_CLEARANCE,
  LABEL_COLLISION_MARGIN,
  ARROW_LENGTH,
  ARROW_WIDTH,
  MIN_ARROW_SEGMENT_LENGTH
} from '../../utils/osmRouteArrowUtils';

describe('OSM Route Connecting Path Directional Arrow Suite', () => {
  it('Test 1: Direction - Arrow from (0, 0) to (100, 0) points right (0 rad / 0 deg)', () => {
    const result = calculateOSMRouteArrow({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });

    expect(result).not.toBeNull();
    expect(result!.angleRad).toBeCloseTo(0, 5);
    expect(result!.angleDeg).toBeCloseTo(0, 5);
    // Tip should be located on horizontal line at y=0, with x < 100
    expect(result!.tip.y).toBeCloseTo(0, 5);
    expect(result!.tip.x).toBeCloseTo(100 - DEFAULT_ARROW_BACK_OFFSET, 1);
    // Base center should be behind tip (further left, smaller x)
    expect(result!.baseCenter.x).toBeLessThan(result!.tip.x);
    expect(result!.baseCenter.y).toBeCloseTo(0, 5);
  });

  it('Test 2: Direction - Arrow from (100, 0) to (0, 0) points left (PI rad / 180 deg)', () => {
    const result = calculateOSMRouteArrow({
      start: { x: 100, y: 0 },
      end: { x: 0, y: 0 }
    });

    expect(result).not.toBeNull();
    expect(result!.angleRad).toBeCloseTo(Math.PI, 5);
    expect(result!.angleDeg).toBeCloseTo(180, 5);
    // Tip should be at x > 0 along line
    expect(result!.tip.x).toBeCloseTo(DEFAULT_ARROW_BACK_OFFSET, 1);
    expect(result!.tip.y).toBeCloseTo(0, 5);
    // Base center should be to the right of tip (larger x)
    expect(result!.baseCenter.x).toBeGreaterThan(result!.tip.x);
  });

  it('Test 3: Direction - Vertical paths (downward and upward)', () => {
    // Downward: (50, 0) -> (50, 100) => angle is PI/2 rad (90 deg)
    const downResult = calculateOSMRouteArrow({
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 }
    });
    expect(downResult).not.toBeNull();
    expect(downResult!.angleRad).toBeCloseTo(Math.PI / 2, 5);
    expect(downResult!.angleDeg).toBeCloseTo(90, 5);
    expect(downResult!.tip.x).toBeCloseTo(50, 5);
    expect(downResult!.tip.y).toBeCloseTo(100 - DEFAULT_ARROW_BACK_OFFSET, 1);
    expect(downResult!.baseCenter.y).toBeLessThan(downResult!.tip.y);

    // Upward: (50, 100) -> (50, 0) => angle is -PI/2 rad (-90 deg)
    const upResult = calculateOSMRouteArrow({
      start: { x: 50, y: 100 },
      end: { x: 50, y: 0 }
    });
    expect(upResult).not.toBeNull();
    expect(upResult!.angleRad).toBeCloseTo(-Math.PI / 2, 5);
    expect(upResult!.angleDeg).toBeCloseTo(-90, 5);
    expect(upResult!.tip.x).toBeCloseTo(50, 5);
    expect(upResult!.tip.y).toBeCloseTo(DEFAULT_ARROW_BACK_OFFSET, 1);
    expect(upResult!.baseCenter.y).toBeGreaterThan(upResult!.tip.y);
  });

  it('Test 4: Direction - Diagonal 45 degree path rotates arrowhead corners correctly', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 100 };
    const result = calculateOSMRouteArrow({ start, end });

    expect(result).not.toBeNull();
    expect(result!.angleRad).toBeCloseTo(Math.PI / 4, 5);
    expect(result!.angleDeg).toBeCloseTo(45, 5);

    // Verify points string contains 3 vertices
    const pts = result!.pointsString.split(' ');
    expect(pts.length).toBe(3);

    // Verify polygon vertices form a symmetric arrowhead around the route vector
    const [tip, left, right] = result!.polygonPoints;
    const midBaseX = (left.x + right.x) / 2;
    const midBaseY = (left.y + right.y) / 2;
    expect(midBaseX).toBeCloseTo(result!.baseCenter.x, 1);
    expect(midBaseY).toBeCloseTo(result!.baseCenter.y, 1);
  });

  it('Test 5: Arrow position - default placement is approximately 22px back from destination', () => {
    const result = calculateOSMRouteArrow({
      start: { x: 100, y: 100 },
      end: { x: 300, y: 100 }
    });

    expect(result).not.toBeNull();
    expect(result!.offsetFromDestination).toBeCloseTo(DEFAULT_ARROW_BACK_OFFSET, 1);
    expect(result!.tip.x).toBeCloseTo(300 - DEFAULT_ARROW_BACK_OFFSET, 1);
  });

  it('Test 6: Marker clearance - moves arrow backward if default position would overlap destination marker', () => {
    // If a large destination marker radius (e.g. 20px) is used, forbidden radius = 20 + 6 = 26px
    // Since 26px > default 22px, the arrow must be placed further back (offset >= 28px)
    const result = calculateOSMRouteArrow({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      destinationMarkerRadius: 20
    });

    expect(result).not.toBeNull();
    expect(result!.offsetFromDestination).toBeGreaterThanOrEqual(20 + MARKER_CLEARANCE);
    expect(result!.tip.x).toBeLessThanOrEqual(100 - (20 + MARKER_CLEARANCE));
  });

  it('Test 7: Label collision - label positioned ABOVE waypoint (vertical path approaching from top)', () => {
    // Route going downward: (100, 0) -> (100, 200). Destination at (100, 200).
    // Label is placed above destination at top: [100-50, 200-40, 100+50, 200-16]
    // The downward connecting line passes right through this label!
    const destPos = { x: 100, y: 200 };
    const labelBounds = {
      left: 60,
      top: 150,
      right: 140,
      bottom: 184
    };

    const result = calculateOSMRouteArrow({
      start: { x: 100, y: 0 },
      end: destPos,
      destinationLabelBounds: labelBounds
    });

    expect(result).not.toBeNull();
    // Default 22px offset would place tip at y = 200 - 22 = 178, which is inside [150-8, 184+8]!
    // The arrow must have moved further back along the path so the tip is above the expanded label (y <= 150 - 8 - ARROW_LENGTH)
    const expandedTop = labelBounds.top - LABEL_COLLISION_MARGIN;
    expect(result!.tip.y).toBeLessThanOrEqual(expandedTop);
    expect(result!.offsetFromDestination).toBeGreaterThan(DEFAULT_ARROW_BACK_OFFSET);
  });

  it('Test 8: Label collision - label positioned BELOW waypoint (vertical path approaching from bottom)', () => {
    // Route going upward: (100, 300) -> (100, 100). Destination at (100, 100).
    // Label is placed below waypoint at [60, 116, 140, 150]
    const destPos = { x: 100, y: 100 };
    const labelBounds = {
      left: 60,
      top: 116,
      right: 140,
      bottom: 150
    };

    const result = calculateOSMRouteArrow({
      start: { x: 100, y: 300 },
      end: destPos,
      destinationLabelBounds: labelBounds
    });

    expect(result).not.toBeNull();
    // Path moves from y=300 to y=100.
    // Expanded label bottom is 150 + 8 = 158.
    // Arrow tip must clear the expanded label on the bottom (y >= 158)
    const expandedBottom = labelBounds.bottom + LABEL_COLLISION_MARGIN;
    expect(result!.tip.y).toBeGreaterThanOrEqual(expandedBottom);
  });

  it('Test 9: Label collision - label positioned LEFT or RIGHT of waypoint', () => {
    // Horizontal route from left to right: (0, 100) -> (200, 100)
    // Label positioned on the left side of waypoint: [140, 85, 184, 115]
    const labelBounds = {
      left: 140,
      top: 85,
      right: 184,
      bottom: 115
    };

    const result = calculateOSMRouteArrow({
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
      destinationLabelBounds: labelBounds
    });

    expect(result).not.toBeNull();
    // Expanded left edge = 140 - 8 = 132
    // Arrow tip must clear x <= 132
    const expandedLeft = labelBounds.left - LABEL_COLLISION_MARGIN;
    expect(result!.tip.x).toBeLessThanOrEqual(expandedLeft);
  });

  it('Test 10: Safety margin - respects 8px safety margin around label', () => {
    const labelBounds = {
      left: 70,
      top: 160,
      right: 130,
      bottom: 180
    };

    const result = calculateOSMRouteArrow({
      start: { x: 100, y: 0 },
      end: { x: 100, y: 200 },
      destinationLabelBounds: labelBounds
    });

    expect(result).not.toBeNull();
    // Check collision test helper directly with resolved tip
    const collides = doesArrowheadCollide(
      result!.tip,
      result!.angleRad,
      { x: 100, y: 200 },
      8 + MARKER_CLEARANCE,
      {
        left: labelBounds.left - LABEL_COLLISION_MARGIN,
        top: labelBounds.top - LABEL_COLLISION_MARGIN,
        right: labelBounds.right + LABEL_COLLISION_MARGIN,
        bottom: labelBounds.bottom + LABEL_COLLISION_MARGIN
      }
    );
    expect(collides).toBe(false);
  });

  it('Test 11: Short segments - gracefully returns null when segment length < MIN_ARROW_SEGMENT_LENGTH (32px)', () => {
    const shortResult = calculateOSMRouteArrow({
      start: { x: 0, y: 0 },
      end: { x: 25, y: 0 } // length = 25 < 32
    });
    expect(shortResult).toBeNull();

    const tinyResult = calculateOSMRouteArrow({
      start: { x: 10, y: 10 },
      end: { x: 15, y: 15 } // length ~ 7.07
    });
    expect(tinyResult).toBeNull();
  });

  it('Test 12: Long segments - generates exactly one arrow along the segment', () => {
    const longResult = calculateOSMRouteArrow({
      start: { x: -1500, y: -2000 },
      end: { x: 3000, y: 4000 }
    });

    expect(longResult).not.toBeNull();
    expect(longResult!.offsetFromDestination).toBeCloseTo(DEFAULT_ARROW_BACK_OFFSET, 1);
  });

  it('Test 13: Off-screen waypoints - calculates accurate arrow coordinates with large or negative coordinates', () => {
    const offScreenResult = calculateOSMRouteArrow({
      start: { x: -800, y: 400 },
      end: { x: 2400, y: 1600 }
    });

    expect(offScreenResult).not.toBeNull();
    expect(Number.isFinite(offScreenResult!.tip.x)).toBe(true);
    expect(Number.isFinite(offScreenResult!.tip.y)).toBe(true);
    expect(Number.isFinite(offScreenResult!.angleRad)).toBe(true);
  });

  it('Test 14: Theme independence - pure geometry utility does not alter or store colors', () => {
    const geom = calculateOSMRouteArrow({
      start: { x: 10, y: 10 },
      end: { x: 100, y: 100 }
    });

    expect(geom).not.toBeNull();
    // Contains only geometric properties
    expect(geom).toHaveProperty('tip');
    expect(geom).toHaveProperty('polygonPoints');
    expect(geom).toHaveProperty('pointsString');
    expect(geom).toHaveProperty('angleRad');
    expect(geom).toHaveProperty('angleDeg');
    expect((geom as any).color).toBeUndefined();
  });

  it('Test 15: Arrow dimensions - confirms 9px length and 6px width sizing and corner generation', () => {
    expect(ARROW_LENGTH).toBe(9);
    expect(ARROW_WIDTH).toBe(6);

    const corners = calculateArrowheadCorners({ x: 100, y: 100 }, 0, ARROW_LENGTH, ARROW_WIDTH);
    expect(corners.baseCenter.x).toBe(100 - 9);
    expect(corners.baseCenter.y).toBe(100);
    expect(corners.leftCorner.x).toBe(100 - 9);
    expect(corners.leftCorner.y).toBe(100 - 3);
    expect(corners.rightCorner.x).toBe(100 - 9);
    expect(corners.rightCorner.y).toBe(100 + 3);
  });

  it('Test 16: Full arrowhead polygon collision detection - wings / edges are checked against marker and label bounds', () => {
    // Tip is outside, but wide wing (leftCorner) overlaps circle
    const tip = { x: 30, y: 20 };
    const markerCenter = { x: 30, y: 15 };
    const markerRadius = 6;
    // For horizontal arrow (angle = 0), leftCorner is at (30 - 12, 20 - 4) = (18, 16). Distance to (30, 15) is sqrt(12^2 + 1^2) ~ 12 > 6.
    // For upward arrow (angle = -PI/2):
    // tip at (30, 20), baseCenter at (30, 32), leftCorner at (30 - 4, 32) = (26, 32), rightCorner at (34, 32).
    // If marker is at (26, 32), the left corner hits the marker center even if tip is 12px away.
    const collidesMarker = doesArrowheadCollide(tip, -Math.PI / 2, { x: 26, y: 32 }, 5, null);
    expect(collidesMarker).toBe(true);

    // Corner of label inside arrowhead
    const labelInside = { left: 28, top: 22, right: 32, bottom: 25 };
    const collidesLabel = doesArrowheadCollide(tip, -Math.PI / 2, { x: 0, y: 0 }, 1, labelInside);
    expect(collidesLabel).toBe(true);
  });
});
