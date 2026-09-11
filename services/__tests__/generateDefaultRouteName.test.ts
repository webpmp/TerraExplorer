import { describe, it, expect } from 'vitest';
import { generateDefaultRouteName } from '../queryNormalizer';

describe('generateDefaultRouteName', () => {
  it('derives a meaningful title from question queries', () => {
    expect(generateDefaultRouteName({ query: 'Where did the Panama Canal take place?' })).toBe('Panama Canal');
    expect(generateDefaultRouteName({ query: 'Where did the Trail of Tears take place?' })).toBe('Trail of Tears');
    expect(generateDefaultRouteName({ query: 'Show me the Renaissance route through Florence' })).toBe('Renaissance Route through Florence');
    expect(generateDefaultRouteName({ query: 'Show me the Silk Road' })).toBe('Silk Road');
    expect(generateDefaultRouteName({ query: 'Where was the 1715 Treasure Fleet found?' })).toBe('1715 Treasure Fleet');
  });

  it('preserves existing meaningful routeTitle', () => {
    expect(generateDefaultRouteName({
      routeTitle: 'Campaigns of Genghis Khan',
      query: 'Where did Genghis Khan fight?',
      locationName: 'Ulaanbaatar'
    })).toBe('Campaigns of Genghis Khan');
  });

  it('ignores generic placeholder titles such as "Route Context" or "Route"', () => {
    expect(generateDefaultRouteName({
      routeTitle: 'Route Context',
      query: 'Where did the Trail of Tears take place?',
      locationName: 'New Echota'
    })).toBe('Trail of Tears');

    expect(generateDefaultRouteName({
      routeTitle: 'Route',
      routeGroupName: 'Northern Route',
      locationName: 'New Echota'
    })).toBe('Northern Route');
  });

  it('falls back to routeGroupName when query and meaningful routeTitle are absent', () => {
    expect(generateDefaultRouteName({
      routeGroupName: 'Overland Route',
      locationName: 'Fort Cass'
    })).toBe('Overland Route');
  });

  it('falls back to locationName or canonicalName when no query or route group is present', () => {
    expect(generateDefaultRouteName({
      locationName: 'Machu Picchu'
    })).toBe('Machu Picchu');

    expect(generateDefaultRouteName({
      canonicalName: 'Historic Sanctuary of Machu Picchu'
    })).toBe('Historic Sanctuary of Machu Picchu');
  });

  it('falls back to "Saved Route" if all context is empty or placeholder', () => {
    expect(generateDefaultRouteName({
      routeTitle: 'Route Context',
      locationName: 'Saved Route'
    })).toBe('Saved Route');
  });
});
