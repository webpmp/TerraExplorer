import React, { useEffect, useState, useRef, useCallback } from 'react';
import { SkinType, UserSettings, LocationInfo, isValidCoordinates } from '../types';

export interface MarkerProjectionBeamProps {
  skin: SkinType;
  userSettings: UserSettings;
  locationInfo: LocationInfo | null;
  selectedMarkerCoordinates?: { lat: number; lng: number } | null;
  isInfoPanelOpen: boolean;
  isCameraMoving?: boolean;
}

export interface MoteConfig {
  id: number;
  u: number; // 0 (marker) to 1 (panel) along curve
  v: number; // 0 (top curve) to 1 (bottom curve) across beam
  radius: number;
  baseOpacity: number;
  duration: number; // 7.0s - 15.0s slow ambient drift
  delay: number;
  dx1: number;
  dy1: number;
  dx2: number;
  dy2: number;
  dx3: number;
  dy3: number;
}

// 22 subtle, organic dust motes with varied sizes (tiny specks to small particles) and multidirectional drift
export const MOTE_CONFIGS: MoteConfig[] = [
  { id: 1, u: 0.10, v: 0.48, radius: 0.45, baseOpacity: 0.35, duration: 8.4, delay: -1.2, dx1: -3, dy1: 4, dx2: 2, dy2: 6, dx3: 4, dy3: 2 },
  { id: 2, u: 0.16, v: 0.32, radius: 0.80, baseOpacity: 0.32, duration: 11.2, delay: -4.5, dx1: 5, dy1: -4, dx2: 3, dy2: -7, dx3: -2, dy3: -4 },
  { id: 3, u: 0.22, v: 0.68, radius: 0.35, baseOpacity: 0.29, duration: 9.6, delay: -2.8, dx1: 4, dy1: 5, dx2: -2, dy2: 8, dx3: -5, dy3: 3 },
  { id: 4, u: 0.28, v: 0.22, radius: 1.15, baseOpacity: 0.26, duration: 13.5, delay: -6.1, dx1: -4, dy1: -3, dx2: -6, dy2: 2, dx3: -2, dy3: 4 },
  { id: 5, u: 0.34, v: 0.56, radius: 0.50, baseOpacity: 0.35, duration: 7.8, delay: -0.5, dx1: 3, dy1: -5, dx2: 6, dy2: -3, dx3: 4, dy3: 2 },
  { id: 6, u: 0.39, v: 0.78, radius: 0.85, baseOpacity: 0.29, duration: 10.4, delay: -5.0, dx1: -5, dy1: -4, dx2: -3, dy2: -7, dx3: 2, dy3: -4 },
  { id: 7, u: 0.44, v: 0.35, radius: 0.40, baseOpacity: 0.32, duration: 8.8, delay: -3.3, dx1: 4, dy1: 3, dx2: 2, dy2: 6, dx3: -3, dy3: 4 },
  { id: 8, u: 0.49, v: 0.52, radius: 0.95, baseOpacity: 0.26, duration: 12.0, delay: -7.2, dx1: -3, dy1: 6, dx2: 4, dy2: 5, dx3: 5, dy3: -1 },
  { id: 9, u: 0.55, v: 0.18, radius: 0.55, baseOpacity: 0.31, duration: 9.2, delay: -1.8, dx1: 5, dy1: -4, dx2: 3, dy2: -6, dx3: -2, dy3: -3 },
  { id: 10, u: 0.60, v: 0.82, radius: 1.25, baseOpacity: 0.22, duration: 14.2, delay: -8.4, dx1: -4, dy1: 3, dx2: -7, dy2: -2, dx3: -3, dy3: -5 },
  { id: 11, u: 0.64, v: 0.42, radius: 0.45, baseOpacity: 0.29, duration: 8.2, delay: -2.1, dx1: 3, dy1: 5, dx2: -3, dy2: 7, dx3: -4, dy3: 3 },
  { id: 12, u: 0.69, v: 0.65, radius: 0.75, baseOpacity: 0.26, duration: 10.8, delay: -4.0, dx1: -5, dy1: -3, dx2: -2, dy2: -6, dx3: 3, dy3: -4 },
  { id: 13, u: 0.74, v: 0.26, radius: 0.38, baseOpacity: 0.29, duration: 7.5, delay: -0.9, dx1: 4, dy1: -4, dx2: 6, dy2: 1, dx3: 2, dy3: 5 },
  { id: 14, u: 0.78, v: 0.58, radius: 0.90, baseOpacity: 0.245, duration: 11.6, delay: -6.8, dx1: -3, dy1: 4, dx2: 2, dy2: 6, dx3: 5, dy3: 2 },
  { id: 15, u: 0.82, v: 0.38, radius: 0.50, baseOpacity: 0.26, duration: 8.6, delay: -3.0, dx1: 4, dy1: 3, dx2: 1, dy2: 5, dx3: -3, dy3: 2 },
  { id: 16, u: 0.86, v: 0.74, radius: 1.35, baseOpacity: 0.20, duration: 14.8, delay: -9.2, dx1: -5, dy1: -2, dx2: -4, dy2: 4, dx3: 2, dy3: 3 },
  { id: 17, u: 0.89, v: 0.19, radius: 0.42, baseOpacity: 0.245, duration: 8.0, delay: -1.5, dx1: 3, dy1: -5, dx2: 5, dy2: -2, dx3: 2, dy3: 3 },
  { id: 18, u: 0.92, v: 0.48, radius: 0.70, baseOpacity: 0.225, duration: 10.2, delay: -5.6, dx1: -4, dy1: 4, dx2: -6, dy2: -1, dx3: -2, dy3: -4 },
  { id: 19, u: 0.94, v: 0.85, radius: 0.35, baseOpacity: 0.225, duration: 7.2, delay: -0.3, dx1: 3, dy1: 4, dx2: -2, dy2: 6, dx3: -4, dy3: 2 },
  { id: 20, u: 0.96, v: 0.33, radius: 0.60, baseOpacity: 0.21, duration: 9.8, delay: -3.7, dx1: -3, dy1: -4, dx2: 2, dy2: -6, dx3: 4, dy3: -2 },
  { id: 21, u: 0.52, v: 0.70, radius: 0.40, baseOpacity: 0.28, duration: 8.5, delay: -2.5, dx1: 4, dy1: -3, dx2: -3, dy2: -5, dx3: -4, dy3: 2 },
  { id: 22, u: 0.30, v: 0.40, radius: 0.65, baseOpacity: 0.32, duration: 10.0, delay: -4.8, dx1: -4, dy1: 3, dx2: 3, dy2: 5, dx3: 5, dy3: -2 }
];

