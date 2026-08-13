import re

with open('components/InfoPanel.tsx', 'r') as f:
    content = f.read()

subs = [
    (r"info\?\.name", "presentation?.title"),
    (r"info\.name", "presentation?.title"),
    (r"info\?\.coordinates", "presentation?.coordinates"),
    (r"info\.coordinates", "presentation?.coordinates"),
    (r"info\?\.image", "md?.image"),
    (r"info\.image", "md?.image"),
    (r"info\.defaultNote", "''"),
    (r"info\?\.routeContext\?\.title", "''"),
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
    (r"info\.", "md?."),
]

for pattern, repl in subs:
    content = re.sub(pattern, repl, content)

with open('components/InfoPanel.tsx', 'w') as f:
    f.write(content)

print("Done")
