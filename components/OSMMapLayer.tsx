import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SkinType, Waypoint } from '../types';
import { vector3ToLatLng, latLngToVector3 } from '../utils/globeCoordinates';
import {
  normalizeWheelDelta,
  calculateOSMZoomStep,
  OSM_WHEEL_STEP_THRESHOLD
} from '../utils/cameraZoomUtils';
import {
  osmTileService,
  OSMDetailLevel,
  OSM_DETAIL_THRESHOLD,
  OSM_RASTER_ALTITUDE
} from '../services/geographic/osmTileService';
import { getOsmPalette } from '../utils/osmPalettes';

export interface OSMMapLayerProps {
  skin: SkinType;
  isInteracting: boolean;
  onCameraChange?: (lat: number, lng: number, distance: number) => void;
  markers?: any[];
  selectedMarkerId?: string | null;
  selectedMarkerCoordinates?: { lat: number; lng: number } | null;
  onMarkerClick?: (e: any, marker: any) => void;
  onMapReady?: (ready: boolean) => void;
  routeWaypoints?: Waypoint[];
  currentWaypointIndex?: number;
}

interface TileDisplay {
  key: string;
  z: number;
  x: number;
  y: number;
  url: string;
  left: number;
  top: number;
  transitionId?: number;
}

interface OSMProjection {
  z: number;
  exactX: number;
  exactY: number;
  screenCenterX: number;
  screenCenterY: number;
}

export interface OSMMarkerOffsetOptions {
  pinSize?: number;
  isSelected?: boolean;
  labelBounds?: { left: number; top: number; right: number; bottom: number } | null;
}

export interface OSMMarkerOffset {
  x: number;
  y: number;
}

/**
 * Calculates a generic visual screen-space offset for OSM map markers when zoomed in
 * to prevent the marker pin from obscuring underlying OSM place/city/landmark text labels.
 *
 * Requirements:
 * - Geographically anchored (lat/lng coordinates are never modified).
 * - Only adjusts visual screen-space position (x, y in pixels).
 * - Modest 6 to 10px offset when sufficiently zoomed in (zoom >= 12).
 * - Label-aware if label geometry/bounds are available, with conservative vertical offset fallback.
 * - Recalculated dynamically as zoom level or viewport changes.
 */
export function calculateOSMMarkerVisualOffset(
  zoom: number,
  options?: OSMMarkerOffsetOptions
): OSMMarkerOffset {
  // Label-aware placement if text/label geometry is detected or provided
  if (options?.labelBounds) {
    const lb = options.labelBounds;
    const labelHeight = Math.max(12, lb.bottom - lb.top);
    const verticalShift = Math.round(Math.min(10, Math.max(6, labelHeight / 2 + 3)));
    return { x: 0, y: -verticalShift };
  }

  // Conservative vertical screen-space offset fallback
  // At low zoom (< 12), no visual offset is needed
  if (zoom < 12) {
    return { x: 0, y: 0 };
  }

  // Zoom 12 (Close/City overview level): 6px conservative upward offset
  if (zoom <= 12) {
    return { x: 0, y: -6 };
  }

  // Zoom 14 (Street / district level): 8px offset
  if (zoom <= 14) {
    return { x: 0, y: -8 };
  }

  // Zoom 16 (Close street level): 8px offset
  if (zoom <= 16) {
    return { x: 0, y: -8 };
  }

  // Zoom 18 to 19 (Detail / maximum street level): 10px offset
  return { x: 0, y: -10 };
}

