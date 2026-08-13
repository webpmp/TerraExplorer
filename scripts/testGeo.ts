import { resolveGeographicEntity } from '../services/geographic/geographicResolver';
import { validateGeographicResolution } from '../services/geographic/geographicValidation';

async function test() {
    const res = await resolveGeographicEntity("Statue of Liberty");
    console.log("Result:", JSON.stringify(res, null, 2));
}

test();
