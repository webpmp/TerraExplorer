import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import {
  classifyContext,
  isPureGeographicLabel,
  sanitizeContextMarkdown,
  isContextSubsumedByDescription
} from '../../utils/contextClassification';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';

describe('InfoPanel Context Classification & Rendering Suite', () => {
  describe('1. Semantic Context Classification Unit Tests', () => {
    it('classifies film/media content as FILM_MEDIA ("Film & Media")', () => {
      const gotText = 'Greenwood Park was used to film scenes of the North, a region known for its icy climate and formidable walls. The park provided a stark contrast to the warmer locales of Westeros. The North is one of the most important regions in Game of Thrones, central to the story’s conflict and political intrigue.';
      const res = classifyContext(gotText);

      expect(res.category).toBe('FILM_MEDIA');
      expect(res.heading).toBe('Film & Media');
      expect(res.isMeaningful).toBe(true);
      expect(res.isGeographicOnly).toBe(false);
    });

    it('classifies genuine historical content as HISTORICAL ("Historical Context")', () => {
      const sputnikText = 'The facility was originally associated with Tyuratam and became one of the most important launch facilities in the history of space exploration during the 1950s Soviet space program.';
      const res = classifyContext(sputnikText);

      expect(res.category).toBe('HISTORICAL');
      expect(res.heading).toBe('Historical Context');
      expect(res.isMeaningful).toBe(true);
    });

    it('classifies cultural & spiritual content as CULTURAL ("Cultural Context")', () => {
      const culturalText = 'A sacred mountain in Shinto tradition, serving as a revered pilgrimage destination and cultural symbol of local communal spiritual customs.';
      const res = classifyContext(culturalText);

      expect(res.category).toBe('CULTURAL');
      expect(res.heading).toBe('Cultural Context');
      expect(res.isMeaningful).toBe(true);
    });

    it('classifies geological / ecological content as SCIENTIFIC_GEOGRAPHIC ("Scientific/Geographic Context")', () => {
      const geoText = 'Formed in 1976 from geothermal wastewater rich in silica and sulfur, with unique volcanic mineral formations and hydrothermal ecosystem properties.';
      const res = classifyContext(geoText);

      expect(res.category).toBe('SCIENTIFIC_GEOGRAPHIC');
      expect(res.heading).toBe('Scientific/Geographic Context');
      expect(res.isMeaningful).toBe(true);
    });

    it('identifies pure geographic labels as non-context metadata', () => {
      expect(isPureGeographicLabel('Northern Ireland')).toBe(true);
      expect(isPureGeographicLabel('Central Asia')).toBe(true);
      expect(isPureGeographicLabel('Western Europe')).toBe(true);
      expect(isPureGeographicLabel('United Kingdom')).toBe(true);
      expect(isPureGeographicLabel('County Down')).toBe(true);
      expect(isPureGeographicLabel('N/A')).toBe(true);

      const res = classifyContext('Northern Ireland');
      expect(res.category).toBe(null);
      expect(res.isGeographicOnly).toBe(true);
      expect(res.isMeaningful).toBe(false);
    });
  });

  describe('2. InfoPanel Context Rendering & Conditional Display', () => {
    it('does NOT render Historical Context for Game of Thrones filming location with geographic region', () => {
      const gotLocation = {
        name: 'Greenwood Park',
        entityType: 'filming_location',
        locationString: 'County Down, Northern Ireland',
        coordinates: { lat: 54.37, lng: -5.58 },
        description: 'Greenwood Park was used to film scenes of the North, a region known for its icy climate and formidable walls. The park provided a stark contrast to the warmer locales of Westeros.\n\nThe North is one of the most important regions in Game of Thrones, central to the story’s conflict and political intrigue.',
        historicalRegion: 'Northern Ireland',
        waypoint: {
          name: 'Greenwood Park',
          historicalRegion: 'Northern Ireland',
          description: 'Greenwood Park was used to film scenes of the North, a region known for its icy climate and formidable walls. The park provided a stark contrast to the warmer locales of Westeros.\n\nThe North is one of the most important regions in Game of Thrones, central to the story’s conflict and political intrigue.'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={gotLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Must NOT render "Historical Context" or "Historical context"
      expect(html).not.toMatch(/Historical [Cc]ontext/);

      // Geographic label "Northern Ireland" must NOT be rendered as a standalone context section
      expect(html).not.toContain('<h3 class="mt-3 mb-1.5 font-bold text-sm text-white/95 leading-snug">Historical Context</h3>');
      expect(html).not.toContain('<h3 class="mt-3 mb-1.5 font-bold text-sm text-white/95 leading-snug">Northern Ireland</h3>');

      // Narrative must be preserved
      expect(html).toContain('Greenwood Park was used to film scenes of the North');
      expect(html).toContain('Westeros');
    });

    it('renders Film & Media context when additional media context is provided', () => {
      const filmLocation = {
        name: 'Castle Ward',
        entityType: 'filming_location',
        locationString: 'Strangford, Northern Ireland',
        coordinates: { lat: 54.37, lng: -5.58 },
        description: 'Historic estate overlooking Strangford Lough.',
        mediaContext: 'Castle Ward served as the primary outdoor filming location for Winterfell in the first season of the HBO television series Game of Thrones.',
        waypoint: {
          name: 'Castle Ward',
          historicalRegion: 'Northern Ireland'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={filmLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Must render Film & Media section
      expect(html).toMatch(/Film (&amp;|&) Media/);
      expect(html).toContain('filming location for Winterfell');
      // Must NOT render Historical Context
      expect(html).not.toMatch(/Historical [Cc]ontext/);
    });

    it('renders Cultural Context section for cultural/spiritual locations', () => {
      const culturalLocation = {
        name: 'Mount Fuji Shrine',
        entityType: 'shrine',
        locationString: 'Shizuoka, Japan',
        coordinates: { lat: 35.36, lng: 138.73 },
        description: 'Historic shrine at the base of Mount Fuji.',
        culturalContext: 'A sacred site in Shinto traditions, serving as a center of religious pilgrimage and communal spiritual worship for centuries.',
        waypoint: {
          name: 'Mount Fuji Shrine'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={culturalLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Cultural Context');
      expect(html).toContain('sacred site in Shinto traditions');
    });

    it('renders Scientific/Geographic Context for geological/ecological locations', () => {
      const geoLoc = {
        name: 'Blue Lagoon',
        entityType: 'geothermal_spa',
        locationString: 'Grindavík, Iceland',
        coordinates: { lat: 63.88, lng: -22.45 },
        description: 'Geothermal spa located in a lava field.',
        scientificContext: 'Formed in 1976 from geothermal wastewater rich in silica and sulfur, with unique volcanic mineral formations and hydrothermal ecosystem properties.',
        waypoint: {
          name: 'Blue Lagoon'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={geoLoc}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Scientific/Geographic Context');
      expect(html).toContain('geothermal wastewater rich in silica');
    });

    it('renders Historical Context ONLY when genuine historical information is present', () => {
      const histLoc = {
        name: 'Site No. 1, Baikonur Cosmodrome',
        entityType: 'historical_site',
        locationString: 'Baikonur, Kazakhstan',
        coordinates: { lat: 45.92, lng: 63.34 },
        description: 'Sputnik 1 was launched by the Soviet Union on October 4, 1957, from this site in present-day Kazakhstan.',
        historicalBackground: 'The facility was originally established as a missile test range in 1955 and became the premier space launch facility of the Soviet Union.',
        waypoint: {
          name: 'Site No. 1, Baikonur Cosmodrome'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={histLoc}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Historical Context');
      expect(html).toContain('established as a missile test range in 1955');
    });

    it('sanitizes incoming markdown with misclassified "## Historical context" above film content', () => {
      const misclassifiedMarkdown = `Greenwood Park is an estate in County Down.

## Historical context

Greenwood Park was used to film scenes of the North in Game of Thrones, representing the colder regions of Westeros.`;

      const sanitized = sanitizeContextMarkdown(misclassifiedMarkdown);
      expect(sanitized).toContain('## Film & Media');
      expect(sanitized).not.toContain('## Historical context');
    });

    it('omits misclassified "## Historical context" followed only by a geographic label', () => {
      const geoOnlyMarkdown = `Greenwood Park is an estate in County Down.

## Historical context

Northern Ireland`;

      const sanitized = sanitizeContextMarkdown(geoOnlyMarkdown);
      expect(sanitized).not.toContain('## Historical context');
      expect(sanitized).not.toContain('Northern Ireland');
      expect(sanitized).toBe('Greenwood Park is an estate in County Down.');
    });

    it('deduplicates Historical Context section and prevents duplicate headers for Santa Maria', () => {
      const santaMariaLocation = {
        name: 'Santa Maria',
        canonicalName: 'Santa Maria',
        entityType: 'shipwreck',
        locationString: 'Cap-Haïtien, Haiti',
        coordinates: { lat: 19.76, lng: -72.20 },
        description: `The Santa Maria was a Spanish caravel that famously played a pivotal role in Christopher Columbus's first voyage to the Americas in 1492.\n\n## Historical Context\n\nColumbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 off the coast of present-day Cap-Haïtien, Haiti.`,
        historicalContext: `Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 off the coast of present-day Cap-Haïtien, Haiti.`,
        notable: [
          {
            title: 'Historical Context',
            description: `Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 off the coast of present-day Cap-Haïtien, Haiti.`
          }
        ],
        waypoint: {
          name: 'Santa Maria'
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={santaMariaLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Match all occurrences of "Historical Context" in rendered markup
      const occurrences = (html.match(/Historical Context/g) || []).length;
      expect(occurrences).toBe(1);

      // Verify the content is present
      expect(html).toContain('Columbus&#x27;s flagship during his 1492 voyage');
    });
  });

  describe('3. Semantic Overlap and Hierarchy Suite (Historical Context vs Primary Description)', () => {
    it('Case 1: Santa Maria LM Studio description suppresses redundant Historical Context section', () => {
      const lmStudioDescription = `The wreck site of the Santa Maria is located in unknown waters off the coast of Haiti. This site holds significant historical importance as it represents a key moment in Columbus's voyages to the New World. The ship, commanded by Christopher Columbus, ran aground on December 25, 1492, during his first voyage across the Atlantic Ocean. After attempting to refloat the vessel, it was eventually abandoned and left to decay over time. Today, the remains serve as a reminder of one of the pivotal events in world history that marked the beginning of European exploration and colonization of the Americas.`;
      const deterministicHistoricalContext = `Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.`;

      const santaMariaLocation = {
        name: 'Santa Maria',
        canonicalName: 'Santa Maria',
        entityType: 'shipwreck',
        locationString: 'Haiti',
        coordinates: { lat: 19.76, lng: -72.20 },
        description: lmStudioDescription,
        historicalContext: deterministicHistoricalContext,
        climate: {
          name: 'Oceanic climate',
          description: 'The climate around this site is characterized by high humidity and warm temperatures.'
        },
        notable: [
          {
            title: 'Historical Significance',
            description: 'The Santa Maria’s wreck site marks one of the earliest instances of European contact with indigenous peoples of the Americas.'
          },
          {
            title: 'Archaeological Importance',
            description: 'The remains provide invaluable insights into 15th-century maritime technology and Columbus\'s expeditions.'
          }
        ]
      };

      const canonicalResult = resolveCanonicalNarrative(santaMariaLocation);
      expect(canonicalResult.narrativeText).not.toContain('## Historical Context');
      expect(canonicalResult.narrativeText).toContain('The wreck site of the Santa Maria is located in unknown waters off the coast of Haiti.');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={santaMariaLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Historical Context header should NOT be present in narrative
      expect(html).not.toContain('Historical Context');
      // Main description, notable facts, and climate should be present
      expect(html).toContain('The wreck site of the Santa Maria is located');
      expect(html).toContain('Notable Facts');
      expect(html).toContain('Historical Significance');
      expect(html).toContain('Archaeological Importance');
      expect(html).toContain('Climate');
      expect(html).toContain('Oceanic climate');
    });

    it('Case 2: Context adds new information and IS emitted', () => {
      const basicDescription = 'Temüjin was a nomad leader on the Asian steppe.';
      const newContext = 'In 1206, Temüjin united the nomadic tribes and was proclaimed Genghis Khan, establishing the Mongol Empire.';

      const location = {
        name: 'Mongol Steppe',
        canonicalName: 'Mongol Steppe',
        description: basicDescription,
        historicalContext: newContext
      };

      const canonicalResult = resolveCanonicalNarrative(location);
      expect(canonicalResult.narrativeText).toContain('## Historical Context');
      expect(canonicalResult.narrativeText).toContain('In 1206, Temüjin united the nomadic tribes');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={location}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Historical Context');
      expect(html).toContain('In 1206, Temüjin united the nomadic tribes');
    });

    it('Case 3: Different wording for the same event is recognized as overlapping', () => {
      const baseDescription = 'The vessel ran aground on December 25, 1492 off the coast of Hispaniola.';
      const contextSnippet = 'Shipwrecked on Christmas Day 1492 in the waters of Hispaniola.';

      const isSubsumed = isContextSubsumedByDescription(contextSnippet, baseDescription);
      expect(isSubsumed).toBe(true);
    });

    it('Case 4: Context contains genuinely new facts (e.g. La Navidad) and IS emitted', () => {
      const baseDescription = 'The Santa Maria was Columbus\'s flagship during his first Atlantic voyage and was abandoned after running aground in 1492.';
      const contextWithNewFact = 'The wreck occurred near present-day Cap-Haïtien, where Columbus established La Navidad, one of the earliest European settlements in the Americas.';

      const location = {
        name: 'Santa Maria',
        canonicalName: 'Santa Maria',
        description: baseDescription,
        historicalContext: contextWithNewFact
      };

      const canonicalResult = resolveCanonicalNarrative(location);
      expect(canonicalResult.narrativeText).toContain('## Historical Context');
      expect(canonicalResult.narrativeText).toContain('La Navidad');
      expect(canonicalResult.narrativeText).toContain('earliest European settlements');
    });

    it('Case 5: Existing notable facts remain unchanged in structured section', () => {
      const location = {
        name: 'Historic Fortress',
        description: 'A fortified stronghold guarding the mountain pass.',
        notable: [
          {
            title: 'Historical Significance',
            description: 'Site of the 1380 battle that defined national borders.'
          },
          {
            title: 'Archaeological Importance',
            description: 'Excavations revealed intact 14th-century armaments and foundations.'
          }
        ]
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={location}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Notable Facts');
      expect(html).toContain('Historical Significance');
      expect(html).toContain('Site of the 1380 battle');
      expect(html).toContain('Archaeological Importance');
      expect(html).toContain('Excavations revealed intact 14th-century');
    });

    it('Case 6: Non-historical locations continue rendering normally without Historical Context', () => {
      const modernCity = {
        name: 'Reykjavik',
        canonicalName: 'Reykjavik',
        entityType: 'city',
        description: 'Reykjavik is the capital and largest city of Iceland, located on the southern shore of Faxaflói bay.',
        climate: {
          name: 'Subpolar oceanic',
          description: 'Characterized by cool summers and relatively mild winters.'
        },
        population: {
          current: {
            value: 135000,
            formattedValue: '135,000',
            source: 'census'
          }
        }
      };

      const canonicalResult = resolveCanonicalNarrative(modernCity);
      expect(canonicalResult.narrativeText).not.toContain('Historical Context');
      expect(canonicalResult.narrativeText).toBe('Reykjavik is the capital and largest city of Iceland, located on the southern shore of Faxaflói bay.');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={modernCity}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).not.toContain('Historical Context');
      expect(html).toContain('Reykjavik is the capital and largest city');
      expect(html).toContain('Climate');
      expect(html).toContain('Subpolar oceanic');
      expect(html).toContain('Population');
      expect(html).toContain('135,000');
    });

    it('Stress-Test Case A: Same entity, different event -> Historical Context MUST remain', () => {
      const description = "The Santa Maria was Columbus's flagship during his first Atlantic voyage.";
      const historicalContext = "The ship ran aground on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('ran aground on Christmas Day 1492');
    });

    it('Stress-Test Case B: Same entity, different historical fact -> Historical Context MUST remain', () => {
      const description = "The Santa Maria was one of Columbus's ships during his 1492 voyage.";
      const historicalContext = "The wreck occurred near the site where Columbus established La Navidad.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('La Navidad');
    });

    it('Stress-Test Case C: Same event, different wording -> Historical Context is suppressed', () => {
      const description = "The Santa Maria ran aground on December 25, 1492.";
      const historicalContext = "Columbus's flagship ran aground on Christmas Day 1492.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(true);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).not.toContain('## Historical Context');
    });

    it('Stress-Test Case D: Same event plus new geographic detail -> Historical Context MUST remain', () => {
      const description = "The Santa Maria ran aground on December 25, 1492.";
      const historicalContext = "Columbus's flagship ran aground on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('Cap-Haïtien, Haiti');
    });

    it('Stress-Test Case E: Shared subject but entirely different fact -> Historical Context MUST remain', () => {
      const description = "The Santa Maria was commanded by Christopher Columbus.";
      const historicalContext = "The wreck site lies approximately 1,000 meters offshore near Cap-Haïtien.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('1,000 meters offshore');
    });

    it('Stress-Test Case F: Existing Santa Maria full example -> Historical Context is suppressed', () => {
      const lmStudioDescription = `The wreck site of the Santa Maria is located in unknown waters off the coast of Haiti. This site holds significant historical importance as it represents a key moment in Columbus's voyages to the New World. The ship, commanded by Christopher Columbus, ran aground on December 25, 1492, during his first voyage across the Atlantic Ocean. After attempting to refloat the vessel, it was eventually abandoned and left to decay over time. Today, the remains serve as a reminder of one of the pivotal events in world history that marked the beginning of European exploration and colonization of the Americas.`;
      const deterministicHistoricalContext = `Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.`;

      const isSubsumed = isContextSubsumedByDescription(deterministicHistoricalContext, lmStudioDescription);
      expect(isSubsumed).toBe(true);

      const canonical = resolveCanonicalNarrative({
        name: 'Santa Maria',
        description: lmStudioDescription,
        historicalContext: deterministicHistoricalContext
      });
      expect(canonical.narrativeText).not.toContain('## Historical Context');
    });

    it('Stress-Test: Same date, different historical event -> Historical Context MUST remain', () => {
      const description = "Santa Maria ran aground on December 25, 1492.";
      const historicalContext = "Columbus departed Spain on December 25, 1492.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('departed Spain');
    });

    it('Stress-Test: Distinct historical role / vessel classification is preserved', () => {
      const description = "The Santa Maria was Columbus's flagship.";
      const historicalContext = "The Santa Maria was built as a 15th-century Spanish caravel.";

      const isSubsumed = isContextSubsumedByDescription(historicalContext, description);
      expect(isSubsumed).toBe(false);

      const canonical = resolveCanonicalNarrative({ name: 'Santa Maria', description, historicalContext });
      expect(canonical.narrativeText).toContain('## Historical Context');
      expect(canonical.narrativeText).toContain('caravel');
    });
  });
});
