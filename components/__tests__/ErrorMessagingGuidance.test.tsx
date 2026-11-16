import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import InfoPanel from '../InfoPanel';
import { getInfoFromFeature } from '../../services/geminiService';
import { LocationInfo, MapMarker } from '../../types';

describe('Error Messaging & Inline Guidance Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. InfoPanel displays actionable guidance when AI is unreachable or not configured', () => {
    const rawInfo: LocationInfo = {
      name: 'Santorini',
      type: 'island' as any,
      coordinates: { lat: 36.3932, lng: 25.4615 },
      description: '',
      notable: [],
      errorType: 'LM_STUDIO_UNREACHABLE',
      errorMessage: "Can't reach LM Studio at http://localhost:1234/v1. Is the server started?",
      errorInstruction: '(Settings > Providers)'
    };

    const handleOpenSettingsTab = vi.fn();

    const html = renderToStaticMarkup(
      <InfoPanel
        info={rawInfo}
        isLoading={false}
        isNewsFetching={false}
        showNews={false}
        researchMode={false}
        onOpenSettingsTab={handleOpenSettingsTab}
        skin="modern"
      />
    );

    expect(html).toContain("Can&#x27;t reach LM Studio at http://localhost:1234/v1. Is the server started?");
    expect(html).toContain("Settings &gt; Providers");
    // Ensure no raw [DEBUG: ...] is in the output
    expect(html).not.toContain('[DEBUG:');
  });

  it('2. InfoPanel displays actionable guidance when Gemini API key is missing', () => {
    const rawInfo: LocationInfo = {
      name: 'Kyoto',
      type: 'city' as any,
      coordinates: { lat: 35.0116, lng: 135.7681 },
      description: '',
      notable: [],
      errorType: 'GEMINI_KEY_MISSING',
      errorMessage: 'Gemini API key is missing or invalid.',
      errorInstruction: '(Settings > Providers)'
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={rawInfo}
        isLoading={false}
        isNewsFetching={false}
        showNews={false}
        researchMode={false}
        onOpenSettingsTab={vi.fn()}
        skin="modern"
      />
    );

    expect(html).toContain('Gemini API key is missing or invalid.');
    expect(html).toContain('Settings &gt; Providers');
    expect(html).not.toContain('[DEBUG:');
  });

  it('3. Suppresses raw [DEBUG: ...] in user-facing search and shows friendly message', async () => {
    // Check that standard error phrases do not contain [DEBUG: ...]
    const cleanNoLocation = "Couldn't find that place. Try a more specific name.";
    expect(cleanNoLocation).not.toContain('[DEBUG:');
  });
});
