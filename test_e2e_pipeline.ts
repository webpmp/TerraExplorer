import { normalizeInfoPanelData } from './utils/mappers.js';

const resolvedData = {
    name: "Grand Canyon",
    type: "poi",
    entityType: "natural_feature",
    coordinates: { lat: 36.094481, lng: -112.064857 },
    description: "Information on Grand Canyon.",
    funFacts: [],
    notable: []
};

const metadataRecovery = {
    description: "The Grand Canyon is a steep-sided canyon carved by the Colorado River in Arizona...",
    climate: { name: "Semi-arid", description: "...", koppenCode: "BSk" },
    population: { current: { formattedValue: "N/A" }, historical: { formattedValue: "N/A", timeframe: "Unknown" } },
    contextNotes: ["Fact 1", "Fact 2", "Fact 3"],
    relatedEntities: []
};

const finalMetadata = {
    description: resolvedData.description,
    climate: (resolvedData as any).climate,
    population: (resolvedData as any).population,
    news: (resolvedData as any).news || [],
    contextNotes: (resolvedData as any).contextNotes || [],
    ...metadataRecovery
};

const entity = {
    id: "grand-canyon",
    pipelineVersion: 2,
    revision: 1,
    subject: {
        identity: { canonicalName: "Grand Canyon", entityType: "natural_feature" },
        primaryLocation: { label: "Grand Canyon", location: { coordinates: resolvedData.coordinates } }
    },
    metadata: finalMetadata
};

console.log("\nTesting mappers.ts normalization:");
const infoPanelProps = normalizeInfoPanelData(entity as any, undefined);

console.log(`InfoPanel Props generated:`);
console.log(`- description: ${typeof infoPanelProps.description}, has value: ${!!infoPanelProps.description}`);
console.log(`- climate: ${typeof infoPanelProps.climate}, has value: ${!!infoPanelProps.climate}`);
console.log(`- contextNotes: ${typeof infoPanelProps.contextNotes}, has value: ${!!infoPanelProps.contextNotes}`);
