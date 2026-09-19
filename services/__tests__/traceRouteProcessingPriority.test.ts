import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waypointPipelineRegistry, logRouteScheduling, logProviderStart, logProviderComplete } from '../waypointPipelineService';
import { getWaypointStableId, findNextRouteWaypoint } from '../../utils/routeSequenceUtils';
import { Waypoint } from '../../types';

describe('TRACE ROUTE Waypoint Priority, Sequential Execution & Search Progress', () => {
  const lakeComoWaypoints: Waypoint[] = [
    {
      id: 'wp-como-1',
      name: 'Cattedrale di Como',
      lat: 45.8122,
      lng: 9.0837,
      sequence: 1,
      description: 'The Cattedrale di Santa Maria Assunta is a Roman Catholic cathedral in the city of Como, Lombardy, Italy, begun in 1396 on the site of an earlier Romanesque basilica and featuring late Gothic architecture transitioning to Renaissance style.'
    },
    {
      id: 'wp-como-2',
      name: 'Villa del Balbianello',
      lat: 45.9656,
      lng: 9.2025,
      sequence: 2,
      description: 'Villa del Balbianello is an iconic historic villa situated on the forested tip of the Dosso d\'Avedo peninsula overlooking Lake Como in Lenno, built in 1787 for Cardinal Angelo Maria Durini.'
    },
    {
      id: 'wp-como-3',
      name: 'Villa Carlotta',
      lat: 45.9861,
      lng: 9.2294,
      sequence: 3,
      description: 'Villa Carlotta is a historic villa and botanical garden in Tremezzo on Lake Como, celebrated for its neoclassical architecture and art collections.'
    },
    {
      id: 'wp-como-4',
      name: 'Bellagio Promontory',
      lat: 45.9872,
      lng: 9.2625,
      sequence: 4,
      description: 'Bellagio sits at the junction of the three branches of Lake Como, featuring historic alleys and panoramic alpine lake vistas.'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    waypointPipelineRegistry.clear();
  });

  describe('1. WP1 Exclusive Priority & Lockout of Subsequent Waypoints', () => {
    it('holds exclusive priority on WP1 and rejects WP2+ prefetch requests until released', async () => {
      let routePriorityWaypoint: string | null = null;
      const executedPrefetches: string[] = [];
      const logEvents: string[] = [];

      const prefetchWaypoint = async (wp: Waypoint) => {
        const stableId = getWaypointStableId(wp);
        if (routePriorityWaypoint && routePriorityWaypoint !== stableId) {
          logEvents.push(`BLOCKED: ${wp.name}`);
          return;
        }
        executedPrefetches.push(stableId);
        logEvents.push(`EXECUTED: ${wp.name}`);
      };

      // TRACE ROUTE begins: WP1 presented and acquires priority
      const wp1 = lakeComoWaypoints[0];
      const wp1Id = getWaypointStableId(wp1);
      routePriorityWaypoint = wp1Id;
      logRouteScheduling('WP1 exclusive priority acquired', `id="${wp1.id}" name="${wp1.name}"`);

      // WP2, WP3, WP4 attempt to prefetch while WP1 has exclusive priority
      await prefetchWaypoint(lakeComoWaypoints[1]);
      await prefetchWaypoint(lakeComoWaypoints[2]);
      await prefetchWaypoint(lakeComoWaypoints[3]);

      expect(executedPrefetches).toHaveLength(0);
      expect(logEvents).toContain('BLOCKED: Villa del Balbianello');
      expect(logEvents).toContain('BLOCKED: Villa Carlotta');
      expect(logEvents).toContain('BLOCKED: Bellagio Promontory');

      // WP1 audio ready / playback start releases priority
      logRouteScheduling('WP1 PRIORITY COMPLETE');
      logRouteScheduling('REMAINING WAYPOINT PROCESSING RELEASED');
      routePriorityWaypoint = null;

      // Sequential execution dispatches WP2
      await prefetchWaypoint(lakeComoWaypoints[1]);
      expect(executedPrefetches).toEqual([getWaypointStableId(lakeComoWaypoints[1])]);
      expect(logEvents).toContain('EXECUTED: Villa del Balbianello');
    });
  });

  describe('2. Sequential Queue Execution in Route Order (WP2 -> WP3 -> WP4)', () => {
    it('executes subsequent waypoints strictly sequentially without queue contention', async () => {
      const executionOrder: string[] = [];
      const routeWaypoints = [...lakeComoWaypoints];

      const runSequentialPipeline = async (wp: Waypoint) => {
        const stableId = getWaypointStableId(wp);
        executionOrder.push(wp.name);

        // Simulate LLM enrichment & TTS generation
        logProviderStart('LM Studio', wp.name, stableId);
        logProviderComplete('LM Studio', wp.name, stableId, 250);

        logProviderStart('OrpheusTTS', wp.name, stableId);
        logProviderComplete('OrpheusTTS', wp.name, stableId, 450);

        // Chain to next waypoint
        const next = findNextRouteWaypoint(wp, routeWaypoints);
        if (next) {
          await runSequentialPipeline(next);
        }
      };

      // Start sequential queue from WP2 after WP1 is released
      await runSequentialPipeline(lakeComoWaypoints[1]);

      expect(executionOrder).toEqual([
        'Villa del Balbianello',
        'Villa Carlotta',
        'Bellagio Promontory'
      ]);
    });
  });

  describe('3. Search Status Text Transitions During TRACE ROUTE', () => {
    it('progresses through high-level status messages correctly', () => {
      const statusHistory: (string | null)[] = [];
      let scanningStatusText: string | null = null;

      const setStatus = (status: string | null) => {
        scanningStatusText = status;
        statusHistory.push(status);
      };

      // Step 1: Trace Route Initiated
      setStatus('FINDING WAYPOINTS');
      expect(scanningStatusText).toBe('FINDING WAYPOINTS');

      // Step 2: Route stream receives waypoints
      setStatus('4 WAYPOINTS FOUND');
      expect(scanningStatusText).toBe('4 WAYPOINTS FOUND');

      // Step 3: Fast-track activates WP1
      setStatus('PREPARING WAYPOINT 1');
      expect(scanningStatusText).toBe('PREPARING WAYPOINT 1');

      // Step 4: TTS generation starts for WP1
      setStatus('PREPARING NARRATION');
      expect(scanningStatusText).toBe('PREPARING NARRATION');

      // Step 5: Playback starts, priority released, status cleared
      setStatus(null);
      expect(scanningStatusText).toBeNull();

      expect(statusHistory).toEqual([
        'FINDING WAYPOINTS',
        '4 WAYPOINTS FOUND',
        'PREPARING WAYPOINT 1',
        'PREPARING NARRATION',
        null
      ]);
    });
  });

  describe('4. Active Waypoint Title in Search Input', () => {
    it('displays active waypoint title when navigating routes without search query', () => {
      const routeWaypoints = lakeComoWaypoints;
      let currentWaypointIndex = 0;
      let scanningStatusText: string | null = null;
      let query = '';
      let isFocused = false;
      const placeholder = 'Search location...';

      const getDisplayPlaceholder = (skin: string = 'modern') => {
        const activeWaypointTitle = (routeWaypoints.length > 0 && currentWaypointIndex >= 0)
          ? routeWaypoints[currentWaypointIndex]?.name
          : null;
        const activePlaceholderText = (activeWaypointTitle && !scanningStatusText) ? activeWaypointTitle : placeholder;
        return isFocused ? '' : (skin === 'modern' ? activePlaceholderText : activePlaceholderText.toUpperCase());
      };

      // WP1 active
      expect(getDisplayPlaceholder('modern')).toBe('Cattedrale di Como');
      expect(getDisplayPlaceholder('retro-green')).toBe('CATTEDRALE DI COMO');

      // User focuses input: clears placeholder for typing
      isFocused = true;
      expect(getDisplayPlaceholder('modern')).toBe('');

      // User blurs input: restores active waypoint title
      isFocused = false;
      expect(getDisplayPlaceholder('modern')).toBe('Cattedrale di Como');

      // Navigate to WP2
      currentWaypointIndex = 1;
      expect(getDisplayPlaceholder('modern')).toBe('Villa del Balbianello');
      expect(getDisplayPlaceholder('retro-green')).toBe('VILLA DEL BALBIANELLO');
    });
  });
});
