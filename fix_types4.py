import re

with open('types.ts', 'r') as f:
    content = f.read()

# 1. Add ResolvedEntity to imports
content = "import { ResolvedEntity } from './domain';\n" + content

# 2. Fix EntityType
entity_type_pattern = re.compile(r"export type EntityType =[\s\S]*?festival_site';")
content = entity_type_pattern.sub("export type { EntityType } from './domain';", content)

# 3. Fix LocationCacheEntry
content = content.replace("data?: LocationInfo;", "data?: ResolvedEntity;")

# 4. Fix MapMarker
marker_pattern = re.compile(r"export interface MapMarker \{[\s\S]*?type\?: string;\s*\}")
new_marker = """export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  populationClass: 'large' | 'medium' | 'small';
  type?: string;
  populationStatus?: string;
  country?: string;
  state?: string;
  city?: string;
  metadataMode?: string;
  population?: any;
  wikidataId?: string;
  climate?: any;
  requestId?: string;
}"""
content = marker_pattern.sub(new_marker, content)

with open('types.ts', 'w') as f:
    f.write(content)
print("Done")
