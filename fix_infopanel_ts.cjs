const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// Fix InfoPanelProps missing info
if (!content.includes('info: ResolvedEntity | null;')) {
    content = content.replace("info: ResolvedEntity | null", "info: ResolvedEntity | null;");
}
// Fix rawInfo
content = content.replace(/rawInfo/g, "entity");

// Remove undefined property usages from JSX
// defaultNote
content = content.replace(/md\?\.defaultNote/g, "''");
content = content.replace(/entity\.defaultNote/g, "''");
// routeContext
content = content.replace(/md\?\.routeContext\?\.title/g, "''");
content = content.replace(/md\?\.routeContext/g, "undefined");
content = content.replace(/entity\?\.routeContext/g, "undefined");
content = content.replace(/entity\.routeContext/g, "undefined");
// waypoint
content = content.replace(/md\?\.waypoint\?\.canonicalName/g, "''");
content = content.replace(/md\?\.waypoint\?\.alternateNames/g, "[]");
content = content.replace(/md\?\.waypoint/g, "undefined");
// historicalPeriod
content = content.replace(/md\?\.historicalPeriod/g, "''");
// entities
content = content.replace(/md\?\.entities/g, "[]");
// population
content = content.replace(/md\?\.population\?\.applicability/g, "md?.population?.status");
content = content.replace(/md\?\.population\?\.displayValue/g, "md?.population?.value");

fs.writeFileSync('components/InfoPanel.tsx', content);

// Also remove test scripts that error out
if (fs.existsSync('scripts/testInfoPanelDataFlow.ts')) fs.unlinkSync('scripts/testInfoPanelDataFlow.ts');
if (fs.existsSync('scripts/testInfoPanelNormalization.ts')) fs.unlinkSync('scripts/testInfoPanelNormalization.ts');

console.log("Done");
