import { describe, it, expect } from 'vitest';
import { cleanPastedArticleText } from '../sourceContentService';
import { getAuthoritativeEventModel } from '../geographic/historicalRouteRegistry';
import { parseAndExtract, IncrementalCandidateParser } from '../../utils/jsonParser';

describe('TRACE ROUTE Article Pipeline & Input Normalization', () => {
  describe('1. Clean Pasted Web Article Text', () => {
    it('strips web navigation boilerplate and extracts clean title and content', () => {
      const rawArticle = `Skip to content
Skip to site index
Section Navigation
Search

36 Hours: Lake Como
By Laura Rysman
Sept. 17, 2026

Villa del Balbianello in Lenno offers panoramic views of Lake Como.
Further north, Villa Carlotta in Tremezzo showcases neoclassical art and botanic gardens.
Across the lake, Varenna and Bellagio boast historic villas and waterfront promenades.`;

      const cleaned = cleanPastedArticleText(rawArticle);

      expect(cleaned.title).toBe('36 Hours: Lake Como');
      expect(cleaned.content).not.toContain('Skip to content');
      expect(cleaned.content).not.toContain('Skip to site index');
      expect(cleaned.content).not.toContain('Section Navigation');
      expect(cleaned.content).toContain('36 Hours: Lake Como');
      expect(cleaned.content).toContain('Villa del Balbianello');
      expect(cleaned.content).toContain('Villa Carlotta');
    });

    it('preserves clean text when no navigation headers are present', () => {
      const normalText = 'A Journey Through the Amalfi Coast\nVisiting Positano, Amalfi, and Ravello.';
      const cleaned = cleanPastedArticleText(normalText);
      expect(cleaned.title).toBe('A Journey Through the Amalfi Coast');
      expect(cleaned.content).toContain('Positano, Amalfi, and Ravello');
    });
  });

  describe('2. Historical Route Registry Null Safety', () => {
    it('handles undefined, null, and empty titles gracefully without throwing', () => {
      expect(getAuthoritativeEventModel(undefined as any)).toBeNull();
      expect(getAuthoritativeEventModel(null as any)).toBeNull();
      expect(getAuthoritativeEventModel('')).toBeNull();
      expect(getAuthoritativeEventModel('   ')).toBeNull();
    });

    it('returns event model for known authoritative event', () => {
      const model = getAuthoritativeEventModel('Trail of Tears');
      expect(model).not.toBeNull();
    });
  });

  describe('3. JSON Parser Truncation & Repair Recovery', () => {
    it('recovers valid waypoints from truncated JSON payload', () => {
      const truncatedJson = `
\`\`\`json
{
  "title": "36 Hours: Lake Como",
  "route": [
    { "name": "Villa del Balbianello", "lat": 45.9654, "lng": 9.2025, "sequence": 1 },
    { "name": "Villa Carlotta", "lat": 45.9861, "lng": 9.2294, "sequence": 2 },
    { "name": "Ponte della Civera", "lat": 45.9900, "lng": 9.2300, "sequence": 3
\`\`\``;

      const result = parseAndExtract(truncatedJson);
      expect(result.success).toBe(true);
      if (result.success) {
        const val = result.value as any;
        expect(val.route || val).toBeDefined();
        const route = val.route || val;
        expect(Array.isArray(route)).toBe(true);
        expect(route.length).toBeGreaterThanOrEqual(2);
        expect(route[0].name).toBe('Villa del Balbianello');
        expect(route[1].name).toBe('Villa Carlotta');
      }
    });

    it('parses complete JSON payload directly', () => {
      const validJson = JSON.stringify({
        title: 'Lake Como Tour',
        route: [
          { name: 'Villa del Balbianello', lat: 45.9654, lng: 9.2025, sequence: 1 },
          { name: 'Villa Carlotta', lat: 45.9861, lng: 9.2294, sequence: 2 }
        ]
      });

      const result = parseAndExtract(validJson);
      expect(result.success).toBe(true);
      if (result.success) {
        const val = result.value as any;
        expect(val.route.length).toBe(2);
      }
    });
  });

  describe('4. IncrementalCandidateParser Streaming Tests', () => {
    it('extracts candidates progressively as tokens arrive in chunks', () => {
      const parser = new IncrementalCandidateParser();

      // Chunk 1: Header and start of array
      const chunk1 = '{"title": "Lake Como", "route": [';
      const cands1 = parser.ingest(chunk1);
      expect(cands1.length).toBe(0);

      // Chunk 2: Candidate 1 arrives
      const chunk2 = '{"name": "Villa del Balbianello", "lat": 45.9654, "lng": 9.2025, "sequence": 1},';
      const cands2 = parser.ingest(chunk2);
      expect(cands2.length).toBe(1);
      expect(cands2[0].name).toBe('Villa del Balbianello');

      // Chunk 3: Half of Candidate 2
      const chunk3 = '{"name": "Villa Carlotta", "lat": 45.9861';
      const cands3 = parser.ingest(chunk3);
      expect(cands3.length).toBe(0);

      // Chunk 4: Rest of Candidate 2
      const chunk4 = ', "lng": 9.2294, "sequence": 2}';
      const cands4 = parser.ingest(chunk4);
      expect(cands4.length).toBe(1);
      expect(cands4[0].name).toBe('Villa Carlotta');

      // Chunk 5: Closing array
      const chunk5 = ']}';
      const cands5 = parser.ingest(chunk5);
      expect(cands5.length).toBe(0);

      expect(parser.getEmittedCount()).toBe(2);
    });

    it('handles braces inside quoted strings without breaking candidate boundaries', () => {
      const parser = new IncrementalCandidateParser();

      const chunk = `{"title": "Tour", "route": [
        {"name": "Test Place", "description": "Features a special {brace} note and \\"escaped quotes\\"", "lat": 45.0, "lng": 9.0},
        {"name": "Second Place", "lat": 46.0, "lng": 10.0}
      ]}`;

      const cands = parser.ingest(chunk);
      expect(cands.length).toBe(2);
      expect(cands[0].name).toBe('Test Place');
      expect(cands[0].description).toContain('{brace}');
      expect(cands[1].name).toBe('Second Place');
    });

    it('emits candidate exactly once and handles truncated final candidate gracefully', () => {
      const parser = new IncrementalCandidateParser();

      const chunk1 = '{"route": [{"name": "Complete 1", "lat": 1.0, "lng": 1.0}, {"name": "Incomplete 2", "lat": 2.0';
      const cands1 = parser.ingest(chunk1);
      expect(cands1.length).toBe(1);
      expect(cands1[0].name).toBe('Complete 1');

      // No more chunks arrive (stream cut off)
      const cands2 = parser.ingest('');
      expect(cands2.length).toBe(0);
      expect(parser.getEmittedCount()).toBe(1);
    });
  });
});
