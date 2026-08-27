import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import * as geminiService from '../geminiService';
import { buildEntityImageQueries } from '../imageService';
import { normalizeHeaderGeographicHierarchy } from '../../components/InfoPanel';

describe('Entity Name Casing & Canonical Identity Pipeline Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. "Where was the SS Republic found?" recovers and preserves canonical casing "SS Republic"', async () => {
    // Mock resolveLocationQuery to simulate AI returning verified "SS Republic"
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      locationInfo: {
        name: "SS Republic",
        canonicalName: "SS Republic",
        type: "Point of Interest" as any,
        entityType: "shipwreck_site" as any,
        coordinates: { lat: 31.55, lng: -79.79 },
        description: "The SS Republic was a sidewheel steamship that sank in 1865 off the coast of Georgia.",
        country: "United States",
        state: "Georgia"
      },
      suggestedZoom: 8,
      aiUsed: true
    });

    const result = await runSearchPipeline({ rawQuery: "Where was the SS Republic found?" });

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe("location");
    expect(result.entity).toBeDefined();

    // Subject identity
    expect(result.entity?.subject.identity.canonicalName).toBe("SS Republic");
    expect(result.entity?.subject.primaryLocation.label).toBe("SS Republic");

    // FinalData
    const finalData = (result as any).finalData;
    expect(finalData).toBeDefined();
    expect(finalData.name).toBe("SS Republic");
    expect(finalData.canonicalName).toBe("SS Republic");
    expect(finalData.displayName).toBe("SS Republic");
  });

  it('2. Coordinate recovery with lowercase query "where was the ss republic found?" promotes recoveredEntity "SS Republic" to canonicalName', async () => {
    // Initial resolver returns no coordinates (simulating fallback to recoverCoordinatesFromAi)
    vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
      error: "NO_GEOGRAPHIC_DATA",
      locationInfo: { name: "ss republic" },
      suggestedZoom: 5,
      aiUsed: false
    });

    // Mock recoverCoordinatesFromAi returning recovered "SS Republic"
    vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue({
      lat: 31.55,
      lng: -79.79,
      source: "ai_recovery",
      recoveredEntity: "SS Republic",
      resolvedEntity: "SS Republic",
      name: "SS Republic",
      canonicalName: "SS Republic"
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: "The SS Republic was an American Civil War-era sidewheel steamship.",
      climate: { name: "Humid subtropical", description: "Maritime coastal", koppenCode: "Cfa" },
      notable: [{ title: "Shipwreck Discovery", description: "Discovered in 2003 by Odyssey Marine Exploration." }]
    });

    const result = await runSearchPipeline({ rawQuery: "where was the ss republic found?" });

    expect(result.isValid).toBe(true);
    expect(result.entity?.subject.identity.canonicalName).toBe("SS Republic");

    const finalData = (result as any).finalData;
    expect(finalData.name).toBe("SS Republic");
    expect(finalData.canonicalName).toBe("SS Republic");
    expect(finalData.displayName).toBe("SS Republic");
  });

  it('3. Generic initialisms and acronyms preserve authoritative casing (USS Constitution, NASA JPL, UNESCO)', async () => {
    // USS Constitution
    const ussResult = geminiService.routeIntentAndExtractEntity("Where was the USS Constitution built?");
    expect(ussResult.entity).toBe("USS Constitution");

    // NASA Jet Propulsion Laboratory
    const nasaResult = geminiService.routeIntentAndExtractEntity("Where was NASA Jet Propulsion Laboratory founded?");
    expect(nasaResult.entity).toBe("NASA Jet Propulsion Laboratory");

    // UNESCO Site
    const unescoResult = geminiService.routeIntentAndExtractEntity("Where was UNESCO World Heritage Site located?");
    expect(unescoResult.entity).toBe("UNESCO World Heritage Site");
  });

  it('4. Metadata recovery receives verified canonicalName with exact casing in prompt', async () => {
    let capturedPrompt = '';
    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      capturedPrompt = params.contents;
      return {
        text: JSON.stringify({
          name: "SS Republic",
          locationString: "Georgia, United States",
          description: "The SS Republic is a historic steamship wreck site.",
          population: null,
          climate: {
            name: "Humid subtropical",
            description: "Coastal maritime climate.",
            koppenCode: "Cfa"
          },
          notable: [
            {
              title: "Gold Coin Recovery",
              description: "Over 51,000 gold and silver coins were salvaged from the wreck."
            }
          ]
        })
      } as any;
    });

    const recovered = await geminiService.recoverLocationMetadata(
      "SS Republic",
      { lat: 31.55, lng: -79.79 },
      {
        canonicalName: "SS Republic",
        entityType: "shipwreck_site",
        country: "United States",
        state: "Georgia",
        identityStatus: "verified",
        originalQuery: "Where was the SS Republic found?"
      }
    );

    expect(recovered).toBeDefined();
    expect(capturedPrompt).toContain("Canonical entity:\n      SS Republic");
    expect(capturedPrompt).not.toContain("Ss Republic");
  });

  it('5. Downstream Image Search builds queries using authoritative canonicalName', () => {
    const info = {
      name: "SS Republic",
      canonicalName: "SS Republic",
      displayName: "SS Republic",
      entityType: "shipwreck_site",
      type: "Point of Interest",
      intent: "DISCOVERY_OBJECT_LOCATION" as const,
      country: "United States",
      state: "Georgia"
    };

    const imageQueries = buildEntityImageQueries(info as any);
    expect(imageQueries).toContain("SS Republic");
    expect(imageQueries).not.toContain("Ss Republic");
  });

  it('6. InfoPanel header geographic resolution renders authoritative title "SS Republic"', () => {
    const info = {
      name: "SS Republic",
      canonicalName: "SS Republic",
      displayName: "SS Republic",
      country: "United States",
      state: "Georgia"
    };

    const header = normalizeHeaderGeographicHierarchy(info, undefined, true);
    expect(header.displayTitle).toBe("SS Republic");
  });
});
