import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SetupPanel } from '../SetupPanel';
import { GeminiFallbackPrompt } from '../GeminiFallbackPrompt';
import { SetupStatusState } from '../../services/setupStatusService';

describe('SetupPanel & GeminiFallbackPrompt Component Tests', () => {
  const mockStatusUnconfigured: SetupStatusState = {
    ai: {
      status: 'unreachable',
      provider: 'lmstudio',
      detail: 'Cannot connect'
    },
    map: {
      status: 'missing',
      detail: 'Carto API key missing'
    },
    news: {
      status: 'not_configured',
      provider: 'nyt'
    }
  };

  const mockStatusReady: SetupStatusState = {
    ai: {
      status: 'ready',
      provider: 'lmstudio'
    },
    map: {
      status: 'ready'
    },
    news: {
      status: 'not_configured',
      provider: 'nyt'
    }
  };

  it('1. SetupPanel renders checklist with AI and Maps as required, News as optional', () => {
    const handleDismiss = vi.fn();
    const handleOpenSettings = vi.fn();
    const handleReopen = vi.fn();

    const html = renderToStaticMarkup(
      <SetupPanel
        skin="modern"
        status={mockStatusUnconfigured}
        isDismissed={false}
        onDismiss={handleDismiss}
        onOpenSettings={handleOpenSettings}
        onReopen={handleReopen}
      />
    );

    expect(html).toContain('data-testid="setup-row-ai"');
    expect(html).toContain('data-testid="setup-row-map"');
    expect(html).toContain('data-testid="setup-row-news"');
    expect(html).toContain('Required');
    expect(html).toContain('Optional');
    // Stacking context & fixed positioning assertions: above globe (z-10), centered modal with backdrop
    expect(html).toContain('fixed inset-0 z-40 flex items-center justify-center');
    expect(html).toContain('bg-black/40');
    expect(html).toContain('setup-card-container');
  });

  it('2. SetupPanel renders "Finish Setup" chip when dismissed while required services are still missing', () => {
    const html = renderToStaticMarkup(
      <SetupPanel
        skin="modern"
        status={mockStatusUnconfigured}
        isDismissed={true}
        onDismiss={vi.fn()}
        onOpenSettings={vi.fn()}
        onReopen={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="finish-setup-chip"');
    expect(html).toContain('Finish Setup');
  });

  it('3. SetupPanel renders nothing when dismissed and all required services are ready', () => {
    const html = renderToStaticMarkup(
      <SetupPanel
        skin="modern"
        status={mockStatusReady}
        isDismissed={true}
        onDismiss={vi.fn()}
        onOpenSettings={vi.fn()}
        onReopen={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('4. GeminiFallbackPrompt asks first with [Use Gemini] and [Keep trying LM Studio] buttons', () => {
    const handleAccept = vi.fn();
    const handleDecline = vi.fn();

    const html = renderToStaticMarkup(
      <GeminiFallbackPrompt
        skin="modern"
        isOpen={true}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    );

    expect(html).toContain("LM Studio isn&#x27;t responding. Use Gemini instead for this session?");
    expect(html).toContain("Use Gemini");
    expect(html).toContain("Keep trying LM Studio");
    expect(html).toContain('data-testid="gemini-fallback-accept"');
    expect(html).toContain('data-testid="gemini-fallback-decline"');
  });

  it('5. GeminiFallbackPrompt does not render when closed', () => {
    const html = renderToStaticMarkup(
      <GeminiFallbackPrompt
        skin="modern"
        isOpen={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('6. SetupPanel card receives skin-specific class, uniform row classes, and parchment deckle edge wrapper has no rectangular border/overflow-hidden', () => {
    const skins: Array<'modern' | 'retro-green' | 'retro-amber' | 'parchment'> = [
      'modern',
      'retro-green',
      'retro-amber',
      'parchment'
    ];

    for (const s of skins) {
      const html = renderToStaticMarkup(
        <SetupPanel
          skin={s}
          status={mockStatusUnconfigured}
          isDismissed={false}
          onDismiss={vi.fn()}
          onOpenSettings={vi.fn()}
          onReopen={vi.fn()}
        />
      );

      // Card must receive the skin-specific CSS class
      expect(html).toContain(`setup-card-${s}`);

      // All three rows (AI, Map, News) must share the SAME uniform row class in each skin
      const expectedRowClass = `setup-row-${s}`;
      const rowMatches = (html.match(new RegExp(expectedRowClass, 'g')) || []).length;
      expect(rowMatches).toBe(3);

      // Must not rely on backdrop-blur or broken Tailwind arbitrary classes
      expect(html).not.toContain('bg-slate-900/90');
      expect(html).not.toContain('bg-slate-900/95');
      expect(html).not.toContain('bg-black/95');
      expect(html).not.toContain('backdrop-blur');

      // In parchment theme, it must render the parchment background layer
      // and the deckle-carrying card wrapper must NOT have border or overflow-hidden
      if (s === 'parchment') {
        expect(html).toContain('parchment-background');
        // Extract setup-panel element class attribute
        const match = html.match(/data-testid="setup-panel"[^>]*class="([^"]*)"/);
        const cardClass = match ? match[1] : '';
        expect(cardClass).not.toContain('border');
        expect(cardClass).not.toContain('overflow-hidden');
        expect(cardClass).not.toContain('rounded-xl');
      }

      // Chip when dismissed must also receive skin-specific class
      const chipHtml = renderToStaticMarkup(
        <SetupPanel
          skin={s}
          status={mockStatusUnconfigured}
          isDismissed={true}
          onDismiss={vi.fn()}
          onOpenSettings={vi.fn()}
          onReopen={vi.fn()}
        />
      );
      expect(chipHtml).toContain(`setup-chip-${s}`);
      if (s === 'parchment') {
        expect(chipHtml).toContain('parchment-background');
      }
    }
  });

  it('7. Theme-only palette for badges, text, symbols and divider lines in retro & parchment skins', () => {
    const retroAndParchmentSkins: Array<'retro-green' | 'retro-amber' | 'parchment'> = [
      'retro-green',
      'retro-amber',
      'parchment'
    ];

    for (const s of retroAndParchmentSkins) {
      const htmlUnready = renderToStaticMarkup(
        <SetupPanel
          skin={s}
          status={mockStatusUnconfigured}
          isDismissed={false}
          onDismiss={vi.fn()}
          onOpenSettings={vi.fn()}
          onReopen={vi.fn()}
        />
      );

      // Must have symbol & text in badge (no exclamation mark in needs attention)
      expect(htmlUnready).toContain('NEEDS ATTENTION');
      expect(htmlUnready).not.toContain('! NEEDS ATTENTION');
      expect(htmlUnready).not.toContain('!NEEDS ATTENTION');
      expect(htmlUnready).toContain('Optional');
      expect(htmlUnready).not.toContain('OPTIONAL');

      // The Needs attention badge must not render circle-alert (AlertCircle)
      // Check that inside the needs attention badge there is no circle-alert
      const badgeMatch = htmlUnready.match(/<span[^>]*class="[^"]*setup-badge-[^"]*-attention[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      expect(badgeMatch).toBeTruthy();
      if (badgeMatch) {
        expect(badgeMatch[1]).not.toContain('lucide-circle-alert');
        expect(badgeMatch[1]).not.toContain('!');
        expect(badgeMatch[1]).toContain('NEEDS ATTENTION');
      }

      // No off-theme colors (red, green, orange, blue, emerald) in retro/parchment
      expect(htmlUnready).not.toContain('bg-red-');
      expect(htmlUnready).not.toContain('text-red-');
      expect(htmlUnready).not.toContain('border-red-');
      expect(htmlUnready).not.toContain('text-emerald-');
      expect(htmlUnready).not.toContain('text-amber-400'); // only allowed if not hardcoded outside theme
      if (s === 'retro-green') {
        expect(htmlUnready).not.toContain('text-[#ffb000]');
        expect(htmlUnready).not.toContain('border-[#ffb000]');
        expect(htmlUnready).not.toContain('text-cyan-');
      }
      if (s === 'retro-amber') {
        expect(htmlUnready).not.toContain('text-green-');
        expect(htmlUnready).not.toContain('border-green-');
        expect(htmlUnready).not.toContain('text-cyan-');
      }
      if (s === 'parchment') {
        expect(htmlUnready).not.toContain('text-green-');
        expect(htmlUnready).not.toContain('border-green-');
        expect(htmlUnready).not.toContain('text-cyan-');
        expect(htmlUnready).toContain('setup-divider-parchment');
      }

      // Ready state check
      const htmlReady = renderToStaticMarkup(
        <SetupPanel
          skin={s}
          status={mockStatusReady}
          isDismissed={false}
          onDismiss={vi.fn()}
          onOpenSettings={vi.fn()}
          onReopen={vi.fn()}
        />
      );
      expect(htmlReady).toContain('✓ READY');
      const readyBadgeMatch = htmlReady.match(/<span[^>]*class="[^"]*setup-badge-[^"]*-ready[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      expect(readyBadgeMatch).toBeTruthy();
      if (readyBadgeMatch) {
        expect(readyBadgeMatch[1]).toContain('✓ READY');
        expect(readyBadgeMatch[1]).not.toContain('lucide-circle-check');
        expect(readyBadgeMatch[1]).not.toContain('<svg');
        // Assert exactly one checkmark symbol in the badge
        const checkmarks = (readyBadgeMatch[1].match(/✓/g) || []).length;
        expect(checkmarks).toBe(1);
      }

      // Fallback Prompt check
      const promptHtml = renderToStaticMarkup(
        <GeminiFallbackPrompt
          skin={s}
          isOpen={true}
          onAccept={vi.fn()}
          onDecline={vi.fn()}
        />
      );
      expect(promptHtml).not.toContain('bg-amber-500/20');
      expect(promptHtml).not.toContain('text-amber-400');
    }
  });
});
