import React from 'react';
import { describe, test, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../SettingsPanel';
import { SkinType, UserSettings } from '../../types';

describe('SettingsPanel - Top-Level Tab Reorganization', () => {
  const baseSettings: UserSettings = {
    aiProvider: 'lmstudio',
    lmStudioUrl: 'http://localhost:1234/v1',
    lmStudioModel: 'llama-3-8b-instruct',
    newsProvider: 'nyt',
    newsApiKey: 'test-news-key',
    nytApiKey: 'test-nyt-key',
    newsDataApiKey: 'test-newsdata-key',
    showNews: true,
    documentaryMode: true,
    documentaryDuration: 10.0,
    narrationEnabled: true,
    narrationVoice: 'Google US English',
    narrationSpeed: 0.9,
    narrationVolume: 0.75
  };

  const baseProps = {
    settings: baseSettings,
    onUpdateSettings: vi.fn(),
    onClose: vi.fn(),
    skin: 'modern' as SkinType
  };

  test('1. Renders 3 top-level tabs in the navigation bar', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} />);

    // Tablist container
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Settings categories"');

    // 3 Tab buttons
    expect(html).toContain('id="settings-tab-ai"');
    expect(html).toContain('AI PROVIDER');
    expect(html).toContain('id="settings-tab-documentary"');
    expect(html).toContain('DOC MODE');
    expect(html).not.toContain('DOCUMENTARY MODE');
    expect(html).toContain('id="settings-tab-news"');
    expect(html).toContain('NEWS');

    // AI Provider is active by default
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('id="settings-tabpanel-ai"');
    expect(html).toContain('aria-labelledby="settings-tab-ai"');
  });

  test('2. AI Provider tab displays LM Studio configuration correctly', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} />);

    // Dropdown with Local (LM Studio)
    expect(html).toContain('Local (LM Studio)');
    expect(html).toContain('value="lmstudio"');
    expect(html).toContain('Gemini');

    // LM Studio API URL input with existing setting preserved
    expect(html).toContain('value="http://localhost:1234/v1"');
    expect(html).toContain('Must include /v1 for OpenAI compatibility.');

    // Action buttons
    expect(html).toContain('Detect');
    expect(html).toContain('Test Connection');
  });

  test('3. Tab navigation bar adapts styling for each theme', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const html = renderToStaticMarkup(<SettingsPanel {...baseProps} skin={skin} />);

      if (skin === 'modern') {
        expect(html).toContain('border-cyan-400');
        expect(html).toContain('text-cyan-300');
      } else if (skin === 'retro-green') {
        expect(html).toContain('border-green-400');
        expect(html).toContain('text-green-300');
      } else if (skin === 'retro-amber') {
        expect(html).toContain('border-amber-400');
        expect(html).toContain('text-amber-300');
      } else if (skin === 'parchment') {
        expect(html).toContain('border-[#8b5a2b]');
        expect(html).toContain('text-[#3e2723]');
      }
    });
  });

  test('4. Preserves Settings header, close button, and container structure with 700px height', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} />);

    expect(html).toContain('SETTINGS');
    expect(html).toContain('aria-label="Close settings"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('h-[700px]');
    expect(html).not.toContain('max-h-[580px]');
  });

  test('5. DOC MODE tab has single DOC MODE header row with film icon and toggle, and single Narration header/toggle row', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="documentary" />);

    // Active tab panel is documentary
    expect(html).toContain('id="settings-tabpanel-documentary"');

    // Section 1: DOC MODE with film icon and toggle (no duplicate Documentary Mode header)
    expect(html).not.toContain('Documentary Mode');
    expect(html).toContain('DOC MODE');
    expect(html).toContain('lucide-film');
    expect(html).toContain('Automatically guides the camera through a cinematic descent from the globe to the selected location.');
    expect(html).toContain('Camera Transition Duration');
    expect(html).toContain('10.0s');

    // Section 2: NARRATION header with integrated toggle
    expect(html).toContain('Narration');
    expect(html).toContain('lucide-volume-2');
    expect(html).toContain("Narrates the selected location&#x27;s title and description using speech synthesis.");
    expect(html).toContain('Voice');
    expect(html).toContain('System Default Voice');
    expect(html).toContain('Speed');
    expect(html).toContain('0.9x');
    expect(html).toContain('Volume');
    expect(html).toContain('75%');
    expect(html).toContain('Test Voice');
  });

  test('6. News tab displays news services, API key controls, and SHOW NEWS toggle', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="news" />);

    expect(html).toContain('id="settings-tabpanel-news"');
    expect(html).toContain('NEWS PROVIDER');
    expect(html).toContain('SHOW NEWS');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('The New York Times');
    expect(html).toContain('NYT API Key');
    expect(html).toContain('Test API Key');
  });

  test('7. News tab renders SHOW NEWS toggle in OFF state when showNews is false', () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        {...baseProps}
        settings={{ ...baseSettings, showNews: false }}
        initialTab="news"
      />
    );

    expect(html).toContain('SHOW NEWS');
    expect(html).toContain('aria-checked="false"');
  });

  test('8. News tab SHOW NEWS toggle renders correctly across all skins', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const html = renderToStaticMarkup(
        <SettingsPanel
          {...baseProps}
          skin={skin}
          initialTab="news"
        />
      );

      expect(html).toContain('SHOW NEWS');
      expect(html).toContain('role="switch"');
    });
  });

  test('9. News tab displays API KEY SETUP section, documentation links, and .env.local code snippet', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="news" />);

    // Header & Section
    expect(html).toContain('API KEY SETUP');
    expect(html).toContain('News API Sources');

    // Sources & Links
    expect(html).toContain('New York Times');
    expect(html).toContain('href="https://developer.nytimes.com/get-started"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('Obtain an API key from the New York Times Developer Portal.');

    expect(html).toContain('News API');
    expect(html).toContain('href="https://newsapi.org/"');
    expect(html).toContain('Obtain an API key from News API.');

    expect(html).toContain('NewsData');
    expect(html).toContain('href="https://newsdata.io/"');
    expect(html).toContain('Obtain an API key from NewsData.io.');

    // .env.local instructions & code block
    expect(html).toContain('API KEYS');
    expect(html).toContain('Create a .env.local file in the project root and add your API keys:');
    expect(html).toContain('VITE_NYT_API_KEY=');
    expect(html).toContain('VITE_NEWS_API_KEY=');
    expect(html).toContain('VITE_NEWS_DATA_API_KEY=');
    expect(html).toContain('GEMINI_API_KEY=');
  });

  test('10. News tab API KEY SETUP section renders properly across all four skins', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const html = renderToStaticMarkup(
        <SettingsPanel
          {...baseProps}
          skin={skin}
          initialTab="news"
        />
      );

      expect(html).toContain('API KEY SETUP');
      expect(html).toContain('VITE_NYT_API_KEY=');
      expect(html).toContain('GEMINI_API_KEY=');
    });
  });
});


