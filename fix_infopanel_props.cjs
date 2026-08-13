const fs = require('fs');
let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// Fix the Props interface
content = content.replace(/isLoading: boolean;\n  isNewsFetching: boolean;/g, "isCoreLoading?: boolean;\n  coreState: string;\n  secondaryState: string;\n  newsState: string;");

// Fix the signature
content = content.replace(/isLoading, \n  isNewsFetching, /g, "isCoreLoading = false,\n  coreState,\n  secondaryState,\n  newsState, ");

fs.writeFileSync('components/InfoPanel.tsx', content);
console.log("Done");
