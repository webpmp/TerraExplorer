import { runSearchPipeline } from './services/pipeline';
import { normalizeInfoPanelData } from './utils/mappers';

async function main() {
    console.log("Running pipeline for 'Show me the Dead Sea'...");
    const pipelineResult = await runSearchPipeline({ rawQuery: "Show me the Dead Sea", intent: "DIRECT", entity: "Dead Sea" });
    
    if (pipelineResult.mode === 'location' && pipelineResult.entity) {
        console.log("\n--- PIPELINE ENTITY RAW ---");
        console.log(JSON.stringify(pipelineResult.entity, null, 2));
        
        console.log("\n--- RUNNING NORMALIZATION ---");
        const normalized = normalizeInfoPanelData(pipelineResult.entity, "test");
        
        console.log("\n--- NORMALIZED RESULT ---");
        console.log(JSON.stringify(normalized, null, 2));
    }
}
main().catch(console.error);
