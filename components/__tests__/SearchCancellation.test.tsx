import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../Controls';
import { SkinType } from '../../types';

describe('Search and Globe-Click Cancellation UI Tests', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'modern' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isZoomLocked: false,
    onToggleZoomLock: vi.fn(),
  };

  test('renders CANCEL button when scanningStatusText is active during text search', () => {
    const onCancelScan = vi.fn();
    const html = renderToStaticMarkup(
      <Controls
        {...baseProps}
        isSearching={true}
        scanningStatusText="LOCATING TOKYO"
        onCancelScan={onCancelScan}
      />
    );

    expect(html).toContain('CANCEL');
    expect(html).not.toContain('EXPLORE');
  });

  test('renders CANCEL button when scanningStatusText is active during route trace', () => {
    const onCancelScan = vi.fn();
    const html = renderToStaticMarkup(
      <Controls
        {...baseProps}
        isSearching={true}
        scanningStatusText="TRACING ROUTE"
        onCancelScan={onCancelScan}
      />
    );

    expect(html).toContain('CANCEL');
  });

  test('renders CANCEL button when scanningStatusText is active during globe scan', () => {
    const onCancelScan = vi.fn();
    const html = renderToStaticMarkup(
      <Controls
        {...baseProps}
        isSearching={false}
        isScanningArea={true}
        scanningStatusText="Locating area"
        onCancelScan={onCancelScan}
      />
    );

    expect(html).toContain('CANCEL');
  });

  test('renders EXPLORE button when idle and no scanning is occurring', () => {
    const html = renderToStaticMarkup(
      <Controls
        {...baseProps}
        isSearching={false}
        scanningStatusText={null}
      />
    );

    expect(html).toContain('EXPLORE');
    expect(html).not.toContain('CANCEL');
  });
});
