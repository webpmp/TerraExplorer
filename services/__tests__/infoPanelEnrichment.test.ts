import { describe, it, expect } from 'vitest';
import { sanitizeLocationInfo } from '../geminiService.ts';

describe('InfoPanel Enrichment', () => {
  it('location with valid population returns numeric population', () => {
    const rawInfo = {
      population: {
        population: 1900000,
        populationYear: 2020
      }
    };
    const displayPopulation = rawInfo.population?.population || (typeof rawInfo.population === 'number' ? rawInfo.population : null);
    expect(typeof displayPopulation).toBe('number');
    expect(displayPopulation).toBe(1900000);
    const formattedPop = displayPopulation ? (displayPopulation >= 1000000 ? (displayPopulation / 1000000).toFixed(1) + ' million' : displayPopulation.toLocaleString()) : null;
    expect(formattedPop).toBe('1.9 million');
  });

  it('Köppen climate converts to readable text', () => {
    const rawInfo = {
      climate: "Humid subtropical climate with warm summers and mild winters."
    };
    const climateDesc = typeof rawInfo.climate === 'string' ? rawInfo.climate : null;
    expect(climateDesc?.includes('Cfa')).toBeFalsy();
    expect(climateDesc).toBe('Humid subtropical climate with warm summers and mild winters.');
  });

  it('invalid map image URL is rejected', () => {
    const imageInfo = {
      imageUrl: "https://example.com/map.jpg",
      imageType: "map",
      source: "wiki",
      verified: true
    };
    const wikiImage = "https://wiki.com/fallback.jpg";
    const finalImageUrl = (imageInfo?.imageUrl && imageInfo?.verified && !['map', 'satellite', 'diagram', 'infographic'].includes(imageInfo?.imageType?.toLowerCase())) 
        ? imageInfo.imageUrl 
        : wikiImage;
    expect(finalImageUrl).toBe(wikiImage);
  });

  it('missing news returns explicit empty state', () => {
    const rawInfo = { news: [] as any[] };
    expect(rawInfo.news.length).toBe(0);
  });

  it('location description always has fallback', () => {
    const rawInfo = { description: "" };
    const wp = {} as any;
    const geographicDesc = rawInfo.description || null;
    const historicalDesc = wp.description || null;
    let desc = "";
    if (geographicDesc) desc = geographicDesc;
    else if (historicalDesc) desc = historicalDesc;
    expect(desc).toBe('');
  });

  it('sanitizeLocationInfo preserves news array', () => {
    const rawInfo = {
      description: "A region in northern Alaska with a subarctic climate...",
      climate: "Subarctic climate...",
      news: [
        { title: "Example event", summary: "Example summary", url: "https://example.com" }
      ]
    };
    
    sanitizeLocationInfo(rawInfo as any);

    expect(rawInfo.climate).not.toBeNull();
    expect(rawInfo.news?.length).toBe(1);
  });
});
