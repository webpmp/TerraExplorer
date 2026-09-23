import { describe, it, expect, vi } from 'vitest';
import { generateContextualQuestionChips, generateContextualChips, toSentenceCase } from '../../services/followUpService';
import { buildFullNarrationScript, buildFullNarrationUnits, chunkContentUnit } from '../../services/narrationProviders';
import { LocationInfo } from '../../types';

describe('Contextual Chips and News Generation', () => {
  const mockLocation: LocationInfo = {
    id: 'loc-1',
    name: 'Bodie, California',
    entityType: 'ghost town',
    description: 'Bodie is a historic ghost town in Mono County, California, known for its gold rush boom in the late 19th century.',
    notable: [
      { title: 'Standard Mill', description: 'Large stamping mill for processing gold ore.' },
      { title: 'Preserved State', description: 'Maintained in a state of arrested decay.' }
    ],
    climate: {
      name: 'Subarctic alpine',
      description: 'Harsh winters with heavy snowfall and dry winds.'
    },
    news: [
      {
        title: 'Historic Preservation Efforts Underway at Bodie',
        url: 'https://example.com/bodie-preservation',
        source: 'California Parks Journal'
      },
      {
        title: 'New Visitor Guidelines for Ghost Towns',
        url: 'https://example.com/visitor-guidelines',
        source: 'Travel Weekly'
      }
    ]
  };

  it('generates dynamic location-aware question chips from location attributes', () => {
    const questionChips = generateContextualQuestionChips(mockLocation);
    expect(questionChips.length).toBeGreaterThanOrEqual(3);
    expect(questionChips.length).toBeLessThanOrEqual(4);

    // Questions should reference Bodie, mining/decay/history, or climate
    const combined = questionChips.join(' ').toLowerCase();
    expect(combined).toMatch(/bodie|gold|mill|ghost town|decay|standard mill/i);
  });

  it('filters out already answered questions from question chips', () => {
    const locationWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: [
        {
          id: 'fu-1',
          question: 'What is the history of Bodie?',
          answer: 'Bodie was founded after William Bodey discovered gold in 1859.'
        }
      ]
    };
    const questionChips = generateContextualQuestionChips(locationWithFollowUps);
    expect(questionChips).not.toContain('What is the history of Bodie?');
  });

  it('generates READ: [Headline] chips following question chips when News is enabled', () => {
    const chips = generateContextualChips(mockLocation, true);
    const questionChips = chips.filter(c => c.type === 'question');
    const newsChips = chips.filter(c => c.type === 'news');

    expect(questionChips.length).toBeGreaterThanOrEqual(3);
    expect(newsChips.length).toBe(2);

    // Question chips appear first, followed by READ news chips
    expect(chips[0].type).toBe('question');
    expect(newsChips[0].label).toContain('READ: Historic Preservation Efforts Underway at Bodie');
    expect(newsChips[0].url).toBe('https://example.com/bodie-preservation');
    expect(newsChips[1].label).toContain('READ: New Visitor Guidelines for Ghost Towns');
  });

  it('omits READ: chips when showNews is false', () => {
    const chips = generateContextualChips(mockLocation, false);
    const newsChips = chips.filter(c => c.type === 'news');
    expect(newsChips.length).toBe(0);
  });

  it('omits news items with invalid or missing URLs', () => {
    const locWithBadNews: LocationInfo = {
      ...mockLocation,
      news: [
        { title: 'Article Without URL', url: '' },
        { title: 'Article With Valid URL', url: 'https://news.org/valid' }
      ]
    };
    const chips = generateContextualChips(locWithBadNews, true);
    const newsChips = chips.filter(c => c.type === 'news');
    expect(newsChips.length).toBe(1);
    expect(newsChips[0].label).toContain('READ: Article With Valid URL');
  });
});

