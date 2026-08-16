import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRoutePipeline } from '../routePipeline';

// Mock geminiService generateContentWithRetry to avoid actual network calls during LLM audit
vi.mock('../geminiService', () => ({
  generateContentWithRetry: vi.fn().mockResolvedValue({ text: '[]' }),
  modelName: 'gemini-2.5-flash'
}));

describe('Route Type / Waypoint Reconciliation in routePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Case 1: Single-location historical event (e.g. Charge of the Light Brigade) normalizes regional_event with 1 waypoint to single_location', async () => {
    const rawGenerate = async () => ({
      title: 'Charge of the Light Brigade',
      routeType: 'regional_event',
      routeConfidence: { level: 'high', reasoning: 'Historic Crimean War battle site.' },
      waypoints: [
        {
          id: 'charge-of-light-brigade-primary-location',
          name: 'Balaclava',
          role: 'primary',
          lat: 44.8725,
          lng: 33.6091,
          sequence: 1,
          description: 'Site of the Charge of the Light Brigade during the Battle of Balaclava in the Crimean War.',
          significance: 'Key cavalry charge in British military history.',
          historicalPeriod: '1854'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Charge of the Light Brigade',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(1);
    expect(route.waypoints[0].name).toBe('Balaclava');
    expect(route.routeType).toBe('single_location');
    expect(route.title).toBe('Charge of the Light Brigade');
  });

  it('Case 2: Legitimate multi-location historical event with 3 waypoints preserves regional_event without normalization', async () => {
    const rawGenerate = async () => ({
      title: 'Crimean War Theaters',
      routeType: 'regional_event',
      routeConfidence: { level: 'high', reasoning: 'Key theaters of the Crimean War.' },
      waypoints: [
        {
          id: 'sevastopol-siege',
          name: 'Sevastopol',
          role: 'primary',
          lat: 44.6167,
          lng: 33.5254,
          sequence: 1,
          description: 'Major siege of the Crimean War.'
        },
        {
          id: 'balaclava-battle',
          name: 'Balaclava',
          role: 'primary',
          lat: 44.8725,
          lng: 33.6091,
          sequence: 2,
          description: 'Battle of Balaclava.'
        },
        {
          id: 'inkerman-battle',
          name: 'Inkerman',
          role: 'primary',
          lat: 44.6139,
          lng: 33.6125,
          sequence: 3,
          description: 'Battle of Inkerman.'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Crimean War',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(3);
    expect(route.routeType).toBe('regional_event');
  });

  it('Case 3: Multi-location routeType requiring network/fixed_path with 1 waypoint cannot be normalized and fails structural validation', async () => {
    const rawGenerate = async () => ({
      title: 'Silk Road Path',
      routeType: 'fixed_path',
      routeConfidence: { level: 'medium' },
      waypoints: [
        {
          id: 'xian-start',
          name: "Xi'an",
          role: 'primary',
          lat: 34.3416,
          lng: 108.9398,
          sequence: 1,
          description: 'Starting point.'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Follow the Silk Road from China to Europe',
      false,
      rawGenerate,
      'route'
    );

    // Fixed path cannot be normalized to single_location for an explicit route journey; fails validation
    expect(route.waypoints.length).toBe(0);
    expect(route.routeType).toBe('fixed_path');
  });

  it('Case 4: Invalid waypoint coordinates are rejected and do not bypass structural validation', async () => {
    const rawGenerate = async () => ({
      title: 'Charge of the Light Brigade',
      routeType: 'regional_event',
      waypoints: [
        {
          id: 'invalid-wp',
          name: 'Unknown Field',
          role: 'primary',
          lat: 0,
          lng: 0, // Invalid coordinates
          sequence: 1
        }
      ]
    });

    const route = await runRoutePipeline(
      'Charge of the Light Brigade',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(0);
  });

  it('Case 5: Multi-waypoint route with single_location label is not stripped of valid waypoints', async () => {
    const rawGenerate = async () => ({
      title: 'Multiple Battles',
      routeType: 'single_location',
      waypoints: [
        {
          id: 'loc-1',
          name: 'Location 1',
          role: 'primary',
          lat: 44.0,
          lng: 33.0,
          sequence: 1
        },
        {
          id: 'loc-2',
          name: 'Location 2',
          role: 'primary',
          lat: 45.0,
          lng: 34.0,
          sequence: 2
        }
      ]
    });

    const route = await runRoutePipeline(
      'Multiple Battles',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(2);
  });
});
