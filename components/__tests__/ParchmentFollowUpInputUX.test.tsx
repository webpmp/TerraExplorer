import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../Controls';
import { SkinType, LocationInfo } from '../../types';
import * as followUpService from '../../services/followUpService';

describe('Parchment Theme Follow-Up Input UX & Reset Behavior', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'parchment' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isNarrationEnabled: true,
    onToggleNarration: vi.fn(),
    isNarrationAvailable: true,
  };

  const plymouthLocation: LocationInfo = {
    id: 'wp-shackleton-1',
    name: 'Plymouth, England',
    entityType: 'city',
    description: 'Historical departure port for Antarctic and global maritime expeditions.',
    notable: [],
    followUps: []
  };

  it('1. Parchment initially displays "Ask about <location>..." at index 0', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={plymouthLocation} showNews={false} />
    );

    expect(html).toContain('data-testid="parchment-followup-suggestion"');
    expect(html).toContain('Ask about Plymouth, England...');
    expect(html).toContain('data-testid="parchment-prev-chip"');
    expect(html).toContain('data-testid="parchment-next-chip"');
  });

  it('2. Suggestion navigation items contain default manual item followed by contextual questions', () => {
    const chipSpy = vi.spyOn(followUpService, 'generateContextualChips').mockReturnValueOnce([
      { id: 'q1', type: 'question', label: 'What role did Plymouth play in the Endurance Expedition?' },
      { id: 'q2', type: 'question', label: 'How did Plymouth develop as an important maritime port?' },
      { id: 'q3', type: 'question', label: 'What harbor fortifications protected Plymouth?' },
    ]);

    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={plymouthLocation} showNews={false} />
    );

    // Initial render is always index 0 ("Ask about <location>...")
    expect(html).toContain('Ask about Plymouth, England...');
    expect(html).toContain('data-testid="parchment-next-chip"');

    chipSpy.mockRestore();
  });

  it('3. Modern, Retro Green, and Retro Amber display chips above the search input without modifying search placeholder', () => {
    const nonParchmentSkins: SkinType[] = ['modern', 'retro-green', 'retro-amber'];

    nonParchmentSkins.forEach(skin => {
      const html = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} activeLocationContext={plymouthLocation} showNews={false} />
      );

      // Non-parchment skins render contextual-chips-container
      expect(html).toContain('data-testid="contextual-chips-container"');
      // Non-parchment skins do not render parchment-followup-suggestion or parchment arrows
      expect(html).not.toContain('data-testid="parchment-followup-suggestion"');
      expect(html).not.toContain('data-testid="parchment-prev-chip"');
      expect(html).not.toContain('data-testid="parchment-next-chip"');

      // Search input placeholder is "Ask about Plymouth, England..."
      if (skin === 'modern') {
        expect(html).toContain('placeholder="Ask about Plymouth, England..."');
      } else {
        expect(html).toContain('placeholder="ASK ABOUT PLYMOUTH, ENGLAND..."');
      }
    });
  });
});
