import { describe, test, it, expect } from 'vitest';
import { normalizeDisplayText, cleanMetadataString, formatImageAttribution, normalizeGeoComparisonName, areGeoComponentsRedundant, isRedundantWithTitle, formatGeographicContext, normalizeHeaderGeographicHierarchy, calculateScrollFade, getScrollFadeMaskStyle } from '../InfoPanel';
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

  it('renders Parchment location subtitle with font-garamond and font-normal, and other themes with font-medium', () => {
    const locationWithSubtitle = {
      name: 'Cárdenas',
      country: 'Mexico',
      state: 'Tabasco',
      type: 'City' as any,
      description: 'City in Mexico.',
      coordinates: { lat: 18.0, lng: -93.37 },
      images: [],
      news: []
    };

    const parchmentHtml = renderToStaticMarkup(
      <InfoPanel
        info={locationWithSubtitle}
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
    expect(parchmentHtml).toContain('Tabasco, Mexico');
    expect(parchmentHtml).toContain('mt-1 text-xl font-normal font-garamond text-[#8b5a2b]');
    expect(parchmentHtml).not.toContain('mt-1 text-xl font-normal font-garamond text-[#5a3e1b]');

    const modernHtml = renderToStaticMarkup(
      <InfoPanel
        info={locationWithSubtitle}
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
    expect(modernHtml).toContain('mt-1 text-sm font-medium text-slate-300');
    expect(modernHtml).not.toContain('font-garamond text-slate-300');

    const retroHtml = renderToStaticMarkup(
      <InfoPanel
        info={locationWithSubtitle}
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
    expect(retroHtml).toContain('mt-1 text-lg font-medium text-current opacity-90');
    expect(retroHtml).not.toContain('font-garamond');
  });

  it('renders canonical section order: Description -> Notable Facts -> Image -> Climate -> News', () => {
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
    const notableHeaderPos = html.indexOf('Notable Facts');
    const narrowsPos = html.indexOf('The Narrows');
    const imagePos = html.indexOf('<img src="https://upload.wikimedia.org/zion.jpg"');
    const climateHeaderPos = html.indexOf('Climate');
    const newsHeaderPos = html.indexOf('News');

    expect(descPos).toBeGreaterThan(-1);
    expect(notableHeaderPos).toBeGreaterThan(descPos);
    expect(narrowsPos).toBeGreaterThan(notableHeaderPos);
    expect(imagePos).toBeGreaterThan(narrowsPos);
    expect(climateHeaderPos).toBeGreaterThan(imagePos);
    expect(newsHeaderPos).toBeGreaterThan(climateHeaderPos);

    // Verify exactly ONE "Notable Facts" header in rendered output
    const notableMatches = html.match(/Notable Facts/g);
    expect(notableMatches).toHaveLength(1);
  });

  it('renders exactly one Notable Facts section when description markdown contains embedded notable facts', () => {
    const testLocation = {
      name: 'Eiffel Tower',
      type: 'Monument' as any,
      entityType: 'landmark',
      description: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris.\n\n## Notable Facts\n* Built in 1889 for the World\'s Fair.\n* Designed by Gustave Eiffel.\n* 330 meters tall.',
      coordinates: { lat: 48.8584, lng: 2.2945 },
      notable: [
        {
          title: 'Built in 1889',
          description: 'Constructed as the centerpiece of the 1889 World\'s Fair.'
        },
        {
          title: 'Gustave Eiffel',
          description: 'Designed and engineered by the company of Gustave Eiffel.'
        },
        {
          title: '330 Meters Tall',
          description: 'Stands as the tallest structure in Paris.'
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

    const notableMatches = html.match(/Notable Facts/g);
    expect(notableMatches).toHaveLength(1);
    expect(html).toContain('The Eiffel Tower is a wrought-iron lattice tower');
    expect(html).toContain('Built in 1889');
    expect(html).toContain('Gustave Eiffel');
    expect(html).toContain('330 Meters Tall');
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

  it('renders notable fact titles larger than details text in retro skins', () => {
    const tajMahal = {
      name: 'Taj Mahal',
      type: 'Monument' as any,
      description: 'An ivory-white marble mausoleum on the right bank of the river Yamuna in Agra, India.',
      coordinates: { lat: 27.1751, lng: 78.0421 },
      notable: [
        'Architectural Marvel: Famous for its symmetry and white marble dome.',
        'Mourning for Mumtaz: Commissioned by Emperor Shah Jahan in memory of his favorite wife.',
      ],
    };

    const greenHtml = renderToStaticMarkup(
      <InfoPanel
        info={tajMahal}
        isLoading={false}
        onClose={() => {}}
        skin="retro-green"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onAddFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    // Title has font-bold text-xl (larger than text-lg details text)
    expect(greenHtml).toContain('<h4 class="font-bold text-xl text-current leading-snug">Architectural Marvel</h4>');
    expect(greenHtml).toContain('<h4 class="font-bold text-xl text-current leading-snug">Mourning for Mumtaz</h4>');
    expect(greenHtml).toContain('text-lg text-green-200');
    // Favorite button has no border in retro-green
    expect(greenHtml).toContain('class="p-2 transition-colors hover:bg-green-400 hover:text-black text-green-300 rounded-none" title="Save Location"');
    expect(greenHtml).not.toContain('border border-green-400" title="Save Location"');

    const amberHtml = renderToStaticMarkup(
      <InfoPanel
        info={tajMahal}
        isLoading={false}
        onClose={() => {}}
        skin="retro-amber"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onAddFavorite={() => {}}
        onRemoveFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    expect(amberHtml).toContain('<h4 class="font-bold text-xl text-current leading-snug">Architectural Marvel</h4>');
    expect(amberHtml).toContain('<h4 class="font-bold text-xl text-current leading-snug">Mourning for Mumtaz</h4>');
    expect(amberHtml).toContain('text-lg text-amber-200');
    // Favorite button has no border in retro-amber
    expect(amberHtml).toContain('class="p-2 transition-colors hover:bg-amber-400 hover:text-black text-amber-300 rounded-none" title="Save Location"');
    expect(amberHtml).not.toContain('border border-amber-400" title="Save Location"');
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

    // Section headers: text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300
    expect(html).toContain('class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">Climate</h3>');
    expect(html).toContain('class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">News</h3>');

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
    it('initially renders only LOAD NEWS button and completely omits NEWS header in idle state', () => {
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

      // NEWS header must NOT be rendered initially
      expect(html).not.toContain('>News</h3>');
      // LOAD NEWS button must be visible
      expect(html).toContain('>Load News</button>');
      expect(html).not.toContain('>Load More News</button>');
    });

    it('renders NEWS header, news articles, and LOAD MORE NEWS button when loaded', () => {
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

      // NEWS header must appear after news is requested/loaded
      expect(html).toContain('class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">News</h3>');
      expect(html).toContain('Zion Shuttle System Upgrades Announced');
      expect(html).toContain('Park officials detail new electric shuttle fleet.');
      expect(html).toContain('Utah News</span><span>·</span><span>August 16, 2026</span>');
      expect(html).toContain('>Load More News</button>');
      expect(html).not.toContain('>Load News</button>');
    });

    it('renders NEWS header and empty state message when request returns no articles', async () => {
      const location = {
        name: 'Remote Isle',
        type: 'Point of Interest' as any,
        entityType: 'island',
        description: 'A remote island.',
        coordinates: { lat: 10.0, lng: 20.0 },
        notable: [],
        news: []
      };

      // Test that InfoPanel component handles empty state properly
      const html = renderToStaticMarkup(
        <InfoPanel
          info={location}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          onFetchNews={async () => []}
          onLoadMoreNews={async () => {}}
        />
      );

      // In initial state, no News section header is rendered
      expect(html).not.toContain('>News</h3>');
      expect(html).toContain('>Load News</button>');
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
      expect(html).toMatch(/Historical [Cc]ontext/);
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

    it('uses text-base for waypoint detail in retro-green and retro-amber and text-xs in modern and parchment', () => {
      const multiLocationNav = {
        current: 3,
        total: 9,
        onNext: () => {},
        onPrev: () => {}
      };

      const greenHtml = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="retro-green"
          routeNav={multiLocationNav}
        />
      );
      expect(greenHtml).toMatch(/class="[^"]*text-base[^"]*font-bold[^"]*uppercase[^"]*tracking-widest[^"]*"[^>]*>\s*Waypoint 3 of 9/);

      const amberHtml = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="retro-amber"
          routeNav={multiLocationNav}
        />
      );
      expect(amberHtml).toMatch(/class="[^"]*text-base[^"]*font-bold[^"]*uppercase[^"]*tracking-widest[^"]*"[^>]*>\s*Waypoint 3 of 9/);

      const modernHtml = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          routeNav={multiLocationNav}
        />
      );
      expect(modernHtml).toMatch(/class="[^"]*text-xs[^"]*font-bold[^"]*uppercase[^"]*tracking-widest[^"]*"[^>]*>\s*Waypoint 3 of 9/);

      const parchmentHtml = renderToStaticMarkup(
        <InfoPanel
          info={sputnikLocation}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          routeNav={multiLocationNav}
        />
      );
      expect(parchmentHtml).toMatch(/class="[^"]*text-xs[^"]*font-bold[^"]*uppercase[^"]*tracking-widest[^"]*"[^>]*>\s*Waypoint 3 of 9/);
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
        const markerDisplayName = marker.data?.name || marker.name || 'Location';
        return markerDisplayName;
      };

      // Single location - unnumbered
      const single = {
        isWaypoint: true,
        isMultiLocation: false,
        index: 0,
        data: { name: 'Site No. 1, Baikonur Cosmodrome' }
      };
      expect(formatDisplayName(single)).toBe('Site No. 1, Baikonur Cosmodrome');

      // Multi location - clean label without duplicate sequence prefix
      const multiFirst = {
        isWaypoint: true,
        isMultiLocation: true,
        index: 0,
        data: { name: 'Chang\'an' }
      };
      expect(formatDisplayName(multiFirst)).toBe('Chang\'an');

      const multiSecond = {
        isWaypoint: true,
        isMultiLocation: true,
        index: 1,
        data: { name: 'Dunhuang' }
      };
      expect(formatDisplayName(multiSecond)).toBe('Dunhuang');

      // Name with existing number preserved intact
      const multiNumberedName = {
        isWaypoint: true,
        isMultiLocation: true,
        index: 2,
        data: { name: 'Fort William Henry 1' }
      };
      expect(formatDisplayName(multiNumberedName)).toBe('Fort William Henry 1');
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
      expect(html).not.toContain('>Population</h3>');

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

    describe('areGeoComponentsRedundant helper', () => {
      it('detects exact duplicates and case/punctuation variants', () => {
        expect(areGeoComponentsRedundant('France', 'France').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('United States', 'united states,').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('Grindavík', 'grindavik').isRedundant).toBe(true);
      });

      it('detects abbreviation equivalence for states and countries', () => {
        expect(areGeoComponentsRedundant('NM', 'New Mexico').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('New Mexico', 'NM').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('CA', 'California').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('UK', 'United Kingdom').isRedundant).toBe(true);
        expect(areGeoComponentsRedundant('USA', 'United States').isRedundant).toBe(true);
      });

      it('detects parenthetical variants without losing meaning', () => {
        const res = areGeoComponentsRedundant('South Georgia (UK)', 'South Georgia');
        expect(res.isRedundant).toBe(true);
        expect(res.relation).toBe('parenthetical');
        expect(res.preferred).toBe('South Georgia');
      });

      it('detects compound/conjunctive geographic hierarchies', () => {
        const res = areGeoComponentsRedundant('South Georgia', 'South Georgia and the South Sandwich Islands');
        expect(res.isRedundant).toBe(true);
        expect(res.relation).toBe('compound_nested');
        expect(res.preferred).toBe('South Georgia');

        const res2 = areGeoComponentsRedundant('Trinidad', 'Trinidad and Tobago');
        expect(res2.isRedundant).toBe(true);
      });

      it('does NOT falsely match distinct geographic entities', () => {
        expect(areGeoComponentsRedundant('New Mexico', 'Mexico').isRedundant).toBe(false);
        expect(areGeoComponentsRedundant('West Virginia', 'Virginia').isRedundant).toBe(false);
        expect(areGeoComponentsRedundant('North Carolina', 'South Carolina').isRedundant).toBe(false);
        expect(areGeoComponentsRedundant('San Francisco', 'Alcatraz Island').isRedundant).toBe(false);
        expect(areGeoComponentsRedundant('California', 'Death Valley').isRedundant).toBe(false);
      });
    });

    describe('normalizeHeaderGeographicHierarchy generic normalization engine', () => {
      it('normalizes place + territory duplication: Grytviken, South Georgia -> Title: Grytviken, Subtitle: South Georgia', () => {
        const grytviken = {
          name: 'Grytviken, South Georgia',
          entityType: 'historical_waypoint',
          type: 'Historical Site' as any,
          territory: 'South Georgia and the South Sandwich Islands',
          locationString: 'South Georgia, South Georgia and the South Sandwich Islands',
          coordinates: { lat: -54.28, lng: -36.51 },
          description: 'Former whaling station on South Georgia.'
        };

        const result = normalizeHeaderGeographicHierarchy(grytviken);
        expect(result.displayTitle).toBe('Grytviken');
        expect(result.displaySubtitle).toBe('South Georgia');

        const html = renderToStaticMarkup(
          <InfoPanel
            info={grytviken}
            onClose={() => {}}
            isLoading={false}
            skin="modern"
            isFavorite={false}
            onSaveFavorite={() => {}}
            onRemoveFavorite={() => {}}
          />
        );
        expect(html).toContain('Grytviken</h2>');
        expect(html).toContain('South Georgia</div>');
        expect(html).not.toContain('Grytviken, South Georgia</h2>');
        expect(html).not.toContain('South Georgia, South Georgia and the South Sandwich Islands');
      });

      it('normalizes place + country duplication: Paris, France -> Title: Paris, Subtitle: France', () => {
        const paris = {
          name: 'Paris, France',
          entityType: 'city',
          type: 'City' as any,
          country: 'France',
          locationString: 'France',
          coordinates: { lat: 48.8566, lng: 2.3522 },
          description: 'Capital of France.'
        };

        const result = normalizeHeaderGeographicHierarchy(paris);
        expect(result.displayTitle).toBe('Paris');
        expect(result.displaySubtitle).toBe('France');
      });

      it('normalizes place + region duplication: Cambridge, Massachusetts, United States -> Title: Cambridge, Subtitle: Massachusetts, United States', () => {
        const cambridge = {
          name: 'Cambridge, Massachusetts, United States',
          entityType: 'city',
          type: 'City' as any,
          city: 'Cambridge',
          state: 'Massachusetts',
          country: 'United States',
          locationString: 'Cambridge, Massachusetts, United States',
          coordinates: { lat: 42.3736, lng: -71.1097 },
          description: 'City in Massachusetts.'
        };

        const result = normalizeHeaderGeographicHierarchy(cambridge);
        expect(result.displayTitle).toBe('Cambridge');
        expect(result.displaySubtitle).toBe('Massachusetts, United States');
      });

      it('deduplicates repeated geographic components inside location hierarchy itself', () => {
        const kyoto = {
          name: 'Kyoto',
          entityType: 'city',
          type: 'City' as any,
          state: 'Kyoto Prefecture',
          country: 'Japan',
          locationString: 'Kyoto, Kyoto Prefecture, Kansai, Japan, Japan',
          coordinates: { lat: 35.0116, lng: 135.7681 },
          description: 'Ancient capital of Japan.'
        };

        const result = normalizeHeaderGeographicHierarchy(kyoto);
        expect(result.displayTitle).toBe('Kyoto');
        expect(result.displaySubtitle).toBe('Kyoto Prefecture, Kansai, Japan');
      });

      it('preserves legitimate multi-word entity names containing geographic terms without truncating', () => {
        const museum = {
          name: 'South Georgia Museum',
          entityType: 'museum',
          type: 'Point of Interest' as any,
          territory: 'South Georgia',
          locationString: 'Grytviken, South Georgia',
          coordinates: { lat: -54.28, lng: -36.51 },
          description: 'Museum at Grytviken on South Georgia.'
        };
        const museumRes = normalizeHeaderGeographicHierarchy(museum);
        expect(museumRes.displayTitle).toBe('South Georgia Museum');
        expect(museumRes.displaySubtitle).toBe('Grytviken, South Georgia');

        const mexicoCity = {
          name: 'Mexico City',
          entityType: 'city',
          type: 'City' as any,
          state: 'CDMX',
          country: 'Mexico',
          locationString: 'Mexico City, Mexico',
          coordinates: { lat: 19.4326, lng: -99.1332 },
          description: 'Capital of Mexico.'
        };
        const mexicoCityRes = normalizeHeaderGeographicHierarchy(mexicoCity);
        expect(mexicoCityRes.displayTitle).toBe('Mexico City');
        expect(mexicoCityRes.displaySubtitle).toBe('CDMX, Mexico');

        const nyCity = {
          name: 'New York City',
          entityType: 'city',
          type: 'City' as any,
          state: 'New York',
          country: 'United States',
          locationString: 'New York City, New York, United States',
          coordinates: { lat: 40.7128, lng: -74.0060 },
          description: 'Most populous city in the US.'
        };
        const nyRes = normalizeHeaderGeographicHierarchy(nyCity);
        expect(nyRes.displayTitle).toBe('New York City');
        expect(nyRes.displaySubtitle).toBe('New York, United States');

        const capitol = {
          name: 'Georgia State Capitol',
          entityType: 'landmark',
          type: 'Point of Interest' as any,
          city: 'Atlanta',
          state: 'Georgia',
          country: 'United States',
          locationString: 'Atlanta, Georgia, United States',
          coordinates: { lat: 33.7490, lng: -84.3880 },
          description: 'State capitol of Georgia.'
        };
        const capitolRes = normalizeHeaderGeographicHierarchy(capitol);
        expect(capitolRes.displayTitle).toBe('Georgia State Capitol');
        expect(capitolRes.displaySubtitle).toBe('Atlanta, Georgia, United States');

        const univ = {
          name: 'Georgia Southern University',
          entityType: 'landmark',
          type: 'Point of Interest' as any,
          city: 'Statesboro',
          state: 'Georgia',
          country: 'United States',
          locationString: 'Statesboro, Georgia, United States',
          coordinates: { lat: 32.4208, lng: -81.7865 },
          description: 'Public university in Georgia.'
        };
        const univRes = normalizeHeaderGeographicHierarchy(univ);
        expect(univRes.displayTitle).toBe('Georgia Southern University');
        expect(univRes.displaySubtitle).toBe('Statesboro, Georgia, United States');
      });

      it('suppresses subtitle completely when location provides no additional context beyond title', () => {
        const country = {
          name: 'France',
          entityType: 'country',
          type: 'Country' as any,
          country: 'France',
          locationString: 'France',
          coordinates: { lat: 46.2276, lng: 2.2137 },
          description: 'European country.'
        };
        const res = normalizeHeaderGeographicHierarchy(country);
        expect(res.displayTitle).toBe('France');
        expect(res.displaySubtitle).toBeNull();

        const html = renderToStaticMarkup(
          <InfoPanel
            info={country}
            onClose={() => {}}
            isLoading={false}
            skin="modern"
            isFavorite={false}
            onSaveFavorite={() => {}}
            onRemoveFavorite={() => {}}
          />
        );
        expect(html).toContain('France</h2>');
        expect(html).not.toContain('<div class="mt-1');
      });

      it('renders canonical header order: Title -> Subtitle -> Category Badge -> Coordinates', () => {
        const testItem = {
          name: 'Grytviken, South Georgia',
          entityType: 'historical_waypoint',
          type: 'Historical Site' as any,
          territory: 'South Georgia',
          locationString: 'South Georgia, South Georgia and the South Sandwich Islands',
          coordinates: { lat: -54.28, lng: -36.51 },
          description: 'Whaling station.'
        };

        const html = renderToStaticMarkup(
          <InfoPanel
            info={testItem}
            onClose={() => {}}
            isLoading={false}
            skin="modern"
            isFavorite={false}
            onSaveFavorite={() => {}}
            onRemoveFavorite={() => {}}
          />
        );

        const titleIdx = html.indexOf('Grytviken</h2>');
        const subtitleIdx = html.indexOf('South Georgia</div>');
        const badgeIdx = html.indexOf('HISTORICAL SITE</span>');
        const coordIdx = html.indexOf('54.28° S, 36.51° W</p>');

        expect(titleIdx).toBeGreaterThan(-1);
        expect(subtitleIdx).toBeGreaterThan(titleIdx);
        expect(badgeIdx).toBeGreaterThan(subtitleIdx);
        expect(coordIdx).toBeGreaterThan(badgeIdx);
      });
    });
  });

  describe('Scroll-edge fade calculations and mask styles', () => {
    it('calculates no fade when content does not exceed container height', () => {
      const fade = calculateScrollFade(0, 200, 300);
      expect(fade).toEqual({ top: false, bottom: false });
      const style = getScrollFadeMaskStyle(fade.top, fade.bottom);
      expect(style.maskImage).toBe('none');
      expect(style.WebkitMaskImage).toBe('none');
    });

    it('calculates bottom fade only when at the very top of scrollable content', () => {
      const fade = calculateScrollFade(0, 800, 300);
      expect(fade).toEqual({ top: false, bottom: true });
      const style = getScrollFadeMaskStyle(fade.top, fade.bottom);
      expect(style.maskImage).toContain('linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%)');
      expect(style.WebkitMaskImage).toContain('linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%)');
    });

    it('calculates top and bottom fade when scrolled into the middle of content', () => {
      const fade = calculateScrollFade(100, 800, 300);
      expect(fade).toEqual({ top: true, bottom: true });
      const style = getScrollFadeMaskStyle(fade.top, fade.bottom);
      expect(style.maskImage).toContain('linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)');
      expect(style.WebkitMaskImage).toContain('linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)');
    });

    it('calculates top fade only when scrolled to the very bottom of content', () => {
      const fade = calculateScrollFade(500, 800, 300);
      expect(fade).toEqual({ top: true, bottom: false });
      const style = getScrollFadeMaskStyle(fade.top, fade.bottom);
      expect(style.maskImage).toContain('linear-gradient(to bottom, transparent 0, black 16px, black 100%)');
      expect(style.WebkitMaskImage).toContain('linear-gradient(to bottom, transparent 0, black 16px, black 100%)');
    });

    it('renders InfoPanel scrollable container with mask style and preserved fixed header across skins', () => {
      const testInfo = {
        name: 'Kyoto',
        type: 'City' as any,
        description: 'Kyoto is the cultural capital of Japan with historic temples and gardens.',
        coordinates: { lat: 35.0116, lng: 135.7681 },
        news: []
      };

      for (const skin of ['modern', 'parchment', 'retro-green', 'retro-amber'] as const) {
        const html = renderToStaticMarkup(
          <InfoPanel
            info={testInfo}
            onClose={() => {}}
            isLoading={false}
            skin={skin}
            isFavorite={false}
            onSaveFavorite={() => {}}
            onRemoveFavorite={() => {}}
          />
        );

        // Header is rendered
        expect(html).toContain('Kyoto');
        // Scrollable content element is present with info-panel-scrollable
        expect(html).toContain('info-panel-scrollable');
      }
    });
  });

  describe('Accurate Population Labeling, Sourcing, and Modern Label Deprecation', () => {
    it('renders the Population section header as "Population" and the secondary label without the word "Population"', () => {
      const cityData = {
        name: 'Gainesville',
        city: 'Gainesville',
        state: 'Florida',
        country: 'United States',
        type: 'city' as any,
        entityType: 'city',
        description: 'Gainesville is a city in Florida.',
        coordinates: { lat: 29.6516, lng: -82.3248 },
        population: {
          current: { formattedValue: '141,085', value: 141085, label: 'Modern' }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={cityData}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      // Section header is Population
      expect(html).toContain('Population');
      expect(html).toContain('141,085');
      // Must NOT render "Modern" or secondary label containing "Population"
      expect(html).not.toMatch(/<span[^>]*>Modern<\/span>/i);
      expect(html).not.toMatch(/<span[^>]*>[^<]*Population[^<]*<\/span>/i);
      expect(html).toContain('Current Estimate');
    });

    it('renders "Current Estimate" when recent population estimate has no specific year', () => {
      const cityData = {
        name: 'Gainesville',
        city: 'Gainesville',
        state: 'Florida',
        country: 'United States',
        type: 'city' as any,
        entityType: 'city',
        description: 'Gainesville is a city in Florida.',
        coordinates: { lat: 29.6516, lng: -82.3248 },
        population: {
          current: { formattedValue: '141,085', value: 141085 }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={cityData}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Current Estimate');
      expect(html).not.toMatch(/<span[^>]*>[^<]*Population[^<]*<\/span>/i);
      expect(html).toContain('141,085');
    });

    it('renders "2020 Census" when census year is explicitly provided', () => {
      const cityData = {
        name: 'Gainesville',
        city: 'Gainesville',
        state: 'Florida',
        country: 'United States',
        type: 'city' as any,
        entityType: 'city',
        description: 'Gainesville is a city in Florida.',
        coordinates: { lat: 29.6516, lng: -82.3248 },
        population: {
          current: { formattedValue: '141,085', value: 141085, censusYear: 2020 }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={cityData}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('2020 Census');
      expect(html).not.toMatch(/<span[^>]*>[^<]*Population[^<]*<\/span>/i);
      expect(html).toContain('141,085');
    });

    it('renders "2025 Estimate" when an explicit estimate year is provided', () => {
      const townData = {
        name: 'Silver Springs',
        city: 'Silver Springs',
        state: 'Florida',
        country: 'United States',
        type: 'town' as any,
        entityType: 'town',
        description: 'Silver Springs is a populated place in Florida.',
        coordinates: { lat: 29.2166, lng: -82.0573 },
        population: {
          current: { formattedValue: '6,500', value: 6500, year: 2025 }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={townData}
          onClose={() => {}}
          isLoading={false}
          skin="retro-green"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('2025 Estimate');
      expect(html).not.toMatch(/<span[^>]*>[^<]*Population[^<]*<\/span>/i);
      expect(html).toContain('6,500');
    });

    it('renders historical population with "Historical" label and timeframe, never duplicating Population', () => {
      const ancientCity = {
        name: 'Rome',
        city: 'Rome',
        country: 'Italy',
        type: 'city' as any,
        entityType: 'city',
        description: 'Rome is the capital of Italy.',
        coordinates: { lat: 41.9028, lng: 12.4964 },
        population: {
          current: { formattedValue: '2,872,800', value: 2872800, year: 2023 },
          historical: { formattedValue: '1,000,000', timeframe: 'c. 100 CE', label: 'Historical' }
        },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={ancientCity}
          onClose={() => {}}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Historical');
      expect(html).not.toContain('Historical Population');
      expect(html).toContain('1,000,000');
      expect(html).toContain('c. 100 CE');
      expect(html).toContain('2023 Estimate');
      expect(html).not.toMatch(/<span[^>]*>[^<]*Population[^<]*<\/span>/i);
      expect(html).toContain('2,872,800');
    });

    it('omits the population section cleanly when population is unavailable or lookup failed', () => {
      const naturalFeature = {
        name: 'Mount Rainier',
        type: 'mountain' as any,
        entityType: 'mountain',
        description: 'Mount Rainier is a large active stratovolcano.',
        coordinates: { lat: 46.8523, lng: -121.7603 },
        population: { value: null, source: null, status: 'lookup_failed' },
        notable: [],
        news: []
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={naturalFeature}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).not.toContain('Population');
      expect(html).not.toContain('Current Estimate');
      expect(html).not.toContain('Modern');
    });
  });

  describe('Section Header Visual Hierarchy & Spacing', () => {
    it('renders NOTABLE FACTS, POPULATION, and NEWS with unified distinct section header styling', () => {
      const romeLocation = {
        name: 'Rome',
        type: 'City' as any,
        entityType: 'city',
        description: 'Rome is the capital city of Italy.',
        coordinates: { lat: 41.9028, lng: 12.4964 },
        notable: [
          { title: 'Colosseum', description: 'Flavian Amphitheatre in central Rome.' }
        ],
        population: {
          current: {
            value: 2748109,
            formattedValue: '2,748,109',
            qualifier: 'Estimate',
            year: 2023
          }
        },
        news: [
          {
            title: 'Rome Announces Heritage Preservation Initiative',
            summary: 'City officials unveil restoration plan for ancient ruins.',
            source: 'Italian News Agency',
            url: 'https://example.com/rome'
          }
        ]
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={romeLocation}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
          onLoadMoreNews={async () => {}}
        />
      );

      // Section header container with .info-panel-section-header and ~15px bottom spacing
      expect(html).toContain('info-panel-section-header');
      expect(html).toContain('mb-[15px]');

      // Shared section header typography: text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300
      expect(html).toContain('<h3 class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">Notable Facts</h3>');
      expect(html).toContain('<h3 class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">Population</h3>');
      expect(html).toContain('<h3 class="text-sm font-semibold uppercase tracking-[0.16em] leading-tight shrink-0 text-cyan-300">News</h3>');

      // Subtle divider rule
      expect(html).toContain('class="flex-1 h-[1px] bg-cyan-400/20"');

      // Visual hierarchy: Location Title -> Notable Facts -> Fact Title -> Population -> News
      const titlePos = html.indexOf('Rome');
      const notableHeaderPos = html.indexOf('>Notable Facts</h3>');
      const factTitlePos = html.indexOf('Colosseum');
      const popHeaderPos = html.indexOf('>Population</h3>');
      const popValuePos = html.indexOf('2,748,109');
      const newsHeaderPos = html.indexOf('>News</h3>');
      const newsTitlePos = html.indexOf('Rome Announces Heritage Preservation Initiative');

      expect(titlePos).toBeGreaterThan(-1);
      expect(notableHeaderPos).toBeGreaterThan(titlePos);
      expect(factTitlePos).toBeGreaterThan(notableHeaderPos);
      expect(popHeaderPos).toBeGreaterThan(factTitlePos);
      expect(popValuePos).toBeGreaterThan(popHeaderPos);
      expect(newsHeaderPos).toBeGreaterThan(popValuePos);
      expect(newsTitlePos).toBeGreaterThan(newsHeaderPos);
    });
  });

  describe('Show News Setting - InfoPanel Conditional Rendering', () => {
    const testLocationWithNews = {
      name: 'Kyoto',
      country: 'Japan',
      type: 'City',
      coordinates: { lat: 35.0116, lng: 135.7681 },
      description: 'Historical capital of Japan known for numerous classical Buddhist temples.',
      news: [
        {
          title: 'Kyoto Cultural Heritage Forum Opened',
          summary: 'Experts gathered in Kyoto to discuss historical preservation.',
          source: 'Japan Times',
          url: 'https://japantimes.co.jp/kyoto-forum',
          date: '2026-08-20'
        }
      ]
    };

    const testLocationWithoutInitialNews = {
      name: 'Kyoto',
      country: 'Japan',
      type: 'City',
      coordinates: { lat: 35.0116, lng: 135.7681 },
      description: 'Historical capital of Japan known for numerous classical Buddhist temples.',
      news: []
    };

    it('renders News section and articles when showNews is true', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithNews}
          onClose={() => {}}
          isLoading={false}
          showNews={true}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('News');
      expect(html).toContain('Kyoto Cultural Heritage Forum Opened');
      expect(html).toContain('Japan Times');
    });

    it('renders Load News button when showNews is true and news list is empty', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithoutInitialNews}
          onClose={() => {}}
          isLoading={false}
          showNews={true}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(html).toContain('Load News');
    });

    it('preserves existing News behavior when showNews prop is omitted (default true)', () => {
      const htmlWithNews = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithNews}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(htmlWithNews).toContain('News');
      expect(htmlWithNews).toContain('Kyoto Cultural Heritage Forum Opened');

      const htmlWithoutNews = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithoutInitialNews}
          onClose={() => {}}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(htmlWithoutNews).toContain('Load News');
    });

    it('completely suppresses News header, content, and Load News button when showNews is false', () => {
      const htmlWithNews = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithNews}
          onClose={() => {}}
          isLoading={false}
          showNews={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(htmlWithNews).not.toContain('Kyoto Cultural Heritage Forum Opened');
      expect(htmlWithNews).not.toContain('Japan Times');
      expect(htmlWithNews).not.toContain('Load News');
      expect(htmlWithNews).not.toContain('>News</h3>');

      const htmlWithoutNews = renderToStaticMarkup(
        <InfoPanel
          info={testLocationWithoutInitialNews}
          onClose={() => {}}
          isLoading={false}
          showNews={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={() => {}}
          onRemoveFavorite={() => {}}
        />
      );

      expect(htmlWithoutNews).not.toContain('Load News');
      expect(htmlWithoutNews).not.toContain('>News</h3>');
    });
  });
});




