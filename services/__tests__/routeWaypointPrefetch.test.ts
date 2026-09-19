import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises, CachedNarrationAudio } from '../cacheService';
import { Waypoint, LocationInfo } from '../../types';
import { buildNarrationScript, removeLeadingTitleFromDescription, OrpheusTTSProvider } from '../narrationProviders';
import { findNextRouteWaypoint, getWaypointStableId } from '../../utils/routeSequenceUtils';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';
import { narrationService, getNarrationDescription, getNarrationTitle } from '../narrationService';

describe('Route Waypoint Background Prefetching, Audio Caching & Provisional Suppression', () => {
  beforeEach(() => {
    waypointEnrichmentCache.clear();
    waypointNarrationCache.clear();
    inFlightNarrationPromises.clear();
    vi.restoreAllMocks();
  });

  it('suppresses provisional description on initial selection while enrichment is loading', () => {
    const unEnrichedWaypointPayload: any = {
      id: 'wp-1',
      name: 'Teresio Olivelli Park',
      coordinates: { lat: 45.987, lng: 9.261 },
      waypoint: {
        id: 'wp-1',
        name: 'Teresio Olivelli Park',
        lat: 45.987,
        lng: 9.261,
        description: 'A popular local swimming spot where visitors can take a dip.' // Provisional text from TRACE ROUTE
      },
      description: '', // Blanked during initial load
      sectionState: { description: 'loading', news: 'idle' }
    };

    const canonical = resolveCanonicalNarrative(unEnrichedWaypointPayload);
    expect(canonical.title).toBe('Teresio Olivelli Park');
    // Crucial: narrativeText must be completely empty while loading, NOT falling back to provisional waypoint.description!
    expect(canonical.narrativeText).toBe('');
    expect(canonical.lines).toEqual([]);

    const narrationDesc = getNarrationDescription(unEnrichedWaypointPayload);
    expect(narrationDesc).toBe('');
  });

  it('exposes finalized narrative only after enrichment completion', () => {
    const finalizedPayload: any = {
      id: 'wp-1',
      name: 'Teresio Olivelli Park',
      coordinates: { lat: 45.987, lng: 9.261 },
      waypoint: {
        id: 'wp-1',
        name: 'Teresio Olivelli Park',
        lat: 45.987,
        lng: 9.261,
        description: 'A popular local swimming spot where visitors can take a dip.'
      },
      description: 'Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.',
      sectionState: { description: 'complete', news: 'idle' }
    };

    const canonical = resolveCanonicalNarrative(finalizedPayload);
    expect(canonical.title).toBe('Teresio Olivelli Park');
    expect(canonical.narrativeText).toBe('Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.');
    expect(canonical.lines.length).toBeGreaterThan(0);

    const narrationDesc = getNarrationDescription(finalizedPayload);
    expect(narrationDesc).toContain('Teresio Olivelli park is a beloved local swimming spot');
  });

  it('stores and retrieves pre-generated narration audio in waypointNarrationCache', () => {
    const stableId = 'wp-carlotta';
    const narrativeKey = 'villa carlotta::a historic villa on lake como.';
    const mockAudio: CachedNarrationAudio = {
      waypointId: stableId,
      narrativeKey,
      script: 'Villa Carlotta. A historic villa on Lake Como.',
      voice: 'tara',
      pcmData: new Float32Array([0.1, -0.2, 0.3]),
      sampleRate: 24000,
      duration: 3.5,
      createdAt: Date.now()
    };

    expect(waypointNarrationCache.has(stableId)).toBe(false);
    waypointNarrationCache.set(stableId, mockAudio);
    expect(waypointNarrationCache.has(stableId)).toBe(true);

    const cached = waypointNarrationCache.get(stableId);
    expect(cached).toEqual(mockAudio);
    expect(cached?.narrativeKey).toBe(narrativeKey);
    expect(cached?.pcmData.length).toBe(3);
  });

  it('invalidates cached audio if the finalized canonical narrative key changes', () => {
    const stableId = 'wp-carlotta';
    const oldNarrativeKey = 'villa carlotta::old description';
    const newNarrativeKey = 'villa carlotta::new updated description';

    waypointNarrationCache.set(stableId, {
      waypointId: stableId,
      narrativeKey: oldNarrativeKey,
      script: 'Villa Carlotta. Old description.',
      voice: 'tara',
      pcmData: new Float32Array([0.1]),
      sampleRate: 24000,
      duration: 1.0,
      createdAt: Date.now()
    });

    const cached = waypointNarrationCache.get(stableId);
    expect(cached?.narrativeKey === newNarrativeKey).toBe(false); // Narrative key mismatch triggers miss!
  });

  it('reuses existing in-flight narration prefetch promise if selected while prefetching is running', async () => {
    const stableId = 'wp-balbianello';
    const narrativeKey = 'villa del balbianello::renowned for its terraced gardens.';
    let ttsExecutionCount = 0;

    const ttsPromise = (async () => {
      ttsExecutionCount++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        waypointId: stableId,
        narrativeKey,
        script: 'Villa del Balbianello. Renowned for its terraced gardens.',
        voice: 'tara',
        pcmData: new Float32Array([0.5, -0.5]),
        sampleRate: 24000,
        duration: 2.0,
        createdAt: Date.now()
      } as CachedNarrationAudio;
    })();

    inFlightNarrationPromises.set(stableId, ttsPromise);

    // Simulated waypoint selection during in-flight prefetch
    const inFlight = inFlightNarrationPromises.get(stableId);
    expect(inFlight).toBeDefined();

    const audioResult = await inFlight!;
    expect(audioResult.narrativeKey).toBe(narrativeKey);
    expect(ttsExecutionCount).toBe(1); // No second TTS generation was launched!
  });

  it('guarantees that prefetch is silent and does NOT cancel currently playing audio', async () => {
    const orpheus = new OrpheusTTSProvider();
    const cancelSpy = vi.spyOn(orpheus, 'cancel');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Mock SSE stream
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"raw_pcm_base64":"AAAA"}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });
      return new Response(stream, { status: 200 });
    });

    // Generate audio silently
    const audio = await orpheus.generateAudio('Test script', { title: 'Test', description: 'Test description' });
    expect(audio).toBeDefined();
    expect(audio?.pcmData.length).toBeGreaterThan(0);

    // Cancel must NOT have been called during background generation!
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('plays cached audio immediately without any fetch network request', async () => {
    const orpheus = new OrpheusTTSProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const speakCachedSpy = vi.spyOn(orpheus, 'speakCached').mockImplementation(() => {});

    const cachedAudio: CachedNarrationAudio = {
      waypointId: 'wp-test',
      narrativeKey: 'test::test',
      script: 'Test. Test',
      voice: 'tara',
      pcmData: new Float32Array([0.1, 0.2]),
      sampleRate: 24000,
      duration: 1.0,
      createdAt: Date.now()
    };

    orpheus.speakCached(cachedAudio, { title: 'Test', description: 'Test' });

    expect(speakCachedSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled(); // 0 network requests!
  });

  it('correctly cleans up title repetition in narration when description begins with title', () => {
    const title = 'Teresio Olivelli park';
    const rawDescription = 'Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.';

    const cleanedDescription = removeLeadingTitleFromDescription(title, rawDescription);
    expect(cleanedDescription).toBe('A beloved local swimming spot in Briosco, Lombardy, Italy.');

    const spokenScript = buildNarrationScript(title, rawDescription);
    expect(spokenScript).toBe('Teresio Olivelli park. A beloved local swimming spot in Briosco, Lombardy, Italy.');
    expect(spokenScript).not.toBe('Teresio Olivelli park. Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.');
  });
});
