import { describe, it, expect } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import { resolveImageIntent, buildEntityImageQueries, scoreImageCandidate } from '../imageService';

describe('Image Intent Integration', () => {
  it('passes explicit intent correctly to image queries', async () => {
    const pipelineResult = await runSearchPipeline({ rawQuery: "Eiffel Tower illustration", entity: "Eiffel Tower illustration" });
    const info = (pipelineResult as any).finalData;
    
    expect(info.rawQuery).toBe("Eiffel Tower illustration");
    expect(info.name).toBe("Eiffel Tower");
    
    const resolvedIntent = resolveImageIntent(info);
    expect(resolvedIntent.category).toBe("ILLUSTRATION");
    expect(resolvedIntent.explicitMediaIntent).toBe(true);
    
    const queries = buildEntityImageQueries({ ...info, imageIntent: resolvedIntent });
    console.log("ILLUSTRATION QUERIES:", queries);
    expect(queries).toContain("Eiffel Tower illustration");
  });

  it('passes map intent correctly to image queries', async () => {
    const pipelineResult = await runSearchPipeline({ rawQuery: "Eiffel Tower map", entity: "Eiffel Tower map" });
    const info = (pipelineResult as any).finalData;
    
    const resolvedIntent = resolveImageIntent(info);
    expect(resolvedIntent.category).toBe("MAP");
    expect(resolvedIntent.explicitMediaIntent).toBe(true);
    
    const queries = buildEntityImageQueries({ ...info, imageIntent: resolvedIntent });
    console.log("MAP QUERIES:", queries);
    expect(queries).toContain("Map of Eiffel Tower");
    expect(queries).toContain("Eiffel Tower map");
  });

  it('preserves generic photographic intent', async () => {
    const pipelineResult = await runSearchPipeline({ rawQuery: "Eiffel Tower", entity: "Eiffel Tower" });
    const info = (pipelineResult as any).finalData;
    
    const resolvedIntent = resolveImageIntent(info);
    expect(resolvedIntent.category).toBe("PHYSICAL_LOCATION");
    expect(resolvedIntent.explicitMediaIntent).toBe(false);
    
    const queries = buildEntityImageQueries({ ...info, imageIntent: resolvedIntent });
    console.log("GENERIC QUERIES:", queries);
    expect(queries).toContain("Eiffel Tower");
    expect(queries).not.toContain("Eiffel Tower illustration");
  });

  it('passes painting intent correctly to image queries', async () => {
    const pipelineResult = await runSearchPipeline({ rawQuery: "Eiffel Tower painting", entity: "Eiffel Tower painting" });
    const info = (pipelineResult as any).finalData;
    
    const resolvedIntent = resolveImageIntent(info);
    expect(resolvedIntent.category).toBe("PAINTING");
    expect(resolvedIntent.explicitMediaIntent).toBe(true);
    
    const queries = buildEntityImageQueries({ ...info, imageIntent: resolvedIntent });
    console.log("PAINTING QUERIES:", queries);
    expect(queries).toContain("Eiffel Tower painting");
  });
});
