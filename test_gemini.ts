import { recoverLocationMetadata } from './services/geminiService.js';

async function main() {
    const result = await recoverLocationMetadata("Grand Canyon", { lat: 36, lng: -112 });
    console.log(JSON.stringify(result, null, 2));
}
main().catch(console.error);
