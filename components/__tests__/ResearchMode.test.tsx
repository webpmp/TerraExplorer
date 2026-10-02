import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import SettingsPanel from '../SettingsPanel';
import { getUserSettings } from '../../services/geminiService';
import { LocationInfo, SkinType, UserSettings } from '../../types';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) || null),
  setItem: vi.fn((key: string, value: string) => { storageMap.set(key, value); }),
  removeItem: vi.fn((key: string) => { storageMap.delete(key); }),
  clear: vi.fn(() => { storageMap.clear(); }),
  key: vi.fn(() => null),
  length: 0
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('Research Mode Suite', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  const dummyInfo: LocationInfo = {
    name: 'Kyoto Imperial Palace',
    type: 'Historical Site',
    description: 'The former ruling palace of the Emperor of Japan located in Kyoto Gyoen National Garden.',
    coordinates: { lat: 35.0254, lng: 135.7621 },
    images: []
  };

  const defaultUserSettings: UserSettings = {
    aiProvider: 'gemini',
    lmStudioUrl: 'http://localhost:1234/v1',
    lmStudioModel: 'local-model',
    newsProvider: 'gemini',
    newsApiKey: '',
    nytApiKey: '',
    newsDataApiKey: '',
    showNews: true,
    researchMode: false,
    documentaryMode: false,
    documentaryDuration: 5.5,
    narrationEnabled: false
  };

  describe('1. Default State & Settings Architecture', () => {
    it('Research Mode defaults to OFF in getUserSettings service', () => {
      // Clear localStorage if any
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('terraExplorerSettings');
      }
      const settings = getUserSettings();
      expect(settings.researchMode).toBe(false);
    });

    it('Research Mode defaults to OFF when parsed from incomplete localStorage payload', () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('terraExplorerSettings', JSON.stringify({ aiProvider: 'gemini', showNews: true }));
        const settings = getUserSettings();
        expect(settings.researchMode).toBe(false);
      }
    });

    it('Research Mode can be enabled from Settings panel', () => {
      const onUpdateSettings = vi.fn();
      const html = renderToStaticMarkup(
        <SettingsPanel
          settings={{ ...defaultUserSettings, researchMode: false }}
          onUpdateSettings={onUpdateSettings}
          onClose={vi.fn()}
          skin="modern"
          initialTab="general"
        />
      );

      expect(html).toContain('RESEARCH MODE');
      expect(html).toContain('aria-label="Toggle Research Mode"');
      expect(html).toContain('aria-checked="false"');
    });

    it('Research Mode can be disabled from Settings panel', () => {
      const onUpdateSettings = vi.fn();
      const html = renderToStaticMarkup(
        <SettingsPanel
          settings={{ ...defaultUserSettings, researchMode: true }}
          onUpdateSettings={onUpdateSettings}
          onClose={vi.fn()}
          skin="modern"
          initialTab="general"
        />
      );

      expect(html).toContain('RESEARCH MODE');
      expect(html).toContain('aria-label="Toggle Research Mode"');
      expect(html).toContain('aria-checked="true"');
    });
  });

  describe('2. InfoPanel Layout & Add Note Visibility', () => {
    it('Add Note is absent when Research Mode is OFF', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          isLoading={false}
          researchMode={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      // Add Note button and My Notes container are not in DOM
      expect(html).not.toContain('Add Note');
      expect(html).not.toContain('My Notes');
      expect(html).not.toContain('Write a note...');
    });

    it('Add Note is absent by default when researchMode prop is omitted', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      expect(html).not.toContain('Add Note');
      expect(html).not.toContain('My Notes');
    });

    it('Add Note is present when Research Mode is ON', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          isLoading={false}
          researchMode={true}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      expect(html).toContain('Add Note');
    });

    it('The InfoPanel uses the expanded layout when Research Mode is OFF (reclaiming vertical space with no sibling)', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          isLoading={false}
          researchMode={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      // Top-level container
      expect(html).toContain('data-testid="info-panel"');
      expect(html).toContain('max-h-[calc(100vh-342px)]');
      expect(html).toContain('flex flex-col');

      // Main box takes full available vertical height with scrollable container
      expect(html).toContain('info-panel-scrollable');
      expect(html).toContain('Kyoto Imperial Palace');

      // Verify no empty bottom panel or gap element exists
      expect(html).not.toContain('shrink-0 flex justify-center items-center');
    });

    it('The InfoPanel and Add Note coexist correctly when Research Mode is ON', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          isLoading={false}
          researchMode={true}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      // Main Info Panel content is present
      expect(html).toContain('Kyoto Imperial Palace');
      expect(html).toContain('info-panel-scrollable');

      // Add Note panel is rendered directly below InfoPanel
      expect(html).toContain('Add Note');
    });
  });

  describe('3. Multi-skin Compatibility & Add Note Functionality Preservation', () => {
    const skins: SkinType[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];

    skins.forEach((skin) => {
      it(`renders Add Note correctly in Research Mode ON across theme: ${skin}`, () => {
        const html = renderToStaticMarkup(
          <InfoPanel
            info={dummyInfo}
            onClose={vi.fn()}
            isLoading={false}
            researchMode={true}
            skin={skin}
            isFavorite={false}
            onSaveFavorite={vi.fn()}
            onRemoveFavorite={vi.fn()}
          />
        );

        expect(html).toContain('Add Note');
      });

      it(`completely hides Add Note in Research Mode OFF across theme: ${skin}`, () => {
        const html = renderToStaticMarkup(
          <InfoPanel
            info={dummyInfo}
            onClose={vi.fn()}
            isLoading={false}
            researchMode={false}
            skin={skin}
            isFavorite={false}
            onSaveFavorite={vi.fn()}
            onRemoveFavorite={vi.fn()}
          />
        );

        expect(html).not.toContain('Add Note');
        expect(html).not.toContain('My Notes');
      });
    });
  });
});
