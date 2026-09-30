import { describe, test, expect, vi } from 'vitest';
import { deriveQueryTopicTitle } from '../queryNormalizer';
import { runRoutePipeline } from '../routePipeline';

describe('Query-Driven Route Pipeline Title & Grouping Integrity', () => {
  test('attaches canonical query title "Battles of World War I" to generated route and all waypoints', async () => {
    // Mock generateRoute to return candidate waypoints for WWI battles
    const mockWWIWaypoints = [
      {
        id: 'wp-ypres',
        name: 'Ypres Front Battles',
        canonicalName: 'Ypres',
        lat: 50.8514,
        lng: 2.8856,
        description: 'First, Second, and Third Battles of Ypres along the Western Front.',
        historicalPeriod: 'World War I',
        historicalRegion: 'Flanders, Belgium'
      },
      {
        id: 'wp-somme',
        name: 'Battle of the Somme',
        canonicalName: 'Somme',
        lat: 50.0,
        lng: 2.7,
        description: 'Joint British and French offensive on the Western Front.',
        historicalPeriod: 'World War I',
        historicalRegion: 'Somme, France'
      },
      {
        id: 'wp-verdun',
        name: 'Battle of Verdun',
        canonicalName: 'Verdun',
        lat: 49.16,
        lng: 5.38,
        description: 'Longest and one of the most ferocious battles of the First World War.',
        historicalPeriod: 'World War I',
        historicalRegion: 'Meuse, France'
      }
    ];

    const route = await runRoutePipeline(
      'Where were the major battles of World War I?',
      undefined,
      async () => ({
        event: 'Battles of World War I',
        title: 'Battles of World War I',
        description: 'Major battlefields of the First World War across Europe.',
        isSequential: false,
        waypoints: mockWWIWaypoints
      })
    );

    expect(route).toBeDefined();
    expect(route.title).toBe('Battles of World War I');
    expect(route.waypoints.length).toBeGreaterThanOrEqual(1);

    // Each waypoint inherits routeTitle without losing its individual waypoint identity
    for (const wp of route.waypoints) {
      expect(wp.routeTitle).toBe('Battles of World War I');
      expect(wp.name).not.toBe('Battles of World War I');
    }
  });

  test('derives general query topic title for various historical and geographic collections', () => {
    expect(deriveQueryTopicTitle('where were the major battles of the American Civil War?')).toBe('Battles of the American Civil War');
    expect(deriveQueryTopicTitle('Where were the key battles of Napoleon?')).toBe('Battles of Napoleon');
    expect(deriveQueryTopicTitle('Where was Game of Thrones filmed?')).toBe('Game of Thrones Filming Locations');
    expect(deriveQueryTopicTitle('Where are the famous waterfalls of Iceland?')).toBe('Famous Waterfalls of Iceland');
    expect(deriveQueryTopicTitle('Where did the Apollo missions land?')).toBe('Apollo Missions Landing Sites');
  });
});
