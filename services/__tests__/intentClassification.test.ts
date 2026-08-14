import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity } from '../geminiService';

describe('Intent Classification Regression Tests', () => {
  const testCases = [
    // Historical Event Queries
    { query: "Where did the eruption of Vesuvius take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "eruption of Vesuvius", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did the Boston Massacre take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Boston Massacre", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did Woodstock take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Woodstock", expectedMode: "MULTI_LOCATION_EXPLORATION" },
    { query: "Where did the Viking Age take place?", expectedIntent: "HISTORICAL_EVENT", expectedEntity: "Viking Age", expectedMode: "MULTI_LOCATION_EXPLORATION" },

    // Geographic Queries
    { query: "Where is Boston?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Boston", expectedMode: undefined },
    { query: "Where is Amsterdam?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Amsterdam", expectedMode: undefined },
    { query: "Where is Mount Fuji?", expectedIntent: "NATURAL_LOCATION", expectedEntity: "Mount Fuji", expectedMode: undefined }
  ];

  testCases.forEach((tc) => {
    test(`Query: "${tc.query}"`, () => {
      const res = routeIntentAndExtractEntity(tc.query);
      expect(res.intent).toBe(tc.expectedIntent);
      expect(res.entity.toLowerCase()).toBe(tc.expectedEntity.toLowerCase());
      expect(res.resolutionMode).toBe(tc.expectedMode);
    });
  });
});
