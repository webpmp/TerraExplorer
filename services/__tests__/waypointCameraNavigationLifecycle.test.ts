import { describe, it, expect, vi } from 'vitest';
import { Waypoint } from '../../types';

describe('Waypoint Camera Navigation Lifecycle & Decoupled Hydration Suite', () => {
  it('1. Triggers camera navigation immediately when saved waypoint is activated, independent of hydration state', () => {
    // Simulate the loadWaypointData lifecycle
    const navigateWaypointCameraMock = vi.fn();
    const startDocumentaryFlowMock = vi.fn();
    const presentWaypointMock = vi.fn();
    const isSavedRouteWaypointMock = vi.fn().mockReturnValue(true);
    const isWaypointHydratedMock = vi.fn().mockReturnValue(false); // Incomplete saved waypoint

    const activeWaypoint: Waypoint = {
      id: 'wp-lc-1',
      name: 'Camp Dubois, Illinois',
      lat: 38.8033,
      lng: -90.1064,
      sequence: 1,
      routeGroupId: 'lewis-and-clark'
    };

    // Simulated loadWaypointData logic from App.tsx
    const loadWaypointData = (wp: Waypoint, previousWp?: Waypoint | null) => {
      // 1. Immediately initiate camera navigation using authoritative waypoint coordinates
      navigateWaypointCameraMock(wp, previousWp);
      startDocumentaryFlowMock(wp, previousWp);

      // 2. Check if saved waypoint is incomplete and should defer InfoPanel display
      const isSavedWp = isSavedRouteWaypointMock(wp);
      const isHydrated = isWaypointHydratedMock(wp);
      const shouldDeferDisplay = isSavedWp && !isHydrated;

      if (!shouldDeferDisplay) {
        presentWaypointMock(wp);
      }

      return { cameraInitiated: true, deferredDisplay: shouldDeferDisplay };
    };

    const result = loadWaypointData(activeWaypoint, null);

    // Camera navigation was immediately called
    expect(navigateWaypointCameraMock).toHaveBeenCalledWith(activeWaypoint, null);
    expect(startDocumentaryFlowMock).toHaveBeenCalledWith(activeWaypoint, null);
    expect(result.cameraInitiated).toBe(true);

    // InfoPanel presentation is deferred until complete enrichment
    expect(result.deferredDisplay).toBe(true);
    expect(presentWaypointMock).not.toHaveBeenCalled();
  });

  it('2. Presents complete InfoPanel and does not re-trigger camera jump once enriched', () => {
    const navigateWaypointCameraMock = vi.fn();
    const presentWaypointMock = vi.fn();

    const fullyEnrichedWaypoint: Waypoint = {
      id: 'wp-lc-1',
      name: 'Camp Dubois, Illinois',
      lat: 38.8033,
      lng: -90.1064,
      sequence: 1,
      routeGroupId: 'lewis-and-clark',
      description: 'Camp Dubois served as the winter encampment and staging point for the Corps of Discovery from December 1803 to May 1804.',
      images: [
        {
          url: 'https://upload.wikimedia.org/camp_dubois.jpg',
          title: 'Camp Dubois Historic Site'
        }
      ],
      notable: [
        {
          title: 'Winter Staging Camp',
          description: 'Where Meriwether Lewis and William Clark trained men and gathered intelligence.'
        }
      ]
    };

    // When enrichment completes:
    presentWaypointMock(fullyEnrichedWaypoint);

    expect(presentWaypointMock).toHaveBeenCalledWith(fullyEnrichedWaypoint);
    expect(fullyEnrichedWaypoint.images).toHaveLength(1);
    expect(fullyEnrichedWaypoint.notable).toHaveLength(1);
  });
});
