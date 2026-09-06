import { describe, it, expect } from 'vitest';
import { generateRoute } from '../geminiService';
import { runRoutePipeline } from '../routePipeline';
import { validateEntityAlias } from '../geographic/entityIdentityValidator';
import { HISTORICAL_ROUTE_REGISTRY } from '../geographic/historicalRouteRegistry';

describe('Canonical Historical Route Data Integrity & AI Non-Authoring Guardrails', () => {
  const trailOfTearsModel = HISTORICAL_ROUTE_REGISTRY['trail-of-tears'];

  it('1. Rejects AI coordinate hallucinations and strictly preserves authoritative registry coordinates', async () => {
    // Deliberately supply incorrect coordinates for Fort Cass, New Echota, and Fort Gibson
    const mockAiResponseWithCorruptedCoordinates = {
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
            {
              id: "northern-route-new-echota",
              name: "New Echota",
              // Deliberately wrong coordinates (e.g. 35.4, -85.16 instead of 34.5408, -84.9100)
              lat: 35.4000,
              lng: -85.1600,
              sequence: 1,
              routeGroupId: "northern-route",
              description: "AI-supplied description for New Echota",
              significance: "AI-supplied significance"
            },
            {
              id: "northern-route-fort-cass",
              name: "Fort Cass",
              // Deliberately wrong coordinates
              lat: 40.1234,
              lng: -75.9876,
              sequence: 2,
              routeGroupId: "northern-route",
              description: "AI-supplied description for Fort Cass",
              significance: "AI-supplied significance"
            }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockAiResponseWithCorruptedCoordinates)
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    const newEchota = result.waypoints.find(w => w.name === 'New Echota' && w.routeGroupId === 'northern-route');
    const fortCass = result.waypoints.find(w => w.name === 'Fort Cass' && w.routeGroupId === 'northern-route');

    expect(newEchota).toBeDefined();
    expect(fortCass).toBeDefined();

    // Must match registry coordinates exactly, NOT the hallucinated AI coordinates
    const registryNewEchota = trailOfTearsModel.routeGroups['northern-route'].documentedAnchors.find(a => a.id === 'new-echota')!;
    const registryFortCass = trailOfTearsModel.routeGroups['northern-route'].documentedAnchors.find(a => a.id === 'fort-cass')!;

    expect(newEchota!.lat).toBeCloseTo(registryNewEchota.lat, 4);
    expect(newEchota!.lng).toBeCloseTo(registryNewEchota.lng, 4);
    expect(newEchota!.lat).not.toBeCloseTo(35.4000, 2);
    expect(newEchota!.lng).not.toBeCloseTo(-85.1600, 2);

    expect(fortCass!.lat).toBeCloseTo(registryFortCass.lat, 4);
    expect(fortCass!.lng).toBeCloseTo(registryFortCass.lng, 4);
    expect(fortCass!.lat).not.toBeCloseTo(40.1234, 2);
    expect(fortCass!.lng).not.toBeCloseTo(-75.9876, 2);

    // AI narrative enrichment IS preserved
    expect(newEchota!.description).toBe("AI-supplied description for New Echota");
  }, 30000);

  it('2. Disallows AI mutation of canonical identity: canonicalName, ID, sequence, memberships, and routeGroupId', async () => {
    // AI attempts to mutate canonicalName to "Camp Cass Encampment", invent a fake sequence 99,
    // and assign a cross-group membership
    const mockAiResponseWithCorruptedIdentity = {
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
            {
              id: "custom-fake-id-999",
              name: "Fort Cass",
              canonicalName: "Camp Cass Encampment",
              sequence: 99,
              routeGroupId: "fabricated-route-group",
              memberships: [
                { routeGroupId: "alien-route", routeGroupName: "Alien Route", sequence: 99 }
              ],
              description: "AI-supplied description for Fort Cass"
            }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockAiResponseWithCorruptedIdentity)
    });

    const result = await generateRoute('Trail of Tears Northern Route', 'HISTORICAL_EVENT', mockGenerateFn);

    const fortCass = result.waypoints.find(w => w.name === 'Fort Cass');
    expect(fortCass).toBeDefined();

    // Must be route-scoped canonical ID
    expect(fortCass!.id).toBe('northern-route-fort-cass');
    // canonicalName must remain authoritative
    expect(fortCass!.canonicalName).toBe('Fort Cass');
    // routeGroupId must come from registry
    expect(fortCass!.routeGroupId).toBe('northern-route');
    // sequence must be route-local
    expect(fortCass!.sequence).toBe(2);
    // exactly one route-scoped membership
    expect(fortCass!.memberships).toBeDefined();
    expect(fortCass!.memberships!.length).toBe(1);
    expect(fortCass!.memberships![0].routeGroupId).toBe('northern-route');
    expect(fortCass!.memberships![0].sequence).toBe(2);
  }, 30000);

  it('3. Rejects invalid alternateNames that conflate distinct historical entities', () => {
    // Gunter's Landing vs Gunter Island
    expect(validateEntityAlias("Gunter's Landing", "Gunter Island")).toBe(false);
    expect(validateEntityAlias("Gunter Island", "Gunter's Landing")).toBe(false);

    // Memphis vs Fort Pillow
    expect(validateEntityAlias("Memphis", "Fort Pillow")).toBe(false);
    expect(validateEntityAlias("Fort Pillow", "Memphis")).toBe(false);

    // Fort Coffee vs Oklahoma City
    expect(validateEntityAlias("Fort Coffee", "Oklahoma City")).toBe(false);
    expect(validateEntityAlias("Oklahoma City", "Fort Coffee")).toBe(false);

    // Fort Cass vs Fort Gibson
    expect(validateEntityAlias("Fort Cass", "Fort Gibson")).toBe(false);
    expect(validateEntityAlias("Fort Gibson", "Fort Cass")).toBe(false);
  });

  it('4. Rejects malformed AI JSON and recovers full authoritative topology directly from registry', async () => {
    // Deliberately malformed JSON with unescaped syntax and nested broken tokens
    const malformedText = `
      {
        "title": "Trail of Tears",
        "routeType": "multi_location_campaign",
        "routeGroups": [
          { { invalid syntax here } },
          "waypoints": [ broken array
    `;

    const mockGenerateFn = async () => ({
      text: malformedText
    });

    const result = await generateRoute('Where did the Trail of Tears take place?', 'HISTORICAL_EVENT', mockGenerateFn);

    // Completely falls back to canonical registry
    expect(result.waypoints.length).toBe(13);
    expect(result.routeGroups?.length).toBe(4);

    const groupIds = result.routeGroups?.map(g => g.id);
    expect(groupIds).toEqual(['northern-route', 'benge-route', 'bell-route', 'water-route']);

    // Sequence contiguous 1..total
    expect(result.waypoints.map(w => w.globalSequence)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1)
    );
  }, 30000);

  it('5. AI Contamination Test: Verifies registry immutability when AI attempts to provide conflicting topology and metadata', async () => {
    // Deliberately construct an AI response containing toxic/mutated route data:
    // - wrong IDs
    // - corrupted coordinates
    // - corrupted routeGroupId
    // - corrupted sequence and memberships
    // - fabricated non-existent stops
    const mockCorruptAI = {
      title: "Trail of Tears",
      routeType: "single_location", // Corrupted routeType
      routeEvidenceMode: "LLM_INFERRED_ROUTE", // Corrupted evidence mode
      isSequential: true, // Corrupted sequentiality
      routeGroups: [
        {
          id: "bogus-group",
          name: "Bogus Route",
          route: [
            {
              id: "wrong-id-new-echota",
              name: "New Echota",
              canonicalName: "Corrupted New Echota",
              lat: 10.0000,
              lng: 20.0000,
              routeGroupId: "bogus-group",
              routeGroupName: "Bogus Route",
              sequence: 999,
              memberships: [
                { routeGroupId: "bogus-group", routeGroupName: "Bogus Route", sequence: 999 }
              ],
              waypointType: "administrative_depot",
              routeContext: "Valid historical role statement for New Echota.",
              description: "In December 1835, a minority Cherokee faction signed the Treaty of New Echota ceding lands east of the Mississippi. The Cherokee National Council rejected the treaty, but federal authorities enforced it to compel removal.",
              significance: "The treaty served as the legal pretext for the forced displacement of the Cherokee Nation from their ancestral homeland.",
              historicalPeriod: "1835-1838"
            }
          ]
        }
      ]
    };

    const mockGenerateFn = async () => ({
      text: JSON.stringify(mockCorruptAI)
    });

    const result = await generateRoute('Trail of Tears', 'HISTORICAL_EVENT', mockGenerateFn);

    // 1. Must preserve canonical route groups and evidence mode from registry
    expect(result.routeEvidenceMode).toBe('MULTI_ROUTE_EVENT');
    expect(result.isSequential).toBe(false);
    expect(result.routeGroups?.length).toBe(4);
    expect(result.waypoints.length).toBe(13);

    // 2. New Echota must have 100% authoritative registry identity and coordinates
    const newEchota = result.waypoints.find(w => w.name === 'New Echota');
    expect(newEchota).toBeDefined();
    expect(newEchota!.id).toBe('northern-route-new-echota');
    expect(newEchota!.canonicalName).toBe('New Echota');
    expect(newEchota!.routeGroupId).toBe('northern-route');
    expect(newEchota!.routeGroupName).toBe('Northern Route');
    expect(newEchota!.sequence).toBe(1);
    expect(newEchota!.globalSequence).toBe(1);
    expect(newEchota!.lat).toBeCloseTo(34.5408, 4);
    expect(newEchota!.lng).toBeCloseTo(-84.9100, 4);
    expect(newEchota!.waypointType).toBe('historical_site');

    // 3. Approved narrative enrichment IS attached
    expect(newEchota!.description).toContain('Treaty of New Echota');
    expect(newEchota!.significance).toContain('legal pretext');
  }, 30000);
});
