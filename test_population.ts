import { isPopulationBearingEntity } from './services/geographic/geographicResolver';

console.log("Tokyo eligible?", isPopulationBearingEntity('major_city', 'Tokyo'));
