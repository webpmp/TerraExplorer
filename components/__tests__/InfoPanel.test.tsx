import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InfoPanel, { normalizeDisplayText } from '../InfoPanel';

// Mock Lucide icons to avoid rendering issues in tests
vi.mock('lucide-react', () => {
  return new Proxy({}, {
    get: () => () => <span>Icon</span>
  });
});

describe('normalizeDisplayText helper', () => {
  test('returns string for string input', () => {
    expect(normalizeDisplayText('Test string')).toBe('Test string');
  });

  test('returns summary if object has summary', () => {
    expect(normalizeDisplayText({ summary: 'Object summary' })).toBe('Object summary');
  });

  test('returns title if object has title', () => {
    expect(normalizeDisplayText({ title: 'Object title' })).toBe('Object title');
  });

  test('returns empty string for unhandled structures', () => {
    expect(normalizeDisplayText({ foo: 'bar' })).toBe('');
    expect(normalizeDisplayText(null)).toBe('');
    expect(normalizeDisplayText(undefined)).toBe('');
    expect(normalizeDisplayText(123)).toBe('');
  });
});

describe('InfoPanel Rendering Defensive Fallbacks', () => {
  const baseInfo = {
    name: "Test Location",
    type: "City",
    coordinates: { lat: 0, lng: 0 },
    news: []
  };

  const defaultProps = {
    onClose: vi.fn(),
    isLoading: false,
    isNewsFetching: false,
    skin: "modern" as any,
    isFavorite: false,
    onSaveFavorite: vi.fn(),
    onRemoveFavorite: vi.fn(),
    onLoadMoreNews: vi.fn()
  };

  test('renders successfully without React child errors when notable is an array of objects', () => {
    const infoWithObjectNotable = {
      ...baseInfo,
      notable: [{ summary: "Test location summary" }]
    };

    render(<InfoPanel info={infoWithObjectNotable} {...defaultProps} />);
    expect(screen.getByText('Test location summary')).toBeInTheDocument();
  });

  test('renders successfully when contextNotes is an array of objects', () => {
    const infoWithObjectContext = {
      ...baseInfo,
      contextNotes: [{ title: "Context Title" }]
    };

    render(<InfoPanel info={infoWithObjectContext} {...defaultProps} />);
    expect(screen.getByText('Context Title')).toBeInTheDocument();
  });

  test('renders successfully when entities is an array of objects', () => {
    const infoWithObjectEntities = {
      ...baseInfo,
      entities: [{ name: "Entity Name" }]
    };

    render(<InfoPanel info={infoWithObjectEntities} {...defaultProps} />);
    expect(screen.getByText('Entity Name')).toBeInTheDocument();
  });
});