export const OSMMapLayer: React.FC<OSMMapLayerProps> = ({
  skin,
  isInteracting,
  onCameraChange,
  markers = [],
  selectedMarkerId = null,
  selectedMarkerCoordinates = null,
  onMarkerClick,
  onMapReady,
  routeWaypoints = [],
  currentWaypointIndex
}) => {
  const { camera, controls } = useThree();
  const rootGroupRef = useRef<THREE.Group>(null);
  const containerDivRef = useRef<HTMLDivElement | null>(null);
  const markersLayerRef = useRef<HTMLDivElement | null>(null);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  });

  const [opacity, setOpacity] = useState<number>(0);
  const opacityRef = useRef<number>(0);
  const [osmProjection, setOsmProjection] = useState<OSMProjection | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

  // Departing waypoint marker & label fade-out tracking
  const [departingMarkerId, setDepartingMarkerId] = useState<string | null>(null);
  const [isDepartingFading, setIsDepartingFading] = useState<boolean>(false);
  const prevSelectedMarkerIdRef = useRef<string | null>(selectedMarkerId || null);

  useEffect(() => {
    if (
      prevSelectedMarkerIdRef.current &&
      selectedMarkerId &&
      prevSelectedMarkerIdRef.current !== selectedMarkerId
    ) {
      const departingId = prevSelectedMarkerIdRef.current;
      setDepartingMarkerId(departingId);
      setIsDepartingFading(false);

      const frameId = requestAnimationFrame(() => {
        setIsDepartingFading(true);
      });

      const timer = setTimeout(() => {
        setDepartingMarkerId(null);
        setIsDepartingFading(false);
      }, 380);

      prevSelectedMarkerIdRef.current = selectedMarkerId;
      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(timer);
      };
    }
    prevSelectedMarkerIdRef.current = selectedMarkerId || null;
  }, [selectedMarkerId]);

  // Active primary tiles and fallback tiles for smooth transitions
  const activeTilesMapRef = useRef<Map<string, TileDisplay>>(new Map());
  const fallbackTilesMapRef = useRef<Map<string, TileDisplay>>(new Map());
  const [activeTilesList, setActiveTilesList] = useState<TileDisplay[]>([]);
  const [fallbackTilesList, setFallbackTilesList] = useState<TileDisplay[]>([]);

  const lastSampledPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 10));
  const settleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const currentDetailLevelRef = useRef<OSMDetailLevel>('global');
  const wasGateOpenRef = useRef<boolean>(false);

  // Discrete Tile Zoom State & Dwell Time Refs
  const activeTileZoomRef = useRef<number>(14);
  const pendingTileZoomRef = useRef<{ zoom: number; since: number } | null>(null);
  const transitionStateRef = useRef<{
    fromZoom: number;
    toZoom: number;
    startedAt: number;
    loadedCount: number;
    totalCount: number;
  } | null>(null);

  // Transition & Session Identifier
  const transitionIdRef = useRef<number>(0);
  const lastGlobeGeoRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // Wheel Delta Accumulation and Step Cooldown for Discrete OSM Zoom Steps
  const wheelDeltaAccumulatorRef = useRef<number>(0);
  const lastWheelTimeRef = useRef<number>(0);
  const lastStepTimeRef = useRef<number>(0);

  // Single authoritative OSM camera center and pan state refs
  const osmCameraCenterRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const committedCenterRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const isOSMPanningRef = useRef<boolean>(false);
  const panStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartCenterRef = useRef<{ lat: number; lng: number; distance: number }>({ lat: 0, lng: 0, distance: 1.5 });
  const panStartZoomRef = useRef<number>(14);
  const pressedMarkerRef = useRef<any | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const hasUserPannedSinceSelectionRef = useRef<boolean>(false);

  // Tile Loading & Readiness Tracking
  const loadedTileKeysRef = useRef<Set<string>>(new Set());
  const isMapReadyRef = useRef<boolean>(false);

  const handleTileLoaded = useCallback((key: string, tileTransitionId?: number) => {
    if (tileTransitionId !== undefined && tileTransitionId !== transitionIdRef.current) {
      return;
    }
    loadedTileKeysRef.current.add(key);
    const total = activeTilesMapRef.current.size;
    if (total > 0) {
      let loadedCount = 0;
      activeTilesMapRef.current.forEach((t) => {
        if (loadedTileKeysRef.current.has(t.key)) loadedCount++;
      });
      // Declared ready when primary coverage (>= 4 tiles or >= 40% of viewport tile set) is rendered
      const threshold = Math.min(4, Math.max(1, Math.ceil(total * 0.4)));
      if (loadedCount >= threshold) {
        if (fallbackTilesMapRef.current.size > 0) {
          fallbackTilesMapRef.current.clear();
          setFallbackTilesList([]);
        }
        if (!isMapReadyRef.current) {
          isMapReadyRef.current = true;
          console.log('[OSM] Map ready', {
            transitionId: transitionIdRef.current,
            latitude: osmCameraCenterRef.current.lat,
            longitude: osmCameraCenterRef.current.lng,
            coverage: (loadedCount / total).toFixed(2)
          });
          onMapReady?.(true);
        }
      }
    }
  }, [onMapReady]);

  const loadViewportTiles = useCallback((lat: number, lng: number, distance: number, targetZoom?: number, source: string = 'CAMERA', explicitTransitionId?: number) => {
    let z = targetZoom ?? activeTileZoomRef.current;
    if (isOSMPanningRef.current) {
      z = panStartZoomRef.current;
    }

    const currentTransitionId = explicitTransitionId ?? transitionIdRef.current;

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    const n = Math.pow(2, z);
    const centerTile = osmTileService.latLngToTile(lat, lng, z);

    // Exact continuous fractional tile position of center coordinate
    const exactX = ((lng + 180) / 360) * n;
    const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const exactY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const width = viewportSize.width;
    const height = viewportSize.height;
    const screenCenterX = width / 2;
    const screenCenterY = height / 2;

    const TILE_PX = 256;
    // Overscan coverage: viewport + 2 extra tiles on all sides for continuous seamless panning
    const tilesX = Math.ceil(width / (2 * TILE_PX)) + 2;
    const tilesY = Math.ceil(height / (2 * TILE_PX)) + 2;

    const updatedTilesMap = new Map<string, TileDisplay>();
    let addedCount = 0;
    let retainedCount = 0;

    for (let dx = -tilesX; dx <= tilesX; dx++) {
      if (abortController.signal.aborted) return;
      for (let dy = -tilesY; dy <= tilesY; dy++) {
        const x = Math.floor(exactX) + dx;
        const y = Math.floor(exactY) + dy;
        if (y < 0 || y >= n) continue;

        const wrappedX = ((x % n) + n) % n;
        const key = `osm:${skin}:${z}:${wrappedX}:${y}`;

        const tileLeft = screenCenterX + (x - exactX) * TILE_PX;
        const tileTop = screenCenterY + (y - exactY) * TILE_PX;

        const existing = activeTilesMapRef.current.get(key);
        if (existing) {
          retainedCount++;
          updatedTilesMap.set(key, { ...existing, left: tileLeft, top: tileTop, transitionId: currentTransitionId });
        } else {
          addedCount++;
          const url = osmTileService.getTileUrl(z, wrappedX, y, skin);
          updatedTilesMap.set(key, {
            key,
            z,
            x: wrappedX,
            y,
            url,
            left: tileLeft,
            top: tileTop,
            transitionId: currentTransitionId
          });
        }
      }
    }

    if (abortController.signal.aborted) return;

    const removedCount = Math.max(0, activeTilesMapRef.current.size - retainedCount);
    activeTilesMapRef.current = updatedTilesMap;
    const newTilesList = Array.from(updatedTilesMap.values());
    setActiveTilesList(newTilesList);
    setOsmProjection({
      z,
      exactX,
      exactY,
      screenCenterX,
      screenCenterY
    });

    const bounds = osmTileService.tileToBounds(z, centerTile.x, centerTile.y);
    console.log(
      `[OSM Map] VIEWPORT centerLat=${lat.toFixed(4)} centerLng=${lng.toFixed(4)} bounds=${bounds.minLat.toFixed(4)},${bounds.minLng.toFixed(4)}..${bounds.maxLat.toFixed(4)},${bounds.maxLng.toFixed(4)} cameraDistance=${distance.toFixed(4)}`
    );
    console.log(`[OSM Map] VIEWPORT_CENTER_SOURCE lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} source=${source}`);
    if (addedCount > 0 || removedCount > 0) {
      console.log(`[OSM Map] TILE_SET z=${z} added=${addedCount} removed=${removedCount} retained=${retainedCount} total=${newTilesList.length}`);
    }

    // If in transition, evaluate coverage completion
    if (transitionStateRef.current && transitionStateRef.current.toZoom === z) {
      const total = newTilesList.length;
      transitionStateRef.current.totalCount = total;
      transitionStateRef.current.loadedCount = total;
      const coverage = 1.0;
      console.log(`[OSM Map] TILE_TRANSITION_PROGRESS from=${transitionStateRef.current.fromZoom} to=${z} coverage=${coverage.toFixed(2)}`);
      console.log(`[OSM Map] TILE_TRANSITION_READY from=${transitionStateRef.current.fromZoom} to=${z} coverage=1.00`);
      console.log(`[OSM Map] TILE_TRANSITION_COMPLETE active=${z}`);

      // Prune fallback tiles once transition is complete
      fallbackTilesMapRef.current.clear();
      setFallbackTilesList([]);
      transitionStateRef.current = null;
    }
  }, [skin, viewportSize]);

  // Track window resize events
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewportSize({ width: w, height: h });
      console.log(`[OSM Map] OVERLAY_RESIZE width=${w} height=${h} reason=viewport`);
    };

    window.addEventListener('resize', handleResize);
    console.log(`[OSM Map] OVERLAY_SIZE width=${window.innerWidth} height=${window.innerHeight}`);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Track theme/skin transitions and immediately reload tiles with new palette/URL
  const prevSkinRef = useRef<SkinType>(skin);
  useEffect(() => {
    console.log(`[OSM Map] RENDER_SOURCE=RASTER_TILES provider=carto_osm skin=${skin}`);
    if (prevSkinRef.current !== skin) {
      const oldSkin = prevSkinRef.current;
      prevSkinRef.current = skin;

      if (opacityRef.current > 0.01 || activeTilesMapRef.current.size > 0) {
        console.log(`[OSM Map] THEME_SWITCH from=${oldSkin} to=${skin}`);

        // Retain existing tiles as fallback underneath so screen never goes blank or flickers during theme transition
        fallbackTilesMapRef.current = new Map(activeTilesMapRef.current);
        setFallbackTilesList(Array.from(activeTilesMapRef.current.values()));
        activeTilesMapRef.current.clear();

        let centerLat = committedCenterRef.current.lat;
        let centerLng = committedCenterRef.current.lng;
        if (centerLat === 0 && centerLng === 0) {
          centerLat = osmCameraCenterRef.current.lat || (selectedMarkerCoordinates?.lat ?? 0);
          centerLng = osmCameraCenterRef.current.lng || (selectedMarkerCoordinates?.lng ?? 0);
        }

        const localCamPos = rootGroupRef.current ? rootGroupRef.current.worldToLocal(camera.position.clone()) : null;
        const currentDist = localCamPos ? localCamPos.length() : 1.5;

        loadViewportTiles(centerLat, centerLng, currentDist, activeTileZoomRef.current, 'THEME_CHANGE');
      }
    }
  }, [skin, loadViewportTiles, camera, selectedMarkerCoordinates]);

  // Synchronize authoritative center when a marker is selected
  useEffect(() => {
    if (selectedMarkerCoordinates) {
      hasUserPannedSinceSelectionRef.current = false;
      const targetLat = selectedMarkerCoordinates.lat;
      const targetLng = selectedMarkerCoordinates.lng;
      osmCameraCenterRef.current = { lat: targetLat, lng: targetLng };
      committedCenterRef.current = { lat: targetLat, lng: targetLng };

      if (opacityRef.current > 0.01 && rootGroupRef.current) {
        const localCamPos = rootGroupRef.current.worldToLocal(camera.position.clone());
        const dist = localCamPos.length();
        if (dist <= 1.55) {
          loadViewportTiles(targetLat, targetLng, dist, activeTileZoomRef.current, 'MARKER_SELECTION');
        }
      }
    }
  }, [selectedMarkerCoordinates, selectedMarkerId, camera, loadViewportTiles]);

  // Pointer event handlers for authoritative slippy map pan
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (opacityRef.current < 0.05 || !rootGroupRef.current) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const localCamPos = rootGroupRef.current.worldToLocal(camera.position.clone());
    const startDist = localCamPos.length();
    const startGeo = vector3ToLatLng(localCamPos);

    isOSMPanningRef.current = true;
    hasDraggedRef.current = false;
    panStartPointerRef.current = { x: e.clientX, y: e.clientY };

    const effectiveStartLat = (osmCameraCenterRef.current.lat !== 0 || osmCameraCenterRef.current.lng !== 0)
      ? osmCameraCenterRef.current.lat
      : startGeo.lat;
    const effectiveStartLng = (osmCameraCenterRef.current.lat !== 0 || osmCameraCenterRef.current.lng !== 0)
      ? osmCameraCenterRef.current.lng
      : startGeo.lng;

    panStartCenterRef.current = { lat: effectiveStartLat, lng: effectiveStartLng, distance: startDist };
    panStartZoomRef.current = activeTileZoomRef.current;
    pendingTileZoomRef.current = null;

    console.log('[Camera Sync] SOURCE=OSM_PAN');
    console.log(`[Camera Sync] OSM_PAN_START centerLat=${effectiveStartLat.toFixed(4)} centerLng=${effectiveStartLng.toFixed(4)}`);
    console.log(`[OSM Map] TILE_ZOOM_PRESERVED z=${panStartZoomRef.current}`);
    console.log('[OSM Map] INPUT_CAPTURED');
  }, [camera]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isOSMPanningRef.current || !rootGroupRef.current) return;
    e.stopPropagation();

    const dx = e.clientX - panStartPointerRef.current.x;
    const dy = e.clientY - panStartPointerRef.current.y;

    if (Math.hypot(dx, dy) > 4) {
      hasDraggedRef.current = true;
      hasUserPannedSinceSelectionRef.current = true;
    }

    const z = panStartZoomRef.current;
    const n = Math.pow(2, z);
    const worldSize = 256 * n;

    const startLat = panStartCenterRef.current.lat;
    const startLng = panStartCenterRef.current.lng;
    const dist = panStartCenterRef.current.distance;

    // Web Mercator normalized start coordinates
    const startWorldX = (startLng + 180) / 360;
    const startLatRad = (Math.max(-85.0511, Math.min(85.0511, startLat)) * Math.PI) / 180;
    const startWorldY = (1 - Math.log(Math.tan(startLatRad) + 1 / Math.cos(startLatRad)) / Math.PI) / 2;

    // Apply continuous pixel displacement from stable origin
    const newWorldX = startWorldX - dx / worldSize;
    const newWorldY = startWorldY - dy / worldSize;

    // Inverse Web Mercator projection with antimeridian normalization
    let newLng = ((newWorldX * 360 - 180 + 180) % 360 + 360) % 360 - 180;
    const clampedY = Math.max(0.0001, Math.min(0.9999, newWorldY));
    const nMerc = Math.PI - 2 * Math.PI * clampedY;
    const newLat = Math.max(-85.0511, Math.min(85.0511, (180 / Math.PI) * Math.atan(Math.sinh(nMerc))));

    // Authoritative OSM state update
    osmCameraCenterRef.current = { lat: newLat, lng: newLng };

    // Synchronize 3D globe one-way
    if (onCameraChange) {
      onCameraChange(newLat, newLng, dist);
    } else {
      const targetLocalPos = latLngToVector3(newLat, newLng, dist);
      const targetWorldPos = rootGroupRef.current.localToWorld(targetLocalPos);
      camera.position.copy(targetWorldPos);
      camera.lookAt(0, 0, 0);
      if (controls && (controls as any).update) {
        (controls as any).target.set(0, 0, 0);
        (controls as any).update();
      }
    }

    // Keep local position synchronized to avoid any post-pan jump
    const updatedLocalPos = latLngToVector3(newLat, newLng, dist);
    lastSampledPosRef.current.copy(updatedLocalPos);

    loadViewportTiles(newLat, newLng, dist, z, 'OSM_PAN_MOVE');
  }, [camera, controls, onCameraChange, loadViewportTiles]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isOSMPanningRef.current) return;
    isOSMPanningRef.current = false;
    e.stopPropagation();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const dist = panStartCenterRef.current.distance;

    // Check if this was a marker click without significant drag
    if (pressedMarkerRef.current && !hasDraggedRef.current) {
      const clickedMarker = pressedMarkerRef.current.data || pressedMarkerRef.current;
      pressedMarkerRef.current = null;
      hasDraggedRef.current = false;

      if (clickedMarker && typeof clickedMarker.lat === 'number' && typeof clickedMarker.lng === 'number') {
        const markerCoord = { lat: clickedMarker.lat, lng: clickedMarker.lng };
        osmCameraCenterRef.current = markerCoord;
        committedCenterRef.current = markerCoord;
        hasUserPannedSinceSelectionRef.current = false;

        console.log(`[OSM Map] MARKER_CLICK_CENTER lat=${markerCoord.lat.toFixed(4)} lng=${markerCoord.lng.toFixed(4)}`);

        if (onCameraChange) {
          onCameraChange(markerCoord.lat, markerCoord.lng, dist);
        }

        if (rootGroupRef.current) {
          const finalLocalPos = latLngToVector3(markerCoord.lat, markerCoord.lng, dist);
          lastSampledPosRef.current.copy(finalLocalPos);
        }

        if (settleTimerRef.current) {
          clearTimeout(settleTimerRef.current);
          settleTimerRef.current = null;
        }

        loadViewportTiles(markerCoord.lat, markerCoord.lng, dist, activeTileZoomRef.current, 'OSM_MARKER_CLICK');
      }

      if (onMarkerClick) {
        onMarkerClick(e, clickedMarker);
      }
      return;
    }

    pressedMarkerRef.current = null;
    if (hasDraggedRef.current) {
      hasUserPannedSinceSelectionRef.current = true;
    }
    hasDraggedRef.current = false;

    const committedCenter = { ...osmCameraCenterRef.current };
    committedCenterRef.current = committedCenter;

    console.log(`[Camera Sync] OSM_PAN_END centerLat=${committedCenter.lat.toFixed(4)} centerLng=${committedCenter.lng.toFixed(4)}`);
    console.log(`[Camera Sync] FINAL_COMMIT centerLat=${committedCenter.lat.toFixed(4)} centerLng=${committedCenter.lng.toFixed(4)}`);
    console.log(`[OSM Map] COMMITTED_CENTER lat=${committedCenter.lat.toFixed(4)} lng=${committedCenter.lng.toFixed(4)}`);
    console.log('[OSM Map] INPUT_RELEASED');

    // Final authoritative commit to globe
    if (onCameraChange) {
      onCameraChange(committedCenter.lat, committedCenter.lng, dist);
    }

    if (rootGroupRef.current) {
      const finalLocalPos = latLngToVector3(committedCenter.lat, committedCenter.lng, dist);
      lastSampledPosRef.current.copy(finalLocalPos);
    }

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    // Immediately render viewport with the exact committed coordinates
    loadViewportTiles(committedCenter.lat, committedCenter.lng, dist, activeTileZoomRef.current, 'OSM_COMMITTED');
  }, [onCameraChange, onMarkerClick, loadViewportTiles]);

  // Authoritative non-passive wheel handler with capture to guarantee reception whenever OSM is active
  useEffect(() => {
    const onWheelAuthoritative = (e: WheelEvent) => {
      // Only intercept when OSM map layer is active and visible
      if (opacityRef.current < 0.05 || !rootGroupRef.current) return;

      // Do NOT intercept if the pointer is over the InfoPanel or interactive UI overlays
      const target = e.target as Element | null;
      if (target && typeof target.closest === 'function') {
        const isOverUI = target.closest('[data-infopanel]') ||
                         target.closest('[data-testid="info-panel"]') ||
                         target.closest('.info-panel-scrollable') ||
                         target.closest('[data-testid="favorites-panel"]') ||
                         target.closest('[data-testid="settings-panel"]') ||
                         target.closest('[data-testid="lightbox-modal"]') ||
                         (target.closest('.pointer-events-auto') && !target.closest('#canvas-container'));
        if (isOverUI) return;
      }

      if (e.composedPath) {
        const path = e.composedPath();
        for (const item of path) {
          if (item instanceof Element) {
            if (item.hasAttribute('data-infopanel') || 
                item.getAttribute('data-testid') === 'info-panel' ||
                item.classList.contains('info-panel-scrollable') ||
                (item.classList.contains('pointer-events-auto') && !item.closest('#canvas-container'))) {
              return;
            }
          }
        }
      }

      e.preventDefault();
      e.stopPropagation();

      const normalizedDelta = normalizeWheelDelta(e.deltaY, e.deltaMode);
      const now = Date.now();
      const rawDeltaY = e.deltaY;
      const deltaMode = e.deltaMode;
      const currentDist = camera.position.length();
      const currentZoom = activeTileZoomRef.current;

      const accumulatorBefore = wheelDeltaAccumulatorRef.current;

      // Reset accumulator if user paused scrolling for more than 250ms
      if (now - lastWheelTimeRef.current > 250) {
        wheelDeltaAccumulatorRef.current = 0;
      }
      lastWheelTimeRef.current = now;

      // Check if this is a discrete physical mouse wheel notch:
      // Line/page scroll modes OR a large single delta (|deltaY| >= 50 or |normalizedDelta| >= 50)
      const isDiscreteWheel = deltaMode !== 0 || Math.abs(rawDeltaY) >= 50 || Math.abs(normalizedDelta) >= 50;

      let stepTriggered = false;
      let targetZoom = currentZoom;
      let targetDistance = currentDist;
      let exitsOSM = false;

      if (isDiscreteWheel) {
        // Enforce a small debounce cooldown (100ms) to prevent hardware accelerated flick bursts
        if (now - lastStepTimeRef.current >= 100) {
          stepTriggered = true;
          lastStepTimeRef.current = now;
          wheelDeltaAccumulatorRef.current = 0;

          const direction = normalizedDelta < 0 ? 'in' : 'out';
          const stepResult = calculateOSMZoomStep(currentZoom, direction);
          targetZoom = stepResult.targetZoom;
          targetDistance = stepResult.targetDistance;
          exitsOSM = stepResult.exitsOSM;
        }
      } else {
        // Continuous precision trackpad input: accumulate micro-deltas
        wheelDeltaAccumulatorRef.current += normalizedDelta;

        if (Math.abs(wheelDeltaAccumulatorRef.current) >= OSM_WHEEL_STEP_THRESHOLD && (now - lastStepTimeRef.current >= 100)) {
          stepTriggered = true;
          lastStepTimeRef.current = now;
          const direction = wheelDeltaAccumulatorRef.current < 0 ? 'in' : 'out';
          wheelDeltaAccumulatorRef.current = 0;

          const stepResult = calculateOSMZoomStep(currentZoom, direction);
          targetZoom = stepResult.targetZoom;
          targetDistance = stepResult.targetDistance;
          exitsOSM = stepResult.exitsOSM;
        }
      }

      const accumulatorAfter = wheelDeltaAccumulatorRef.current;

      // Diagnostic Logging
      console.log('[OSM WHEEL]', {
        rawDeltaY,
        deltaMode,
        normalizedDelta,
        accumulatorBefore,
        accumulatorAfter,
        activeZoom: currentZoom,
        cameraDistance: currentDist,
        stepTriggered,
        targetZoom,
        targetDistance,
      });

      if (!stepTriggered) return;

      console.log(`[OSM Map] WHEEL direction=${normalizedDelta < 0 ? 'in' : 'out'} currentZoom=${currentZoom} targetZoom=${targetZoom} targetDistance=${targetDistance.toFixed(4)} exitsOSM=${exitsOSM}`);

      let anchorLat: number;
      let anchorLng: number;

      if (selectedMarkerCoordinates && !hasUserPannedSinceSelectionRef.current) {
        anchorLat = selectedMarkerCoordinates.lat;
        anchorLng = selectedMarkerCoordinates.lng;
      } else if (committedCenterRef.current.lat !== 0 || committedCenterRef.current.lng !== 0) {
        anchorLat = committedCenterRef.current.lat;
        anchorLng = committedCenterRef.current.lng;
      } else {
        const localCamPos = rootGroupRef.current.worldToLocal(camera.position.clone());
        const currentGeo = vector3ToLatLng(localCamPos);
        anchorLat = currentGeo.lat;
        anchorLng = currentGeo.lng;
      }

      osmCameraCenterRef.current = { lat: anchorLat, lng: anchorLng };
      committedCenterRef.current = { lat: anchorLat, lng: anchorLng };

      if (!exitsOSM && targetZoom !== currentZoom) {
        // Immediately retain current tiles as fallback so screen never goes blank during transition
        fallbackTilesMapRef.current = new Map(activeTilesMapRef.current);
        setFallbackTilesList(Array.from(activeTilesMapRef.current.values()));
        activeTilesMapRef.current.clear();

        activeTileZoomRef.current = targetZoom;
        pendingTileZoomRef.current = null;

        transitionStateRef.current = {
          fromZoom: currentZoom,
          toZoom: targetZoom,
          startedAt: now,
          loadedCount: 0,
          totalCount: 0
        };

        loadViewportTiles(anchorLat, anchorLng, targetDistance, targetZoom, 'OSM_WHEEL');
      }

      if (onCameraChange) {
        onCameraChange(anchorLat, anchorLng, targetDistance);
      } else {
        camera.position.normalize().multiplyScalar(targetDistance);
        camera.lookAt(0, 0, 0);
        if (controls && (controls as any).update) {
          (controls as any).target.set(0, 0, 0);
          (controls as any).update();
        }
      }
    };

    window.addEventListener('wheel', onWheelAuthoritative, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', onWheelAuthoritative, { capture: true });
    };
  }, [camera, controls, onCameraChange, loadViewportTiles, selectedMarkerCoordinates]);

  useFrame((state) => {
    if (!rootGroupRef.current) return;

    // Transform world camera position into Earth's local coordinate frame
    const localCamPos = rootGroupRef.current.worldToLocal(state.camera.position.clone());
    const dist = localCamPos.length();
    const currentGeo = vector3ToLatLng(localCamPos);

    // 1. Progressive Opacity with Hysteresis (full opacity at close and street levels)
    let targetOpacity = 0;
    if (dist <= 1.55) {
      const t = Math.max(0, Math.min(1, (1.55 - dist) / (1.55 - 1.40)));
      targetOpacity = t * t * (3 - 2 * t);
    }

    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, 0.2);
    const roundedOpacity = Math.round(opacityRef.current * 100) / 100;
    if (Math.abs(roundedOpacity - opacity) >= 0.04) {
      setOpacity(roundedOpacity);
    }

    // Authoritative OSM Detail Visibility Controller (mutually exclusive with Globe markers & labels)
    const isOSMDetailActive = dist <= OSM_DETAIL_THRESHOLD;
    if (markersLayerRef.current) {
      markersLayerRef.current.style.display = isOSMDetailActive ? 'block' : 'none';
    }

    // 2. Detect Globe Navigation Active / Transition Interrupted:
    // If distance > 1.55 (outside OSM detail view) and either:
    // - User is actively dragging / rotating the globe (isInteracting)
    // - Camera shifted geographically across the globe (|dLat| > 0.5 or |dLng| > 0.5)
    // - Camera ascended above 1.85 into space
    const dLat = Math.abs(currentGeo.lat - lastGlobeGeoRef.current.lat);
    const dLng = Math.abs(currentGeo.lng - lastGlobeGeoRef.current.lng);
    const hasGlobeShifted = wasGateOpenRef.current && (dLat > 0.5 || (dLng > 0.5 && dLng < 359.5));
    const isReturningToGlobe = dist > 1.85 || (dist > 1.55 && (isInteracting || hasGlobeShifted));

    if (isReturningToGlobe) {
      if (wasGateOpenRef.current) {
        wasGateOpenRef.current = false;
        console.log('[Transition] CANCEL', transitionIdRef.current, 'reason=globe_active');
        console.log('[Transition] GLOBE ACTIVE');
        console.log('[OSM] Returning to globe');
      }

      if (isMapReadyRef.current) {
        isMapReadyRef.current = false;
        onMapReady?.(false);
      }

      // Invalidate active transition session and discard pending tile tasks
      transitionIdRef.current++;
      loadedTileKeysRef.current.clear();
      osmCameraCenterRef.current = { lat: 0, lng: 0 };
      committedCenterRef.current = { lat: 0, lng: 0 };
      hasUserPannedSinceSelectionRef.current = false;

      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }

      if (activeTilesMapRef.current.size > 0) {
        activeTilesMapRef.current.clear();
        fallbackTilesMapRef.current.clear();
        setActiveTilesList([]);
        setFallbackTilesList([]);
      }

      lastGlobeGeoRef.current = currentGeo;
      return;
    }

    // Gate is open (dist <= 1.85): Initialize / Preload Viewport Tiles for New Transition
    if (!wasGateOpenRef.current && dist <= 1.85 && !isInteracting) {
      wasGateOpenRef.current = true;
      transitionIdRef.current++;
      const currentTransitionId = transitionIdRef.current;

      lastGlobeGeoRef.current = currentGeo;

      // Check if selected marker is geographically proximate to current camera view
      let targetCoords = currentGeo;
      if (selectedMarkerCoordinates && !hasUserPannedSinceSelectionRef.current) {
        const markerDLat = Math.abs(currentGeo.lat - selectedMarkerCoordinates.lat);
        const markerDLng = Math.abs(currentGeo.lng - selectedMarkerCoordinates.lng);
        const isNearMarker = markerDLat < 5 && (markerDLng < 5 || markerDLng > 355);
        if (isNearMarker) {
          targetCoords = { lat: selectedMarkerCoordinates.lat, lng: selectedMarkerCoordinates.lng };
        }
      }

      osmCameraCenterRef.current = targetCoords;
      committedCenterRef.current = targetCoords;
      hasUserPannedSinceSelectionRef.current = false;
      isMapReadyRef.current = false;
      loadedTileKeysRef.current.clear();
      onMapReady?.(false);

      console.log('[Transition] START', currentTransitionId, {
        latitude: targetCoords.lat,
        longitude: targetCoords.lng
      });
      console.log('[OSM] NEW DESTINATION', {
        transitionId: currentTransitionId,
        latitude: targetCoords.lat,
        longitude: targetCoords.lng
      });

      loadViewportTiles(targetCoords.lat, targetCoords.lng, dist, activeTileZoomRef.current, 'TRANSITION_INITIAL', currentTransitionId);
    }

    const newLevel = osmTileService.getDetailLevel(dist, currentDetailLevelRef.current);
    if (newLevel !== currentDetailLevelRef.current) {
      console.log(`[OSM Map] CAMERA_ZOOM distance=${dist.toFixed(4)} level=${newLevel.toUpperCase()}`);
      currentDetailLevelRef.current = newLevel;
    }

    // If active manual interaction (pan or globe drag), freeze tile zoom
    if (isOSMPanningRef.current || isInteracting) {
      pendingTileZoomRef.current = null;
      return;
    }

    // 3. Evaluate candidate discrete tile zoom with dwell time requirement & single-step clamping
    const { nextZoom, reason, clampedFrom } = osmTileService.getNextAdjacentTileZoom(activeTileZoomRef.current, dist);

    if (clampedFrom !== undefined) {
      console.log(`[OSM Map] TILE_ZOOM_CLAMP current=${activeTileZoomRef.current} requested=${clampedFrom} next=${nextZoom}`);
    }

    if (nextZoom !== activeTileZoomRef.current) {
      const now = Date.now();
      if (!pendingTileZoomRef.current || pendingTileZoomRef.current.zoom !== nextZoom) {
        pendingTileZoomRef.current = { zoom: nextZoom, since: now };
        console.log(`[OSM Map] TILE_ZOOM_CANDIDATE current=${activeTileZoomRef.current} candidate=${nextZoom} reason=${reason}`);
        console.log(`[OSM Map] TILE_ZOOM_PENDING current=${activeTileZoomRef.current} candidate=${nextZoom}`);
      } else if (now - pendingTileZoomRef.current.since >= 250) {
        // Dwell time satisfied: commit tile zoom transition with dual-layer fallback
        const oldZoom = activeTileZoomRef.current;
        activeTileZoomRef.current = nextZoom;
        pendingTileZoomRef.current = null;

        console.log(`[OSM Map] TILE_ZOOM_COMMIT current=${oldZoom} next=${nextZoom}`);
        console.log(`[OSM Map] TILE_TRANSITION_START from=${oldZoom} to=${nextZoom}`);

        // Retain previous tiles as fallback layer so map is never blank during transition
        fallbackTilesMapRef.current = new Map(activeTilesMapRef.current);
        setFallbackTilesList(Array.from(activeTilesMapRef.current.values()));

        activeTilesMapRef.current.clear();
        transitionStateRef.current = {
          fromZoom: oldZoom,
          toZoom: nextZoom,
          startedAt: now,
          loadedCount: 0,
          totalCount: 0
        };

        let targetLat: number;
        let targetLng: number;
        if (selectedMarkerCoordinates && !hasUserPannedSinceSelectionRef.current) {
          targetLat = selectedMarkerCoordinates.lat;
          targetLng = selectedMarkerCoordinates.lng;
        } else if (committedCenterRef.current.lat !== 0 || committedCenterRef.current.lng !== 0) {
          targetLat = committedCenterRef.current.lat;
          targetLng = committedCenterRef.current.lng;
        } else {
          const { lat, lng } = vector3ToLatLng(localCamPos);
          targetLat = lat;
          targetLng = lng;
        }
        loadViewportTiles(targetLat, targetLng, dist, nextZoom, 'ZOOM_COMMIT');
      }
    } else {
      pendingTileZoomRef.current = null;
    }

    // 4. Motion Sampling & Settle Debounce (when not manually dragging)
    const moveDist = localCamPos.distanceTo(lastSampledPosRef.current);
    if (moveDist > 0.002) {
      lastSampledPosRef.current.copy(localCamPos);

      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }

      settleTimerRef.current = setTimeout(() => {
        if (isOSMPanningRef.current) return;
        const camPos = lastSampledPosRef.current;
        const currentDist = camPos.length();
        if (currentDist > 1.55) return;

        let targetLat: number;
        let targetLng: number;
        if (selectedMarkerCoordinates && !hasUserPannedSinceSelectionRef.current) {
          targetLat = selectedMarkerCoordinates.lat;
          targetLng = selectedMarkerCoordinates.lng;
        } else if (committedCenterRef.current.lat !== 0 || committedCenterRef.current.lng !== 0) {
          targetLat = committedCenterRef.current.lat;
          targetLng = committedCenterRef.current.lng;
        } else {
          const { lat, lng } = vector3ToLatLng(camPos);
          targetLat = lat;
          targetLng = lng;
        }

        osmCameraCenterRef.current = { lat: targetLat, lng: targetLng };
        committedCenterRef.current = { lat: targetLat, lng: targetLng };
        loadViewportTiles(targetLat, targetLng, currentDist, activeTileZoomRef.current, 'CAMERA_SETTLE');
      }, 350); // 350ms settle debounce
    }
  });

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }
      osmTileService.cancelAll();
    };
  }, []);

  const isVisible = opacity > 0.01;
  const isInteractive = opacity > 0.05;

  // Theme styling filter for the overlay (clean native rendering for standard and parchment skin)
  const themePalette = useMemo(() => getOsmPalette(skin), [skin]);
  const themeStyle = useMemo<React.CSSProperties>(() => {
    return {
      filter: themePalette.cssFilter
    };
  }, [themePalette]);

  return (
    <group ref={rootGroupRef}>
      {isVisible && (
        <Html
          fullscreen
          zIndexRange={[10, 0]}
          style={{
            pointerEvents: isInteractive ? 'auto' : 'none',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            zIndex: 10,
            cursor: isInteractive ? 'grab' : 'default',
            userSelect: 'none',
            touchAction: 'none'
          }}
        >
          {/* CRT Phosphor SVG Filter Definitions */}
          <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true">
            <defs>
              <filter id="retro-green-osm-filter" colorInterpolationFilters="sRGB">
                <feColorMatrix
                  type="matrix"
                  values="
                    0.12  0.04 -0.18  0  0.02
                    0.65  0.28 -0.75  0  0.09
                    0.18  0.08 -0.22  0  0.03
                    0.00  0.00  0.00  1  0.00
                  "
                />
                <feComponentTransfer>
                  <feFuncR type="gamma" amplitude="1.0" exponent="1.2" offset="0" />
                  <feFuncG type="gamma" amplitude="1.05" exponent="1.1" offset="0.01" />
                  <feFuncB type="gamma" amplitude="1.0" exponent="1.3" offset="0" />
                </feComponentTransfer>
              </filter>

              <filter id="retro-amber-osm-filter" colorInterpolationFilters="sRGB">
                <feColorMatrix
                  type="matrix"
                  values="
                    0.80  0.32 -0.85  0  0.11
                    0.50  0.22 -0.55  0  0.06
                    0.08  0.04 -0.12  0  0.01
                    0.00  0.00  0.00  1  0.00
                  "
                />
                <feComponentTransfer>
                  <feFuncR type="gamma" amplitude="1.08" exponent="1.1" offset="0.01" />
                  <feFuncG type="gamma" amplitude="1.0" exponent="1.2" offset="0.01" />
                  <feFuncB type="gamma" amplitude="0.8" exponent="1.5" offset="0" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>

          <div
            ref={containerDivRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              ...themeStyle
            }}
          >
            {/* Tile container with progressive tile opacity */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: opacity,
                transition: 'opacity 0.25s ease-out',
                pointerEvents: 'none'
              }}
            >
              {/* Fallback tiles layer (rendered underneath during zoom transitions) */}
              {fallbackTilesList.map((tile) => (
                <img
                  key={`fb:${tile.key}`}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  onLoad={() => handleTileLoaded(tile.key, tile.transitionId)}
                  onError={() => handleTileLoaded(tile.key, tile.transitionId)}
                  style={{
                    position: 'absolute',
                    left: `${tile.left}px`,
                    top: `${tile.top}px`,
                    width: '256px',
                    height: '256px',
                    imageRendering: 'auto',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 1
                  }}
                />
              ))}

              {/* Primary active tiles layer (top) */}
              {activeTilesList.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  onLoad={() => handleTileLoaded(tile.key, tile.transitionId)}
                  onError={() => handleTileLoaded(tile.key, tile.transitionId)}
                  style={{
                    position: 'absolute',
                    left: `${tile.left}px`,
                    top: `${tile.top}px`,
                    width: '256px',
                    height: '256px',
                    imageRendering: 'auto',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 2
                  }}
                />
              ))}
            </div>

            {/* OSM Geographic Markers & Labels Layer (Contained in a single visibility-controlled element, strictly active only when dist <= OSM_DETAIL_THRESHOLD) */}
            <div
              ref={markersLayerRef}
              style={{
                display: 'none',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
            >
              {/* OSM Active Route Connection Line Overlay */}
              {osmProjection && routeWaypoints && routeWaypoints.length > 1 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 10,
                    overflow: 'visible'
                  }}
                >
                  {routeWaypoints.slice(0, -1).map((wp, i) => {
                    const nextWp = routeWaypoints[i + 1];
                    if (
                      typeof wp.lat !== 'number' || typeof wp.lng !== 'number' ||
                      typeof nextWp.lat !== 'number' || typeof nextWp.lng !== 'number'
                    ) {
                      return null;
                    }

                    const n = Math.pow(2, osmProjection.z);

                    // Project wp1
                    const x1 = ((wp.lng + 180) / 360) * n;
                    const latRad1 = (Math.max(-85.0511, Math.min(85.0511, wp.lat)) * Math.PI) / 180;
                    const y1 = ((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n;
                    const sx1 = osmProjection.screenCenterX + (x1 - osmProjection.exactX) * 256;
                    const sy1 = osmProjection.screenCenterY + (y1 - osmProjection.exactY) * 256;

                    // Project wp2 (handling antimeridian wrap if needed)
                    let lng2 = nextWp.lng;
                    if (lng2 - wp.lng > 180) lng2 -= 360;
                    else if (lng2 - wp.lng < -180) lng2 += 360;

                    const x2 = ((lng2 + 180) / 360) * n;
                    const latRad2 = (Math.max(-85.0511, Math.min(85.0511, nextWp.lat)) * Math.PI) / 180;
                    const y2 = ((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n;
                    const sx2 = osmProjection.screenCenterX + (x2 - osmProjection.exactX) * 256;
                    const sy2 = osmProjection.screenCenterY + (y2 - osmProjection.exactY) * 256;

                    // Check if both points are far off-screen
                    if (
                      (sx1 < -500 && sx2 < -500) ||
                      (sx1 > viewportSize.width + 500 && sx2 > viewportSize.width + 500) ||
                      (sy1 < -500 && sy2 < -500) ||
                      (sy1 > viewportSize.height + 500 && sy2 > viewportSize.height + 500)
                    ) {
                      return null;
                    }

                    const routeColor = skin === 'parchment'
                      ? '#8b5a2b'
                      : skin === 'retro-amber'
                        ? themePalette.highways
                        : skin === 'retro-green'
                          ? themePalette.highways
                          : '#00e5ff';

                    const haloColor = skin === 'parchment'
                      ? 'rgba(244, 234, 213, 0.85)'
                      : 'rgba(0, 0, 0, 0.75)';

                    return (
                      <g key={`osm-route-seg-${wp.id || i}-${nextWp.id || i + 1}`}>
                        {/* Subtle contrast halo / backdrop */}
                        <line
                          x1={sx1}
                          y1={sy1}
                          x2={sx2}
                          y2={sy2}
                          stroke={haloColor}
                          strokeWidth={5}
                          strokeLinecap="round"
                        />
                        {/* Main dashed thematic route line */}
                        <line
                          x1={sx1}
                          y1={sy1}
                          x2={sx2}
                          y2={sy2}
                          stroke={routeColor}
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          strokeLinecap="round"
                          opacity={0.9}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {osmProjection && markers && markers.map((marker, idx) => {
                if (typeof marker.lat !== 'number' || typeof marker.lng !== 'number') return null;

                const n = Math.pow(2, osmProjection.z);
                const markerX = ((marker.lng + 180) / 360) * n;
                const latRad = (Math.max(-85.0511, Math.min(85.0511, marker.lat)) * Math.PI) / 180;
                const markerY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

                const left = osmProjection.screenCenterX + (markerX - osmProjection.exactX) * 256;
                const top = osmProjection.screenCenterY + (markerY - osmProjection.exactY) * 256;

                // Viewport culling with margin
                if (
                  left < -150 || left > viewportSize.width + 150 ||
                  top < -150 || top > viewportSize.height + 150
                ) {
                  return null;
                }

                const isSelected = selectedMarkerId === marker.id;
                const isHovered = hoveredMarkerId === marker.id;
                const isDeparting = departingMarkerId === marker.id;
                const isWaypoint = marker.isWaypoint;
                const isMultiLocation = marker.isMultiLocation ?? false;
                const showMarkerNumber = isWaypoint && isMultiLocation && marker.index !== undefined;
                const pinSize = isSelected ? 22 : 16;
                const color = marker.color || (skin === 'parchment' ? '#8b5a2b' : '#3b82f6');
                const outlineColor = skin === 'parchment' ? '#f4ead5' : (skin === 'retro-green' ? themePalette.highways : (skin === 'retro-amber' ? themePalette.highways : '#ffffff'));

                const markerDisplayName =
                  (marker.data as any)?.displayName ||
                  marker.data?.name ||
                  marker.name ||
                  (showMarkerNumber ? `Waypoint ${marker.index + 1}` : 'Location');

                // Compute screen-space visual offset to avoid obscuring underlying OSM labels
                const visualOffset = calculateOSMMarkerVisualOffset(osmProjection.z, {
                  pinSize,
                  isSelected
                });
                const visualLeft = left + visualOffset.x;
                const visualTop = top + visualOffset.y;

                const isLabelVisible = isSelected || isHovered || isDeparting;

                return (
                  <div
                    key={`osm-marker-container-${marker.id ?? idx}`}
                    style={{
                      position: 'absolute',
                      left: `${visualLeft}px`,
                      top: `${visualTop}px`,
                      pointerEvents: 'auto',
                      zIndex: isSelected || isHovered ? 35 : 20
                    }}
                  >
                    {/* Invisible 40px x 40px Interactive Hit Area */}
                    <div
                      onPointerDown={() => {
                        pressedMarkerRef.current = marker;
                        hasDraggedRef.current = false;
                      }}
                      onPointerCancel={() => {
                        pressedMarkerRef.current = null;
                        hasDraggedRef.current = false;
                      }}
                      onMouseEnter={() => setHoveredMarkerId(marker.id)}
                      onMouseLeave={() => {
                        if (hoveredMarkerId === marker.id) {
                          setHoveredMarkerId(null);
                        }
                      }}
                      title={markerDisplayName}
                      style={{
                        position: 'absolute',
                        left: '0px',
                        top: '0px',
                        width: '40px',
                        height: '40px',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                        background: 'transparent'
                      }}
                    >
                      {/* Small Geographic Visual Pin (strictly 1:1 circular geometry) */}
                      <div
                        style={{
                          width: `${pinSize}px`,
                          height: `${pinSize}px`,
                          minWidth: `${pinSize}px`,
                          minHeight: `${pinSize}px`,
                          flexShrink: 0,
                          aspectRatio: '1 / 1',
                          boxSizing: 'border-box',
                          backgroundColor: color,
                          borderRadius: '50%',
                          border: `2px solid ${outlineColor}`,
                          boxShadow: isSelected
                            ? '0 0 0 3px rgba(255, 255, 255, 0.85), 0 2px 6px rgba(0, 0, 0, 0.5)'
                            : '0 1px 4px rgba(0, 0, 0, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none',
                          userSelect: 'none',
                          opacity: isDeparting ? (isDepartingFading ? 0.7 : 1) : 1,
                          transition: isDeparting
                            ? 'opacity 350ms ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out'
                            : 'transform 0.15s ease-out, box-shadow 0.15s ease-out'
                        }}
                      >
                        {showMarkerNumber && (
                          <span
                            style={{
                              fontSize: isSelected ? '11px' : '9px',
                              fontWeight: 'bold',
                              color: '#ffffff',
                              lineHeight: 1,
                              pointerEvents: 'none'
                            }}
                          >
                            {marker.index + 1}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Co-located OSM Marker Label (Visible on Hover, Selection, or Departing Fade, strictly pointer-events: none) */}
                    {isLabelVisible && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: `${pinSize / 2 + 8}px`,
                          left: '0px',
                          transform: 'translateX(-50%)',
                          pointerEvents: 'none',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          opacity: isDeparting ? (isDepartingFading ? 0 : 1) : 1,
                          transition: isDeparting
                            ? 'opacity 350ms ease-out'
                            : 'all 150ms ease-out'
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold shadow-lg border backdrop-blur-md
                          ${skin === 'parchment'
                            ? 'bg-[#2a221b]/95 text-[#f4ead5] border-[#8b5a2b]/60'
                            : skin === 'retro-amber'
                              ? 'bg-black text-amber-300 border-amber-400 font-mono'
                              : skin === 'retro-green'
                                ? 'bg-black text-green-300 border-green-400 font-mono'
                                : 'bg-black/80 text-white border-white/30'
                          }`}
                      >
                        {markerDisplayName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default OSMMapLayer;
