import { Waypoint } from '../types';

export const PIPELINE_DEBUG = true;

export function logWaypointSnapshot(stage: string, waypoint: Waypoint) {
    if (!PIPELINE_DEBUG) return;
    const fields = Object.keys(waypoint).sort();
    console.log(`
[${stage}]
ID: ${waypoint.id}
Name: ${waypoint.name}
Canonical Name: ${waypoint.canonicalName ?? 'undefined'}
Modern Location: ${waypoint.modernLocation ?? 'undefined'}
Historical Region: ${waypoint.historicalRegion ?? 'undefined'}
Role: ${waypoint.role ?? 'undefined'}
Parent ID: ${waypoint.parentId ?? 'undefined'}
Latitude: ${waypoint.lat}
Longitude: ${waypoint.lng}
Field Count: ${fields.length}
Fields: ${fields.join(', ')}

===== WAYPOINT IDENTITY =====
Sequence: ${waypoint.sequence ?? 'undefined'}
Metadata Mode: ${(waypoint as any).metadataMode ?? 'undefined'}
Historical Confidence: ${waypoint.historicalConfidence ? `${waypoint.historicalConfidence.level} (${waypoint.historicalConfidence.reasoning})` : 'undefined'}
Alternate Names: ${waypoint.alternateNames && waypoint.alternateNames.length > 0 ? waypoint.alternateNames.join(', ') : 'none'}
============================
`);
}

export function logFieldDiff(stage: string, beforeObj: any, afterObj: any) {
    if (!PIPELINE_DEBUG) return;
    
    const beforeKeys = Object.keys(beforeObj);
    const afterKeys = Object.keys(afterObj);
    
    const dropped = beforeKeys.filter(k => !(k in afterObj));
    const added = afterKeys.filter(k => !(k in beforeObj));
    const modified = beforeKeys.filter(k => k in afterObj && beforeObj[k] !== afterObj[k] && typeof beforeObj[k] !== 'object');
    
    console.log(`
===== FIELD DIFF (${stage}) =====

Dropped
----------
${dropped.length > 0 ? dropped.join('\n') : 'None'}

Added
----------
${added.length > 0 ? added.join('\n') : 'None'}

Modified
----------
${modified.length > 0 ? modified.join('\n') : 'None'}

======================
`);
}

export function logHierarchy(waypoints: Waypoint[]) {
    if (!PIPELINE_DEBUG) return;
    
    console.log(`\n===== ROUTE HIERARCHY =====`);
    waypoints.forEach((wp, idx) => {
        console.log(`\n${idx + 1}\n${wp.name}\nparent: ${wp.parentId || 'none'}`);
    });
    console.log(`\n=========================\n`);
}

export interface PipelineSummary {
    generated: number;
    validated: number;
    validationIssues: number;
    llmRepairs: number;
    deterministicRepairs: number;
    retryInvocations: number;
    canonicalFieldsPresent: boolean;
    parentHierarchyValid: boolean;
    placeholderRemoved: number;
    placeholderRepaired: number;
    finalRouteValid: boolean;
}

export function logEnrichmentJsonPipeline(
    rawText: string,
    parsed: any,
    strictRetryInvoked: boolean
) {
    if (!PIPELINE_DEBUG) return;
    
    const extractionSuccess = parsed.success || parsed.extracted !== undefined;
    
    let initialParseResult = 'FAILED';
    let repairAttempted = 'NO';
    let repairResult = 'N/A';
    
    if (parsed.success) {
        if (parsed.repairs && parsed.repairs.length > 0) {
            initialParseResult = 'FAILED';
            repairAttempted = 'YES';
            repairResult = 'SUCCESS';
        } else {
            initialParseResult = 'SUCCESS';
        }
    } else {
        if (extractionSuccess) {
            initialParseResult = 'FAILED';
            repairAttempted = 'YES';
            repairResult = 'FAILED';
        }
    }

    console.log(`
===== ENRICHMENT JSON PIPELINE =====
Raw length: ${rawText.length}
Extraction: ${extractionSuccess ? 'SUCCESS' : 'FAILED'}
Initial parse: ${initialParseResult}
Repair attempted: ${repairAttempted}
Repair result: ${repairResult}
Strict retry: ${strictRetryInvoked ? 'YES' : 'NO'}
====================================
`);
}

export function logPipelineSummary(summary: PipelineSummary) {
    if (!PIPELINE_DEBUG) return;
    
    console.log(`
===== PIPELINE SUMMARY =====

Waypoints Generated: ${summary.generated}
Waypoints Validated: ${summary.validated}
Validation Issues: ${summary.validationIssues}
LLM Repairs Applied: ${summary.llmRepairs}
Deterministic Repairs: ${summary.deterministicRepairs}
Retry Invocations: ${summary.retryInvocations}
Placeholder Waypoints Removed: ${summary.placeholderRemoved}
Placeholder Waypoints Repaired: ${summary.placeholderRepaired}

Canonical Fields Present: ${summary.canonicalFieldsPresent ? 'YES' : 'NO'}
Parent Hierarchy Valid: ${summary.parentHierarchyValid ? 'YES' : 'NO'}
Final Route Valid: ${summary.finalRouteValid ? 'YES' : 'NO'}

============================
`);
}
