import { describe, it, expect } from 'vitest';
import {
  generateContextualQuestionChips,
  generateContextualChips,
  isBroadOrRedundantQuestion
} from '../followUpService';
import { LocationInfo, Waypoint, FollowUpItem } from '../../types';
import { DEFAULT_SAVED_ROUTES } from '../../App';

describe('Replenished Contextual Follow-Up Suggestions', () => {
  const shackletonRoute = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-shackleton')!;
  const plymouthWp: Waypoint = shackletonRoute.waypoints![0];

  const basePlymouthLocation: LocationInfo = {
    id: plymouthWp.id,
    name: plymouthWp.name,
    entityType: 'city',
    coordinates: { lat: plymouthWp.lat, lng: plymouthWp.lng },
    description: plymouthWp.description,
    context: plymouthWp.context,
    routeTitle: 'Endurance Expedition',
    notable: [],
    followUps: []
  };

  it('Case 1: normal initial suggestions - returns normal number of suggestions with no previous followUps', () => {
    const chips = generateContextualChips(basePlymouthLocation, false);
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(chips.every(c => c.type === 'question' && c.label.length > 5)).toBe(true);
  });

  it('Case 2: one suggestion already asked - asked question is excluded and replaced seamlessly', () => {
    const initialChips = generateContextualChips(basePlymouthLocation, false);
    expect(initialChips.length).toBeGreaterThanOrEqual(3);

    const askedQuestion = initialChips[0].label;
    const locationWithOneAsked: LocationInfo = {
      ...basePlymouthLocation,
      followUps: [
        {
          id: 'fu-1',
          question: askedQuestion,
          answer: 'Answer to asked question.',
          createdAt: new Date().toISOString()
        }
      ]
    };

    const nextChips = generateContextualChips(locationWithOneAsked, false);
    // 1. Must still return normal number of suggestions (replenished!)
    expect(nextChips.length).toBeGreaterThanOrEqual(3);
    // 2. Must NOT include the question just asked
    expect(nextChips.some(c => c.label.toLowerCase() === askedQuestion.toLowerCase())).toBe(false);
  });

  it('Case 3: all initial suggestions already asked - generates replacement candidates rather than returning []', () => {
    const initialChips = generateContextualChips(basePlymouthLocation, false);
    const initialQuestions = initialChips.map(c => c.label);

    const locationWithAllInitialAsked: LocationInfo = {
      ...basePlymouthLocation,
      followUps: initialQuestions.map((q, idx) => ({
        id: `fu-${idx}`,
        question: q,
        answer: `Answer to question ${idx}.`,
        createdAt: new Date().toISOString()
      }))
    };

    const replenishedChips = generateContextualChips(locationWithAllInitialAsked, false);
    // Must NOT return empty array []
    expect(replenishedChips.length).toBeGreaterThanOrEqual(3);

    // None of the initial questions should appear in replenished chips
    for (const initQ of initialQuestions) {
      expect(replenishedChips.some(c => c.label.toLowerCase() === initQ.toLowerCase())).toBe(false);
    }
  });

  it('Case 4: repeated exhaustion - multiple rounds of asking suggestions never return previously asked questions', () => {
    let currentLocation: LocationInfo = { ...basePlymouthLocation, followUps: [] };
    const allAskedQuestions: string[] = [];

    // Simulate 3 successive rounds of user asking suggestions
    for (let round = 1; round <= 3; round++) {
      const currentChips = generateContextualChips(currentLocation, false);
      expect(currentChips.length).toBeGreaterThanOrEqual(3);

      // Pick the first chip and ask it
      const chosenChip = currentChips[0];
      allAskedQuestions.push(chosenChip.label);

      currentLocation = {
        ...currentLocation,
        followUps: [
          ...(currentLocation.followUps || []),
          {
            id: `fu-round-${round}`,
            question: chosenChip.label,
            answer: `Answer for round ${round}`,
            createdAt: new Date().toISOString()
          }
        ]
      };

      const subsequentChips = generateContextualChips(currentLocation, false);
      // Ensure NO previously asked question is ever returned
      for (const asked of allAskedQuestions) {
        expect(subsequentChips.some(c => c.label.toLowerCase() === asked.toLowerCase())).toBe(false);
      }
    }
  });

  it('Case 5: genuinely exhausted context - returns empty list cleanly when all possible unique questions are exhausted', () => {
    // Construct a sparse location with minimal context
    const sparseLocation: LocationInfo = {
      id: 'sparse-loc',
      name: 'Generic Island',
      description: 'A small remote island.',
      followUps: []
    };

    // First generate all questions it can produce
    const allPossibleQuestions: string[] = [];
    let currentLoc = { ...sparseLocation };

    for (let attempt = 0; attempt < 25; attempt++) {
      const questions = generateContextualQuestionChips(currentLoc);
      if (questions.length === 0) break;
      for (const q of questions) {
        if (!allPossibleQuestions.includes(q)) {
          allPossibleQuestions.push(q);
        }
      }
      currentLoc = {
        ...currentLoc,
        followUps: allPossibleQuestions.map((q, idx) => ({
          id: `fu-${idx}`,
          question: q,
          answer: `Answer ${idx}`,
          createdAt: new Date().toISOString()
        }))
      };
    }

    // When fully exhausted, generateContextualChips returns [] cleanly without infinite loop or crash
    const exhaustedChips = generateContextualChips(currentLoc, false);
    expect(Array.isArray(exhaustedChips)).toBe(true);
    expect(exhaustedChips.length).toBe(0);
  });
});
