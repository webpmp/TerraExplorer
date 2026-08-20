import { describe, test, it, expect } from 'vitest';
import { normalizeDisplayText, cleanMetadataString, formatImageAttribution } from '../InfoPanel';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';

describe('normalizeDisplayText helper', () => {
  test('returns string for string input', () => {
    expect(normalizeDisplayText('Test string')).toBe('Test string');
  });

  test('returns summary if object has summary', () => {
    expect(normalizeDisplayText({ summary: 'Object summary' })).toBe('Object summary');
  });

  test('returns title if object has title', () => {
    expect(normalizeDisplayText({ title: 'Object title' })).toBe('Object title');
  });

  test('returns name if object has name', () => {
    expect(normalizeDisplayText({ name: 'Object name' })).toBe('Object name');
  });

  test('returns empty string for unhandled structures', () => {
    expect(normalizeDisplayText({ foo: 'bar' })).toBe('');
    expect(normalizeDisplayText(null)).toBe('');
    expect(normalizeDisplayText(undefined)).toBe('');
  });
});

describe('cleanMetadataString helper', () => {
  it('returns trimmed string for valid inputs', () => {
    expect(cleanMetadataString('Matterhorn from Zermatt')).toBe('Matterhorn from Zermatt');
    expect(cleanMetadataString('  Photo of the mountain peak  ')).toBe('Photo of the mountain peak');
  });

  it('filters out undefined, null, and empty values gracefully', () => {
    expect(cleanMetadataString(undefined)).toBeUndefined();
    expect(cleanMetadataString(null)).toBeUndefined();
    expect(cleanMetadataString('')).toBeUndefined();
    expect(cleanMetadataString('   ')).toBeUndefined();
  });

  it('filters out invalid placeholder strings like "undefined", "null", "N/A", "none"', () => {
    expect(cleanMetadataString('undefined')).toBeUndefined();
    expect(cleanMetadataString('null')).toBeUndefined();
    expect(cleanMetadataString('N/A')).toBeUndefined();
    expect(cleanMetadataString('none')).toBeUndefined();
    expect(cleanMetadataString('unknown')).toBeUndefined();
    expect(cleanMetadataString('[object Object]')).toBeUndefined();
  });
});

describe('formatImageAttribution helper', () => {
  it('formats clean attribution with Photo: prefix if none exists', () => {
    expect(formatImageAttribution('Wikimedia Commons, User XYZ')).toBe('Photo: Wikimedia Commons, User XYZ');
    expect(formatImageAttribution('National Park Service')).toBe('Photo: National Park Service');
  });

  it('preserves existing attribution prefixes without duplicating', () => {
    expect(formatImageAttribution('Photo: Wikimedia Commons, User XYZ')).toBe('Photo: Wikimedia Commons, User XYZ');
    expect(formatImageAttribution('Credit: NASA/JPL')).toBe('Credit: NASA/JPL');
    expect(formatImageAttribution('Source: Unsplash')).toBe('Source: Unsplash');
    expect(formatImageAttribution('Courtesy of: Library of Congress')).toBe('Courtesy of: Library of Congress');
  });

  it('returns undefined for invalid or empty attribution strings', () => {
    expect(formatImageAttribution(undefined)).toBeUndefined();
    expect(formatImageAttribution(null as any)).toBeUndefined();
    expect(formatImageAttribution('')).toBeUndefined();
    expect(formatImageAttribution('undefined')).toBeUndefined();
    expect(formatImageAttribution('N/A')).toBeUndefined();
  });
});

