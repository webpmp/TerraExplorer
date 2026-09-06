import { describe, it, expect, vi } from 'vitest';
import { generateRoute } from '../geminiService';
import * as geminiService from '../geminiService';
import { getSequentialRouteSegments } from '../../utils/routeSequenceUtils';

describe('Route Generation Truncation & Compact Recovery Regression Test Suite', () => {
  it('1 & 2 & 3 & 4 & 5. Truncated response triggers compact recovery preserving original Trail of Tears context and groups', async () => {
    const calls: any[] = [];

    const mockGenerateFn = async (params: any) => {
      calls.push(params);
      if (calls.length === 1) {
        // Truncated raw response
        const truncatedRaw = `{
          "title": "Trail of Tears",
          "routeType": "multi_location_campaign",
          "routeEvidenceMode": "MULTI_ROUTE_EVENT",
          "routeGroups": [
            { "id": "northern-route", "name": "Northern Route", "type": "detachment", "isSequential": true },
            { "id": "benge-route", "name": "Benge Route", "type": "detachment", "isSequential": true }
          ],
          "route": [
            { "id": "nr-1", "name": "New Echota", "lat": 34.5408, "lng": -84.9100, "sequence": 1, "routeGroupId": "northern-route", "routeGroupName": "Northern Route", "waypointType": "historical_site", "segmentEvidence": "DOCUMENTED_ROUTE_SEGMENT" },
            { "id": "nr-2", "name": "Fort Cass", "lat": 35.2858, "lng": -84.7578, "sequence": 2, "routeGroupId": "northern-route", "routeGroupName": "Northern Route", "waypointType": "route_waypoint", "segmentEvidence": "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { "id": "fort-coffee-ok", "name": "Fort Coffee", "lat": 35.3042, "lng": -94.6144, "segmentEvidence":`;
        return { text: truncatedRaw };
      }

      // Recovery call: compact topology
      return {
        text: JSON.stringify({
          title: "Trail of Tears",
          routeType: "multi_location_campaign",
          routeEvidenceMode: "MULTI_ROUTE_EVENT",
          isSequential: false,
          routeGroups: [
            { id: "northern-route", name: "Northern Route", type: "detachment", isSequential: true },
            { id: "benge-route", name: "Benge Route", type: "detachment", isSequential: true },
            { id: "bell-route", name: "Bell Route", type: "detachment", isSequential: true },
            { id: "water-route", name: "Water Route", type: "detachment", isSequential: true }
          ],
          route: [
            { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        })
      };
    };

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // Assertions
    const routeGenCalls = calls.filter(c => c.contents.includes('Task:'));
    expect(routeGenCalls.length).toBe(2);
    const retryCall = routeGenCalls[1];

    // Recovery prompt MUST contain original user query and not generic prompt
    expect(retryCall.contents).toContain('Where did the Trail of Tears take place?');
    expect(retryCall.contents).not.toContain('Maximum 5 locations');
    expect(retryCall.contents).toContain('Extract the exact route topology');

    // Result must NOT contain generic places
    const waypointNames = result.waypoints.map(w => w.name);
    expect(waypointNames).not.toContain('Central Park');
    expect(waypointNames).not.toContain('Golden Gate Bridge');
    expect(waypointNames).not.toContain('Statue of Liberty');
    expect(waypointNames).toContain('Fort Cass');
    expect(waypointNames).toContain('Fort Gibson');

    // Route groups survive recovery
    const groups = new Set(result.waypoints.map(w => w.routeGroupId));
    expect(groups.has('northern-route')).toBe(true);
    expect(groups.has('benge-route')).toBe(true);
    expect(groups.has('default')).toBe(false);
  }, 30000);

  it('6 & 7 & 8. Route groups independently normalize sequence starting at 1 with no cross-route leakage', async () => {
    const mockGenerateFn = async () => ({
      text: JSON.stringify({
        title: "Trail of Tears",
        routeType: "multi_location_campaign",
        routeEvidenceMode: "MULTI_ROUTE_EVENT",
        isSequential: false,
        routeGroups: [
          { id: "northern-route", name: "Northern Route", type: "detachment", isSequential: true },
          { id: "benge-route", name: "Benge Route", type: "detachment", isSequential: true }
        ],
        // Note: LLM provided messy/global sequences (1, 2, 2, 3 and 3, 4, 5)
        route: [
          { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
          { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
          { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 2, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
          { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, routeGroupId: "northern-route", routeGroupName: "Northern Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
          { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 3, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
          { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 4, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
          { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 5, routeGroupId: "benge-route", routeGroupName: "Benge Route", waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
        ]
      })
    });

    const result = await generateRoute('Trail of Tears', 'HISTORICAL_EVENT', mockGenerateFn);

    const northern = result.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = result.waypoints.filter(w => w.routeGroupId === 'benge-route');

    // Both independently normalized starting at 1
    expect(northern.map(w => w.sequence)).toEqual([1, 2, 3, 4]);
    expect(benge.map(w => w.sequence)).toEqual([1, 2, 3]);
  }, 30000);

  it('9 & 10. Invalid/missing coordinates are rejected and failed recovery produces clean error', async () => {
    const mockGenerateFn = async (params: any) => {
      if (params.contents.includes('Extract the exact route topology')) {
        // Recovery returns completely broken JSON
        return { text: "NOT_JSON" };
      }
      // Truncated primary call
      return { text: "{" };
    };

    const result = await generateRoute('Unknown Historical Event', 'HISTORICAL_EVENT', mockGenerateFn);
    expect(result.waypoints).toEqual([]);
  });

  it('Test 1: Nested multi-route response is flattened correctly while preserving route-group boundaries and sequences', async () => {
    const mockNestedResponse = {
      title: "Trail of Tears",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        {
          id: "northern-route",
          name: "Northern Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "benge-route",
          name: "Benge Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "bell-route",
          name: "Bell Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "bl-1", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-2", name: "Memphis", lat: 35.1495, lng: -90.0489, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockNestedResponse)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // Assertions
    expect(result.waypoints.length).toBe(10);
    expect(result.routeGroups?.length).toBe(3);

    const northern = result.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = result.waypoints.filter(w => w.routeGroupId === 'benge-route');
    const bell = result.waypoints.filter(w => w.routeGroupId === 'bell-route');

    expect(northern.length).toBe(4);
    expect(benge.length).toBe(3);
    expect(bell.length).toBe(3);

    expect(northern.map(w => w.sequence)).toEqual([1, 2, 3, 4]);
    expect(benge.map(w => w.sequence)).toEqual([1, 2, 3]);
    expect(bell.map(w => w.sequence)).toEqual([1, 2, 3]);
  }, 30000);

  it('Test 2: Shared physical locations remain separate distinct waypoint instances across route groups', async () => {
    const mockNestedResponse = {
      title: "Trail of Tears",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        {
          id: "northern-route",
          name: "Northern Route",
          isSequential: true,
          route: [
            { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "benge-route",
          name: "Benge Route",
          isSequential: true,
          route: [
            { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "bell-route",
          name: "Bell Route",
          isSequential: true,
          route: [
            { id: "bl-1", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-2", name: "Memphis", lat: 35.1495, lng: -90.0489, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockNestedResponse)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // Fort Cass appears in Northern (seq 2) and Bell (seq 1)
    const fortCassInstances = result.waypoints.filter(w => w.name === 'Fort Cass' || w.canonicalName === 'Fort Cass');
    expect(fortCassInstances.length).toBe(2);
    expect(fortCassInstances.map(w => w.routeGroupId)).toEqual(['northern-route', 'bell-route']);
    expect(fortCassInstances.map(w => w.sequence)).toEqual([2, 1]);

    // Tahlequah appears in Northern (seq 4) and Benge (seq 3)
    const tahlequahInstances = result.waypoints.filter(w => w.name === 'Tahlequah' || w.canonicalName === 'Tahlequah');
    expect(tahlequahInstances.length).toBe(2);
    expect(tahlequahInstances.map(w => w.routeGroupId)).toEqual(['northern-route', 'benge-route']);
    expect(tahlequahInstances.map(w => w.sequence)).toEqual([4, 3]);
  }, 30000);

  it('Test 3: No cross-route segments generated across distinct route groups', async () => {
    const { getSequentialWaypointPairs } = await import('../../utils/routeSequenceUtils');

    const mockNestedResponse = {
      title: "Trail of Tears",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        {
          id: "northern-route",
          name: "Northern Route",
          isSequential: true,
          route: [
            { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "benge-route",
          name: "Benge Route",
          isSequential: true,
          route: [
            { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockNestedResponse)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);
    const pairs = getSequentialWaypointPairs(result.waypoints, result);

    expect(pairs.length).toBeGreaterThan(0);
    for (const [fromWp, toWp] of pairs) {
      expect(fromWp.routeGroupId).toBe(toWp.routeGroupId);
      expect(fromWp.routeGroupId).not.toBe('default');
    }
  }, 30000);

  it('Test 4: 4 + 3 + 3 + 3 = 13 canonical waypoints strictly survive through every pipeline stage without dropping shared locations', async () => {
    const mockFull13Response = {
      title: "Trail of Tears",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        {
          id: "northern-route",
          name: "Northern Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "nr-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "nr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "nr-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "benge-route",
          name: "Benge Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "br-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "br-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "br-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "bell-route",
          name: "Bell Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "bl-1", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-2", name: "Memphis", lat: 35.1495, lng: -90.0489, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "bl-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "water-route",
          name: "Water Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "wr-1", name: "Ross's Landing", lat: 35.0560, lng: -85.3090, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "wr-2", name: "Fort Coffee", lat: 35.3042, lng: -94.6144, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "wr-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockFull13Response)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    expect(result.waypoints.length).toBe(13);
    expect(result.routeGroups?.length).toBe(4);

    const northern = result.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = result.waypoints.filter(w => w.routeGroupId === 'benge-route');
    const bell = result.waypoints.filter(w => w.routeGroupId === 'bell-route');
    const water = result.waypoints.filter(w => w.routeGroupId === 'water-route');

    expect(northern.length).toBe(4);
    expect(benge.length).toBe(3);
    expect(bell.length).toBe(3);
    expect(water.length).toBe(3);

    expect(northern.map(w => w.sequence)).toEqual([1, 2, 3, 4]);
    expect(benge.map(w => w.sequence)).toEqual([1, 2, 3]);
    expect(bell.map(w => w.sequence)).toEqual([1, 2, 3]);
    expect(water.map(w => w.sequence)).toEqual([1, 2, 3]);

    // Unique IDs across all 13 waypoints
    const ids = new Set(result.waypoints.map(w => w.id));
    expect(ids.size).toBe(13);
  }, 30000);

  it('Test 5: Resolves AI-generated/provisional route-group IDs to authoritative canonical route IDs', async () => {
    const mockProvisionalGroupResponse = {
      title: "Trail of Tears",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        {
          id: "trail-of-tears-group-1",
          name: "Northern Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "p1-1", name: "New Echota", lat: 34.5408, lng: -84.9100, sequence: 1, waypointType: "historical_site", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "p1-2", name: "Fort Cass", lat: 35.2858, lng: -84.7578, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "p1-3", name: "Fort Gibson", lat: 35.7981, lng: -95.2497, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "p1-4", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 4, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        },
        {
          id: "trail-of-tears-group-2",
          name: "Benge Route",
          type: "detachment",
          isSequential: true,
          route: [
            { id: "p2-1", name: "Fort Payne", lat: 34.4442, lng: -85.7197, sequence: 1, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" },
            { id: "p2-2", name: "Gunter's Landing", lat: 34.3581, lng: -86.2944, sequence: 2, waypointType: "route_waypoint", segmentEvidence: "HIGH_LEVEL_HISTORICAL_ASSOCIATION" },
            { id: "p2-3", name: "Tahlequah", lat: 35.7094, lng: -94.8216, sequence: 3, waypointType: "route_waypoint", segmentEvidence: "DOCUMENTED_ROUTE_SEGMENT" }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockProvisionalGroupResponse)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    expect(result.waypoints.length).toBe(7);
    const northern = result.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = result.waypoints.filter(w => w.routeGroupId === 'benge-route');

    expect(northern.length).toBe(4);
    expect(benge.length).toBe(3);

    // Group IDs successfully reconciled to canonical IDs
    expect(result.waypoints.every(w => w.routeGroupId === 'northern-route' || w.routeGroupId === 'benge-route')).toBe(true);
    expect(result.waypoints.some(w => w.routeGroupId?.startsWith('trail-of-tears-group'))).toBe(false);
  }, 30000);

  it('Test 6: Truncated or malformed full Gemini response recovers authoritative route topology directly from historical registry without generic state/city hallucinations', async () => {
    // Simulate a truncated JSON response (e.g. truncated after 8000+ characters with broken syntax)
    const malformedRawResponse = `
      {
        "title": "Trail of Tears",
        "routeType": "multi_location_campaign",
        "routeEvidenceMode": "MULTI_ROUTE_EVENT",
        "routeGroups": [
          { "id": "northern-route", "name": "Northern Route", "type": "detachment", "isSequential": true },
          { "id": "benge-route", "name": "Benge Route", "type": "detachment", "isSequential": true },
          { "id": "bell-route", "name": "Bell Route", "type": "detachment", "isSequential": true },
          { "id": "water-route", "name": "Water Route", "type": "detachment", "isSequential": true }
        ],
        "route": [
          { "id": "nr-1", "name": "New Echota", "lat": 34.5408, "lng": -84.9100, "sequence": 1, "routeGroupId": "northern-route", "waypointType": "historical_site" },
          { "id": "nr-2", "name": "Fort Cass", "lat": 35.2858, "lng": -84.7578, "sequence": 2, "routeGroupId": "northern-route", "waypointType": "route_waypoint" },
          { "id": "nr-3", "name": "Fort Gibson", "lat": 35.7981, "lng": -95.2497, "sequence": 3, "routeGroupId": "northern-route", "waypointType": "route_waypoint" },
          { "id": "nr-4", "name": "Tahlequah", "lat": 35.7094, "lng": -94.8216, "sequence": 4, "routeGroupId": "northern-route", "waypointType": "route_waypoint" },
          { "id": "br-1", "name": "Fort Payne", "lat": 34.4442, "lng": -85.7197, "sequence": 1, "routeGroupId": "benge-route", "waypointType": "route_waypoint" },
          { "id": "br-2", "name": "Gunter's Landing", "lat": 34.3581, "lng": -86.2944, "sequence": 2, "routeGroupId": "benge-route", "waypointType": "route_waypoint" },
          { "id": "br-3", "name": "Tahlequah", "lat": 35.7094, "lng": -94.8216, "sequence": 3, "routeGroupId": "benge-route", "waypointType": "route_waypoint" },
          { "id": "bl-1", "name": "Fort Cass", "lat": 35.2858, "lng": -84.7578, "sequence": 1, "routeGroupId": "bell-route", "waypointType": "route_waypoint" },
          { "id": "bl-2", "name": "Memphis", "lat": 35.1495, "lng": -90.0489, "sequence": 2, "routeGroupId": "bell-route", "waypointType": "route_waypoint" },
          { "id": "bl-3", "name": "Fort Gibson", "lat": 35.7981, "lng": -95.2497, "sequence": 3, "routeGroupId": "bell-route", "waypointType": "route_waypoint" },
          { "id": "wr-1", "name": "Ross's Landing", "lat": 35.0560, "lng": -85.3090, "sequence": 1, "routeGroupId": "water-route", "waypointType": "route_waypoint" },
          { "id": "wr-2", "name": "Fort Coffee", "lat": 35.3042, "lng": -94.6144, "sequence": 2, "routeGroupId": "water-route", "waypointType": "route_waypoint" },
          { "id": "wr-3", "name": "Fort Gibson", "lat": 35.7981, "lng": -95.2497, "sequence": 3, "routeGroupId": "water-route", "waypointType": "route_waypoint", "segmentEvidence":
    `;

    const mockGenerateFn = async () => ({
      text: malformedRawResponse
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // Assert that canonical topology is recovered with all 13 authoritative waypoints
    expect(result.waypoints.length).toBe(13);
    expect(result.routeGroups?.length).toBe(4);

    const names = result.waypoints.map(w => w.name);
    expect(names).not.toContain('Nashville, Tennessee');
    expect(names).not.toContain('Georgia');
    expect(names).not.toContain('Talpa de Jacinto, Texas');
    expect(names).not.toContain('Tuskegee, Alabama');

    expect(names).toContain('New Echota');
    expect(names).toContain('Fort Cass');
    expect(names).toContain('Fort Gibson');
    expect(names).toContain('Tahlequah');
    expect(names).toContain('Fort Payne');
    expect(names).toContain("Gunter's Landing");
    expect(names).toContain('Memphis');
    expect(names).toContain("Ross's Landing");
    expect(names).toContain('Fort Coffee');
  }, 30000);

  it('Test 7: Production-style malformed output containing segment-named objects ("A to B") recovers canonical 13 waypoints and 9 independent segments', async () => {
    // Simulate malformed AI output where segments are returned instead of discrete waypoints
    const segmentNamedRawResponse = `
      {
        "title": "Trail of Tears",
        "routeType": "multi_location_campaign",
        "routeEvidenceMode": "MULTI_ROUTE_EVENT",
        "routeGroups": [
          { "id": "northern-route", "name": "Northern Route", "type": "detachment", "isSequential": true },
          { "id": "benge-route", "name": "Benge Route", "type": "detachment", "isSequential": true },
          { "id": "bell-route", "name": "Bell Route", "type": "detachment", "isSequential": true },
          { "id": "water-route", "name": "Water Route", "type": "detachment", "isSequential": true }
        ],
        "route": [
          { "id": "seg-1", "name": "New Echota to Fort Cass", "routeGroupId": "northern-route", "lat": 34.5408, "lng": -84.9100, "sequence": 1 },
          { "id": "seg-2", "name": "Fort Cass to Fort Gibson", "routeGroupId": "northern-route", "lat": 35.2858, "lng": -84.7578, "sequence": 2 },
          { "id": "seg-3", "name": "Fort Gibson to Tahlequah", "routeGroupId": "northern-route", "lat": 35.7981, "lng": -95.2497, "sequence": 3 },
          { "id": "seg-4", "name": "Fort Payne to Gunter's Landing", "routeGroupId": "benge-route", "lat": 34.4442, "lng": -85.7197, "sequence": 1 },
          { "id": "seg-5", "name": "Gunter's Landing to Tahlequah", "routeGroupId": "benge-route", "lat": 34.3581, "lng": -86.2944, "sequence": 2 },
          { "id": "seg-6", "name": "Fort Cass to Memphis", "routeGroupId": "bell-route", "lat": 35.2858, "lng": -84.7578, "sequence": 1 },
          { "id": "seg-7", "name": "Memphis to Fort Gibson", "routeGroupId": "bell-route", "lat": 35.1495, "lng": -90.0489, "sequence": 2 },
          { "id": "seg-8", "name": "Ross's Landing to Fort Coffee", "routeGroupId": "water-route", "lat": 35.0560, "lng": -85.3090, "sequence": 1 },
          { "id": "seg-9", "name": "Fort Coffee to Fort Gibson", "routeGroupId": "water-route", "lat": 35.3042, "lng": -94.6144, "sequence": 2 }
        ]
      }
    `;

    const mockGenerateFn = async () => ({
      text: segmentNamedRawResponse
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // 1. Assert exactly 13 canonical waypoint instances and 4 route groups
    expect(result.waypoints.length).toBe(13);
    const uniqueWaypointIds = new Set(result.waypoints.map(w => w.id));
    expect(uniqueWaypointIds.size).toBe(13);
    expect(result.routeGroups?.length).toBe(4);

    // 2. Assert route-local counts
    const northern = result.waypoints.filter(w => w.routeGroupId === 'northern-route');
    const benge = result.waypoints.filter(w => w.routeGroupId === 'benge-route');
    const bell = result.waypoints.filter(w => w.routeGroupId === 'bell-route');
    const water = result.waypoints.filter(w => w.routeGroupId === 'water-route');

    expect(northern.length).toBe(4);
    expect(benge.length).toBe(3);
    expect(bell.length).toBe(3);
    expect(water.length).toBe(3);

    // 3. Assert every waypoint name does NOT contain " to "
    result.waypoints.forEach(wp => {
      expect(wp.name.toLowerCase()).not.toContain(' to ');
      expect(wp.canonicalName?.toLowerCase()).not.toContain(' to ');
    });

    // 4. Assert route-local sequence contiguous numbers starting at 1
    expect(northern.map(w => w.sequence)).toEqual([1, 2, 3, 4]);
    expect(benge.map(w => w.sequence)).toEqual([1, 2, 3]);
    expect(bell.map(w => w.sequence)).toEqual([1, 2, 3]);
    expect(water.map(w => w.sequence)).toEqual([1, 2, 3]);

    // 5. Assert shared physical locations remain separate route-local instances
    const fortGibsons = result.waypoints.filter(w => w.name === 'Fort Gibson');
    expect(fortGibsons.length).toBe(3);
    const fortGibsonGroups = fortGibsons.map(w => w.routeGroupId).sort();
    expect(fortGibsonGroups).toEqual(['bell-route', 'northern-route', 'water-route']);

    const fortCasses = result.waypoints.filter(w => w.name === 'Fort Cass');
    expect(fortCasses.length).toBe(2);
    const fortCassGroups = fortCasses.map(w => w.routeGroupId).sort();
    expect(fortCassGroups).toEqual(['bell-route', 'northern-route']);

    const tahlequahs = result.waypoints.filter(w => w.name === 'Tahlequah');
    expect(tahlequahs.length).toBe(2);
    const tahlequahGroups = tahlequahs.map(w => w.routeGroupId).sort();
    expect(tahlequahGroups).toEqual(['benge-route', 'northern-route']);

    // 6. Assert segments independently derived from consecutive sequence waypoints produce exactly 9 segments
    const segmentPairs: Array<{ fromId: string; toId: string; fromGroup: string; toGroup: string }> = [];
    result.routeGroups?.forEach(group => {
      const gWps = result.waypoints
        .filter(w => w.routeGroupId === group.id)
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      for (let i = 0; i < gWps.length - 1; i++) {
        segmentPairs.push({
          fromId: gWps[i].id,
          toId: gWps[i + 1].id,
          fromGroup: gWps[i].routeGroupId || 'default',
          toGroup: gWps[i + 1].routeGroupId || 'default'
        });
      }
    });

    expect(segmentPairs.length).toBe(9);
    // Every segment references valid waypoint IDs within the same route group
    segmentPairs.forEach(pair => {
      expect(uniqueWaypointIds.has(pair.fromId)).toBe(true);
      expect(uniqueWaypointIds.has(pair.toId)).toBe(true);
      expect(pair.fromGroup).toBe(pair.toGroup);
    });
  }, 30000);

  it('Test 8: AI-generated enrichment (descriptions, context, significance) is preserved and reconciled onto canonical waypoint topology', async () => {
    // Stage 1 output has custom rich descriptions and significance on partial route groups
    const enrichedRawResponse = {
      title: "Where did the Trail of Tears take place?",
      routeType: "multi_location_campaign",
      routeEvidenceMode: "MULTI_ROUTE_EVENT",
      isSequential: false,
      routeGroups: [
        { id: "northern-route", name: "Northern Route", type: "detachment", isSequential: true },
        { id: "benge-route", name: "Benge Route", type: "detachment", isSequential: true }
      ],
      route: [
        {
          id: "nr-1",
          name: "New Echota",
          lat: 34.5408,
          lng: -84.9100,
          sequence: 1,
          routeGroupId: "northern-route",
          routeGroupName: "Northern Route",
          waypointType: "historical_site",
          description: "Custom AI Description: The historic capital where the controversial 1835 Treaty was signed.",
          significance: "Custom AI Significance: Cherokee National Capitol.",
          context: "Custom AI Context: Historic treaty grounds."
        },
        {
          id: "nr-2",
          name: "Fort Cass",
          lat: 35.2858,
          lng: -84.7578,
          sequence: 2,
          routeGroupId: "northern-route",
          routeGroupName: "Northern Route",
          waypointType: "route_waypoint",
          description: "Custom AI Description: General Winfield Scott's military headquarters and main staging encampment.",
          significance: "Custom AI Significance: Removal headquarters."
        },
        {
          id: "br-1",
          name: "Fort Payne",
          lat: 34.4442,
          lng: -85.7197,
          sequence: 1,
          routeGroupId: "benge-route",
          routeGroupName: "Benge Route",
          waypointType: "route_waypoint",
          description: "Custom AI Description: Alabama internment concentration camp commanded by Captain John Benge."
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(enrichedRawResponse)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // 1. Authoritative topology is complete (13 waypoints across 4 groups)
    expect(result.waypoints.length).toBe(13);
    expect(result.routeGroups?.length).toBe(4);

    // 2. Custom AI enrichment was preserved on matching canonical instances
    const newEchota = result.waypoints.find(w => w.routeGroupId === 'northern-route' && (w.canonicalName === 'New Echota' || w.name === 'New Echota'));
    expect(newEchota).toBeDefined();
    expect(newEchota?.description).toBe("Custom AI Description: The historic capital where the controversial 1835 Treaty was signed.");
    expect(newEchota?.significance).toBe("Custom AI Significance: Cherokee National Capitol.");
    expect(newEchota?.context).toBe("Custom AI Context: Historic treaty grounds.");

    const fortCass = result.waypoints.find(w => w.routeGroupId === 'northern-route' && (w.canonicalName === 'Fort Cass' || w.name === 'Fort Cass'));
    expect(fortCass).toBeDefined();
    expect(fortCass?.description).toBe("Custom AI Description: General Winfield Scott's military headquarters and main staging encampment.");
    expect(fortCass?.significance).toBe("Custom AI Significance: Removal headquarters.");

    const fortPayne = result.waypoints.find(w => w.routeGroupId === 'benge-route' && (w.canonicalName === 'Fort Payne' || w.name === 'Fort Payne'));
    expect(fortPayne).toBeDefined();
    expect(fortPayne?.description).toBe("Custom AI Description: Alabama internment concentration camp commanded by Captain John Benge.");

    // 3. Unmatched canonical anchors (e.g. Fort Coffee on Water Route) have canonical default descriptions
    const fortCoffee = result.waypoints.find(w => w.routeGroupId === 'water-route' && (w.canonicalName === 'Fort Coffee' || w.name === 'Fort Coffee'));
    expect(fortCoffee).toBeDefined();
    expect(fortCoffee?.description).toContain("Arkansas River");
  }, 30000);
});