export interface BeamGeometry {
  mTop: { x: number; y: number };
  mBottom: { x: number; y: number };
  pTop: { x: number; y: number };
  pBottom: { x: number; y: number };
  cp1Top: { x: number; y: number };
  cp2Top: { x: number; y: number };
  cp1Bottom: { x: number; y: number };
  cp2Bottom: { x: number; y: number };
  beamPath: string;
  topEdgePath: string;
  bottomEdgePath: string;
  markerPoint: { x: number; y: number };
  panelMidPoint: { x: number; y: number };
  motes: {
    id: number;
    cx: number;
    cy: number;
    r: number;
    opacity: number;
    duration: number;
    delay: number;
    dx1: number;
    dy1: number;
    dx2: number;
    dy2: number;
    dx3: number;
    dy3: number;
  }[];
}

/**
 * Evaluates a 2D cubic Bézier curve at parameter t in [0, 1].
 */
function evaluateCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const invT = 1 - t;
  const invT2 = invT * invT;
  const invT3 = invT2 * invT;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: invT3 * p0.x + 3 * invT2 * t * p1.x + 3 * invT * t2 * p2.x + t3 * p3.x,
    y: invT3 * p0.y + 3 * invT2 * t * p1.y + 3 * invT * t2 * p2.y + t3 * p3.y
  };
}

