import { describe, it, expect } from 'vitest';
import {
  resolveMarkerCollisions,
  doMarkersCollide,
  calculateMarkerGap,
  circleIntersectsRect,
  rectIntersectsRect,
  computeLabelGeometry,
  MarkerLayoutInput
} from '../../utils/markerCollisionHelper';
import { Waypoint } from '../../types';

describe('OSM Compound Waypoint Marker + Label Collision Resolution Suite', () => {
  it('1. Marker vs marker collision is resolved with >= 4–6 px visible gap', () => {
    const m1: MarkerLayoutInput = { id: 'wp-1', x: 500, y: 500, radius: 8 };
    const m2: MarkerLayoutInput = { id: 'wp-2', x: 510, y: 500, radius: 8 };

    expect(doMarkersCollide(m1, m2, 5)).toBe(true);

    const layout = resolveMarkerCollisions([m1, m2], { minGap: 5 });
    const resolved1 = layout.find(l => l.id === 'wp-1')!;
    const resolved2 = layout.find(l => l.id === 'wp-2')!;

    const gap = calculateMarkerGap(resolved1, resolved2);
    expect(gap).toBeGreaterThanOrEqual(4.9);
    expect(doMarkersCollide(resolved1, resolved2, 5)).toBe(false);
  });

  it('2. Marker vs another waypoint’s label collision is resolved by repositioning the label or displacing the compound group', () => {
    // Waypoint 1 at (500, 480). Waypoint 2 at (500, 520) with a label that would default to sitting on top at (500, 495)
    const m1: MarkerLayoutInput = {
      id: 'wp-1',
      x: 500,
      y: 480,
      radius: 8
    };
    const m2: MarkerLayoutInput = {
      id: 'wp-2',
      x: 500,
      y: 520,
      radius: 8,
      label: {
        text: 'Waypoint 2 Title',
        width: 100,
        height: 24,
        isVisible: true
      }
    };

    const layout = resolveMarkerCollisions([m1, m2], { minGap: 5 });
    const res1 = layout.find(l => l.id === 'wp-1')!;
    const res2 = layout.find(l => l.id === 'wp-2')!;

    expect(res2.label).toBeDefined();
    const l2Geom = computeLabelGeometry(res2.x, res2.y, res2.radius, res2.label!.placement, res2.label!.width, res2.label!.height);

    // Verify Waypoint 2's label does NOT intersect Waypoint 1's marker
    expect(circleIntersectsRect(res1.x, res1.y, res1.radius, l2Geom.rect, 5)).toBe(false);
    // Waypoint 2's label should have adapted to 'bottom' or shifted sideways to avoid Waypoint 1
    expect(['bottom', 'right', 'left', 'bottom-right', 'bottom-left'].includes(res2.label!.placement)).toBe(true);
  });

  it('3. Label vs another waypoint’s marker collision is resolved', () => {
    // Waypoint 1 at (500, 500) with a top label at (500, 475). Waypoint 2 at (500, 475)
    const m1: MarkerLayoutInput = {
      id: 'wp-1',
      x: 500,
      y: 500,
      radius: 8,
      label: { text: 'Alpha Castle', width: 90, height: 24, isVisible: true }
    };
    const m2: MarkerLayoutInput = {
      id: 'wp-2',
      x: 500,
      y: 475,
      radius: 8
    };

    const layout = resolveMarkerCollisions([m1, m2], { minGap: 5 });
    const res1 = layout.find(l => l.id === 'wp-1')!;
    const res2 = layout.find(l => l.id === 'wp-2')!;

    expect(res1.label).toBeDefined();
    const l1Geom = computeLabelGeometry(res1.x, res1.y, res1.radius, res1.label!.placement, res1.label!.width, res1.label!.height);

    // Verify Waypoint 1's label does NOT intersect Waypoint 2's marker
    expect(circleIntersectsRect(res2.x, res2.y, res2.radius, l1Geom.rect, 5)).toBe(false);
    expect(doMarkersCollide(res1, res2, 5)).toBe(false);
  });

  it('4. Label vs label collision is resolved when practical', () => {
    // Two side-by-side waypoints at (480, 500) and (520, 500), each with wide labels (120px) that would collide if both are on top
    const m1: MarkerLayoutInput = {
      id: 'wp-1',
      x: 480,
      y: 500,
      radius: 8,
      label: { text: 'Very Long Place Name A', width: 120, height: 24, isVisible: true }
    };
    const m2: MarkerLayoutInput = {
      id: 'wp-2',
      x: 520,
      y: 500,
      radius: 8,
      label: { text: 'Very Long Place Name B', width: 120, height: 24, isVisible: true }
    };

    const layout = resolveMarkerCollisions([m1, m2], { minGap: 5 });
    const res1 = layout.find(l => l.id === 'wp-1')!;
    const res2 = layout.find(l => l.id === 'wp-2')!;

    expect(res1.label).toBeDefined();
    expect(res2.label).toBeDefined();

    const l1Geom = computeLabelGeometry(res1.x, res1.y, res1.radius, res1.label!.placement, res1.label!.width, res1.label!.height);
    const l2Geom = computeLabelGeometry(res2.x, res2.y, res2.radius, res2.label!.placement, res2.label!.width, res2.label!.height);

    // Verify labels do NOT overlap each other
    expect(rectIntersectsRect(l1Geom.rect, l2Geom.rect, 4)).toBe(false);
  });

  it('5. Two nearby waypoints with labels produce a valid layout with no cross-element overlaps', () => {
    const m1: MarkerLayoutInput = {
      id: 'wp-dubrovnik',
      x: 600,
      y: 350,
      radius: 8,
      label: { text: 'Dubrovnik Old Town', width: 110, height: 24, isVisible: true }
    };
    const m2: MarkerLayoutInput = {
      id: 'wp-lokrum',
      x: 615,
      y: 365,
      radius: 8,
      label: { text: 'Lokrum Island', width: 90, height: 24, isVisible: true }
    };

    const layout = resolveMarkerCollisions([m1, m2], { minGap: 5 });
    const res1 = layout.find(l => l.id === 'wp-dubrovnik')!;
    const res2 = layout.find(l => l.id === 'wp-lokrum')!;

    // Markers must not collide
    expect(doMarkersCollide(res1, res2, 5)).toBe(false);

    const l1Geom = computeLabelGeometry(res1.x, res1.y, res1.radius, res1.label!.placement, res1.label!.width, res1.label!.height);
    const l2Geom = computeLabelGeometry(res2.x, res2.y, res2.radius, res2.label!.placement, res2.label!.width, res2.label!.height);

    // Marker 1 vs Label 2
    expect(circleIntersectsRect(res1.x, res1.y, res1.radius, l2Geom.rect, 4)).toBe(false);
    // Marker 2 vs Label 1
    expect(circleIntersectsRect(res2.x, res2.y, res2.radius, l1Geom.rect, 4)).toBe(false);
  });

  it('6. Three or more clustered waypoints with labels produce a valid layout with zero cross-waypoint overlaps', () => {
    const markers: MarkerLayoutInput[] = [
      { id: 'wp-1', x: 400, y: 400, radius: 8, label: { text: 'Site One', width: 70, height: 24, isVisible: true } },
      { id: 'wp-2', x: 405, y: 402, radius: 8, label: { text: 'Site Two', width: 70, height: 24, isVisible: true } },
      { id: 'wp-3', x: 398, y: 406, radius: 8, label: { text: 'Site Three', width: 80, height: 24, isVisible: true } }
    ];

    const layout = resolveMarkerCollisions(markers, { minGap: 5 });
    expect(layout.length).toBe(3);

    // Verify all pairwise marker distances
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i];
        const b = layout[j];
        expect(doMarkersCollide(a, b, 4.9)).toBe(false);

        if (b.label) {
          const bGeom = computeLabelGeometry(b.x, b.y, b.radius, b.label.placement, b.label.width, b.label.height);
          expect(circleIntersectsRect(a.x, a.y, a.radius, bGeom.rect, 4)).toBe(false);
        }
        if (a.label) {
          const aGeom = computeLabelGeometry(a.x, a.y, a.radius, a.label.placement, a.label.width, a.label.height);
          expect(circleIntersectsRect(b.x, b.y, b.radius, aGeom.rect, 4)).toBe(false);
        }
      }
    }
  });

  it('7. Existing non-overlapping markers and labels remain completely unchanged (0px offset)', () => {
    const markers: MarkerLayoutInput[] = [
      { id: 'wp-north', x: 200, y: 200, radius: 8, label: { text: 'North Point', width: 80, height: 24, isVisible: true } },
      { id: 'wp-south', x: 600, y: 600, radius: 8, label: { text: 'South Point', width: 80, height: 24, isVisible: true } }
    ];

    const layout = resolveMarkerCollisions(markers, { minGap: 5 });
    expect(layout[0].offsetX).toBe(0);
    expect(layout[0].offsetY).toBe(0);
    expect(layout[0].x).toBe(200);
    expect(layout[0].y).toBe(200);

    expect(layout[1].offsetX).toBe(0);
    expect(layout[1].offsetY).toBe(0);
    expect(layout[1].x).toBe(600);
    expect(layout[1].y).toBe(600);
  });

  it('8. Underlying waypoint latitude and longitude is never modified', () => {
    const wp: Waypoint = { id: 'wp-orig', name: 'Original Geo', lat: 37.7749, lng: -122.4194 };
    const inputs: MarkerLayoutInput[] = [
      { id: 'wp-orig', x: 500, y: 500, radius: 8, waypoint: wp },
      { id: 'wp-clash', x: 502, y: 501, radius: 8 }
    ];

    const layout = resolveMarkerCollisions(inputs, { minGap: 5 });
    expect(layout[0].offsetX !== 0 || layout[0].offsetY !== 0).toBe(true);

    // Geocoordinates remain completely untouched
    expect(wp.lat).toBe(37.7749);
    expect(wp.lng).toBe(-122.4194);
  });

  it('9. Marker and label remain visually associated with the correct waypoint', () => {
    const inputs: MarkerLayoutInput[] = [
      { id: 'wp-rome', x: 500, y: 500, radius: 8, label: { text: 'Colosseum', isVisible: true } }
    ];

    const layout = resolveMarkerCollisions(inputs, { minGap: 5 });
    const res = layout[0];

    expect(res.id).toBe('wp-rome');
    expect(res.label).toBeDefined();
    // Label center Y is directly above marker center Y
    expect(res.label!.x).toBeCloseTo(res.x, 1);
    expect(res.label!.y).toBeLessThan(res.y);
  });

  it('10. Hit testing still selects the correct waypoint after compound offsets are applied', () => {
    const waypoints: Waypoint[] = [
      { id: 'wp-1', name: 'First Waypoint', lat: 10, lng: 10 },
      { id: 'wp-2', name: 'Second Waypoint', lat: 10.001, lng: 10.001 }
    ];

    const inputs: MarkerLayoutInput[] = [
      { id: 'wp-1', x: 400, y: 400, radius: 8, waypoint: waypoints[0] },
      { id: 'wp-2', x: 404, y: 402, radius: 8, waypoint: waypoints[1] }
    ];

    const layout = resolveMarkerCollisions(inputs, { minGap: 5 });
    const layoutMap = new Map(layout.map(l => [l.id, l]));

    // Click on wp-2's offset position
    const wp2Layout = layoutMap.get('wp-2')!;
    const clickX = wp2Layout.x;
    const clickY = wp2Layout.y;

    const hit = inputs.find(inp => {
      const out = layoutMap.get(inp.id)!;
      return Math.hypot(clickX - out.x, clickY - out.y) <= 20;
    });

    expect(hit).toBeDefined();
    expect(hit!.id).toBe('wp-2');
    expect(hit!.waypoint).toEqual(waypoints[1]);
  });
});
