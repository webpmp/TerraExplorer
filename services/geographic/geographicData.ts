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
  climate?: {
    koppenCode: string;
    description: string;
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
  "normandy": { name: "Normandy Beaches", type: LocationType.POI, entityType: "historical_event", lat: 49.3333, lng: -0.8333, suggestedZoom: 7 }
};