export function calculateBeamTrapezoid(
  markerPoint: { x: number; y: number },
  panelRect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
): BeamGeometry | null {
  if (
    markerPoint.x < 0 ||
    markerPoint.x > viewportWidth ||
    markerPoint.y < 0 ||
    markerPoint.y > viewportHeight
  ) {
    return null;
  }

  if (panelRect.width === 0 || panelRect.height === 0) {
    return null;
  }

  // Determine nearest map-facing vertical edge
  const isMarkerLeftOfPanel = markerPoint.x < panelRect.left + panelRect.width / 2;
  const edgeX = isMarkerLeftOfPanel ? panelRect.left : panelRect.right;
  const pTop = { x: edgeX, y: panelRect.top };
  const pBottom = { x: edgeX, y: panelRect.bottom };

  // Marker end narrow connection (~3px wide)
  const mTop = { x: markerPoint.x, y: markerPoint.y - 1.5 };
  const mBottom = { x: markerPoint.x, y: markerPoint.y + 1.5 };

  const panelMidPoint = { x: edgeX, y: (panelRect.top + panelRect.bottom) / 2 };
  const panelHalfHeight = (panelRect.bottom - panelRect.top) / 2;

  const dx = edgeX - markerPoint.x;
  const dy = panelMidPoint.y - markerPoint.y;

  // Expanding optical cone control points:
  // Centerline at parameter t: (x_m + t*dx, y_m + t*dy)
  // Spread function s(t) expands away from centerline towards panel edge.
  // Top boundary curves upward (negative Y delta in SVG coords), bottom boundary curves downward (positive Y delta).
  const t1 = 0.38;
  const s1 = panelHalfHeight * 0.22;
  const cp1Top = {
    x: markerPoint.x + t1 * dx,
    y: markerPoint.y + t1 * dy - s1
  };
  const cp1Bottom = {
    x: markerPoint.x + t1 * dx,
    y: markerPoint.y + t1 * dy + s1
  };

  const t2 = 0.72;
  const s2 = panelHalfHeight * 0.65;
  const cp2Top = {
    x: markerPoint.x + t2 * dx,
    y: markerPoint.y + t2 * dy - s2
  };
  const cp2Bottom = {
    x: markerPoint.x + t2 * dx,
    y: markerPoint.y + t2 * dy + s2
  };

  // Single closed SVG path for the expanding projection beam
  const beamPath = `M ${mTop.x.toFixed(1)} ${mTop.y.toFixed(1)} C ${cp1Top.x.toFixed(1)} ${cp1Top.y.toFixed(1)}, ${cp2Top.x.toFixed(1)} ${cp2Top.y.toFixed(1)}, ${pTop.x.toFixed(1)} ${pTop.y.toFixed(1)} L ${pBottom.x.toFixed(1)} ${pBottom.y.toFixed(1)} C ${cp2Bottom.x.toFixed(1)} ${cp2Bottom.y.toFixed(1)}, ${cp1Bottom.x.toFixed(1)} ${cp1Bottom.y.toFixed(1)}, ${mBottom.x.toFixed(1)} ${mBottom.y.toFixed(1)} Z`;

  // Boundary illumination lines
  const topEdgePath = `M ${mTop.x.toFixed(1)} ${mTop.y.toFixed(1)} C ${cp1Top.x.toFixed(1)} ${cp1Top.y.toFixed(1)}, ${cp2Top.x.toFixed(1)} ${cp2Top.y.toFixed(1)}, ${pTop.x.toFixed(1)} ${pTop.y.toFixed(1)}`;
  const bottomEdgePath = `M ${mBottom.x.toFixed(1)} ${mBottom.y.toFixed(1)} C ${cp1Bottom.x.toFixed(1)} ${cp1Bottom.y.toFixed(1)}, ${cp2Bottom.x.toFixed(1)} ${cp2Bottom.y.toFixed(1)}, ${pBottom.x.toFixed(1)} ${pBottom.y.toFixed(1)}`;

  // Calculate mote positions interpolated strictly along and inside the expanding optical cone
  const motes = MOTE_CONFIGS.map((cfg) => {
    const topPt = evaluateCubicBezier(mTop, cp1Top, cp2Top, pTop, cfg.u);
    const botPt = evaluateCubicBezier(mBottom, cp1Bottom, cp2Bottom, pBottom, cfg.u);

    const cx = topPt.x + cfg.v * (botPt.x - topPt.x);
    const cy = topPt.y + cfg.v * (botPt.y - topPt.y);

    return {
      id: cfg.id,
      cx,
      cy,
      r: cfg.radius,
      opacity: cfg.baseOpacity,
      duration: cfg.duration,
      delay: cfg.delay,
      dx1: cfg.dx1,
      dy1: cfg.dy1,
      dx2: cfg.dx2,
      dy2: cfg.dy2,
      dx3: cfg.dx3,
      dy3: cfg.dy3
    };
  });

  return {
    mTop,
    mBottom,
    pTop,
    pBottom,
    cp1Top,
    cp2Top,
    cp1Bottom,
    cp2Bottom,
    beamPath,
    topEdgePath,
    bottomEdgePath,
    markerPoint,
    panelMidPoint,
    motes
  };
}

