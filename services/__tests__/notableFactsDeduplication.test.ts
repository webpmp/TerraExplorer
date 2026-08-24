import { describe, it, expect } from 'vitest';
import {
  parseNotableFactItem,
  normalizeFactComparisonKey,
  deduplicateNotableFacts
} from '../../utils/notableFactsUtils';
import { mergeLocationInfo } from '../locationService';

describe('Notable Facts Deduplication and Metadata Lifecycle Suite', () => {
  it('1. collapses identical textual duplicate facts into one fact', () => {
    const rawFacts = [
      'Christopher Columbus arrived in 1492.',
      'Christopher Columbus arrived in 1492.'
    ];

    const result = deduplicateNotableFacts(rawFacts);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Christopher Columbus arrived in 1492.');
  });

  it('2. collapses facts with leading/trailing/repeated whitespace and case differences', () => {
    const rawFacts = [
      'Christopher Columbus arrived in 1492.',
      '  christopher   columbus arrived in 1492.  '
    ];

    const result = deduplicateNotableFacts(rawFacts);
    expect(result).toHaveLength(1);
    // Preserves the first occurrence formatting
    expect(result[0]).toBe('Christopher Columbus arrived in 1492.');
  });

  it('3. strictly preserves first-occurrence order: A, B, A, C, B -> A, B, C', () => {
    const rawFacts = [
      { title: 'Fact A', description: 'Description A' },
      { title: 'Fact B', description: 'Description B' },
      { title: 'Fact A', description: 'Description A' },
      { title: 'Fact C', description: 'Description C' },
      { title: 'Fact B', description: 'Description B' }
    ];

    const result = deduplicateNotableFacts(rawFacts);
    expect(result).toHaveLength(3);
    expect(result.map(f => f.title)).toEqual(['Fact A', 'Fact B', 'Fact C']);
  });

  it('4. deduplicates mixed string formats and structured objects representing the same fact', () => {
    const rawFacts = [
      'Tower of London: Historic castle on the north bank of the River Thames.',
      {
        title: 'Tower of London',
        description: 'Historic castle on the north bank of the River Thames.'
      }
    ];

    const result = deduplicateNotableFacts(rawFacts);
    expect(result).toHaveLength(1);
  });

  it('5. does not incorrectly collapse different facts with similar wording', () => {
    const rawFacts = [
      { title: 'Treaty of Paris 1763', description: 'Ended the Seven Years War.' },
      { title: 'Treaty of Paris 1783', description: 'Ended the American Revolutionary War.' }
    ];

    const result = deduplicateNotableFacts(rawFacts);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Treaty of Paris 1763');
    expect(result[1].title).toBe('Treaty of Paris 1783');
  });

  it('6. mergeLocationInfo prevents notable facts duplication when re-selecting or re-enriching a location', () => {
    const prev = {
      name: 'London',
      notable: [
        { title: 'Tower Bridge', description: 'Iconic suspension bridge.' },
        { title: 'Big Ben', description: 'Great Bell of the Great Clock of Westminster.' }
      ]
    };

    const incoming = {
      name: 'London',
      notable: [
        { title: 'Tower Bridge', description: 'Iconic suspension bridge.' },
        { title: 'Big Ben', description: 'Great Bell of the Great Clock of Westminster.' },
        { title: 'British Museum', description: 'Museum dedicated to human history and art.' }
      ]
    };

    const merged = mergeLocationInfo(prev, incoming);
    expect(merged.notable).toHaveLength(3);
    expect(merged.notable.map((n: any) => n.title)).toEqual(['Tower Bridge', 'Big Ben', 'British Museum']);
  });

  it('7. safely handles empty, null, and non-array inputs', () => {
    expect(deduplicateNotableFacts([])).toEqual([]);
    expect(deduplicateNotableFacts(null as any)).toEqual([]);
    expect(deduplicateNotableFacts(undefined as any)).toEqual([]);
    expect(deduplicateNotableFacts([{ title: '', description: '' }])).toEqual([]);
  });
});
