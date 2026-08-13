const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// 1. Imports
content = content.replace("import { normalizeInfoPanelData } from '../utils/infoPanelNormalizer';", "import { selectPresentationModel } from '../selectors/selectPresentationModel';\nimport { ResolvedEntity } from '../domain';");

// 2. Props Interface
content = content.replace("info: any; // Raw input (can be LocationInfo or waypoint wrapper)", "info: ResolvedEntity | null;");

// 3. Component Signature
content = content.replace("info: rawInfo,", "info: entity,");

// 4. UseMemo
const memoPattern = /const info = React\.useMemo\(\(\) => \{[\s\S]*?\}, \[rawInfo\]\);/;
const replacement = `const presentation = React.useMemo(() => {
    if (!entity) return null;
    return selectPresentationModel(entity);
  }, [entity]);

  const info = React.useMemo(() => {
    if (!entity || !presentation) return null;
    const md = entity.metadata;
    return {
      name: presentation.title,
      type: entity.subject.identity.entityType,
      entityType: entity.subject.identity.category,
      description: md?.description?.text,
      population: md?.population,
      climate: md?.climate,
      contextNotes: md?.contextNotes || [],
      significance: null,
      coordinates: presentation.coordinates,
      boundary: null,
      news: md?.news || [],
      relatedEntities: md?.relatedEntities || [],
      historicalPeriod: (md as any)?.historicalPeriod,
      waypoint: {
          canonicalName: (md as any)?.waypoint?.canonicalName,
          alternateNames: (md as any)?.waypoint?.alternateNames || [],
      },
      routeContext: (md as any)?.routeContext,
      isLoading: isCoreLoading,
      defaultNote: (md as any)?.defaultNote,
      metadataMode: entity.subject.identity.category,
      entities: (md as any)?.entities || []
    };
  }, [entity, presentation, isCoreLoading]);`;

content = content.replace(memoPattern, replacement);
// Also need to replace the useEffect dependencies
content = content.replace(/\[info\?\.name\]/g, "[presentation?.title]");

fs.writeFileSync('components/InfoPanel.tsx', content);
console.log("Done");
