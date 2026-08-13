import { runSearchPipeline, SearchRequest } from '../services/pipeline';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
    const request: SearchRequest = {
        rawQuery: "Where is the Statue of Liberty?"
    };

    try {
        console.log("Running pipeline for:", request.rawQuery);
        const result = await runSearchPipeline(request);
        console.log("Result:", result);
    } catch (e) {
        console.error("Pipeline failed:", e);
    }
}

runTest();
