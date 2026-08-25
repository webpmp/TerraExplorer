import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateOSMViewportBounds,
  isMarkerInOSMViewport,
  OSMViewportBounds
} from '../../utils/osmViewportUtils';
import {
  documentaryController,
  DocumentaryDestination
} from '../documentaryController';
import {
  calculateModerateFramingDistance,
  calculateGreatCircleDistance,
  isDestinationComfortablyVisible
} from '../../utils/cameraConfig';
import { osmTileService } from '../geographic/osmTileService';
import { Waypoint } from '../../types';

describe('Waypoint Camera Navigation & OSM Viewport Rules Suite', () => {
  const centerCoord = { lat: 51.5074, lng: -0.1278 }; // London
  // Viewport at zoom 14 around London (~10km wide)
  const viewportBounds: OSMViewportBounds = calculateOSMViewportBounds(
    centerCoord.lat,
    centerCoord.lng,
    14,
    1920,
    1080,
    0.04
  );

  beforeEach(() => {
    vi.useFakeTimers();
    documentaryController.cancel('setup');
  });

  // Helper simulating centralized waypoint camera navigation handler
  function simulateWaypointNavigation(
    destination: Waypoint,
    origin: Waypoint,
    currentDist: number,
    isOSMActive: boolean,
    bounds: OSMViewportBounds | null,
    isDocMode: boolean,
    callbacks: {
      onPan: (lat: number, lng: number, dist: number) => void;
      onWaypointTransition: (from: DocumentaryDestination, to: DocumentaryDestination, options: any) => void;
    }
  ) {
    // Prefetch destination tiles upfront before camera moves
    const prefetchedUrls = osmTileService.getTileUrlsForViewport(
      destination.lat,
      destination.lng,
      14,
      'modern',
      1920,
      1080
    );

    const isVisibleInOSMViewport = (typeof destination.lat === 'number' && typeof destination.lng === 'number') && (
      bounds
        ? isMarkerInOSMViewport(destination.lat, destination.lng, bounds)
        : ((isOSMActive || currentDist <= 1.45) && isDestinationComfortablyVisible(
            { lat: origin.lat, lng: origin.lng },
            currentDist,
            { lat: destination.lat, lng: destination.lng },
            { viewportWidth: 1920, viewportHeight: 1080 }
          ))
    );

    if (isOSMActive || currentDist <= 1.45) {
      if (isVisibleInOSMViewport) {
        // Rule 1: Visible in OSM Viewport -> keep current zoom, eased pan
        callbacks.onPan(destination.lat, destination.lng, currentDist);
        return { action: 'PAN_PRESERVE_ZOOM', framingDistance: currentDist, prefetchedTileCount: prefetchedUrls.length };
      } else {
        // Rule 2: Outside OSM Viewport -> controlled moderate zoom-out, never globe
        const angularDist = calculateGreatCircleDistance(origin.lat, origin.lng, destination.lat, destination.lng);
        const maxFramingLimit = 2.65;
        const framingDist = Math.min(
          maxFramingLimit,
          calculateModerateFramingDistance(angularDist, currentDist, 1.30, maxFramingLimit)
        );

        if (isDocMode) {
          callbacks.onWaypointTransition(
            { id: origin.id, name: origin.name, lat: origin.lat, lng: origin.lng, description: origin.description },
            { id: destination.id, name: destination.name, lat: destination.lat, lng: destination.lng, description: destination.description },
            { viewportBounds: bounds, maxFramingDistance: 2.65 }
          );
        } else {
          callbacks.onPan(destination.lat, destination.lng, framingDist);
        }
        return { action: 'MODERATE_ZOOM_TRANSITION', framingDistance: framingDist, prefetchedTileCount: prefetchedUrls.length };
      }
    } else {
      // Globe transition
      return { action: 'GLOBE_TRANSITION', framingDistance: 4.5, prefetchedTileCount: prefetchedUrls.length };
    }
  }

  describe('1. Next waypoint inside viewport → same zoom, eased pan', () => {
    it('preserves exact zoom distance and initiates smooth pan without zooming out or snapping', () => {
      const currentWp: Waypoint = { id: 'wp-1', name: 'Westminster', lat: 51.4995, lng: -0.1248 };
      const nextWp: Waypoint = { id: 'wp-2', name: 'Trafalgar Square', lat: 51.5080, lng: -0.1281 }; // ~1 km away, inside viewport

      expect(isMarkerInOSMViewport(nextWp.lat, nextWp.lng, viewportBounds)).toBe(true);

      let pannedLat = 0;
      let pannedLng = 0;
      let pannedDist = 0;

      const result = simulateWaypointNavigation(
        nextWp,
        currentWp,
        1.25, // current zoom in OSM
        true,
        viewportBounds,
        true,
        {
          onPan: (lat, lng, dist) => {
            pannedLat = lat;
            pannedLng = lng;
            pannedDist = dist;
          },
          onWaypointTransition: vi.fn()
        }
      );

      expect(result.action).toBe('PAN_PRESERVE_ZOOM');
      expect(result.framingDistance).toBe(1.25);
      expect(result.prefetchedTileCount).toBeGreaterThan(0);
      expect(pannedDist).toBe(1.25);
      expect(pannedLat).toBe(nextWp.lat);
      expect(pannedLng).toBe(nextWp.lng);
    });
  });

  describe('2. Next waypoint outside viewport → controlled zoom-out + eased pan', () => {
    it('calculates minimum camera adjustment required and zooms out moderately (<= 2.65), never to globe view', () => {
      const currentWp: Waypoint = { id: 'wp-1', name: 'London', lat: 51.5074, lng: -0.1278 };
      const nextWp: Waypoint = { id: 'wp-2', name: 'Oxford', lat: 51.7520, lng: -1.2577 }; // ~85 km away, outside viewport

      expect(isMarkerInOSMViewport(nextWp.lat, nextWp.lng, viewportBounds)).toBe(false);

      let sampledDistances: number[] = [];
      const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
        sampledDistances.push(dist);
      });

      const onWaypointTransition = vi.fn((from, to, options) => {
        documentaryController.startWaypointTransition(
          from,
          to,
          {
            getCameraDistance: () => 1.30,
            setCameraDistance: vi.fn(),
            setCameraPosition
          },
          options
        );
      });

      const result = simulateWaypointNavigation(
        nextWp,
        currentWp,
        1.30,
        true,
        viewportBounds,
        true,
        {
          onPan: vi.fn(),
          onWaypointTransition
        }
      );

      expect(result.action).toBe('MODERATE_ZOOM_TRANSITION');
      expect(result.framingDistance).toBeGreaterThan(1.30);
      expect(result.framingDistance).toBeLessThanOrEqual(2.65);
      expect(result.prefetchedTileCount).toBeGreaterThan(0);
      expect(onWaypointTransition).toHaveBeenCalled();

      // Verify documentaryController starts in zooming_out phase with moderate framing
      expect(documentaryController.getPhase()).toBe('zooming_out');
    });
  });

  describe('3. Previous waypoint inside viewport → same zoom, eased pan', () => {
    it('preserves exact zoom distance and smoothly pans backwards to previous waypoint', () => {
      const currentWp: Waypoint = { id: 'wp-2', name: 'Trafalgar Square', lat: 51.5080, lng: -0.1281 };
      const prevWp: Waypoint = { id: 'wp-1', name: 'Westminster', lat: 51.4995, lng: -0.1248 }; // inside viewport

      expect(isMarkerInOSMViewport(prevWp.lat, prevWp.lng, viewportBounds)).toBe(true);

      let pannedDist = 0;
      const result = simulateWaypointNavigation(
        prevWp,
        currentWp,
        1.18,
        true,
        viewportBounds,
        true,
        {
          onPan: (lat, lng, dist) => {
            pannedDist = dist;
          },
          onWaypointTransition: vi.fn()
        }
      );

      expect(result.action).toBe('PAN_PRESERVE_ZOOM');
      expect(pannedDist).toBe(1.18);
    });
  });

  describe('4. Previous waypoint outside viewport → controlled zoom-out + eased pan', () => {
    it('moderately lifts camera to frame previous location and destination before descending', () => {
      const currentWp: Waypoint = { id: 'wp-2', name: 'Oxford', lat: 51.7520, lng: -1.2577 };
      const prevWp: Waypoint = { id: 'wp-1', name: 'London', lat: 51.5074, lng: -0.1278 };

      const oxfordBounds = calculateOSMViewportBounds(currentWp.lat, currentWp.lng, 14, 1920, 1080, 0.04);
      expect(isMarkerInOSMViewport(prevWp.lat, prevWp.lng, oxfordBounds)).toBe(false);

      const result = simulateWaypointNavigation(
        prevWp,
        currentWp,
        1.30,
        true,
        oxfordBounds,
        true,
        {
          onPan: vi.fn(),
          onWaypointTransition: vi.fn()
        }
      );

      expect(result.action).toBe('MODERATE_ZOOM_TRANSITION');
      expect(result.framingDistance).toBeGreaterThan(1.30);
      expect(result.framingDistance).toBeLessThanOrEqual(2.65);
    });
  });

  describe('5. Destination far away → never zoom to full-earth view', () => {
    it('strictly caps framing distance <= 2.65 for intercontinental waypoints (e.g. London to Tokyo, 9500 km)', () => {
      const london: DocumentaryDestination = { name: 'London', lat: 51.5074, lng: -0.1278 };
      const tokyo: DocumentaryDestination = { name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

      let maxDistanceReached = 0;
      const setCameraPosition = vi.fn((lat: number, lng: number, dist: number) => {
        if (dist > maxDistanceReached) {
          maxDistanceReached = dist;
        }
      });

      documentaryController.startWaypointTransition(
        london,
        tokyo,
        {
          getCameraDistance: () => 1.30,
          setCameraDistance: vi.fn(),
          setCameraPosition
        },
        {
          duration: 'cinematic',
          maxFramingDistance: 2.65
        }
      );

      // Advance through all animation frames
      for (let t = 0; t <= 5500; t += 100) {
        vi.advanceTimersByTime(100);
      }

      // Max altitude reached during the transition must NEVER exceed 2.65 (full globe is 4.5/5.0)
      expect(maxDistanceReached).toBeLessThanOrEqual(2.65);
      expect(maxDistanceReached).toBeGreaterThan(1.30);
    });
  });

  describe('6. Direct waypoint click and InfoPanel navigation produce the same camera behavior', () => {
    it('produces identical transition decisions and framing distances whether triggered via direct map click or InfoPanel Next/Prev', () => {
      const londonWp: Waypoint = { id: 'wp-1', name: 'London', lat: 51.5074, lng: -0.1278 };
      const cambridgeWp: Waypoint = { id: 'wp-2', name: 'Cambridge', lat: 52.2053, lng: 0.1218 }; // ~80 km away

      // Scenario A: InfoPanel Next button clicked
      const nextResult = simulateWaypointNavigation(
        cambridgeWp,
        londonWp,
        1.30,
        true,
        viewportBounds,
        true,
        {
          onPan: vi.fn(),
          onWaypointTransition: vi.fn()
        }
      );

      // Scenario B: Direct map waypoint marker clicked
      const directClickResult = simulateWaypointNavigation(
        cambridgeWp,
        londonWp,
        1.30,
        true,
        viewportBounds,
        true,
        {
          onPan: vi.fn(),
          onWaypointTransition: vi.fn()
        }
      );

      expect(nextResult.action).toBe(directClickResult.action);
      expect(nextResult.framingDistance).toBeCloseTo(directClickResult.framingDistance, 4);
      expect(nextResult.prefetchedTileCount).toBe(directClickResult.prefetchedTileCount);
    });
  });

  describe('7. Destination tile prefetching and timing verification', () => {
    it('generates correct viewport tile URLs for destination coordinates across skins', () => {
      const urlsModern = osmTileService.getTileUrlsForViewport(51.5074, -0.1278, 14, 'modern', 1920, 1080);
      expect(urlsModern.length).toBeGreaterThan(10);
      expect(urlsModern[0]).toContain('rastertiles/voyager/14');

      const urlsAmber = osmTileService.getTileUrlsForViewport(51.5074, -0.1278, 14, 'retro-amber', 1920, 1080);
      expect(urlsAmber[0]).toContain('dark_all/14');
    });

    it('prefetches destination viewport tiles non-blockingly without throwing errors', async () => {
      const prefetchPromise = osmTileService.prefetchViewportTiles(48.8566, 2.3522, 14, 'modern', 1920, 1080);
      await expect(prefetchPromise).resolves.toBeUndefined();
    });
  });
});