describe('Multi-Section Narration Script Generation', () => {
  const mockInfo: LocationInfo = {
    id: 'loc-2',
    name: 'Kyoto',
    description: 'Kyoto was the imperial capital of Japan for over a millennium.',
    notable: [
      { title: 'Fushimi Inari-taisha', description: 'Famous for thousands of vermilion torii gates.' }
    ],
    climate: {
      name: 'Humid subtropical',
      description: 'Hot, humid summers and relatively cold winters with occasional snow.'
    },
    followUps: [
      {
        id: 'fu-1',
        question: 'Why did Kyoto escape bombing in WWII?',
        answer: 'Secretary of War Henry Stimson intervened because of its cultural significance.'
      }
    ],
    news: [
      {
        title: 'Kyoto Tourism Initiative Launched',
        url: 'https://example.com/kyoto-tourism'
      }
    ]
  };

  it('builds full narration script in strict InfoPanel section order without UI labels or headings', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: true, climate: true, explore: true, news: true },
      showNews: true,
      maxChars: 1000
    });

    const summaryIdx = script.indexOf('imperial capital');
    const notableIdx = script.indexOf('Famous for thousands of vermilion torii gates');
    const climateIdx = script.indexOf('Hot, humid summers');
    const exploreIdx = script.indexOf('Secretary of War Henry Stimson intervened');
    const newsIdx = script.indexOf('Kyoto Tourism Initiative Launched');

    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(notableIdx).toBeGreaterThan(summaryIdx);
    expect(climateIdx).toBeGreaterThan(notableIdx);
    expect(exploreIdx).toBeGreaterThan(climateIdx);
    expect(newsIdx).toBeGreaterThan(exploreIdx);

    // Structural labels and dynamic subsection headings must NOT be spoken
    expect(script).not.toContain('Notable facts:');
    expect(script).not.toContain('Climate:');
    expect(script).not.toContain('Recent news:');
    expect(script).not.toContain('Fushimi Inari-taisha:');
    expect(script).not.toContain('Why did Kyoto escape bombing');
  });

  it('respects individual narration content configuration toggles', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: false, climate: false, explore: true, news: false },
      showNews: true,
      maxChars: 1000
    });

    expect(script).toContain('imperial capital');
    expect(script).not.toContain('Famous for thousands of vermilion torii gates');
    expect(script).not.toContain('Hot, humid summers');
    expect(script).toContain('Secretary of War Henry Stimson intervened');
    expect(script).not.toContain('Kyoto Tourism Initiative Launched');
  });

  it('generates multi-section script containing summary, notable facts, and climate without headings', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: true, climate: true, explore: false, news: false },
      showNews: false,
      maxChars: 1000
    });

    expect(script).toContain('Kyoto was the imperial capital');
    expect(script).toContain('Famous for thousands of vermilion torii gates');
    expect(script).toContain('Hot, humid summers');
    expect(script).not.toContain('Notable facts:');
    expect(script).not.toContain('Climate:');
  });

  it('generates summary-only script when only summary is selected', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: false, climate: false, explore: false, news: false },
      showNews: false,
      maxChars: 1000
    });

    expect(script).toContain('Kyoto was the imperial capital');
    expect(script).not.toContain('Famous for thousands of vermilion torii gates');
    expect(script).not.toContain('Hot, humid summers');
    expect(script).not.toContain('Secretary of War Henry Stimson intervened');
    expect(script).not.toContain('Kyoto Tourism Initiative Launched');
  });

  it('includes explore follow-up answer content when present and enabled', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: false, climate: false, explore: true, news: false },
      showNews: false,
      maxChars: 1000
    });

    expect(script).toContain('Secretary of War Henry Stimson intervened because of its cultural significance');
    expect(script).not.toContain('Why did Kyoto escape bombing in WWII?');
  });

  it('includes news headlines when present and showNews is true', () => {
    const script = buildFullNarrationScript(mockInfo, {
      contentSettings: { summary: true, notable: false, climate: false, explore: false, news: true },
      showNews: true,
      maxChars: 1000
    });

    expect(script).toContain('Kyoto Tourism Initiative Launched');
    expect(script).not.toContain('Recent news:');
  });

  it('does NOT truncate multi-section combined narration when total length exceeds character limit', () => {
    const galapagosInfo: LocationInfo = {
      id: 'loc-galapagos',
      name: 'Galapagos Islands',
      description: 'The Galapagos Islands are a volcanic archipelago in the Pacific Ocean known for endemic species.',
      notable: [
        {
          title: 'Marine Iguanas',
          description: 'Marine iguanas are unique lizards that have adapted to forage for algae underwater.'
        },
        {
          title: 'Giant Tortoises',
          description: 'Giant tortoises are iconic reptiles that can live for over one hundred years in the wild.'
        }
      ],
      climate: {
        name: 'Equatorial maritime',
        description: 'The climate is characterized by warm sunny periods and cool misty seasons driven by ocean currents.'
      }
    };

    // Set maxChars per unit to 100
    const script = buildFullNarrationScript(galapagosInfo, {
      contentSettings: { summary: true, notable: true, climate: true, explore: false, news: false },
      showNews: false,
      maxChars: 100
    });

    // Total length of all 4 units combined exceeds 100 chars
    expect(script.length).toBeGreaterThan(200);
    // All sections are retained
    expect(script).toContain('volcanic archipelago');
    expect(script).toContain('unique lizards');
    expect(script).toContain('iconic reptiles');
    expect(script).toContain('ocean currents');
  });
});

