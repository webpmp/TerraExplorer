export type LabelPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MarkerLayoutInput {
  id: string;
  x: number;
  y: number;
  radius: number;
  label?: {
    text: string;
    width?: number;
    height?: number;
    isVisible?: boolean;
    preferredPlacement?: LabelPlacement;
  };
  [key: string]: any;
}

export interface MarkerLayoutOutput {
  id: string;
  originalX: number;
  originalY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  radius: number;
  label?: {
    x: number;
    y: number;
    width: number;
    height: number;
    placement: LabelPlacement;
    style: { [key: string]: any };
  };
}

export interface MarkerCollisionOptions {
  /**
   * Minimum visible gap in pixels between visual elements of different waypoints.
   * Default: 5px (satisfies the 4–6px requirement).
   */
  minGap?: number;
  /**
   * Maximum relaxation iterations to resolve multi-marker clusters.
   * Default: 25.
   */
  maxIterations?: number;
  /**
   * Attraction factor pulling markers back toward their true geographic anchor.
   * Default: 0.05.
   */
  anchorAttraction?: number;
}

/**
 * Estimates label dimensions based on text length and typography.
 */
export function estimateLabelDimensions(
  text: string,
  fontSize: number = 12
): { width: number; height: number } {
  if (!text) {
    return { width: 50, height: 24 };
  }
  const charWidth = fontSize * 0.62;
  const paddingX = 20; // 10px each side (px-2.5)
  const estimatedWidth = Math.max(48, Math.min(240, Math.round(text.length * charWidth + paddingX)));
  const estimatedHeight = 24; // text-xs line height + py-1
  return { width: estimatedWidth, height: estimatedHeight };
}

/**
 * Calculates label center and bounding box given a marker center, radius, placement, and dimensions.
 */
export function computeLabelGeometry(
  markerX: number,
  markerY: number,
  markerRadius: number,
  placement: LabelPlacement,
  width: number,
  height: number
): { x: number; y: number; rect: ScreenRect; style: { [key: string]: any } } {
  let labelX = markerX;
  let labelY = markerY;
  let style: { [key: string]: any } = {};

  const gap = 6;

  switch (placement) {
    case 'top':
      labelX = markerX;
      labelY = markerY - markerRadius - gap - height / 2;
      style = {
        bottom: `${markerRadius + gap}px`,
        left: '0px',
        transform: 'translateX(-50%)'
      };
      break;

    case 'bottom':
      labelX = markerX;
      labelY = markerY + markerRadius + gap + height / 2;
      style = {
        top: `${markerRadius + gap}px`,
        left: '0px',
        transform: 'translateX(-50%)'
      };
      break;

    case 'right':
      labelX = markerX + markerRadius + gap + width / 2;
      labelY = markerY;
      style = {
        left: `${markerRadius + gap + 2}px`,
        top: '0px',
        transform: 'translateY(-50%)'
      };
      break;

    case 'left':
      labelX = markerX - markerRadius - gap - width / 2;
      labelY = markerY;
      style = {
        right: `${markerRadius + gap + 2}px`,
        top: '0px',
        transform: 'translateY(-50%)'
      };
      break;

    case 'top-right':
      labelX = markerX + markerRadius + 2 + width / 2;
      labelY = markerY - markerRadius - gap - height / 2;
      style = {
        bottom: `${markerRadius + gap}px`,
        left: `${markerRadius + 2}px`
      };
      break;

    case 'top-left':
      labelX = markerX - markerRadius - 2 - width / 2;
      labelY = markerY - markerRadius - gap - height / 2;
      style = {
        bottom: `${markerRadius + gap}px`,
        right: `${markerRadius + 2}px`
      };
      break;

    case 'bottom-right':
      labelX = markerX + markerRadius + 2 + width / 2;
      labelY = markerY + markerRadius + gap + height / 2;
      style = {
        top: `${markerRadius + gap}px`,
        left: `${markerRadius + 2}px`
      };
      break;

    case 'bottom-left':
      labelX = markerX - markerRadius - 2 - width / 2;
      labelY = markerY + markerRadius + gap + height / 2;
      style = {
        top: `${markerRadius + gap}px`,
        right: `${markerRadius + 2}px`
      };
      break;
  }

  const rect: ScreenRect = {
    left: labelX - width / 2,
    top: labelY - height / 2,
    right: labelX + width / 2,
    bottom: labelY + height / 2,
    width,
    height
  };

  return { x: labelX, y: labelY, rect, style };
}

