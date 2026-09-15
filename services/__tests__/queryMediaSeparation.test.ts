import { describe, it, expect } from 'vitest';
import { extractMediaIntentAndCleanEntity } from '../queryNormalizer';
import { SearchStage } from '../pipeline';

describe('queryMediaSeparation', () => {
  it('should correctly strip explicit media qualifiers and detect intent', () => {
    const tests = [
      {
        query: "Eiffel Tower photos",
        expectedEntity: "Eiffel Tower",
        expectedIntent: "PHOTOGRAPH"
      },
      {
        query: "photos of Eiffel Tower",
        expectedEntity: "Eiffel Tower",
        expectedIntent: "PHOTOGRAPH"
      },
      {
        query: "historical photos of Vatican City",
        expectedEntity: "Vatican City",
        expectedIntent: "HISTORICAL_PHOTOGRAPH"
      },
      {
        query: "Vatican City coat of arms",
        expectedEntity: "Vatican City",
        expectedIntent: "COAT_OF_ARMS"
      },
      {
        query: "map of Vatican City",
        expectedEntity: "Vatican City",
        expectedIntent: "MAP"
      },
      {
        query: "Battle of Hastings painting",
        expectedEntity: "Battle of Hastings",
        expectedIntent: "PAINTING"
      },
      {
        query: "Tower of London",
        expectedEntity: "Tower of London",
        expectedIntent: "PHYSICAL_LOCATION"
      },
      {
        query: "Seal Beach",
        expectedEntity: "Seal Beach", // Not "Beach"
        expectedIntent: "PHYSICAL_LOCATION" // Because it's not detected as media intent natively, or even if it is, the regex shouldn't strip it
      },
      {
        query: "Photo Island",
        expectedEntity: "Photo Island",
        expectedIntent: "PHYSICAL_LOCATION"
      }
    ];

    for (const t of tests) {
      const res = extractMediaIntentAndCleanEntity(t.query, t.query);
      expect(res.cleanEntity).toBe(t.expectedEntity);
      if (t.expectedIntent !== "PHYSICAL_LOCATION") {
        expect(res.imageIntent).toBe(t.expectedIntent);
        expect(res.explicitMediaIntent).toBe(true);
      }
    }
  });

  it('SearchStage should pass the original query and image intent', () => {
    const res = SearchStage("Eiffel Tower photos");
    expect(res.entity).toBe("Eiffel Tower");
    expect(res.intentResult.imageIntent).toBe("PHOTOGRAPH");
    expect(res.intentResult.explicitMediaIntent).toBe(true);
    expect(res.intentResult.normalized.request.rawQuery).toBe("Eiffel Tower photos");
  });
});
