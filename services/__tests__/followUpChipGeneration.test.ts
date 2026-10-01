import { describe, it, expect } from 'vitest';
import {
  generateContextualQuestionChips,
  generateContextualChips,
  isBroadOrRedundantQuestion,
  isGenericSectionHeading,
  classifyFollowUpIntent
} from '../followUpService';
import { LocationInfo } from '../../types';

describe('Follow-Up Chip Generation from Fact Content', () => {
  const christTheRedeemerLocation: LocationInfo = {
    id: 'loc-christ-redeemer',
    name: 'Christ the Redeemer, Rio de Janeiro, Brazil',
    entityType: 'monument',
    coordinates: { lat: -22.9519, lng: -43.2105 },
    description: 'Christ the Redeemer is an Art Deco statue of Jesus Christ overlooking Rio de Janeiro from the summit of Mount Corcovado in Tijuca National Park.',
    notable: [
      {
        title: 'Construction and Inauguration',
        description: 'The statue, designed by Paul Landowski and built by Heitor da Silva Costa, was constructed in France from 1922 to 1931 before being shipped to Rio de Janeiro for assembly.'
      },
      {
        title: 'Cultural Icon',
        description: 'As a symbol of Christianity and an iconic landmark of Rio de Janeiro, Cristo Redentor plays a crucial role in shaping the cultural identity and tourism industry of the city.'
      }
    ],
    climate: {
      name: 'Tropical savanna',
      description: 'Warm and humid with maritime breezes.'
    }
  };

  describe('1. Fact Content Extraction vs Section Headings', () => {
    it('generates questions from the actual factual content rather than section headings', () => {
      const chips = generateContextualQuestionChips(christTheRedeemerLocation);
      expect(chips.length).toBeGreaterThanOrEqual(3);
      expect(chips.length).toBeLessThanOrEqual(4);

      // Verify questions are about the actual subject and facts
      const combined = chips.join(' ');
      expect(combined).toMatch(/Christ the Redeemer|statue|France|Rio de Janeiro/i);

      // Verify specific content-based questions are present
      const hasDesignOrConstruction = chips.some(c =>
        c.includes('Who designed Christ the Redeemer?') ||
        c.includes('How was Christ the Redeemer constructed?') ||
        c.includes('Why was the statue constructed in France?')
      );
      expect(hasDesignOrConstruction).toBe(true);

      const hasCulturalOrImportance = chips.some(c =>
        c.includes('Why is Christ the Redeemer important to Rio de Janeiro?') ||
        c.includes('How did Christ the Redeemer become a cultural symbol?') ||
        c.includes('What is the religious significance of Christ the Redeemer?')
      );
      expect(hasCulturalOrImportance).toBe(true);
    });

    it('never uses section headings as question subjects or templates', () => {
      const chips = generateContextualQuestionChips(christTheRedeemerLocation);

      // Must NEVER contain mechanical heading interpolation
      for (const chip of chips) {
        expect(chip).not.toContain('Construction and Inauguration');
        expect(chip).not.toContain('Cultural Icon');
        expect(chip).not.toMatch(/How was Construction and Inauguration/i);
        expect(chip).not.toMatch(/What role did Cultural Icon/i);
        expect(chip).not.toMatch(/What role did Construction/i);
        expect(chip).not.toMatch(/Tell me about Cultural Icon/i);
        expect(chip).not.toMatch(/Tell me about Construction/i);
      }
    });

    it('correctly identifies generic section headings', () => {
      expect(isGenericSectionHeading('Construction and Inauguration')).toBe(true);
      expect(isGenericSectionHeading('Cultural Icon')).toBe(true);
      expect(isGenericSectionHeading('Architecture and Design')).toBe(true);
      expect(isGenericSectionHeading('Historical Significance')).toBe(true);
      expect(isGenericSectionHeading('Overview')).toBe(true);
      expect(isGenericSectionHeading('Highlights')).toBe(true);
      expect(isGenericSectionHeading('General Facts')).toBe(true);

      // Specific physical entities should not be considered generic section headings
      expect(isGenericSectionHeading('Templo Mayor')).toBe(false);
      expect(isGenericSectionHeading('Standard Mill')).toBe(false);
      expect(isGenericSectionHeading('National Palace')).toBe(false);
    });
  });

  describe('2. Malformed Questions & Capitalization Guards', () => {
    it('does not generate malformed questions caused by heading capitalization', () => {
      const locationWithVariedCasing: LocationInfo = {
        id: 'loc-eiffel',
        name: 'Eiffel Tower, Paris, France',
        entityType: 'monument',
        description: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris.',
        notable: [
          {
            title: 'ARCHITECTURE AND DESIGN',
            description: 'Designed by Gustave Eiffel and constructed from 1887 to 1889 as the entrance arch for the 1889 World Fair.'
          },
          {
            title: 'HISTORICAL SIGNIFICANCE',
            description: 'Initially criticized by artists, it became a global cultural icon of France.'
          }
        ]
      };

      const chips = generateContextualQuestionChips(locationWithVariedCasing);

      for (const chip of chips) {
        // No uppercase heading leakage
        expect(chip).not.toContain('ARCHITECTURE AND DESIGN');
        expect(chip).not.toContain('HISTORICAL SIGNIFICANCE');
        expect(chip).not.toContain('Architecture And Design');
        expect(chip).not.toContain('Historical Significance');
        // Questions should sound natural
        expect(chip.endsWith('?')).toBe(true);
      }

      const combined = chips.join(' ');
      expect(combined).toMatch(/Eiffel Tower|Gustave Eiffel|World's Fair|constructed/i);
    });
  });

  describe('3. Duplicate Chip Prevention', () => {
    it('prevents duplicate or near-duplicate chips across multiple sections', () => {
      const locationWithOverlappingFacts: LocationInfo = {
        id: 'loc-overlap',
        name: 'Taj Mahal, Agra, India',
        entityType: 'mausoleum',
        description: 'The Taj Mahal is an ivory-white marble mausoleum on the south bank of the Yamuna River in Agra.',
        notable: [
          {
            title: 'Construction',
            description: 'Commissioned in 1631 by Mughal emperor Shah Jahan and built using white marble.'
          },
          {
            title: 'Architecture',
            description: 'Constructed between 1632 and 1648, featuring white marble and semi-precious stone inlay.'
          }
        ]
      };

      const chips = generateContextualQuestionChips(locationWithOverlappingFacts);

      // Set of unique lowercase questions should equal array length
      const lowerChips = chips.map(c => c.toLowerCase());
      const uniqueChips = new Set(lowerChips);
      expect(uniqueChips.size).toBe(chips.length);
    });
  });

  describe('4. Insufficient Content Handling', () => {
    it('does not generate chips when there is no meaningful factual content', () => {
      const emptyLocation: LocationInfo = {
        id: 'loc-empty',
        name: 'Unknown Location',
        description: '',
        notable: []
      };

      const chips = generateContextualQuestionChips(emptyLocation);
      expect(chips).toEqual([]);
    });

    it('does not generate a chip merely because an empty subsection exists', () => {
      const locationWithEmptySections: LocationInfo = {
        id: 'loc-empty-sections',
        name: 'Minimal Marker',
        description: 'Brief text',
        notable: [
          { title: 'Overview', description: '' },
          { title: 'Cultural Icon', description: '   ' }
        ]
      };

      const chips = generateContextualQuestionChips(locationWithEmptySections);
      // Empty sections must not produce questions
      expect(chips.some(c => c.toLowerCase().includes('overview') || c.toLowerCase().includes('cultural icon'))).toBe(false);
    });
  });

  describe('5. Existing Chip Click and Follow-Up Functionality', () => {
    it('classifies generated chip clicks as FOLLOW_UP queries seamlessly', () => {
      const contextualChips = generateContextualChips(christTheRedeemerLocation);
      expect(contextualChips.length).toBeGreaterThan(0);

      for (const chip of contextualChips) {
        if (chip.type === 'question' && chip.query) {
          const classification = classifyFollowUpIntent(chip.query, christTheRedeemerLocation, false, true);
          expect(classification.intent).toBe('FOLLOW_UP');
        }
      }
    });

    it('preserves chip structure and query properties in generateContextualChips', () => {
      const chips = generateContextualChips(christTheRedeemerLocation, false);
      expect(chips.length).toBeGreaterThanOrEqual(3);

      chips.forEach((chip, idx) => {
        expect(chip.id).toBe(`q-${idx}`);
        expect(chip.type).toBe('question');
        expect(chip.label).toBe(chip.query);
        expect(chip.label.length).toBeGreaterThan(5);
        expect(chip.label.endsWith('?')).toBe(true);
      });
    });
  });
});
