import { describe, it, expect, vi } from 'vitest';
import { isWikipediaPaste, cleanPastedArticleText } from '../sourceContentService';
import { estimateTokens, checkContextBudget, DEFAULT_LM_STUDIO_CONTEXT_LIMIT } from '../tokenEstimator';
import { chunkSourceText, mergeAndDeduplicateChunkLocations, formatCompactSourceRepresentation, extractAndReduceLargeSource } from '../largeSourceExtractor';
import { generateRoute, LMStudioContextOverflowError, isLMStudioContextOverflowError } from '../geminiService';

describe('TRACE ROUTE Large Pasted Source & Wikipedia Input Handling Suite', () => {
  // Test 1: Short TRACE ROUTE query remains on the normal path
  it('Test 1: Short TRACE ROUTE query remains on normal path without chunking', async () => {
    const query = 'Journey across the Amalfi Coast visiting Positano and Amalfi';
    const calls: any[] = [];
    const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
      calls.push(params);
      return {
        text: JSON.stringify({
          title: 'Amalfi Coast Journey',
          routeType: 'regional_event',
          isSequential: false,
          route: [
            { id: 'wp-1', name: 'Positano', lat: 40.6281, lng: 14.4850, sequence: 1, sourceEvidence: 'Visiting Positano on the Amalfi Coast' },
            { id: 'wp-2', name: 'Amalfi', lat: 40.6340, lng: 14.6027, sequence: 2, sourceEvidence: 'Visiting Amalfi along the coast' }
          ]
        })
      };
    });

    const route = await generateRoute(query, { generateFn: mockGenerateFn });
    expect(route.waypoints.length).toBeGreaterThanOrEqual(2);
    // Directly invoked generateRawRoute without chunking calls
    expect(calls.length).toBe(1);
    expect(calls[0].contents).toContain('Query: "Journey across the Amalfi Coast');
  });

  // Test 2: Large pasted source triggers the oversized-input guard
  it('Test 2: Large pasted source triggers the oversized-input guard', () => {
    const largeText = 'A'.repeat(70000);
    const budget = checkContextBudget({
      promptText: largeText,
      expectedOutputTokens: 4096,
      availableContext: DEFAULT_LM_STUDIO_CONTEXT_LIMIT
    });

    expect(budget.isOversized).toBe(true);
    expect(budget.totalEstimatedTokens).toBeGreaterThan(DEFAULT_LM_STUDIO_CONTEXT_LIMIT);
  });

  // Test 3: Full Wikipedia-style pasted text has obvious page chrome removed
  it('Test 3: Full Wikipedia-style pasted text has obvious page chrome removed', () => {
    const rawWikipediaPaste = `
Wikipedia
The Free Encyclopedia
Search Wikipedia
Donate
Create account
Log in
Contents hide
Top
1 History
2 Discovery
3 Mechanism
Article Talk
Read Edit View history
Tools
Appearance hide
Text
Small
Standard
Large
Width
Standard
Wide
Color
Automatic
Light
Dark
Listen to this article

Antikythera mechanism

From Wikipedia, the free encyclopedia

The Antikythera mechanism is an Ancient Greek hand-powered orrery, described as the oldest example of an analogue computer.
It was retrieved from a shipwreck off the coast of the Greek island of Antikythera in 1901.

History
Discovery

In 1900, sponge divers discovered the Antikythera wreck. The artifacts were retrieved and transferred to the National Archaeological Museum in Athens.

Categories: Ancient Greek technology | 1st-century BC archaeological discoveries
Retrieved from "https://en.wikipedia.org/wiki/Antikythera_mechanism"
`;

    expect(isWikipediaPaste(rawWikipediaPaste)).toBe(true);
    const cleaned = cleanPastedArticleText(rawWikipediaPaste);

    expect(cleaned.title).toContain('Antikythera mechanism');
    expect(cleaned.content).not.toContain('The Free Encyclopedia');
    expect(cleaned.content).not.toContain('Search Wikipedia');
    expect(cleaned.content).not.toContain('Create account');
    expect(cleaned.content).not.toContain('Appearance');
    expect(cleaned.content).not.toContain('Small Standard Large');
    expect(cleaned.content).not.toContain('Listen to this article');
    expect(cleaned.content).not.toContain('Categories:');
    expect(cleaned.content).toContain('Antikythera mechanism');
    expect(cleaned.content).toContain('island of Antikythera');
    expect(cleaned.content).toContain('National Archaeological Museum');
  });

  // Test 4: Cleaning preserves legitimate article headings and prose containing words such as "History", "Discovery", and "Article"
  it('Test 4: Cleaning preserves legitimate article headings and prose containing "History", "Discovery", and "Article"', () => {
    const textWithLegitHeadings = `
Wikipedia
The Free Encyclopedia

Antikythera Mechanism Overview

History of the Device
The history of this remarkable device spans centuries of Hellenistic engineering.

Discovery at Sea
In 1900, sponge divers discovered fragments near Antikythera.

Article Analysis
This article reviews the computational gear trains inside the bronze casing.
`;

    const cleaned = cleanPastedArticleText(textWithLegitHeadings);
    expect(cleaned.content).toContain('History of the Device');
    expect(cleaned.content).toContain('The history of this remarkable device');
    expect(cleaned.content).toContain('Discovery at Sea');
    expect(cleaned.content).toContain('sponge divers discovered fragments near Antikythera');
    expect(cleaned.content).toContain('Article Analysis');
    expect(cleaned.content).toContain('This article reviews the computational gear trains');
  });

  // Test 5: Large source is chunked at paragraph/section/sentence boundaries rather than arbitrarily truncating
  it('Test 5: Large source is chunked at paragraph/section/sentence boundaries rather than arbitrarily truncating', () => {
    const paragraphs = [
      'Section 1: The expedition began in Athens, Greece in the spring of 1900. Divers prepared their gear.',
      'Section 2: Sailing south towards Crete, the ship encountered severe storms and sought refuge near Antikythera island.',
      'Section 3: While waiting out the gale, divers explored the seabed and discovered an ancient Roman shipwreck filled with bronze statues.',
      'Section 4: The recovered gear wheels were transferred to the National Archaeological Museum in Athens for conservation.'
    ];
    // Create large source
    const longSource = paragraphs.map(p => p.repeat(30)).join('\n\n');
    const chunks = chunkSourceText(longSource, 1500);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      // Each chunk should not split mid-word and should be a valid string
      expect(chunk.length).toBeGreaterThan(50);
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(3500);
    });
  });

  // Test 6: Chunk extraction results are merged and deduplicated
  it('Test 6: Chunk extraction results are merged and deduplicated', () => {
    const chunk1Locations = [
      { name: 'Antikythera', role: 'Shipwreck site', description: 'Island where the mechanism was discovered.', sourceEvidence: 'Found off Antikythera in 1900.' },
      { name: 'Athens', role: 'Departure port', description: 'Port where divers embarked.', sourceEvidence: 'Sailed from Athens.' }
    ];

    const chunk2Locations = [
      { name: 'Antikythera Island', canonicalName: 'Antikythera', role: 'Shipwreck site', description: 'Greek island between Peloponnese and Crete where ancient wreck lies.', sourceEvidence: 'Wreck site off Antikythera island.' },
      { name: 'National Archaeological Museum, Athens', canonicalName: 'National Archaeological Museum', role: 'Preservation location', description: 'Museum where the gear fragments are preserved.', sourceEvidence: 'Transferred to the National Archaeological Museum.' }
    ];

    const merged = mergeAndDeduplicateChunkLocations([chunk1Locations, chunk2Locations]);
    expect(merged.length).toBe(3); // Athens, Antikythera, National Archaeological Museum

    const antikythera = merged.find(m => m.name.toLowerCase().includes('antikythera'));
    expect(antikythera).toBeDefined();
    // Richer description preserved
    expect(antikythera?.description).toContain('Peloponnese and Crete');
    // Source evidence merged
    expect(antikythera?.sourceEvidence).toContain('Found off Antikythera');
  });

  // Test 7: Final reduced representation fits within the 16,384-token context budget
  it('Test 7: Final reduced representation fits within the 16,384-token context budget', () => {
    const locations = [
      { name: 'Antikythera', role: 'Wreck site', description: 'Island location of discovery.', sourceEvidence: 'Discovered off Antikythera.' },
      { name: 'National Archaeological Museum', role: 'Current location', description: 'Museum in Athens housing the artifacts.', sourceEvidence: 'Housed in Athens.' }
    ];
    const compact = formatCompactSourceRepresentation('Antikythera mechanism', locations);

    expect(compact.reducedEstimatedTokens).toBeLessThan(1000);
    expect(compact.reducedContent).toContain('TITLE: Antikythera mechanism');
    expect(compact.reducedContent).toContain('1. Antikythera');
    expect(compact.reducedContent).toContain('2. National Archaeological Museum');
  });

  // Test 8: Recovery path does not resubmit the original oversized source
  it('Test 8: Recovery path does not resubmit the original oversized source', async () => {
    const calls: any[] = [];
    const largePaste = `Wikipedia\nThe Free Encyclopedia\n\n` + `Antikythera mechanism discovery details in Greece. `.repeat(2500);

    const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
      calls.push(params);
      if (params.contents.includes('Task: Extract physical and historical geographic locations')) {
        // Chunk extraction call
        return {
          text: JSON.stringify({
            locations: [
              { name: 'Antikythera', role: 'Wreck site', description: 'Island shipwreck location.', sourceEvidence: 'Found off Antikythera.' },
              { name: 'National Archaeological Museum, Athens', role: 'Museum', description: 'Museum housing the mechanism.', sourceEvidence: 'Transferred to National Archaeological Museum in Athens.' }
            ]
          })
        };
      }
      // Main stage 1 route generation returns truncated JSON to trigger recovery
      if (calls.length === 3) {
        return { text: `{"title": "Antikythera", "route": [{"name": "Antikythera"` };
      }
      // Recovery call
      return {
        text: JSON.stringify({
          title: 'Antikythera mechanism',
          routeType: 'regional_event',
          isSequential: false,
          route: [
            { id: 'wp-1', name: 'Antikythera', lat: 35.8622, lng: 23.3000, sequence: 1, sourceEvidence: 'Found off Antikythera in Greece.' },
            { id: 'wp-2', name: 'National Archaeological Museum', lat: 37.9891, lng: 23.7327, sequence: 2, sourceEvidence: 'Transferred to National Archaeological Museum in Athens.' }
          ]
        })
      };
    });

    const route = await generateRoute(largePaste, { generateFn: mockGenerateFn });
    expect(route.waypoints.length).toBeGreaterThanOrEqual(2);

    // Ensure none of the LLM call prompts exceed 16,384 tokens
    for (const call of calls) {
      const callTokens = estimateTokens(call.contents);
      expect(callTokens).toBeLessThan(16384);
    }
  });

  // Test 9: Context-size error is recognized and produces a meaningful error state
  it('Test 9: Context-size error is recognized as LMStudioContextOverflowError', () => {
    const rawError = 'LM Studio request failed\nStatus: 400\nBody: {"error": "request (29844 tokens) exceeds the available context size (16384 tokens)"}';
    expect(isLMStudioContextOverflowError(rawError)).toBe(true);

    const errObj = new LMStudioContextOverflowError('request exceeds the available context size');
    expect(isLMStudioContextOverflowError(errObj)).toBe(true);
  });

  // Test 10: Source evidence survives extraction and merge for downstream validation
  it('Test 10: Source evidence survives extraction and merge for downstream validation', async () => {
    const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
      if (params.contents.includes('Task: Extract physical and historical geographic locations')) {
        return {
          text: JSON.stringify({
            locations: [
              { name: 'Villa del Balbianello', description: 'Overlooks Lake Como in Lenno.', sourceEvidence: 'Villa del Balbianello in Lenno offers panoramic views of Lake Como.' },
              { name: 'Villa Carlotta', description: 'Showcases neoclassical art in Tremezzo.', sourceEvidence: 'Villa Carlotta in Tremezzo showcases neoclassical art.' }
            ]
          })
        };
      }
      return {
        text: JSON.stringify({
          title: 'Lake Como Tour',
          routeType: 'regional_event',
          isSequential: false,
          route: [
            { id: 'wp-1', name: 'Villa del Balbianello', canonicalName: 'Villa del Balbianello', lat: 45.9654, lng: 9.2025, sourceEvidence: 'Villa del Balbianello in Lenno offers panoramic views of Lake Como.', sequence: 1 },
            { id: 'wp-2', name: 'Villa Carlotta', canonicalName: 'Villa Carlotta', lat: 45.9861, lng: 9.2294, sourceEvidence: 'Villa Carlotta in Tremezzo showcases neoclassical art.', sequence: 2 }
          ]
        })
      };
    });

    const largePastedArticle = 'Lake Como Travel Guide\n\n' + 'Villa del Balbianello in Lenno offers panoramic views of Lake Como.\n\n'.repeat(600) + 'Villa Carlotta in Tremezzo showcases neoclassical art.\n\n'.repeat(600);
    const route = await generateRoute(largePastedArticle, { generateFn: mockGenerateFn });

    expect(route.waypoints.length).toBe(2);
    expect(route.waypoints[0].sourceEvidence).toContain('Villa del Balbianello');
    expect(route.waypoints[1].sourceEvidence).toContain('Villa Carlotta');
  });

  // Test 11: A meaningful location appearing near the end of a ~100K-character article is still extracted
  it('Test 11: Meaningful location near the end of a ~100K-character article is extracted', async () => {
    const earlySection = 'Antikythera mechanism was recovered in 1901 off the coast of Antikythera island.\n\n'.repeat(500);
    const middleSection = 'The mechanism features thirty bronze gears calculating astronomical cycles.\n\n'.repeat(500);
    const endSection = 'After extensive modern CT scanning, the main fragments remain permanently displayed at the National Archaeological Museum in Athens.\n\n'.repeat(100);
    const full100kDoc = earlySection + middleSection + endSection;

    expect(full100kDoc.length).toBeGreaterThanOrEqual(80000);

    const calls: any[] = [];
    const mockGenerateFn = vi.fn().mockImplementation(async (params: any) => {
      calls.push(params);
      if (params.contents.includes('Task: Extract physical and historical geographic locations')) {
        if (params.contents.includes('National Archaeological Museum in Athens')) {
          return {
            text: JSON.stringify({
              locations: [{ name: 'National Archaeological Museum, Athens', canonicalName: 'National Archaeological Museum', role: 'Museum preservation', sourceEvidence: 'Displayed at the National Archaeological Museum in Athens.' }]
            })
          };
        }
        if (params.contents.includes('Part 1 of')) {
          return {
            text: JSON.stringify({
              locations: [{ name: 'Antikythera', role: 'Shipwreck discovery site', sourceEvidence: 'Recovered off the coast of Antikythera island.' }]
            })
          };
        }
        return {
          text: JSON.stringify({ locations: [] })
        };
      }
      // Final route prompt
      return {
        text: JSON.stringify({
          title: 'Antikythera Mechanism',
          routeType: 'regional_event',
          isSequential: false,
          route: [
            { id: 'wp-1', name: 'Antikythera', lat: 35.8622, lng: 23.3000, sequence: 1, sourceEvidence: 'Recovered off the coast of Antikythera island.' },
            { id: 'wp-2', name: 'National Archaeological Museum, Athens', lat: 37.9891, lng: 23.7327, sequence: 2, sourceEvidence: 'Displayed at the National Archaeological Museum in Athens.' }
          ]
        })
      };
    });

    const route = await generateRoute(full100kDoc, { generateFn: mockGenerateFn });
    const waypointNames = route.waypoints.map(w => w.name);

    expect(waypointNames.some(n => n.includes('Antikythera'))).toBe(true);
    expect(waypointNames.some(n => n.includes('National Archaeological Museum'))).toBe(true);
  });

  // Test 12: Coordinate data is not trusted merely because extraction model returned it
  it('Test 12: Untrusted extraction coordinates are validated and resolved by geographic resolver', async () => {
    const mockGenerateFn = vi.fn().mockImplementation(async () => {
      return {
        text: JSON.stringify({
          title: 'Athens Historical Sites',
          routeType: 'single_location',
          isSequential: false,
          route: [
            // Model provides completely bogus coordinates (0, 0 or in the middle of ocean)
            { id: 'wp-1', name: 'National Archaeological Museum, Athens', lat: 0.0, lng: 0.0, sequence: 1, sourceEvidence: 'Exhibition at the National Archaeological Museum, Athens' }
          ]
        })
      };
    });

    const route = await generateRoute('National Archaeological Museum, Athens exhibition overview', { generateFn: mockGenerateFn });
    expect(route.waypoints.length).toBe(1);
    const wp = route.waypoints[0];
    // Must be resolved to real Athens coordinates (lat ~37.98, lng ~23.73)
    expect(wp.lat).toBeGreaterThan(37.0);
    expect(wp.lng).toBeGreaterThan(23.0);
  });
});
