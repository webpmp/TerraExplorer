const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// Fix interface
content = content.replace("entity: ResolvedEntity | null;", "info: ResolvedEntity | null;");
content = content.replace("info: entity,", "info: entity,"); 

// Fix TS errors in components/InfoPanel.tsx
content = content.replace(/md\?\.waypoint/g, "(md as any)?.waypoint");
content = content.replace(/md\?\.historicalPeriod/g, "(md as any)?.historicalPeriod");
content = content.replace(/md\?\.entities/g, "(md as any)?.entities");
content = content.replace(/md\?\.defaultNote/g, "(md as any)?.defaultNote");
content = content.replace(/md\?\.routeContext/g, "(md as any)?.routeContext");
content = content.replace(/undefined\?\.canonicalName/g, "''");
content = content.replace(/undefined\?\.alternateNames/g, "[]");
content = content.replace(/undefined\?\.title/g, "''");

// Re-read file, run regexes
fs.writeFileSync('components/InfoPanel.tsx', content);

console.log("Done");
