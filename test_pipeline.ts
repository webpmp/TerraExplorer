import { runSearchPipeline } from './services/pipeline';
import { normalizeInfoPanelData } from './utils/mappers';

async function main() {
    console.log("Running pipeline...");
    const result = await runSearchPipeline({
        rawQuery: "Show me the Grand Canyon",
        intent: "GEOGRAPHIC_SEARCH",
        entity: "Grand Canyon"
    });
    console.log("Pipeline Entity Metadata:", JSON.stringify(result.entity?.metadata, null, 2));
    
    if (result.entity) {
        const info = normalizeInfoPanelData(result.entity, "AppRender");
        console.log("Normalized Info:", JSON.stringify(info, null, 2));
    }
}
main().catch(console.error);
