import { describe, it, expect } from 'vitest';
import {
  filterAdditiveContextNotes,
  filterAdditiveNotableFacts,
  isFactSubsumedByText,
  pruneRedundantFactContent
} from '../../utils/notableFactsUtils';
import { sanitizeLocationInfo } from '../geminiService';
import { buildFullNarrationUnits, buildFullNarrationScript } from '../narrationProviders';

describe('Metadata Additive Enrichment Pipeline', () => {
  describe('Semantic Deduplication Helpers', () => {
    it('detects paraphrased materials as subsumed', () => {
      const description = 'The colossal statue stands 30 meters tall and was constructed from reinforced concrete clad in soapstone tiles.';
      const candidate1 = 'Made of concrete and soapstone.';
      const candidate2 = 'Built with reinforced concrete and soapstone.';

      expect(isFactSubsumedByText(candidate1, [description])).toBe(true);
      expect(isFactSubsumedByText(candidate2, [description])).toBe(true);
    });

    it('detects paraphrased inauguration dates as subsumed', () => {
      const description = 'Inaugurated on October 12, 1931, the monument overlooks the city of Rio de Janeiro.';
      const candidate = 'The statue was officially inaugurated on October 12, 1931.';

      expect(isFactSubsumedByText(candidate, [description])).toBe(true);
    });

    it('detects construction timeframes as subsumed', () => {
      const description = 'Created by French sculptor Paul Landowski and built between 1922 and 1931 by Brazilian engineer Heitor da Silva Costa.';
      const candidate = 'The monument was constructed in France from 1922 to 1931.';

      expect(isFactSubsumedByText(candidate, [description])).toBe(true);
    });

    it('prunes redundant preamble while retaining genuinely novel factual clauses', () => {
      const description = 'Constructed between 1922 and 1931 atop Mount Corcovado in Rio de Janeiro, the statue was designed by Paul Landowski.';
      const candidate = 'Built between 1922 and 1931, the statue weighs approximately 635 metric tons with arms spanning 28 meters.';

      const pruned = pruneRedundantFactContent(candidate, [description]);
      expect(pruned).not.toBeNull();
      expect(pruned?.description).toContain('635 metric tons');
      expect(pruned?.description).toContain('28 meters');
      expect(pruned?.description).not.toMatch(/^Built between 1922 and 1931/i);
    });
  });

  describe('ContextNotes Deduplication against Description', () => {
    it('removes context notes that repeat facts already established in the description', () => {
      const description = 'Christ the Redeemer is an Art Deco statue of Jesus Christ in Rio de Janeiro, Brazil. Created by French sculptor Paul Landowski and built by Brazilian engineer Heitor da Silva Costa between 1922 and 1931, it was inaugurated on October 12, 1931. The monument stands 30 meters tall atop Mount Corcovado and is constructed of reinforced concrete clad in soapstone tiles.';

      const contextNotes = [
        'The statue, designed by Paul Landowski and built by Heitor da Silva Costa, was constructed in France from 1922 to 1931 before being shipped to Rio de Janeiro for assembly.',
        'It was officially inaugurated on October 12, 1931 atop Mount Corcovado.',
        'The right arm points to south Rio de Janeiro and the left arm points to north Rio de Janeiro.',
        'A chapel dedicated to Our Lady of Aparecida is located in the base of the pedestal.'
      ];

      const filteredNotes = filterAdditiveContextNotes(contextNotes, [description]);

      // Inauguration note and redundant construction note should be filtered/pruned
      expect(filteredNotes.some((n: string) => n.includes('inaugurated on October 12, 1931'))).toBe(false);
      // Genuinely novel contextual facts should remain
      expect(filteredNotes.some((n: string) => n.includes('Our Lady of Aparecida') || n.includes('pedestal'))).toBe(true);
      expect(filteredNotes.some((n: string) => n.includes('right arm') || n.includes('shipped to Rio'))).toBe(true);
    });
  });

  describe('Notable Facts Deduplication against Description and ContextNotes', () => {
    it('removes notable facts that repeat materials, dates, or concepts already covered in description or contextNotes', () => {
      const description = 'Christ the Redeemer is a 30-meter Art Deco statue atop Corcovado mountain in Rio de Janeiro, built from reinforced concrete and soapstone tiles, inaugurated in October 1931.';
      const contextNotes = [
        'The arms stretch 28 meters wide and weigh approximately 635 metric tons.'
      ];

      const notableFacts = [
        {
          title: 'Materials and Composition',
          description: 'Constructed from reinforced concrete and soapstone to withstand harsh weather.'
        },
        {
          title: 'Dimensions and Weight',
          description: 'The statue has an arm span of 28 meters and weighs 635 metric tons.'
        },
        {
          title: 'UNESCO World Heritage',
          description: 'In 2007, it was voted one of the New Seven Wonders of the World.'
        }
      ];

      const filteredNotable = filterAdditiveNotableFacts(notableFacts, [description, ...contextNotes]);

      // Materials and Dimensions are already in description & contextNotes
      expect(filteredNotable.some((f: any) => f.title === 'Materials and Composition')).toBe(false);
      expect(filteredNotable.some((f: any) => f.title === 'Dimensions and Weight')).toBe(false);

      // UNESCO / New Seven Wonders is novel and must be retained
      expect(filteredNotable.some((f: any) => f.title === 'UNESCO World Heritage')).toBe(true);
    });
  });

  describe('Full Enrichment Pipeline: Christ the Redeemer Scenario', () => {
    it('produces strictly additive, non-repetitive metadata through sanitizeLocationData', () => {
      const rawLocationData: any = {
        name: 'Christ the Redeemer',
        locationString: 'Rio de Janeiro, Brazil',
        entityType: 'monument',
        description: 'Christ the Redeemer is a colossal Art Deco statue of Jesus Christ atop Corcovado Mountain in Rio de Janeiro, Brazil. Designed by French sculptor Paul Landowski and built by Brazilian engineer Heitor da Silva Costa between 1922 and 1931, the monument stands 30 meters tall with an 8-meter pedestal and was inaugurated on October 12, 1931. Made of reinforced concrete clad in triangular soapstone tiles, it is a global symbol of Christianity and part of the UNESCO World Heritage site.',
        contextNotes: [
          'The statue, designed by Paul Landowski and built by Heitor da Silva Costa, was constructed in France from 1922 to 1931.',
          'Inauguration occurred on October 12, 1931.',
          'A chapel consecrated to Our Lady of Aparecida resides beneath the pedestal, hosting baptisms and weddings.'
        ],
        notable: [
          {
            title: 'Construction and Inauguration',
            description: 'Built between 1922 and 1931 out of reinforced concrete and soapstone.'
          },
          {
            title: 'Physical Dimensions',
            description: 'The statue weighs 635 metric tons with an arm span of 28 meters.'
          },
          {
            title: 'Global Recognition',
            description: 'Named one of the New Seven Wonders of the World in 2007 by an international survey.'
          }
        ]
      };

      const sanitized = sanitizeLocationInfo(rawLocationData);

      // Verify description remains intact
      expect(sanitized.description).toContain('Art Deco statue');
      expect(sanitized.description).toContain('Paul Landowski');

      // Verify contextNotes did not duplicate inauguration
      expect(sanitized.contextNotes.some((n: string) => n.toLowerCase().includes('inauguration occurred on october 12, 1931'))).toBe(false);
      expect(sanitized.contextNotes.some((n: string) => n.includes('Our Lady of Aparecida'))).toBe(true);

      // Verify notable facts did not duplicate construction/materials
      expect(sanitized.notable.some((f: any) => f.title === 'Construction and Inauguration')).toBe(false);
      // Genuinely novel physical dimensions (635 tons / 28m) and 2007 honor must be preserved
      expect(sanitized.notable.some((f: any) => f.title === 'Physical Dimensions' || f.description.includes('635 metric tons'))).toBe(true);
      expect(sanitized.notable.some((f: any) => f.title === 'Global Recognition' || f.description.includes('New Seven Wonders'))).toBe(true);
    });
  });

  describe('Narration Fact Isolation', () => {
    it('does not re-narrate facts in NOTABLE section if they were spoken in SUMMARY', () => {
      const info = {
        name: 'Christ the Redeemer',
        description: 'Christ the Redeemer is a 30-meter Art Deco statue atop Corcovado Mountain in Rio de Janeiro, built between 1922 and 1931 from reinforced concrete and soapstone.',
        contextNotes: [
          'A chapel dedicated to Our Lady of Aparecida is located inside the pedestal.'
        ],
        notable: [
          {
            title: 'Materials and Composition',
            description: 'Constructed using reinforced concrete and soapstone tiles.'
          },
          {
            title: 'Physical Stature',
            description: 'The statue weighs 635 metric tons with an arm span of 28 meters.'
          }
        ]
      };

      const units = buildFullNarrationUnits(info);
      const summaryUnits = units.filter((u) => u.section === 'SUMMARY');
      const notableUnits = units.filter((u) => u.section === 'NOTABLE');

      expect(summaryUnits.length).toBeGreaterThan(0);
      // Materials should not be in NOTABLE because it was in SUMMARY
      expect(notableUnits.some((u) => u.text.toLowerCase().includes('reinforced concrete and soapstone'))).toBe(false);
      // Novel physical stature (weight/span) should be in NOTABLE
      expect(notableUnits.some((u) => u.text.includes('635 metric tons') || u.text.includes('28 meters'))).toBe(true);

      const script = buildFullNarrationScript(info);
      // Ensure soapstone/concrete occurs only once in the entire spoken script
      const matches = script.match(/soapstone/gi);
      expect(matches?.length).toBe(1);
    });
  });
});
