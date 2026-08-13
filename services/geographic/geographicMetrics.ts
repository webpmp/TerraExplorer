import { GeographicSourceType } from "./geographicResolver";

export interface ResolutionEvent {
    source: GeographicSourceType;
    confidence: number;
    ambiguous: boolean;
    durationMs: number;
}

export interface GeographicMetrics {
    totalResolutions: number;
    sourceCounts: Record<GeographicSourceType, number>;
    totalConfidence: number;
    lowConfidenceMatches: number;
    ambiguities: number;
    totalDurationMs: number;
    validationFailures: number;
    aliasMatches: number;
}

let metrics: GeographicMetrics = {
    totalResolutions: 0,
    sourceCounts: {
        "cache": 0,
        "nominatim": 0,
        "ai-fallback": 0,
        "manual": 0
    },
    totalConfidence: 0,
    lowConfidenceMatches: 0,
    ambiguities: 0,
    totalDurationMs: 0,
    validationFailures: 0,
    aliasMatches: 0
};

export function recordResolution(event: ResolutionEvent): void {
    metrics.totalResolutions++;
    metrics.sourceCounts[event.source]++;
    metrics.totalConfidence += event.confidence;
    metrics.totalDurationMs += event.durationMs;
    
    if (event.confidence < 0.6) { // arbitrary threshold for tracking low-conf but successful
        metrics.lowConfidenceMatches++;
    }
    
    if (event.ambiguous) {
        metrics.ambiguities++;
    }
}

export function getGeographicMetrics(): GeographicMetrics & { cacheCoverage: number } {
    const cacheCoverage = metrics.totalResolutions > 0 
        ? metrics.sourceCounts["cache"] / metrics.totalResolutions 
        : 0;
    return { ...metrics, sourceCounts: { ...metrics.sourceCounts }, cacheCoverage };
}

export function recordValidationFailure(): void {
    metrics.validationFailures++;
}

export function recordAliasMatch(): void {
    metrics.aliasMatches++;
}

export function resetGeographicMetrics(): void {
    metrics = {
        totalResolutions: 0,
        sourceCounts: {
            "cache": 0,
            "nominatim": 0,
            "ai-fallback": 0,
            "manual": 0
        },
        totalConfidence: 0,
        lowConfidenceMatches: 0,
        ambiguities: 0,
        totalDurationMs: 0,
        validationFailures: 0,
        aliasMatches: 0
    };
}
