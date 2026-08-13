const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// Imports
content = content.replace("import { normalizeInfoPanelData } from '../utils/infoPanelNormalizer';", "import { selectPresentationModel } from '../selectors/selectPresentationModel';\nimport { ResolvedEntity } from '../domain';");

// Props Interface
content = content.replace("info: any; // Raw input (can be LocationInfo or waypoint wrapper)", "info: ResolvedEntity | null;");

// Component Signature
content = content.replace("info: rawInfo,", "info: entity,");

// Hooks and Memos
content = content.replace(/const info = React\.useMemo\(\(\) => \{[\s\S]*?\}, \[rawInfo\]\);/, 
`const presentation = React.useMemo(() => {
    if (!entity) return null;
    return selectPresentationModel(entity);
  }, [entity]);

  const md = entity?.metadata;`);

// Find-Replace usages
content = content.replace(/info\?\.name/g, "presentation?.title");
content = content.replace(/info\.name/g, "presentation.title");

content = content.replace(/info\?\.coordinates/g, "presentation?.coordinates");
content = content.replace(/info\.coordinates/g, "presentation.coordinates");

content = content.replace(/info\?\.image/g, "md?.image");
content = content.replace(/info\.image/g, "md?.image");

content = content.replace(/info\.defaultNote/g, "md?.defaultNote");

content = content.replace(/info\?\.routeContext/g, "md?.routeContext");
content = content.replace(/info\.routeContext/g, "md?.routeContext");

content = content.replace(/info\.description/g, "md?.description?.text");

content = content.replace(/info\.waypoint\?\.canonicalName/g, "md?.waypoint?.canonicalName");
content = content.replace(/info\.waypoint\?\.alternateNames/g, "md?.waypoint?.alternateNames");
content = content.replace(/info\.waypoint\.alternateNames/g, "md?.waypoint?.alternateNames");
content = content.replace(/info\.waypoint/g, "md?.waypoint");

content = content.replace(/info\.historicalPeriod/g, "md?.historicalPeriod");

content = content.replace(/info\.entities/g, "md?.entities");

content = content.replace(/info\.metadataMode/g, "entity?.subject.identity.category");

content = content.replace(/info\.notable/g, "md?.contextNotes");

content = content.replace(/info\.population/g, "md?.population");

content = content.replace(/info\.climate/g, "md?.climate");

content = content.replace(/info\?\.relatedEntities/g, "md?.relatedEntities");
content = content.replace(/info\.relatedEntities/g, "md?.relatedEntities");

content = content.replace(/info\?\.news/g, "md?.news");
content = content.replace(/info\.news/g, "md?.news");

content = content.replace(/info\.isLoading/g, "isCoreLoading");

content = content.replace(/formatEntityType\(info\.type\)/g, "formatEntityType(entity?.subject.identity.entityType)");

content = content.replace(/if \(!info\)/g, "if (!entity || !presentation)");
content = content.replace(/info(?!\w)/g, "entity");

fs.writeFileSync('components/InfoPanel.tsx', content);
console.log("Done");
