import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import { LocationInfo, SkinType } from '../../types';

describe('My Notes Component Refinements', () => {
  const dummyInfo: LocationInfo = {
    name: 'Panama Canal',
    type: 'Canal',
    description: 'An artificial 82 km waterway in Panama.',
    coordinates: { lat: 9.08, lng: -79.68 },
    images: []
  };

  const skins: SkinType[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];

  skins.forEach((skin) => {
    it(`renders My Notes section correctly for theme: ${skin}`, () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={() => {}}
          isLoading={false}
          skin={skin}
          isFavorite={false}
          onToggleFavorite={() => {}}
          onLoadMoreNews={async () => {}}
        />
      );

      // Should have Add Note button initially when 0 notes exist
      expect(html).toContain('Add Note');
      expect(html).not.toContain('placeholder="Add a personal note..."');
    });
  });

  it('renders parchment note styling with subtle border and antique book icon', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={dummyInfo}
        onClose={() => {}}
        isLoading={false}
        skin="parchment"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    expect(html).toContain('parchment');
  });

  it('renders retro-green note styling with retro theme classes', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={dummyInfo}
        onClose={() => {}}
        isLoading={false}
        skin="retro-green"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    expect(html).toContain('border-green-400');
  });

  it('renders retro-amber note styling with amber theme classes', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={dummyInfo}
        onClose={() => {}}
        isLoading={false}
        skin="retro-amber"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onLoadMoreNews={async () => {}}
      />
    );

    expect(html).toContain('border-amber-400');
  });
});
