import { describe, test, expect } from 'vitest';
import { determineHistoricalEventScope } from '../geographic/historicalEventScope';
import { routeIntentAndExtractEntity } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { validateResolvedEntity, evaluateEnrichmentCompleteness } from '../entityValidation';
import { validateEntityIdentity } from '../geographic/entityIdentityValidator';

describe('Historical Event Geographic Resolution Pipeline Tests', () => {

  test('Test Case 1: Great Depression query resolves with GLOBAL_EVENT scope and no coordinates', async () => {
    const query = "Where did the Great Depression take place?";
    const routing = routeIntentAndExtractEntity(query);

    expect(routing.intent).toBe('HISTORICAL_EVENT');
    expect(routing.entity.toLowerCase()).toContain('great depression');
    expect(routing.resolutionMode).toBe('HISTORICAL_NON_POINT');
    expect(routing.geographicScope).toBe('GLOBAL_EVENT');
    expect(routing.singleLocation).toBe(false);

    const result = await runSearchPipeline({ rawQuery: query });
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect((result as any).finalData).toBeDefined();
    expect((result as any).finalData.name).toBe('Great Depression');
    expect((result as any).finalData.coordinates).toBeUndefined();
    expect((result as any).finalData.entityType).toBe('historical_event');
    expect((result as any).finalData.geographicScope).toBe('GLOBAL_EVENT');
    expect((result as any).finalData.singleLocation).toBe(false);
  });

  test('Test Case 2: Boston Massacre query resolves with POINT_EVENT scope and deterministic coordinates', async () => {
    const query = "Where did the Boston Massacre take place?";
    const routing = routeIntentAndExtractEntity(query);

    expect(routing.intent).toBe('HISTORICAL_EVENT');
    expect(routing.entity.toLowerCase()).toContain('boston massacre');
    expect(routing.resolutionMode).toBe('SINGLE_POINT');

    const result = await runSearchPipeline({ rawQuery: query });
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect((result as any).finalData).toBeDefined();
    expect((result as any).finalData.coordinates).toBeDefined();
    expect((result as any).finalData.coordinates.lat).toBeCloseTo(42.3588, 3);
    expect((result as any).finalData.coordinates.lng).toBeCloseTo(-71.0578, 3);
    expect((result as any).finalData.entityType).toBe('historical_event_site');
  });

  test('Test Case 3: Identity validator strictly rejects RMS Lusitania substitution for Great Depression', () => {
    const check = validateEntityIdentity('Great Depression', 'RMS Lusitania Sinking Site', {
      rawQuery: 'Where did the Great Depression take place?',
      intent: 'HISTORICAL_EVENT'
    });

    expect(check.matches).toBe(false);
  });

  test('Test Case 4: World War II classifies as GLOBAL_EVENT and skips single point coordinate resolution', () => {
    const scope = determineHistoricalEventScope('World War II', 'Where did World War II take place?');
    expect(scope.scope).toBe('GLOBAL_EVENT');
    expect(scope.singleLocation).toBe(false);
    expect(scope.routing).toBe('HISTORICAL_NON_POINT');
  });

  test('Test Case 5: Viking Age classifies as REGIONAL_EVENT and skips single point coordinate resolution', () => {
    const scope = determineHistoricalEventScope('Viking Age', 'Where did the Viking Age take place?');
    expect(scope.scope).toBe('REGIONAL_EVENT');
    expect(scope.singleLocation).toBe(false);
    expect(scope.routing).toBe('HISTORICAL_NON_POINT');
  });

  test('Test Case 6: Battle of Gettysburg classifies as POINT_EVENT and routes to SINGLE_LOCATION', () => {
    const scope = determineHistoricalEventScope('Battle of Gettysburg', 'Where was the Battle of Gettysburg fought?');
    expect(scope.scope).toBe('POINT_EVENT');
    expect(scope.singleLocation).toBe(true);
    expect(scope.routing).toBe('SINGLE_LOCATION');
  });

  test('Test Case 7: Enrichment completeness does not require climate or coordinates for historical_event', () => {
    const completeness = evaluateEnrichmentCompleteness(
      {
        description: 'The Great Depression was a severe worldwide economic depression that took place mostly during the 1930s.',
        notable: ['Stock market crash of 1929', 'Global economic crisis'],
        contextNotes: ['Global non-point historical event']
      },
      'Great Depression',
      'historical_event'
    );

    expect(completeness.status).toBe('COMPLETE');
    expect(completeness.recoveryRequired).toBe(false);
    expect(completeness.missingFields).not.toContain('climate');
    expect(completeness.missingFields).not.toContain('coordinates');
  });

});
