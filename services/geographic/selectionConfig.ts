export const selectionConfig = {
    maxPerCategory: {
        city: 4,
        town: 4,
        village: 4,
        hamlet: 2,
        municipality: 4,
        national_park: 2,
        state_park: 2,
        mountain: 2,
        water_body: 2,
        museum: 2,
        landmark: 3,
        geology: 2
    } as Record<string, number>,

    maxPerClass: {
        settlement: 4,
        POPULATED_PLACE: 4,
        major_landmark: 3,
        geographic_feature: 3,
        minor_poi: 0,
        generic: 2
    } as Record<string, number>,

    suppression: {
        preScore: [
            "address", "road_segment", "utility_pole", "parking_space",
            "driveway", "intersection", "culvert", "survey_point", "boundary_marker"
        ],
        postScore: [
            // Handled dynamically via logic (duplicate landmarks, clustered entities, category overflow)
        ]
    },
    
    spatialThresholdKm: 0.5,
    minConfidenceThreshold: 30,
    minImportanceThreshold: -50
};
