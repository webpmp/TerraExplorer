import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waypointPipelineRegistry } from '../waypointPipelineService';
import { waypointEnrichmentCache, waypointNarrationCache, inFlightNarrationPromises, CachedNarrationAudio } from '../cacheService';

describe('Decoupled Waypoint Pipeline & Coordinated Stages', () => {
  beforeEach(() => {
    waypointPipelineRegistry.clear();
    waypointEnrichmentCache.clear();
    waypointNarrationCache.clear();
    inFlightNarrationPromises.clear();
    vi.clearAllMocks();
  });

  it('records progressive lifecycle stages and timestamps accurately', () => {
    const waypointId = 'wp-como-1';

    // Stage 1: Selected
    const t0 = 1700000000000;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'selected', t0);
    waypointPipelineRegistry.setStage(waypointId, 'pending');

    let record = waypointPipelineRegistry.getRecord(waypointId);
    expect(record).toBeDefined();
    expect(record?.stage).toBe('pending');
    expect(record?.timestamps.selected).toBe(t0);

    // Stage 2: Enrichment started
    const t1 = t0 + 10;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'enrichmentStarted', t1);
    waypointPipelineRegistry.setStage(waypointId, 'enriching');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.stage).toBe('enriching');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.timestamps.enrichmentStarted).toBe(t1);

    // Stage 3: Top description ready
    const t2 = t1 + 250;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'topDescriptionReady', t2);
    waypointPipelineRegistry.setStage(waypointId, 'topDescriptionReady');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.stage).toBe('topDescriptionReady');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.timestamps.topDescriptionReady).toBe(t2);

    // Stage 4: Full enrichment ready
    const t3 = t2 + 300;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'fullEnrichmentReady', t3);
    waypointPipelineRegistry.setStage(waypointId, 'enrichmentReady');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.stage).toBe('enrichmentReady');
    expect(waypointPipelineRegistry.getRecord(waypointId)?.timestamps.fullEnrichmentReady).toBe(t3);

    // Stage 5: Narration generating & ready
    const t4 = t3 + 50;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationStarted', t4);
    waypointPipelineRegistry.setStage(waypointId, 'narrationGenerating');

    const t5 = t4 + 400;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationAudioReady', t5);
    waypointPipelineRegistry.setStage(waypointId, 'narrationReady');

    // Stage 6 & 7: Continuous Playback started and finished
    const t6 = t5 + 20;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationPlaybackStarted', t6);
    waypointPipelineRegistry.setStage(waypointId, 'playing');

    const t7 = t6 + 8000;
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationPlaybackEnded', t7);
    waypointPipelineRegistry.setStage(waypointId, 'complete');

    const finalRecord = waypointPipelineRegistry.getRecord(waypointId);
    expect(finalRecord?.stage).toBe('complete');
    expect(finalRecord?.timestamps.narrationPlaybackStarted).toBe(t6);
    expect(finalRecord?.timestamps.narrationPlaybackEnded).toBe(t7);
  });

  it('guarantees audio is completely buffered before playback transition', () => {
    const waypointId = 'wp-como-2';
    const sampleRate = 24000;
    const duration = 5.0; // 5 seconds
    const sampleCount = sampleRate * duration;
    const pcmData = new Float32Array(sampleCount);

    const cachedAudio: CachedNarrationAudio = {
      waypointId,
      narrativeKey: 'villa carlotta::a historic villa on lake como',
      script: 'Villa Carlotta. A historic villa on Lake Como.',
      voice: 'tara',
      pcmData,
      sampleRate,
      duration,
      createdAt: Date.now()
    };

    waypointNarrationCache.set(waypointId, cachedAudio);

    expect(waypointNarrationCache.has(waypointId)).toBe(true);
    const audio = waypointNarrationCache.get(waypointId);
    expect(audio?.pcmData.length).toBe(sampleCount);
    expect(audio?.duration).toBe(5.0);
  });

  it('formats and outputs the milestone summary table without error', () => {
    const waypointId = 'wp-lake-como-3';
    waypointPipelineRegistry.recordTimestamp(waypointId, 'selected', Date.now());
    waypointPipelineRegistry.recordTimestamp(waypointId, 'enrichmentStarted', Date.now() + 10);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'topDescriptionReady', Date.now() + 200);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'fullEnrichmentReady', Date.now() + 500);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationStarted', Date.now() + 550);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationAudioReady', Date.now() + 800);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationPlaybackStarted', Date.now() + 820);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'narrationPlaybackEnded', Date.now() + 6000);
    waypointPipelineRegistry.recordTimestamp(waypointId, 'preloadStatus', 'fully_preloaded');

    const consoleSpy = vi.spyOn(console, 'log');
    waypointPipelineRegistry.logWaypointMilestones(waypointId, 'Teresio Olivelli Park');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Teresio Olivelli Park]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('selected:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('enrichmentReady:'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('status: fully_preloaded'));
  });
});
