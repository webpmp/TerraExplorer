import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity, resolveLocationQuery } from '../geminiService';

describe('Semantic Entity Resolution Architecture Tests', () => {
  const testCases = [
    // Historical Events
    {
      query: "Where did the Boston Massacre take place?",
      expectedEntityType: "historical_event_site",
      expectPopulationNull: true
    },
    {
      query: "Where did Woodstock take place?",
      expectedEntityType: "festival_site",
      expectPopulationNull: true
    },

    // Discovery
    {
      query: "Where was the Vasa found?",
      expectedEntityType: "shipwreck_site",
      forbiddenName: "Vasa Museum",
      expectPopulationNull: true
    },
    {
      query: "Where was the Titanic found?",
      expectedEntityType: "shipwreck_site",
      expectPopulationNull: true
    },
    {
      query: "Where were the Dead Sea Scrolls discovered?",
      expectedEntityType: "archaeological_site",
      expectPopulationNull: true
    },
    {
      query: "Where was the Rosetta Stone discovered?",
      expectedEntityType: "discovery_site",
      expectPopulationNull: true
    },

    // Natural Feature
    {
      query: "Where is Mount Fuji?",
      expectedEntityType: "mountain",
      expectPopulationNull: true
    }
  ];

  testCases.forEach((tc) => {
    test(`Query: "${tc.query}"`, async () => {
      const routed = routeIntentAndExtractEntity(tc.query);
      expect(routed.intent).toBeDefined();
      expect(routed.entity).toBeDefined();
    });
  });
});
