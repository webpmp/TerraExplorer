import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SkinType } from '../types';
import { vector3ToLatLng, latLngToVector3 } from '../utils/globeCoordinates';
import {
  osmTileService,
  OSMDetailLevel
} from '../services/geographic/osmTileService';

interface OSMMapLayerProps {
  skin: SkinType;
  isInteracting: boolean;
  onCameraChange?: (lat: number, lng: number, distance: number) => void;
  markers?: any[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (e: any, marker: any) => void;
}

interface TileDisplay {
  key: string;
  z: number;
  x: number;
  y: number;
  url: string;
  left: number;
  top: number;
}

interface OSMProjection {
  z: number;
  exactX: number;
  exactY: number;
  screenCenterX: number;
  screenCenterY: number;
}

export const OSMMapLayer: React.FC<OSMMapLayerProps> = ({
  skin,
  isInteracting,
  onCameraChange,
  markers = [],
  selectedMarkerId = null,
  onMarkerClick
}) => {
  const { camera, controls } = useThree();
  const rootGroupRef = useRef<THREE.Group>(null);
  const containerDivRef = useRef<HTMLDivElement | null>(null);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080
  });

  const [opacity, setOpacity] = useState<number>(0);
  const opacityRef = useRef<number>(0);
  const [osmProjection, setOsmProjection] = useState<OSMProjection | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

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

  // Single authoritative OSM camera center and pan state refs
  const osmCameraCenterRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const committedCenterRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const isOSMPanningRef = useRef<boolean>(false);
  const panStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartCenterRef = useRef<{ lat: number; lng: number; distance: number }>({ lat: 0, lng: 0, distance: 1.5 });
  const panStartZoomRef = useRef<number>(14);
  const pressedMarkerRef = useRef<any | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  // Track window resize events
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewportSize({ width: w, height: h });
      console.log(`[OSM Map] OVERLAY_RESIZE width=${w} height=${h} reason=viewport`);
    };

    window.addEventListener('resize', handleResize);
    console.log(`[OSM Map] RENDER_SOURCE=RASTER_TILES provider=carto_osm skin=${skin}`);
    console.log(`[OSM Map] OVERLAY_SIZE width=${window.innerWidth} height=${window.innerHeight}`);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [skin]);

  const loadViewportTiles = useCallback((lat: number, lng: number, distance: number, targetZoom?: number, source: string = 'CAMERA') => {
    let z = targetZoom ?? activeTileZoomRef.current;
    if (isOSMPanningRef.current) {
      z = panStartZoomRef.current;
    }

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
        const key = `osm:${z}:${wrappedX}:${y}`;

        const tileLeft = screenCenterX + (x - exactX) * TILE_PX;
        const tileTop = screenCenterY + (y - exactY) * TILE_PX;

        const existing = activeTilesMapRef.current.get(key);
        if (existing) {
          retainedCount++;
          updatedTilesMap.set(key, { ...existing, left: tileLeft, top: tileTop });
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
            top: tileTop
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
    panStartCenterRef.current = { lat: startGeo.lat, lng: startGeo.lng, distance: startDist };
    panStartZoomRef.current = activeTileZoomRef.current;
    osmCameraCenterRef.current = { lat: startGeo.lat, lng: startGeo.lng };
    pendingTileZoomRef.current = null;

    console.log('[Camera Sync] SOURCE=OSM_PAN');
    console.log(`[Camera Sync] OSM_PAN_START centerLat=${startGeo.lat.toFixed(4)} centerLng=${startGeo.lng.toFixed(4)}`);
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

    // Check if this was a marker click without significant drag
    if (pressedMarkerRef.current && !hasDraggedRef.current && onMarkerClick) {
      onMarkerClick(e, pressedMarkerRef.current.data || pressedMarkerRef.current);
    }
    pressedMarkerRef.current = null;
    hasDraggedRef.current = false;

    const committedCenter = { ...osmCameraCenterRef.current };
    committedCenterRef.current = committedCenter;
    const dist = panStartCenterRef.current.distance;

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

  // Non-passive wheel handler attached directly to DOM container
  useEffect(() => {
    const el = containerDivRef.current;
    if (!el) return;

    const onWheelNonPassive = (e: WheelEvent) => {
      if (opacityRef.current < 0.05 || !rootGroupRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      console.log(`[OSM Map] WHEEL delta=${e.deltaY}`);
      const currentDist = camera.position.length();
      const zoomFactor = e.deltaY > 0 ? 1.05 : 0.95;
      const newDist = Math.max(1.018, Math.min(8.0, currentDist * zoomFactor));

      const localCamPos = rootGroupRef.current.worldToLocal(camera.position.clone());
      const currentGeo = vector3ToLatLng(localCamPos);

      if (onCameraChange) {
        onCameraChange(currentGeo.lat, currentGeo.lng, newDist);
      } else {
        camera.position.normalize().multiplyScalar(newDist);
        camera.lookAt(0, 0, 0);
        if (controls && (controls as any).update) {
          (controls as any).target.set(0, 0, 0);
          (controls as any).update();
        }
      }

      loadViewportTiles(currentGeo.lat, currentGeo.lng, newDist, activeTileZoomRef.current, 'OSM_WHEEL');
    };

    el.addEventListener('wheel', onWheelNonPassive, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNonPassive);
    };
  }, [camera, controls, onCameraChange, loadViewportTiles]);

  useFrame((state) => {
    if (!rootGroupRef.current) return;

    // Transform world camera position into Earth's local coordinate frame
    const localCamPos = rootGroupRef.current.worldToLocal(state.camera.position.clone());
    const dist = localCamPos.length();

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

    // 2. Strict Detail-Level Gate: distance > 1.55 is LOCAL / REGIONAL / GLOBAL (Gate CLOSED)
    if (dist > 1.55) {
      if (wasGateOpenRef.current) {
        wasGateOpenRef.current = false;
      }

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

      return;
    }

    // Gate is open (dist <= 1.45: CLOSE, STREET, STREET_CLOSE, STREET_DETAIL, STREET_MAX)
    if (!wasGateOpenRef.current && dist <= 1.45) {
      wasGateOpenRef.current = true;
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

        const { lat, lng } = vector3ToLatLng(localCamPos);
        loadViewportTiles(lat, lng, dist, nextZoom, 'ZOOM_COMMIT');
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

        const { lat, lng } = vector3ToLatLng(camPos);
        loadViewportTiles(lat, lng, currentDist, activeTileZoomRef.current, 'CAMERA_SETTLE');
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
  const themeStyle = useMemo<React.CSSProperties>(() => {
    if (skin === 'retro-green') {
      return {
        filter: 'grayscale(100%) brightness(0.85) sepia(100%) hue-rotate(90deg) contrast(1.6)'
      };
    }
    if (skin === 'retro-amber') {
      return {
        filter: 'grayscale(100%) brightness(0.88) sepia(100%) hue-rotate(5deg) contrast(1.5)'
      };
    }
    return {
      filter: 'contrast(1.05)'
    };
  }, [skin]);

  return (
    <group ref={rootGroupRef}>
      {isVisible && (
        <Html
          fullscreen
          zIndexRange={[10, 0]}
          style={{
            pointerEvents: isInteractive ? 'auto' : 'none',
            opacity: opacity,
            transition: 'opacity 0.25s ease-out',
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            zIndex: 10,
            cursor: isInteractive ? 'grab' : 'default',
            userSelect: 'none',
            touchAction: 'none'
          }}
        >
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
            {/* Fallback tiles layer (rendered underneath during zoom transitions) */}
            {fallbackTilesList.map((tile) => (
              <img
                key={`fb:${tile.key}`}
                src={tile.url}
                alt=""
                draggable={false}
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

            {/* OSM Geographic Markers & Labels Layer (Anchored to true Lat/Lng via Web Mercator projection) */}
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
              const isWaypoint = marker.isWaypoint;
              const pinSize = isSelected ? 22 : 16;
              const color = marker.color || (skin === 'parchment' ? '#8b5a2b' : '#3b82f6');
              const outlineColor = skin === 'parchment' ? '#f4ead5' : (skin === 'retro-green' ? '#4ade80' : (skin === 'retro-amber' ? '#fbbf24' : '#ffffff'));

              const markerDisplayName =
                (marker.data as any)?.displayName ||
                marker.data?.name ||
                marker.name ||
                (isWaypoint ? `Waypoint ${marker.index !== undefined ? marker.index + 1 : ''}` : 'Location');

              return (
                <div
                  key={`osm-marker-container-${marker.id ?? idx}`}
                  style={{
                    position: 'absolute',
                    left: `${left}px`,
                    top: `${top}px`,
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
                    {/* Small Geographic Visual Pin */}
                    <div
                      style={{
                        width: `${pinSize}px`,
                        height: `${pinSize}px`,
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
                        transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out'
                      }}
                    >
                      {isWaypoint && marker.index !== undefined && (
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

                  {/* Co-located OSM Marker Label (Visible on Hover or Selection, strictly pointer-events: none) */}
                  {(isSelected || isHovered) && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: `${pinSize / 2 + 8}px`,
                        left: '0px',
                        transform: 'translateX(-50%)',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold shadow-lg border backdrop-blur-md transition-all duration-150
                        ${skin === 'parchment'
                          ? 'bg-[#2a221b]/95 text-[#f4ead5] border-[#8b5a2b]/60'
                          : skin === 'retro-amber'
                            ? 'bg-black text-amber-300 border-amber-400 font-mono'
                            : skin === 'retro-green'
                              ? 'bg-black text-green-300 border-green-400 font-mono'
                              : 'bg-black/80 text-white border-white/30'
                        }`}
                    >
                      {isWaypoint && marker.index !== undefined
                        ? `${marker.index + 1}. ${markerDisplayName}`
                        : markerDisplayName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Html>
      )}
    </group>
  );
};

export default OSMMapLayer;