describe('Lightbox Metadata Integration', () => {
  const baseInfo = {
    name: 'Matterhorn',
    type: 'Point of Interest' as any,
    description: 'Iconic mountain in the Alps.',
    coordinates: { lat: 45.9765, lng: 7.6586 },
    images: [
      {
        url: 'https://upload.wikimedia.org/matterhorn1.jpg',
        caption: 'Matterhorn from Zermatt',
        attribution: 'Wikimedia Commons, User XYZ'
      },
      {
        url: 'https://upload.wikimedia.org/matterhorn2.jpg',
        caption: 'North face of the Matterhorn',
        attribution: ''
      },
      {
        url: 'https://upload.wikimedia.org/matterhorn3.jpg',
        caption: '',
        attribution: 'Photo: NASA Earth Observatory'
      },
      {
        url: 'https://upload.wikimedia.org/matterhorn4.jpg',
        caption: undefined,
        attribution: undefined
      }
    ],
    news: []
  };

  it('renders InfoPanel with image thumbnail metadata without errors', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={baseInfo}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );
    expect(html).toContain('Matterhorn');
    expect(html).not.toContain('undefined');
  });

  it('renders Parchment badge without border classes while preserving background, text, rounded, font weight, and shadow', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={baseInfo}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="parchment"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );
    expect(html).toContain('text-xs uppercase px-2 py-0.5 text-[#3e2723] bg-[#d2b48c] rounded-sm font-bold shadow-sm');
    expect(html).not.toContain('text-[#3e2723] bg-[#d2b48c] border border-[#8b5a2b]');
  });

  it('renders canonical section order: Description -> Image -> Notable Facts -> Climate -> News', () => {
    const testLocation = {
      name: 'Zion National Park',
      type: 'Point of Interest' as any,
      entityType: 'landmark',
      description: 'Zion National Park is a prominent sanctuary in southwestern Utah.',
      coordinates: { lat: 37.32, lng: -113.0 },
      images: [
        {
          url: 'https://upload.wikimedia.org/zion.jpg',
          caption: 'The Watchman and Virgin River'
        }
      ],
      notable: [
        {
          title: 'The Narrows',
          description: 'Iconic hike through the narrow canyon along the Virgin River.'
        },
        {
          title: 'Angels Landing',
          description: 'Challenging trail offering panoramic views from the summit.'
        },
        {
          title: 'Wildlife',
          description: 'The park supports more than 280 bird species and diverse plant communities.'
        }
      ],
      climate: {
        name: 'Mediterranean climate',
        description: 'Hot, dry summers and cool, wet winters with significant temperature swings.'
      },
      news: [
        {
          title: 'Zion Shuttle System Expands',
          source: 'National Park News',
          summary: 'Increased transit frequency to reduce trailhead congestion.'
        }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={testLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    // Verify ordering in rendered HTML output
    const descPos = html.indexOf('Zion National Park is a prominent sanctuary');
    const imagePos = html.indexOf('<img src="https://upload.wikimedia.org/zion.jpg"');
    const notableHeaderPos = html.indexOf('Notable Facts');
    const narrowsPos = html.indexOf('The Narrows');
    const climateHeaderPos = html.indexOf('Climate');
    const newsHeaderPos = html.indexOf('News');

    expect(descPos).toBeGreaterThan(-1);
    expect(imagePos).toBeGreaterThan(descPos);
    expect(notableHeaderPos).toBeGreaterThan(imagePos);
    expect(narrowsPos).toBeGreaterThan(notableHeaderPos);
    expect(climateHeaderPos).toBeGreaterThan(narrowsPos);
    expect(newsHeaderPos).toBeGreaterThan(climateHeaderPos);
  });

  it('renders notable facts with bold title and normal-weight description instead of full bold prose', () => {
    const testLocation = {
      name: 'Zion National Park',
      type: 'Point of Interest' as any,
      entityType: 'landmark',
      description: 'Zion National Park is located in Utah.',
      coordinates: { lat: 37.32, lng: -113.0 },
      notable: [
        {
          title: 'The Narrows',
          description: 'Iconic hike through the narrow canyon along the Virgin River.'
        }
      ],
      news: []
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={testLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    // Title has font-bold semantic title style
    expect(html).toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">The Narrows</h4>');
    // Description is normal weight paragraph
    expect(html).toContain('<p class="font-normal text-sm text-gray-100 opacity-90 leading-relaxed">Iconic hike through the narrow canyon along the Virgin River.</p>');
    // Description text is NOT bolded inside h4
    expect(html).not.toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">Iconic hike');
  });

  it('unifies typography: Section headers, semantic titles, body text, and bottom news metadata', () => {
    const testLocation = {
      name: 'Zion National Park',
      type: 'Point of Interest' as any,
      entityType: 'landmark',
      description: 'Zion National Park is renowned for its towering sandstone cliffs.',
      coordinates: { lat: 37.32, lng: -113.0 },
      climate: {
        name: 'Semiarid climate',
        description: 'The park experiences hot summers, cold winters, and relatively low precipitation.'
      },
      news: [
        {
          title: 'Zion Shuttle System Expands',
          source: 'National Park News',
          date: 'June 24, 2026',
          summary: 'Increased transit frequency to reduce trailhead congestion.'
        }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={testLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    // Section headers: small, uppercase, bold (text-xs font-bold uppercase tracking-wider text-white/95 leading-tight)
    expect(html).toContain('<h3 class="font-bold uppercase tracking-wider leading-tight text-xs text-white/95">Climate</h3>');
    expect(html).toContain('<h3 class="font-bold uppercase tracking-wider leading-tight text-xs text-white/95">News</h3>');

    // Climate type uses semantic title style
    expect(html).toContain('<p class="font-bold text-sm text-white/95 leading-snug" style="text-transform:none">Semiarid climate</p>');
    // Climate description uses consistent body text style (text-sm, not text-xs)
    expect(html).toContain('<p class="font-normal text-sm text-gray-100 opacity-90 leading-relaxed">The park experiences hot summers, cold winters, and relatively low precipitation.</p>');

    // News headline uses semantic title style
    expect(html).toContain('class="block font-bold text-sm text-white/95 leading-snug hover:underline decoration-1 underline-offset-2"');
    // News summary uses body text style
    expect(html).toContain('<p class="font-normal text-sm text-gray-100 opacity-90 leading-relaxed">Increased transit frequency to reduce trailhead congestion.</p>');
    // News metadata at bottom with date and external link
    expect(html).toContain('National Park News</span><span>·</span><span>June 24, 2026</span>');

    // No card containers around news items
    expect(html).not.toContain('group/news');
  });

  it('preserves Parchment drop-cap in first description paragraph', () => {
    const testLocation = {
      name: 'Zion National Park',
      type: 'Point of Interest' as any,
      entityType: 'landmark',
      description: 'Zion National Park is renowned for its towering sandstone cliffs.',
      coordinates: { lat: 37.32, lng: -113.0 },
      notable: [],
      news: []
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={testLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="parchment"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    expect(html).toContain('parchment-drop-cap');
  });

  it('safely decomposes unstructured prose fact strings without bolding full sentences', () => {
    const testLocation = {
      name: 'Zion National Park',
      type: 'Point of Interest' as any,
      entityType: 'national_park',
      description: 'Zion National Park is renowned for its towering sandstone cliffs.',
      coordinates: { lat: 37.32, lng: -113.0 },
      notable: [
        "The Narrows hike through Zion Canyon is a unique experience where hikers walk along the riverbed in an enclosed canyon.",
        "Angels Landing offers one of the most challenging trails in the park, with steep cliffs and exposed overlooks.",
        "Zion National Park is known for its dramatic sandstone formations that have inspired artists and photographers."
      ],
      news: []
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={testLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    // Titles extracted as concise labels
    expect(html).toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">Angels Landing</h4>');
    expect(html).toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">The Narrows hike through Zion Canyon</h4>');
    expect(html).toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">Zion National Park</h4>');

    // Descriptions rendered in normal body weight
    expect(html).toContain('<p class="font-normal text-sm text-gray-100 opacity-90 leading-relaxed">Offers one of the most challenging trails in the park, with steep cliffs and exposed overlooks.</p>');
    expect(html).toContain('<p class="font-normal text-sm text-gray-100 opacity-90 leading-relaxed">Is a unique experience where hikers walk along the riverbed in an enclosed canyon.</p>');
    
    // No entire sentences inside h4
    expect(html).not.toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">Angels Landing offers one of the most challenging');
    expect(html).not.toContain('<h4 class="font-bold text-sm text-white/95 leading-snug">The Narrows hike through Zion Canyon is a unique experience');
  });

  it('renders saved-route stop with single event headline and detailed description paragraph without duplication', () => {
    const routeStopLocation = {
      name: 'Burkhan Khaldun (Mongolia)',
      type: 'Point of Interest' as any,
      entityType: 'historical_waypoint',
      coordinates: { lat: 48.9, lng: 109.0 },
      routeContext: {
        title: 'Campaigns of Genghis Khan',
        text: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.'
      },
      waypoint: {
        id: 'wp-genghis-1',
        name: 'Burkhan Khaldun (Mongolia)',
        lat: 48.9,
        lng: 109.0,
        context: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
        description: 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.',
        routeTitle: 'Campaigns of Genghis Khan'
      },
      description: 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.',
      notable: [],
      news: []
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={routeStopLocation}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
        routeNav={{ current: 1, total: 5, onNext: () => {}, onPrev: () => {} }}
      />
    );

    // Route title appears as route context header
    expect(html).toContain('Campaigns of Genghis Khan');

    // Event summary appears exactly once
    const eventSummary = '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.';
    const firstEventIdx = html.indexOf(eventSummary);
    const secondEventIdx = html.indexOf(eventSummary, firstEventIdx + 1);
    expect(firstEventIdx).toBeGreaterThan(-1);
    expect(secondEventIdx).toBe(-1); // Must NOT duplicate

    // Detailed description appears in the body text
    const descText = 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia';
    expect(html).toContain(descText);
    expect(html.indexOf(descText)).toBeGreaterThan(firstEventIdx);
  });

  it('handles legacy route stops gracefully when description equals routeContext without duplicating', () => {
    const legacyRouteStop = {
      name: 'Burkhan Khaldun (Mongolia)',
      type: 'Point of Interest' as any,
      entityType: 'historical_waypoint',
      coordinates: { lat: 48.9, lng: 109.0 },
      routeContext: {
        title: 'Campaigns of Genghis Khan',
        text: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.'
      },
      waypoint: {
        id: 'wp-genghis-1',
        name: 'Burkhan Khaldun (Mongolia)',
        lat: 48.9,
        lng: 109.0,
        context: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
        routeTitle: 'Campaigns of Genghis Khan'
      },
      description: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
      notable: [],
      news: []
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={legacyRouteStop}
        onClose={() => {}}
        isLoading={false}
        isNewsFetching={false}
        skin="modern"
        isFavorite={false}
        onSaveFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
        routeNav={{ current: 1, total: 5, onNext: () => {}, onPrev: () => {} }}
      />
    );

    const eventSummary = '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.';
    const firstEventIdx = html.indexOf(eventSummary);
    const secondEventIdx = html.indexOf(eventSummary, firstEventIdx + 1);
    expect(firstEventIdx).toBeGreaterThan(-1);
    expect(secondEventIdx).toBe(-1); // Deduplicated
  });

  describe('Lazy-Loaded News State Machine', () => {
    it('initially renders LOAD NEWS button in idle state when location is resolved', () => {
      const location = {
        name: 'Zion National Park',
        type: 'Point of Interest' as any,
        entityType: 'national_park',
        description: 'Zion National Park is known for high plateaus and narrow sandstone canyons.',
        coordinates: { lat: 37.2982, lng: -113.0263 },
        notable: [],
        news: []
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
          onFetchNews={async () => []}
          onLoadMoreNews={async () => {}}
        />
      );

      // Must render NEWS header and LOAD NEWS button
      expect(html).toContain('<h3 class="font-bold uppercase tracking-wider leading-tight text-xs text-white/95">News</h3>');
      expect(html).toContain('>Load News</button>');
      expect(html).not.toContain('>Load More News</button>');
    });

    it('renders news articles, left-aligned layout, and LOAD MORE NEWS button when loaded', () => {
      const locationWithNews = {
        name: 'Zion National Park',
        type: 'Point of Interest' as any,
        entityType: 'national_park',
        description: 'Zion National Park is known for high plateaus and narrow sandstone canyons.',
        coordinates: { lat: 37.2982, lng: -113.0263 },
        notable: [],
        news: [
          {
            title: 'Zion Shuttle System Upgrades Announced',
            summary: 'Park officials detail new electric shuttle fleet.',
            url: 'https://example.com/zion-news',
            source: 'Utah News',
            date: 'August 16, 2026'
          }
        ]
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={locationWithNews}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          onFetchNews={async () => []}
          onLoadMoreNews={async () => {}}
        />
      );

      expect(html).toContain('Zion Shuttle System Upgrades Announced');
      expect(html).toContain('Park officials detail new electric shuttle fleet.');
      expect(html).toContain('Utah News</span><span>·</span><span>August 16, 2026</span>');
      expect(html).toContain('>Load More News</button>');
      expect(html).not.toContain('>Load News</button>');
    });
  });

  describe('Dedicated Single-Location Layout & Presentation Mode', () => {
    const sputnikLocation = {
      name: 'Site No. 1, Baikonur Cosmodrome',
      type: 'Point of Interest' as any,
      entityType: 'historical_waypoint',
      locationString: 'Baikonur Cosmodrome, Kazakhstan',
      coordinates: { lat: 45.92, lng: 63.34 },
      routeContext: {
        title: 'Launch of Sputnik',
        text: 'Site No. 1, also known as the Baikonur Cosmodrome, was the launch site for Sputnik 1, the world’s first artificial satellite.'
      },
      waypoint: {
        id: 'wp-sputnik-1',
        name: 'Site No. 1, Baikonur Cosmodrome',
        canonicalName: 'Site No. 1',
        alternateNames: ["Gagarin's Start", "Tyuratam", "Barking Ranch"],
        lat: 45.92,
        lng: 63.34,
        context: '1957: Launch of Sputnik 1 from Site No. 1.',
        description: 'Sputnik 1 was launched by the Soviet Union on October 4, 1957, from this site in present-day Kazakhstan, marking the beginning of the Space Age. The same launch complex later became the site from which Yuri Gagarin began the first human spaceflight in 1961.',
        significance: 'Site No. 1 is the oldest space launch facility in the world and the focal point of early Soviet space exploration.',
        historicalRegion: 'Central Asia',
        historicalPeriod: '1950s',
        entities: ['Soviet Union', 'Sergei Korolev', 'Sputnik 1']
      },
      description: 'Sputnik 1 was launched by the Soviet Union on October 4, 1957, from this site in present-day Kazakhstan, marking the beginning of the Space Age. The same launch complex later became the site from which Yuri Gagarin began the first human spaceflight in 1961.',
      significance: 'Site No. 1 is the oldest space launch facility in the world and the focal point of early Soviet space exploration.',
      historicalBackground: 'The facility was originally associated with Tyuratam and became one of the most important launch facilities in the history of space exploration.',
      notable: [],
      news: []
    };

    it('renders single-location result with "Historical Site" and never "Historical Waypoint"', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Must display HISTORICAL SITE
      expect(html).toContain('HISTORICAL SITE');
      // Must NEVER display HISTORICAL WAYPOINT
      expect(html).not.toContain('HISTORICAL WAYPOINT');
      expect(html).not.toContain('Historical Waypoint');
    });

    it('does NOT render route navigation bar or "Waypoint 1 of 1" for single-location results', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          routeNav={undefined}
        />
      );

      expect(html).not.toContain('Waypoint 1 of 1');
      expect(html).not.toContain('Waypoint');
    });

    it('removes the three metadata cards (Historical Identity, Historical Period, Key Entities)', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Section cards must NOT be rendered as standalone card containers
      expect(html).not.toContain('Historical Identity');
      expect(html).not.toContain('Historical Period');
      expect(html).not.toContain('Key Entities');
      expect(html).not.toContain('Canonical Name');
    });

    it('displays alternate names as clean inline text under the header title', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Title is query/event title
      expect(html).toContain('Launch of Sputnik');
      // Subtitle is site name
      expect(html).toContain('Site No. 1, Baikonur Cosmodrome');
      // Alternate names displayed inline as clean text
      expect(html).toContain('Also known as');
      expect(html).toContain("Gagarin&#x27;s Start, Tyuratam, Barking Ranch");
    });

    it('consolidates narrative paragraphs and avoids redundant section headings', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Primary narrative about Sputnik exists
      expect(html).toContain('Sputnik 1 was launched by the Soviet Union on October 4, 1957');
      // Consolidated historical context exists
      expect(html).toContain('Historical context');
      expect(html).toContain('The facility was originally associated with Tyuratam');

      // Fragment headings must NOT be rendered as separate h3 elements
      expect(html).not.toContain('>Significance</h3>');
      expect(html).not.toContain('>Historical Region</h3>');
      expect(html).not.toContain('>Historical Milestone</h3>');
      expect(html).not.toContain('>Strategic Location</h3>');
      expect(html).not.toContain('>Cultural Symbol</h3>');
    });

    it('preserves multi-location route presentation when routeNav has 2+ waypoints', () => {
      const multiLocationNav = {
        current: 1,
        total: 3,
        onNext: () => {},
        onPrev: () => {}
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          routeNav={multiLocationNav}
        />
      );

      // Multi-location MUST render navigation bar
      expect(html).toContain('Waypoint 1 of 3');
    });

    it('removes the redundant title and short description block immediately below the header for single locations', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Main header renders the title and site name
      expect(html).toContain('Launch of Sputnik');
      expect(html).toContain('Site No. 1, Baikonur Cosmodrome');

      // The body MUST NOT contain duplicate h3 route context title or duplicate short text
      // Note: `info.routeContext.text` was "Site No. 1, also known as the Baikonur Cosmodrome, was the launch site for Sputnik 1, the world’s first artificial satellite."
      expect(html).not.toContain('<h3 class="text-xs font-bold uppercase tracking-widest mb-1 text-cyan-400">Launch of Sputnik</h3>');
      expect(html).not.toContain('<h3 class="text-xs font-bold uppercase tracking-widest mb-1 text-current">Launch of Sputnik</h3>');
      expect(html).not.toContain('<h3 class="text-xs font-bold uppercase tracking-widest mb-1 text-[#8b5a2b]">Launch of Sputnik</h3>');

      // The body begins directly with the substantive narrative
      expect(html).toContain('Sputnik 1 was launched by the Soviet Union on October 4, 1957');
    });

    it('renders route context block for multi-location waypoint stops', () => {
      const multiLocationNav = {
        current: 1,
        total: 3,
        onNext: () => {},
        onPrev: () => {}
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          routeNav={multiLocationNav}
        />
      );

      // Multi-location MUST render route context block for the waypoint stop
      expect(html).toContain('Launch of Sputnik');
      expect(html).toContain('Site No. 1, also known as the Baikonur Cosmodrome, was the launch site for Sputnik 1');
      expect(html).toContain('Waypoint 1 of 3');
    });

    it('renders cleanly with Parchment theme with drop-cap on the first paragraph', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('parchment-drop-cap');
      expect(html).toContain('Launch of Sputnik');
      expect(html).toContain('HISTORICAL SITE');
    });
  });

  describe('Marker Presentation Mode Tests', () => {
    test('single resolved location produces isMultiLocation = false and showMarkerNumber = false (no numeric element)', () => {
      const singleWaypoints = [
        {
          id: 'wp-sputnik-1',
          name: 'Site No. 1, Baikonur Cosmodrome',
          lat: 45.92,
          lng: 63.34,
          sequence: 1,
          role: 'primary',
          description: 'Sputnik 1 launch site'
        }
      ];

      const isMultiLocation = singleWaypoints.length > 1;
      expect(isMultiLocation).toBe(false);

      const marker = {
        isWaypoint: true,
        isMultiLocation,
        index: 0
      };

      const showMarkerNumber = Boolean(marker.isWaypoint && marker.isMultiLocation && marker.index !== undefined);
      expect(showMarkerNumber).toBe(false);
    });

    test('multi-location route produces isMultiLocation = true and showMarkerNumber = true with numbers 1, 2, 3', () => {
      const multiWaypoints = [
        { id: 'wp-1', name: 'Chang\'an', lat: 34.26, lng: 108.94, sequence: 1 },
        { id: 'wp-2', name: 'Dunhuang', lat: 40.14, lng: 94.66, sequence: 2 },
        { id: 'wp-3', name: 'Samarkand', lat: 39.65, lng: 66.97, sequence: 3 }
      ];

      const isMultiLocation = multiWaypoints.length > 1;
      expect(isMultiLocation).toBe(true);

      const processedMarkers = multiWaypoints.map((wp, idx) => ({
        isWaypoint: true,
        isMultiLocation,
        index: idx,
        data: wp
      }));

      processedMarkers.forEach((marker, idx) => {
        const showMarkerNumber = Boolean(marker.isWaypoint && marker.isMultiLocation && marker.index !== undefined);
        expect(showMarkerNumber).toBe(true);
        expect(marker.index + 1).toBe(idx + 1);
      });
    });

    test('marker display name format for single location vs multi-location', () => {
      const formatDisplayName = (marker: any) => {
        const isWaypoint = marker.isWaypoint;
        const isMultiLocation = marker.isMultiLocation ?? false;
        const showMarkerNumber = isWaypoint && isMultiLocation && marker.index !== undefined;
        const markerDisplayName = marker.data?.name || marker.name || 'Location';

        return showMarkerNumber ? `${marker.index + 1}. ${markerDisplayName}` : markerDisplayName;
      };

      // Single location - unnumbered
      const single = {
        isWaypoint: true,
        isMultiLocation: false,
        index: 0,
        data: { name: 'Site No. 1, Baikonur Cosmodrome' }
      };
      expect(formatDisplayName(single)).toBe('Site No. 1, Baikonur Cosmodrome');
      expect(formatDisplayName(single)).not.toContain('1.');

      // Multi location - numbered
      const multiFirst = {
        isWaypoint: true,
        isMultiLocation: true,
        index: 0,
        data: { name: 'Chang\'an' }
      };
      expect(formatDisplayName(multiFirst)).toBe('1. Chang\'an');

      const multiSecond = {
        isWaypoint: true,
        isMultiLocation: true,
        index: 1,
        data: { name: 'Dunhuang' }
      };
      expect(formatDisplayName(multiSecond)).toBe('2. Dunhuang');
    });
  });
});



