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
});
