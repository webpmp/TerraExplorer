import { describe, test, it, expect } from 'vitest';
import { normalizeDisplayText, cleanMetadataString, formatImageAttribution, normalizeGeoComparisonName, isRedundantWithTitle, formatGeographicContext } from '../InfoPanel';
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

  describe('Location Resolution, Scoped Population, and Clean Fallback Presentation', () => {
    it('correctly renders Sibi, Pakistan with exact title, subtitle, coordinates, and clean omission of unavailable enrichment/population', () => {
      const sibiLocation = {
        name: 'Sibi',
        city: 'Sibi',
        country: 'Pakistan',
        locationString: 'Sibi, Pakistan',
        type: 'town' as any,
        entityType: 'city',
        description: 'Documentary enrichment unavailable.',
        coordinates: { lat: 29.55, lng: 67.88 },
        population: { value: null, source: null, status: 'lookup_failed' },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={sibiLocation}
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

      // 1. Title must display Sibi without truncation or abbreviation (not Sby)
      expect(html).toContain('Sibi</h2>');
      expect(html).not.toContain('Sby</h2>');

      // 2. Subtitle must display Pakistan without repeating Sibi
      expect(html).toContain('Pakistan');
      expect(html).not.toContain('Sibi, Pakistan');

      // 3. Coordinates must display 29.55° N, 67.88° E
      expect(html).toContain('29.55° N, 67.88° E');

      // 4. "Documentary enrichment unavailable." must NOT be rendered as a description paragraph
      expect(html).not.toContain('Documentary enrichment unavailable.');

      // 5. Population must be omitted when city-level data is unavailable
      expect(html).not.toContain('<h3 class="font-bold uppercase tracking-wider leading-tight text-xs text-white/95">Population</h3>');

      // 6. No duplicate classes (e.g. p-1.5 p-1.5 or font-bold font-bold)
      expect(html).not.toMatch(/p-1\.5\s+[^"]*p-1\.5/);
      expect(html).not.toMatch(/rounded-full\s+[^"]*rounded-full/);
      expect(html).not.toMatch(/font-bold\s+[^"]*font-bold/);
    });

    it('handles Quetta, Pakistan gracefully with scoped data and clean presentation', () => {
      const quettaLocation = {
        name: 'Quetta',
        city: 'Quetta',
        country: 'Pakistan',
        locationString: 'Quetta, Pakistan',
        type: 'city' as any,
        entityType: 'city',
        description: 'Quetta is the provincial capital and largest city of Balochistan, Pakistan.',
        coordinates: { lat: 30.18, lng: 66.97 },
        population: {
          current: { formattedValue: '1,001,205' }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={quettaLocation}
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

      expect(html).toContain('Quetta</h2>');
      expect(html).toContain('Pakistan');
      expect(html).not.toContain('Quetta, Pakistan');
      expect(html).toContain('30.18° N, 66.97° E');
      expect(html).toContain('1,001,205');
      expect(html).toContain('Quetta is the provincial capital');
      expect(html).not.toMatch(/font-bold\s+[^"]*font-bold/);
    });

    it('handles Minab, Iran cleanly in retro-green mode', () => {
      const minabLocation = {
        name: 'Minab',
        city: 'Minab',
        country: 'Iran',
        locationString: 'Minab, Iran',
        type: 'town' as any,
        entityType: 'city',
        description: 'Minab is a city and capital of Minab County, Hormozgan Province, Iran.',
        coordinates: { lat: 27.14, lng: 57.08 },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={minabLocation}
          onClose={() => {}}
          isLoading={false}
          isNewsFetching={false}
          skin="retro-green"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          onLoadMoreNews={async () => {}}
        />
      );

      expect(html).toContain('Minab</h2>');
      expect(html).toContain('Iran');
      expect(html).not.toContain('Minab, Iran');
      expect(html).toContain('27.14° N, 57.08° E');
      expect(html).toContain('Minab is a city');
    });

    it('handles Paris, France with verified population and structured content in modern mode', () => {
      const parisLocation = {
        name: 'Paris',
        city: 'Paris',
        country: 'France',
        locationString: 'Paris, France',
        type: 'city' as any,
        entityType: 'city',
        description: 'Paris is the capital and most populous city of France.',
        coordinates: { lat: 48.8566, lng: 2.3522 },
        population: {
          current: { formattedValue: '2,161,000' }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={parisLocation}
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

      expect(html).toContain('Paris</h2>');
      expect(html).toContain('France');
      expect(html).not.toContain('Paris, France');
      expect(html).toContain('48.86° N, 2.35° E');
      expect(html).toContain('2,161,000');
    });
  });

  describe('Geographic Context Header Deduplication', () => {
    it('normalizes names for comparison ignoring case, diacritics, and punctuation', () => {
      expect(normalizeGeoComparisonName('Clovis')).toBe('clovis');
      expect(normalizeGeoComparisonName('CLOVIS')).toBe('clovis');
      expect(normalizeGeoComparisonName('St. Louis')).toBe('st louis');
      expect(normalizeGeoComparisonName('Grindavík')).toBe('grindavik');
      expect(normalizeGeoComparisonName('Washington, D.C.')).toBe('washington dc');
    });

    it('accurately detects redundant hierarchy components against displayed title', () => {
      expect(isRedundantWithTitle('Clovis', 'Clovis')).toBe(true);
      expect(isRedundantWithTitle('clovis', 'Clovis')).toBe(true);
      expect(isRedundantWithTitle('CLOVIS', 'Clovis')).toBe(true);
      expect(isRedundantWithTitle('Clovis', 'Clovis, NM')).toBe(true);
      expect(isRedundantWithTitle('Clovis, NM', 'Clovis')).toBe(true);
      expect(isRedundantWithTitle('City of Clovis', 'Clovis')).toBe(true);
      expect(isRedundantWithTitle('Mount Fuji', 'Mt. Fuji')).toBe(true);
      expect(isRedundantWithTitle('St. Louis', 'Saint Louis')).toBe(true);
      
      // Must NOT falsely match similar but distinct names
      expect(isRedundantWithTitle('New Mexico', 'Mexico')).toBe(false);
      expect(isRedundantWithTitle('Mexico', 'New Mexico')).toBe(false);
      expect(isRedundantWithTitle('West Virginia', 'Virginia')).toBe(false);
      expect(isRedundantWithTitle('San Francisco', 'Alcatraz Island')).toBe(false);
      expect(isRedundantWithTitle('California', 'Death Valley')).toBe(false);
    });

    it('formats City context without repeating city name: Clovis -> "New Mexico, United States"', () => {
      const clovisWithLocString = {
        name: 'Clovis',
        entityType: 'city',
        type: 'City' as any,
        state: 'New Mexico',
        country: 'United States',
        locationString: 'Clovis, United States',
        coordinates: { lat: 34.41, lng: -103.21 },
        description: 'Clovis is a city in New Mexico.'
      };

      const result = formatGeographicContext(clovisWithLocString, 'Clovis');
      expect(result).toBe('New Mexico, United States');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={clovisWithLocString}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );
      expect(html).toContain('Clovis</h2>');
      expect(html).toContain('CITY');
      expect(html).toContain('New Mexico, United States');
      expect(html).not.toContain('Clovis, United States');
      expect(html).toContain('34.41° N, 103.21° W');
    });

    it('formats City context when locationString has full hierarchy: "Clovis, New Mexico, United States" -> "New Mexico, United States"', () => {
      const clovisFull = {
        name: 'Clovis',
        entityType: 'city',
        type: 'City' as any,
        locationString: 'Clovis, New Mexico, United States',
        coordinates: { lat: 34.41, lng: -103.21 },
        description: 'Clovis is a city in New Mexico.'
      };

      const result = formatGeographicContext(clovisFull, 'Clovis');
      expect(result).toBe('New Mexico, United States');
    });

    it('formats Landmark / POI preserving parent context: Alcatraz Island -> "San Francisco, California, United States"', () => {
      const alcatraz = {
        name: 'Alcatraz Island',
        entityType: 'landmark',
        type: 'Point of Interest' as any,
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        locationString: 'Alcatraz Island, San Francisco, California, United States',
        coordinates: { lat: 37.8267, lng: -122.4233 },
        description: 'Historic island in San Francisco Bay.'
      };

      const result = formatGeographicContext(alcatraz, 'Alcatraz Island');
      expect(result).toBe('San Francisco, California, United States');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={alcatraz}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );
      expect(html).toContain('Alcatraz Island</h2>');
      expect(html).toContain('San Francisco, California, United States');
    });

    it('formats Geographic Feature preserving parent context: Death Valley -> "California, United States"', () => {
      const deathValley = {
        name: 'Death Valley',
        entityType: 'geographic_feature',
        type: 'Point of Interest' as any,
        state: 'California',
        country: 'United States',
        locationString: 'Death Valley, California, United States',
        coordinates: { lat: 36.5323, lng: -116.9325 },
        description: 'Desert valley in Eastern California.'
      };

      const result = formatGeographicContext(deathValley, 'Death Valley');
      expect(result).toBe('California, United States');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={deathValley}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );
      expect(html).toContain('Death Valley</h2>');
      expect(html).toContain('California, United States');
    });

    it('formats POI whose title is not present in geographic context: Space Needle -> "Seattle, Washington, United States"', () => {
      const spaceNeedle = {
        name: 'Space Needle',
        entityType: 'landmark',
        type: 'Point of Interest' as any,
        locationString: 'Seattle, Washington, United States',
        coordinates: { lat: 47.6205, lng: -122.3493 },
        description: 'Observation tower in Seattle, Washington.'
      };

      const result = formatGeographicContext(spaceNeedle, 'Space Needle');
      expect(result).toBe('Seattle, Washington, United States');

      const html = renderToStaticMarkup(
        <InfoPanel
          info={spaceNeedle}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );
      expect(html).toContain('Space Needle</h2>');
      expect(html).toContain('Seattle, Washington, United States');
    });

    it('handles Country entity cleanly without repeating country name', () => {
      const france = {
        name: 'France',
        entityType: 'country',
        type: 'Country' as any,
        country: 'France',
        locationString: 'France',
        coordinates: { lat: 46.2276, lng: 2.2137 },
        description: 'France is a country in Western Europe.'
      };

      const result = formatGeographicContext(france, 'France');
      expect(result).toBeNull();

      const franceWithContinent = {
        name: 'France',
        entityType: 'country',
        type: 'Country' as any,
        country: 'France',
        locationString: 'France, Europe',
        coordinates: { lat: 46.2276, lng: 2.2137 },
        description: 'France is a country in Western Europe.'
      };
      expect(formatGeographicContext(franceWithContinent, 'France')).toBe('Europe');
    });

    it('handles State entity cleanly without repeating state name', () => {
      const california = {
        name: 'California',
        entityType: 'state',
        type: 'State' as any,
        state: 'California',
        country: 'United States',
        locationString: 'California, United States',
        coordinates: { lat: 36.7783, lng: -119.4179 },
        description: 'California is a state in the Western United States.'
      };

      const result = formatGeographicContext(california, 'California');
      expect(result).toBe('United States');
    });

    it('handles trivial variations in titles such as state suffix (e.g. "Clovis, NM")', () => {
      const clovisVariant = {
        name: 'Clovis, NM',
        entityType: 'city',
        type: 'City' as any,
        state: 'New Mexico',
        country: 'United States',
        locationString: 'Clovis, United States',
        coordinates: { lat: 34.41, lng: -103.21 },
        description: 'Clovis is a city in New Mexico.'
      };

      const result = formatGeographicContext(clovisVariant, 'Clovis, NM');
      expect(result).toBe('New Mexico, United States');
    });
  });
});



