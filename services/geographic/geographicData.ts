import { LocationType, EntityType } from '../../types';

/**
 * Deterministic geographic resolution database for major cities, states, and landmarks.
 * Resolves exact coordinates and canonical names without relying on AI providers.
 *
 * This is the single source of truth for deterministic location data.
 * Both geographicResolver.ts and geminiService.ts import from here.
 * Do not duplicate this data elsewhere.
 */
export interface DeterministicLocationEntry {
  name: string;
  type: LocationType;
  entityType: EntityType;
  lat: number;
  lng: number;
  suggestedZoom?: number;
  population?: number;
  populationYear?: number;
  description?: string;
  climate?: {
    koppenCode: string;
    description: string;
  };
  context?: {
    country?: string;
    state?: string;
    city?: string;
    county?: string;
    region?: string;
  };
}

export const DETERMINISTIC_LOCATION_DB: Record<string, DeterministicLocationEntry> = {
  "plano, texas": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano, tx": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano tx": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano texas": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },
  "plano": { name: "Plano, Texas", type: LocationType.CITY, entityType: "city", lat: 33.0198, lng: -96.6989, suggestedZoom: 8 },

  "boston, massachusetts": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston, ma": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston ma": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },
  "boston": { name: "Boston, Massachusetts", type: LocationType.CITY, entityType: "city", lat: 42.3601, lng: -71.0589, suggestedZoom: 8 },

  "santa maria, california": { name: "Santa Maria, California", type: LocationType.CITY, entityType: "city", lat: 34.9530, lng: -120.4357, suggestedZoom: 8, description: "Santa Maria is a city in Santa Barbara County on the Central Coast of California, renowned for its wine industry and distinctive Santa Maria-style barbecue cuisine.", context: { country: "United States", state: "California", city: "Santa Maria" } },
  "santa maria, ca": { name: "Santa Maria, California", type: LocationType.CITY, entityType: "city", lat: 34.9530, lng: -120.4357, suggestedZoom: 8, description: "Santa Maria is a city in Santa Barbara County on the Central Coast of California, renowned for its wine industry and distinctive Santa Maria-style barbecue cuisine.", context: { country: "United States", state: "California", city: "Santa Maria" } },
  "santa maria, brazil": { name: "Santa Maria, Brazil", type: LocationType.CITY, entityType: "city", lat: -29.6842, lng: -53.8069, suggestedZoom: 8, description: "Santa Maria is a prominent university city in the central region of Rio Grande do Sul, southern Brazil, serving as an educational, medical, and agricultural hub.", context: { country: "Brazil", state: "Rio Grande do Sul", city: "Santa Maria" } },

  "amsterdam": { name: "Amsterdam, Netherlands", type: LocationType.CITY, entityType: "city", lat: 52.3676, lng: 4.9041, suggestedZoom: 8 },
  "amsterdam, netherlands": { name: "Amsterdam, Netherlands", type: LocationType.CITY, entityType: "city", lat: 52.3676, lng: 4.9041, suggestedZoom: 8 },

  "paris": { name: "Paris, France", type: LocationType.CITY, entityType: "city", lat: 48.8566, lng: 2.3522, suggestedZoom: 8 },
  "paris, france": { name: "Paris, France", type: LocationType.CITY, entityType: "city", lat: 48.8566, lng: 2.3522, suggestedZoom: 8 },

  "taj mahal": { name: "Taj Mahal", type: LocationType.POI, entityType: "landmark", lat: 27.1751, lng: 78.0421, suggestedZoom: 9 },
  "the taj mahal": { name: "Taj Mahal", type: LocationType.POI, entityType: "landmark", lat: 27.1751, lng: 78.0421, suggestedZoom: 9 },

  "mount fuji": { name: "Mount Fuji", type: LocationType.POI, entityType: "mountain", lat: 35.3606, lng: 138.7274, suggestedZoom: 8 },
  "titanic wreck site": { name: "Titanic Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 41.7325, lng: -49.9469, suggestedZoom: 7 },
  "titanic": { name: "Titanic Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 41.7325, lng: -49.9469, suggestedZoom: 7 },
  "the vasa": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "vasa": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "the vasa found": { name: "Vasa Shipwreck Discovery Site", type: LocationType.POI, entityType: "shipwreck", lat: 59.3275, lng: 18.0911, suggestedZoom: 9 },
  "hms terror": { name: "HMS Terror Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "Terror Bay, King William Island", state: "Nunavut", country: "Canada" } },
  "the hms terror": { name: "HMS Terror Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "Terror Bay, King William Island", state: "Nunavut", country: "Canada" } },
  "hms terror wreck site": { name: "HMS Terror Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "Terror Bay, King William Island", state: "Nunavut", country: "Canada" } },
  "hms terror found": { name: "HMS Terror Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "Terror Bay, King William Island", state: "Nunavut", country: "Canada" } },
  "the hms terror found": { name: "HMS Terror Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "Terror Bay, King William Island", state: "Nunavut", country: "Canada" } },
  "terror bay": { name: "Terror Bay", type: LocationType.POI, entityType: "natural_feature", lat: 68.8550, lng: -98.9350, suggestedZoom: 8, context: { region: "King William Island", state: "Nunavut", country: "Canada" } },
  "hms erebus": { name: "HMS Erebus Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.2500, lng: -98.8700, suggestedZoom: 8, context: { region: "Wilmot and Crampton Bay", state: "Nunavut", country: "Canada" } },
  "the hms erebus": { name: "HMS Erebus Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.2500, lng: -98.8700, suggestedZoom: 8, context: { region: "Wilmot and Crampton Bay", state: "Nunavut", country: "Canada" } },
  "hms erebus wreck site": { name: "HMS Erebus Wreck Site", type: LocationType.POI, entityType: "shipwreck", lat: 68.2500, lng: -98.8700, suggestedZoom: 8, context: { region: "Wilmot and Crampton Bay", state: "Nunavut", country: "Canada" } },
  "dead sea scrolls": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "dead sea scrolls discovery site": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "the dead sea scrolls": { name: "Qumran Caves", type: LocationType.POI, entityType: "archaeological_site", lat: 31.7412, lng: 35.4600, suggestedZoom: 8 },
  "rosetta stone": { name: "Fort Julien", type: LocationType.POI, entityType: "archaeological_site", lat: 31.3996, lng: 30.4170, suggestedZoom: 8 },
  "the rosetta stone": { name: "Fort Julien", type: LocationType.POI, entityType: "archaeological_site", lat: 31.3996, lng: 30.4170, suggestedZoom: 8 },
  "woodstock": { name: "Bethel, New York (Woodstock Site)", type: LocationType.POI, entityType: "historical_event", lat: 41.7001, lng: -74.7871, suggestedZoom: 8 },
  "eruption of vesuvius": { name: "Mount Vesuvius", type: LocationType.POI, entityType: "historical_event", lat: 40.8218, lng: 14.4264, suggestedZoom: 8 },
  "boston massacre": { name: "Boston Massacre Site", type: LocationType.POI, entityType: "historical_event", lat: 42.3588, lng: -71.0578, suggestedZoom: 9 },

  // Phase 1 Expansion: Ancient Cities
  "rome": { name: "Rome, Italy", type: LocationType.CITY, entityType: "city", lat: 41.9028, lng: 12.4964, suggestedZoom: 8, population: 2872800, climate: { koppenCode: "Csa", description: "Hot-summer Mediterranean climate" } },
  "athens": { name: "Athens, Greece", type: LocationType.CITY, entityType: "city", lat: 37.9838, lng: 23.7275, suggestedZoom: 8, population: 3153000, climate: { koppenCode: "Csa", description: "Hot-summer Mediterranean climate" } },
  "sparta": { name: "Sparta, Greece", type: LocationType.CITY, entityType: "city", lat: 37.0722, lng: 22.4286, suggestedZoom: 9 },
  "carthage": { name: "Carthage, Tunisia", type: LocationType.CITY, entityType: "archaeological_site", lat: 36.8528, lng: 10.3233, suggestedZoom: 9 },
  "alexandria": { name: "Alexandria, Egypt", type: LocationType.CITY, entityType: "city", lat: 31.2001, lng: 29.9187, suggestedZoom: 8, population: 5200000, climate: { koppenCode: "BWh", description: "Hot desert climate" } },
  "babylon": { name: "Babylon, Iraq", type: LocationType.CITY, entityType: "archaeological_site", lat: 32.5422, lng: 44.4210, suggestedZoom: 9 },
  "pompeii": { name: "Pompeii, Italy", type: LocationType.CITY, entityType: "archaeological_site", lat: 40.7461, lng: 14.4989, suggestedZoom: 9 },
  
  "tokyo": { name: "Tokyo, Japan", type: LocationType.CITY, entityType: "city", lat: 35.6762, lng: 139.6503, suggestedZoom: 8, population: 13929286, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" } },
  "london": { name: "London, UK", type: LocationType.CITY, entityType: "city", lat: 51.5072, lng: -0.1276, suggestedZoom: 8, population: 8982000, climate: { koppenCode: "Cfb", description: "Oceanic climate" } },

  // Major Australian Cities
  "sydney, australia": { name: "Sydney, Australia", type: LocationType.CITY, entityType: "city", lat: -33.8688, lng: 151.2093, suggestedZoom: 8, population: 5312163, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" } },
  "melbourne": { name: "Melbourne, Australia", type: LocationType.CITY, entityType: "city", lat: -37.8136, lng: 144.9631, suggestedZoom: 8, population: 5078193, climate: { koppenCode: "Cfb", description: "Oceanic climate" } },
  "melbourne, australia": { name: "Melbourne, Australia", type: LocationType.CITY, entityType: "city", lat: -37.8136, lng: 144.9631, suggestedZoom: 8, population: 5078193, climate: { koppenCode: "Cfb", description: "Oceanic climate" } },
  "brisbane": { name: "Brisbane, Australia", type: LocationType.CITY, entityType: "city", lat: -27.4698, lng: 153.0251, suggestedZoom: 8, population: 2560700, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" } },
  "brisbane, australia": { name: "Brisbane, Australia", type: LocationType.CITY, entityType: "city", lat: -27.4698, lng: 153.0251, suggestedZoom: 8, population: 2560700, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" } },
  "perth": { name: "Perth, Australia", type: LocationType.CITY, entityType: "city", lat: -31.9505, lng: 115.8605, suggestedZoom: 8, population: 2141834, climate: { koppenCode: "Csa", description: "Mediterranean climate" } },
  "perth, australia": { name: "Perth, Australia", type: LocationType.CITY, entityType: "city", lat: -31.9505, lng: 115.8605, suggestedZoom: 8, population: 2141834, climate: { koppenCode: "Csa", description: "Mediterranean climate" } },
  "adelaide": { name: "Adelaide, Australia", type: LocationType.CITY, entityType: "city", lat: -34.9285, lng: 138.6007, suggestedZoom: 8, population: 1387290, climate: { koppenCode: "Csa", description: "Mediterranean climate" } },
  "adelaide, australia": { name: "Adelaide, Australia", type: LocationType.CITY, entityType: "city", lat: -34.9285, lng: 138.6007, suggestedZoom: 8, population: 1387290, climate: { koppenCode: "Csa", description: "Mediterranean climate" } },

  // Landmarks
  "stonehenge": { name: "Stonehenge", type: LocationType.POI, entityType: "archaeological_site", lat: 51.1789, lng: -1.8262, suggestedZoom: 10 },
  "machu picchu": { name: "Machu Picchu", type: LocationType.POI, entityType: "archaeological_site", lat: -13.1631, lng: -72.5450, suggestedZoom: 10 },
  "chichen itza": { name: "Chichen Itza", type: LocationType.POI, entityType: "archaeological_site", lat: 20.6843, lng: -88.5678, suggestedZoom: 10 },
  "great wall of china": { name: "Great Wall of China (Mutianyu)", type: LocationType.POI, entityType: "landmark", lat: 40.4319, lng: 116.5704, suggestedZoom: 9 },

  // Oceans and Seas
  "pacific ocean": { name: "Pacific Ocean", type: LocationType.OCEAN, entityType: "ocean", lat: -8.7832, lng: -124.5085, suggestedZoom: 2 },
  "atlantic ocean": { name: "Atlantic Ocean", type: LocationType.OCEAN, entityType: "ocean", lat: 14.5994, lng: -28.6731, suggestedZoom: 2 },
  "indian ocean": { name: "Indian Ocean", type: LocationType.OCEAN, entityType: "ocean", lat: -33.8688, lng: 72.9806, suggestedZoom: 2 },
  "mediterranean sea": { name: "Mediterranean Sea", type: LocationType.OCEAN, entityType: "natural_feature", lat: 35.0, lng: 18.0, suggestedZoom: 4 },

  // Mountains
  "himalayas": { name: "Himalayas", type: LocationType.POI, entityType: "mountain", lat: 27.9860, lng: 86.9226, suggestedZoom: 5 },
  "alps": { name: "The Alps", type: LocationType.POI, entityType: "mountain", lat: 46.8182, lng: 8.2275, suggestedZoom: 5 },
  "andes": { name: "The Andes", type: LocationType.POI, entityType: "mountain", lat: -32.6531, lng: -70.0112, suggestedZoom: 4 },

  // Battle locations
  "waterloo": { name: "Waterloo Battlefield", type: LocationType.POI, entityType: "battle", lat: 50.6800, lng: 4.4116, suggestedZoom: 9 },
  "gettysburg": { name: "Gettysburg Battlefield", type: LocationType.POI, entityType: "battle", lat: 39.8130, lng: -77.2361, suggestedZoom: 9 },
  "normandy": { name: "Normandy Beaches", type: LocationType.POI, entityType: "historical_event", lat: 49.3333, lng: -0.8333, suggestedZoom: 7 },

  // Canonical Major Cities & Landmarks
  "vancouver": { name: "Vancouver, Canada", type: LocationType.CITY, entityType: "city", lat: 49.2608724, lng: -123.113952, suggestedZoom: 8, population: 675218, context: { city: "Vancouver", state: "British Columbia", country: "Canada" } },
  "vancouver, canada": { name: "Vancouver, Canada", type: LocationType.CITY, entityType: "city", lat: 49.2608724, lng: -123.113952, suggestedZoom: 8, population: 675218, context: { city: "Vancouver", state: "British Columbia", country: "Canada" } },
  "austin": { name: "Austin, Texas", type: LocationType.CITY, entityType: "city", lat: 30.2672, lng: -97.7431, suggestedZoom: 8, population: 974447, context: { city: "Austin", state: "Texas", country: "United States" } },
  "austin, texas": { name: "Austin, Texas", type: LocationType.CITY, entityType: "city", lat: 30.2672, lng: -97.7431, suggestedZoom: 8, population: 974447, context: { city: "Austin", state: "Texas", country: "United States" } },
  "gainesville": { name: "Gainesville, Florida", type: LocationType.CITY, entityType: "city", lat: 29.6516, lng: -82.3248, suggestedZoom: 8, population: 141085, populationYear: 2020, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" }, context: { city: "Gainesville", state: "Florida", country: "United States", county: "Alachua County" } },
  "gainesville, florida": { name: "Gainesville, Florida", type: LocationType.CITY, entityType: "city", lat: 29.6516, lng: -82.3248, suggestedZoom: 8, population: 141085, populationYear: 2020, climate: { koppenCode: "Cfa", description: "Humid subtropical climate" }, context: { city: "Gainesville", state: "Florida", country: "United States", county: "Alachua County" } },
  "dallas": { name: "Dallas, Texas", type: LocationType.CITY, entityType: "city", lat: 32.7767, lng: -96.7970, suggestedZoom: 8, population: 1304379, context: { city: "Dallas", state: "Texas", country: "United States" } },
  "dallas, texas": { name: "Dallas, Texas", type: LocationType.CITY, entityType: "city", lat: 32.7767, lng: -96.7970, suggestedZoom: 8, population: 1304379, context: { city: "Dallas", state: "Texas", country: "United States" } },
  "houston": { name: "Houston, Texas", type: LocationType.CITY, entityType: "city", lat: 29.7604, lng: -95.3698, suggestedZoom: 8, population: 2304580, context: { city: "Houston", state: "Texas", country: "United States" } },
  "houston, texas": { name: "Houston, Texas", type: LocationType.CITY, entityType: "city", lat: 29.7604, lng: -95.3698, suggestedZoom: 8, population: 2304580, context: { city: "Houston", state: "Texas", country: "United States" } },
  "san antonio": { name: "San Antonio, Texas", type: LocationType.CITY, entityType: "city", lat: 29.4241, lng: -98.4936, suggestedZoom: 8, population: 1472909, context: { city: "San Antonio", state: "Texas", country: "United States" } },
  "san antonio, texas": { name: "San Antonio, Texas", type: LocationType.CITY, entityType: "city", lat: 29.4241, lng: -98.4936, suggestedZoom: 8, population: 1472909, context: { city: "San Antonio", state: "Texas", country: "United States" } },
  "honolulu": { name: "Honolulu, Hawaii", type: LocationType.CITY, entityType: "city", lat: 21.3069, lng: -157.8583, suggestedZoom: 8, population: 350964, context: { city: "Honolulu", state: "Hawaii", country: "United States" } },
  "honolulu, hawaii": { name: "Honolulu, Hawaii", type: LocationType.CITY, entityType: "city", lat: 21.3069, lng: -157.8583, suggestedZoom: 8, population: 350964, context: { city: "Honolulu", state: "Hawaii", country: "United States" } },
  "hilo": { name: "Hilo, Hawaii", type: LocationType.CITY, entityType: "city", lat: 19.7297, lng: -155.0900, suggestedZoom: 8, population: 44186, context: { city: "Hilo", state: "Hawaii", country: "United States" } },
  "hilo, hawaii": { name: "Hilo, Hawaii", type: LocationType.CITY, entityType: "city", lat: 19.7297, lng: -155.0900, suggestedZoom: 8, population: 44186, context: { city: "Hilo", state: "Hawaii", country: "United States" } },
  "seattle": { name: "Seattle, Washington", type: LocationType.CITY, entityType: "city", lat: 47.6062, lng: -122.3321, suggestedZoom: 8, population: 749256, context: { city: "Seattle", state: "Washington", country: "United States" } },
  "seattle, washington": { name: "Seattle, Washington", type: LocationType.CITY, entityType: "city", lat: 47.6062, lng: -122.3321, suggestedZoom: 8, population: 749256, context: { city: "Seattle", state: "Washington", country: "United States" } },
  "portland": { name: "Portland, Oregon", type: LocationType.CITY, entityType: "city", lat: 45.5152, lng: -122.6784, suggestedZoom: 8, population: 652503, context: { city: "Portland", state: "Oregon", country: "United States" } },
  "san francisco": { name: "San Francisco, California", type: LocationType.CITY, entityType: "city", lat: 37.7749, lng: -122.4194, suggestedZoom: 8, population: 873965, context: { city: "San Francisco", state: "California", country: "United States" } },
  "chicago": { name: "Chicago, Illinois", type: LocationType.CITY, entityType: "city", lat: 41.8781, lng: -87.6298, suggestedZoom: 8, population: 2746388, context: { city: "Chicago", state: "Illinois", country: "United States" } },
  "new york": { name: "New York, New York", type: LocationType.CITY, entityType: "city", lat: 40.7128, lng: -74.0060, suggestedZoom: 8, population: 8804190, context: { city: "New York", state: "New York", country: "United States" } },
  "los angeles": { name: "Los Angeles, California", type: LocationType.CITY, entityType: "city", lat: 34.0522, lng: -118.2437, suggestedZoom: 8, population: 3898747, context: { city: "Los Angeles", state: "California", country: "United States" } },
  "sydney": { name: "Sydney, Australia", type: LocationType.CITY, entityType: "city", lat: -33.8688, lng: 151.2093, suggestedZoom: 8, population: 5312000, context: { city: "Sydney", state: "New South Wales", country: "Australia" } },
  "grand canyon": { name: "Grand Canyon National Park", type: LocationType.POI, entityType: "canyon", lat: 36.0565, lng: -112.1250, suggestedZoom: 8, context: { state: "Arizona", country: "United States" } },
  "the grand canyon": { name: "Grand Canyon National Park", type: LocationType.POI, entityType: "canyon", lat: 36.0565, lng: -112.1250, suggestedZoom: 8, context: { state: "Arizona", country: "United States" } },
  "grand canyon national park": { name: "Grand Canyon National Park", type: LocationType.POI, entityType: "national_park", lat: 36.0565, lng: -112.1250, suggestedZoom: 8, context: { state: "Arizona", country: "United States" } },
  "mount rainier": { name: "Mount Rainier National Park", type: LocationType.POI, entityType: "national_park", lat: 46.8523, lng: -121.7603, suggestedZoom: 8 },
  "lake tahoe": { name: "Lake Tahoe", type: LocationType.POI, entityType: "natural_feature", lat: 39.0968, lng: -120.0324, suggestedZoom: 8 },
  "matterhorn": { name: "Matterhorn", type: LocationType.POI, entityType: "mountain", lat: 45.9765, lng: 7.6586, suggestedZoom: 8, context: { country: "Switzerland / Italy", state: "Valais / Aosta Valley", region: "Pennine Alps" } },
  "the matterhorn": { name: "Matterhorn", type: LocationType.POI, entityType: "mountain", lat: 45.9765, lng: 7.6586, suggestedZoom: 8, context: { country: "Switzerland / Italy", state: "Valais / Aosta Valley", region: "Pennine Alps" } },
  "pennine alps": { name: "Pennine Alps", type: LocationType.POI, entityType: "mountain_range", lat: 45.95, lng: 7.75, suggestedZoom: 7, context: { country: "Switzerland / Italy", region: "Pennine Alps" } },
  "the pennine alps": { name: "Pennine Alps", type: LocationType.POI, entityType: "mountain_range", lat: 45.95, lng: 7.75, suggestedZoom: 7, context: { country: "Switzerland / Italy", region: "Pennine Alps" } },
  "dead sea": { name: "Dead Sea", type: LocationType.POI, entityType: "lake", lat: 31.5590, lng: 35.4732, suggestedZoom: 8, context: { country: "Israel / Jordan" } },
  "the dead sea": { name: "Dead Sea", type: LocationType.POI, entityType: "lake", lat: 31.5590, lng: 35.4732, suggestedZoom: 8, context: { country: "Israel / Jordan" } },
  "golden gate bridge": { name: "Golden Gate Bridge", type: LocationType.POI, entityType: "infrastructure", lat: 37.8199, lng: -122.4783, suggestedZoom: 12, context: { city: "San Francisco", state: "California", country: "United States" } },
  "the golden gate bridge": { name: "Golden Gate Bridge", type: LocationType.POI, entityType: "infrastructure", lat: 37.8199, lng: -122.4783, suggestedZoom: 12, context: { city: "San Francisco", state: "California", country: "United States" } },
  "statue of liberty": { name: "Statue of Liberty", type: LocationType.POI, entityType: "landmark", lat: 40.6892, lng: -74.0445, suggestedZoom: 12, context: { city: "New York", state: "New York", country: "United States" } },
  "the statue of liberty": { name: "Statue of Liberty", type: LocationType.POI, entityType: "landmark", lat: 40.6892, lng: -74.0445, suggestedZoom: 12, context: { city: "New York", state: "New York", country: "United States" } },
  "sydney opera house": { name: "Sydney Opera House", type: LocationType.POI, entityType: "landmark", lat: -33.8568, lng: 151.2153, suggestedZoom: 12, context: { city: "Sydney", state: "New South Wales", country: "Australia" } },
  "the sydney opera house": { name: "Sydney Opera House", type: LocationType.POI, entityType: "landmark", lat: -33.8568, lng: 151.2153, suggestedZoom: 12, context: { city: "Sydney", state: "New South Wales", country: "Australia" } },
  "cliffs of moher": { name: "Cliffs of Moher", type: LocationType.POI, entityType: "natural_landmark", lat: 52.9715, lng: -9.4265, suggestedZoom: 10, context: { country: "Ireland", state: "County Clare" } },
  "the cliffs of moher": { name: "Cliffs of Moher", type: LocationType.POI, entityType: "natural_landmark", lat: 52.9715, lng: -9.4265, suggestedZoom: 10, context: { country: "Ireland", state: "County Clare" } },
  
  // Indonesian Regional Centers & Major Cities
  "pekanbaru": { name: "Pekanbaru, Indonesia", type: LocationType.CITY, entityType: "city", lat: 0.5071, lng: 101.4478, suggestedZoom: 8, population: 983356, context: { city: "Pekanbaru", state: "Riau", country: "Indonesia" } },
  "pekanbaru, riau": { name: "Pekanbaru, Indonesia", type: LocationType.CITY, entityType: "city", lat: 0.5071, lng: 101.4478, suggestedZoom: 8, population: 983356, context: { city: "Pekanbaru", state: "Riau", country: "Indonesia" } },
  "dumai": { name: "Dumai, Indonesia", type: LocationType.CITY, entityType: "city", lat: 1.6667, lng: 101.4500, suggestedZoom: 8, population: 316782, context: { city: "Dumai", state: "Riau", country: "Indonesia" } },
  "siak sri indrapura": { name: "Siak Sri Indrapura, Indonesia", type: LocationType.CITY, entityType: "city", lat: 0.7972, lng: 102.0494, suggestedZoom: 8, population: 53800, context: { city: "Siak Sri Indrapura", state: "Riau", country: "Indonesia" } },
  "jakarta": { name: "Jakarta, Indonesia", type: LocationType.CITY, entityType: "city", lat: -6.2088, lng: 106.8456, suggestedZoom: 8, population: 10562088, context: { city: "Jakarta", country: "Indonesia" } },
  "medan": { name: "Medan, Indonesia", type: LocationType.CITY, entityType: "city", lat: 3.5952, lng: 98.6722, suggestedZoom: 8, population: 2435252, context: { city: "Medan", state: "North Sumatra", country: "Indonesia" } }
};
