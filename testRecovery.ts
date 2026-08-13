import { recoverLocationMetadata } from './src/services/geminiService';

async function test() {
    console.log("Starting test...");
    try {
        const metadata = await recoverLocationMetadata("Santorini", { lat: 36.3932, lng: 25.4615 });
        console.log("FINAL RESULT:", JSON.stringify(metadata, null, 2));
    } catch (e) {
        console.error("Test failed:", e);
    }
}
test();