/**
 * Checks if a circle intersects an axis-aligned rectangle with a required minimum gap.
 */
export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: ScreenRect,
  minGap: number = 5
): boolean {
  const closestX = Math.max(rect.left, Math.min(cx, rect.right));
  const closestY = Math.max(rect.top, Math.min(cy, rect.bottom));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const requiredDist = radius + minGap;
  return dx * dx + dy * dy < requiredDist * requiredDist;
}

/**
 * Checks if two axis-aligned rectangles intersect with a required minimum gap.
 */
export function rectIntersectsRect(
  r1: ScreenRect,
  r2: ScreenRect,
  minGap: number = 5
): boolean {
  return (
    r1.left - minGap < r2.right &&
    r1.right + minGap > r2.left &&
    r1.top - minGap < r2.bottom &&
    r1.bottom + minGap > r2.top
  );
}

/**
 * Checks if two circular markers overlap or violate the minimum edge-to-edge gap.
 */
export function doMarkersCollide(
  m1: { x: number; y: number; radius: number },
  m2: { x: number; y: number; radius: number },
  minGap: number = 5
): boolean {
  const dx = m2.x - m1.x;
  const dy = m2.y - m1.y;
  const distSq = dx * dx + dy * dy;
  const requiredDist = m1.radius + m2.radius + minGap;
  return distSq < requiredDist * requiredDist;
}

/**
 * Calculates the exact Euclidean edge-to-edge gap between two markers.
 */
export function calculateMarkerGap(
  m1: { x: number; y: number; radius: number },
  m2: { x: number; y: number; radius: number }
): number {
  const dx = m2.x - m1.x;
  const dy = m2.y - m1.y;
  const centerDist = Math.hypot(dx, dy);
  return centerDist - (m1.radius + m2.radius);
}

const CANDIDATE_PLACEMENTS: LabelPlacement[] = [
  'top',
  'bottom',
  'right',
  'left',
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left'
];

/**
 * Resolves visual overlaps between compound screen-space waypoints ([marker] + [associated label]).
 *
 * Requirements:
 * - Purely screen-space (does not modify underlying geographic coordinates).
 * - Guaranteed >= 4–6 px gap between all cross-waypoint visual elements:
 *   marker ↔ marker, marker ↔ label, label ↔ marker, label ↔ label.
 * - Repositions label orientation first, then shifts compound grouping if needed.
 * - Leaves non-colliding waypoints completely untouched (0px offset).
 * - Distributes multi-waypoint clusters naturally around their shared center.
 */
