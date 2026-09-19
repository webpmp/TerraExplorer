import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises, CachedNarrationAudio } from '../cacheService';
import { Waypoint, MapMarker, LocationInfo } from '../../types';
import { getWaypointStableId, findNextRouteWaypoint } from '../../utils/routeSequenceUtils';
import * as geographicResolver from '../geographic/geographicResolver';
import * as geminiService from '../geminiService';
import { mergeLocationInfo } from '../locationService';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';
import { narrationService, getNarrationDescription, getNarrationTitle } from '../narrationService';

describe('End-to-End Production Route Waypoint & Narration Audio Prefetch Flow', () => {
  beforeEach(() => {
    waypointEnrichmentCache.clear();
    waypointNarrationCache.clear();
    inFlightNarrationPromises.clear();
    vi.restoreAllMocks();
  });

  it('runs complete 3-waypoint Lake Como route simulation with preloaded audio and provisional text suppression', async () => {
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(msg);
      console.log(msg);
    };

    const route: Waypoint[] = [
      { id: 'wp-1', name: 'Villa del Balbianello in Lenno', lat: 45.965, lng: 9.202, description: 'A scenic historic villa.' },
      { id: 'wp-2', name: 'Villa Carlotta in Tremezzo', lat: 45.986, lng: 9.229, description: 'Famous museum and garden.' },
      { id: 'wp-3', name: 'Teresio Olivelli Park', lat: 45.987, lng: 9.261, description: 'Lakeside municipal park.' }
    ];

    let ttsNetworkCallCount = 0;
    let enrichmentCallCount = 0;

    vi.spyOn(geographicResolver, 'resolveGeographicMetadata').mockImplementation(async (anchor: MapMarker) => {
      return {
        id: anchor.id || 'resolved-id',
        name: anchor.name,
        lat: anchor.lat,
        lng: anchor.lng,
        type: 'historical_waypoint',
        country: 'Italy',
        state: 'Lombardy',
        city: 'Como'
      } as any;
    });

    vi.spyOn(geminiService, 'getInfoFromFeature').mockImplementation(async (marker: any) => {
      enrichmentCallCount++;
      log(`[AI Network] getInfoFromFeature called for "${marker.name}" (totalCalls=${enrichmentCallCount})`);
      return {
        description: `Full encyclopedic researched narrative for ${marker.name}.`,
        notable: ['Landmark'],
        metadataMode: 'modern_place'
      } as any;
    });

    vi.spyOn(narrationService, 'preloadNarration').mockImplementation(async (title: string, desc: string) => {
      ttsNetworkCallCount++;
      log(`[Orpheus TTS Network] preloadNarration called for "${title}" (ttsCalls=${ttsNetworkCallCount})`);
      return {
        pcmData: new Float32Array([0.1, 0.2, 0.3]),
        sampleRate: 24000,
        duration: 2.5,
        script: `${title}. ${desc}`,
        voice: 'tara'
      };
    });

    const speakCachedSpy = vi.spyOn(narrationService, 'speakCached').mockImplementation((cached, options) => {
      log(`[Narration Audio Output] SPEAK_CACHED played for "${options.title}"`);
    });

    const speakStructuredSpy = vi.spyOn(narrationService, 'speakStructured').mockImplementation((options) => {
      ttsNetworkCallCount++;
      log(`[Narration Audio Output] SPEAK_STRUCTURED generated & played for "${options.title}" (ttsCalls=${ttsNetworkCallCount})`);
    });

    const activeMarkerRequestRef = { current: 0 };
    const activeSelectionIdRef = { current: null as string | null };
    const inFlightPrefetchesRef = { current: new Set<string>() };

    const maybeTriggerNarration = (info: LocationInfo) => {
      const stableId = getWaypointStableId(info);
      const title = getNarrationTitle(info);
      const desc = getNarrationDescription(info);
      const narrativeKey = `${title.toLowerCase().trim()}::${desc.trim()}`;

      log(`[SearchNarration] SPEAK_REQUEST name="${title}" descLength=${desc.length}`);

      const cachedNarration = waypointNarrationCache.get(stableId);
      if (cachedNarration && cachedNarration.narrativeKey === narrativeKey) {
        log(`[Narration Cache] HIT id="${stableId}"`);
        log(`[Narration Cache] PLAY_CACHED id="${stableId}"`);
        narrationService.speakCached(cachedNarration, { title, description: desc, provider: 'orpheus' });
        return;
      }

      log(`[Narration Cache] MISS id="${stableId}"`);
      narrationService.speakStructured({ title, description: desc, provider: 'orpheus' });
    };

    const prefetchRouteWaypointEnrichment = async (wp: Waypoint) => {
      if (!wp) return;
      const stableId = getWaypointStableId(wp);
      if (waypointEnrichmentCache.has(stableId) || inFlightPrefetchesRef.current.has(stableId)) return;

      inFlightPrefetchesRef.current.add(stableId);
      log(`[Waypoint Prefetch] START id="${stableId}" name="${wp.name}"`);

      try {
        const anchor: MapMarker = { id: wp.id, name: wp.name, lat: wp.lat, lng: wp.lng, type: 'historical_waypoint', populationClass: 'small' };
        const geoMarker = await geographicResolver.resolveGeographicMetadata(anchor);
        let data: any = {
          id: stableId,
          name: wp.name,
          coordinates: { lat: wp.lat, lng: wp.lng },
          waypoint: wp,
          country: geoMarker.country,
          description: "",
          sectionState: { description: "loading", news: "idle" }
        };

        const enrichedData = await geminiService.getInfoFromFeature(geoMarker);
        const finalEnrichedState = mergeLocationInfo(data, {
          description: enrichedData.description,
          sectionState: { description: "complete" }
        });

        waypointEnrichmentCache.set(stableId, finalEnrichedState);
        log(`[Waypoint Prefetch] COMPLETE id="${stableId}" name="${wp.name}" descLength=${finalEnrichedState.description?.length}`);

        // Preload narration audio
        const cleanTitle = getNarrationTitle(finalEnrichedState);
        const cleanDesc = getNarrationDescription(finalEnrichedState);
        const narrativeKey = `${cleanTitle.toLowerCase().trim()}::${cleanDesc.trim()}`;

        log(`[Narration Prefetch] START id="${stableId}"`);
        const audioResult = await narrationService.preloadNarration(cleanTitle, cleanDesc);
        if (audioResult) {
          const entry: CachedNarrationAudio = {
            waypointId: stableId,
            narrativeKey,
            script: audioResult.script,
            voice: audioResult.voice,
            pcmData: audioResult.pcmData,
            sampleRate: audioResult.sampleRate,
            duration: audioResult.duration,
            createdAt: Date.now()
          };
          waypointNarrationCache.set(stableId, entry);
          log(`[Narration Prefetch] COMPLETE id="${stableId}" scriptLength=${audioResult.script.length}`);
        }
      } finally {
        inFlightPrefetchesRef.current.delete(stableId);
      }
    };

    let pendingPrefetch: Promise<void> | null = null;

    const loadWaypointData = async (wp: Waypoint) => {
      const stableId = getWaypointStableId(wp);
      activeSelectionIdRef.current = stableId;
      log(`[Waypoint Lifecycle] WAYPOINT_SELECTED id="${stableId}" name="${wp.name}"`);

      // 1. Initial selection state (before enrichment completes)
      const initialPayload: any = {
        id: stableId,
        name: wp.name,
        coordinates: { lat: wp.lat, lng: wp.lng },
        waypoint: wp,
        description: "", // Explicitly blank while loading
        sectionState: { description: "loading", news: "idle" }
      };

      // Confirm canonical narrative is empty during initial load
      const initialCanonical = resolveCanonicalNarrative(initialPayload);
      if (!waypointEnrichmentCache.has(stableId)) {
        log(`[InfoPanel Verification] initialCanonical.narrativeText="${initialCanonical.narrativeText}" (must be empty)`);
        expect(initialCanonical.narrativeText).toBe("");
      }

      const cachedEnrichment = waypointEnrichmentCache.get(stableId);
      if (cachedEnrichment) {
        log(`[Waypoint Prefetch] CACHE_HIT id="${stableId}" name="${wp.name}" descLength=${cachedEnrichment.description?.length}`);
        maybeTriggerNarration(cachedEnrichment);
        const nextWp = findNextRouteWaypoint(wp, route);
        if (nextWp) {
          pendingPrefetch = prefetchRouteWaypointEnrichment(nextWp);
        }
        return cachedEnrichment;
      }

      log(`[Waypoint Prefetch] CACHE_MISS id="${stableId}" name="${wp.name}"`);
      const anchor: MapMarker = { id: wp.id, name: wp.name, lat: wp.lat, lng: wp.lng, type: 'historical_waypoint', populationClass: 'small' };
      const geoMarker = await geographicResolver.resolveGeographicMetadata(anchor);
      const enrichedData = await geminiService.getInfoFromFeature(geoMarker);
      const finalEnrichedState = mergeLocationInfo(initialPayload, {
        description: enrichedData.description,
        sectionState: { description: "complete" }
      });

      waypointEnrichmentCache.set(stableId, finalEnrichedState);
      log(`[Waypoint Lifecycle] ENRICHED_RECORD_RESOLVED id="${stableId}" name="${wp.name}"`);
      maybeTriggerNarration(finalEnrichedState);

      const nextWp = findNextRouteWaypoint(wp, route);
      if (nextWp) {
        pendingPrefetch = prefetchRouteWaypointEnrichment(nextWp);
      }
      return finalEnrichedState;
    };

    // --- STEP 1: Select Waypoint 1 ---
    log('=== STEP 1: Select Waypoint 1 (Balbianello) ===');
    await loadWaypointData(route[0]);
    if (pendingPrefetch) await pendingPrefetch;

    expect(enrichmentCallCount).toBe(2); // wp1 enrich + wp2 prefetch
    expect(ttsNetworkCallCount).toBe(2);  // wp1 speakStructured + wp2 preloadNarration
    expect(waypointNarrationCache.has('wp-2')).toBe(true);
    expect(speakStructuredSpy).toHaveBeenCalledTimes(1);
    expect(speakCachedSpy).not.toHaveBeenCalled();

    // --- STEP 2: Select Waypoint 2 ---
    log('=== STEP 2: Select Waypoint 2 (Carlotta) ===');
    await loadWaypointData(route[1]);
    if (pendingPrefetch) await pendingPrefetch;

    expect(enrichmentCallCount).toBe(3); // +1 only for wp3 prefetch
    expect(ttsNetworkCallCount).toBe(3);  // +1 only for wp3 preloadNarration! Zero TTS calls for wp2!
    expect(waypointNarrationCache.has('wp-3')).toBe(true);
    expect(speakCachedSpy).toHaveBeenCalledTimes(1); // Waypoint 2 played cached audio instantly!

    // --- STEP 3: Select Waypoint 3 (Final Waypoint) ---
    log('=== STEP 3: Select Waypoint 3 (Teresio Olivelli Park) ===');
    await loadWaypointData(route[2]);
    if (pendingPrefetch) await pendingPrefetch;

    expect(enrichmentCallCount).toBe(3); // No new enrichment!
    expect(ttsNetworkCallCount).toBe(3);  // Zero new TTS calls!
    expect(speakCachedSpy).toHaveBeenCalledTimes(2); // Waypoint 3 played cached audio instantly!

    // Validate log sequence
    expect(logs).toContain('[Narration Cache] HIT id="wp-2"');
    expect(logs).toContain('[Narration Cache] PLAY_CACHED id="wp-2"');
    expect(logs).toContain('[Narration Cache] HIT id="wp-3"');
    expect(logs).toContain('[Narration Cache] PLAY_CACHED id="wp-3"');
    expect(logs).toContain('[InfoPanel Verification] initialCanonical.narrativeText="" (must be empty)');
  });
});