export const MarkerProjectionBeam: React.FC<MarkerProjectionBeamProps> = ({
  skin,
  userSettings,
  locationInfo,
  selectedMarkerCoordinates,
  isInfoPanelOpen,
  isCameraMoving = false
}) => {
  // 1. Theme and Settings checks
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  if (!isRetro) {
    return null;
  }

  const isEnabled = skin === 'retro-green'
    ? (userSettings.retroGreenProjection !== false)
    : (userSettings.retroAmberProjection !== false);

  if (!isEnabled) {
    return null;
  }

  // 2. InfoPanel and Selected Location checks
  if (!isInfoPanelOpen || !locationInfo) {
    return null;
  }

  const rawCoords = selectedMarkerCoordinates || locationInfo.coordinates || locationInfo.waypoint?.coordinates;
  if (!isValidCoordinates(rawCoords)) {
    return null;
  }

  return (
    <MarkerProjectionBeamInner
      skin={skin}
      coordinates={rawCoords}
      isCameraMoving={isCameraMoving}
    />
  );
};

export function resolveBeamGeometry(coords: { lat: number; lng: number }): BeamGeometry | null {
  const { lat, lng } = coords;
  let point: { x: number; y: number } | null = null;

  // 1. Direct DOM selected marker visual center (exact sub-pixel bounding box of the visual pin)
  if (typeof document !== 'undefined') {
    const selectedMarkerEl = document.querySelector('[data-marker-selected="true"]') ||
                             document.querySelector('[data-marker-hit-id]');
    if (selectedMarkerEl) {
      const pinEl = selectedMarkerEl.querySelector('.rounded-full') || selectedMarkerEl;
      const rect = pinEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        point = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
  }

  // 2. Unified 3D Globe / MapLibre projector from Earth.tsx
  if (!point) {
    const projectFn = typeof window !== 'undefined'
      ? (window as any).__terraexplorer_project_coordinates
      : (typeof global !== 'undefined' ? (global as any).__terraexplorer_project_coordinates : null);

    if (typeof projectFn === 'function') {
      try {
        const pt = projectFn(lat, lng);
        if (pt && typeof pt.x === 'number' && typeof pt.y === 'number' && !isNaN(pt.x) && !isNaN(pt.y)) {
          point = { x: pt.x, y: pt.y };
        }
      } catch (_) {}
    }
  }

  // 3. Direct MapLibre projection fallback
  if (!point) {
    const map = typeof window !== 'undefined'
      ? (window as any).__terraexplorer_maplibre_map
      : (typeof global !== 'undefined' ? (global as any).__terraexplorer_maplibre_map : null);

    if (map && typeof map.project === 'function') {
      try {
        const pt = map.project([lng, lat]);
        if (pt && typeof pt.x === 'number' && typeof pt.y === 'number' && !isNaN(pt.x) && !isNaN(pt.y)) {
          point = { x: pt.x, y: pt.y };
        }
      } catch (_) {}
    }
  }

  if (!point || isNaN(point.x) || isNaN(point.y)) {
    return null;
  }

  // Find rendered InfoPanel element
  let panelRect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  if (typeof document !== 'undefined') {
    const infoPanelEl = document.querySelector('[data-infopanel="true"]') || document.querySelector('[data-testid="info-panel"]');
    if (infoPanelEl) {
      panelRect = infoPanelEl.getBoundingClientRect();
    } else {
      // Default / standard InfoPanel right-side bounds fallback if DOM is mounting in parallel
      const vpW = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const vpH = typeof window !== 'undefined' ? window.innerHeight : 1080;
      panelRect = {
        left: vpW - 460,
        top: 80,
        right: vpW - 20,
        bottom: vpH - 80,
        width: 440,
        height: vpH - 160
      };
    }
  } else {
    panelRect = {
      left: 1460,
      top: 80,
      right: 1900,
      bottom: 1000,
      width: 440,
      height: 920
    };
  }

  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  return calculateBeamTrapezoid(point, panelRect, vpW, vpH);
}

interface MarkerProjectionBeamInnerProps {
  skin: 'retro-green' | 'retro-amber';
  coordinates: { lat: number; lng: number };
  isCameraMoving: boolean;
}

const MarkerProjectionBeamInner: React.FC<MarkerProjectionBeamInnerProps> = ({
  skin,
  coordinates,
  isCameraMoving
}) => {
  const [beamGeometry, setBeamGeometry] = useState<BeamGeometry | null>(() => resolveBeamGeometry(coordinates));
  const [isVisible, setIsVisible] = useState(() => !!beamGeometry);

  const animFrameRef = useRef<number | null>(null);
  const latestCoordsRef = useRef(coordinates);
  latestCoordsRef.current = coordinates;

  const accentColor = skin === 'retro-amber' ? '#fbbf24' : '#4ade80';

  const computeGeometry = useCallback((): BeamGeometry | null => {
    return resolveBeamGeometry(latestCoordsRef.current);
  }, []);

  const updateGeometry = useCallback(() => {
    const geom = computeGeometry();
    if (geom) {
      setBeamGeometry(geom);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [computeGeometry]);

  const scheduleUpdate = useCallback(() => {
    if (animFrameRef.current !== null) return;
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = null;
      updateGeometry();
    });
  }, [updateGeometry]);

  // Track coordinates changes immediately (switch waypoint / location)
  useEffect(() => {
    latestCoordsRef.current = coordinates;
    updateGeometry();
  }, [coordinates.lat, coordinates.lng, updateGeometry]);

  // Track camera movement: while moving, continuously track and project marker
  useEffect(() => {
    if (!isCameraMoving) {
      updateGeometry();
      return;
    }

    let running = true;
    const loop = () => {
      if (!running) return;
      updateGeometry();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isCameraMoving, updateGeometry]);

  // Unified Frame listeners (Globe 3D render + MapLibre + ResizeObserver)
  useEffect(() => {
    // 1. Globe 3D render frame listener
    if (typeof window !== 'undefined') {
      (window as any).__terraexplorer_on_frame = scheduleUpdate;
    }

    // 2. MapLibre movement event listeners
    const map = typeof window !== 'undefined' ? (window as any).__terraexplorer_maplibre_map : null;
    if (map && typeof map.on === 'function' && typeof map.off === 'function') {
      map.on('move', scheduleUpdate);
      map.on('moveend', scheduleUpdate);
      map.on('render', scheduleUpdate);
    }

    // 3. InfoPanel ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    const infoPanelEl = document.querySelector('[data-infopanel="true"]') || document.querySelector('[data-testid="info-panel"]');
    if (infoPanelEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(infoPanelEl);
    }

    // 4. Window resize listener
    const handleWindowResize = () => {
      scheduleUpdate();
    };
    window.addEventListener('resize', handleWindowResize);

    // Initial immediate calculation
    updateGeometry();

    return () => {
      if (typeof window !== 'undefined' && (window as any).__terraexplorer_on_frame === scheduleUpdate) {
        delete (window as any).__terraexplorer_on_frame;
      }
      if (map && typeof map.off === 'function') {
        map.off('move', scheduleUpdate);
        map.off('moveend', scheduleUpdate);
        map.off('render', scheduleUpdate);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleWindowResize);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [scheduleUpdate, updateGeometry]);

  // If geometry is not yet computed or marker is off-screen, render nothing
  if (!beamGeometry) {
    return null;
  }

  const { beamPath, topEdgePath, bottomEdgePath, markerPoint, panelMidPoint, motes } = beamGeometry;

  const gradientId = `projection-beam-gradient-${skin}`;

  return (
    <div
      data-testid="marker-projection-beam-overlay"
      className="fixed inset-0 pointer-events-none z-[15] overflow-hidden"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 120ms ease-out'
      }}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${typeof window !== 'undefined' ? window.innerWidth : 1920} ${typeof window !== 'undefined' ? window.innerHeight : 1080}`}
      >
        <defs>
          {/* Single Projection Beam Gradient */}
          <linearGradient
            id={gradientId}
            x1={markerPoint.x}
            y1={markerPoint.y}
            x2={panelMidPoint.x}
            y2={panelMidPoint.y}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.16" />
            <stop offset="35%" stopColor={accentColor} stopOpacity="0.10" />
            <stop offset="70%" stopColor={accentColor} stopOpacity="0.04" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.005" />
          </linearGradient>

          <style>{`
            @keyframes phosphorGlowFlicker {
              0% {
                opacity: 0.90;
              }
              22% {
                opacity: 0.98;
              }
              45% {
                opacity: 0.88;
              }
              68% {
                opacity: 1.00;
              }
              85% {
                opacity: 0.92;
              }
              100% {
                opacity: 0.90;
              }
            }
            .projection-beam-glow {
              animation: phosphorGlowFlicker 5.8s ease-in-out infinite;
            }

            @keyframes ambientDustDrift {
              0% {
                transform: translate(0px, 0px);
                opacity: var(--mote-op0);
              }
              25% {
                transform: translate(var(--mote-dx1), var(--mote-dy1));
                opacity: var(--mote-op1);
              }
              50% {
                transform: translate(var(--mote-dx2), var(--mote-dy2));
                opacity: var(--mote-op2);
              }
              75% {
                transform: translate(var(--mote-dx3), var(--mote-dy3));
                opacity: var(--mote-op3);
              }
              100% {
                transform: translate(0px, 0px);
                opacity: var(--mote-op0);
              }
            }
            .projection-beam-mote {
              animation: ambientDustDrift var(--mote-dur) ease-in-out infinite;
              animation-delay: var(--mote-delay);
            }

            @media (prefers-reduced-motion: reduce) {
              .projection-beam-glow,
              .projection-beam-mote {
                animation: none !important;
              }
            }
          `}</style>
        </defs>

        <g className="projection-beam-glow">
          {/* Single Closed Primary Projection Beam */}
          <path
            d={beamPath}
            fill={`url(#${gradientId})`}
            stroke="none"
          />

          {/* Subtle Curved Top Edge Illumination */}
          <path
            d={topEdgePath}
            fill="none"
            stroke={accentColor}
            strokeWidth="1"
            strokeOpacity="0.22"
          />

          {/* Subtle Curved Bottom Edge Illumination */}
          <path
            d={bottomEdgePath}
            fill="none"
            stroke={accentColor}
            strokeWidth="1"
            strokeOpacity="0.22"
          />

          {/* Layer 5: Subtle Ambient Dust Motes floating suspended in light cone */}
          {motes.map((mote) => (
            <circle
              key={mote.id}
              cx={mote.cx}
              cy={mote.cy}
              r={mote.r}
              fill={accentColor}
              className="projection-beam-mote"
              style={{
                ['--mote-dur' as any]: `${mote.duration}s`,
                ['--mote-delay' as any]: `${mote.delay}s`,
                ['--mote-dx1' as any]: `${mote.dx1}px`,
                ['--mote-dy1' as any]: `${mote.dy1}px`,
                ['--mote-dx2' as any]: `${mote.dx2}px`,
                ['--mote-dy2' as any]: `${mote.dy2}px`,
                ['--mote-dx3' as any]: `${mote.dx3}px`,
                ['--mote-dy3' as any]: `${mote.dy3}px`,
                ['--mote-op0' as any]: (mote.opacity * 0.82).toFixed(3),
                ['--mote-op1' as any]: (mote.opacity * 1.25).toFixed(3),
                ['--mote-op2' as any]: (mote.opacity * 0.90).toFixed(3),
                ['--mote-op3' as any]: (mote.opacity * 1.35).toFixed(3)
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default MarkerProjectionBeam;
