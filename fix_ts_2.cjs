const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// Fix the InfoPanel signature
content = content.replace("entity: entity,", "info: entity,");

// Line 223: } else if ('') {
content = content.replace("} else if ('') {", "} else if (false) {");

// The routeContext conditional rendering in JSX
content = content.replace(/\{undefined && \(/g, "{false && (");
content = content.replace(/undefined \? \(/g, "false ? (");
content = content.replace(/entity\?\.subject\.identity\.category === 'historical_site'/g, "entity?.subject.identity.category === 'event'"); 

fs.writeFileSync('components/InfoPanel.tsx', content);

console.log("Done");
