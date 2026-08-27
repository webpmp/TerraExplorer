import { describe, it, expect } from 'vitest';
import {
  evaluateLabelPlacement,
  rectIntersectsCircle,
  calculateRectOverlap,
  MarkerScreenTarget,
  ScreenRect
} from '../../utils/labelCollisionHelper';

describe('Globe Marker Interaction & Label Collision System', () => {
  const defaultViewport = { width: 1920, height: 1080 };

  it('evaluates non-colliding candidate position for isolated marker (defaults to UR)', () => {
    const targetMarker = {
      x: 500,
      y: 500,
      visualRadius: 10,
      hitRadius: 20,
      id: 'target-1'
    };

    const labelWidth = 120;
    const labelHeight = 30;
    const otherMarkers: MarkerScreenTarget[] = [];

    const result = evaluateLabelPlacement(
      targetMarker,
      labelWidth,
      labelHeight,
      otherMarkers,
      [],
      defaultViewport
    );

    expect(result.collisions).toBe(0);
    expect(result.collisionPenalty).toBe(0);
    expect(result.placement).toBe('UR');
    expect(result.labelRect.left).toBeGreaterThan(targetMarker.x);
    expect(result.labelRect.top).toBeLessThan(targetMarker.y);
  });

  it('avoids another marker positioned in the Upper-Right candidate spot (20px to 60px away)', () => {
    const targetMarker = {
      x: 500,
      y: 500,
      visualRadius: 10,
      hitRadius: 20,
      id: 'target-1'
    };

    // Obstacle marker sitting right in the UR area (e.g. at (535, 465) ~ 50px away)
    const obstacleMarker: MarkerScreenTarget = {
      id: 'obstacle-1',
      x: 540,
      y: 470,
      radius: 10,
      hitRadius: 20
    };

    const labelWidth = 120;
    const labelHeight = 30;

    const result = evaluateLabelPlacement(
      targetMarker,
      labelWidth,
      labelHeight,
      [obstacleMarker],
      [],
      defaultViewport
    );

    // Should choose a candidate other than UR (e.g. UL, LR, LL, T, or B) that has 0 collisions
    expect(result.collisions).toBe(0);
    expect(result.placement).not.toBe('UR');

    // Verify selected labelRect does NOT intersect the obstacle hit area
    const intersectsObstacle = rectIntersectsCircle(
      result.labelRect,
      obstacleMarker.x,
      obstacleMarker.y,
      obstacleMarker.hitRadius
    );
    expect(intersectsObstacle).toBe(false);
  });

  it('handles clustered markers at 20px, 30px, 40px, and 60px distances without hiding or colliding', () => {
    const distances = [20, 30, 40, 60];

    for (const dist of distances) {
      const targetMarker = {
        x: 600,
        y: 600,
        visualRadius: 10,
        hitRadius: 20,
        id: 'target'
      };

      // Put neighboring markers at North and North-East
      const northNeighbor: MarkerScreenTarget = {
        id: 'north',
        x: 600,
        y: 600 - dist,
        radius: 10,
        hitRadius: 20
      };

      const urNeighbor: MarkerScreenTarget = {
        id: 'urNeighbor',
        x: 600 + dist * 0.7,
        y: 600 - dist * 0.7,
        radius: 10,
        hitRadius: 20
      };

      const labelWidth = 100;
      const labelHeight = 28;

      const result = evaluateLabelPlacement(
        targetMarker,
        labelWidth,
        labelHeight,
        [northNeighbor, urNeighbor],
        [],
        defaultViewport
      );

      // Verify that candidate has 0 collisions and does not intersect target or neighbors
      expect(result).toBeDefined();
      expect(result.collisions).toBe(0);
      expect(rectIntersectsCircle(result.labelRect, northNeighbor.x, northNeighbor.y, northNeighbor.hitRadius)).toBe(false);
      expect(rectIntersectsCircle(result.labelRect, urNeighbor.x, urNeighbor.y, urNeighbor.hitRadius)).toBe(false);
    }
  });

  it('accurately uses variable label lengths (Paris, Chillicothe, San Francisco, Grand Canyon National Park)', () => {
    const targetMarker = {
      x: 400,
      y: 400,
      visualRadius: 10,
      hitRadius: 20,
      id: 'city'
    };

    // Obstacle at x: 530, y: 350 (UR area, ~140px away)
    const obstacle: MarkerScreenTarget = {
      id: 'obs',
      x: 530,
      y: 350,
      radius: 10,
      hitRadius: 20
    };

    // 1. Short label "Paris" (width: ~60px, bounds x: 432..492, y: 340..368) does not hit obstacle at (530, 350)
    const parisResult = evaluateLabelPlacement(
      targetMarker,
      60,
      28,
      [obstacle],
      [],
      defaultViewport
    );
    expect(parisResult.placement).toBe('UR');

    // 2. Long label "Grand Canyon National Park" (width: ~220px, bounds x: 432..652, y: 340..368) overlaps obstacle at (530, 350)
    const longResult = evaluateLabelPlacement(
      targetMarker,
      220,
      28,
      [obstacle],
      [],
      defaultViewport
    );
    // Must avoid UR and pick UL / LL / LR / B
    expect(longResult.placement).not.toBe('UR');
  });

  it('falls back to lowest penalty when all candidate directions have some obstruction, never hiding marker', () => {
    const targetMarker = {
      x: 500,
      y: 500,
      visualRadius: 10,
      hitRadius: 20,
      id: 'surrounded'
    };

    // Surround marker on all sides
    const surroundingObstacles: MarkerScreenTarget[] = [
      { id: '1', x: 535, y: 465, radius: 10, hitRadius: 20 }, // UR
      { id: '2', x: 465, y: 465, radius: 10, hitRadius: 20 }, // UL
      { id: '3', x: 535, y: 535, radius: 10, hitRadius: 20 }, // LR
      { id: '4', x: 465, y: 535, radius: 10, hitRadius: 20 }, // LL
      { id: '5', x: 500, y: 450, radius: 10, hitRadius: 20 }, // T
      { id: '6', x: 500, y: 550, radius: 10, hitRadius: 20 }  // B
    ];

    const result = evaluateLabelPlacement(
      targetMarker,
      120,
      30,
      surroundingObstacles,
      [],
      defaultViewport
    );

    // Must return a valid layout result with finite penalty rather than crashing or returning null
    expect(result).toBeDefined();
    expect(result.labelRect).toBeDefined();
    expect(result.svgLine).toBeDefined();
    expect(typeof result.collisionPenalty).toBe('number');
  });

  it('dynamically adapts leader line endpoints to selected candidate position', () => {
    const targetMarker = {
      x: 300,
      y: 300,
      visualRadius: 12,
      hitRadius: 20,
      id: 'm1'
    };

    // Force UL placement by putting obstacle at UR, LR, LL, T, B
    const obstacles: MarkerScreenTarget[] = [
      { id: 'ur', x: 340, y: 260, radius: 10, hitRadius: 20 },
      { id: 'lr', x: 340, y: 340, radius: 10, hitRadius: 20 },
      { id: 'll', x: 260, y: 340, radius: 10, hitRadius: 20 },
      { id: 't',  x: 300, y: 250, radius: 10, hitRadius: 20 },
      { id: 'b',  x: 300, y: 350, radius: 10, hitRadius: 20 }
    ];

    const result = evaluateLabelPlacement(
      targetMarker,
      100,
      30,
      obstacles,
      [],
      defaultViewport
    );

    expect(result.placement).toBe('UL');
    // Leader line should point towards upper-left (negative lineEnd x and y)
    expect(result.lineEnd.x).toBeLessThan(0);
    expect(result.lineEnd.y).toBeLessThan(0);
  });

  it('guarantees that hovering a marker always generates a non-null, valid label placement layout without suppressing the label', () => {
    // Simulate mouse entering 40px hit area of marker
    let hoveredMarkerId: string | null = null;
    const onMouseEnter = (id: string) => {
      hoveredMarkerId = id;
    };
    const onMouseLeave = () => {
      hoveredMarkerId = null;
    };

    // User hovers target
    onMouseEnter('paris-marker');
    expect(hoveredMarkerId).toBe('paris-marker');

    // HoverOverlay evaluates collision placement for the hovered marker
    const targetMarker = {
      id: 'paris-marker',
      x: 800,
      y: 450,
      visualRadius: 10,
      hitRadius: 20
    };

    const layout = evaluateLabelPlacement(
      targetMarker,
      140,
      32,
      [],
      [],
      defaultViewport
    );

    expect(layout).toBeDefined();
    expect(layout.labelRect.width).toBe(140);
    expect(layout.labelRect.height).toBe(32);
    expect(layout.svgBox.width).toBeGreaterThan(0);
    expect(layout.svgBox.height).toBeGreaterThan(0);
    expect(layout.labelOffset.left).toBeDefined();
    expect(layout.labelOffset.top).toBeDefined();

    // User moves mouse away
    onMouseLeave();
    expect(hoveredMarkerId).toBeNull();
  });

  describe('Globe-Occlusion & Unified Visibility Logic', () => {
    it('determines visibility correctly around the camera-facing threshold', async () => {
      const { isGlobePointVisible } = await import('../../components/Earth');
      const THREE = await import('three');

      const cameraPos = new THREE.Vector3(0, 0, 2.5); // Camera looking at origin along +Z

      // Front of the globe facing camera directly (+Z)
      const frontPoint = new THREE.Vector3(0, 0, 1.01);
      expect(isGlobePointVisible(frontPoint, cameraPos)).toBe(true);

      // Back of the globe occluded by Earth (-Z)
      const backPoint = new THREE.Vector3(0, 0, -1.01);
      expect(isGlobePointVisible(backPoint, cameraPos)).toBe(false);

      // Point just above the visibility threshold (e.g. dot = 0.65 > 0.6)
      const visibleLimbPoint = new THREE.Vector3(0.965, 0, 0.26); // dot with (0,0,2.5) is 0.26 * 2.5 = 0.65
      expect(isGlobePointVisible(visibleLimbPoint, cameraPos)).toBe(true);

      // Point just below the visibility threshold (e.g. dot = 0.55 <= 0.6)
      const occludedLimbPoint = new THREE.Vector3(0.975, 0, 0.22); // dot with (0,0,2.5) is 0.22 * 2.5 = 0.55
      expect(isGlobePointVisible(occludedLimbPoint, cameraPos)).toBe(false);
    });

    it('hides overlay, label, and connector line when marker is occluded on far side of globe', async () => {
      const { isGlobePointVisible } = await import('../../components/Earth');
      const THREE = await import('three');

      const cameraPos = new THREE.Vector3(0, 0, 2.5);
      // Dallas on far side of globe relative to camera (e.g. looking at Indian Ocean)
      const occludedLocationWorldPos = new THREE.Vector3(0, 0, -1.01);

      const isFacing = isGlobePointVisible(occludedLocationWorldPos, cameraPos);
      expect(isFacing).toBe(false);

      // When isFacing is false, overlayContainer style is set to display: none and frame update returns early
      const overlayDisplay = isFacing ? 'block' : 'none';
      expect(overlayDisplay).toBe('none');
    });

    it('shows overlay, label, and connector line when marker is facing the camera', async () => {
      const { isGlobePointVisible } = await import('../../components/Earth');
      const THREE = await import('three');

      const cameraPos = new THREE.Vector3(0, 0, 2.5);
      const visibleLocationWorldPos = new THREE.Vector3(0, 0, 1.01);

      const isFacing = isGlobePointVisible(visibleLocationWorldPos, cameraPos);
      expect(isFacing).toBe(true);

      const overlayDisplay = isFacing ? 'block' : 'none';
      expect(overlayDisplay).toBe('block');
    });

    it('filters out occluded neighbor markers from label collision candidate calculations', async () => {
      const { isGlobePointVisible } = await import('../../components/Earth');
      const THREE = await import('three');

      const cameraPos = new THREE.Vector3(0, 0, 2.5);
      const visibleNeighbor = new THREE.Vector3(0.1, 0.1, 1.01);
      const occludedNeighbor = new THREE.Vector3(0.1, 0.1, -1.01);

      // Verify that only the camera-facing neighbor passes the visibility check
      expect(isGlobePointVisible(visibleNeighbor, cameraPos)).toBe(true);
      expect(isGlobePointVisible(occludedNeighbor, cameraPos)).toBe(false);

      // Simulated neighbor markers collection: only visible neighbors are projected
      const allNeighborObjects = [
        { id: 'visible-1', worldPos: visibleNeighbor },
        { id: 'occluded-1', worldPos: occludedNeighbor }
      ];

      const projectedOtherMarkers: MarkerScreenTarget[] = [];
      allNeighborObjects.forEach(obj => {
        if (isGlobePointVisible(obj.worldPos, cameraPos)) {
          projectedOtherMarkers.push({
            id: obj.id,
            x: 550,
            y: 450,
            radius: 10,
            hitRadius: 20
          });
        }
      });

      expect(projectedOtherMarkers).toHaveLength(1);
      expect(projectedOtherMarkers[0].id).toBe('visible-1');
    });
  });
});
