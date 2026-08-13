const fs = require('fs');
let content = fs.readFileSync('types.ts', 'utf-8');

// 1. Add ResolvedEntity to imports
if (!content.includes("import { ResolvedEntity } from './domain';")) {
    content = "import { ResolvedEntity } from './domain';\n" + content;
}

// 2. Fix LocationCacheEntry
content = content.replace("data?: LocationInfo;", "data?: ResolvedEntity;");

// 3. Fix MapMarker
const markerRegex = /export interface MapMarker \{[\s\S]*?type\?: string;\s*\}/;
const newMarker = `export interface MapMarker {
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
}`;
content = content.replace(markerRegex, newMarker);

fs.writeFileSync('types.ts', content);
console.log("Done");
