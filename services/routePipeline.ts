import { Waypoint, ProvenanceRecord, HistoricalIssue, Route } from '../types';
import { generateContentWithRetry, modelName } from './geminiService';
import { PIPELINE_DEBUG, logWaypointSnapshot, logFieldDiff, logHierarchy, logPipelineSummary, PipelineSummary } from '../utils/pipelineDebug';
import { parseAndExtract } from '../utils/jsonParser';
import { validateEarthGeography } from './celestialCapabilities';

export const runRoutePipeline = async (text: string, isUrl: boolean, generateRawRoute: (text: string, isUrl: boolean) => Promise<{ waypoints: any[], title?: string, routeConfidence?: any, routeType?: string }>, intent?: string): Promise<Route> => {
  const pipelineId = Math.random().toString(16).substring(2, 8);
  console.log(`[Pipeline ${pipelineId}] === STARTING 6-STAGE VALIDATION PIPELINE ===`);

  // Stage 1: Generate
  console.log(`[Pipeline ${pipelineId}] Stage 1: Generate (Calling AI)`);
  const { waypoints: rawItems, title: rawTitle, routeConfidence: rawRouteConfidence, routeType: rawRouteType } = await generateRawRoute(text, isUrl);

  // Stage 2: Normalize
  console.log(`[Pipeline ${pipelineId}] Stage 2: Normalize (Structural initialization)`);
  let normalizedItems = rawItems.map((item, i): Waypoint => {
    const wp: Waypoint = {
      id: item.id || `wp-${i}-${Date.now()}`,
      name: item.name || "Unknown Waypoint",
      canonicalName: item.canonicalName,
      historicalRegion: item.historicalRegion,
      modernLocation: item.modernLocation,
      lat: item.lat || 0,
      lng: item.lng || 0,
      role: item.role,
      parentId: item.parentId,
      sequence: item.sequence,
      alternateNames: Array.isArray(item.alternateNames) ? item.alternateNames : [],
      context: item.context || "",
      routeTitle: item.routeTitle || rawTitle,
      description: item.description,
      significance: item.significance,
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
      historicalPeriod: item.historicalPeriod,
      entities: Array.isArray(item.entities) ? item.entities : [],
      historicalConfidence: item.historicalConfidence,
      provenance: [{
        stage: 'normalization',
        source: 'deterministic',
        timestamp: new Date().toISOString(),
        summary: 'Initialized structure from raw generation'
      }]
    };
    if (i === 0) logFieldDiff('Stage 2: Normalize', item, wp);
    if (i === 0) logWaypointSnapshot('Stage 2: Normalize', wp);
    return wp;
  });

  let issues: HistoricalIssue[] = [];
  let validationIssuesCount = 0;
  let placeholderRemoved = 0;
  let placeholderRepaired = 0;

  // Stage 3: Structural Validation
  console.log(`[Pipeline ${pipelineId}] Stage 3: Structural Validation`);
  normalizedItems = normalizedItems.filter(w => {
    // Clean empty alternateNames arrays
    if (w.alternateNames) {
      w.alternateNames = w.alternateNames
        .map(n => typeof n === 'string' ? n.trim() : n)
        .filter(n => n !== "")
        .filter((n, index, self) => self.indexOf(n) === index);
    }
    
    const isValidCoords = w.lat !== 0 || w.lng !== 0;
    if (!isValidCoords) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Invalid coordinates`);
      return false; // Real failures (no coords) are filtered
    }
    
    // Reject NYC fallback
    if (Math.abs(w.lat - 40.7128) < 0.001 && Math.abs(w.lng - -74.006) < 0.001) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Resolved to NYC fallback coordinates`);
      return false;
    }
    
    // Reject exact name match with query
    if (w.name.toLowerCase() === text.toLowerCase()) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Waypoint name exactly matches route name`);
      return false;
    }

    // Celestial Body Validation: Enforce Earth-only support
    const celestialValidation = validateEarthGeography({
      name: w.name,
      canonicalName: w.canonicalName,
      historicalRegion: w.historicalRegion,
      modernLocation: w.modernLocation,
      description: w.description
    });

    if (!celestialValidation.isValid) {
      console.warn(`[Pipeline ${pipelineId}] Celestial Body Validation failed for ${w.name}: Unsupported celestial body '${celestialValidation.celestialBody}'. TerraExplorer supports Earth only.`);
      return false;
    }
    
    if (intent === 'route') {
      const genericRegionPatterns = [
        /central asia/i,
        /the balkans/i,
        /europe/i,
        /asia/i,
        /various cities/i,
        /region/i,
        /empire/i
      ];
      const isGeneric = genericRegionPatterns.some(pattern => pattern.test(w.name));
      if (isGeneric) {
         console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Generic region rejected in route mode`);
         validationIssuesCount++;
         issues.push({
           waypointId: w.id,
           operation: 'replace',
           severity: 'error',
           confidence: 1.0,
           field: 'name',
           originalValue: w.name,
           replacement: "NEEDS_LLM_REPLACEMENT",
           reason: `${w.name} is a broad region/empire, not a physical traversable stop.`,
           source: 'structural_validation'
         });
         // We do NOT filter it out. The repair stage or LLM audit will replace it.
      }
    }
    
    return true;
  });
  
  // Route Type / Waypoint Reconciliation
  let effectiveRouteType = rawRouteType;
  
  if (normalizedItems.length === 1) {
    if (rawRouteType === 'regional_event' || (rawRouteType && rawRouteType !== 'single_location' && rawRouteType !== 'point' && intent === 'HISTORICAL_EVENT')) {
      effectiveRouteType = 'single_location';
      console.log(`[ROUTE TYPE RECONCILIATION]\nGenerated routeType: ${rawRouteType}\nValid waypoint count: ${normalizedItems.length}\nIntent: ${intent || 'UNKNOWN'}\nAction: NORMALIZE_SINGLE_LOCATION_ROUTE\nNormalized routeType: ${effectiveRouteType}`);
    } else if (rawRouteType && rawRouteType !== 'single_location' && rawRouteType !== 'point') {
      console.log(`[ROUTE TYPE RECONCILIATION]\nGenerated routeType: ${rawRouteType}\nValid waypoint count: ${normalizedItems.length}\nIntent: ${intent || 'UNKNOWN'}\nAction: CANNOT_NORMALIZE`);
    }
  }

  if (effectiveRouteType === 'point' || effectiveRouteType === 'single_location') {
    if (normalizedItems.length < 1) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed: '${effectiveRouteType}' routeType must have at least 1 valid waypoint. Found ${normalizedItems.length}`);
      return { waypoints: [], title: rawTitle, routeConfidence: rawRouteConfidence, routeType: effectiveRouteType as any };
    }
  } else {
    if (normalizedItems.length < 2) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed: Multi-location routeType '${effectiveRouteType}' must have at least 2 valid waypoints. Found ${normalizedItems.length}`);
      return { waypoints: [], title: rawTitle, routeConfidence: rawRouteConfidence, routeType: effectiveRouteType as any };
    }
  }

  // Sequence Validation (Stage 3 continuation)
  const sequences = normalizedItems.map(w => w.sequence).filter(s => typeof s === 'number') as number[];
  const hasSequenceMissing = sequences.length < normalizedItems.length;
  const hasDuplicateSequence = new Set(sequences).size !== sequences.length;
  const expectedSum = (normalizedItems.length * (normalizedItems.length + 1)) / 2;
  const actualSum = sequences.reduce((a, b) => a + b, 0);
  const sequenceStartsAt1 = sequences.includes(1);
  const hasSequenceGaps = !hasSequenceMissing && (!sequenceStartsAt1 || actualSum !== expectedSum);
  
  if (hasSequenceMissing || hasDuplicateSequence || hasSequenceGaps) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for sequence: missing=${hasSequenceMissing}, duplicates=${hasDuplicateSequence}, gaps=${hasSequenceGaps}`);
      console.warn(`[Pipeline ${pipelineId}] Waypoint sequence invalid:\n${normalizedItems.map(w => w.sequence).join(',')}`);
  }

  // Stage 4: Deterministic Repair
  console.log(`[Pipeline ${pipelineId}] Stage 4: Deterministic Repair`);
  const repairedItems: Waypoint[] = [];
  for (let i = 0; i < normalizedItems.length; i++) {
    const current = normalizedItems[i];
    const prev = repairedItems.length > 0 ? repairedItems[repairedItems.length - 1] : null;
    
    // Remove consecutive duplicates by coordinates
    if (prev && Math.abs(prev.lat - current.lat) < 0.001 && Math.abs(prev.lng - current.lng) < 0.001) {
      let isDuplicate = false;
      let reason = "";
      
      const hasUniqueContext = current.role === 'historical_context' || current.role === 'related' || current.significance;
      
      if (prev.canonicalName === current.canonicalName && prev.role === current.role && !hasUniqueContext) {
        isDuplicate = true;
        reason = "Identical canonical name and role with no unique historical significance";
      } else if (prev.canonicalName !== current.canonicalName) {
        reason = "Same city but unique landmark entity";
      } else {
        reason = "Unique historical/contextual significance";
      }
      
      console.log(`\n===== DUPLICATE DECISION =====\nCandidate: ${current.name}\nReason: ${reason}\nAction: ${isDuplicate ? 'REMOVED' : 'PRESERVED'}\n==============================`);
      
      if (isDuplicate) {
        continue;
      }
    }
    
    // Trim whitespace
    current.name = current.name.trim();
    if (current.description) current.description = current.description.trim();
    if (current.significance) current.significance = current.significance.trim();
    
    // Repair obvious sequence issues
    if (hasSequenceMissing || hasDuplicateSequence || hasSequenceGaps) {
       const repairedSequence = repairedItems.length + 1;
       if (current.sequence !== repairedSequence) {
          current.sequence = repairedSequence;
          current.provenance!.push({
            stage: 'deterministic_repair',
            source: 'deterministic',
            timestamp: new Date().toISOString(),
            summary: `Repair: Added missing sequence metadata from deterministic index mapping (Sequence: ${repairedSequence})`
          });
          console.log(`[Pipeline ${pipelineId}] Repair: Assigned sequence ${repairedSequence} to ${current.name}`);
       }
    }
    
    current.provenance!.push({
      stage: 'deterministic_repair',
      source: 'deterministic',
      timestamp: new Date().toISOString()
    });
    
    repairedItems.push(current);
  }

  // Stage 5: LLM Audit
  console.log(`[Pipeline ${pipelineId}] Stage 5: LLM Audit`);
  try {
    const auditPrompt = `
      You are an expert historian auditor. Review the following historical route waypoints.
      You must optimize for precision over recall. Return corrections ONLY when highly confident (>0.90). If uncertain, return no issue rather than speculate.
      
      Look for:
      - Glaring historical inaccuracies in names or descriptions.
      - Anachronisms.
      - Waypoints that are continents, countries, vast empires, or broad regions (e.g. "Europe", "Persian Empire"). For these, suggest a specific, traversable historical stop (city, port, oasis, fortress) that replaces the broad region in the context of the journey.

      
      Input Data:
      ${JSON.stringify(repairedItems.map(w => ({ id: w.id, name: w.name, description: w.description, historicalPeriod: w.historicalPeriod })), null, 2)}
      
      Output Schema:
      Return a STRICT JSON array of HistoricalIssue objects:
      [
        {
          "waypointId": "wp-xxx",
          "operation": "replace",
          "severity": "error",
          "confidence": 0.95,
          "field": "name",
          "originalValue": "Old Name",
          "replacement": "Corrected Name",
          "reason": "Why it was corrected",
          "source": "historical_llm"
        }
      ]
      
      If no issues are found, return [].
    `;
    const response = await generateContentWithRetry({
      model: modelName,
      contents: auditPrompt,
      config: { maxOutputTokens: 2048 }
    });
    
    const parseResult = parseAndExtract(response.text);
    
    console.log(`\n===== LLM AUDIT JSON PIPELINE =====`);
    console.log(`Extraction: ${parseResult.extracted ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Parse: ${parseResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Repair: ${parseResult.success && parseResult.repairs && parseResult.repairs.length > 0 ? 'SUCCESS' : (parseResult.success ? 'SKIPPED' : 'FAILED')}`);
    console.log(`Fallback: ${!parseResult.success ? 'USED' : 'SKIPPED'}`);
    console.log(`===================================\n`);
    
    if (parseResult.success && Array.isArray(parseResult.value)) {
       const parsed = parseResult.value;
       issues.push(...parsed.filter((issue: any) => issue.confidence > 0.90));
       // Filter out Stage 3 issues if the LLM also provided a replacement for the same waypoint
       const llmReplacedIds = new Set(parsed.filter((i: any) => i.confidence > 0.90).map((i: any) => i.waypointId));
       issues = issues.filter(issue => issue.source !== 'structural_validation' || !llmReplacedIds.has(issue.waypointId));
    } else {
       console.warn(`[Pipeline ${pipelineId}] Audit returned invalid format or failed to parse. Proceeding with 0 patches.`);
    }
  } catch (err: any) {
    console.error(`[Pipeline ${pipelineId}] Audit failed:`, err);
    console.warn(`[Pipeline ${pipelineId}] Proceeding with 0 patches due to audit failure.`);
  }

  // Stage 5.5: Validate Waypoint Identity Integrity
  const validateWaypointIdentityIntegrity = (waypoints: Waypoint[], issues: HistoricalIssue[]) => {
    let identityValid = true;
    const blockedChanges: string[] = [];
    
    const validIssues = issues.filter(issue => {
      if (issue.operation === 'replace') {
        const protectedFields = ['id', 'name', 'canonicalName', 'coordinates', 'sequence', 'historicalRegion', 'lat', 'lng'];
        if (protectedFields.includes(issue.field)) {
          console.log(`\n[LLM AUDIT BLOCKED]\nReason: Protected identity mutation\nField: ${issue.field}\nOriginal: ${issue.originalValue}\nProposed: ${issue.replacement}\n===================`);
          identityValid = false;
          blockedChanges.push(`Blocked change to protected field ${issue.field} from ${issue.originalValue} to ${issue.replacement}`);
          return false;
        }
      }
      return true;
    });
    
    return { identityValid, blockedChanges, validIssues };
  };
  
  const identityValidation = validateWaypointIdentityIntegrity(repairedItems, issues);
  issues = identityValidation.validIssues;

  // Stage 6: Patch
  console.log(`[Pipeline ${pipelineId}] Stage 6: Patch (${issues.length} high-confidence issues)`);
  const patchedItems = repairedItems.map((wp, idx) => {
    const wpIssues = issues.filter(i => i.waypointId === wp.id);
    if (wpIssues.length === 0) return wp;
    
    const patchedWp = { ...wp };
    let patchesApplied = 0;
    
    for (const issue of wpIssues) {
      if (issue.operation === 'replace') {
        // Staleness guard
        if ((patchedWp as any)[issue.field] === issue.originalValue) {
          (patchedWp as any)[issue.field] = issue.replacement;
          patchesApplied++;
        } else {
           console.warn(`[Pipeline ${pipelineId}] Aborted patch on ${patchedWp.name}.${issue.field} due to stale originalValue.`);
        }
      }
      // Future: handle insert/remove if needed
    }
    
    if (patchesApplied > 0) {
      patchedWp.provenance!.push({
        stage: 'patch',
        source: 'llm',
        timestamp: new Date().toISOString(),
        summary: `Applied ${patchesApplied} historical patches`
      });
    }
    
    if (idx === 0) logFieldDiff('Stage 6: Patch', wp, patchedWp);
    if (idx === 0) logWaypointSnapshot('Stage 6: Patch', patchedWp);

    return patchedWp;
  });
  
  // Stage 6.5: Final Deterministic Validation Guard
  console.log(`[Pipeline ${pipelineId}] Stage 6.5: Final Deterministic Validation Guard`);
  const placeholderPatterns = [
    /NEEDS_LLM_REPLACEMENT/i,
    /UNKNOWN_LOCATION/i,
    /INVALID_LOCATION/i,
    /Needs LLM Replacement/i,
    /UNKNOWN/i,
    /TBD/i,
    /PLACEHOLDER/i
  ];
  
  const cleanItems: Waypoint[] = [];
  const itemsToProcess = [...patchedItems];
  
  for (let i = 0; i < itemsToProcess.length; i++) {
    const wp = itemsToProcess[i];
    const fieldsToScan = [wp.name, wp.canonicalName, wp.modernLocation, wp.description].filter(Boolean) as string[];
    const hasPlaceholder = fieldsToScan.some(text => placeholderPatterns.some(pattern => pattern.test(text)));
    
    if (hasPlaceholder) {
      console.log(`\n===== PLACEHOLDER REMOVAL =====`);
      console.log(`Removed:\n${wp.id} ${wp.name} ${wp.name.includes('NEEDS_LLM_REPLACEMENT') ? 'NEEDS_LLM_REPLACEMENT' : 'INVALID_LOCATION'}`);
      
      const removedId = wp.id;
      const newParentId = wp.parentId;
      const childrenToUpdate = itemsToProcess.filter(c => c.parentId === removedId);
      
      if (childrenToUpdate.length > 0) {
         childrenToUpdate.forEach(c => c.parentId = newParentId);
         console.log(`Reparented:\n${childrenToUpdate.map(c => `${c.id} -> ${newParentId || 'none'}`).join('\n')}`);
      }
      console.log(`===============================`);
      
      placeholderRemoved++;
      itemsToProcess.splice(i, 1);
      i--;
      continue;
    }
  }
  
  cleanItems.push(...itemsToProcess);

  console.log(`[Pipeline ${pipelineId}] WAYPOINTS BEFORE STAGE 7:`);
  cleanItems.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));

  // Stage 7: Sequential Hierarchy
  if (intent === 'route' && cleanItems.length > 0) {
    let lastPrimaryId: string | undefined = undefined;
    
    // Enforce sequence ordering before building hierarchy
    cleanItems.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    
    // We rebuild entirely from scratch based strictly on traversal order
    for (let i = 0; i < cleanItems.length; i++) {
      const wp = cleanItems[i];
      const oldParent = wp.parentId;
      let newParent: string | undefined = undefined;
      let reason = "";

      // Treat missing roles as 'primary' by default
      const isPrimary = wp.role === 'primary' || !wp.role;
      
      if (isPrimary) {
         if (!lastPrimaryId) {
            newParent = undefined;
            reason = "First primary node in route";
         } else {
            newParent = lastPrimaryId;
            reason = "Chronological chain of primary nodes";
         }
         lastPrimaryId = wp.id;
      } else {
         // role = related/administrative/historical_context
         // Never trust LLM, always attach to nearest preceding primary
         if (lastPrimaryId) {
             newParent = lastPrimaryId;
             reason = "Attached related/context node to nearest preceding primary";
         } else {
             newParent = undefined;
             reason = "No preceding primary node available to attach to";
         }
      }

      if (oldParent !== newParent) {
          console.log(`\n===== HIERARCHY REPAIR =====\nWaypoint: ${wp.name}\nOld Parent: ${oldParent || 'none'}\nNew Parent: ${newParent || 'none'}\nReason: ${reason}\n==============================`);
          if (newParent) {
             wp.parentId = newParent;
          } else {
             delete wp.parentId;
          }
      }
    }
    
    console.log(`\n===== STAGE 7 FINAL HIERARCHY =====`);
    console.log(`PRIMARY CHAIN:`);
    let primaryIndex = 1;
    cleanItems.filter(wp => wp.role === 'primary').forEach(wp => {
      const parentName = wp.parentId ? cleanItems.find(p => p.id === wp.parentId)?.name || wp.parentId : 'none';
      console.log(`${primaryIndex++}. ${wp.name} parent:${parentName}`);
    });
    console.log(`CHILD CONTEXT:`);
    cleanItems.filter(wp => wp.role !== 'primary').forEach(wp => {
      const parentName = wp.parentId ? cleanItems.find(p => p.id === wp.parentId)?.name || wp.parentId : 'none';
      console.log(`${wp.name} -> ${parentName}`);
    });
    console.log(`==============================\n`);
  }

  logHierarchy(cleanItems);
  
  if (cleanItems.length > 0) {
      logWaypointSnapshot('Stage 7: Sequential Hierarchy', cleanItems[0]);
  }
  
  // Final Validation for Orphaned Parents
  for (const wp of cleanItems) {
     if (wp.parentId) {
         const parentExists = cleanItems.some(p => p.id === wp.parentId);
         if (!parentExists) {
             console.log(`\n===== ORPHANED PARENT DETECTED =====`);
             console.log(`Waypoint: ${wp.id}`);
             console.log(`Invalid Parent: ${wp.parentId}`);
             console.log(`===================================\n`);
         }
     }
  }

  const summary: PipelineSummary = {
      generated: rawItems.length,
      validated: normalizedItems.length,
      validationIssues: validationIssuesCount,
      llmRepairs: issues.length - validationIssuesCount,
      deterministicRepairs: repairedItems.length - normalizedItems.length,
      retryInvocations: 0, // Set upstream
      canonicalFieldsPresent: cleanItems.every(w => w.canonicalName !== undefined || w.modernLocation !== undefined || w.historicalRegion !== undefined),
      parentHierarchyValid: cleanItems.every((w, idx) => idx === 0 || w.parentId !== undefined),
      placeholderRemoved,
      placeholderRepaired, // Repaired placeholders are technically LLM repairs if they didn't hit this removal block
      finalRouteValid: cleanItems.length > 0 && !cleanItems.some(wp => [wp.name, wp.canonicalName, wp.modernLocation, wp.description].filter(Boolean).some(text => placeholderPatterns.some(pattern => pattern.test(text as string))))
  };
  
  logPipelineSummary(summary);

  console.log(`[Pipeline ${pipelineId}] === PIPELINE COMPLETE ===`);
  return { waypoints: cleanItems, title: rawTitle, routeConfidence: rawRouteConfidence, routeType: effectiveRouteType as any };
};
