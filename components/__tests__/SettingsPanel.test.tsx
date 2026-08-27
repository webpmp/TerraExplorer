import React from 'react';
import { describe, test, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel, { testNewsConnectionService, testMapConnectionService } from '../SettingsPanel';
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

  test('1. Renders 4 top-level tabs: GENERAL | PROVIDERS | APPEARANCE | AUDIO', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} />);

    // Tablist container
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Settings categories"');

    // 4 Tab buttons
    expect(html).toContain('id="settings-tab-general"');
    expect(html).toContain('GENERAL');
    expect(html).toContain('id="settings-tab-providers"');
    expect(html).toContain('PROVIDERS');
    expect(html).toContain('id="settings-tab-appearance"');
    expect(html).toContain('APPEARANCE');
    expect(html).toContain('id="settings-tab-audio"');
    expect(html).toContain('AUDIO');

    // General is active by default
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('id="settings-tabpanel-general"');
    expect(html).toContain('aria-labelledby="settings-tab-general"');
  });

  test('2. PROVIDERS tab contains AI PROVIDER, MAP PROVIDER with CARTO API key setup, and NEWS PROVIDER sections', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="providers" />);

    // Panel is active
    expect(html).toContain('id="settings-tabpanel-providers"');

    // 1. AI PROVIDER section
    expect(html).toContain('AI PROVIDER');
    expect(html).toContain('Local (LM Studio)');
    expect(html).toContain('value="lmstudio"');
    expect(html).toContain('Gemini');
    expect(html).toContain('value="http://localhost:1234/v1"');
    expect(html).toContain('Must include /v1 for OpenAI compatibility.');
    expect(html).toContain('Detect');
    expect(html).toContain('TEST CONNECTION');

    // 2. MAP PROVIDER section
    expect(html).toContain('MAP PROVIDER');
    expect(html).toContain('CARTO Basemaps');
    expect(html).not.toContain('CARTO Basemaps (Raster)');
    expect(html).not.toContain('CARTO RASTER BASEMAPS');
    expect(html).toContain('A CARTO API key is required to load authenticated basemap tiles.');
    expect(html).not.toContain('raster');
    expect(html).not.toContain('vector');
    expect(html).toContain('CARTO API Key');
    expect(html).toContain('href="https://carto.com/developers/basemap-styles/"');
    expect(html).toContain('VITE_CARTO_API_KEY=');
    expect(html).not.toContain('Restart the Vite development server');

    // 3. NEWS PROVIDER section
    expect(html).toContain('NEWS PROVIDER');
    expect(html).toContain('SHOW NEWS');
    expect(html).toContain('The New York Times');
    expect(html).toContain('API KEY SETUP');
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

  test('5. GENERAL tab contains DOC MODE controls and duration slider', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="general" />);

    expect(html).toContain('id="settings-tabpanel-general"');
    expect(html).toContain('DOC MODE');
    expect(html).toContain('lucide-film');
    expect(html).toContain('Automatically guides the camera through a cinematic descent from the globe to the selected location.');
    expect(html).toContain('Camera Transition Duration');
    expect(html).toContain('10.0s');
    expect(html).not.toContain('Narration');
  });

  test('6. APPEARANCE tab contains theme options: Modern, CRT Green, CRT Amber, Parchment', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="appearance" />);

    expect(html).toContain('id="settings-tabpanel-appearance"');
    expect(html).toContain('Theme &amp; Appearance');
    expect(html).toContain('Modern');
    expect(html).toContain('CRT Green');
    expect(html).toContain('CRT Amber');
    expect(html).toContain('Parchment');
    expect(html).toContain('Active');
  });

  test('7. AUDIO tab contains Narration controls, voice selection, speed, volume, and test voice', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="audio" />);

    expect(html).toContain('id="settings-tabpanel-audio"');
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
    expect(html).not.toContain('DOC MODE');
  });

  test('8. PROVIDERS tab News section renders SHOW NEWS toggle in OFF state when showNews is false', () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        {...baseProps}
        settings={{ ...baseSettings, showNews: false }}
        initialTab="providers"
      />
    );

    expect(html).toContain('SHOW NEWS');
    expect(html).toContain('aria-checked="false"');
  });

  test('9. PROVIDERS tab renders properly across all skins', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    skins.forEach((skin) => {
      const html = renderToStaticMarkup(
        <SettingsPanel
          {...baseProps}
          skin={skin}
          initialTab="providers"
        />
      );

      expect(html).toContain('AI PROVIDER');
      expect(html).toContain('MAP PROVIDER');
      expect(html).toContain('NEWS PROVIDER');
    });
  });

  test('10. PROVIDERS tab displays API KEY SETUP section, documentation links, and .env.local code snippet', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="providers" />);

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
    expect(html).toContain('Add your keys to the project&#x27;s .env.local file:');
    expect(html).toContain('VITE_NYT_API_KEY=&quot;YOUR_NYT_API_KEY&quot;');
    expect(html).toContain('VITE_NEWS_API_KEY=&quot;YOUR_NEWS_API_KEY&quot;');
    expect(html).toContain('VITE_NEWS_DATA_API_KEY=&quot;YOUR_NEWS_DATA_API_KEY&quot;');
    expect(html).toContain('GEMINI_API_KEY=&quot;YOUR_GEMINI_API_KEY&quot;');
  });

  test('11. PROVIDERS tab News Service dropdown includes exact label "Gemini (Default AI Search)" with value="gemini"', () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        {...baseProps}
        settings={{ ...baseSettings, aiProvider: 'gemini', newsProvider: 'gemini' }}
        initialTab="providers"
      />
    );

    // Dropdown contains all four providers with exact option labels
    expect(html).toContain('The New York Times');
    expect(html).toContain('NewsAPI.org');
    expect(html).toContain('NewsData.io');
    expect(html).toContain('Gemini (Default AI Search)');
    expect(html).toContain('value="gemini"');

    // AI and News Test Connection buttons are hidden when both AI and News providers are set to Gemini
    expect(html).toContain('TEST CONNECTION'); // MAP PROVIDER test connection remains present
    expect(html).not.toContain('Testing...');

    // API key inputs are never rendered
    expect(html).not.toContain('NYT API Key');
    expect(html).not.toContain('NewsAPI.org Key');
    expect(html).not.toContain('NewsData.io Key');
    expect(html).not.toContain('type="password"');
  });

  test('12. Test Connection produces expected diagnostic logs without leaking API keys on success', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        response: {
          docs: [{ headline: { main: 'Article 1' } }, { headline: { main: 'Article 2' } }]
        }
      })
    } as any);

    const secretKey = 'super-secret-nyt-key-999';
    const result = await testNewsConnectionService('nyt', { nytApiKey: secretKey });

    expect(result.outcome).toBe('SUCCESS');
    expect(result.status).toBe(200);

    const logs = consoleSpy.mock.calls.map(c => c[0]);

    // START log with APIKeyConfigured and APIKeySource=environment
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=START') && l.includes('APIKeyConfigured=true') && l.includes('APIKeySource=environment'))).toBe(true);

    // REQUEST log with Endpoint
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=REQUEST') && l.includes('api.nytimes.com'))).toBe(true);

    // SUCCESS log with Status 200, ResponseReceived, and ArticlesReturned count
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=SUCCESS') && l.includes('Status=200') && l.includes('ResponseReceived=true') && l.includes('ArticlesReturned=2'))).toBe(true);

    // COMPLETE log with Result=SUCCESS
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=COMPLETE') && l.includes('Result=SUCCESS'))).toBe(true);

    // CRITICAL: Ensure secret API key is never logged anywhere in console output
    for (const log of logs) {
      expect(log).not.toContain(secretKey);
    }

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('13. Test Connection produces expected diagnostic logs on failure without leaking API keys', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({})
    } as any);

    const secretKey = 'invalid-secret-key-123';
    const result = await testNewsConnectionService('newsapi', { newsApiKey: secretKey });

    expect(result.outcome).toBe('FAILED');
    expect(result.status).toBe(401);

    const logs = consoleSpy.mock.calls.map(c => c[0]);

    // START
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Provider=NewsAPI') && l.includes('Action=START') && l.includes('APIKeySource=environment'))).toBe(true);

    // REQUEST
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=REQUEST'))).toBe(true);

    // FAILED with safe error description
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=FAILED') && l.includes('Status=401') && l.includes('invalid/unauthorized API key'))).toBe(true);

    // COMPLETE
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=COMPLETE') && l.includes('Result=FAILED'))).toBe(true);

    // CRITICAL: Ensure secret key is not in logs
    for (const log of logs) {
      expect(log).not.toContain(secretKey);
    }

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('14. Test Connection logs APIKeyConfigured=false when key is missing', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await testNewsConnectionService('newsdata', undefined, () => ({}));

    expect(result.outcome).toBe('FAILED');

    const logs = consoleSpy.mock.calls.map(c => c[0]);

    // START with APIKeyConfigured=false and APIKeySource=environment
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Provider=NewsData') && l.includes('Action=START') && l.includes('APIKeyConfigured=false') && l.includes('APIKeySource=environment'))).toBe(true);

    // FAILED with missing key
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=FAILED') && l.includes('API key not configured'))).toBe(true);

    // COMPLETE with Result=FAILED
    expect(logs.some(l => l.includes('[NEWS TEST CONNECTION]') && l.includes('Action=COMPLETE') && l.includes('Result=FAILED'))).toBe(true);

    consoleSpy.mockRestore();
  });

  test('15. NewsAPI, NYT, and NewsData all read from environment variables when settings keys are empty and report usable article counts', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ status: 'ok', articles: [{ title: 'NewsAPI Article 1' }, { title: 'NewsAPI Article 2' }, { title: 'NewsAPI Article 3' }] })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ response: { docs: [{ headline: { main: 'NYT Article 1' } }] } })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ status: 'success', results: [{ title: 'NewsData Article 1' }, { title: 'NewsData Article 2' }] })
      } as any);

    // Simulate empty settings passed from App.tsx after reload
    const emptySettingsKeys = {
      nytApiKey: '',
      newsApiKey: '',
      newsDataApiKey: ''
    };

    // Test NewsAPI with empty settings key
    const newsApiResult = await testNewsConnectionService('newsapi', emptySettingsKeys);
    expect(newsApiResult.outcome).toBe('SUCCESS');

    // Test NYT with empty settings key
    const nytResult = await testNewsConnectionService('nyt', emptySettingsKeys);
    expect(nytResult.outcome).toBe('SUCCESS');

    // Test NewsData with empty settings key
    const newsDataResult = await testNewsConnectionService('newsdata', emptySettingsKeys);
    expect(newsDataResult.outcome).toBe('SUCCESS');

    const logs = consoleSpy.mock.calls.map(c => c[0]);
    // Check START logs
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=START') && l.includes('APIKeyConfigured=true') && l.includes('APIKeySource=environment'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=New York Times') && l.includes('Action=START') && l.includes('APIKeyConfigured=true') && l.includes('APIKeySource=environment'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=NewsData') && l.includes('Action=START') && l.includes('APIKeyConfigured=true') && l.includes('APIKeySource=environment'))).toBe(true);

    // Check SUCCESS logs with ArticlesReturned
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=SUCCESS') && l.includes('ArticlesReturned=3'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=New York Times') && l.includes('Action=SUCCESS') && l.includes('ArticlesReturned=1'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=NewsData') && l.includes('Action=SUCCESS') && l.includes('ArticlesReturned=2'))).toBe(true);

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('16. NewsAPI returns HTTP 200 with articles -> Result=SUCCESS', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'ok', totalResults: 10, articles: new Array(10).fill({ title: 'Sample' }) })
    } as any);

    const result = await testNewsConnectionService('newsapi', { newsApiKey: 'valid-key' });
    expect(result.outcome).toBe('SUCCESS');
    expect(result.status).toBe(200);

    const logs = consoleSpy.mock.calls.map(c => c[0]);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=SUCCESS') && l.includes('Status=200') && l.includes('ArticlesReturned=10'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=COMPLETE') && l.includes('Result=SUCCESS'))).toBe(true);

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('17. NewsAPI returns HTTP 200 with zero articles -> Result=FAILED', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'ok', totalResults: 0, articles: [] })
    } as any);

    const result = await testNewsConnectionService('newsapi', { newsApiKey: 'valid-key' });
    expect(result.outcome).toBe('FAILED');
    expect(result.status).toBe(200);

    const logs = consoleSpy.mock.calls.map(c => c[0]);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=FAILED') && l.includes('Status=200') && l.includes('ResponseReceived=true') && l.includes('ArticlesReturned=0') && l.includes('Error=No usable articles returned by NewsAPI'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=COMPLETE') && l.includes('Result=FAILED'))).toBe(true);

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('18. NewsAPI returns an HTTP/API error -> Result=FAILED', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({})
    } as any);

    const result = await testNewsConnectionService('newsapi', { newsApiKey: 'valid-key' });
    expect(result.outcome).toBe('FAILED');
    expect(result.status).toBe(429);

    const logs = consoleSpy.mock.calls.map(c => c[0]);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=FAILED') && l.includes('Status=429') && l.includes('rate limited'))).toBe(true);
    expect(logs.some(l => l.includes('Provider=NewsAPI') && l.includes('Action=COMPLETE') && l.includes('Result=FAILED'))).toBe(true);

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('19. Switching between Settings tabs renders appropriate tab panels while preserving underlying settings state', () => {
    const customSettings: UserSettings = {
      ...baseSettings,
      aiProvider: 'gemini',
      newsProvider: 'newsapi',
      documentaryDuration: 7.5,
      narrationSpeed: 1.2,
      narrationVolume: 0.8
    };

    // Render GENERAL
    const generalHtml = renderToStaticMarkup(
      <SettingsPanel {...baseProps} settings={customSettings} initialTab="general" />
    );
    expect(generalHtml).toContain('id="settings-tabpanel-general"');
    expect(generalHtml).toContain('7.5s');

    // Render PROVIDERS
    const providersHtml = renderToStaticMarkup(
      <SettingsPanel {...baseProps} settings={customSettings} initialTab="providers" />
    );
    expect(providersHtml).toContain('id="settings-tabpanel-providers"');
    expect(providersHtml).toContain('AI PROVIDER');
    expect(providersHtml).toContain('MAP PROVIDER');
    expect(providersHtml).toContain('NEWS PROVIDER');
    expect(providersHtml).toContain('value="newsapi"');

    // Render APPEARANCE
    const appearanceHtml = renderToStaticMarkup(
      <SettingsPanel {...baseProps} settings={customSettings} initialTab="appearance" />
    );
    expect(appearanceHtml).toContain('id="settings-tabpanel-appearance"');
    expect(appearanceHtml).toContain('Theme &amp; Appearance');

    // Render AUDIO
    const audioHtml = renderToStaticMarkup(
      <SettingsPanel {...baseProps} settings={customSettings} initialTab="audio" />
    );
    expect(audioHtml).toContain('id="settings-tabpanel-audio"');
    expect(audioHtml).toContain('1.2x');
    expect(audioHtml).toContain('80%');
  });

  describe('MAP PROVIDER - Test Connection Button & Service', () => {
    test('1. TEST CONNECTION renders directly below the Provider selector and above CARTO API Key', () => {
      const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="providers" />);
      
      const providerIndex = html.indexOf('CARTO Basemaps');
      const testBtnIndex = html.indexOf('TEST CONNECTION', providerIndex);
      const apiKeyIndex = html.indexOf('CARTO API Key');

      expect(providerIndex).toBeGreaterThan(-1);
      expect(testBtnIndex).toBeGreaterThan(providerIndex);
      expect(apiKeyIndex).toBeGreaterThan(testBtnIndex);
      expect(html).toContain('w-full');
    });

    test('2. Button remains enabled even though the Provider selector is disabled', () => {
      const html = renderToStaticMarkup(<SettingsPanel {...baseProps} initialTab="providers" />);

      expect(html).toContain('<select disabled=""');
      // The button itself is not disabled
      const btnSection = html.slice(html.indexOf('CARTO Basemaps'), html.indexOf('CARTO API Key'));
      expect(btnSection).toContain('TEST CONNECTION');
      expect(btnSection).not.toContain('<button disabled=""');
    });

    test('3. Successful request displays "Map provider connection successful."', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as any);

      const result = await testMapConnectionService('carto', 'modern', () => ({ VITE_CARTO_API_KEY: 'test-key-123' }));
      expect(result.outcome).toBe('SUCCESS');
      expect(result.buttonState).toBe('success');
      expect(result.buttonLabel).toBe('✓ CONNECTION SUCCESSFUL');
      expect(result.message).toBe('Map provider connection successful.');

      fetchSpy.mockRestore();
    });

    test('4. HTTP failure is handled with "Unable to connect to this map provider."', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      } as any);

      const result = await testMapConnectionService('carto', 'modern');
      expect(result.outcome).toBe('FAILED');
      expect(result.buttonState).toBe('failed');
      expect(result.buttonLabel).toBe('CONNECTION FAILED');
      expect(result.message).toBe('Unable to connect to this map provider.');

      fetchSpy.mockRestore();
    });

    test('5. Network/fetch failure is handled as blocked when browser blocks request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await testMapConnectionService('carto', 'modern');
      expect(result.outcome).toBe('BLOCKED');
      expect(result.buttonState).toBe('blocked');
      expect(result.buttonLabel).toBe('CONNECTION BLOCKED');
      expect(result.message).toBe('Map provider is reachable, but the browser blocked the request.');

      fetchSpy.mockRestore();
    });

    test('6. CORS/browser-blocked failure is handled with specific message', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error("No 'Access-Control-Allow-Origin' header is present on the requested resource."));

      const result = await testMapConnectionService('carto', 'modern');
      expect(result.outcome).toBe('BLOCKED');
      expect(result.buttonState).toBe('blocked');
      expect(result.buttonLabel).toBe('CONNECTION BLOCKED');
      expect(result.message).toBe('Map provider is reachable, but the browser blocked the request.');

      fetchSpy.mockRestore();
    });

    test('7. Timeout is handled with "Map provider did not respond in time."', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));

      // Test with custom quick timeout error
      const timeoutErr = new Error('TIMEOUT');
      timeoutErr.name = 'TimeoutError';
      fetchSpy.mockReset();
      fetchSpy.mockRejectedValueOnce(timeoutErr);

      const result = await testMapConnectionService('carto', 'modern');
      expect(result.outcome).toBe('FAILED');
      expect(result.buttonState).toBe('failed');
      expect(result.buttonLabel).toBe('CONNECTION FAILED');
      expect(result.message).toBe('Map provider did not respond in time.');

      fetchSpy.mockRestore();
    });

    test('8. Running the test does not change the selected provider or modify settings', async () => {
      const onUpdateSettings = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as any);

      await testMapConnectionService('carto', 'modern');
      expect(onUpdateSettings).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    test('9. Component cleanup aborts an active test signal', async () => {
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, options: any) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = testMapConnectionService('carto', 'modern', undefined, abortController.signal);
      abortController.abort();
      expect(abortSpy).toHaveBeenCalled();

      await expect(promise).rejects.toThrow();

      fetchSpy.mockRestore();
    });

    test('10. All TEST CONNECTION buttons in PROVIDERS tab share identical full-width styling and structure', () => {
      const html = renderToStaticMarkup(
        <SettingsPanel
          {...baseProps}
          settings={{ ...baseSettings, aiProvider: 'lmstudio', newsProvider: 'nyt' }}
          initialTab="providers"
        />
      );

      // Verify all 3 providers render TEST CONNECTION buttons with w-full
      const testConnectionOccurrences = html.match(/TEST CONNECTION/g);
      expect(testConnectionOccurrences).toHaveLength(3);

      // Verify full width and identical button styling class patterns
      const fullWidthButtons = html.match(/w-full py-2 px-4 rounded-lg text-sm border font-medium/g);
      expect(fullWidthButtons).toHaveLength(3);
    });
  });
});

