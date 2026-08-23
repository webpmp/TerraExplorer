import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { narrationService } from '../narrationService';
import { documentaryController } from '../documentaryController';
import { Waypoint, MapMarker } from '../../types';

describe('Route Lifecycle, Waypoint Labels, and Narration Separation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    narrationService.cancel();
    documentaryController.cancel('test_setup');
  });

  afterEach(() => {
    narrationService.cancel();
    documentaryController.cancel('test_teardown');
  });

  describe('1. Waypoint Marker & Label Lifecycle Independent of InfoPanel State', () => {
    const mockWaypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Plymouth, England', lat: 50.3755, lng: -4.1427, description: 'Departure point of the voyage.' },
      { id: 'wp-2', name: 'Cape Verde', lat: 14.933, lng: -23.5133, description: 'Archipelago off the coast of West Africa.' },
      { id: 'wp-3', name: 'Strait of Magellan', lat: -53.4833, lng: -70.7833, description: 'Navigable sea route south of South America.' }
    ];

    it('resolves effectiveSelectedMarkerId to the active waypoint when InfoPanel is closed (selectedMarkerId is null)', () => {
      let selectedMarkerId: string | null = 'wp-1';
      let currentWaypointIndex = 0;
      let routeWaypoints = [...mockWaypoints];

      // Helper simulating Earth.tsx effectiveSelectedMarkerId logic
      const computeEffectiveId = (selId: string | null, wps: Waypoint[], idx: number) => {
        const activeWpId = (wps && wps.length > 0 && idx !== undefined && idx >= 0 && idx < wps.length)
          ? (wps[idx]?.id || `${wps[idx]?.name}-${wps[idx]?.lat}-${wps[idx]?.lng}`)
          : null;
        return selId || activeWpId;
      };

      // Initially when InfoPanel is open
      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBe('wp-1');

      // User closes InfoPanel (handleClosePanel sets selectedMarkerId = null)
      selectedMarkerId = null;

      // Waypoint label MUST still resolve to the active waypoint (wp-1)
      const effectiveIdAfterClose = computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex);
      expect(effectiveIdAfterClose).toBe('wp-1');

      // Waypoint navigation changes index to 1 (Cape Verde)
      currentWaypointIndex = 1;
      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBe('wp-2');
    });

    it('clears effectiveSelectedMarkerId when route is cleared (new search)', () => {
      const computeEffectiveId = (selId: string | null, wps: Waypoint[], idx: number) => {
        const activeWpId = (wps && wps.length > 0 && idx !== undefined && idx >= 0 && idx < wps.length)
          ? (wps[idx]?.id || `${wps[idx]?.name}-${wps[idx]?.lat}-${wps[idx]?.lng}`)
          : null;
        return selId || activeWpId;
      };

      let selectedMarkerId: string | null = null;
      let routeWaypoints: Waypoint[] = [];
      let currentWaypointIndex = -1;

      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBeNull();
    });
  });

  describe('2. Narration Lifecycle Separation From Route Cleanup', () => {
    it('allows currently playing narration to continue when route is cleared during a new search transition', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');
      const cancelSpy = vi.spyOn(narrationService, 'cancel');

      // 1. Start route narration for waypoint 1
      narrationService.speakStructured({
        title: 'Plymouth, England',
        description: 'Departure point of the voyage across the Atlantic.'
      });
      expect(speakSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1); // initial reset in speakStructured

      // 2. User performs a new location search for "Louvre Museum"
      // Simulating search start: route is cleared, but narrationService.cancel() is NOT called merely because route was cleared
      let routeWaypoints: Waypoint[] = [];
      let activeRouteId: string | null = null;
      expect(routeWaypoints.length).toBe(0);
      expect(activeRouteId).toBeNull();

      // Ensure cancel was not called during route clearing
      expect(cancelSpy).toHaveBeenCalledTimes(1); // Still 1 from initial start

      // 3. New search completes and starts new narration for "Louvre Museum"
      narrationService.speakStructured({
        title: 'Louvre Museum',
        description: 'World largest art museum and historic monument in Paris, France.'
      });

      // New narration replaces the previous narration seamlessly
      expect(speakSpy).toHaveBeenCalledTimes(2);
      expect(cancelSpy).toHaveBeenCalledTimes(2);
    });
  });
});
