import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import { classifyContext, isPureGeographicLabel, sanitizeContextMarkdown } from '../../utils/contextClassification';

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
  });
});
