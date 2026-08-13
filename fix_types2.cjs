const fs = require('fs');
let content = fs.readFileSync('types.ts', 'utf-8');

// Remove EntityType definition
const typeRegex = /export type EntityType =[\s\S]*?festival_site';/;
content = content.replace(typeRegex, "");

// Make sure EntityType is imported from domain
if (!content.includes("export { EntityType } from './domain';")) {
    content = "export { EntityType } from './domain';\n" + content;
}

// Make sure we have the other imports from domain
if (!content.includes("import { ResolvedEntity, SearchIdentity, GeographicRecord, EnrichmentResult } from './domain';")) {
    content = "import { ResolvedEntity, SearchIdentity, GeographicRecord, EnrichmentResult } from './domain';\n" + content;
}

fs.writeFileSync('types.ts', content);
console.log("Done");