describe('Content Unit Chunking & Sequential Execution', () => {
  it('chunks an individual content unit exceeding character limit into complete sentences', () => {
    const longUnit = 'First sentence of the unit. Second sentence of the unit. Third sentence of the unit. Fourth sentence of the unit.';
    const chunks = chunkContentUnit(longUnit, 60);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(65);
      expect(chunk).toMatch(/[.!?]$/);
    }
    expect(chunks.join(' ')).toBe(longUnit);
  });

  it('assembles all chunks of an individual unit sequentially before the next unit', () => {
    const multiUnitInfo: LocationInfo = {
      id: 'loc-test',
      name: 'Test Island',
      description: 'First sentence of summary. Second sentence of summary. Third sentence of summary.',
      notable: [
        { title: 'Fact One', description: 'Notable fact one description sentence.' }
      ]
    };

    const units = buildFullNarrationUnits(multiUnitInfo, {
      contentSettings: { summary: true, notable: true, climate: false, explore: false, news: false },
      maxChars: 40
    });

    // Summary is split into multiple summary chunks
    const summaryUnits = units.filter(u => u.section === 'SUMMARY');
    const notableUnits = units.filter(u => u.section === 'NOTABLE');

    expect(summaryUnits.length).toBeGreaterThanOrEqual(2);
    expect(notableUnits.length).toBe(1);

    // Summary chunks appear first, followed by notable unit
    expect(units[0].section).toBe('SUMMARY');
    expect(units[1].section).toBe('SUMMARY');
    expect(units[units.length - 1].section).toBe('NOTABLE');
  });
});

describe('Narration Content vs UI Labels & Headings (Andoas Case)', () => {
  const andoasLocation: LocationInfo = {
    id: 'loc-andoas',
    name: 'Andoas',
    description: 'Andoas is a small town in the northern Peruvian Amazon along the Pastaza River.',
    notable: [
      {
        title: 'Carbon Sink',
        description: 'The rainforest acts as an essential carbon sink, absorbing significant amounts of CO2 from the atmosphere and playing a key role in climate regulation.'
      },
      {
        title: 'Biodiversity Hub',
        description: 'Andoas is home to thousands of species, many of which are endemic and face threats due to deforestation and habitat loss.'
      }
    ],
    climate: {
      name: 'Tropical Rain Forest Climate (Af)',
      description: 'The climate in Andoas is characterized by year-round high temperatures, heavy rainfall, and high humidity. The average annual temperature hovers around 26°C, with little variation throughout the year. Precipitation is abundant, occurring almost daily, which supports the lush vegetation of the rainforest.'
    },
    followUps: [
      {
        id: 'fu-andoas-1',
        question: 'What indigenous communities live near Andoas?',
        answer: 'The Achuar and Kichwa indigenous peoples have inhabited the Pastaza River basin for generations.'
      }
    ]
  };

  it('narrates descriptive content without UI section labels, category names, or subsection headings', () => {
    const script = buildFullNarrationScript(andoasLocation, {
      contentSettings: { summary: true, notable: true, climate: true, explore: true, news: true },
      showNews: true,
      maxChars: 2000
    });

    // 1. NOTABLE FACTS is not present
    expect(script).not.toMatch(/notable facts/i);

    // 2. CLIMATE section label is not present
    expect(script).not.toMatch(/climate:/i);

    // 3. EXPLORE section label is not present
    expect(script).not.toMatch(/explore:/i);

    // 4. Dynamic subsection headings are not present
    expect(script).not.toContain('Carbon Sink');
    expect(script).not.toContain('Biodiversity Hub');
    expect(script).not.toContain('Tropical Rain Forest Climate (Af)');
    expect(script).not.toContain('What indigenous communities live near Andoas?');

    // 5. The descriptive text beneath each heading IS included
    expect(script).toContain('The rainforest acts as an essential carbon sink, absorbing significant amounts of CO2');
    expect(script).toContain('Andoas is home to thousands of species, many of which are endemic');
    expect(script).toContain('The climate in Andoas is characterized by year-round high temperatures, heavy rainfall');
    expect(script).toContain('The Achuar and Kichwa indigenous peoples have inhabited');

    // 6. Multiple Notable Facts are still narrated sequentially
    const fact1Idx = script.indexOf('absorbing significant amounts of CO2');
    const fact2Idx = script.indexOf('home to thousands of species');
    expect(fact1Idx).toBeGreaterThanOrEqual(0);
    expect(fact2Idx).toBeGreaterThan(fact1Idx);

    // 7. Climate content follows the Notable Facts content
    const climateIdx = script.indexOf('characterized by year-round high temperatures');
    expect(climateIdx).toBeGreaterThan(fact2Idx);

    // 8. Follow-up answer follows climate content
    const exploreIdx = script.indexOf('Achuar and Kichwa');
    expect(exploreIdx).toBeGreaterThan(climateIdx);
  });
});

