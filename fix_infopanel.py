import re

with open('components/InfoPanel.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = re.sub(
    r"import \{ normalizeInfoPanelData \} from '../utils/infoPanelNormalizer';\n",
    "import { selectPresentationModel } from '../selectors/selectPresentationModel';\nimport { ResolvedEntity } from '../domain';\n",
    content
)

# 2. Props Interface
content = re.sub(
    r"info: any; // Raw input.*? \n",
    "info: ResolvedEntity | null;\n",
    content
)

# 3. Component Signature
content = re.sub(
    r"info: rawInfo,",
    "info: entity,",
    content
)

# 4. UseMemo
memo_pattern = re.compile(r"const info = React\.useMemo\(\(\) => \{.*?\}, \[rawInfo\]\);", re.DOTALL)
replacement = """const presentation = React.useMemo(() => {
    if (!entity) return null;
    return selectPresentationModel(entity);
  }, [entity]);

  const md = entity?.metadata;
  const isCoreLoading = isLoading;"""

content = memo_pattern.sub(replacement, content)

# 5. JSX usage substitutions
subs = [
    (r"info\?\.name", "presentation?.title"),
    (r"info\.name", "presentation.title"),
    (r"info\?\.coordinates", "presentation?.coordinates"),
    (r"info\.coordinates", "presentation.coordinates"),
    (r"info\?\.image", "md?.image"),
    (r"info\.image", "md?.image"),
    (r"info\.defaultNote", "''"),
    (r"info\?\.routeContext", "undefined"),
    (r"info\.routeContext", "undefined"),
    (r"info\.description", "md?.description?.text"),
    (r"info\.waypoint\?\.canonicalName", "''"),
    (r"info\.waypoint\?\.alternateNames", "[]"),
    (r"info\.waypoint\.alternateNames", "[]"),
    (r"info\.waypoint", "undefined"),
    (r"info\.historicalPeriod", "''"),
    (r"info\.entities", "[]"),
    (r"info\.metadataMode === 'historical_site'", "entity?.subject.identity.category === 'event'"),
    (r"info\.metadataMode === 'natural_feature'", "entity?.subject.identity.category === 'place'"),
    (r"info\.metadataMode === 'modern_place'", "entity?.subject.identity.category === 'place'"),
    (r"info\.metadataMode", "entity?.subject.identity.category"),
    (r"info\.notable", "md?.contextNotes"),
    (r"info\.population\?\.applicability", "md?.population?.status"),
    (r"info\.population\?\.displayValue", "md?.population?.value"),
    (r"info\.population", "md?.population"),
    (r"info\.climate", "md?.climate"),
    (r"info\?\.relatedEntities", "md?.relatedEntities"),
    (r"info\.relatedEntities", "md?.relatedEntities"),
    (r"info\?\.news", "md?.news"),
    (r"info\.news", "md?.news"),
    (r"info\.isLoading", "isCoreLoading"),
    (r"formatEntityType\(info\.type\)", "formatEntityType(entity?.subject.identity.entityType)"),
    (r"if \(!info\)", "if (!entity || !presentation)"),
    (r"info\.", "md?."), # fallback for any missed info.
]

for pattern, repl in subs:
    content = re.sub(pattern, repl, content)

with open('components/InfoPanel.tsx', 'w') as f:
    f.write(content)

print("Done")
