import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity } from '../geminiService';
import { IntentStage, SearchRequest } from '../pipeline';

const testQueries = [
  "Where is Boston?",
  "Where is Mount Fuji?",
  "Where was the Titanic found?",
  "Where did the Boston Massacre take place?",
  "Where did the Gold Rush take place?",
  "Where were the Dead Sea Scrolls discovered?",
  "Where was the Vasa found?",
  "Show me the Dead Sea"
];

describe('Pipeline Parity Tests', () => {
  testQueries.forEach((query) => {
    test(`Query Parity for "${query}"`, () => {
      const oldExtracted = routeIntentAndExtractEntity(query);
      const request: SearchRequest = { rawQuery: query };
      const entityResult = IntentStage(request);

      expect(entityResult.intentResult.intent).toBe(oldExtracted.intent);
      expect(entityResult.entity).toBe(oldExtracted.entity);
    });
  });
});
