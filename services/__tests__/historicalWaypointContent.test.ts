import { describe, it, expect } from 'vitest';
import { validateHistoricalWaypointContent } from '../historicalContentValidation';

describe('Historical Waypoint Content Validation Suite (New Echota Acceptance)', () => {
  it('accepts valid 3-layer historical content with semantic differentiation', () => {
    const validNewEchota = {
      name: 'New Echota',
      canonicalName: 'New Echota',
      routeContext: 'Cherokee national capital and treaty site from which overland detachments departed.',
      description: 'In December 1835, a minority Cherokee faction signed the Treaty of New Echota ceding all lands east of the Mississippi. Principal Chief John Ross and the National Council rejected the unauthorized treaty, but federal authorities enforced it to compel removal.',
      significance: 'The disputed treaty provided the legal justification used by the United States government to forcibly dispossess the Cherokee Nation.'
    };

    const result = validateHistoricalWaypointContent(validNewEchota);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.layerScores.routeContextValid).toBe(true);
    expect(result.layerScores.descriptionValid).toBe(true);
    expect(result.layerScores.significanceValid).toBe(true);
  });

  it('rejects generic boilerplate phrases across all semantic layers', () => {
    const boilerplateCases = [
      {
        name: 'New Echota',
        routeContext: 'Important location in history where people gathered.',
        description: 'New Echota was the capital of the Cherokee Nation.',
        significance: 'It was significant in American history.'
      },
      {
        name: 'Fort Cass',
        routeContext: 'Key location for the Trail of Tears in Tennessee.',
        description: 'Fort Cass served as a military staging depot for detachments.',
        significance: 'Depot where Cherokee families were interned.'
      },
      {
        name: 'Fort Gibson',
        routeContext: 'Site along the path to Indian Territory.',
        description: 'Fort Gibson was the arrival post for Cherokee detachments.',
        significance: 'Western terminus for several overland routes.'
      }
    ];

    for (const testCase of boilerplateCases) {
      const result = validateHistoricalWaypointContent(testCase);
      expect(result.isValid).toBe(false);
      expect(result.issues.some(iss => iss.includes('generic boilerplate phrase'))).toBe(true);
    }
  });

  it('rejects redundant paraphrasing across fields where semantic information is repeated', () => {
    const redundantOutput = {
      name: 'New Echota',
      canonicalName: 'New Echota',
      routeContext: 'Cherokee capital and treaty site where treaty was signed.',
      description: 'The Cherokee capital where the treaty was signed in Georgia.',
      significance: 'The Cherokee capital where the treaty was signed.'
    };

    const result = validateHistoricalWaypointContent(redundantOutput);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('lexical overlap') || iss.includes('Exact sentence') || iss.includes('Near-duplicate'))).toBe(true);
  });

  it('permits legitimate references to the same historical event across layers when each serves a distinct role', () => {
    // All 3 reference the Treaty of New Echota, but each answers its own question:
    // Layer 1: Route Context (role on route)
    // Layer 2: Description (what occurred at the location)
    // Layer 3: Significance (broader consequence to the overall event)
    const distinctTreatyReferences = {
      name: 'New Echota',
      canonicalName: 'New Echota',
      routeContext: 'Starting political assembly point and origin for detachments departing New Echota in northwestern Georgia.',
      description: 'The Cherokee council house and printing office where the 1835 treaty was drafted without authorization from Principal Chief John Ross.',
      significance: 'Ratification in the US Senate by a single vote established the federal mandate for military roundups across the Southeast.'
    };

    const result = validateHistoricalWaypointContent(distinctTreatyReferences);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects content lacking waypoint specificity', () => {
    const nonSpecificContent = {
      name: 'Tahlequah',
      canonicalName: 'Tahlequah',
      routeContext: 'A town reached after many months of marching through harsh winter weather.',
      description: 'Surviving detachments reached the western destination where families struggled to build temporary shelters.',
      significance: 'The arrival marked the end of the harrowing journey and the beginning of rebuilding society in exile.'
    };

    const result = validateHistoricalWaypointContent(nonSpecificContent);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(iss => iss.includes('waypoint specificity'))).toBe(true);
  });
});