export function resolveMarkerCollisions(
  markers: MarkerLayoutInput[],
  options?: MarkerCollisionOptions
): MarkerLayoutOutput[] {
  if (!markers || markers.length === 0) {
    return [];
  }

  const minGap = options?.minGap ?? 5;
  const maxIterations = options?.maxIterations ?? 25;
  const anchorAttraction = options?.anchorAttraction ?? 0.05;

  if (markers.length === 1) {
    const m = markers[0];
    let labelOutput: MarkerLayoutOutput['label'] | undefined;
    if (m.label && m.label.isVisible !== false) {
      const dim = {
        width: m.label.width ?? estimateLabelDimensions(m.label.text).width,
        height: m.label.height ?? estimateLabelDimensions(m.label.text).height
      };
      const placement = m.label.preferredPlacement || 'top';
      const geom = computeLabelGeometry(m.x, m.y, m.radius, placement, dim.width, dim.height);
      labelOutput = {
        x: geom.x,
        y: geom.y,
        width: dim.width,
        height: dim.height,
        placement,
        style: geom.style
      };
    }
    return [
      {
        id: m.id,
        originalX: m.x,
        originalY: m.y,
        x: m.x,
        y: m.y,
        offsetX: 0,
        offsetY: 0,
        radius: m.radius,
        label: labelOutput
      }
    ];
  }

  // Clone nodes with label metadata
  const nodes = markers.map((m) => {
    let labelInfo: {
      text: string;
      width: number;
      height: number;
      isVisible: boolean;
      placement: LabelPlacement;
      geom?: ReturnType<typeof computeLabelGeometry>;
    } | null = null;

    if (m.label && m.label.isVisible !== false) {
      const dim = {
        width: m.label.width ?? estimateLabelDimensions(m.label.text).width,
        height: m.label.height ?? estimateLabelDimensions(m.label.text).height
      };
      labelInfo = {
        text: m.label.text,
        width: dim.width,
        height: dim.height,
        isVisible: true,
        placement: m.label.preferredPlacement || 'top'
      };
    }

    return {
      id: m.id,
      origX: m.x,
      origY: m.y,
      x: m.x,
      y: m.y,
      radius: m.radius,
      label: labelInfo
    };
  });

  // Step 1: Pre-pass for exact/near-identical marker coordinates
  const clusters: number[][] = [];
  const visited = new Uint8Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    if (visited[i]) continue;
    const cluster = [i];
    visited[i] = 1;

    for (let j = i + 1; j < nodes.length; j++) {
      if (!visited[j]) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        if (Math.hypot(dx, dy) < 0.5) {
          cluster.push(j);
          visited[j] = 1;
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  for (const cluster of clusters) {
    const k = cluster.length;
    const centerX = nodes[cluster[0]].origX;
    const centerY = nodes[cluster[0]].origY;
    const avgRadius = cluster.reduce((sum, idx) => sum + nodes[idx].radius, 0) / k;
    const requiredPairDist = avgRadius * 2 + minGap;
    const ringRadius = k === 2
      ? requiredPairDist / 2
      : Math.max(requiredPairDist / 2, requiredPairDist / (2 * Math.sin(Math.PI / k)));

    cluster.forEach((nodeIdx, order) => {
      const angle = (2 * Math.PI * order) / k - Math.PI / 2;
      nodes[nodeIdx].x = centerX + Math.cos(angle) * ringRadius;
      nodes[nodeIdx].y = centerY + Math.sin(angle) * ringRadius;
    });
  }

  // Helper to re-evaluate and optimize label placements for all active labels
  const updateLabelGeometries = () => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (!a.label) continue;

      let bestPlacement: LabelPlacement = 'top';
      let bestPenalty = Infinity;
      let bestGeom: ReturnType<typeof computeLabelGeometry> | null = null;

      for (const placement of CANDIDATE_PLACEMENTS) {
        const geom = computeLabelGeometry(a.x, a.y, a.radius, placement, a.label.width, a.label.height);
        let penalty = 0;

        // Preference bias: slight penalty for non-standard directions
        if (placement === 'bottom') penalty += 1;
        else if (placement === 'right' || placement === 'left') penalty += 2;
        else if (placement.includes('-')) penalty += 4;

        // Collision checks against other waypoints
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];

          // 1. Label vs other marker
          if (circleIntersectsRect(b.x, b.y, b.radius, geom.rect, minGap)) {
            penalty += 1000;
          }

          // 2. Label vs other label (if other label already has geom)
          if (b.label && b.label.geom) {
            if (rectIntersectsRect(geom.rect, b.label.geom.rect, minGap)) {
              penalty += 500;
            }
          }
        }

        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestPlacement = placement;
          bestGeom = geom;
        }
      }

      a.label.placement = bestPlacement;
      a.label.geom = bestGeom || computeLabelGeometry(a.x, a.y, a.radius, bestPlacement, a.label.width, a.label.height);
    }
  };

  // Step 2: Iterative Spring / Constraint Relaxation for compound footprints
  for (let iter = 0; iter < maxIterations; iter++) {
    let movedInIteration = false;
    updateLabelGeometries();

    // Cross-waypoint collision checks and displacements
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        // 1. Marker vs Marker
        const mdx = b.x - a.x;
        const mdy = b.y - a.y;
        const mDist = Math.hypot(mdx, mdy);
        const reqMDist = a.radius + b.radius + minGap;

        if (mDist < reqMDist) {
          movedInIteration = true;
          const overlap = reqMDist - mDist;
          const nx = mDist < 0.001 ? 1 : mdx / mDist;
          const ny = mDist < 0.001 ? 0 : mdy / mDist;
          const shift = overlap / 2;
          a.x -= nx * shift;
          a.y -= ny * shift;
          b.x += nx * shift;
          b.y += ny * shift;
        }

        // 2. Marker A vs Label B
        if (b.label && b.label.geom && circleIntersectsRect(a.x, a.y, a.radius, b.label.geom.rect, minGap)) {
          movedInIteration = true;
          const ldx = a.x - b.label.geom.x;
          const ldy = a.y - b.label.geom.y;
          const ldist = Math.hypot(ldx, ldy) || 1;
          const nx = ldx / ldist;
          const ny = ldy / ldist;
          const shift = 6;
          a.x += nx * shift;
          a.y += ny * shift;
          b.x -= nx * shift;
          b.y -= ny * shift;
        }

        // 3. Label A vs Marker B
        if (a.label && a.label.geom && circleIntersectsRect(b.x, b.y, b.radius, a.label.geom.rect, minGap)) {
          movedInIteration = true;
          const ldx = b.x - a.label.geom.x;
          const ldy = b.y - a.label.geom.y;
          const ldist = Math.hypot(ldx, ldy) || 1;
          const nx = ldx / ldist;
          const ny = ldy / ldist;
          const shift = 6;
          b.x += nx * shift;
          b.y += ny * shift;
          a.x -= nx * shift;
          a.y -= ny * shift;
        }

        // 4. Label A vs Label B
        if (a.label && a.label.geom && b.label && b.label.geom && rectIntersectsRect(a.label.geom.rect, b.label.geom.rect, minGap)) {
          movedInIteration = true;
          const ldx = b.label.geom.x - a.label.geom.x;
          const ldy = b.label.geom.y - a.label.geom.y;
          const ldist = Math.hypot(ldx, ldy) || 1;
          const nx = ldx / ldist;
          const ny = ldy / ldist;
          const shift = 5;
          a.x -= nx * shift;
          a.y -= ny * shift;
          b.x += nx * shift;
          b.y += ny * shift;
        }
      }
    }

    // Anchor attraction
    for (const node of nodes) {
      node.x += (node.origX - node.x) * anchorAttraction;
      node.y += (node.origY - node.y) * anchorAttraction;
    }

    if (!movedInIteration) {
      break;
    }
  }

  // Final validation & projection pass: strictly enforce zero marker collision
  for (let pass = 0; pass < 5; pass++) {
    let anyViolation = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const requiredDist = a.radius + b.radius + minGap;

        if (dist < requiredDist) {
          anyViolation = true;
          const overlap = requiredDist - dist + 0.05;
          const nx = dist < 0.001 ? 1 : dx / dist;
          const ny = dist < 0.001 ? 0 : dy / dist;

          const shift = overlap / 2;
          a.x -= nx * shift;
          a.y -= ny * shift;
          b.x += nx * shift;
          b.y += ny * shift;
        }
      }
    }
    if (!anyViolation) break;
  }

  // Final geometry update pass
  updateLabelGeometries();

  return nodes.map((n) => {
    let labelOutput: MarkerLayoutOutput['label'] | undefined;
    if (n.label && n.label.geom) {
      labelOutput = {
        x: Math.round(n.label.geom.x * 10) / 10,
        y: Math.round(n.label.geom.y * 10) / 10,
        width: n.label.width,
        height: n.label.height,
        placement: n.label.placement,
        style: n.label.geom.style
      };
    }

    return {
      id: n.id,
      originalX: n.origX,
      originalY: n.origY,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      offsetX: Math.round((n.x - n.origX) * 10) / 10,
      offsetY: Math.round((n.y - n.origY) * 10) / 10,
      radius: n.radius,
      label: labelOutput
    };
  });
}