const evaluateGuard = (
  activeNarration: { selectionId: string; narrativeKey?: string; spoken: boolean } | null,
  selectionId: string,
  narrativeKey: string
) => {
  const isDuplicate = Boolean(
    activeNarration &&
    activeNarration.selectionId === selectionId &&
    activeNarration.narrativeKey === narrativeKey
  );
  return isDuplicate ? 'DUPLICATE_BLOCKED' : 'ALLOW_NEW_NARRATION';
};

describe('Narration Guard & Identity Matching', () => {

  const title = 'Kyoto';
  const summaryScript = 'Kyoto was the imperial capital of Japan for over a millennium.';
  const multiSectionScript = 'Kyoto was the imperial capital of Japan for over a millennium. Famous for thousands of vermilion torii gates. Hot, humid summers and relatively cold winters with occasional snow.';

  const summaryKey = `${title.toLowerCase().trim()}::${summaryScript.trim()}`;
  const multiSectionKey = `${title.toLowerCase().trim()}::${multiSectionScript.trim()}`;

  it('blocks exact duplicate narrativeKey for the same selectionId', () => {
    const active = { selectionId: 'loc-kyoto', narrativeKey: multiSectionKey, spoken: true };
    const decision = evaluateGuard(active, 'loc-kyoto', multiSectionKey);
    expect(decision).toBe('DUPLICATE_BLOCKED');
  });

  it('allows multi-section narration when only summary was previously spoken for the same selectionId', () => {
    const active = { selectionId: 'loc-kyoto', narrativeKey: summaryKey, spoken: true };
    const decision = evaluateGuard(active, 'loc-kyoto', multiSectionKey);
    expect(decision).toBe('ALLOW_NEW_NARRATION');
  });

  it('allows new narration when category settings or content change produce a different key', () => {
    const modifiedScript = 'Kyoto was the imperial capital of Japan for over a millennium. Hot, humid summers and relatively cold winters with occasional snow.';
    const modifiedKey = `${title.toLowerCase().trim()}::${modifiedScript.trim()}`;

    const active = { selectionId: 'loc-kyoto', narrativeKey: multiSectionKey, spoken: true };
    const decision = evaluateGuard(active, 'loc-kyoto', modifiedKey);
    expect(decision).toBe('ALLOW_NEW_NARRATION');
  });

  it('allows narration when selectionId changes even if narrativeKey is similar', () => {
    const active = { selectionId: 'loc-old', narrativeKey: summaryKey, spoken: true };
    const decision = evaluateGuard(active, 'loc-kyoto', summaryKey);
    expect(decision).toBe('ALLOW_NEW_NARRATION');
  });
});

describe('Sentence Case Formatting for Follow-Up Questions', () => {
  it('converts all-lowercase questions to Sentence Case', () => {
    expect(toSentenceCase('when was it built?')).toBe('When was it built?');
    expect(toSentenceCase('what happened after the battle?')).toBe('What happened after the battle?');
  });

  it('converts ALL-CAPS questions to Sentence Case', () => {
    expect(toSentenceCase('WHEN WAS IT BUILT?')).toBe('When was it built?');
    expect(toSentenceCase('WHAT HAPPENED AFTER THE BATTLE?')).toBe('What happened after the battle?');
  });

  it('preserves already capitalized questions', () => {
    expect(toSentenceCase('Who designed the building?')).toBe('Who designed the building?');
  });

  it('preserves proper nouns and internal casing when not all-caps', () => {
    expect(toSentenceCase('who is Mary Queen of Scots?')).toBe('Who is Mary Queen of Scots?');
    expect(toSentenceCase('where is the Eiffel Tower?')).toBe('Where is the Eiffel Tower?');
  });

  it('preserves punctuation and trims whitespace properly', () => {
    expect(toSentenceCase('  how did it survive?  ')).toBe('How did it survive?');
    expect(toSentenceCase('')).toBe('');
  });
});

