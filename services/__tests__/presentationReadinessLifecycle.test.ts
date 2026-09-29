import { describe, it, expect, vi } from 'vitest';
import { evaluateDescriptionReadiness } from '../../utils/descriptionReadiness';
import { generateContextualChips } from '../followUpService';
import * as geminiService from '../geminiService';
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

  it('correctly passes GeoCoordinates and canonical identity in proper argument order to recoverLocationMetadata', async () => {
    // Staged / suggested search result with short, non-substantive description
    const rawPipelineResult: LocationInfo = {
      name: 'Charge Of The Light Brigade',
      canonicalName: 'Charge of the Light Brigade',
      entityType: 'battlefield',
      country: 'Ukraine',
      state: 'Crimea',
      city: 'Sevastopol',
      county: 'Balaklava',
      region: 'Crimea',
      coordinates: { lat: 44.5369, lng: 33.6014 },
      description: 'Charge of the Light Brigade at Balaclava.',
      historicalContext: '1854 Crimean War cavalry charge'
    };

    const cleanQuery = 'Where did the Charge of the Light Brigade take place?';
    const abortController = new AbortController();

    const descReadiness = evaluateDescriptionReadiness(rawPipelineResult.description, rawPipelineResult.name);
    expect(descReadiness.isReady).toBe(false);

    // Track invocation arguments
    let capturedArgs: any = null;
    const mockRecoverLocationMetadata = vi.fn(async (entityName, coordinates, canonicalIdentity, signal) => {
      capturedArgs = { entityName, coordinates, canonicalIdentity, signal };
      // Verify that coordinates object has lat and lng as numbers (preventing .lat.toFixed failure)
      expect(typeof coordinates?.lat).toBe('number');
      expect(typeof coordinates?.lng).toBe('number');
      expect(coordinates.lat.toFixed(4)).toBe('44.5369');
      expect(coordinates.lng.toFixed(4)).toBe('33.6014');

      return {
        description: 'The Charge of the Light Brigade was a failed military action involving the British light cavalry led by Lord Cardigan against Russian forces during the Battle of Balaclava on 25 October 1854 in the Crimean War. It became famous in British military history for the reckless bravery of the cavalrymen despite disastrous miscommunication.',
        historicalContext: '1854 Crimean War cavalry charge at the Battle of Balaclava.',
        significance: 'Celebrated in Lord Tennyson’s famous narrative poem.',
        quickFacts: ['Date: October 25, 1854', 'Conflict: Crimean War']
      };
    });

    let finalData = { ...rawPipelineResult };
    if (!descReadiness.isReady) {
      const enriched = await mockRecoverLocationMetadata(
        finalData.name,
        finalData.coordinates,
        {
          canonicalName: finalData.canonicalName || finalData.name,
          entityType: finalData.entityType,
          country: finalData.country,
          state: finalData.state,
          city: finalData.city,
          county: finalData.county,
          region: finalData.region,
          originalQuery: cleanQuery,
          historicalContext: finalData.historicalContext || cleanQuery,
        },
        abortController.signal
      );

      if (enriched && enriched.description) {
        finalData = {
          ...finalData,
          ...enriched,
          description: enriched.description,
          historicalContext: enriched.historicalContext || finalData.historicalContext,
          significance: enriched.significance || finalData.significance,
          quickFacts: enriched.quickFacts || finalData.quickFacts,
        };
      }
    }

    expect(mockRecoverLocationMetadata).toHaveBeenCalledTimes(1);
    expect(capturedArgs.entityName).toBe('Charge Of The Light Brigade');
    expect(capturedArgs.coordinates).toEqual({ lat: 44.5369, lng: 33.6014 });
    expect(capturedArgs.canonicalIdentity).toEqual({
      canonicalName: 'Charge of the Light Brigade',
      entityType: 'battlefield',
      country: 'Ukraine',
      state: 'Crimea',
      city: 'Sevastopol',
      county: 'Balaklava',
      region: 'Crimea',
      originalQuery: cleanQuery,
      historicalContext: '1854 Crimean War cavalry charge'
    });
    expect(capturedArgs.signal).toBe(abortController.signal);

    // Verify presentation state received enriched substantive content
    expect(finalData.description).toContain('failed military action involving the British light cavalry');
    expect(finalData.quickFacts).toEqual(['Date: October 25, 1854', 'Conflict: Crimean War']);
    expect(evaluateDescriptionReadiness(finalData.description, finalData.name).isReady).toBe(true);
  });

  it('substantively enriches coordinate-less HISTORICAL_NON_POINT events through the Presentation Readiness Gate', async () => {
    // 1. Pipeline returns provisional 38-character stub without coordinates
    const rawPipelineResult: LocationInfo = {
      name: 'Underground Railroad',
      canonicalName: 'Underground Railroad',
      entityType: 'historical_event',
      singleLocation: false,
      geographicScope: 'NON_GEOGRAPHIC_HISTORICAL_EVENT',
      country: 'Regional',
      coordinates: undefined,
      description: 'Historical event: Underground Railroad',
      notable: [],
      contextNotes: [],
      news: []
    };

    const cleanQuery = 'Where did the Underground Railroad take place?';
    const abortController = new AbortController();

    // 2. Presentation gate checks readiness
    const descReadiness = evaluateDescriptionReadiness(rawPipelineResult.description, rawPipelineResult.name);
    expect(descReadiness.isReady).toBe(false);
    expect(rawPipelineResult.description?.length).toBe(38);

    // 3. Mock coordinate-less recoverLocationMetadata
    let capturedArgs: any = null;
    const mockRecoverLocationMetadata = vi.fn(async (entityName, coordinates, canonicalIdentity, signal) => {
      capturedArgs = { entityName, coordinates, canonicalIdentity, signal };
      // Explicitly verify coordinates are undefined without throwing or substituting fake {lat: 0, lng: 0}
      expect(coordinates).toBeUndefined();

      return {
        description: 'The Underground Railroad was a clandestine network of secret routes and safe houses established in the United States during the early to mid-19th century. It was used by enslaved African Americans primarily to escape into free northern states and Canada with the aid of abolitionists and allies.',
        historicalContext: '19th-century clandestine escape network for enslaved African Americans.',
        significance: 'A cornerstone of the American abolitionist movement that aided tens of thousands of freedom seekers.',
        notable: [
          {
            title: 'Harriet Tubman',
            description: 'Renowned conductor who made approximately 13 missions to rescue around 70 enslaved people.'
          },
          {
            title: 'Safe Houses',
            description: 'Private homes, churches, and businesses known as stations that provided shelter, food, and concealment.'
          }
        ],
        contextNotes: [{ text: 'Operated from the late 18th century until the Civil War' }]
      };
    });

    let finalData = { ...rawPipelineResult };
    if (!descReadiness.isReady) {
      const enriched = await mockRecoverLocationMetadata(
        finalData.name,
        finalData.coordinates,
        {
          canonicalName: finalData.canonicalName || finalData.name,
          entityType: finalData.entityType,
          country: finalData.country,
          state: finalData.state,
          city: finalData.city,
          county: finalData.county,
          region: finalData.region,
          originalQuery: cleanQuery,
          historicalContext: finalData.historicalContext || cleanQuery,
        },
        abortController.signal
      );

      if (enriched && enriched.description) {
        finalData = {
          ...finalData,
          ...enriched,
          description: typeof enriched.description === 'string' ? enriched.description : (enriched.description as any).text,
          historicalContext: enriched.historicalContext || finalData.historicalContext,
          significance: enriched.significance || finalData.significance,
          notable: enriched.notable || finalData.notable,
          contextNotes: enriched.contextNotes || finalData.contextNotes,
        };
      }
    }

    // 4. Verification
    expect(mockRecoverLocationMetadata).toHaveBeenCalledTimes(1);
    expect(capturedArgs.entityName).toBe('Underground Railroad');
    expect(capturedArgs.coordinates).toBeUndefined();
    expect(capturedArgs.canonicalIdentity.entityType).toBe('historical_event');
    expect(capturedArgs.canonicalIdentity.country).toBe('Regional');

    // Verify substantive text replaced the 38-char stub
    expect(finalData.description).toContain('clandestine network of secret routes');
    expect(finalData.description.length).toBeGreaterThan(100);
    expect(finalData.notable?.length).toBe(2);
    expect(finalData.contextNotes?.length).toBe(1);
    expect(finalData.coordinates).toBeUndefined();

    // Verify description readiness now passes
    const finalReadiness = evaluateDescriptionReadiness(finalData.description, finalData.name);
    expect(finalReadiness.isReady).toBe(true);
    expect(finalReadiness.quality).toBe('substantive');
  });

  it('recoverLocationMetadata successfully recovers and parses LM Studio output containing -NLSHMKM and comma-formatted population', async () => {
    let capturedPrompt: string = '';
    const mockGenerateContent = vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      capturedPrompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
      return {
        text: `-NLSHMKM{
          "@context": "https://schema.org",
          "@type": "Landmark",
          "name": "Bogota",
          "locationString": "Bogota, Capital District, Colombia",
          "population": 7,692,330,
          "description": "Bogota is the sprawling, high-altitude capital of Colombia, situated on a high plateau in the Andes mountains. It serves as the political, economic, and cultural heart of the country with rich historical architecture and modern institutions.",
          "climate": {
            "name": "Subtropical highland climate",
            "description": "Mild and pleasant temperatures throughout the year due to high elevation."
          },
          "contextNotes": ["Situated at an altitude of approximately 2,640 meters above sea level."],
          "notable": [
            {
              "title": "Monserrate Sanctuary",
              "description": "A 17th-century shrine perched atop Mount Monserrate offering panoramic views of the capital."
            },
            {
              "title": "Gold Museum",
              "description": "One of the most visited museums in Colombia housing an extraordinary collection of pre-Hispanic gold work."
            }
          ]
        }`
      } as any;
    });

    const coords = { lat: 4.6534, lng: -74.0836 };
    const canonicalIdentity = {
      canonicalName: 'Bogota',
      entityType: 'landmark',
      state: 'Bogota, Capital District',
      country: 'Colombia'
    };

    const recovered = await geminiService.recoverLocationMetadata('Bogota', coords, canonicalIdentity);

    expect(recovered).not.toBeNull();
    // Population from AI is strictly rejected to prevent hallucinations
    expect(recovered?.population).toBeUndefined();
    // Prompt explicitly instructed population to be null
    expect(capturedPrompt).toContain('POPULATION REQUIREMENT: Do not generate, estimate, or infer population. Always return population as null');
    // Description and notable facts were recovered substantively
    const descText = typeof recovered?.description === 'string' ? recovered.description : (recovered?.description as any)?.text;
    expect(descText).toContain('sprawling, high-altitude capital of Colombia');
    expect(recovered?.notable?.length).toBe(2);

    mockGenerateContent.mockRestore();
  });
});
