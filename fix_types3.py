import re

with open('types.ts', 'r') as f:
    content = f.read()

# Fix duplicates
content = re.sub(r"import \{ ResolvedEntity, SearchIdentity, GeographicRecord, EnrichmentResult \} from '\./domain';\n", "", content)
content = re.sub(r"export \{ EntityType \} from '\./domain';\n", "", content)
content = re.sub(r"import \{ ResolvedEntity \} from '\./domain';\n", "", content)

# Add correct imports
correct_imports = "export type { EntityType } from './domain';\nimport { ResolvedEntity, SearchIdentity, GeographicRecord, EnrichmentResult } from './domain';\n"
content = correct_imports + content

with open('types.ts', 'w') as f:
    f.write(content)
print("Done")
