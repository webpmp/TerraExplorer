import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import { normalizeGeographicQuery } from '../geographic/geographicNormalization';
import { toCanonicalTitleCase } from '../geographic/historicalCoordinateValidator';
import * as geminiService from '../geminiService';

describe('Geographic Identity & Enrichment Boundary Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const queryVariants = [
    "DALLAS TEXAS",
    "dallas texas",
    "Dallas Texas",
    "DALLAS, TEXAS",
    "dallas, texas",
    "Dallas, Texas"
  ];

  it('1. Query normalization resolves all punctuation/case variants of Dallas to "dallas, texas"', () => {
    queryVariants.forEach(q => {
      const normalized = normalizeGeographicQuery(q);
      expect(normalized).toBe("dallas, texas");
    });
  });

  it('2. toCanonicalTitleCase resolves all Dallas variants to "Dallas, Texas"', () => {
    queryVariants.forEach(q => {
      const canonical = toCanonicalTitleCase(q);
      expect(canonical).toBe("Dallas, Texas");
    });
  });

  it('3. All Dallas search query variants resolve to the exact same canonical entity in runSearchPipeline', async () => {
    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: "Dallas is a major metropolitan city in North Texas.",
      climate: { name: "Humid subtropical", description: "Hot summers", koppenCode: "Cfa" },
      contextNotes: ["Major transportation hub"],
      notable: [{ title: "Arts District", description: "Largest urban arts district." }]
    });

    for (const query of queryVariants) {
      const result = await runSearchPipeline({ rawQuery: query });
      
      expect(result.isValid).toBe(true);
      expect(result.mode).toBe("location");
      
      const finalData = (result as any).finalData;
      expect(finalData).toBeDefined();
      expect(finalData.name).toBe("Dallas, Texas");
      expect(finalData.canonicalName).toBe("Dallas, Texas");
      expect(finalData.coordinates.lat).toBeCloseTo(32.7767, 3);
      expect(finalData.coordinates.lng).toBeCloseTo(-96.7970, 3);
      expect(finalData.entityType).toBe("settlement");
    }
  });

  it('4. Multi-word city/state variants resolve consistently (Boston, San Francisco, Plano)', () => {
    expect(normalizeGeographicQuery("BOSTON MASSACHUSETTS")).toBe("boston, massachusetts");
    expect(normalizeGeographicQuery("boston, massachusetts")).toBe("boston, massachusetts");
    expect(normalizeGeographicQuery("SAN FRANCISCO CALIFORNIA")).toBe("san francisco, california");
    expect(normalizeGeographicQuery("san francisco ca")).toBe("san francisco, california");
    expect(normalizeGeographicQuery("PLANO TEXAS")).toBe("plano, texas");
    expect(normalizeGeographicQuery("plano tx")).toBe("plano, texas");

    expect(toCanonicalTitleCase("BOSTON MASSACHUSETTS")).toBe("Boston, Massachusetts");
    expect(toCanonicalTitleCase("san francisco ca")).toBe("San Francisco, California");
    expect(toCanonicalTitleCase("PLANO TEXAS")).toBe("Plano, Texas");
  });

  it('5. recoverLocationMetadata receives verified canonical identity data and passes it in the prompt', async () => {
    let capturedPrompt = '';
    vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
      capturedPrompt = params.contents;
      return {
        text: JSON.stringify({
          name: "Dallas, Texas",
          locationString: "Texas, United States",
          description: "Dallas is a major commercial and cultural hub in North Texas, serving as a center for telecommunications and commerce.",
          population: null,
          climate: {
            name: "Humid subtropical climate",
            description: "Hot summers and mild winters.",
            koppenCode: "Cfa"
          },
          contextNotes: ["Major transportation hub", "Established in the mid-19th century"],
          notable: [
            {
              title: "Dallas Arts District",
              description: "The largest contiguous urban arts district in the nation."
            }
          ]
        })
      } as any;
    });

    const recovered = await geminiService.recoverLocationMetadata(
      "Dallas, Texas",
      { lat: 32.7767, lng: -96.7970 },
      {
        canonicalName: "Dallas, Texas",
        entityType: "settlement",
        country: "United States",
        state: "Texas",
        city: "Dallas",
        identityStatus: "verified",
        originalQuery: "DALLAS TEXAS"
      }
    );

    expect(recovered).toBeDefined();
    const descText = typeof recovered?.description === 'string' ? recovered.description : (recovered?.description as any)?.text;
    expect(descText).toContain("Dallas is a major commercial");
    expect(capturedPrompt).toContain("You are enriching a VERIFIED geographic entity.");
    expect(capturedPrompt).toContain("Canonical entity:\n      Dallas, Texas");
    expect(capturedPrompt).toContain("Latitude:\n      32.7767");
    expect(capturedPrompt).toContain("Longitude:\n      -96.797");
    expect(capturedPrompt).toContain("State/region:\n      Texas");
    expect(capturedPrompt).toContain("Country:\n      United States");
    expect(capturedPrompt).toContain('The original user query "DALLAS TEXAS" is provided only for reference.');
    expect(capturedPrompt).toContain("Do not use information about similarly named cities, counties, regions, metropolitan areas");
  });

  it('6. toCanonicalTitleCase and normalizeLocationEntity correctly preserve and normalize English possessives and contractions', () => {
    // Correct casing preservation
    expect(toCanonicalTitleCase("Queen Anne's Revenge")).toBe("Queen Anne's Revenge");
    expect(toCanonicalTitleCase("King's Landing")).toBe("King's Landing");
    expect(toCanonicalTitleCase("St. Mary's")).toBe("St. Mary's");
    expect(toCanonicalTitleCase("Mary's Peak")).toBe("Mary's Peak");
    expect(toCanonicalTitleCase("Blackbeard's Ship")).toBe("Blackbeard's Ship");

    // Title-casing normalization from lowercase, all-caps, and corrupted possessive casings
    expect(toCanonicalTitleCase("queen anne's revenge")).toBe("Queen Anne's Revenge");
    expect(toCanonicalTitleCase("QUEEN ANNE'S REVENGE")).toBe("Queen Anne's Revenge");
    expect(toCanonicalTitleCase("Queen Anne'S Revenge")).toBe("Queen Anne's Revenge");
    expect(toCanonicalTitleCase("queen anne'S revenge")).toBe("Queen Anne's Revenge");
    expect(toCanonicalTitleCase("KING'S LANDING")).toBe("King's Landing");
    expect(toCanonicalTitleCase("King'S Landing")).toBe("King's Landing");
    expect(toCanonicalTitleCase("st. mary's")).toBe("St. Mary's");
    expect(toCanonicalTitleCase("mary's peak")).toBe("Mary's Peak");
    expect(toCanonicalTitleCase("Mary'S Peak")).toBe("Mary's Peak");
    expect(toCanonicalTitleCase("blackbeard's ship")).toBe("Blackbeard's Ship");
    expect(toCanonicalTitleCase("Blackbeard'S Ship")).toBe("Blackbeard's Ship");

    // normalizeLocationEntity test
    expect(geminiService.normalizeLocationEntity("Queen Anne's Revenge")).toBe("Queen Anne's Revenge");
    expect(geminiService.normalizeLocationEntity("Queen Anne'S Revenge")).toBe("Queen Anne's Revenge");
    expect(geminiService.normalizeLocationEntity("queen anne's revenge")).toBe("Queen Anne's Revenge");
    expect(geminiService.normalizeLocationEntity("Mary's Peak")).toBe("Mary's Peak");
    expect(geminiService.normalizeLocationEntity("Mary'S Peak")).toBe("Mary's Peak");
  });
});

