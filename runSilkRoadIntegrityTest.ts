import { runRoutePipeline } from './services/routePipeline';

const mockGenerateRawRoute = async (text: string, isUrl: boolean) => {
    return {
        title: "The Silk Road",
        routeConfidence: {
            level: "medium",
            reasoning: "The Silk Road existed as a network of routes. This sequence represents one historically plausible east-to-west traversal rather than a single fixed path."
        },
        waypoints: [
            { id: 'wp-1', name: "Xi'an", role: 'primary', parentId: undefined, lat: 34, lng: 108, sequence: 1, alternateNames: ["", " ", "Ancient Chang'an", "Ancient Chang'an"] },
            { id: 'wp-2', name: 'Karakoram Pass', role: 'related', parentId: 'wp-1', lat: 35, lng: 77, sequence: 2, alternateNames: [] },
            { id: 'wp-3', name: 'Balkh', role: 'primary', parentId: undefined, lat: 36, lng: 66, sequence: 3, alternateNames: ["Bactra"] },
            { id: 'wp-4', name: 'Rome', role: 'primary', parentId: undefined, lat: 41.9, lng: 12.4, sequence: 4, alternateNames: ["Roma"] }
        ]
    };
};

const main = async () => {
    console.log("Starting Silk Road Integrity Test...");
    try {
        const route = await runRoutePipeline('Follow the Silk Road from China to Europe', false, mockGenerateRawRoute, 'route');
        
        const waypoints = route.waypoints;

        let passed = true;

        if (waypoints.length < 4) {
            console.error(`Assertion failed: waypoints.length >= 4. Got ${waypoints.length}`);
            passed = false;
        }

        const expectedNames = ["Xi'an", "Karakoram Pass", "Balkh", "Rome"];
        for (let i = 0; i < waypoints.length; i++) {
            if (waypoints[i].sequence !== i + 1) {
                console.error(`Assertion failed: sequence should be ${i + 1}. Got ${waypoints[i].sequence}`);
                passed = false;
            }
            if (waypoints[i].name !== expectedNames[i]) {
                console.error(`Assertion failed: expected name ${expectedNames[i]}. Got ${waypoints[i].name}`);
                passed = false;
            }
            
            // Check alternateNames
            if (waypoints[i].alternateNames) {
                for (const alt of waypoints[i].alternateNames!) {
                    if (alt === "" || alt.trim() === "") {
                        console.error(`Assertion failed: alternateNames contains empty string in ${waypoints[i].name}`);
                        passed = false;
                    }
                }
            }
            
            if ((waypoints[i] as any).routeConfidence !== undefined) {
                console.error(`Assertion failed: routeConfidence found on waypoint ${waypoints[i].name}`);
                passed = false;
            }
        }

        if (!route.routeConfidence) {
            console.error(`Assertion failed: routeConfidence is missing from route envelope`);
            passed = false;
        }

        if (passed) {
            console.log("\nSILK ROAD INTEGRITY TEST PASSED\n");
        } else {
            console.error("\nSILK ROAD INTEGRITY TEST FAILED\n");
        }

    } catch (e) {
        console.error("Test failed with exception:", e);
    }
};

main();
