import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity } from '../geminiService';

describe('Discovery Intent Extraction Regression Tests', () => {
  const testCases = [
    { query: "Where was the Titanic found?", expectedIntent: "DISCOVERY_OBJECT_LOCATION", expectedEntity: "Titanic" },
    { query: "Where was the Vasa found?", expectedIntent: "DISCOVERY_OBJECT_LOCATION", expectedEntity: "Vasa" },
    { query: "Where was the Rosetta Stone discovered?", expectedIntent: "DISCOVERY_OBJECT_LOCATION", expectedEntity: "Rosetta Stone" },
    { query: "Where were the Dead Sea Scrolls discovered?", expectedIntent: "DISCOVERY_OBJECT_LOCATION", expectedEntity: "Dead Sea Scrolls" },
    
    // Real location names with discovery words that should stay NATURAL_LOCATION
    { query: "Where is the Discovery Museum?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Discovery Museum" },
    { query: "Where is the Recovery Monument?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Recovery Monument" }
  ];

  testCases.forEach((tc) => {
    test(`Query: "${tc.query}"`, () => {
      const res = routeIntentAndExtractEntity(tc.query);
      expect(res.intent).toBe(tc.expectedIntent);
      expect(res.entity.toLowerCase()).toBe(tc.expectedEntity.toLowerCase());
    });
  });
});
