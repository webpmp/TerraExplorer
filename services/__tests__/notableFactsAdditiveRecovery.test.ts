import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as geminiService from '../geminiService';

describe('Notable Facts Additive Recovery & Bounded Replacement Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers a bounded replacement when initial LLM facts are redundant with description and accepts additive replacement', async () => {
    // 1st call (initial recovery): returns description about wildebeest migration and redundant notable fact about the same migration
    // 2nd call (replacement attempt): returns an additive notable fact about kopjes / predator habitat
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Serengeti National Park",
            locationString: "Mara Region, Tanzania",
            description: "Serengeti National Park is a massive national park in northern Tanzania known worldwide for the largest annual animal migration in the world, involving over one million wildebeest and zebras.",
            climate: {
              name: "Tropical savanna climate",
              description: "Warm with wet and dry seasons",
              koppenCode: "Aw"
            },
            contextNotes: [
              "Designated as a UNESCO World Heritage site in 1981."
            ],
            notable: [
              {
                title: "Annual Migration",
                description: "The park is renowned for the largest annual animal migration in the world, involving over one million wildebeest and zebras."
              }
            ]
          })
        } as any;
      } else {
        // Replacement call
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "Granite Kopjes",
                description: "Distinctive granite rock formations known as kopjes rise above the grasslands, providing critical shade and vantage points for lion prides."
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Serengeti National Park",
      { lat: -2.3333, lng: 34.8333 },
      {
        canonicalName: "Serengeti National Park",
        country: "Tanzania",
        state: "Mara Region",
        entityType: "national_park"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2); // Initial recovery + 1-shot replacement
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("Granite Kopjes");
    expect((result?.notable as any)[0].description).toContain("granite rock formations known as kopjes");
  });

  it('leaves notable empty when replacement also returns redundant or ungrounded facts', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Serengeti National Park",
            locationString: "Mara Region, Tanzania",
            description: "Serengeti National Park is famous for its massive annual wildebeest migration.",
            climate: {
              name: "Tropical savanna climate",
              description: "Warm with wet and dry seasons",
              koppenCode: "Aw"
            },
            contextNotes: [],
            notable: [
              {
                title: "Wildebeest Migration",
                description: "Serengeti National Park is famous for its annual wildebeest migration."
              }
            ]
          })
        } as any;
      } else {
        // Replacement still repeats the migration
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "Great Migration",
                description: "The park is famous for the great migration of wildebeests."
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Serengeti National Park",
      { lat: -2.3333, lng: 34.8333 },
      {
        canonicalName: "Serengeti National Park",
        country: "Tanzania",
        state: "Mara Region",
        entityType: "national_park"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2); // Exactly 1 bounded replacement attempt, no loop
    expect(result?.notable).toEqual([]);
  });

  it('bypasses replacement when initial recovery already contains an additive fact', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      return {
        text: JSON.stringify({
          name: "Stonehenge",
          locationString: "Wiltshire, England, United Kingdom",
          description: "Stonehenge is a prehistoric megalithic monument on Salisbury Plain in Wiltshire, England, consisting of an outer ring of vertical sarsen standing stones.",
          climate: {
            name: "Oceanic climate",
            description: "Mild and temperate",
            koppenCode: "Cfb"
          },
          contextNotes: [
            "Constructed in multiple phases from roughly 3000 BC to 2000 BC."
          ],
          notable: [
            {
              title: "Bluestone Origin",
              description: "The smaller inner bluestones were transported over 150 miles from the Preseli Hills in southwestern Wales."
            }
          ]
        })
      } as any;
    });

    const result = await geminiService.recoverLocationMetadata(
      "Stonehenge",
      { lat: 51.1788, lng: -1.8262 },
      {
        canonicalName: "Stonehenge",
        country: "United Kingdom",
        state: "Wiltshire",
        entityType: "monument"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(1); // No replacement call needed
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("Bluestone Origin");
  });

  it('keeps additive facts and filters redundant facts when initial response has mixed facts without triggering replacement', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      return {
        text: JSON.stringify({
          name: "Plymouth",
          locationString: "Devon, England, United Kingdom",
          description: "Plymouth is a port city in Devon, England, renowned for its maritime history and natural harbor on Plymouth Sound.",
          climate: {
            name: "Oceanic climate",
            description: "Temperate maritime climate",
            koppenCode: "Cfb"
          },
          contextNotes: [],
          notable: [
            {
              title: "Maritime Port",
              description: "Plymouth is a port city with a rich maritime history." // Redundant with description
            },
            {
              title: "Smeaton's Tower",
              description: "The historic upper portion of John Smeaton's 1759 Eddystone Lighthouse was rebuilt on Plymouth Hoe in 1882 as a memorial." // Additive
            }
          ]
        })
      } as any;
    });

    const result = await geminiService.recoverLocationMetadata(
      "Plymouth",
      { lat: 50.3755, lng: -4.1427 },
      {
        canonicalName: "Plymouth",
        country: "United Kingdom",
        state: "Devon",
        entityType: "city"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(1); // Initial recovery only
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("Smeaton's Tower");
  });

  it('does not trigger replacement when initial recovery generates 0 notable facts', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      return {
        text: JSON.stringify({
          name: "Small Hamlet",
          locationString: "Devon, England, United Kingdom",
          description: "Small Hamlet is a rural locality in Devon, England.",
          climate: {
            name: "Oceanic climate",
            description: "Temperate",
            koppenCode: "Cfb"
          },
          contextNotes: [],
          notable: []
        })
      } as any;
    });

    const result = await geminiService.recoverLocationMetadata(
      "Small Hamlet",
      { lat: 50.5, lng: -4.0 },
      {
        canonicalName: "Small Hamlet",
        country: "United Kingdom",
        state: "Devon",
        entityType: "hamlet"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(1);
    expect(result?.notable).toEqual([]);
  });

  it('handles malformed / non-JSON replacement responses (such as echoed instructions) resulting cleanly in notable: [] without looping', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Santa Maria",
            locationString: "California, United States",
            description: "Santa Maria is a city in Santa Barbara County. The name Santa Maria is used culturally to denote Mary, the mother of Jesus, in multiple languages such as Italian, Portuguese, Spanish and Maltese.",
            climate: {
              name: "Mediterranean climate",
              description: "Mild and temperate",
              koppenCode: "Csb"
            },
            contextNotes: [],
            notable: [
              {
                title: "Cultural Significance",
                description: "The name Santa Maria is used culturally to denote Mary, the mother of Jesus, in multiple languages such as Italian, Portuguese, Spanish and Maltese."
              }
            ]
          })
        } as any;
      } else {
        // Echoed instruction text returned instead of JSON
        return {
          text: "/Instruction: Ensure all requested fields are present.\n/Instruction: Respond with a valid JSON object.\n;"
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Santa Maria",
      { lat: 34.953, lng: -120.4357 },
      {
        canonicalName: "Santa Maria",
        country: "United States",
        state: "California",
        entityType: "city"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2); // Exactly 1 bounded replacement attempt, no extra retries
    expect(result?.notable).toEqual([]);
  });

  it('filters out code/UI artifacts and unsupported event claims in replacement notable facts', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Plymouth",
            locationString: "Devon, England, United Kingdom",
            description: "Plymouth is a port city in Devon, England, renowned for its maritime history and natural harbor on Plymouth Sound.",
            climate: {
              name: "Oceanic climate",
              description: "Temperate maritime climate",
              koppenCode: "Cfb"
            },
            contextNotes: [],
            notable: [
              {
                title: "Maritime History",
                description: "Plymouth is a port city in Devon, England, renowned for its maritime history." // Redundant
              }
            ]
          })
        } as any;
      } else {
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "Naval Monument",
                description: "The city features the National Memorial to theFontAwesomeSolidPlaneService." // Code token
              },
              {
                title: "Olympic Games",
                description: "Plymouth hosted the 1908 Olympic Games." // Unsupported major event host claim
              },
              {
                title: "Royal Citadel",
                description: "The 17th-century Royal Citadel fortress stands at the eastern end of Plymouth Hoe overlooking the Sound." // Valid additive fact
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Plymouth",
      { lat: 50.3755, lng: -4.1427 },
      {
        canonicalName: "Plymouth",
        country: "United Kingdom",
        state: "Devon",
        entityType: "city"
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2);
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("Royal Citadel");
  });

  it('supplies verified historical context to recovery prompts for historical entities and requests entity-focused description', async () => {
    let capturedPrompt = '';

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      capturedPrompt = params.contents;
      return {
        text: JSON.stringify({
          name: "Santa Maria",
          locationString: "Cap-Haitien, Département du Nord, Haiti",
          description: "The Santa Maria was the flagship of Christopher Columbus on his 1492 voyage to the Americas. On Christmas Day 1492, the ship ran aground on a coral reef off the northern coast of Hispaniola near present-day Cap-Haïtien.",
          climate: {
            name: "Tropical wet and dry climate",
            description: "Warm tropical climate",
            koppenCode: "Aw"
          },
          contextNotes: [
            "Columbus used the timber from the wrecked ship to build the fortified settlement of La Navidad."
          ],
          notable: [
            {
              title: "La Navidad Settlement",
              description: "Timbers salvaged from the grounded flagship were used to establish La Navidad, the first European settlement in the Americas."
            }
          ]
        })
      } as any;
    });

    const result = await geminiService.recoverLocationMetadata(
      "Santa Maria",
      { lat: 19.8, lng: -72.2 },
      {
        canonicalName: "Santa Maria",
        country: "Haiti",
        state: "Département du Nord",
        city: "Cap-Haitien",
        entityType: "shipwreck"
      }
    );

    expect(result).not.toBeNull();
    // Verify prompt contains verified historical context retrieved from historical knowledge base
    expect(capturedPrompt).toContain("Columbus's flagship during his 1492 voyage");
    expect(capturedPrompt).toContain("Do NOT output generic name etymology");
    expect(result?.description?.text).toContain("flagship of Christopher Columbus");
    expect(result?.notable).toHaveLength(1);
  });

  it('includes verified historical context in notable replacement prompt when replacement is triggered', async () => {
    let callCount = 0;
    let capturedReplacementPrompt = '';

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Santa Maria",
            locationString: "Cap-Haitien, Département du Nord, Haiti",
            description: "The Santa Maria was the flagship of Christopher Columbus during his 1492 voyage, running aground on a reef on Christmas Day 1492 near Cap-Haïtien.",
            climate: {
              name: "Tropical climate",
              description: "Tropical",
              koppenCode: "Aw"
            },
            contextNotes: [],
            notable: [
              {
                title: "1492 Flagship",
                description: "The Santa Maria was the flagship of Christopher Columbus during his 1492 voyage." // Redundant with description
              }
            ]
          })
        } as any;
      } else {
        capturedReplacementPrompt = params.contents;
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "Salvaged Timbers",
                description: "Salvaged timbers from the wreck were used to construct the settlement of La Navidad."
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Santa Maria",
      { lat: 19.8, lng: -72.2 },
      {
        canonicalName: "Santa Maria",
        country: "Haiti",
        state: "Département du Nord",
        entityType: "shipwreck",
        historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti."
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2);
    expect(capturedReplacementPrompt).toContain("Columbus's flagship during his 1492 voyage");
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("Salvaged Timbers");
  });

  it('rejects abstract historical significance notable facts as redundant and replaces with concrete consequence', async () => {
    let callCount = 0;
    let capturedPrompts: string[] = [];

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      capturedPrompts.push(params.contents);
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Santa Maria",
            locationString: "Cap-Haitien, Département du Nord, Haiti",
            description: "The Santa Maria was Columbus's flagship during his 1492 voyage. It ran aground on a reef near present-day Cap-Haïtien, Haiti, on Christmas Day of that year.",
            climate: {
              name: "Tropical rainforest climate",
              description: "Tropical climate",
              koppenCode: "Af"
            },
            contextNotes: [],
            notable: [
              {
                title: "Historical Significance",
                description: "The Santa Maria's grounding marked a crucial moment in Columbus's voyage, symbolizing the beginning of European exploration and colonization of the Americas."
              }
            ]
          })
        } as any;
      } else {
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "La Navidad Settlement",
                description: "Timbers from the wrecked flagship were salvaged to construct the fortified settlement of La Navidad, leaving 39 men behind."
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Santa Maria",
      { lat: 19.76, lng: -72.2 },
      {
        canonicalName: "Santa Maria",
        country: "Haiti",
        state: "Département du Nord",
        entityType: "shipwreck",
        historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti."
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2);
    // Verified that initial abstract significance fact was rejected as redundant
    expect(result?.notable).toHaveLength(1);
    expect((result?.notable as any)[0].title).toBe("La Navidad Settlement");
    expect((result?.notable as any)[0].description).toContain("fortified settlement of La Navidad");

    // Check prompt guardrails
    expect(capturedPrompts[0]).toContain("Do NOT inflate significance with generic evaluative claims");
    expect(capturedPrompts[0]).toContain("CONCRETE NOTABLE FACTS");
    expect(capturedPrompts[1]).toContain("CONCRETE DETAILS ONLY");
  });

  it('leaves notable empty if replacement only provides abstract significance commentary', async () => {
    let callCount = 0;

    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: JSON.stringify({
            name: "Santa Maria",
            locationString: "Cap-Haitien, Département du Nord, Haiti",
            description: "The Santa Maria was Columbus's flagship during his 1492 voyage. It ran aground on a reef near present-day Cap-Haïtien, Haiti, on Christmas Day 1492.",
            climate: {
              name: "Tropical rainforest climate",
              description: "Tropical climate",
              koppenCode: "Af"
            },
            contextNotes: [],
            notable: [
              {
                title: "Historical Significance",
                description: "The Santa Maria's grounding marked a crucial moment in Columbus's voyage, symbolizing the beginning of European exploration and colonization of the Americas."
              }
            ]
          })
        } as any;
      } else {
        return {
          text: JSON.stringify({
            notable: [
              {
                title: "Crucial Turning Point",
                description: "The grounding represented a significant milestone in European expansion in the Americas."
              }
            ]
          })
        } as any;
      }
    });

    const result = await geminiService.recoverLocationMetadata(
      "Santa Maria",
      { lat: 19.76, lng: -72.2 },
      {
        canonicalName: "Santa Maria",
        country: "Haiti",
        state: "Département du Nord",
        entityType: "shipwreck",
        historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti."
      }
    );

    expect(result).not.toBeNull();
    expect(callCount).toBe(2);
    // Both abstract commentary facts are rejected as redundant
    expect(result?.notable).toEqual([]);
  });
});

