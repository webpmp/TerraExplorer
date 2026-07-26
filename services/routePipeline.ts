import { Waypoint, ProvenanceRecord, HistoricalIssue } from '../types';
import { generateContentWithRetry, modelName } from './geminiService';

export const runRoutePipeline = async (text: string, isUrl: boolean, generateRawRoute: (text: string, isUrl: boolean) => Promise<any[]>): Promise<Waypoint[]> => {
  const pipelineId = Math.random().toString(16).substring(2, 8);
  console.log(`[Pipeline ${pipelineId}] === STARTING 6-STAGE VALIDATION PIPELINE ===`);

  // Stage 1: Generate
  console.log(`[Pipeline ${pipelineId}] Stage 1: Generate (Calling AI)`);
  const rawItems = await generateRawRoute(text, isUrl);

  // Stage 2: Normalize
  console.log(`[Pipeline ${pipelineId}] Stage 2: Normalize (Structural initialization)`);
  let normalizedItems = rawItems.map((item, i): Waypoint => {
    return {
      id: `wp-${i}-${Date.now()}`,
      name: item.name || "Unknown Waypoint",
      lat: item.lat || 0,
      lng: item.lng || 0,
      context: item.context || "",
      routeTitle: item.routeTitle,
      description: item.description,
      significance: item.significance,
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
      historicalPeriod: item.historicalPeriod,
      entities: Array.isArray(item.entities) ? item.entities : [],
      provenance: [{
        stage: 'normalization',
        source: 'deterministic',
        timestamp: new Date().toISOString(),
        summary: 'Initialized structure from raw generation'
      }]
    };
  });

  // Stage 3: Structural Validation
  console.log(`[Pipeline ${pipelineId}] Stage 3: Structural Validation`);
  normalizedItems = normalizedItems.filter(w => {
    const isValid = w.lat !== 0 || w.lng !== 0;
    if (!isValid) console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Invalid coordinates`);
    return isValid;
  });

  // Stage 4: Deterministic Repair
  console.log(`[Pipeline ${pipelineId}] Stage 4: Deterministic Repair`);
  const repairedItems: Waypoint[] = [];
  for (let i = 0; i < normalizedItems.length; i++) {
    const current = normalizedItems[i];
    const prev = repairedItems.length > 0 ? repairedItems[repairedItems.length - 1] : null;
    
    // Remove consecutive duplicates by coordinates
    if (prev && Math.abs(prev.lat - current.lat) < 0.001 && Math.abs(prev.lng - current.lng) < 0.001) {
      console.log(`[Pipeline ${pipelineId}] Repair: Removed duplicate waypoint ${current.name}`);
      continue;
    }
    
    // Trim whitespace
    current.name = current.name.trim();
    if (current.description) current.description = current.description.trim();
    if (current.significance) current.significance = current.significance.trim();
    
    current.provenance!.push({
      stage: 'deterministic_repair',
      source: 'deterministic',
      timestamp: new Date().toISOString()
    });
    
    repairedItems.push(current);
  }

  // Stage 5: LLM Audit
  console.log(`[Pipeline ${pipelineId}] Stage 5: LLM Audit`);
  let issues: HistoricalIssue[] = [];
  try {
    const auditPrompt = `
      You are an expert historian auditor. Review the following historical route waypoints.
      You must optimize for precision over recall. Return corrections ONLY when highly confident (>0.90). If uncertain, return no issue rather than speculate.
      
      Look for:
      - Glaring historical inaccuracies in names or descriptions.
      - Anachronisms.
      
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
    const parsed = JSON.parse(response.text.replace(/^```json\n|\n```$/g, ''));
    if (Array.isArray(parsed)) {
      issues = parsed.filter(issue => issue.confidence > 0.90);
    }
  } catch (err) {
    console.error(`[Pipeline ${pipelineId}] Audit failed:`, err);
  }

  // Stage 6: Patch
  console.log(`[Pipeline ${pipelineId}] Stage 6: Patch (${issues.length} high-confidence issues)`);
  const finalItems = repairedItems.map(wp => {
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
    
    return patchedWp;
  });

  console.log(`[Pipeline ${pipelineId}] === PIPELINE COMPLETE ===`);
  return finalItems;
};
