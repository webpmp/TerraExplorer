import { describe, it, expect } from 'vitest';
import { validateHistoricalRouteData } from '../../utils/routeSequenceUtils';
import { Route } from '../../types';

describe('Historical Route Data Integrity Validation Suite', () => {
  it('passes validation for valid canonical route data', () => {
    const validRoute: Route = {
      title: 'Trail of Tears',
      routeGroups: [
        {
          id: 'northern-route',
          name: 'Northern Route',
          isSequential: true,
          waypoints: []
        },
        {
          id: 'bell-route',
          name: 'Bell Route',
          isSequential: true,
          waypoints: []
        }
      ],
      waypoints: [
        {
          id: 'northern-route-new-echota',
          name: 'New Echota',
          lat: 34.5408,
          lng: -84.9100,
          routeGroupId: 'northern-route',
          sequence: 1,
          globalSequence: 1
        },
        {
          id: 'northern-route-fort-cass',
          name: 'Fort Cass',
          lat: 35.2858,
          lng: -84.7578,
          routeGroupId: 'northern-route',
          sequence: 2,
          globalSequence: 2
        },
        {
          id: 'bell-route-fort-cass',
          name: 'Fort Cass',
          lat: 35.2858,
          lng: -84.7578,
          routeGroupId: 'bell-route',
          sequence: 1,
          globalSequence: 3
        },
        {
          id: 'bell-route-memphis',
          name: 'Memphis',
          lat: 35.1495,
          lng: -90.0489,
          routeGroupId: 'bell-route',
          sequence: 2,
          globalSequence: 4
        }
      ]
    };

    const result = validateHistoricalRouteData(validRoute);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects contradictory route identity (e.g. id=water-route-fort-gibson with routeGroupId=bell-route)', () => {
    const invalidRoute: Route = {
      title: 'Trail of Tears',
      routeGroups: [
        { id: 'bell-route', name: 'Bell Route', isSequential: true, waypoints: [] },
        { id: 'water-route', name: 'Water Route', isSequential: true, waypoints: [] }
      ],
      waypoints: [
        {
          id: 'water-route-fort-gibson',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: 'bell-route',
          sequence: 1,
          globalSequence: 1
        }
      ]
    };

    const result = validateHistoricalRouteData(invalidRoute);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('Contradictory route identity'))).toBe(true);
  });

  it('detects sequence gaps within a route group (e.g. sequence 1, 2, 4)', () => {
    const invalidRoute: Route = {
      title: 'Trail of Tears',
      routeGroups: [
        { id: 'benge-route', name: 'Benge Route', isSequential: true, waypoints: [] }
      ],
      waypoints: [
        {
          id: 'benge-route-fort-payne',
          name: 'Fort Payne',
          lat: 34.4442,
          lng: -85.7197,
          routeGroupId: 'benge-route',
          sequence: 1,
          globalSequence: 1
        },
        {
          id: 'benge-route-gunters-landing',
          name: "Gunter's Landing",
          lat: 34.3581,
          lng: -86.2944,
          routeGroupId: 'benge-route',
          sequence: 2,
          globalSequence: 2
        },
        {
          id: 'benge-route-tahlequah',
          name: 'Tahlequah',
          lat: 35.7094,
          lng: -94.8216,
          routeGroupId: 'benge-route',
          sequence: 4, // Gap: sequence 4 instead of 3
          globalSequence: 3
        }
      ]
    };

    const result = validateHistoricalRouteData(invalidRoute);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('sequence gap'))).toBe(true);
  });

  it('detects global sequence gaps (e.g. 1, 2, 4)', () => {
    const invalidRoute: Route = {
      title: 'Trail of Tears',
      routeGroups: [
        { id: 'northern-route', name: 'Northern Route', isSequential: true, waypoints: [] }
      ],
      waypoints: [
        {
          id: 'northern-route-new-echota',
          name: 'New Echota',
          lat: 34.5408,
          lng: -84.9100,
          routeGroupId: 'northern-route',
          sequence: 1,
          globalSequence: 1
        },
        {
          id: 'northern-route-fort-cass',
          name: 'Fort Cass',
          lat: 35.2858,
          lng: -84.7578,
          routeGroupId: 'northern-route',
          sequence: 2,
          globalSequence: 2
        },
        {
          id: 'northern-route-fort-gibson',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: 'northern-route',
          sequence: 3,
          globalSequence: 4 // Global gap: 4 instead of 3
        }
      ]
    };

    const result = validateHistoricalRouteData(invalidRoute);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('Global sequence gap'))).toBe(true);
  });

  it('detects duplicate waypoint IDs across the route dataset', () => {
    const invalidRoute: Route = {
      title: 'Trail of Tears',
      routeGroups: [
        { id: 'northern-route', name: 'Northern Route', isSequential: true, waypoints: [] }
      ],
      waypoints: [
        {
          id: 'northern-route-fort-gibson',
          name: 'Fort Gibson',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: 'northern-route',
          sequence: 1,
          globalSequence: 1
        },
        {
          id: 'northern-route-fort-gibson',
          name: 'Fort Gibson Duplicate',
          lat: 35.7981,
          lng: -95.2497,
          routeGroupId: 'northern-route',
          sequence: 2,
          globalSequence: 2
        }
      ]
    };

    const result = validateHistoricalRouteData(invalidRoute);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('Duplicate waypoint ID detected'))).toBe(true);
  });
});
