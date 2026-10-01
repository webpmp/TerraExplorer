import { describe, it, expect } from 'vitest';
import {
  parseNotableFactItem,
  isFactSubsumedByText,
  filterAdditiveNotableFacts,
  deduplicateNotableFacts
} from '../../utils/notableFactsUtils';
import { getDiscoveryPrompt } from '../promptBuilder';
import { buildFullNarrationUnits } from '../narrationProviders';
import { LocationInfo, LocationType } from '../../types';
import { normalizeInfoPanelData } from '../../utils/mappers';

describe('Notable Facts Additive Enrichment & Semantic Uniqueness Suite', () => {
  describe('1. Non-Repetition and Semantic Rewording Duplicate Detection', () => {
    it('rejects notable facts that repeat information already present in Description (exact and semantic rewordings)', () => {
      const description = 'The expedition reached the South Pole in January 1912.';
      
      // Semantically equivalent rewording communicating the same underlying fact with different phrasing
      const rewordedFact = 'The explorers arrived at the South Pole during January 1912.';
      expect(isFactSubsumedByText(rewordedFact, description)).toBe(true);

      const candidateFacts = [
        rewordedFact,
        {
          title: 'Arrival at South Pole',
          description: 'The team reached the South Pole in January 1912.'
        },
        {
          title: 'Pony Transport',
          description: 'The expedition initially employed Manchurian ponies and experimental motor sledges across the Ross Ice Shelf.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(candidateFacts, [description]);
      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).title).toBe('Pony Transport');
    });

    it('treats founded/established and trading center rewordings as duplicate restatements', () => {
      const description = 'X was founded in 1850 and became an important center of trade.';
      const duplicateRewording = 'X became an important trading center after its founding in 1850.';
      
      expect(isFactSubsumedByText(duplicateRewording, description)).toBe(true);

      const additiveFact1 = {
        title: 'Associated Individual',
        description: 'Merchant Y played a significant role in establishing the region’s early trading network.'
      };
      const additiveFact2 = {
        title: 'Historical Development',
        description: 'The location later became a major transfer point for goods moving between the interior and coastal markets.'
      };

      const result = filterAdditiveNotableFacts([duplicateRewording, additiveFact1, additiveFact2], [description]);
      expect(result).toHaveLength(2);
      expect(result.map((f: any) => f.title)).toEqual(['Associated Individual', 'Historical Development']);
    });

    it('rejects repetition across multiple InfoPanel sections including subtitle, category, and context notes', () => {
      const description = 'The fortress was completed in 1588 on the eastern cliffs.';
      const contextNote = 'Designated a UNESCO World Heritage Site in 1997.';
      const subtitle = 'Historic Coastal Citadel';
      const category = 'Military Fortress';

      const candidateFacts = [
        // Repeats description
        { title: 'Completion Date', description: 'The eastern cliff fortress was finished in 1588.' },
        // Repeats context note
        { title: 'UNESCO Inscription', description: 'Recognized as a UNESCO World Heritage Site in 1997.' },
        // Additive: engineering detail
        { title: 'Volcanic Tuff Walls', description: 'Constructed using interlocking blocks of local volcanic tuff joined with lime mortar.' },
        // Additive: subsequent siege
        { title: 'Siege of 1642', description: 'Withstood a three-month naval blockade by French warships during the Franco-Spanish War.' }
      ];

      const filtered = filterAdditiveNotableFacts(candidateFacts, [description, contextNote, subtitle, category]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((f: any) => f.title)).toEqual(['Volcanic Tuff Walls', 'Siege of 1642']);
    });
  });

  describe('2. Introducing Associated Individuals and Novel Dimensions', () => {
    it('allows introducing a new associated individual not already introduced in the Description', () => {
      const description = 'The Transcontinental Railroad was completed at Promontory Summit in 1869 under the direction of the Central Pacific and Union Pacific Railroads.';

      const notableFacts = [
        // Repeats description entities
        { title: 'Railroad Completion', description: 'The Central Pacific and Union Pacific met at Promontory Summit in 1869.' },
        // Introduces novel individual: Chief Engineer Theodore Judah
        {
          title: 'Chief Engineer Theodore Judah',
          description: 'Surveyor and engineer Theodore Judah secured congressional funding and charted the daring route through the Sierra Nevada before his untimely death in 1863.'
        },
        // Introduces financier/political figure
        {
          title: 'Leland Stanford Golden Spike',
          description: 'Railroad president Leland Stanford drove the ceremonial Last Spike made of 17.6-karat gold during the opening ceremony.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(notableFacts, [description]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((f: any) => f.title)).toEqual([
        'Chief Engineer Theodore Judah',
        'Leland Stanford Golden Spike'
      ]);
    });

    it('supports varied subject-aware additive dimensions (archaeology, logistics, physical artifacts, later legal rulings)', () => {
      const shipwreckDesc = 'The SS Republic was a side-wheel steamship that sank during a hurricane off the coast of Georgia in October 1865.';

      const shipwreckFacts = [
        // Subsumed repetition
        { title: 'Hurricane Sinking', description: 'Sank in October 1865 off Georgia in a violent hurricane.' },
        // Archaeological / Salvage Dimension
        {
          title: 'Deep-Sea Robotic Excavation',
          description: 'Found at a depth of 1,700 feet in 2003 using advanced remote-operated vehicles (ROVs).'
        },
        // Artifacts / Cargo Dimension
        {
          title: 'Numismatic Treasure Recovery',
          description: 'Over 51,000 gold and silver coins were recovered from the seabed intact.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(shipwreckFacts, [shipwreckDesc]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((f: any) => f.title)).toEqual([
        'Deep-Sea Robotic Excavation',
        'Numismatic Treasure Recovery'
      ]);
    });
  });

  describe('3. Depth Over Repetition & Dynamic Count Handling', () => {
    it('does not require a fixed number of items when fewer unique additive facts exist', () => {
      const description = 'A remote volcanic atoll in the South Pacific with no permanent human habitation.';
      
      const facts = [
        // Duplicate
        'A remote South Pacific volcanic atoll uninhabited by humans.',
        // Only 1 genuine additive fact
        {
          title: 'Endemic Avian Sanctuary',
          description: 'Home to the world’s largest breeding colony of Murphy’s petrels, supporting over 250,000 nesting pairs.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(facts, [description]);
      // Graciously returns 1 fact without forcing filler or inventing fake items
      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).title).toBe('Endemic Avian Sanctuary');
    });

    it('filters out generic placeholder and boilerplate phrases', () => {
      const description = 'A small inland oasis in the Mojave Desert.';
      const facts = [
        { title: 'Documentation', description: 'No widely documented historical or cultural facts were found.' },
        { title: 'Endemic Pupfish', description: 'Supports a genetically isolated sub-species of pupfish surviving in mineral springs.' }
      ];

      const filtered = filterAdditiveNotableFacts(facts, [description]);
      expect(filtered).toHaveLength(1);
      expect((filtered[0] as any).title).toBe('Endemic Pupfish');
    });

    it('progressively deduplicates later notable facts against preceding accepted notable facts', () => {
      const description = 'The ancient library was established in Alexandria during the Ptolemaic Kingdom.';

      const facts = [
        {
          title: 'Papyrus Scroll Collection',
          description: 'Scholars estimated the library held between 40,000 and 400,000 papyrus scrolls at its peak.'
        },
        // Fact 2 repeats Fact 1
        {
          title: 'Ancient Scroll Holdings',
          description: 'The institution preserved an estimated 400,000 papyrus scrolls gathered from Mediterranean vessels.'
        },
        // Fact 3 adds distinct information (Head Librarian Eratosthenes)
        {
          title: 'Chief Librarian Eratosthenes',
          description: 'Polymath Eratosthenes served as chief librarian and calculated the circumference of the Earth with remarkable precision.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(facts, [description]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((f: any) => f.title)).toEqual([
        'Papyrus Scroll Collection',
        'Chief Librarian Eratosthenes'
      ]);
    });
  });

  describe('4. Prompt Builder Guidelines Integrity', () => {
    it('generates discovery prompt containing progressive presentation, additive dimensions, and strict non-repetition rules', () => {
      const prompt = getDiscoveryPrompt('historical_site', 'Fort Point', ['Civil War', 'San Francisco']);

      expect(prompt).toContain('PROGRESSIVE PRESENTATION OF INFORMATION');
      expect(prompt).toContain('Description = Establish the subject');
      expect(prompt).toContain('Notable Facts = Deepen understanding');
      expect(prompt).toContain('AVOID REPETITION AT THE FACTUAL LEVEL');
      expect(prompt).toContain('Associated People');
      expect(prompt).toContain('CHOOSE DEPTH OVER REPETITION');
      expect(prompt).toContain('CONTENT QUALITY TEST');
    });
  });

  describe('5. Narration and InfoPanel Display Model Integration', () => {
    it('ensures buildFullNarrationUnits filters subsumed notable facts from spoken narration', () => {
      const location: LocationInfo = {
        name: 'Apollo 11 Splashdown Site',
        locationString: 'Pacific Ocean',
        type: LocationType.Historical,
        coordinates: { lat: 13.3167, lng: -169.1500 },
        description: 'The Apollo 11 command module Columbia splashed down in the North Pacific Ocean on July 24, 1969, successfully concluding humanity’s first crewed lunar landing mission.',
        notable: [
          // Subsumed repetition
          {
            title: 'Splashdown in Pacific',
            description: 'The spacecraft splashed down in the Pacific Ocean on July 24, 1969 after returning from the Moon.'
          },
          // Additive detail 1: Recovery Ship USS Hornet
          {
            title: 'Recovery by USS Hornet',
            description: 'Aircraft carrier USS Hornet retrieved astronauts Neil Armstrong, Buzz Aldrin, and Michael Collins from the ocean.'
          },
          // Additive detail 2: Mobile Quarantine Facility
          {
            title: 'Biological Quarantine Protocol',
            description: 'The crew transferred immediately into a sealed Mobile Quarantine Facility van to guard against extraterrestrial pathogens.'
          }
        ]
      };

      const units = buildFullNarrationUnits(location);
      const notableUnits = units.filter(u => u.section === 'NOTABLE');

      // The redundant splashdown fact must not be narrated
      expect(notableUnits).toHaveLength(2);
      const textAll = notableUnits.map(u => u.text).join(' ');
      expect(textAll).toContain('USS Hornet');
      expect(textAll).toContain('Mobile Quarantine');
      expect(textAll).not.toContain('concluding humanity’s first crewed lunar landing');
    });

    it('ensures normalizeInfoPanelData filters non-additive facts in the display pipeline', () => {
      const rawEntity = {
        name: 'Matterhorn',
        description: 'The Matterhorn is a famous pyramidal mountain peak in the Pennine Alps on the border between Switzerland and Italy.',
        notable: [
          {
            title: 'Alpine Pyramid',
            description: 'The Matterhorn is a steep pyramidal peak located in the Alps between Italy and Switzerland.'
          },
          {
            title: 'First Ascent of 1865',
            description: 'Edward Whymper led the first successful ascent on July 14, 1865, though four climbers died during the descent.'
          }
        ]
      };

      const normalized = normalizeInfoPanelData(rawEntity);
      expect(normalized.notable).toHaveLength(1);
      expect(normalized.notable[0].title).toBe('First Ascent of 1865');
    });
  });

  describe('6. Christ the Redeemer & Additive InfoPanel Deduplication Requirements', () => {
    const christDescription = `Christ the Redeemer is an Art Deco statue of Jesus Christ in Rio de Janeiro, Brazil, created by French sculptor Paul Landowski and built by Brazilian engineer Heitor da Silva Costa between 1922 and 1931. The statue is 30 metres (98 ft) tall, not including its 8-metre (26 ft) pedestal. It is located at the peak of the 700-metre (2,300 ft) Corcovado mountain in the Tijuca National Park. A global symbol of Christianity, the statue attracts nearly two million visitors annually and offers panoramic views of Rio de Janeiro. The monument was constructed using reinforced concrete and soapstone tiles.`;

    it('filters out paraphrased facts already covered in the completed description (e.g. Construction & Inauguration, Cultural Icon)', () => {
      const candidateFacts = [
        // Exact / paraphrased construction dates and creators
        {
          title: 'Construction and Inauguration',
          description: 'Constructed from 1922 to 1931 by Heitor da Silva Costa and Paul Landowski using reinforced concrete.'
        },
        // Paraphrased symbolism and visitor numbers
        {
          title: 'Cultural Icon',
          description: 'The monument represents Christianity and is a famous symbol of Rio de Janeiro, welcoming millions of visitors each year.'
        },
        // Genuinely novel additive fact
        {
          title: 'Chapel of Our Lady of Aparecida',
          description: 'A small consecrated Catholic chapel dedicated to Our Lady of Aparecida is located inside the base of the pedestal.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(candidateFacts, [christDescription]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Chapel of Our Lady of Aparecida');
    });

    it('detects paraphrased / semantically equivalent facts including built/constructed and symbol/represents', () => {
      const desc = 'Built between 1922 and 1931, it serves as a global symbol of Christianity.';

      // Paraphrases: "constructed from 1922 to 1931" / "represents Christianity"
      const paraphrasedFact1 = 'Constructed from 1922 to 1931 by regional builders.';
      const paraphrasedFact2 = {
        title: 'Religious Significance',
        description: 'The monument represents Christianity across the world.'
      };

      expect(isFactSubsumedByText(paraphrasedFact1, desc)).toBe(true);
      expect(isFactSubsumedByText(paraphrasedFact2, desc)).toBe(true);

      const filtered = filterAdditiveNotableFacts([paraphrasedFact1, paraphrasedFact2], [desc]);
      expect(filtered).toEqual([]);
    });

    it('prunes repeated portions from candidate facts with partial overlap and retains novel information', () => {
      const candidateFacts = [
        // Multi-sentence partial overlap: first sentence repeats description, second sentence is novel
        {
          title: 'Soapstone Tiles',
          description: 'Constructed from 1922 to 1931 by Paul Landowski and Heitor da Silva Costa. The outer layer comprises six million triangular soapstone tiles individually glued by volunteer women onto mesh sheets.'
        },
        // Compound clause partial overlap: introductory clause repeats description, main clause is novel
        {
          title: 'Restoration Program',
          description: 'Built between 1922 and 1931 atop Corcovado mountain, the monument underwent extensive restoration in 2010 to repair lightning damage.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(candidateFacts, [christDescription]);
      expect(filtered).toHaveLength(2);

      // Verify repeated content was trimmed and novel content preserved
      expect(filtered[0].description).toBe(
        'The outer layer comprises six million triangular soapstone tiles individually glued by volunteer women onto mesh sheets.'
      );
      expect(filtered[1].description).toBe(
        'The monument underwent extensive restoration in 2010 to repair lightning damage.'
      );
    });

    it('deduplicates duplicate Notable Facts against each other in the candidate list', () => {
      const candidateFacts = [
        {
          title: 'Chapel of Our Lady of Aparecida',
          description: 'A small consecrated Catholic chapel dedicated to Our Lady of Aparecida is located inside the base of the pedestal.'
        },
        // Duplicate of the first notable fact
        {
          title: 'Pedestal Chapel',
          description: 'The chapel of Our Lady of Aparecida is housed inside the pedestal base.'
        },
        // Another duplicate with exact string match
        {
          title: 'Chapel of Our Lady of Aparecida',
          description: 'A small consecrated Catholic chapel dedicated to Our Lady of Aparecida is located inside the base of the pedestal.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(candidateFacts, [christDescription]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Chapel of Our Lady of Aparecida');
    });

    it('returns an empty array when no new additive facts are available without adding generic filler', () => {
      const repetitiveFacts = [
        {
          title: 'Statue Height',
          description: 'The statue stands 30 metres high on an 8-metre pedestal.'
        },
        {
          title: 'Location on Corcovado',
          description: 'Located at the 700-metre peak of Corcovado mountain in Tijuca National Park overlooking Rio.'
        },
        {
          title: 'Panoramic Views',
          description: 'Offers sweeping panoramic vistas across the city of Rio de Janeiro.'
        }
      ];

      const filtered = filterAdditiveNotableFacts(repetitiveFacts, [christDescription]);
      expect(filtered).toEqual([]);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('7. Punctuation, Decimals, Percentages, and Non-Alphanumeric Character Preservation', () => {
    it('preserves percentages and parentheses in "342 grams per kilogram (34.2%)" without fragmenting or corrupting', () => {
      const deadSeaDesc = 'The Dead Sea is a hypersaline salt lake located in the Jordan Rift Valley.';
      const fact = {
        title: 'Salinity',
        description: 'With a salinity of 342 grams per kilogram (34.2%), the Dead Sea is nine times saltier than the ocean, creating an environment where plants and animals cannot survive.'
      };

      const filtered = filterAdditiveNotableFacts([fact], [deadSeaDesc]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Salinity');
      expect(filtered[0].description).toBe(
        'With a salinity of 342 grams per kilogram (34.2%), the Dead Sea is nine times saltier than the ocean, creating an environment where plants and animals cannot survive.'
      );
      expect(filtered[0].description).toContain('342 grams per kilogram (34.2%)');
      expect(filtered[0].description.startsWith('2%),')).toBe(false);

      // Verify narration unit assembly preserves the fact description
      const locationInfo: LocationInfo = {
        name: 'Dead Sea',
        type: LocationType.Lake,
        coordinates: { lat: 31.56, lng: 35.47 },
        description: deadSeaDesc,
        notable: filtered
      };

      const units = buildFullNarrationUnits(locationInfo);
      const notableUnit = units.find(u => u.section === 'NOTABLE');
      expect(notableUnit).toBeDefined();
      expect(notableUnit!.text).toContain('342 grams per kilogram (34.2%)');
      expect(notableUnit!.text.startsWith('2%),')).toBe(false);
    });

    it('preserves decimals, apostrophes, hyphens, en/em dashes, and quotes in notable facts', () => {
      const baseDesc = 'The mountain region features extreme geography and historical survey markers.';
      const facts = [
        {
          title: 'Elevation Profile',
          description: 'The summit is situated at an elevation of 439.78 meters (1,442.8 feet) above sea level.'
        },
        {
          title: 'Historical Expedition',
          description: "Explorer O'Connor's 1888–1889 survey—the first complete geodetic mapping—recorded \"unprecedented\" depth soundings."
        }
      ];

      const filtered = filterAdditiveNotableFacts(facts, [baseDesc]);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].description).toContain('439.78 meters');
      expect(filtered[0].description).toContain('(1,442.8 feet)');
      expect(filtered[1].description).toContain("O'Connor's");
      expect(filtered[1].description).toContain('1888–1889');
      expect(filtered[1].description).toContain('survey—the first');
      expect(filtered[1].description).toContain('"unprecedented"');
    });
  });
});


