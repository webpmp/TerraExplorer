import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRoutePipeline } from '../routePipeline';

// Mock geminiService generateContentWithRetry to avoid actual network calls during LLM audit
vi.mock('../geminiService', () => ({
  generateContentWithRetry: vi.fn().mockResolvedValue({ text: '[]' }),
  modelName: 'gemini-2.5-flash'
}));

describe('Historical Event Single Location Route Type Reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: Single-location historical event (Battle of Stalingrad) normalizes REGIONAL_EVENT with 1 valid waypoint', async () => {
    const rawGenerate = async () => ({
      title: 'Battle of Stalingrad',
      routeType: 'REGIONAL_EVENT',
      routeEvidenceMode: 'REGIONAL_EVENT' as any,
      isSequential: false,
      routeGroups: [],
      waypoints: [
        {
          id: 'stalingrad-battlefield',
          name: 'Stalingrad Battlefield',
          canonicalName: 'Stalingrad',
          modernLocation: 'Volgograd Oblast, Russia',
          lat: 48.7080,
          lng: 44.5133,
          role: 'primary',
          waypointType: 'historical_site',
          sequence: 1,
          description: 'Major battle on the Eastern Front of World War II.',
          significance: 'Turning point in the European theatre of WWII.',
          historicalPeriod: '1942-1943'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Where did the Battle of Stalingrad take place?',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(1);
    expect(route.waypoints[0].name).toBe('Stalingrad Battlefield');
    expect(route.waypoints[0].lat).toBeCloseTo(48.7080, 2);
    expect(route.waypoints[0].lng).toBeCloseTo(44.5133, 2);
    expect(route.routeType).toBe('single_location');
    expect(route.title).toBe('Battle of Stalingrad');
  });

  it('Test 2: Genuine multi-location regional event with 2+ waypoints preserves multi-location behavior', async () => {
    const rawGenerate = async () => ({
      title: 'Battle of the Bulge Key Sectors',
      routeType: 'REGIONAL_EVENT',
      routeEvidenceMode: 'REGIONAL_EVENT' as any,
      isSequential: false,
      routeGroups: [],
      waypoints: [
        {
          id: 'bastogne',
          name: 'Bastogne',
          modernLocation: 'Belgium',
          lat: 50.0035,
          lng: 5.7184,
          role: 'primary',
          waypointType: 'historical_site',
          sequence: 1,
          description: 'Defended by the 101st Airborne Division.'
        },
        {
          id: 'st-vith',
          name: 'St. Vith',
          modernLocation: 'Belgium',
          lat: 50.2783,
          lng: 6.1264,
          role: 'primary',
          waypointType: 'historical_site',
          sequence: 2,
          description: 'Crucial road and rail junction.'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Battle of the Bulge',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(2);
    expect(route.routeType).toBe('REGIONAL_EVENT');
  });

  it('Test 3: Invalid single waypoint fails validation and is rejected', async () => {
    const rawGenerate = async () => ({
      title: 'Battle of Stalingrad',
      routeType: 'REGIONAL_EVENT',
      waypoints: [
        {
          id: 'invalid-coords-wp',
          name: 'Fake Location',
          lat: 0,
          lng: 0, // Geographically invalid null-island coordinates
          sequence: 1
        }
      ]
    });

    const route = await runRoutePipeline(
      'Where did the Battle of Stalingrad take place?',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(0);
  });

  it('Test 4: Generic historical event (Battle of Hastings) with 1 valid waypoint normalizes to single_location', async () => {
    const rawGenerate = async () => ({
      title: 'Battle of Hastings',
      routeType: 'REGIONAL_EVENT',
      routeEvidenceMode: 'REGIONAL_EVENT' as any,
      isSequential: false,
      routeGroups: [],
      waypoints: [
        {
          id: 'senlac-hill',
          name: 'Senlac Hill',
          canonicalName: 'Battle, East Sussex',
          modernLocation: 'East Sussex, England',
          lat: 50.9150,
          lng: 0.4875,
          role: 'primary',
          waypointType: 'historical_site',
          sequence: 1,
          description: 'Site where the Norman-French army of William the Conqueror fought King Harold Godwinson in 1066.',
          significance: 'Decisive Norman victory leading to the Norman conquest of England.',
          historicalPeriod: '1066'
        }
      ]
    });

    const route = await runRoutePipeline(
      'Where did the Battle of Hastings take place?',
      false,
      rawGenerate,
      'HISTORICAL_EVENT'
    );

    expect(route.waypoints.length).toBe(1);
    expect(route.waypoints[0].name).toBe('Senlac Hill');
    expect(route.routeType).toBe('single_location');
    expect(route.title).toBe('Battle of Hastings');
  });

  it('Test 5: Generic historical event (Siege of Yorktown) with 1 valid waypoint and inferred intent normalizes to single_location', async () => {
    const rawGenerate = async () => ({
      title: 'Siege of Yorktown',
      routeType: 'REGIONAL_EVENT',
      waypoints: [
        {
          id: 'yorktown-battlefield',
          name: 'Yorktown Battlefield',
          canonicalName: 'Yorktown',
          modernLocation: 'Virginia, United States',
          lat: 37.2388,
          lng: -76.5097,
          role: 'primary',
          waypointType: 'historical_site',
          sequence: 1,
          description: 'Combined American and French forces led by George Washington and Rochambeau laid siege to British General Cornwallis.',
          significance: 'Last major land battle of the American Revolutionary War.',
          historicalPeriod: '1781'
        }
      ]
    });

    // Notice intent parameter is omitted to verify intent inference / propagation
    const route = await runRoutePipeline(
      'Where did the Siege of Yorktown take place?',
      false,
      rawGenerate
    );

    expect(route.waypoints.length).toBe(1);
    expect(route.waypoints[0].name).toBe('Yorktown Battlefield');
    expect(route.routeType).toBe('single_location');
  });
});
