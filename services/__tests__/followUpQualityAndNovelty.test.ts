import { describe, it, expect, vi } from 'vitest';
import {
  generateContextualQuestionChips,
  isBroadOrRedundantQuestion,
  researchFollowUp
} from '../followUpService';
import { LocationInfo } from '../../types';
import * as geminiService from '../geminiService';

describe('Contextual Follow-Up Quality, Novelty & Delta-Oriented Research Suite', () => {
  const mexicoCityLocation: LocationInfo = {
    id: 'loc-mexico-city',
    name: 'Mexico City, Mexico',
    canonicalName: 'Mexico City',
    entityType: 'capital city',
    coordinates: { lat: 19.4326, lng: -99.1332 },
    description: 'Mexico City is the capital of Mexico and the most populous city in North America. Originally founded as Tenochtitlan on an island in Lake Texcoco by the Aztecs in 1325, it was redesigned following the 1521 Spanish conquest. It sits at an elevation of 2,240 meters in the high Valley of Mexico.',
    notable: [
      { title: 'Templo Mayor', description: 'Ancient Aztec temple complex excavated in the historic center.' },
      { title: 'National Palace', description: 'Seat of federal government featuring Diego Rivera murals.' },
      { title: 'Cultural Hub', description: 'World-renowned museums including the Museum of Anthropology.' }
    ],
    climate: {
      name: 'Subtropical highland',
      description: 'Mild temperatures year-round with distinct wet and dry seasons.'
    }
  };

  describe('1. Redundancy / Novelty Evaluation & Question Filtering', () => {
    it('rejects broad summary questions whose answers would primarily repeat the InfoPanel overview', () => {
      // Broad summary questions must be identified as redundant
      expect(isBroadOrRedundantQuestion('What is Mexico City best known for?', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('What is the history of Mexico City?', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('Tell me about its cultural heritage', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('Tell me about Cultural Hub', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('What notable landmarks are here?', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('What makes this location unique?', mexicoCityLocation)).toBe(true);
      expect(isBroadOrRedundantQuestion('Tell me about Mexico City', mexicoCityLocation)).toBe(true);
    });

    it('accepts specific, gap-oriented questions that explore unexpanded details', () => {
      // Specific questions that explore causes, landmarks, waterways, or developments are accepted
      expect(isBroadOrRedundantQuestion('What happened to Lake Texcoco?', mexicoCityLocation)).toBe(false);
      expect(isBroadOrRedundantQuestion('What can you see at Templo Mayor today?', mexicoCityLocation)).toBe(false);
      expect(isBroadOrRedundantQuestion('Why was Tenochtitlan built on an island?', mexicoCityLocation)).toBe(false);
      expect(isBroadOrRedundantQuestion('How did the Spanish conquest change the city?', mexicoCityLocation)).toBe(false);
      expect(isBroadOrRedundantQuestion('Why is the elevation of Mexico City significant?', mexicoCityLocation)).toBe(false);
      expect(isBroadOrRedundantQuestion('How did Aztec traditions influence modern Mexico City?', mexicoCityLocation)).toBe(false);
    });
  });

  describe('2. Follow-Up Question Generation for Information Opportunities & Gaps', () => {
    it('generates specific gap-oriented questions instead of broad summary questions for Mexico City', () => {
      const chips = generateContextualQuestionChips(mexicoCityLocation);
      expect(chips.length).toBeGreaterThanOrEqual(3);
      expect(chips.length).toBeLessThanOrEqual(4);

      // Must NOT contain broad summary requests
      expect(chips).not.toContain('What is Mexico City best known for?');
      expect(chips).not.toContain('What is the history of Mexico City?');
      expect(chips).not.toContain('Tell me about Cultural Hub');
      expect(chips).not.toContain('What notable landmarks are here?');

      // Must contain specific gap-oriented questions regarding Lake Texcoco, Tenochtitlan, Templo Mayor, etc.
      const combined = chips.join(' ');
      expect(combined).toMatch(/lake texcoco|tenochtitlan|templo mayor|spanish conquest|elevation|aztec/i);
    });

    it('generates complementary questions spanning diverse exploration dimensions rather than variations of one topic', () => {
      const chips = generateContextualQuestionChips(mexicoCityLocation);

      // Should contain at least 3 distinct question themes (waterways/origins, landmark ruins, historical change, etc.)
      const hasWaterOrOrigins = chips.some(c => /lake texcoco|tenochtitlan|island/i.test(c));
      const hasLandmark = chips.some(c => /templo mayor|palace|museum/i.test(c));
      const hasHistoryOrCulture = chips.some(c => /spanish conquest|traditions|elevation|rebuild/i.test(c));

      expect(hasWaterOrOrigins).toBe(true);
      expect(hasLandmark).toBe(true);
      expect(hasHistoryOrCulture).toBe(true);
    });
  });

  describe('3. Previously Explored Follow-Up History Tracking', () => {
    it('avoids immediately regenerating an already explored follow-up question or close variation', () => {
      const locationWithExploredQ: LocationInfo = {
        ...mexicoCityLocation,
        followUps: [
          {
            id: 'fu-texcoco-1',
            question: 'What happened to Lake Texcoco?',
            answer: 'Lake Texcoco was gradually drained by Spanish and Mexican engineers through canal and tunnel systems to control chronic flooding, leading to modern Mexico City ground subsidence.'
          }
        ]
      };

      // Direct check with redundancy helper
      expect(isBroadOrRedundantQuestion('What happened to Lake Texcoco?', locationWithExploredQ)).toBe(true);
      expect(isBroadOrRedundantQuestion('What happened to Lake Texcoco over time?', locationWithExploredQ)).toBe(true);

      // Generated chips should replace Lake Texcoco with another gap question
      const chips = generateContextualQuestionChips(locationWithExploredQ);
      expect(chips).not.toContain('What happened to Lake Texcoco?');
      expect(chips.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('4. Delta-Oriented Follow-Up Answer Generation', () => {
    it('passes existing InfoPanel summary, notable facts, and previous Q&As as known context with explicit delta instructions', async () => {
      let capturedPrompt = '';
      const spy = vi.spyOn(geminiService, 'generateContentWithRetry').mockImplementation(async (params: any) => {
        capturedPrompt = params.contents;
        return {
          text: JSON.stringify({
            answer: 'Beginning in the 17th century with the Huehuetoca drainage canal and culminating in the 1900 Gran Canal del Desagüe, Lake Texcoco was systematically drained to prevent catastrophic floods in the valley basin.'
          })
        };
      });

      const locationWithHistory: LocationInfo = {
        ...mexicoCityLocation,
        followUps: [
          {
            id: 'fu-prev-1',
            question: 'Why was Tenochtitlan built on an island?',
            answer: 'Aztec priests identified an eagle perched on a nopal cactus on the island in 1325 as the sacred sign from Huitzilopochtli.'
          }
        ]
      };

      const result = await researchFollowUp('What happened to Lake Texcoco?', locationWithHistory);

      expect(result.question).toBe('What happened to Lake Texcoco?');
      expect(result.answer).toContain('Huehuetoca drainage canal');

      // Verify the prompt contains existing content labeled as already read
      expect(capturedPrompt).toContain('CURRENT INFOPANEL CONTENT (ALREADY PRESENTED TO AND READ BY THE USER)');
      expect(capturedPrompt).toContain('Mexico City is the capital of Mexico and the most populous city in North America.');
      expect(capturedPrompt).toContain('Templo Mayor');
      expect(capturedPrompt).toContain('Previously Explored Questions & Answers (Already Shown)');
      expect(capturedPrompt).toContain('Why was Tenochtitlan built on an island?');

      // Verify explicit delta-oriented non-repetition instructions
      expect(capturedPrompt).toContain('CRITICAL INSTRUCTIONS FOR NON-REPETITIVE, DELTA-ORIENTED ANSWER');
      expect(capturedPrompt).toContain('Do NOT repeat or re-summarize that existing information');
      expect(capturedPrompt).toContain('Your answer must be DELTA-ORIENTED');

      spy.mockRestore();
    });
  });
});
