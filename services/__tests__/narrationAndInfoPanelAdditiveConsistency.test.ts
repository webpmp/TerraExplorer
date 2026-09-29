import { describe, it, expect } from 'vitest';
import { buildFullNarrationUnits } from '../narrationProviders';
import { filterAdditiveNotableFacts, isFactSubsumedByText } from '../../utils/notableFactsUtils';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';
import { LocationInfo, LocationType } from '../../types';

describe('Narration & InfoPanel Additive Consistency Suite', () => {
  describe('1. Narration Single Source of Truth with Finalized Search/Enrichment Data', () => {
    it('ensures narration SUMMARY consumes finalized canonical narrative instead of intermediate/stale text', () => {
      // Simulating the Atocha shipwreck scenario:
      // Early raw LLM response incorrectly guessed Bahamas, but pipeline metadata recovery
      // and canonical resolution finalized the location to Stock Island, Florida.
      const finalizedLocationInfo: LocationInfo = {
        name: 'SS Atocha Wreck Site',
        locationString: 'Stock Island, Florida, United States',
        type: LocationType.Historical,
        coordinates: { lat: 24.5069, lng: -81.7603 },
        description: 'The Nuestra Señora de Atocha wreck site is an internationally famous Spanish galleon shipwreck located in the waters off the Florida Keys. The galleon sank during a hurricane in 1622 while carrying vast treasures destined for Spain.',
        contextNotes: [
          'Sank during the 1622 Tierra Firme fleet disaster off the Florida coast.',
          'Located within the Florida Keys National Marine Sanctuary maritime heritage area.'
        ],
        notable: [
          {
            title: 'Wreck Discovery',
            description: 'In 1985, treasure hunter Mel Fisher discovered the wreck of the Nuestra Señora de Atocha after searching for sixteen years.'
          },
          {
            title: 'Cargo Value',
            description: 'The salvaged cargo yielded over $400 million in gold, silver bullion, and Colombian emeralds.'
          },
          {
            title: 'Artifacts Preserved',
            description: 'Notable recovered artifacts include solid silver tableware, astrolabes, and elaborate gold jewelry now preserved in Key West museums.'
          }
        ]
      };

      // 1. InfoPanel narrative resolver verifies authoritative text
      const canonicalNarrative = resolveCanonicalNarrative(finalizedLocationInfo);
      expect(canonicalNarrative.narrativeText).toContain('Florida Keys');
      expect(canonicalNarrative.narrativeText).not.toContain('Bahamas');

      // 2. Narration units MUST use the exact same finalized narrative
      const units = buildFullNarrationUnits(finalizedLocationInfo);
      const summaryUnit = units.find(u => u.section === 'SUMMARY');
      expect(summaryUnit).toBeDefined();
      expect(summaryUnit?.text).toContain('Florida Keys');
      expect(summaryUnit?.text).not.toContain('Bahamas');

      // 3. Narration NOTABLE units must filter out redundant summary facts and retain novel additive facts
      const notableUnits = units.filter(u => u.section === 'NOTABLE');
      const notableTexts = notableUnits.map(u => u.text).join(' ');
      expect(notableTexts).toContain('$400 million');
      expect(notableTexts).toContain('silver tableware');
    });
  });

  describe('2. Additive Notable Facts Filtering and Deduplication', () => {
    it('detects when a notable fact repeats or is substantially subsumed by the description narrative', () => {
      const description = 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. Constructed in 1889 as the centerpiece of the 1889 World Fair, it was designed by Gustave Eiffel.';

      // Redundant fact that restates description
      const redundantFact = 'The Eiffel Tower was built in 1889 for the World Fair in Paris by Gustave Eiffel.';
      expect(isFactSubsumedByText(redundantFact, description)).toBe(true);

      // Novel additive fact with distinct numbers and specifics
      const additiveFact = 'The tower stands 330 meters tall and required 18,038 individual pieces of puddle iron joined by 2.5 million rivets.';
      expect(isFactSubsumedByText(additiveFact, description)).toBe(false);
    });

    it('filters out redundant facts while preserving distinct additive details across sections', () => {
      const narrativeDescription = 'The Nuestra Señora de Atocha was a Spanish treasure galleon that sank in a hurricane in 1622 off the Florida Keys. The ship was heavily laden with silver, gold, and gems from the Americas.';
      const contextNote = 'Discovered by treasure salvor Mel Fisher in July 1985 after a 16-year search.';

      const candidateNotableFacts = [
        // Duplicate 1: repeats description narrative
        {
          title: 'Spanish Galleon Sinking',
          description: 'The Nuestra Señora de Atocha was a Spanish galleon heavily laden with silver and gold that sank during a hurricane in 1622 off the Florida Keys.'
        },
        // Duplicate 2: repeats context note almost verbatim
        {
          title: 'Discovery by Mel Fisher',
          description: 'Treasure salvor Mel Fisher discovered the wreck in July 1985 after searching for 16 years.'
        },
        // Additive 1: specific treasure value & quantity (novel numbers/artifacts)
        {
          title: 'Immense Treasure',
          description: 'Salvaged cargo included over 40 tons of silver bars, 114,000 Spanish silver coins, and thousands of Colombian emeralds.'
        },
        // Additive 2: legal precedent
        {
          title: 'Supreme Court Ruling',
          description: 'In 1982, the U.S. Supreme Court affirmed the salvage team ownership rights against State of Florida claims.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(candidateNotableFacts, [narrativeDescription, contextNote]);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(f => f.title)).toEqual(['Immense Treasure', 'Supreme Court Ruling']);
    });

    it('preserves additive facts that mention a shared entity name when introducing novel details', () => {
      const description = 'Camp Dubois served as the winter encampment and training camp for the Lewis and Clark Expedition from December 1803 to May 1804 at the confluence of the Mississippi and Missouri rivers.';

      const notableFacts = [
        {
          title: 'Camp Dubois Winter Encampment',
          description: 'Camp Dubois was the winter camp for the Lewis and Clark Expedition from December 1803 to May 1804.'
        },
        {
          title: 'Recruitment and Discipline',
          description: 'Captain William Clark conducted rigorous military drills, marksmanship trials, and selected 45 recruits for the Corps of Discovery.'
        },
        {
          title: 'Astronomical Observations',
          description: 'Captain Meriwether Lewis took daily celestial measurements using a sextant and chronometer to establish precise baseline coordinates.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(notableFacts, [description]);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(f => f.title)).toEqual(['Recruitment and Discipline', 'Astronomical Observations']);
    });
  });

  describe('3. Cross-Section Contradiction Prevention and Section Separation', () => {
    it('ensures Description, Context, and Notable sections maintain clean specialized separation', () => {
      const location: LocationInfo = {
        name: 'Great Falls Portage',
        locationString: 'Great Falls, Montana, United States',
        type: LocationType.Historical,
        coordinates: { lat: 47.5053, lng: -111.2995 },
        description: 'The Great Falls of the Missouri River presented one of the most physically demanding obstacles encountered by the Lewis and Clark Expedition during their westward trek across North America.',
        contextNotes: [
          'Encountered in June 1805 during the transcontinental expedition through the Louisiana Purchase territory.'
        ],
        notable: [
          {
            title: '18-Mile Overland Portage',
            description: 'The Corps of Discovery spent nearly a month hauling canoes and tons of supplies over 18 miles of rugged, cactus-covered terrain using makeshift wooden carriages.'
          },
          {
            title: 'Extreme Hazards',
            description: 'Expedition members faced hailstorms, flash floods, extreme heat, grizzly bears, and sharp prickly pear thorns that pierced their moccasins.'
          }
        ]
      };

      const units = buildFullNarrationUnits(location);

      const summaryUnit = units.find(u => u.section === 'SUMMARY');
      const notableUnits = units.filter(u => u.section === 'NOTABLE');

      expect(summaryUnit).toBeDefined();
      expect(summaryUnit?.text).toContain('physically demanding obstacles');

      // Both notable units add distinct non-redundant information
      expect(notableUnits).toHaveLength(2);
      expect(notableUnits[0].text).toContain('18 miles');
      expect(notableUnits[1].text).toContain('grizzly bears');
    });
  });
});
