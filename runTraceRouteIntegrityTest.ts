import { runRoutePipeline } from './services/routePipeline';

const mockGenerateRawRoute = async (text: string, isUrl: boolean) => {
    return {
        title: "The Silk Road",
        routeType: "network",
        routeConfidence: {
            level: "medium",
            reasoning: "The Silk Road existed as a network of routes. This sequence represents one historically plausible east-to-west traversal rather than a single fixed path."
        },
        waypoints: [
            { id: 'wp-1', name: "Xi'an", role: 'primary', parentId: undefined, lat: 34, lng: 108, sequence: 1, alternateNames: ["", " ", "Ancient Chang'an", "Ancient Chang'an"], historicalConfidence: { level: "high", reasoning: "Capital" } },
            { id: 'wp-2', name: 'Karakoram Pass', role: 'related', parentId: 'wp-1', lat: 35, lng: 77, sequence: 2, alternateNames: [] },
            { id: 'wp-3', name: 'Balkh', role: 'primary', parentId: undefined, lat: 36, lng: 66, sequence: 3, alternateNames: ["Bactra"] },
            { id: 'wp-4', name: 'Rome', role: 'primary', parentId: undefined, lat: 41.9, lng: 12.4, sequence: 4, alternateNames: ["Roma"] }
        ]
    };
};

const main = async () => {
    console.log("Starting Trace Route Integrity Test...");
    let mutations = 0;
    let sequenceFailures = 0;
    let metadataViolations = 0;
    let placeholders = 0;

    try {
        const route = await runRoutePipeline('Follow the Silk Road from China to Europe', false, mockGenerateRawRoute, 'route');
        
        const waypoints = route.waypoints;

        let passed = true;

        if (!route.title) {
            console.error("Assertion failed: route.title is missing");
            passed = false;
        }

        if (!route.routeConfidence) {
            console.error("Assertion failed: route.routeConfidence is missing");
            passed = false;
        }

        if (waypoints.length < 4) {
            console.error(`Assertion failed: waypoints.length >= 4. Got ${waypoints.length}`);
            passed = false;
        }

        const expectedNames = ["Xi'an", "Karakoram Pass", "Balkh", "Rome"];
        const sequenceSet = new Set<number>();
        
        for (let i = 0; i < waypoints.length; i++) {
            const wp = waypoints[i];
            
            // Sequence Validation
            if (!wp.sequence || wp.sequence === 0) {
                sequenceFailures++;
                passed = false;
            }
            if (sequenceSet.has(wp.sequence!)) {
                sequenceFailures++;
                passed = false;
            }
            sequenceSet.add(wp.sequence!);
            
            if (wp.sequence !== i + 1) {
                sequenceFailures++;
                passed = false;
            }
            
            // Identity Validation
            if (wp.name !== expectedNames[i]) {
                mutations++;
                passed = false;
            }
            
            if (wp.name === "Samarkand" || wp.name === "Pompeii" || wp.name.includes("UNKNOWN") || wp.name.includes("NEEDS_LLM")) {
                placeholders++;
                passed = false;
            }
            
            // Alternate Names
            if (wp.alternateNames) {
                const invalidAlts = wp.alternateNames.filter(n => n.trim().length === 0);
                if (invalidAlts.length > 0) {
                    metadataViolations++;
                    passed = false;
                }
            }
            
            // Confidence Validation
            if ((wp as any).routeConfidence !== undefined) {
                metadataViolations++;
                passed = false;
            }
            if (i === 0 && !wp.historicalConfidence) {
                metadataViolations++;
                passed = false;
            }
        }

        if (passed) {
            console.log("\nTRACE ROUTE INTEGRITY TEST PASSED\n");
            console.log("===== PIPELINE SUMMARY =====");
            console.log(`Generated: ${waypoints.length}+`);
            console.log(`Validated: ${waypoints.length}`);
            console.log(`Identity mutations: ${mutations}`);
            console.log(`Sequence failures: ${sequenceFailures}`);
            console.log(`Metadata violations: ${metadataViolations}`);
            console.log(`Placeholder removals: ${placeholders}`);
            console.log("============================");
        } else {
            console.error("\nTRACE ROUTE INTEGRITY TEST FAILED\n");
            console.log("===== PIPELINE SUMMARY =====");
            console.log(`Generated: ${waypoints.length}+`);
            console.log(`Validated: ${waypoints.length}`);
            console.log(`Identity mutations: ${mutations}`);
            console.log(`Sequence failures: ${sequenceFailures}`);
            console.log(`Metadata violations: ${metadataViolations}`);
            console.log(`Placeholder removals: ${placeholders}`);
            console.log("============================");
        }

    } catch (e) {
        console.error("Test failed with exception:", e);
    }
};

main();
