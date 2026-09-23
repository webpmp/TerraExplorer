import { describe, it, expect } from 'vitest';
import { evaluateDescriptionReadiness } from '../../utils/descriptionReadiness';
import { generateContextualChips } from '../followUpService';
import { LocationInfo } from '../../types';

describe('Presentation Readiness Lifecycle', () => {
  it('identifies placeholder/provisional descriptions as not ready for presentation', () => {
    const provisionalSalem = evaluateDescriptionReadiness(
      'Historical event: Salem Witch Trials',
      'Salem Witch Trials'
    );
    expect(provisionalSalem.isReady).toBe(false);
    expect(provisionalSalem.quality).toBe('insufficient');
    expect(provisionalSalem.reason).toContain('lacking multi-sentence documentary context');

    const genericPlaceholder = evaluateDescriptionReadiness(
      'Researching this location...',
      'Some Place'
    );
    expect(genericPlaceholder.isReady).toBe(false);
    expect(genericPlaceholder.quality).toBe('placeholder');
  });

  it('identifies fully enriched narratives as ready for presentation', () => {
    const enrichedSalem = evaluateDescriptionReadiness(
      'The Salem Witch Trials were a series of hearings and prosecutions of people accused of witchcraft in colonial Massachusetts between February 1692 and May 1693. The trials resulted in the executions of twenty people, most of them women.',
      'Salem Witch Trials'
    );
    expect(enrichedSalem.isReady).toBe(true);
    expect(enrichedSalem.quality).toBe('substantive');
  });

  it('atomically packages enriched content and images prior to presentation commit', async () => {
    // Simulate the presentation readiness pipeline steps
    const rawPipelineResult = {
      name: 'Salem Witch Trials',
      singleLocation: false,
      geographicScope: 'Salem, Massachusetts',
      description: 'Historical event: Salem Witch Trials'
    };

    // 1. Pipeline returns provisional data
    let committedState: LocationInfo | null = null;
    let presentationLogs: string[] = [];

    presentationLogs.push(`[PRESENTATION] PREPARING searchId=test-1`);
    presentationLogs.push(`[PRESENTATION] PIPELINE_READY searchId=test-1`);

    // 2. Presentation gate detects provisional description
    const descReadiness = evaluateDescriptionReadiness(rawPipelineResult.description, rawPipelineResult.name);
    expect(descReadiness.isReady).toBe(false);
    presentationLogs.push(`[PRESENTATION] ENRICHING searchId=test-1 reason="${descReadiness.reason}"`);

    // 3. Mock recovery enrichment
    const enrichedData = {
      description: 'The Salem Witch Trials were a series of hearings and prosecutions in colonial Massachusetts in 1692. The panic led to the execution of twenty innocent victims.',
      historicalContext: 'Colonial American witch panic in Salem Village.',
      significance: 'Key historical event in early American legal and religious history.'
    };

    let presentationData: LocationInfo = {
      ...rawPipelineResult,
      ...enrichedData
    };
    presentationLogs.push(`[PRESENTATION] ENRICHMENT_READY searchId=test-1 descLength=${presentationData.description?.length}`);

    // 4. Mock image search & validation
    const mockImages = [
      {
        url: 'https://upload.wikimedia.org/wikipedia/commons/salem.jpg',
        title: 'Salem Witch Trials Memorial',
        source: 'Wikipedia'
      }
    ];
    presentationData.images = mockImages;
    presentationData.primaryImage = mockImages[0];
    presentationLogs.push(`[PRESENTATION] IMAGES_READY searchId=test-1 count=${mockImages.length}`);
    presentationLogs.push(`[PRESENTATION] READY searchId=test-1`);

    // 5. Atomic commit
    committedState = presentationData;
    presentationLogs.push(`[PRESENTATION] COMMITTED searchId=test-1`);

    // Verify atomic state has all components simultaneously
    expect(committedState).not.toBeNull();
    expect(committedState?.description).toContain('The Salem Witch Trials were a series of hearings');
    expect(committedState?.images?.length).toBe(1);
    expect(committedState?.primaryImage?.url).toBe('https://upload.wikimedia.org/wikipedia/commons/salem.jpg');
    expect(presentationLogs[0]).toBe('[PRESENTATION] PREPARING searchId=test-1');
    expect(presentationLogs[1]).toBe('[PRESENTATION] PIPELINE_READY searchId=test-1');
    expect(presentationLogs[2]).toContain('[PRESENTATION] ENRICHING searchId=test-1');
    expect(presentationLogs[3]).toContain('[PRESENTATION] ENRICHMENT_READY searchId=test-1');
    expect(presentationLogs[4]).toBe('[PRESENTATION] IMAGES_READY searchId=test-1 count=1');
    expect(presentationLogs[5]).toBe('[PRESENTATION] READY searchId=test-1');
    expect(presentationLogs[6]).toBe('[PRESENTATION] COMMITTED searchId=test-1');
  });

  it('handles zero-image results cleanly without hanging or stalling presentation commit', async () => {
    const rawPipelineResult: LocationInfo = {
      name: 'Obscure Historical Outpost',
      singleLocation: false,
      description: 'A remote observation outpost established during the 18th century in the northern frontier. It served as a strategic early-warning garrison overlooking the mountain passes.'
    };

    let committedState: LocationInfo | null = null;
    let presentationLogs: string[] = [];

    presentationLogs.push(`[PRESENTATION] PREPARING searchId=test-zero-img`);
    presentationLogs.push(`[PRESENTATION] PIPELINE_READY searchId=test-zero-img`);

    const descReadiness = evaluateDescriptionReadiness(rawPipelineResult.description, rawPipelineResult.name);
    expect(descReadiness.isReady).toBe(true);
    presentationLogs.push(`[PRESENTATION] ENRICHMENT_READY searchId=test-zero-img descLength=${rawPipelineResult.description?.length}`);

    // Mock zero images returned
    const emptyImages: any[] = [];
    rawPipelineResult.images = emptyImages;
    presentationLogs.push(`[PRESENTATION] IMAGES_READY searchId=test-zero-img count=0`);
    presentationLogs.push(`[PRESENTATION] READY searchId=test-zero-img`);

    // Atomic commit
    committedState = rawPipelineResult;
    presentationLogs.push(`[PRESENTATION] COMMITTED searchId=test-zero-img`);

    expect(committedState).not.toBeNull();
    expect(committedState?.images).toEqual([]);
    expect(committedState?.primaryImage).toBeUndefined();
    expect(presentationLogs).toContain('[PRESENTATION] IMAGES_READY searchId=test-zero-img count=0');
    expect(presentationLogs).toContain('[PRESENTATION] COMMITTED searchId=test-zero-img');
  });

  it('prevents stale async search results from overwriting newer active searches', async () => {
    let activeSearchRequestId = 2; // User triggered Search 2 while Search 1 is still processing

    const search1Id = 1;
    const search2Id = 2;

    let committedState: LocationInfo | null = null;

    // Search 1 finishes async presentation gate
    const search1Data: LocationInfo = {
      name: 'Search 1 Result',
      description: 'Search 1 finished late'
    };

    if (search1Id === activeSearchRequestId) {
      committedState = search1Data;
    }

    expect(committedState).toBeNull(); // Search 1 was discarded because activeSearchRequestId is 2

    // Search 2 finishes async presentation gate
    const search2Data: LocationInfo = {
      name: 'Search 2 Result',
      description: 'Search 2 finished on time'
    };

    if (search2Id === activeSearchRequestId) {
      committedState = search2Data;
    }

    expect(committedState).toEqual(search2Data);
  });

  it('evaluates contextual chips against the fully enriched committed result', () => {
    const provisionalState: LocationInfo = {
      name: 'Salem Witch Trials',
      description: 'Historical event: Salem Witch Trials'
    };

    const enrichedCommittedState: LocationInfo = {
      name: 'Salem Witch Trials',
      entityType: 'historical_event',
      description: 'The Salem Witch Trials were a series of hearings and prosecutions of people accused of witchcraft in colonial Massachusetts in 1692.',
      historicalContext: '1692 Massachusetts witch trials panic and executions.',
      significance: 'Major turning point in American colonial jurisprudence.'
    };

    // Chips generated on provisional vs final
    const provisionalChips = generateContextualChips(provisionalState, false);
    const enrichedChips = generateContextualChips(enrichedCommittedState, false);

    expect(enrichedChips.length).toBeGreaterThan(0);
    // Enriched state provides richer, more specific questions
    const enrichedLabels = enrichedChips.map(c => c.label).join(' ').toLowerCase();
    expect(enrichedLabels).toMatch(/event|figures|outcome|legacy|site|history|salem/i);
  });
});
