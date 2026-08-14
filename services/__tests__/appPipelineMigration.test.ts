import { describe, test, expect } from 'vitest';
import { runSearchPipeline, IntentStage } from '../pipeline';
import { isValidCoordinates } from '../../types';

describe('App Pipeline Migration Tests', () => {
  test('mock recovery pipeline functions correctly', async () => {
    // Custom mock pipeline
    async function mockRunSearchPipeline(query: string, mockResolverResult: any, mockRecoveryResult: any) {
        const searchRequest = { rawQuery: query };
        const entityResult = IntentStage(searchRequest);
        
        let error = mockResolverResult.error;
        let resolvedData = mockResolverResult.locationInfo;
        let recoveryUsed = false;
        
        const allowedErrors = ["NO_GEOGRAPHIC_DATA", "LOCATION_SYSTEM_UNAVAILABLE", "UNABLE_TO_RESOLVE"];
        if (error && allowedErrors.includes(error) && resolvedData && resolvedData.name && !resolvedData.coordinates) {
          if (mockRecoveryResult) {
            resolvedData.coordinates = mockRecoveryResult;
            error = undefined;
            recoveryUsed = true;
          }
        }
        
        const isValid = isValidCoordinates(resolvedData?.coordinates);
        return {
            mode: "location",
            isValid,
            error: error || (isValid ? undefined : "NO_GEOGRAPHIC_DATA"),
            finalData: isValid ? resolvedData : null
        };
    }

    const recoveryResult = await mockRunSearchPipeline("Show me the Dead Sea", 
        { error: "LOCATION_SYSTEM_UNAVAILABLE", locationInfo: { name: "Dead Sea", entityType: "natural_feature" } },
        { lat: 31.5590, lng: 35.4732 }
    );

    expect(recoveryResult.isValid).toBe(true);
    expect(recoveryResult.finalData?.coordinates.lat).toBe(31.5590);

    const failureResult = await mockRunSearchPipeline("Where is Null Island?", 
        { error: undefined, locationInfo: { name: "Null Island", coordinates: { lat: 0, lng: 0 } } },
        null
    );

    expect(failureResult.isValid).toBe(false);
    expect(failureResult.error).toBe("NO_GEOGRAPHIC_DATA");
  });
});
