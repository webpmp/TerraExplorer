const fs = require('fs');
let content = fs.readFileSync('services/pipeline.ts', 'utf-8');

content = content.replace("import {\n    ResolvedEntity,\n    SearchIdentity,\n    GeographicRecord,\n    EnrichmentResult\n} from '../types';", "import {\n    ResolvedEntity,\n    SearchIdentity,\n    GeographicRecord,\n    EnrichmentResult\n} from '../domain';");

// It might be single line
content = content.replace(/import\s+\{\s*ResolvedEntity[\s\S]*?\}\s*from\s*'(\.\.\/types|types)';/, "import { ResolvedEntity, SearchIdentity, GeographicRecord, EnrichmentResult } from '../domain';");

fs.writeFileSync('services/pipeline.ts', content);
console.log("Done");
