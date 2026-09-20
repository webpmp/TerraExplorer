import { describe, it, expect, vi } from 'vitest';
import { generateContextualQuestionChips, generateContextualChips } from '../../services/followUpService';
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

describe('Narration Guard & Identity Matching', () => {
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
