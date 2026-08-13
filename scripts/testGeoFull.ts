import { resolveGeographicEntity } from '../services/geographic/geographicResolver';

async function test() {
    const res = await resolveGeographicEntity("Where is the Statue of Liberty?");
    console.log("Result:", JSON.stringify(res, null, 2));
}

test();
