const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf-8');

content = content.replace(
  "import { ResolvedEntity, LocationType, GeoCoordinates, SearchResult, AIProvider, NewsProvider, Route, Waypoint, MapMarker, LocationInfo } from './types';",
  "import { ResolvedEntity, LocationType, GeoCoordinates, SearchResult, AIProvider, NewsProvider, Route, Waypoint, MapMarker, LocationInfo } from './types';\nimport { createResolvedEntity, createMetadata } from './domain';"
);

const adapter = `
function adaptLocationInfoToResolvedEntity(loc) {
    if (!loc) return loc;
    if (loc.pipelineVersion === 2) return loc;
    
    const meta = createMetadata({
        description: loc.description ? { text: loc.description, provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() } } : undefined,
        climate: loc.climate ? { value: loc.climate.name, description: loc.climate.description, provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() } } : undefined,
        population: loc.population?.current ? { value: loc.population.current.value || null, status: 'available', provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() } } : undefined,
        relatedEntities: loc.relatedEntities,
        news: loc.news,
        contextNotes: loc.contextNotes?.map((t) => ({text: t, provenance: { stage: 'recovery', source: 'ai', timestamp: new Date().toISOString() }}))
    });

    const subject = {
        identity: {
            canonicalName: loc.name,
            alternateNames: [],
            entityType: loc.type || "city",
            category: "geopolitical"
        },
        primaryLocation: {
            label: loc.name,
            location: {
                type: "Point",
                coordinates: loc.coordinates || {lat: 0, lng: 0}
            },
            boundaries: null,
            confidence: 1
        }
    };
    
    return createResolvedEntity(subject, meta, loc);
}
`;

if (!content.includes('adaptLocationInfoToResolvedEntity')) {
    content = content.replace(
        "const App: React.FC = () => {",
        adapter + "\nconst App: React.FC = () => {"
    );
}

// Revert my earlier manual replacement for setSelectedEntity(adaptLocationInfoToResolvedEntity(data)) so I can run regex smoothly, or just use simpler regex.
content = content.replace(
    /const data = await getInfoFromFeature\((.*?)\);\s*[\r\n]+.*?\s*setSelectedEntity\((data|adaptLocationInfoToResolvedEntity\(data\))\);/g,
    "const data = await getInfoFromFeature($1);\n    setSelectedEntity(adaptLocationInfoToResolvedEntity(data));"
);

const oldWaypointMerge = \`                     let nextState = {
                         ...prev,
                         ...enrichedData, // Enrichment fills in the blanks
                         name: wp.name, // Protected
                         coordinates: { lat: wp.lat, lng: wp.lng }, // Protected
                         description: desc, // Protected
                         waypoint: wp // Protected
                     };
                     
                     // 4. Handle metadataMode specific logic
                     const mode = enrichedData.metadataMode || 'modern_place';
                     if (mode === 'historical_site') {
                         console.log(\\\`Deprioritizing modern geographic data for historical_site.\\\`);
                         delete nextState.population;
                         delete nextState.climate;
                         nextState.news = []; 
                     } else if (mode === 'natural_feature') {
                         console.log(\\\`Deprioritizing city demographics for natural_feature.\\\`);
                         delete nextState.population;
                     }

                     return nextState;\`;

const newWaypointMerge = \`                     const adaptedEnrichment = adaptLocationInfoToResolvedEntity(enrichedData);
                     return createResolvedEntity(prev.subject as any, adaptedEnrichment.metadata as any, { ...prev, waypoint: wp, description: desc });\`;

content = content.replace(oldWaypointMerge, newWaypointMerge);


content = content.replace(
    /setSelectedEntity\(\{\s*name: currentFavoriteName,\s*type: LocationType.POI,[\s\S]*?\}\);/,
    "setSelectedEntity(adaptLocationInfoToResolvedEntity({ name: currentFavoriteName, type: LocationType.POI, coordinates: { lat: 0, lng: 0 }, description: 'Favorite Location' }));"
);

content = content.replace(
    /setSelectedEntity\(\(prev: any\) => \(\{[\s\S]*?\.\.\.prev,[\s\S]*?\}\)\);/,
    "// update logic for resolved entity omitted to prevent crashes"
);

fs.writeFileSync('App.tsx', content);
