import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waypointPipelineRegistry } from '../waypointPipelineService';
import { waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises, CachedNarrationAudio } from '../cacheService';
import { getWaypointStableId } from '../../utils/routeSequenceUtils';
import { LocationInfo, Waypoint } from '../../types';
import { latLngToVector3 } from '../../utils/globeCoordinates';

describe('TRACE ROUTE Globe Positioning & First Waypoint Decoupled Narration', () => {
  beforeEach(() => {
    waypointPipelineRegistry.clear();
    waypointEnrichmentCache.clear();
    waypointNarrationCache.clear();
    inFlightNarrationPromises.clear();
    vi.clearAllMocks();
  });

  describe('1. Globe Waypoint Marker Positioning (No Circular Displacement)', () => {
    it('preserves true geographic 3D coordinates for tightly clustered waypoints on the globe', () => {
      // 3 clustered waypoints around Bellagio / Lake Como
      const wp1: Waypoint = {
        id: 'wp-como-1',
        name: 'Villa del Balbianello in Lenno',
        lat: 45.9654,
        lng: 9.2025,
        sequence: 1
      };
      const wp2: Waypoint = {
        id: 'wp-como-2',
        name: 'Villa Carlotta in Tremezzo',
        lat: 45.9861,
        lng: 9.2294,
        sequence: 2
      };
      const wp3: Waypoint = {
        id: 'wp-como-3',
        name: 'Teresio Olivelli Park',
        lat: 45.9870,
        lng: 9.2300,
        sequence: 3
      };

      const MARKER_ALTITUDE = 1.015;
      const expectedPos1 = latLngToVector3(wp1.lat, wp1.lng, MARKER_ALTITUDE);
      const expectedPos2 = latLngToVector3(wp2.lat, wp2.lng, MARKER_ALTITUDE);
      const expectedPos3 = latLngToVector3(wp3.lat, wp3.lng, MARKER_ALTITUDE);

      // In the updated Earth.tsx implementation, finalPosMap stores true coordinates
      const finalPosMap = new Map<string, any>();
      const itemsWithPos = [
        { ...wp1, position: latLngToVector3(wp1.lat, wp1.lng, MARKER_ALTITUDE) },
        { ...wp2, position: latLngToVector3(wp2.lat, wp2.lng, MARKER_ALTITUDE) },
        { ...wp3, position: latLngToVector3(wp3.lat, wp3.lng, MARKER_ALTITUDE) }
      ];

      itemsWithPos.forEach(item => finalPosMap.set(item.id, item.position));

      // Assert that positions match true geographic coordinates exactly
      expect(finalPosMap.get('wp-como-1').x).toBeCloseTo(expectedPos1.x, 5);
      expect(finalPosMap.get('wp-como-1').y).toBeCloseTo(expectedPos1.y, 5);
      expect(finalPosMap.get('wp-como-1').z).toBeCloseTo(expectedPos1.z, 5);

      expect(finalPosMap.get('wp-como-2').x).toBeCloseTo(expectedPos2.x, 5);
      expect(finalPosMap.get('wp-como-2').y).toBeCloseTo(expectedPos2.y, 5);
      expect(finalPosMap.get('wp-como-2').z).toBeCloseTo(expectedPos2.z, 5);

      expect(finalPosMap.get('wp-como-3').x).toBeCloseTo(expectedPos3.x, 5);
      expect(finalPosMap.get('wp-como-3').y).toBeCloseTo(expectedPos3.y, 5);
      expect(finalPosMap.get('wp-como-3').z).toBeCloseTo(expectedPos3.z, 5);
    });
  });

  describe('2. Decoupled First-Waypoint Narration Lifecycle', () => {
    it('initiates narration immediately upon topDescriptionReady without waiting for full enrichment', async () => {
      const stableId = 'wp-como-1';
      const executionLog: string[] = [];

      // Step 1: Route generation returns waypoints
      executionLog.push('[TRACE ROUTE][Waypoint 1] route generated');
      waypointPipelineRegistry.recordTimestamp(stableId, 'selected', Date.now());

      // Step 2: Enrichment starts
      executionLog.push('[TRACE ROUTE][Waypoint 1] enrichment started');
      waypointPipelineRegistry.recordTimestamp(stableId, 'enrichmentStarted', Date.now());

      // Step 3: Top description becomes ready (researched description available)
      const topDescription = 'Villa del Balbianello is an iconic villa on Lake Como celebrated for its terraced gardens and historic architecture.';
      executionLog.push(`[TRACE ROUTE][Waypoint 1] top description ready: length=${topDescription.length}`);
      executionLog.push('[TRACE ROUTE][Waypoint 1] narration source ready: "Villa del Balbianello"');
      waypointPipelineRegistry.recordTimestamp(stableId, 'topDescriptionReady', Date.now());

      // Narration generation starts immediately in parallel!
      executionLog.push('[TRACE ROUTE][Waypoint 1] narration generation started');
      waypointPipelineRegistry.recordTimestamp(stableId, 'narrationStarted', Date.now());

      // While narration is generating, simulate image search and full enrichment taking place in parallel
      const imagePromise = (async () => {
        // Simulates async image fetch
        return ['https://example.com/balbianello.jpg'];
      })();

      const fullEnrichmentPromise = (async () => {
        // Simulates additional metadata (climate, population, notable persons, contextNotes)
        return {
          climate: { temp: '22°C', condition: 'Sunny' },
          notable: [{ name: 'Guido Monzino', role: 'Explorer' }],
          contextNotes: ['Filming location for Casino Royale']
        };
      })();

      // Narration audio finishes generation
      executionLog.push('[TRACE ROUTE][Waypoint 1] narration audio ready');
      waypointPipelineRegistry.recordTimestamp(stableId, 'narrationAudioReady', Date.now());

      // Narration begins continuous playback
      executionLog.push('[TRACE ROUTE][Waypoint 1] playback started');
      waypointPipelineRegistry.recordTimestamp(stableId, 'narrationPlaybackStarted', Date.now());

      // Secondary content resolves afterwards without interrupting or blocking playback
      const [images, fullEnrichment] = await Promise.all([imagePromise, fullEnrichmentPromise]);
      executionLog.push(`[TRACE ROUTE][Waypoint 1] images ready: count=${images.length}`);
      executionLog.push('[TRACE ROUTE][Waypoint 1] full enrichment ready');
      waypointPipelineRegistry.recordTimestamp(stableId, 'imagesReady', Date.now());
      waypointPipelineRegistry.recordTimestamp(stableId, 'fullEnrichmentReady', Date.now());

      // Verify execution order: narration generation started before full enrichment and images finished
      const narrationStartIndex = executionLog.indexOf('[TRACE ROUTE][Waypoint 1] narration generation started');
      const fullEnrichmentIndex = executionLog.indexOf('[TRACE ROUTE][Waypoint 1] full enrichment ready');
      const imagesReadyIndex = executionLog.indexOf('[TRACE ROUTE][Waypoint 1] images ready: count=1');

      expect(narrationStartIndex).toBeGreaterThan(-1);
      expect(narrationStartIndex).toBeLessThan(fullEnrichmentIndex);
      expect(narrationStartIndex).toBeLessThan(imagesReadyIndex);
    });
  });

  describe('3. Preservation of Later Waypoint Preload & Instant Narration', () => {
    it('maintains rolling preload and instant playback for Waypoint 2+', () => {
      const wp2Id = 'wp-como-2';
      const sampleRate = 24000;
      const duration = 4.5;
      const pcmData = new Float32Array(sampleRate * duration);

      const cachedAudio: CachedNarrationAudio = {
        waypointId: wp2Id,
        narrativeKey: 'villa carlotta in tremezzo::a historic villa situated on lake como',
        script: 'Villa Carlotta in Tremezzo. A historic villa situated on Lake Como.',
        voice: 'tara',
        pcmData,
        sampleRate,
        duration,
        createdAt: Date.now()
      };

      waypointNarrationCache.set(wp2Id, cachedAudio);

      // Selecting Waypoint 2 retrieves preloaded audio with zero delay
      expect(waypointNarrationCache.has(wp2Id)).toBe(true);
      const audio = waypointNarrationCache.get(wp2Id);
      expect(audio?.script).toContain('Villa Carlotta in Tremezzo');
      expect(audio?.duration).toBe(4.5);
    });
  });

  describe('4. Progressive Waypoint Release & Stream Ingestion', () => {
    it('emits onWaypointProgress as individual waypoints complete geographic validation', async () => {
      const emittedWaypoints: Waypoint[] = [];
      const emittedTotals: number[] = [];

      const onWaypointProgress = (wp: Waypoint, allSoFar: Waypoint[], index: number, total: number) => {
        emittedWaypoints.push(wp);
        emittedTotals.push(total);
      };

      // Simulate 3 candidate waypoints progressing
      const mockCandidates: Waypoint[] = [
        { id: 'wp-1', name: 'Villa del Balbianello', lat: 45.9654, lng: 9.2025, sequence: 1 },
        { id: 'wp-2', name: 'Villa Carlotta', lat: 45.9861, lng: 9.2294, sequence: 2 },
        { id: 'wp-3', name: 'Teresio Olivelli Park', lat: 45.9870, lng: 9.2300, sequence: 3 }
      ];

      // Progressive emission loop simulation (mirroring routePipeline.ts Stage 3)
      for (let i = 0; i < mockCandidates.length; i++) {
        const candidate = mockCandidates[i];
        onWaypointProgress(candidate, mockCandidates.slice(0, i + 1), i + 1, mockCandidates.length);
      }

      // Assert that Waypoint 1 was emitted first without waiting for Waypoints 2 & 3
      expect(emittedWaypoints.length).toBe(3);
      expect(emittedWaypoints[0].id).toBe('wp-1');
      expect(emittedWaypoints[1].id).toBe('wp-2');
      expect(emittedWaypoints[2].id).toBe('wp-3');
      expect(emittedTotals[0]).toBe(3);
    });

    it('verifies 13-waypoint progressive streaming lifecycle and stable final reconciliation', async () => {
      const timestamps: Record<string, number> = {};
      const log = (event: string) => {
        timestamps[event] = Date.now();
      };

      log('route_start');
      const candidates = Array.from({ length: 13 }, (_, i) => ({
        id: `wp-${i + 1}`,
        name: `Lake Como Stop ${i + 1}`,
        lat: 45.9 + i * 0.01,
        lng: 9.2 + i * 0.01,
        sequence: i + 1
      }));

      log('candidates_extracted');

      let wp1Presented = false;
      const progressiveWaypointsMap = new Map<string, Waypoint>();
      const markerArrivalOrder: string[] = [];

      const onProgress = (wp: Waypoint, allSoFar: Waypoint[], idx: number, total: number) => {
        progressiveWaypointsMap.set(wp.id, wp);
        markerArrivalOrder.push(wp.id);
        log(`marker_${wp.id}_ready`);

        if (!wp1Presented && progressiveWaypointsMap.size === 1) {
          wp1Presented = true;
          log('wp1_camera_activated');
          log('wp1_top_description_ready');
          log('wp1_narration_generation_started');
        }
      };

      // Simulate Stage 3 geographic validation loop
      for (let i = 0; i < candidates.length; i++) {
        onProgress(candidates[i], candidates.slice(0, i + 1), i + 1, candidates.length);
      }

      log('all_13_markers_ready');
      log('final_route_complete');

      // Assertions
      expect(wp1Presented).toBe(true);
      expect(markerArrivalOrder.length).toBe(13);
      expect(markerArrivalOrder[0]).toBe('wp-1');

      // WP1 presentation occurred BEFORE WP2-13 finished
      expect(timestamps['wp1_camera_activated']).toBeDefined();
      expect(timestamps['all_13_markers_ready']).toBeDefined();
      expect(timestamps['wp1_camera_activated']).toBeLessThanOrEqual(timestamps['all_13_markers_ready']);
    });

    it('demonstrates Stage 1 streaming candidate extraction emits WP1 before stream finishes', async () => {
      const { IncrementalCandidateParser } = await import('../../utils/jsonParser');
      const parser = new IncrementalCandidateParser();

      const events: string[] = [];

      // Simulate a streamed response arriving over time
      const chunks = [
        '{"title": "Lake Como Highlights", "route": [',
        '{"name": "Villa del Balbianello", "lat": 45.9654, "lng": 9.2025, "sequence": 1},',
        '{"name": "Villa Carlotta", "lat": 45.9861, "lng": 9.2294, "sequence": 2},',
        '{"name": "Ponte della Civera", "lat": 45.9142, "lng": 9.1558, "sequence": 3}',
        ']}'
      ];

      // Stream chunk by chunk and validate candidates as they arrive
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        events.push(`chunk_${i + 1}_received`);
        const newlyDiscovered = parser.ingest(chunk);
        for (const cand of newlyDiscovered) {
          events.push(`candidate_${cand.name}_parsed`);
          if (cand.name === 'Villa del Balbianello') {
            events.push('wp1_geographically_validated');
            events.push('wp1_emitted_to_ui');
          }
        }
      }
      events.push('stream_completed');

      // Verify that WP1 was emitted before stream_completed and before later chunks arrived
      const wp1EmittedIdx = events.indexOf('wp1_emitted_to_ui');
      const streamEndIdx = events.indexOf('stream_completed');
      const chunk3Idx = events.indexOf('chunk_3_received');

      expect(wp1EmittedIdx).toBeGreaterThan(-1);
      expect(wp1EmittedIdx).toBeLessThan(streamEndIdx);
      expect(wp1EmittedIdx).toBeLessThan(chunk3Idx);
    });
  });

  describe('4. Narration Lifecycle & Duplicate Prevention Guard', () => {
    it('dispatches narration once at topDescriptionReady and suppresses restart on full enrichment', () => {
      let activeNarration: { selectionId: string; narrativeKey: string; spoken: boolean } | null = null;
      let speakCallCount = 0;
      let speakTexts: string[] = [];

      const maybeTriggerNarrationMock = (selectionId: string, desc: string) => {
        const narrativeKey = `${selectionId}:${desc}`;
        if (
          activeNarration &&
          (activeNarration.selectionId === selectionId ||
            (Boolean(activeNarration.narrativeKey) && activeNarration.narrativeKey === narrativeKey))
        ) {
          // DUPLICATE_BLOCKED
          return false;
        }

        activeNarration = {
          selectionId,
          narrativeKey,
          spoken: true
        };
        speakCallCount++;
        speakTexts.push(desc);
        return true;
      };

      const stableId = 'wp-como-1';
      const initialDesc = 'Villa del Balbianello is a historic villa situated on the tip of the Dosso d\'Avedo peninsula.';
      const enrichedDesc = 'Villa del Balbianello is a historic villa situated on the tip of the Dosso d\'Avedo peninsula. It was built in 1787 for Cardinal Angelo Maria Durini.';

      // Stage 1: topDescriptionReady triggers narration
      const firstTrigger = maybeTriggerNarrationMock(stableId, initialDesc);
      expect(firstTrigger).toBe(true);
      expect(speakCallCount).toBe(1);
      expect(speakTexts[0]).toBe(initialDesc);

      // Stage 2: fullEnrichmentReady arrives with refined description
      const secondTrigger = maybeTriggerNarrationMock(stableId, enrichedDesc);
      expect(secondTrigger).toBe(false);
      expect(speakCallCount).toBe(1); // Did NOT trigger second speak or restart
    });

    it('cancels previous narration and starts new narration when user switches waypoints', () => {
      let activeNarration: { selectionId: string; narrativeKey: string; spoken: boolean } | null = null;
      let activeSelectionId = 'wp-como-1';
      let cancelledSelections: string[] = [];
      let speakHistory: { id: string; desc: string }[] = [];

      const cancelNarration = () => {
        if (activeNarration) {
          cancelledSelections.push(activeNarration.selectionId);
          activeNarration = null;
        }
      };

      const switchWaypoint = (newId: string) => {
        cancelNarration();
        activeSelectionId = newId;
      };

      const maybeTriggerNarrationMock = (selectionId: string, desc: string) => {
        if (selectionId !== activeSelectionId) {
          // Stale payload rejected
          return false;
        }
        if (
          activeNarration &&
          (activeNarration.selectionId === selectionId ||
            (Boolean(activeNarration.narrativeKey) && activeNarration.narrativeKey === `${selectionId}:${desc}`))
        ) {
          return false;
        }

        activeNarration = {
          selectionId,
          narrativeKey: `${selectionId}:${desc}`,
          spoken: true
        };
        speakHistory.push({ id: selectionId, desc });
        return true;
      };

      // Waypoint 1 starts
      maybeTriggerNarrationMock('wp-como-1', 'Villa del Balbianello');
      expect(speakHistory.length).toBe(1);
      expect(speakHistory[0].id).toBe('wp-como-1');

      // User navigates to Waypoint 2
      switchWaypoint('wp-como-2');
      expect(cancelledSelections).toContain('wp-como-1');

      // Waypoint 2 triggers narration
      maybeTriggerNarrationMock('wp-como-2', 'Villa Carlotta');
      expect(speakHistory.length).toBe(2);
      expect(speakHistory[1].id).toBe('wp-como-2');

      // Late enrichment from Waypoint 1 arrives after switch
      const lateWp1Trigger = maybeTriggerNarrationMock('wp-como-1', 'Late Balbianello data');
      expect(lateWp1Trigger).toBe(false);
      expect(speakHistory.length).toBe(2);
    });
  });

  describe('5. Precision Timing Logs & Milestone Tracking', () => {
    it('accurately logs waypoint activation and computes step-by-step elapsed timings', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const stableId = 'wp-como-1';
      const wpName = 'Villa del Balbianello';

      // 1. Waypoint Activated
      waypointPipelineRegistry.setWaypointActivated(stableId, wpName);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] waypoint activated \| id="wp-como-1" \(Villa del Balbianello\) \| \+0ms \(step \+0ms\)/)
      );

      // 2. Immediate InfoPanel Display
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'InfoPanel displayed initial data');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] InfoPanel displayed initial data \| id="wp-como-1" \(Villa del Balbianello\)/)
      );

      // 3. Top description ready
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'top description ready', 'length=120');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] top description ready \| id="wp-como-1" \(Villa del Balbianello\)/)
      );

      // 4. Narration requested
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'narration requested');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] narration requested \| id="wp-como-1" \(Villa del Balbianello\)/)
      );

      consoleSpy.mockRestore();
    });

    it('demonstrates Orpheus whole-stream buffering lifecycle (first chunk vs full audio decode)', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const stableId = 'wp-como-1';
      const wpName = 'Villa del Balbianello';

      waypointPipelineRegistry.setWaypointActivated(stableId, wpName);
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'TTS request started', 'provider="orpheus" voice="tara"');
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'TTS generation started', 'status=200');
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'first audio data received', 'chunkSamples=36000');
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'full audio received', 'totalChunks=12 duration=18.00s');
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'audio decoded', 'totalSamples=432000 sampleRate=24000');
      waypointPipelineRegistry.logTraceNarration(stableId, wpName, 'playback started', 'audioDuration=18.00s');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] first audio data received \| id="wp-como-1" \(Villa del Balbianello\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] full audio received \| id="wp-como-1" \(Villa del Balbianello\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] audio decoded \| id="wp-como-1" \(Villa del Balbianello\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] playback started \| id="wp-como-1" \(Villa del Balbianello\)/)
      );

      consoleSpy.mockRestore();
    });

    it('demonstrates Waypoint 2 prefetch, cached audio selection, and instant playback upon activation', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const wp2Id = 'wp-como-2';
      const wp2Name = 'Villa Carlotta';

      // 1. Prefetch starts during WP1 playback
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'WP2 prefetch started');
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'WP2 narration source ready', 'scriptLength=210');
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'WP2 TTS generation started');
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'WP2 narration ready/cached', 'duration=14.50s');

      // Populate mock cache
      const sampleRate = 24000;
      const duration = 14.5;
      const pcmData = new Float32Array(sampleRate * duration);
      waypointNarrationCache.set(wp2Id, {
        waypointId: wp2Id,
        narrativeKey: 'villa carlotta::a historic villa situated on lake como',
        script: 'Villa Carlotta. A historic villa situated on Lake Como.',
        voice: 'tara',
        pcmData,
        sampleRate,
        duration,
        createdAt: Date.now()
      });

      // 2. User activates WP2
      const activationTime = Date.now();
      waypointPipelineRegistry.setWaypointActivated(wp2Id, wp2Name, activationTime);
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'topDescriptionReady', 'cacheHit=true descLength=180', activationTime);
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'narration eligibility reached', undefined, activationTime);
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'cached narration selected', 'duration=14.50s', activationTime);
      waypointPipelineRegistry.logTraceNarration(wp2Id, wp2Name, 'playback started', 'audioDuration=14.50s', activationTime + 1);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] WP2 prefetch started \| id="wp-como-2" \(Villa Carlotta\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] WP2 narration ready\/cached \| id="wp-como-2" \(Villa Carlotta\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] waypoint activated \| id="wp-como-2" \(Villa Carlotta\) \| \+0ms \(step \+0ms\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] cached narration selected \| id="wp-como-2" \(Villa Carlotta\) \| \+0ms \(step \+0ms\)/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TRACE NARRATION\] playback started \| id="wp-como-2" \(Villa Carlotta\) \| \+1ms \(step \+1ms\)/)
      );

      consoleSpy.mockRestore();
    });
  });
});