describe('Incremental Explore Follow-Up Narration', () => {
  it('chunks long follow-up answer independently using per-content-unit limits', () => {
    const longAnswer = 'The fortress was established in the 12th century by Norman settlers. It withstood multiple sieges during the regional wars of succession. In modern times it serves as a prominent heritage museum with thousands of visitors annually.';
    const chunks = chunkContentUnit(longAnswer, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(105);
      expect(chunk).toMatch(/[.!?]$/);
    }
  });

  it('generates distinct explore narrativeKey that does not collide with location summary', () => {
    const locationKey = 'bodie::Bodie is a historic gold mining ghost town...';
    const exploreFollowUp = {
      id: 'fu-123',
      question: 'Why was it abandoned?',
      answer: 'The decline of mining profits led to its abandonment.'
    };
    const exploreKey = `explore::${exploreFollowUp.id}::${exploreFollowUp.answer}`;

    expect(exploreKey).not.toBe(locationKey);
    expect(exploreKey.startsWith('explore::fu-123')).toBe(true);
  });
});

describe('Follow-Up Narration Speech and Content Validation', () => {
  it('buildNarrationScript formats answer-only when title is empty', async () => {
    const { NarrationService } = await import('../../services/narrationService');
    const service = NarrationService.getInstance();
    const question = 'When and why did it sink?';
    const answer = 'The submarine sank in 1904 after colliding with a training vessel during nighttime naval exercises.';

    // When title is empty (the required follow-up narration contract), script is purely the answer
    const script = service.buildNarrationScript('', answer);
    expect(script).toBe(answer);
    expect(script).not.toContain(question);
  });

  it('speakStructured accepts answer-only narration with empty title and invokes active provider', async () => {
    const { NarrationService } = await import('../../services/narrationService');
    const service = NarrationService.getInstance();
    const answer = 'The submarine sank in 1904 after colliding with a training vessel.';

    const speakSpy = vi.spyOn(service as any, 'speak');
    service.speakStructured({
      title: '',
      description: answer,
      waypointId: 'fu-submarine-1'
    });

    expect(speakSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '',
      description: answer,
      waypointId: 'fu-submarine-1'
    }));
    speakSpy.mockRestore();
  });

  it('speakStructured silently rejects empty or short answer (< 3 characters)', async () => {
    const { NarrationService } = await import('../../services/narrationService');
    const service = NarrationService.getInstance();
    const speakSpy = vi.spyOn(service as any, 'speak');

    service.speakStructured({
      title: '',
      description: '',
      waypointId: 'fu-empty'
    });
    service.speakStructured({
      title: '',
      description: 'ok',
      waypointId: 'fu-short'
    });

    expect(speakSpy).not.toHaveBeenCalled();
    speakSpy.mockRestore();
  });

  it('preserves initial location narration with both title and description', async () => {
    const { NarrationService } = await import('../../services/narrationService');
    const service = NarrationService.getInstance();
    const title = 'Salem, Massachusetts';
    const description = 'Historic coastal city in Essex County, famous for the 1692 witch trials.';

    const script = service.buildNarrationScript(title, description);
    expect(script).toBe(`${title}. ${description}`);

    const speakSpy = vi.spyOn(service as any, 'speak');
    service.speakStructured({
      title,
      description,
      waypointId: 'loc-salem'
    });

    expect(speakSpy).toHaveBeenCalledWith(expect.objectContaining({
      title,
      description,
      waypointId: 'loc-salem'
    }));
    speakSpy.mockRestore();
  });

  it('evaluates follow-up duplicate guard and ensures sequential follow-ups narrate distinctly', () => {
    const activeGuard: { selectionId: string; narrativeKey: string; spoken: boolean } = {
      selectionId: 'loc-1',
      narrativeKey: 'bodie::Bodie is a historic ghost town...',
      spoken: true
    };

    const fu1 = { id: 'fu-1', question: 'When was gold discovered?', answer: 'Gold was discovered in 1859 by William Bodey.' };
    const fu1Key = `explore::${fu1.id}::${fu1.answer}`;

    // 1st follow-up is allowed because its key differs from the initial location key
    const decision1 = evaluateGuard(activeGuard, 'loc-1', fu1Key);
    expect(decision1).toBe('ALLOW_NEW_NARRATION');

    // After 1st follow-up is spoken, exact re-trigger is blocked
    activeGuard.narrativeKey = fu1Key;
    const retriggerDecision = evaluateGuard(activeGuard, 'loc-1', fu1Key);
    expect(retriggerDecision).toBe('DUPLICATE_BLOCKED');

    // 2nd sequential follow-up has distinct id and answer, so it is allowed
    const fu2 = { id: 'fu-2', question: 'Why was it abandoned?', answer: 'The mining boom declined rapidly by the early 20th century.' };
    const fu2Key = `explore::${fu2.id}::${fu2.answer}`;
    const decision2 = evaluateGuard(activeGuard, 'loc-1', fu2Key);
    expect(decision2).toBe('ALLOW_NEW_NARRATION');
  });
});
