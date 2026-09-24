import { GeoCoordinates, isValidCoordinates, CoordinateSource } from '../../types';
import { reverseGeocode } from './geographicResolver';
import { stripDiacritics, areEntitiesMatchingWithDiacritics } from './geographicNormalization';

export interface HistoricalValidationContext {
  rawQuery?: string;
  intent?: string;
  entityType?: string;
  candidateEntityType?: string;
  coordinateSource?: CoordinateSource;
  expectedRegion?: string;
  locationDescription?: string;
}

export interface HistoricalCoordinateValidationResult {
  valid: boolean;
  reason: string;
  expectedRegion?: string;
  reverseGeocodeSummary?: string;
  isApproximate?: boolean;
}

import { HistoricalGeographicScope } from '../../domain';

export interface HistoricalEntityKnowledge {
  entity: string;
  entityType: string;
  expectedRegion: string;
  geographicScope?: HistoricalGeographicScope;
  singleLocation?: boolean;
  significance?: string;
  notable?: string[];
  contextNotes?: string;
  approximateRegion?: string;
  country?: string;
  state?: string;
  nearbyCity?: string;
  region?: string;
  marineRegion?: string;
  historicalContext?: string;
  sourceRationale?: string;
  confidence?: 'high' | 'medium' | 'low';
  allowedCountries: string[];
  forbiddenRegions?: string[];
  exactLocationConfirmed: boolean;
  exactLocationKnown?: boolean;
  confirmedWreckLocation?: boolean;
  approximateCoordinates?: GeoCoordinates;
  boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export const HISTORICAL_KNOWLEDGE_BASE: Record<string, HistoricalEntityKnowledge> = {
  "santa maria": {
    entity: "Santa Maria",
    entityType: "shipwreck",
    expectedRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    approximateRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    country: "Haiti",
    historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.",
    sourceRationale: "Historical logs of Christopher Columbus indicate grounding on the northern coast of Hispaniola, but the exact physical shipwreck site remains unconfirmed and disputed.",
    confidence: "low",
    allowedCountries: ["Haiti", "Dominican Republic"],
    forbiddenRegions: ["New York", "Westchester County", "United States", "Peru", "Spain", "Brazil", "Rhode Island"],
    exactLocationConfirmed: false,
    exactLocationKnown: false,
    confirmedWreckLocation: false,
    approximateCoordinates: {
      lat: 19.7600,
      lng: -72.2000,
      source: "historical_approximate",
      confidence: "low"
    },
    boundingBox: { minLat: 18.0, maxLat: 21.0, minLng: -74.5, maxLng: -71.0 }
  },
  "the santa maria": {
    entity: "Santa Maria",
    entityType: "shipwreck",
    expectedRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    approximateRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    country: "Haiti",
    historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.",
    sourceRationale: "Historical logs of Christopher Columbus indicate grounding on the northern coast of Hispaniola, but the exact physical shipwreck site remains unconfirmed and disputed.",
    confidence: "low",
    allowedCountries: ["Haiti", "Dominican Republic"],
    forbiddenRegions: ["New York", "Westchester County", "United States", "Peru", "Spain", "Brazil", "Rhode Island"],
    exactLocationConfirmed: false,
    exactLocationKnown: false,
    confirmedWreckLocation: false,
    approximateCoordinates: {
      lat: 19.7600,
      lng: -72.2000,
      source: "historical_approximate",
      confidence: "low"
    },
    boundingBox: { minLat: 18.0, maxLat: 21.0, minLng: -74.5, maxLng: -71.0 }
  },
  "santa maria shipwreck": {
    entity: "Santa Maria",
    entityType: "shipwreck",
    expectedRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    approximateRegion: "Northern Hispaniola / Northern Coast of Haiti (Cap-Haïtien vicinity, Caribbean Sea)",
    country: "Haiti",
    historicalContext: "Columbus's flagship during his 1492 voyage; ran aground on a reef on Christmas Day 1492 near present-day Cap-Haïtien, Haiti.",
    sourceRationale: "Historical logs of Christopher Columbus indicate grounding on the northern coast of Hispaniola, but the exact physical shipwreck site remains unconfirmed and disputed.",
    confidence: "low",
    allowedCountries: ["Haiti", "Dominican Republic"],
    forbiddenRegions: ["New York", "Westchester County", "United States", "Peru", "Spain", "Brazil", "Rhode Island"],
    exactLocationConfirmed: false,
    exactLocationKnown: false,
    confirmedWreckLocation: false,
    approximateCoordinates: {
      lat: 19.7600,
      lng: -72.2000,
      source: "historical_approximate",
      confidence: "low"
    },
    boundingBox: { minLat: 18.0, maxLat: 21.0, minLng: -74.5, maxLng: -71.0 }
  },
  "titanic": {
    entity: "Titanic",
    entityType: "shipwreck",
    expectedRegion: "North Atlantic Ocean (Southeast of Newfoundland)",
    approximateRegion: "North Atlantic Ocean (approx. 370 miles southeast of Mistaken Point, Newfoundland)",
    historicalContext: "British passenger liner sank on April 15, 1912; wreck discovered by Robert Ballard and Jean-Louis Michel on September 1, 1985.",
    sourceRationale: "Deep-sea sonar and submersible surveys conclusively identified the bow and stern sections at 3,800 meters depth.",
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 41.7325,
      lng: -49.9469,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 40.0, maxLat: 43.0, minLng: -52.0, maxLng: -48.0 }
  },
  "vasa": {
    entity: "Vasa",
    entityType: "shipwreck",
    expectedRegion: "Stockholm Harbor / Sweden",
    approximateRegion: "Stockholm Harbor, Sweden",
    historicalContext: "Swedish warship sank on its maiden voyage in 1628 and was located in 1956 before being salvaged in 1961.",
    sourceRationale: "Anders Franzén located the intact wooden hull in Stockholm harbor near Beckholmen.",
    confidence: "high",
    allowedCountries: ["Sweden"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 59.3275,
      lng: 18.0911,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 58.5, maxLat: 60.5, minLng: 17.0, maxLng: 19.5 }
  },
  "hms terror": {
    entity: "HMS Terror",
    entityType: "shipwreck",
    expectedRegion: "Terror Bay / King William Island, Nunavut, Canada",
    approximateRegion: "Terror Bay, King William Island, Nunavut, Canada",
    historicalContext: "Franklin Expedition bomb vessel abandoned in 1848; discovered intact in 2016 by Arctic Research Foundation.",
    sourceRationale: "Acoustic imaging and ROV video confirmed the intact ship in Terror Bay at 24 meters depth.",
    confidence: "high",
    allowedCountries: ["Canada"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 68.8550,
      lng: -98.9350,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 67.0, maxLat: 71.0, minLng: -102.0, maxLng: -95.0 }
  },
  "hms erebus": {
    entity: "HMS Erebus",
    entityType: "shipwreck",
    expectedRegion: "Wilmot and Crampton Bay / Nunavut, Canada",
    approximateRegion: "Wilmot and Crampton Bay, Nunavut, Canada",
    historicalContext: "Franklin Expedition flagship discovered in September 2014 by Parks Canada underwater archaeologists.",
    sourceRationale: "Sonar survey and diver ground-truthing in Wilmot and Crampton Bay.",
    confidence: "high",
    allowedCountries: ["Canada"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 68.2500,
      lng: -98.8700,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 67.0, maxLat: 70.0, minLng: -101.0, maxLng: -95.0 }
  },
  "dead sea scrolls": {
    entity: "Dead Sea Scrolls",
    entityType: "archaeological_site",
    expectedRegion: "Qumran Caves / West Bank (Judean Desert)",
    approximateRegion: "Qumran Caves, West Bank",
    historicalContext: "Ancient Jewish manuscripts discovered between 1946 and 1956 in 11 caves near Khirbet Qumran.",
    sourceRationale: "Archaeological excavations at Qumran Caves 1 through 11.",
    confidence: "high",
    allowedCountries: ["State of Palestine", "Palestinian Territory", "Israel", "Jordan"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 31.7410,
      lng: 35.4600,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 31.0, maxLat: 32.5, minLng: 35.0, maxLng: 36.0 }
  },
  "rosetta stone": {
    entity: "Rosetta Stone",
    entityType: "archaeological_site",
    expectedRegion: "Fort Julien / Rashid (Rosetta), Nile Delta, Egypt",
    approximateRegion: "Fort Julien, Rashid (Rosetta), Egypt",
    historicalContext: "Ancient stele inscribed in three scripts discovered in 1799 during French construction at Fort Julien.",
    sourceRationale: "Historical French Napoleonic expedition records documenting discovery during wall reconstruction at Fort Julien.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 31.4000,
      lng: 30.4200,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 31.0, maxLat: 32.0, minLng: 30.0, maxLng: 31.0 }
  },
  "antikythera": {
    entity: "Antikythera Wreck Site",
    entityType: "shipwreck_site",
    expectedRegion: "Antikythera island / Aegean Sea, Greece",
    approximateRegion: "Off Point Glyphadia, Antikythera Island, Greece",
    country: "Greece",
    historicalContext: "Greek island and location of the ancient Antikythera shipwreck where the Antikythera mechanism was discovered in 1900-1901.",
    sourceRationale: "Authoritative historical and archaeological discovery records.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 35.8622,
      lng: 23.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 37.0, minLng: 22.5, maxLng: 24.5 }
  },
  "antikythera wreck": {
    entity: "Antikythera Wreck Site",
    entityType: "shipwreck_site",
    expectedRegion: "Antikythera island / Aegean Sea, Greece",
    approximateRegion: "Off Point Glyphadia, Antikythera Island, Greece",
    country: "Greece",
    historicalContext: "Ancient Roman shipwreck site dating to c. 70–60 BC off Point Glyphadia, Antikythera, where sponge divers discovered the Antikythera mechanism in 1900-1901.",
    sourceRationale: "Authoritative historical and archaeological discovery records.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 35.8622,
      lng: 23.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 37.0, minLng: 22.5, maxLng: 24.5 }
  },
  "the antikythera wreck": {
    entity: "Antikythera Wreck Site",
    entityType: "shipwreck_site",
    expectedRegion: "Antikythera island / Aegean Sea, Greece",
    approximateRegion: "Off Point Glyphadia, Antikythera Island, Greece",
    country: "Greece",
    historicalContext: "Ancient Roman shipwreck site dating to c. 70–60 BC off Point Glyphadia, Antikythera, where sponge divers discovered the Antikythera mechanism in 1900-1901.",
    sourceRationale: "Authoritative historical and archaeological discovery records.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 35.8622,
      lng: 23.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 37.0, minLng: 22.5, maxLng: 24.5 }
  },
  "antikythera shipwreck": {
    entity: "Antikythera Wreck Site",
    entityType: "shipwreck_site",
    expectedRegion: "Antikythera island / Aegean Sea, Greece",
    approximateRegion: "Off Point Glyphadia, Antikythera Island, Greece",
    country: "Greece",
    historicalContext: "Ancient Roman shipwreck site dating to c. 70–60 BC off Point Glyphadia, Antikythera, where sponge divers discovered the Antikythera mechanism in 1900-1901.",
    sourceRationale: "Authoritative historical and archaeological discovery records.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 35.8622,
      lng: 23.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 37.0, minLng: 22.5, maxLng: 24.5 }
  },
  "antikythera mechanism": {
    entity: "Antikythera Wreck Site",
    entityType: "shipwreck_site",
    expectedRegion: "Antikythera island / Aegean Sea, Greece",
    approximateRegion: "Off Point Glyphadia, Antikythera Island, Greece",
    country: "Greece",
    historicalContext: "Ancient Roman shipwreck site off Antikythera where sponge divers discovered the Antikythera mechanism in 1900-1901.",
    sourceRationale: "Documented archaeological recovery site off Antikythera island.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 35.8622,
      lng: 23.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 37.0, minLng: 22.5, maxLng: 24.5 }
  },
  "national archaeological museum": {
    entity: "National Archaeological Museum",
    entityType: "museum",
    expectedRegion: "Athens, Attica, Greece",
    approximateRegion: "Exarcheia, Athens, Greece",
    country: "Greece",
    historicalContext: "Major archaeological museum in Athens, Greece, housing the major fragments and gear components of the Antikythera mechanism.",
    sourceRationale: "Authoritative museum location in central Athens.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 37.9891,
      lng: 23.7327,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 37.5, maxLat: 38.5, minLng: 23.0, maxLng: 24.5 }
  },
  "national archaeological museum, athens": {
    entity: "National Archaeological Museum",
    entityType: "museum",
    expectedRegion: "Athens, Attica, Greece",
    approximateRegion: "Exarcheia, Athens, Greece",
    country: "Greece",
    historicalContext: "Major archaeological museum in Athens, Greece, housing the major fragments and gear components of the Antikythera mechanism.",
    sourceRationale: "Authoritative museum location in central Athens.",
    confidence: "high",
    allowedCountries: ["Greece"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 37.9891,
      lng: 23.7327,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 37.5, maxLat: 38.5, minLng: 23.0, maxLng: 24.5 }
  },
  "burkhan khaldun": {
    entity: "Burkhan Khaldun",
    entityType: "historical_waypoint",
    expectedRegion: "Khentii Province, Mongolia (Khentii Mountains)",
    approximateRegion: "Khentii Mountains, Mongolia",
    country: "Mongolia",
    historicalContext: "Sacred mountain in northeastern Mongolia where Temüjin sought refuge in his youth and convened the 1206 kurultai proclaiming the Mongol Empire.",
    sourceRationale: "Authoritative historical and geographic records for the sacred Burkhan Khaldun mountain in Khentii, Mongolia.",
    confidence: "high",
    allowedCountries: ["Mongolia"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 48.9000,
      lng: 109.0000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 47.5, maxLat: 50.0, minLng: 107.5, maxLng: 110.5 }
  },
  "burkhan khaldun (mongolia)": {
    entity: "Burkhan Khaldun",
    entityType: "historical_waypoint",
    expectedRegion: "Khentii Province, Mongolia (Khentii Mountains)",
    approximateRegion: "Khentii Mountains, Mongolia",
    country: "Mongolia",
    historicalContext: "Sacred mountain in northeastern Mongolia where Temüjin sought refuge in his youth and convened the 1206 kurultai proclaiming the Mongol Empire.",
    sourceRationale: "Authoritative historical and geographic records for the sacred Burkhan Khaldun mountain in Khentii, Mongolia.",
    confidence: "high",
    allowedCountries: ["Mongolia"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 48.9000,
      lng: 109.0000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 47.5, maxLat: 50.0, minLng: 107.5, maxLng: 110.5 }
  },
  "yinchuan": {
    entity: "Yinchuan",
    entityType: "historical_waypoint",
    expectedRegion: "Ningxia, China (Western Xia Capital Xingqing)",
    approximateRegion: "Yinchuan, Ningxia, China",
    country: "China",
    historicalContext: "Fortified capital (Xingqing) of the Tangut Western Xia dynasty, besieged by Genghis Khan in 1209.",
    sourceRationale: "Historical capital of Western Xia dynasty in modern Ningxia, China.",
    confidence: "high",
    allowedCountries: ["China"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 38.4872,
      lng: 106.2309,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 37.5, maxLat: 39.5, minLng: 105.0, maxLng: 107.5 }
  },
  "yinchuan (western xia)": {
    entity: "Yinchuan",
    entityType: "historical_waypoint",
    expectedRegion: "Ningxia, China (Western Xia Capital Xingqing)",
    approximateRegion: "Yinchuan, Ningxia, China",
    country: "China",
    historicalContext: "Fortified capital (Xingqing) of the Tangut Western Xia dynasty, besieged by Genghis Khan in 1209.",
    sourceRationale: "Historical capital of Western Xia dynasty in modern Ningxia, China.",
    confidence: "high",
    allowedCountries: ["China"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 38.4872,
      lng: 106.2309,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 37.5, maxLat: 39.5, minLng: 105.0, maxLng: 107.5 }
  },
  "western xia": {
    entity: "Western Xia",
    entityType: "historical_waypoint",
    expectedRegion: "Ningxia / Hexi Corridor, China",
    approximateRegion: "Yinchuan, Ningxia, China",
    country: "China",
    historicalContext: "Tangut empire in northwestern China conquered during the campaigns of Genghis Khan.",
    sourceRationale: "Historical Western Xia dynasty centered at Yinchuan (Xingqing).",
    confidence: "high",
    allowedCountries: ["China"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 38.4872,
      lng: 106.2309,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 36.0, maxLat: 40.5, minLng: 103.0, maxLng: 108.5 }
  },
  "zhongdu": {
    entity: "Zhongdu",
    entityType: "historical_waypoint",
    expectedRegion: "Beijing, China (Jurchen Jin Dynasty Capital)",
    approximateRegion: "Beijing, China",
    country: "China",
    historicalContext: "Northern capital of the Jurchen Jin dynasty, captured and sacked by Genghis Khan in 1215 after a prolonged siege.",
    sourceRationale: "Historical Jurchen Jin capital Zhongdu located in present-day Beijing, China.",
    confidence: "high",
    allowedCountries: ["China"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 39.9042,
      lng: 116.4074,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 39.0, maxLat: 40.8, minLng: 115.5, maxLng: 117.5 }
  },
  "zhongdu (beijing)": {
    entity: "Zhongdu",
    entityType: "historical_waypoint",
    expectedRegion: "Beijing, China (Jurchen Jin Dynasty Capital)",
    approximateRegion: "Beijing, China",
    country: "China",
    historicalContext: "Northern capital of the Jurchen Jin dynasty, captured and sacked by Genghis Khan in 1215 after a prolonged siege.",
    sourceRationale: "Historical Jurchen Jin capital Zhongdu located in present-day Beijing, China.",
    confidence: "high",
    allowedCountries: ["China"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 39.9042,
      lng: 116.4074,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 39.0, maxLat: 40.8, minLng: 115.5, maxLng: 117.5 }
  },
  "1715 treasure fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "the 1715 treasure fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "1715 spanish treasure fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "the 1715 spanish treasure fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "1715 fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "1715 spanish fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "1715 plate fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "1715 plata fleet": {
    entity: "1715 Treasure Fleet",
    entityType: "shipwreck",
    expectedRegion: "Florida East Coast / Treasure Coast (Vero Beach, Sebastian, Fort Pierce, Biscayne Bay / Atlantic Coast of Florida)",
    approximateRegion: "Treasure Coast, Florida, United States",
    country: "United States",
    state: "Florida",
    region: "Treasure Coast / Atlantic Coast of Florida",
    marineRegion: "Atlantic Ocean / Straits of Florida",
    historicalContext: "Spanish treasure fleet of eleven ships destroyed by a hurricane on July 31, 1715 off the Atlantic coast of Florida between Sebastian Inlet and Biscayne Bay; salvage operations and modern shipwreck discoveries along Florida's Treasure Coast recovered vast quantities of silver and gold.",
    sourceRationale: "Documented 1715 hurricane loss sites along Florida's Treasure Coast (Indian River, St. Lucie, Brevard, Martin, and Palm Beach counties) located and confirmed by historical salvage records and modern archaeological surveys.",
    confidence: "high",
    allowedCountries: ["United States", "Bahamas"],
    forbiddenRegions: ["Australia", "Pacific Ocean", "Indian Ocean", "Europe", "Asia", "Africa", "South America"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 27.5000,
      lng: -80.3000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 24.0, maxLat: 30.0, minLng: -82.5, maxLng: -79.0 }
  },
  "ss yongala": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "yongala": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "the yongala": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "yongala shipwreck": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "ss yongala shipwreck": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "yongala wreck": {
    entity: "SS Yongala",
    entityType: "shipwreck",
    expectedRegion: "Offshore Cape Bowling Green / Townsville, Queensland, Australia (Coral Sea)",
    approximateRegion: "Offshore Cape Bowling Green, Townsville, Queensland, Australia",
    country: "Australia",
    state: "Queensland",
    nearbyCity: "Townsville",
    region: "Offshore Cape Bowling Green",
    marineRegion: "Coral Sea",
    historicalContext: "Australian passenger steamship SS Yongala sank on March 23, 1911 during a cyclone with all 122 aboard; discovered in 1958 in the Great Barrier Reef Marine Park off Cape Bowling Green, Queensland.",
    sourceRationale: "Discovered in 1958 by skin divers Don McMillan and Noel Cook; designated historic shipwreck located approximately 12 nautical miles east of Cape Bowling Green in the Coral Sea.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["South Australia", "Inland Queensland", "New South Wales", "Victoria", "Western Australia", "Northern Territory", "Tasmania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -19.3044,
      lng: 147.6225,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -24.0, maxLat: -16.0, minLng: 145.0, maxLng: 153.0 }
  },
  "rms lusitania sinking site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "rms lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the rms lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania sinking site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania sinking": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "sinking of the lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "sinking of the rms lusitania": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania wreck": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the lusitania wreck": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania wreck site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the lusitania wreck site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "rms lusitania wreck": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "rms lusitania wreck site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the rms lusitania wreck": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the rms lusitania wreck site": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "rms lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "the rms lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "where was the lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "where was the rms lusitania found": {
    entity: "RMS Lusitania Sinking Site",
    entityType: "shipwreck",
    expectedRegion: "Celtic Sea / South of Old Head of Kinsale, County Cork, Ireland",
    approximateRegion: "Celtic Sea (approx. 11 miles south of Old Head of Kinsale, Ireland)",
    country: "Ireland",
    region: "Celtic Sea",
    marineRegion: "Celtic Sea / North Atlantic Ocean",
    historicalContext: "British ocean liner RMS Lusitania was torpedoed and sunk by German U-boat U-20 on May 7, 1915 during World War I; the wreck lies approximately 11 miles (18 km) south of the Old Head of Kinsale, Ireland, at a depth of 93 meters (305 feet).",
    sourceRationale: "Located 11 miles south of the Old Head of Kinsale lighthouse off the southern coast of County Cork, Ireland; explored by Robert Ballard and multiple diving expeditions.",
    confidence: "high",
    allowedCountries: ["Ireland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 51.3000,
      lng: -8.5500,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 51.0, maxLat: 51.6, minLng: -9.0, maxLng: -8.0 }
  },
  "hms hood": {
    entity: "HMS Hood",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "the hms hood": {
    entity: "HMS Hood",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "hms hood wreck site": {
    entity: "HMS Hood Wreck Site",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "hms hood found": {
    entity: "HMS Hood Wreck Site",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "the hms hood found": {
    entity: "HMS Hood Wreck Site",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "hms hood shipwreck": {
    entity: "HMS Hood Wreck Site",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "the hms hood shipwreck": {
    entity: "HMS Hood Wreck Site",
    entityType: "shipwreck",
    expectedRegion: "Denmark Strait (between Greenland and Iceland, North Atlantic Ocean)",
    approximateRegion: "Denmark Strait",
    country: "Iceland",
    region: "Denmark Strait",
    marineRegion: "Denmark Strait / North Atlantic Ocean",
    historicalContext: "Royal Navy battlecruiser HMS Hood was sunk by the German battleship Bismarck during the Battle of the Denmark Strait on May 24, 1941; the shipwreck was discovered in July 2001 in the Denmark Strait between Greenland and Iceland at a depth of 2,800 meters.",
    sourceRationale: "Discovered in July 2001 by David Mearns and Blue Water Recoveries in the Denmark Strait.",
    confidence: "high",
    allowedCountries: ["Iceland", "Greenland", "United Kingdom"],
    forbiddenRegions: ["Lesotho", "Ascension Island", "South Atlantic", "Indian Ocean", "Pacific Ocean", "Africa", "Australia", "United States", "Antarctica"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: 63.3333,
      lng: -31.8333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 62.0, maxLat: 65.0, minLng: -35.0, maxLng: -28.0 }
  },
  "trail of tears": {
    entity: "Trail of Tears",
    entityType: "historical_event",
    expectedRegion: "Southeastern United States (Georgia, Tennessee, Alabama, North Carolina) to Indian Territory (Oklahoma)",
    approximateRegion: "Southeastern United States to Oklahoma",
    historicalContext: "Forced displacement and relocation of Cherokee, Muscogee, Seminole, Chickasaw, and Choctaw nations between 1830 and 1850 across multiple overland detachments and water routes to Indian Territory.",
    sourceRationale: "National Park Service National Historic Trail documentation of Cherokee removal routes (Northern Route, Benge Route, Bell Route, Water Route).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Europe", "Asia", "Africa", "South America", "Canada"],
    exactLocationConfirmed: false,
    exactLocationKnown: true,
    confirmedWreckLocation: false,
    approximateCoordinates: {
      lat: 35.8000,
      lng: -88.5000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 33.0, maxLat: 39.0, minLng: -96.0, maxLng: -82.0 }
  },
  "the trail of tears": {
    entity: "Trail of Tears",
    entityType: "historical_event",
    expectedRegion: "Southeastern United States (Georgia, Tennessee, Alabama, North Carolina) to Indian Territory (Oklahoma)",
    approximateRegion: "Southeastern United States to Oklahoma",
    historicalContext: "Forced displacement and relocation of Cherokee, Muscogee, Seminole, Chickasaw, and Choctaw nations between 1830 and 1850 across multiple overland detachments and water routes to Indian Territory.",
    sourceRationale: "National Park Service National Historic Trail documentation of Cherokee removal routes.",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Europe", "Asia", "Africa", "South America", "Canada"],
    exactLocationConfirmed: false,
    exactLocationKnown: true,
    confirmedWreckLocation: false,
    approximateCoordinates: {
      lat: 35.8000,
      lng: -88.5000,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 33.0, maxLat: 39.0, minLng: -96.0, maxLng: -82.0 }
  },
  "fort gibson": {
    entity: "Fort Gibson",
    entityType: "historical_site",
    expectedRegion: "Muskogee County / Cherokee County, Oklahoma, United States",
    approximateRegion: "Fort Gibson, Oklahoma, United States",
    country: "United States",
    state: "Oklahoma",
    historicalContext: "Key military post established in 1824 on the Grand River in Indian Territory; served as the terminus and primary receiving station for Cherokee and Creek removal detachments during the Trail of Tears.",
    sourceRationale: "National Historic Landmark site in Fort Gibson, Muskogee/Cherokee County, Oklahoma (approx 35.80°N, 95.25°W). Distinct from Fort Osage (Missouri).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Missouri", "Jackson County, Missouri", "Alabama", "Tennessee", "Pennsylvania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 35.7981,
      lng: -95.2497,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.5, maxLat: 36.2, minLng: -95.6, maxLng: -94.9 }
  },
  "tahlequah": {
    entity: "Tahlequah",
    entityType: "historical_site",
    expectedRegion: "Cherokee County, Oklahoma, United States",
    approximateRegion: "Tahlequah, Oklahoma, United States",
    country: "United States",
    state: "Oklahoma",
    historicalContext: "Capital of the Cherokee Nation established in 1839 in Indian Territory following forced removal on the Trail of Tears.",
    sourceRationale: "Cherokee Nation capital in Cherokee County, Oklahoma (approx 35.91°N, 94.97°W).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Georgia", "Tennessee", "Alabama", "Missouri"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 35.9154,
      lng: -94.9700,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.7, maxLat: 36.1, minLng: -95.2, maxLng: -94.7 }
  },
  "new echota": {
    entity: "New Echota",
    entityType: "historical_site",
    expectedRegion: "Gordon County, Georgia, United States",
    approximateRegion: "New Echota Historic Site, Calhoun, Georgia, United States",
    country: "United States",
    state: "Georgia",
    historicalContext: "Capital of the Cherokee Nation from 1825 until forced removal; site of the controversial 1835 Treaty of New Echota.",
    sourceRationale: "State historic site in Gordon County, Georgia (approx 34.54°N, 84.91°W).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Arkansas", "Missouri", "Illinois"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 34.5408,
      lng: -84.9100,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 34.3, maxLat: 34.8, minLng: -85.2, maxLng: -84.6 }
  },
  "fort cass": {
    entity: "Fort Cass",
    entityType: "historical_site",
    expectedRegion: "Charleston, Bradley County, Tennessee, United States",
    approximateRegion: "Charleston, Bradley County, Tennessee",
    country: "United States",
    state: "Tennessee",
    historicalContext: "Headquarters for the military removal of the Cherokee and primary internment camp/staging area where thousands were assembled before departure on the Trail of Tears.",
    sourceRationale: "Military headquarters and concentration camp site at Charleston on the Hiwassee River, Bradley County, Tennessee.",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Missouri", "Arkansas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 35.2858,
      lng: -84.7578,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.0, maxLat: 35.6, minLng: -85.1, maxLng: -84.4 }
  },
  "fort jackson": {
    entity: "Fort Jackson",
    entityType: "historical_site",
    expectedRegion: "Elmore County, Alabama, United States",
    approximateRegion: "Fort Jackson / Fort Toulouse, Wetumpka, Alabama",
    country: "United States",
    state: "Alabama",
    historicalContext: "Historic fort on the Coosa and Tallapoosa rivers in Alabama; site of the 1814 Treaty of Fort Jackson ending the Creek War.",
    sourceRationale: "Historic site in Elmore County, Alabama. Distinct from Fort Gibson (OK), Fort Osage (MO), and Fort Franklin.",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Missouri", "Tennessee", "Pennsylvania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 32.5025,
      lng: -86.2553,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 32.2, maxLat: 32.8, minLng: -86.5, maxLng: -86.0 }
  },
  "fort osage": {
    entity: "Fort Osage",
    entityType: "historical_site",
    expectedRegion: "Sibley, Jackson County, Missouri, United States",
    approximateRegion: "Sibley, Jackson County, Missouri",
    country: "United States",
    state: "Missouri",
    historicalContext: "Early 19th-century factory trading post and military fort on the Missouri River established by William Clark in 1808.",
    sourceRationale: "National Historic Landmark in Sibley, Jackson County, Missouri. Distinct from Fort Gibson (Oklahoma) and Fort Jackson (Alabama).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Alabama", "Tennessee", "Georgia"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 39.1883,
      lng: -94.1950,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 39.0, maxLat: 39.4, minLng: -94.4, maxLng: -93.9 }
  },
  "fort payne": {
    entity: "Fort Payne",
    entityType: "historical_site",
    expectedRegion: "DeKalb County, Alabama, United States",
    approximateRegion: "Fort Payne, DeKalb County, Alabama",
    country: "United States",
    state: "Alabama",
    historicalContext: "Cherokee removal fort and internment site in Alabama from which the John Benge detachment departed on the Trail of Tears in 1838.",
    sourceRationale: "Historic removal site in Fort Payne, DeKalb County, Alabama (approx 34.44°N, 85.72°W).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Missouri", "Tennessee", "Pennsylvania"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 34.4442,
      lng: -85.7197,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 34.2, maxLat: 34.7, minLng: -86.0, maxLng: -85.4 }
  },
  "fort coffee": {
    entity: "Fort Coffee",
    entityType: "historical_site",
    expectedRegion: "Le Flore County, Oklahoma, United States",
    approximateRegion: "Fort Coffee / Spiro, Le Flore County, Oklahoma",
    country: "United States",
    state: "Oklahoma",
    historicalContext: "Military garrison established in 1834 on the Arkansas River in Indian Territory; served as the primary arrival river landing and receiving depot for Choctaw and Cherokee water route detachments.",
    sourceRationale: "Historic military post and river landing site on Swallow Rock overlooking the Arkansas River in Le Flore County, Oklahoma (approx 35.30°N, 94.61°W). Distinct from Oklahoma City.",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma City", "Missouri", "Tennessee", "Georgia", "Alabama"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 35.3042,
      lng: -94.6144,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.1, maxLat: 35.5, minLng: -94.8, maxLng: -94.4 }
  },
  "ross's landing": {
    entity: "Ross's Landing",
    entityType: "historical_site",
    expectedRegion: "Chattanooga, Hamilton County, Tennessee, United States",
    approximateRegion: "Ross's Landing, Chattanooga, Tennessee",
    country: "United States",
    state: "Tennessee",
    historicalContext: "Cherokee trading post established by John Ross and primary embarkation point on the Tennessee River for water route detachments during the Trail of Tears.",
    sourceRationale: "Historic riverfront landing in Chattanooga, Hamilton County, Tennessee (approx 35.056°N, 85.309°W).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Missouri", "Illinois", "Arkansas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 35.0560,
      lng: -85.3090,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 34.9, maxLat: 35.2, minLng: -85.5, maxLng: -85.1 }
  },
  "gunter's landing": {
    entity: "Gunter's Landing",
    entityType: "historical_site",
    expectedRegion: "Guntersville, Marshall County, Alabama, United States",
    approximateRegion: "Guntersville, Marshall County, Alabama",
    country: "United States",
    state: "Alabama",
    historicalContext: "Cherokee river settlement and ferry landing on the Tennessee River established by John Gunter; key river crossing for the John Benge detachment in 1838.",
    sourceRationale: "Historic Tennessee River crossing site in Guntersville, Marshall County, Alabama (approx 34.358°N, 86.294°W).",
    confidence: "high",
    allowedCountries: ["United States"],
    forbiddenRegions: ["Oklahoma", "Missouri", "Tennessee", "Georgia"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 34.3581,
      lng: -86.2944,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 34.2, maxLat: 34.5, minLng: -86.5, maxLng: -86.1 }
  },

  // ─── Pyramids of Giza ─────────────────────────────────────────────────────
  // All aliases resolve to the same authoritative deterministic entry.
  // Coordinates: center of the Giza Plateau / pyramid complex (29.9792°N, 31.1342°E).
  // Used for direct lookups, alias-resolved queries ("pyramids of gaza"), and
  // any recovery path to prevent AI-hallucinated coordinates from being accepted.
  "pyramids of giza": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Pyramids of Giza are a complex of ancient monuments on the Giza Plateau, on the outskirts of Cairo, Egypt. The complex includes the Great Pyramid of Giza (built for Pharaoh Khufu, c. 2560 BCE), the Pyramid of Khafre, the Pyramid of Menkaure, the Great Sphinx, and several smaller pyramids and cemeteries. One of the Seven Wonders of the Ancient World and the only one still largely intact.",
    sourceRationale: "Extensively documented archaeological site at coordinates 29.9792°N, 31.1342°E on the Giza Plateau, on the western outskirts of Cairo, Giza Governorate, Egypt. Precise location confirmed by satellite imagery, geodetic surveys, and the Egyptian Ministry of Antiquities.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  // Common misspelling: "gaza" instead of "giza"
  "pyramids of gaza": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Pyramids of Giza are a complex of ancient monuments on the Giza Plateau, on the outskirts of Cairo, Egypt. The complex includes the Great Pyramid of Giza (built for Pharaoh Khufu, c. 2560 BCE), the Pyramid of Khafre, the Pyramid of Menkaure, the Great Sphinx, and several smaller pyramids and cemeteries. One of the Seven Wonders of the Ancient World and the only one still largely intact.",
    sourceRationale: "Query contains a common phonetic misspelling ('gaza' for 'giza'). The intended entity is the Pyramids of Giza at 29.9792°N, 31.1342°E on the Giza Plateau, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "great pyramid of giza": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Great Pyramid of Giza is the oldest and largest of the three pyramids in the Giza pyramid complex, built as a tomb for Pharaoh Khufu (c. 2560 BCE). It is the oldest of the Seven Wonders of the Ancient World and the only one still largely intact.",
    sourceRationale: "The Great Pyramid of Giza (Pyramid of Khufu/Cheops) stands on the Giza Plateau at approximately 29.9792°N, 31.1342°E, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "giza pyramid complex": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Giza pyramid complex (also called the Giza necropolis) is an archaeological site on the Giza Plateau, on the outskirts of Cairo, Egypt. The complex includes the Great Pyramid of Giza, the Pyramid of Khafre, the Pyramid of Menkaure, and the Great Sphinx of Giza.",
    sourceRationale: "The Giza pyramid complex is located on the Giza Plateau at approximately 29.9792°N, 31.1342°E, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "giza pyramids": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Pyramids of Giza are ancient Egyptian royal burial monuments built during the Fourth Dynasty of the Old Kingdom (c. 2613–2494 BCE), located on the Giza Plateau on the western outskirts of Cairo.",
    sourceRationale: "Giza Pyramids are located on the Giza Plateau at approximately 29.9792°N, 31.1342°E, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "giza necropolis": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Giza necropolis is an archaeological complex located on the Giza Plateau, Giza Governorate, Egypt, encompassing the three major pyramids, the Great Sphinx, workers' villages, an industrial complex, and cemeteries.",
    sourceRationale: "The Giza necropolis is located at approximately 29.9792°N, 31.1342°E on the Giza Plateau, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "pyramids at giza": {
    entity: "The Pyramids of Giza",
    entityType: "archaeological_site",
    expectedRegion: "Giza Plateau, Giza Governorate, Egypt",
    approximateRegion: "Giza Plateau, Giza, Egypt",
    country: "Egypt",
    state: "Giza Governorate",
    nearbyCity: "Giza",
    region: "Giza Plateau",
    historicalContext: "The Pyramids of Giza are a complex of ancient monuments on the Giza Plateau, on the outskirts of Cairo, Egypt. Built during the Fourth Dynasty of the Old Kingdom, they are among the most recognized symbols of ancient Egyptian civilization.",
    sourceRationale: "The pyramids at Giza are located on the Giza Plateau at approximately 29.9792°N, 31.1342°E, Giza Governorate, Egypt.",
    confidence: "high",
    allowedCountries: ["Egypt"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 29.9792,
      lng: 31.1342,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 29.8, maxLat: 30.2, minLng: 30.9, maxLng: 31.5 }
  },
  "boston massacre": {
    entity: "Boston Massacre Site",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Boston, Massachusetts, United States",
    approximateRegion: "Boston, Massachusetts",
    country: "United States",
    state: "Massachusetts",
    nearbyCity: "Boston",
    region: "Downtown Boston / Freedom Trail",
    historicalContext: "The Boston Massacre was a confrontation on March 5, 1770, in which British soldiers shot and killed several people while under harassment by a mob in Boston, Massachusetts.",
    sourceRationale: "The Boston Massacre occurred outside the Old State House at the intersection of Congress and State Streets in Boston.",
    confidence: "high",
    allowedCountries: ["United States"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 42.3588,
      lng: -71.0578,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 42.3, maxLat: 42.4, minLng: -71.1, maxLng: -71.0 }
  },
  "boston massacre site": {
    entity: "Boston Massacre Site",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Boston, Massachusetts, United States",
    approximateRegion: "Boston, Massachusetts",
    country: "United States",
    state: "Massachusetts",
    nearbyCity: "Boston",
    region: "Downtown Boston / Freedom Trail",
    historicalContext: "The Boston Massacre was a confrontation on March 5, 1770, in which British soldiers shot and killed several people while under harassment by a mob in Boston, Massachusetts.",
    sourceRationale: "The Boston Massacre occurred outside the Old State House at the intersection of Congress and State Streets in Boston.",
    confidence: "high",
    allowedCountries: ["United States"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 42.3588,
      lng: -71.0578,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 42.3, maxLat: 42.4, minLng: -71.1, maxLng: -71.0 }
  },
  "battle of gettysburg": {
    entity: "Battle of Gettysburg",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Gettysburg, Pennsylvania, United States",
    approximateRegion: "Gettysburg, Pennsylvania",
    country: "United States",
    state: "Pennsylvania",
    nearbyCity: "Gettysburg",
    region: "Adams County, Pennsylvania",
    historicalContext: "The Battle of Gettysburg was fought July 1–3, 1863, in and around the town of Gettysburg, Pennsylvania, by Union and Confederate forces during the American Civil War.",
    sourceRationale: "Gettysburg National Military Park preserves the battlefield site.",
    confidence: "high",
    allowedCountries: ["United States"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 39.8167,
      lng: -77.2333,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 39.75, maxLat: 39.88, minLng: -77.30, maxLng: -77.18 }
  },
  "battle of trafalgar": {
    entity: "Battle of Trafalgar",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Atlantic Ocean / Cape Trafalgar, Cádiz, Andalusia, Spain",
    approximateRegion: "Off Cape Trafalgar, Cádiz, Andalusia, Spain (Atlantic Ocean)",
    country: "Spain",
    region: "Andalusia",
    nearbyCity: "Cádiz",
    marineRegion: "Atlantic Ocean / Gulf of Cádiz",
    historicalContext: "The Battle of Trafalgar was a decisive naval engagement fought on October 21, 1805, during the Napoleonic Wars. The British Royal Navy, commanded by Vice Admiral Lord Nelson aboard HMS Victory, defeated the combined French and Spanish fleets off Cape Trafalgar on the southwestern coast of Spain.",
    significance: "Established British naval supremacy for over a century and permanently eliminated Napoleon's plans to invade Britain.",
    sourceRationale: "Naval engagement fought off Cape Trafalgar (Cabo de Trafalgar), southwest coast of Spain.",
    notable: [
      "Fought off Cape Trafalgar on the southwestern coast of Spain on October 21, 1805",
      "Vice Admiral Horatio Nelson was mortally wounded aboard HMS Victory during the battle",
      "The British fleet of 27 ships of the line defeated 33 Franco-Spanish ships without losing a single vessel"
    ],
    contextNotes: "Decisive naval battle site located in the Atlantic Ocean off the coast of Cape Trafalgar, Spain.",
    confidence: "high",
    allowedCountries: ["Spain", "United Kingdom", "France"],
    forbiddenRegions: ["Bristol", "Gloucestershire", "London", "Avon", "England"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 36.1800,
      lng: -6.0300,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.8, maxLat: 36.6, minLng: -6.4, maxLng: -5.7 }
  },
  "the battle of trafalgar": {
    entity: "Battle of Trafalgar",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Atlantic Ocean / Cape Trafalgar, Cádiz, Andalusia, Spain",
    approximateRegion: "Off Cape Trafalgar, Cádiz, Andalusia, Spain (Atlantic Ocean)",
    country: "Spain",
    region: "Andalusia",
    nearbyCity: "Cádiz",
    marineRegion: "Atlantic Ocean / Gulf of Cádiz",
    historicalContext: "The Battle of Trafalgar was a decisive naval engagement fought on October 21, 1805, during the Napoleonic Wars. The British Royal Navy, commanded by Vice Admiral Lord Nelson aboard HMS Victory, defeated the combined French and Spanish fleets off Cape Trafalgar on the southwestern coast of Spain.",
    significance: "Established British naval supremacy for over a century and permanently eliminated Napoleon's plans to invade Britain.",
    sourceRationale: "Naval engagement fought off Cape Trafalgar (Cabo de Trafalgar), southwest coast of Spain.",
    notable: [
      "Fought off Cape Trafalgar on the southwestern coast of Spain on October 21, 1805",
      "Vice Admiral Horatio Nelson was mortally wounded aboard HMS Victory during the battle",
      "The British fleet of 27 ships of the line defeated 33 Franco-Spanish ships without losing a single vessel"
    ],
    contextNotes: "Decisive naval battle site located in the Atlantic Ocean off the coast of Cape Trafalgar, Spain.",
    confidence: "high",
    allowedCountries: ["Spain", "United Kingdom", "France"],
    forbiddenRegions: ["Bristol", "Gloucestershire", "London", "Avon", "England"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 36.1800,
      lng: -6.0300,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.8, maxLat: 36.6, minLng: -6.4, maxLng: -5.7 }
  },
  "trafalgar": {
    entity: "Battle of Trafalgar",
    entityType: "historical_event_site",
    geographicScope: "POINT_EVENT",
    singleLocation: true,
    expectedRegion: "Atlantic Ocean / Cape Trafalgar, Cádiz, Andalusia, Spain",
    approximateRegion: "Off Cape Trafalgar, Cádiz, Andalusia, Spain (Atlantic Ocean)",
    country: "Spain",
    region: "Andalusia",
    nearbyCity: "Cádiz",
    marineRegion: "Atlantic Ocean / Gulf of Cádiz",
    historicalContext: "The Battle of Trafalgar was a decisive naval engagement fought on October 21, 1805, during the Napoleonic Wars. The British Royal Navy, commanded by Vice Admiral Lord Nelson aboard HMS Victory, defeated the combined French and Spanish fleets off Cape Trafalgar on the southwestern coast of Spain.",
    significance: "Established British naval supremacy for over a century and permanently eliminated Napoleon's plans to invade Britain.",
    sourceRationale: "Naval engagement fought off Cape Trafalgar (Cabo de Trafalgar), southwest coast of Spain.",
    notable: [
      "Fought off Cape Trafalgar on the southwestern coast of Spain on October 21, 1805",
      "Vice Admiral Horatio Nelson was mortally wounded aboard HMS Victory during the battle",
      "The British fleet of 27 ships of the line defeated 33 Franco-Spanish ships without losing a single vessel"
    ],
    contextNotes: "Decisive naval battle site located in the Atlantic Ocean off the coast of Cape Trafalgar, Spain.",
    confidence: "high",
    allowedCountries: ["Spain", "United Kingdom", "France"],
    forbiddenRegions: ["Bristol", "Gloucestershire", "London", "Avon", "England"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    approximateCoordinates: {
      lat: 36.1800,
      lng: -6.0300,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: 35.8, maxLat: 36.6, minLng: -6.4, maxLng: -5.7 }
  },
  "great depression": {
    entity: "Great Depression",
    entityType: "historical_event",
    geographicScope: "GLOBAL_EVENT",
    singleLocation: false,
    expectedRegion: "Global (North America, Europe, Latin America, Asia, Australasia)",
    region: "Global",
    historicalContext: "The Great Depression was a severe worldwide economic depression that took place mostly during the 1930s, beginning in the United States after a major fall in stock prices that began around September 4, 1929, and became worldwide news with the stock market crash of October 29, 1929 (known as Black Tuesday). It affected industrialized nations and primary commodity-exporting countries worldwide.",
    significance: "The longest, deepest, and most widespread economic depression of the 20th century.",
    contextNotes: "As a global macro-economic event spanning numerous countries and continents, the Great Depression has no single canonical geographic point or coordinate location.",
    notable: [
      "Originated following the Wall Street stock market crash of October 1929",
      "Caused catastrophic declines in industrial output, employment, and international trade globally",
      "Spurred major governmental economic policy reforms including the US New Deal and expanded social safety nets"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "the great depression": {
    entity: "Great Depression",
    entityType: "historical_event",
    geographicScope: "GLOBAL_EVENT",
    singleLocation: false,
    expectedRegion: "Global (North America, Europe, Latin America, Asia, Australasia)",
    region: "Global",
    historicalContext: "The Great Depression was a severe worldwide economic depression that took place mostly during the 1930s, beginning in the United States after a major fall in stock prices that began around September 4, 1929, and became worldwide news with the stock market crash of October 29, 1929 (known as Black Tuesday). It affected industrialized nations and primary commodity-exporting countries worldwide.",
    significance: "The longest, deepest, and most widespread economic depression of the 20th century.",
    contextNotes: "As a global macro-economic event spanning numerous countries and continents, the Great Depression has no single canonical geographic point or coordinate location.",
    notable: [
      "Originated following the Wall Street stock market crash of October 1929",
      "Caused catastrophic declines in industrial output, employment, and international trade globally",
      "Spurred major governmental economic policy reforms including the US New Deal and expanded social safety nets"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "world war ii": {
    entity: "World War II",
    entityType: "historical_event",
    geographicScope: "GLOBAL_EVENT",
    singleLocation: false,
    expectedRegion: "Global (European, Pacific, Atlantic, Mediterranean, and Asian theaters)",
    region: "Global",
    historicalContext: "World War II was a global conflict that lasted from 1939 to 1945. The vast majority of the world's countries, including all of the great powers, fought as part of two opposing military alliances: the Allies and the Axis.",
    significance: "The deadliest conflict in human history, involving over 30 countries and resulting in tens of millions of fatalities.",
    contextNotes: "World War II encompassed multiple continental and oceanic theaters across Europe, the Pacific, Asia, and Africa, with no single geographic coordinate.",
    notable: [
      "Involved principal combatants across Europe, East Asia, and the Pacific Ocean",
      "Led to the creation of the United Nations and the establishment of the post-war geopolitical order",
      "Marked the first and only wartime use of nuclear weapons"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "world war i": {
    entity: "World War I",
    entityType: "historical_event",
    geographicScope: "GLOBAL_EVENT",
    singleLocation: false,
    expectedRegion: "Global / Europe, Middle East, Africa, Pacific",
    region: "Global",
    historicalContext: "World War I was a global conflict lasting from 1914 to 1918, fought between the Allied Powers and the Central Powers across multiple fronts in Europe, the Middle East, and beyond.",
    significance: "One of the largest wars in history, leading to major political changes including the collapse of four empires.",
    contextNotes: "World War I was fought across extensive geographic fronts including the Western Front, Eastern Front, Italian Front, and Middle Eastern theaters.",
    notable: [
      "Fought across the Western, Eastern, and Middle Eastern fronts",
      "Ended with the Treaty of Versailles and the dissolution of the Austro-Hungarian, Ottoman, and Russian empires",
      "Introduced widespread industrialized warfare, armored combat, and aerial combat"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "industrial revolution": {
    entity: "Industrial Revolution",
    entityType: "historical_event",
    geographicScope: "GLOBAL_EVENT",
    singleLocation: false,
    expectedRegion: "Global (originated in Great Britain; expanded across Europe and North America)",
    region: "Global",
    historicalContext: "The Industrial Revolution was the transition to new manufacturing processes in Great Britain, continental Europe, and the United States, in the period from around 1760 to about 1840.",
    significance: "Transformed agrarian societies into mechanized, industrial economies, fundamentally reshaping human demographics and urban development.",
    contextNotes: "The Industrial Revolution was a multi-decade technological and socioeconomic transformation spanning Britain, Western Europe, and North America.",
    notable: [
      "Pioneered steam power, mechanized textile production, and modern metallurgy",
      "Drove massive urbanization and the growth of modern factory production systems",
      "Laid the technological foundations for modern industrial society"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "viking age": {
    entity: "Viking Age",
    entityType: "historical_event",
    geographicScope: "REGIONAL_EVENT",
    singleLocation: false,
    expectedRegion: "Scandinavia, British Isles, North Atlantic, Eastern Europe",
    region: "Regional",
    historicalContext: "The Viking Age was the period during the Middle Ages (c. 793–1066 CE) when Norsemen undertook large-scale raiding, colonizing, conquest, and trading throughout Europe and reached North America.",
    significance: "An era of maritime exploration, trade, and settlement spanning the North Atlantic and European river networks.",
    contextNotes: "The Viking Age spans multiple centuries and regions across Scandinavia, the British Isles, Iceland, Greenland, and Eastern Europe.",
    notable: [
      "Encompassed Norse sea exploration, trade routes, and settlement from North America to Byzantium",
      "Established major trade networks across the Baltic and North Sea corridors",
      "Concluded around 1066 with the Battle of Stamford Bridge and the Christianization of Scandinavia"
    ],
    confidence: "high",
    allowedCountries: [],
    exactLocationConfirmed: false,
    exactLocationKnown: false
  },
  "batavia shipwreck site": {
    entity: "Batavia Shipwreck Site",
    entityType: "shipwreck",
    expectedRegion: "Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)",
    approximateRegion: "Morning Reef, Wallabi Group, Houtman Abrolhos, Western Australia",
    country: "Australia",
    state: "Western Australia",
    region: "Houtman Abrolhos",
    marineRegion: "Indian Ocean",
    historicalContext: "Dutch East India Company (VOC) flagship Batavia wrecked on Morning Reef in the Wallabi Group of the Houtman Abrolhos off the coast of Western Australia on June 4, 1629; the survivors were subjected to a notorious mutiny and massacre led by Jeronimus Cornelisz before rescue by Commander Francisco Pelsaert.",
    sourceRationale: "Shipwreck site located in 1963 on Morning Reef in the Wallabi Group, Houtman Abrolhos archipelago (approx. 28°29′25″S, 113°47′36″E); extensively surveyed and excavated by the Western Australian Museum.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["New South Wales", "Victoria", "Queensland", "Tasmania", "South Australia", "Northern Territory", "Atlantic Ocean", "Pacific Ocean", "Europe", "Africa", "Americas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -28.4903,
      lng: 113.7933,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -30.0, maxLat: -27.0, minLng: 112.5, maxLng: 115.5 }
  },
  "batavia": {
    entity: "Batavia Shipwreck Site",
    entityType: "shipwreck",
    expectedRegion: "Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)",
    approximateRegion: "Morning Reef, Wallabi Group, Houtman Abrolhos, Western Australia",
    country: "Australia",
    state: "Western Australia",
    region: "Houtman Abrolhos",
    marineRegion: "Indian Ocean",
    historicalContext: "Dutch East India Company (VOC) flagship Batavia wrecked on Morning Reef in the Wallabi Group of the Houtman Abrolhos off the coast of Western Australia on June 4, 1629; the survivors were subjected to a notorious mutiny and massacre led by Jeronimus Cornelisz before rescue by Commander Francisco Pelsaert.",
    sourceRationale: "Shipwreck site located in 1963 on Morning Reef in the Wallabi Group, Houtman Abrolhos archipelago (approx. 28°29′25″S, 113°47′36″E); extensively surveyed and excavated by the Western Australian Museum.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["New South Wales", "Victoria", "Queensland", "Tasmania", "South Australia", "Northern Territory", "Atlantic Ocean", "Pacific Ocean", "Europe", "Africa", "Americas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -28.4903,
      lng: 113.7933,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -30.0, maxLat: -27.0, minLng: 112.5, maxLng: 115.5 }
  },
  "batavia shipwreck": {
    entity: "Batavia Shipwreck Site",
    entityType: "shipwreck",
    expectedRegion: "Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)",
    approximateRegion: "Morning Reef, Wallabi Group, Houtman Abrolhos, Western Australia",
    country: "Australia",
    state: "Western Australia",
    region: "Houtman Abrolhos",
    marineRegion: "Indian Ocean",
    historicalContext: "Dutch East India Company (VOC) flagship Batavia wrecked on Morning Reef in the Wallabi Group of the Houtman Abrolhos off the coast of Western Australia on June 4, 1629; the survivors were subjected to a notorious mutiny and massacre led by Jeronimus Cornelisz before rescue by Commander Francisco Pelsaert.",
    sourceRationale: "Shipwreck site located in 1963 on Morning Reef in the Wallabi Group, Houtman Abrolhos archipelago (approx. 28°29′25″S, 113°47′36″E); extensively surveyed and excavated by the Western Australian Museum.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["New South Wales", "Victoria", "Queensland", "Tasmania", "South Australia", "Northern Territory", "Atlantic Ocean", "Pacific Ocean", "Europe", "Africa", "Americas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -28.4903,
      lng: 113.7933,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -30.0, maxLat: -27.0, minLng: 112.5, maxLng: 115.5 }
  },
  "batavia wreck": {
    entity: "Batavia Shipwreck Site",
    entityType: "shipwreck",
    expectedRegion: "Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)",
    approximateRegion: "Morning Reef, Wallabi Group, Houtman Abrolhos, Western Australia",
    country: "Australia",
    state: "Western Australia",
    region: "Houtman Abrolhos",
    marineRegion: "Indian Ocean",
    historicalContext: "Dutch East India Company (VOC) flagship Batavia wrecked on Morning Reef in the Wallabi Group of the Houtman Abrolhos off the coast of Western Australia on June 4, 1629; the survivors were subjected to a notorious mutiny and massacre led by Jeronimus Cornelisz before rescue by Commander Francisco Pelsaert.",
    sourceRationale: "Shipwreck site located in 1963 on Morning Reef in the Wallabi Group, Houtman Abrolhos archipelago (approx. 28°29′25″S, 113°47′36″E); extensively surveyed and excavated by the Western Australian Museum.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["New South Wales", "Victoria", "Queensland", "Tasmania", "South Australia", "Northern Territory", "Atlantic Ocean", "Pacific Ocean", "Europe", "Africa", "Americas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -28.4903,
      lng: 113.7933,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -30.0, maxLat: -27.0, minLng: 112.5, maxLng: 115.5 }
  },
  "the batavia": {
    entity: "Batavia Shipwreck Site",
    entityType: "shipwreck",
    expectedRegion: "Houtman Abrolhos / Morning Reef, Wallabi Group, Western Australia (Indian Ocean)",
    approximateRegion: "Morning Reef, Wallabi Group, Houtman Abrolhos, Western Australia",
    country: "Australia",
    state: "Western Australia",
    region: "Houtman Abrolhos",
    marineRegion: "Indian Ocean",
    historicalContext: "Dutch East India Company (VOC) flagship Batavia wrecked on Morning Reef in the Wallabi Group of the Houtman Abrolhos off the coast of Western Australia on June 4, 1629; the survivors were subjected to a notorious mutiny and massacre led by Jeronimus Cornelisz before rescue by Commander Francisco Pelsaert.",
    sourceRationale: "Shipwreck site located in 1963 on Morning Reef in the Wallabi Group, Houtman Abrolhos archipelago (approx. 28°29′25″S, 113°47′36″E); extensively surveyed and excavated by the Western Australian Museum.",
    confidence: "high",
    allowedCountries: ["Australia"],
    forbiddenRegions: ["New South Wales", "Victoria", "Queensland", "Tasmania", "South Australia", "Northern Territory", "Atlantic Ocean", "Pacific Ocean", "Europe", "Africa", "Americas"],
    exactLocationConfirmed: true,
    exactLocationKnown: true,
    confirmedWreckLocation: true,
    approximateCoordinates: {
      lat: -28.4903,
      lng: 113.7933,
      source: "deterministic",
      confidence: "high"
    },
    boundingBox: { minLat: -30.0, maxLat: -27.0, minLng: 112.5, maxLng: 115.5 }
  }
};

export interface MaritimeRegionBounds {
  names: string[];
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  description?: string;
}

export const MAJOR_MARITIME_REGIONS: MaritimeRegionBounds[] = [
  {
    names: ['north atlantic', 'atlantic ocean', 'atlantic', 'western atlantic', 'eastern atlantic', 'sargasso sea', 'caribbean', 'gulf of mexico', 'straits of florida', 'florida coast', 'georgia coast', 'carolina coast', 'celtic sea', 'english channel', 'north sea', 'irish sea', 'cape hatteras', 'outer banks', 'newfoundland', 'nova scotia', 'savannah', 'charleston'],
    minLat: 0,
    maxLat: 75,
    minLng: -100,
    maxLng: 15,
    description: 'North Atlantic Ocean & Marginal Seas'
  },
  {
    names: ['south atlantic', 'south atlantic ocean', 'falkland', 'falklands'],
    minLat: -65,
    maxLat: 5,
    minLng: -70,
    maxLng: 25,
    description: 'South Atlantic Ocean'
  },
  {
    names: ['caribbean', 'caribbean sea', 'hispaniola', 'cuba', 'bahamas', 'antilles', 'jamaica', 'haiti', 'dominican republic', 'puerto rico'],
    minLat: 8,
    maxLat: 28,
    minLng: -90,
    maxLng: -58,
    description: 'Caribbean Sea'
  },
  {
    names: ['gulf of mexico'],
    minLat: 18,
    maxLat: 31,
    minLng: -98,
    maxLng: -80,
    description: 'Gulf of Mexico'
  },
  {
    names: ['mediterranean', 'mediterranean sea', 'aegean', 'aegean sea', 'adriatic', 'adriatic sea', 'tyrrhenian', 'ionian', 'ionian sea', 'levantine'],
    minLat: 30,
    maxLat: 46,
    minLng: -6,
    maxLng: 37,
    description: 'Mediterranean Sea'
  },
  {
    names: ['baltic', 'baltic sea', 'gulf of finland', 'stockholm harbor', 'kattegat', 'skagerrak'],
    minLat: 53,
    maxLat: 66,
    minLng: 9,
    maxLng: 31,
    description: 'Baltic Sea'
  },
  {
    names: ['great lakes', 'lake superior', 'lake michigan', 'lake huron', 'lake erie', 'lake ontario', 'whitefish bay', 'whitefish point'],
    minLat: 41,
    maxLat: 49,
    minLng: -93,
    maxLng: -75,
    description: 'North American Great Lakes'
  },
  {
    names: ['indian ocean', 'houtman abrolhos', 'wallabi group', 'western australia', 'arabian sea', 'bay of bengal', 'red sea', 'persian gulf', 'strait of malacca'],
    minLat: -55,
    maxLat: 30,
    minLng: 20,
    maxLng: 130,
    description: 'Indian Ocean'
  },
  {
    names: ['north pacific', 'pacific ocean', 'pacific', 'bering sea', 'sea of japan', 'east china sea', 'south china sea', 'philippine sea', 'coral sea', 'great barrier reef', 'yellow sea', 'gulf of alaska', 'hawaii', 'pearl harbor'],
    minLat: 0,
    maxLat: 68,
    minLng: 100,
    maxLng: -110,
    description: 'North Pacific Ocean'
  },
  {
    names: ['south pacific', 'south pacific ocean', 'tasman sea', 'great barrier reef', 'queensland coast', 'bowling green bay'],
    minLat: -65,
    maxLat: 5,
    minLng: 140,
    maxLng: -70,
    description: 'South Pacific Ocean'
  },
  {
    names: ['arctic', 'arctic ocean', 'barents sea', 'greenland sea', 'denmark strait', 'beaufort sea', 'terror bay', 'king william island', 'victoria strait', 'wilmot and crampton bay', 'nunavut', 'northwest passage'],
    minLat: 60,
    maxLat: 90,
    minLng: -180,
    maxLng: 180,
    description: 'Arctic Ocean & Northern Passages'
  },
  {
    names: ['southern ocean', 'antarctic ocean', 'drake passage', 'weddell sea', 'ross sea', 'antarctica'],
    minLat: -90,
    maxLat: -50,
    minLng: -180,
    maxLng: 180,
    description: 'Southern / Antarctic Ocean'
  }
];

/**
 * Authoritative centralized helper to determine if an entity, type, or query context represents a historical maritime entity.
 */
export function isMaritimeHistoricalEntity(entityOrContext: any): boolean {
  if (!entityOrContext) return false;

  if (typeof entityOrContext === 'string') {
    const str = entityOrContext.toLowerCase().trim();
    if (
      str === 'shipwreck_site' || 
      str === 'shipwreck' || 
      str === 'maritime_wreck' || 
      str === 'submerged_site' || 
      str === 'wreck_site' ||
      str === 'naval_wreck' ||
      str === 'submerged_archaeological_site' ||
      str === 'maritime_disaster_site' ||
      str === 'underwater_cultural_heritage' ||
      str === 'aircraft_wreck_at_sea'
    ) {
      return true;
    }
    const kb = getHistoricalEntityKnowledge(str);
    if (kb && (kb.entityType === 'shipwreck' || (kb as any).entityType === 'shipwreck_site')) {
      return true;
    }
    return false;
  }

  const entityType = entityOrContext.entityType || entityOrContext.candidateEntityType;
  if (entityType) {
    const typeStr = String(entityType).toLowerCase().trim();
    if (
      typeStr === 'shipwreck_site' || 
      typeStr === 'shipwreck' || 
      typeStr === 'maritime_wreck' || 
      typeStr === 'submerged_site' || 
      typeStr === 'wreck_site' ||
      typeStr === 'naval_wreck' ||
      typeStr === 'submerged_archaeological_site' ||
      typeStr === 'maritime_disaster_site' ||
      typeStr === 'underwater_cultural_heritage' ||
      typeStr === 'aircraft_wreck_at_sea'
    ) {
      return true;
    }
  }

  const name = entityOrContext.name || entityOrContext.entityName || entityOrContext.canonicalName || entityOrContext.entity;
  if (name && typeof name === 'string') {
    const kb = getHistoricalEntityKnowledge(name);
    if (kb && (kb.entityType === 'shipwreck' || (kb as any).entityType === 'shipwreck_site')) {
      return true;
    }
    if (/^(?:SS|RMS|HMS|USS|MV|HMAS|USNS|CSS|IJN|SMS|RV|SV|MS)\b/i.test(name) && entityOrContext.intent === 'DISCOVERY_OBJECT_LOCATION') {
      return true;
    }
    if (/\b(?:shipwreck|wreck|sunken|submerged|galleon|frigate|battleship|submarine|destroyer)\b/i.test(name)) {
      return true;
    }
  }

  if (entityOrContext.intent === 'DISCOVERY_OBJECT_LOCATION') {
    const rawQ = entityOrContext.rawQuery;
    if (rawQ && /\b(shipwreck|wreck|sunken ship|sunken vessel)\b/i.test(rawQ)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates whether candidate coordinates are geographically consistent with a historical entity.
 */
export async function validateHistoricalCoordinate(
  entityName: string,
  candidateCoords: GeoCoordinates | null | undefined,
  context?: HistoricalValidationContext
): Promise<HistoricalCoordinateValidationResult> {
  const normEntity = (entityName || '').toLowerCase().trim().replace(/^the\s+/i, '');
  const candidateSource = context?.coordinateSource || candidateCoords?.source || 'ai';

  if (!candidateCoords || !isValidCoordinates(candidateCoords)) {
    return {
      valid: false,
      reason: 'INVALID_NUMERIC_COORDINATES',
      expectedRegion: context?.expectedRegion
    };
  }

  const { lat, lng } = candidateCoords;

  // 2. Reverse geocode candidate coordinates
  let revGeo: { country?: string; state?: string; county?: string; city?: string; displayName?: string } | null = null;
  try {
    revGeo = await reverseGeocode(lat, lng);
  } catch (err) {
    // Best effort
  }

  const revSummaryParts = [
    revGeo?.country,
    revGeo?.state,
    revGeo?.county || revGeo?.city
  ].filter(Boolean);
  const revSummary = revSummaryParts.length > 0 ? revSummaryParts.join(' / ') : (revGeo?.displayName || 'Water / Open Area');

  const isMaritimeEntity = isMaritimeHistoricalEntity({
    entityName,
    entityType: context?.entityType,
    candidateEntityType: context?.candidateEntityType,
    intent: context?.intent,
    rawQuery: context?.rawQuery
  });

  // 3. Match against known historical knowledge base
  const kbEntry = HISTORICAL_KNOWLEDGE_BASE[normEntity] || HISTORICAL_KNOWLEDGE_BASE[entityName.toLowerCase().trim()];
  if (kbEntry) {
    // Check bounding box if defined
    if (kbEntry.boundingBox) {
      const { minLat, maxLat, minLng, maxLng } = kbEntry.boundingBox;
      const inBox = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      if (!inBox) {
        const res: HistoricalCoordinateValidationResult = {
          valid: false,
          reason: 'GEOGRAPHIC_MISMATCH',
          expectedRegion: kbEntry.expectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, isMaritimeEntity, 'knowledge_base_bounding_box_mismatch', context?.entityType);
        return res;
      }
    }

    // Check forbidden regions from reverse geocode
    if (kbEntry.forbiddenRegions && revGeo) {
      const fullRevStr = `${revGeo.country || ''} ${revGeo.state || ''} ${revGeo.county || ''} ${revGeo.displayName || ''}`.toLowerCase();
      for (const forbidden of kbEntry.forbiddenRegions) {
        if (fullRevStr.includes(forbidden.toLowerCase())) {
          const res: HistoricalCoordinateValidationResult = {
            valid: false,
            reason: 'GEOGRAPHIC_MISMATCH',
            expectedRegion: kbEntry.expectedRegion,
            reverseGeocodeSummary: revSummary
          };
          logValidation(entityName, candidateCoords, candidateSource, revSummary, res, isMaritimeEntity, 'forbidden_region_conflict', context?.entityType);
          return res;
        }
      }
    }

    // Check allowed countries if specified and in reverse geocoding
    if (kbEntry.allowedCountries.length > 0 && revGeo?.country) {
      const countryMatches = kbEntry.allowedCountries.some(c => 
        revGeo!.country!.toLowerCase().includes(c.toLowerCase()) || 
        c.toLowerCase().includes(revGeo!.country!.toLowerCase())
      );
      if (!countryMatches) {
        const res: HistoricalCoordinateValidationResult = {
          valid: false,
          reason: 'GEOGRAPHIC_MISMATCH',
          expectedRegion: kbEntry.expectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, isMaritimeEntity, 'country_mismatch', context?.entityType);
        return res;
      }
    }

    // If exact location is unconfirmed and source is AI, note uncertainty
    const res: HistoricalCoordinateValidationResult = {
      valid: true,
      reason: 'MATCHES_EXPECTED_HISTORICAL_REGION',
      expectedRegion: kbEntry.expectedRegion,
      reverseGeocodeSummary: revSummary,
      isApproximate: !kbEntry.exactLocationConfirmed
    };
    logValidation(entityName, candidateCoords, candidateSource, revSummary, res, isMaritimeEntity, 'authoritative_knowledge_base_corroboration', context?.entityType);
    return res;
  }

  // 4. Maritime Entity Validation Path (for arbitrary shipwrecks not in the fixed KB)
  if (isMaritimeEntity) {
    const effectiveExpectedRegion = context?.expectedRegion || context?.locationDescription;

    if (effectiveExpectedRegion) {
      const expLower = effectiveExpectedRegion.toLowerCase();
      const revLower = revSummary.toLowerCase();

      // Check for direct contradiction (e.g. expected ocean, but coordinate landed inland in landlocked county)
      if ((expLower.includes('ocean') || expLower.includes('sea')) && revGeo?.county && !revLower.includes('coastal') && !revLower.includes('island') && !revLower.includes('water')) {
        const res: HistoricalCoordinateValidationResult = {
          valid: false,
          reason: 'GEOGRAPHIC_MISMATCH',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, 'inland_county_contradiction', context?.entityType);
        return res;
      }

      // Check A: Token match against reverse geocode (e.g. coastal state, nearby country, coastal island)
      const expTokens = expLower.split(/[\s,/–-]+/).filter(t => t.length >= 3);
      const revTokens = revLower.split(/[\s,/–-]+/).filter(t => t.length >= 3);
      const hasTokenMatch = expTokens.some(t => revTokens.includes(t));
      if (hasTokenMatch) {
        const res: HistoricalCoordinateValidationResult = {
          valid: true,
          reason: 'MARITIME_LOCATION_SUPPORTED',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, `token_corroboration (${revSummary})`, context?.entityType);
        return res;
      }

      // Check B: Match against major maritime regions bounding boxes
      let matchingMaritimeRegion: MaritimeRegionBounds | undefined;
      let contradictedMaritimeRegion: MaritimeRegionBounds | undefined;

      for (const region of MAJOR_MARITIME_REGIONS) {
        const regionNameMatch = region.names.some(n => expLower.includes(n));
        if (regionNameMatch) {
          const inRegionBox = region.minLng <= region.maxLng
            ? (lat >= region.minLat && lat <= region.maxLat && lng >= region.minLng && lng <= region.maxLng)
            : (lat >= region.minLat && lat <= region.maxLat && (lng >= region.minLng || lng <= region.maxLng)); // crosses 180
          
          if (inRegionBox) {
            matchingMaritimeRegion = region;
            break;
          } else {
            contradictedMaritimeRegion = region;
          }
        }
      }

      if (matchingMaritimeRegion) {
        const res: HistoricalCoordinateValidationResult = {
          valid: true,
          reason: 'MARITIME_LOCATION_SUPPORTED',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, `regional_maritime_bounds (${matchingMaritimeRegion.description || matchingMaritimeRegion.names[0]})`, context?.entityType);
        return res;
      }

      if (contradictedMaritimeRegion) {
        const res: HistoricalCoordinateValidationResult = {
          valid: false,
          reason: 'GEOGRAPHIC_MISMATCH',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, `geographic_mismatch_with_expected_basin (${contradictedMaritimeRegion.description || contradictedMaritimeRegion.names[0]})`, context?.entityType);
        return res;
      }

      // If candidate is in water and source is authoritative deterministic/geocoder
      if (candidateSource === 'deterministic' || candidateSource === 'geocoder') {
        const res: HistoricalCoordinateValidationResult = {
          valid: true,
          reason: 'AUTHORITATIVE_PROVIDER_COORDINATE',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, 'authoritative_provider_water_coordinate', context?.entityType);
        return res;
      }

      // Uncorroborated AI recovery in arbitrary ocean
      const res: HistoricalCoordinateValidationResult = {
        valid: false,
        reason: 'INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE',
        expectedRegion: effectiveExpectedRegion,
        reverseGeocodeSummary: revSummary
      };
      logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, 'insufficient_evidence', context?.entityType);
      return res;
    }

    // No expected region provided
    if (candidateSource === 'deterministic' || candidateSource === 'geocoder') {
      const res: HistoricalCoordinateValidationResult = {
        valid: true,
        reason: 'AUTHORITATIVE_PROVIDER_COORDINATE',
        expectedRegion: undefined,
        reverseGeocodeSummary: revSummary
      };
      logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, 'authoritative_provider', context?.entityType);
      return res;
    }

    const res: HistoricalCoordinateValidationResult = {
      valid: false,
      reason: 'INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE',
      expectedRegion: undefined,
      reverseGeocodeSummary: revSummary
    };
    logValidation(entityName, candidateCoords, candidateSource, revSummary, res, true, 'insufficient_evidence_no_expected_region', context?.entityType);
    return res;
  }

  // 5. Terrestrial Historical Entities Validation Path
  const isHistoricalQuery = 
    context?.intent === 'DISCOVERY_OBJECT_LOCATION' || 
    context?.intent === 'HISTORICAL_EVENT' ||
    context?.entityType === 'historical_site' ||
    context?.entityType === 'archaeological_site';

  if (isHistoricalQuery) {
    const effectiveExpectedRegion = context?.expectedRegion;

    if (effectiveExpectedRegion) {
      const expLower = effectiveExpectedRegion.toLowerCase();
      const revLower = revSummary.toLowerCase();

      // Check for direct contradiction between expected region and reverse geocode
      if ((expLower.includes('ocean') || expLower.includes('sea')) && revGeo?.county) {
        if (!revLower.includes('coastal') && !revLower.includes('island')) {
          const res: HistoricalCoordinateValidationResult = {
            valid: false,
            reason: 'GEOGRAPHIC_MISMATCH',
            expectedRegion: effectiveExpectedRegion,
            reverseGeocodeSummary: revSummary
          };
          logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, 'county_contradiction', context?.entityType);
          return res;
        }
      }

      // Positive geographic evidence: expected region matches reverse geocode
      const expTokens = expLower.split(/[\s,/–-]+/).filter(t => t.length >= 3);
      const revTokens = revLower.split(/[\s,/–-]+/).filter(t => t.length >= 3);
      const matchesExpectedRegion = expTokens.some(t => revTokens.includes(t));
      if (matchesExpectedRegion) {
        const res: HistoricalCoordinateValidationResult = {
          valid: true,
          reason: 'MATCHES_EXPECTED_HISTORICAL_REGION',
          expectedRegion: effectiveExpectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, `token_match (${revSummary})`, context?.entityType);
        return res;
      }
    }

    if (candidateSource === 'deterministic' || candidateSource === 'geocoder') {
      const res: HistoricalCoordinateValidationResult = {
        valid: true,
        reason: 'AUTHORITATIVE_PROVIDER_COORDINATE',
        expectedRegion: context?.expectedRegion,
        reverseGeocodeSummary: revSummary
      };
      logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, 'authoritative_provider', context?.entityType);
      return res;
    }

    // AI-recovered coordinates for historical entities cannot be accepted on NO_CONTRADICTION alone
    if (candidateSource === 'ai_recovery' || candidateSource === 'ai') {
      const res: HistoricalCoordinateValidationResult = {
        valid: false,
        reason: 'INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE',
        expectedRegion: context?.expectedRegion,
        reverseGeocodeSummary: revSummary
      };
      logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, 'insufficient_evidence', context?.entityType);
      return res;
    }
  }

  // AI-recovered coordinates in open water for non-maritime entities must be rejected
  const isWaterLocation = revSummary.includes('Water') || revSummary.includes('Open Area') || revSummary.includes('Ocean') || revSummary.includes('Sea');
  if (isWaterLocation && !isMaritimeEntity && (candidateSource === 'ai_recovery' || candidateSource === 'ai')) {
    const res: HistoricalCoordinateValidationResult = {
      valid: false,
      reason: 'INSUFFICIENT_HISTORICAL_GEOGRAPHIC_EVIDENCE',
      expectedRegion: context?.expectedRegion,
      reverseGeocodeSummary: revSummary
    };
    logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, 'land_entity_in_water', context?.entityType);
    return res;
  }

  const res: HistoricalCoordinateValidationResult = {
    valid: true,
    reason: 'NO_CONTRADICTION_DETECTED',
    expectedRegion: context?.expectedRegion,
    reverseGeocodeSummary: revSummary
  };
  logValidation(entityName, candidateCoords, candidateSource, revSummary, res, false, 'no_contradiction', context?.entityType);
  return res;
}

function logValidation(
  entity: string,
  coords: GeoCoordinates | null | undefined,
  source: string,
  revSummary: string,
  result: HistoricalCoordinateValidationResult,
  isMaritimeEntity?: boolean,
  historicalEvidence?: string,
  entityType?: string
) {
  const coordStr = coords ? `${coords.lat},${coords.lng}` : 'None';
  const effectiveType = entityType || (isMaritimeEntity ? 'shipwreck_site' : 'unknown');
  console.log(`[HISTORICAL COORDINATE VALIDATION]
entity: ${entity}
entityType: ${effectiveType}
maritimeEntity: ${isMaritimeEntity ?? false}
candidate: ${coordStr}
candidateSource: ${source}
reverseGeocode: ${revSummary}
waterExpected: ${isMaritimeEntity ?? false}
historicalEvidence: ${historicalEvidence || (result.valid ? 'corroborated' : 'insufficient')}
expectedRegion: ${result.expectedRegion || 'Unknown'}
result: ${result.valid ? 'ACCEPT' : 'REJECT'}
reason: ${result.reason}`);
}

export function getHistoricalEntityKnowledge(entityName: string): HistoricalEntityKnowledge | undefined {
  if (!entityName || typeof entityName !== 'string') return undefined;
  const normEntity = entityName.toLowerCase().trim().replace(/^the\s+/i, '');
  const trimmed = entityName.toLowerCase().trim();
  
  const directMatch = HISTORICAL_KNOWLEDGE_BASE[normEntity] || HISTORICAL_KNOWLEDGE_BASE[trimmed];
  if (directMatch) return directMatch;

  const strippedNorm = stripDiacritics(normEntity);
  const strippedTrimmed = stripDiacritics(trimmed);
  const strippedMatch = HISTORICAL_KNOWLEDGE_BASE[strippedNorm] || HISTORICAL_KNOWLEDGE_BASE[strippedTrimmed];
  if (strippedMatch) return strippedMatch;

  // Search by diacritic-equivalence
  for (const [key, val] of Object.entries(HISTORICAL_KNOWLEDGE_BASE)) {
    if (stripDiacritics(key) === strippedNorm || stripDiacritics(key) === strippedTrimmed) {
      return val;
    }
  }

  // Normalized discovery/maritime suffix stripping fallback (e.g. "Antikythera Wreck" -> "antikythera")
  const strippedSuffix = normEntity.replace(/\s+(?:shipwreck|wreck|wreck\s+site|shipwreck\s+site|site|ruins|monument|cemetery|battlefield|battle)$/i, '').trim();
  if (strippedSuffix && strippedSuffix !== normEntity) {
    const suffixMatch = HISTORICAL_KNOWLEDGE_BASE[strippedSuffix] || HISTORICAL_KNOWLEDGE_BASE[stripDiacritics(strippedSuffix)];
    if (suffixMatch) return suffixMatch;
  }

  // Normalized discovery/maritime prefix stripping fallback (e.g. "Wreck of the Antikythera" -> "antikythera")
  const strippedPrefix = normEntity.replace(/^(?:wreck\s+of(?:\s+the)?|shipwreck\s+of(?:\s+the)?|ruins\s+of(?:\s+the)?|battle\s+of(?:\s+the)?|site\s+of(?:\s+the)?)\s+/i, '').trim();
  if (strippedPrefix && strippedPrefix !== normEntity) {
    const prefixMatch = HISTORICAL_KNOWLEDGE_BASE[strippedPrefix] || HISTORICAL_KNOWLEDGE_BASE[stripDiacritics(strippedPrefix)];
    if (prefixMatch) return prefixMatch;
  }

  return undefined;
}

const US_STATE_MAP: Record<string, string> = {
  'al': 'Alabama', 'alabama': 'Alabama',
  'ak': 'Alaska', 'alaska': 'Alaska',
  'az': 'Arizona', 'arizona': 'Arizona',
  'ar': 'Arkansas', 'arkansas': 'Arkansas',
  'ca': 'California', 'california': 'California',
  'co': 'Colorado', 'colorado': 'Colorado',
  'ct': 'Connecticut', 'connecticut': 'Connecticut',
  'de': 'Delaware', 'delaware': 'Delaware',
  'fl': 'Florida', 'florida': 'Florida',
  'ga': 'Georgia', 'georgia': 'Georgia',
  'hi': 'Hawaii', 'hawaii': 'Hawaii',
  'id': 'Idaho', 'idaho': 'Idaho',
  'il': 'Illinois', 'illinois': 'Illinois',
  'in': 'Indiana', 'indiana': 'Indiana',
  'ia': 'Iowa', 'iowa': 'Iowa',
  'ks': 'Kansas', 'kansas': 'Kansas',
  'ky': 'Kentucky', 'kentucky': 'Kentucky',
  'la': 'Louisiana', 'louisiana': 'Louisiana',
  'me': 'Maine', 'maine': 'Maine',
  'md': 'Maryland', 'maryland': 'Maryland',
  'ma': 'Massachusetts', 'massachusetts': 'Massachusetts',
  'mi': 'Michigan', 'michigan': 'Michigan',
  'mn': 'Minnesota', 'minnesota': 'Minnesota',
  'ms': 'Mississippi', 'mississippi': 'Mississippi',
  'mo': 'Missouri', 'missouri': 'Missouri',
  'mt': 'Montana', 'montana': 'Montana',
  'ne': 'Nebraska', 'nebraska': 'Nebraska',
  'nv': 'Nevada', 'nevada': 'Nevada',
  'nh': 'New Hampshire', 'new hampshire': 'New Hampshire',
  'nj': 'New Jersey', 'new jersey': 'New Jersey',
  'nm': 'New Mexico', 'new mexico': 'New Mexico',
  'ny': 'New York', 'new york': 'New York',
  'nc': 'North Carolina', 'north carolina': 'North Carolina',
  'nd': 'North Dakota', 'north dakota': 'North Dakota',
  'oh': 'Ohio', 'ohio': 'Ohio',
  'ok': 'Oklahoma', 'oklahoma': 'Oklahoma',
  'or': 'Oregon', 'oregon': 'Oregon',
  'pa': 'Pennsylvania', 'pennsylvania': 'Pennsylvania',
  'ri': 'Rhode Island', 'rhode island': 'Rhode Island',
  'sc': 'South Carolina', 'south carolina': 'South Carolina',
  'sd': 'South Dakota', 'south dakota': 'South Dakota',
  'tn': 'Tennessee', 'tennessee': 'Tennessee',
  'tx': 'Texas', 'texas': 'Texas',
  'ut': 'Utah', 'utah': 'Utah',
  'vt': 'Vermont', 'vermont': 'Vermont',
  'va': 'Virginia', 'virginia': 'Virginia',
  'wa': 'Washington', 'washington': 'Washington',
  'wv': 'West Virginia', 'west virginia': 'West Virginia',
  'wi': 'Wisconsin', 'wisconsin': 'Wisconsin',
  'wy': 'Wyoming', 'wyoming': 'Wyoming',
  'dc': 'District of Columbia', 'district of columbia': 'District of Columbia'
};

export function toCanonicalTitleCase(str: string): string {
  if (!str) return '';
  const raw = str.trim();

  // Helper to title-case words without lowercasing already capitalized acronyms/Roman numerals (like II, III, DFW)
  // Also preserves standard English possessive/contraction casing (e.g., Anne's, not Anne'S).
  const isInputAllUpper = raw === raw.toUpperCase();
  const formatWord = (w: string) => {
    if (!w) return '';
    // If word is Roman numeral or standard initialism / naval prefix, preserve uppercase
    if (/^(?:II|III|IV|VI|VII|VIII|IX|X|USA|UK|DFW|SS|USS|HMS|RMS|NASA|UNESCO|JPL|MV|HMAS|USNS|CSS|IJN|SMS|RV|SV|MS|TSS|PS)$/i.test(w)) {
      return w.toUpperCase();
    }
    // If word is already all-caps (acronym / initialism) and length >= 2 in a mixed-case input, preserve
    if (!isInputAllUpper && w.length >= 2 && /^[A-Z0-9]+$/.test(w)) {
      return w;
    }
    // Handle words with apostrophes like Anne's or King's or O'Connor
    const formatted = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    // Correct possessives / contractions like Anne'S -> Anne's or King'S -> King's
    return formatted.replace(/([a-zA-Z])'([a-zA-Z]+)/g, (_, before, after) => {
      return `${before}'${after.toLowerCase()}`;
    });
  };

  const titleCasePhrase = (phrase: string) => {
    return phrase.split(/\s+/).map(formatWord).join(' ');
  };

  // Handle comma-separated city, state/country (e.g. "Dallas, Texas", "dallas, texas", "DALLAS, TX")
  const commaMatch = raw.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    const city = titleCasePhrase(commaMatch[1].trim());
    const stateCandidate = commaMatch[2].trim().toLowerCase();
    const resolvedState = US_STATE_MAP[stateCandidate] || titleCasePhrase(commaMatch[2].trim());
    return `${city}, ${resolvedState}`;
  }

  // Handle space-separated city and state abbreviation (e.g. "dallas tx", "DALLAS TX")
  const spaceAbbrMatch = raw.match(/^(.+?)\s+([a-zA-Z]{2})$/);
  if (spaceAbbrMatch && US_STATE_MAP[spaceAbbrMatch[2].toLowerCase()]) {
    const prefix = spaceAbbrMatch[1].trim();
    if (!/^(?:SS|USS|HMS|RMS|MV|HMAS|USNS|CSS|IJN|SMS|RV|SV|MS|TSS|PS)$/i.test(prefix)) {
      const city = titleCasePhrase(prefix);
      const state = US_STATE_MAP[spaceAbbrMatch[2].toLowerCase()];
      return `${city}, ${state}`;
    }
  }

  // Handle space-separated city and full state name (e.g. "dallas texas", "DALLAS TEXAS", "Dallas Texas")
  for (const [stAbbr, stName] of Object.entries(US_STATE_MAP)) {
    const regex = new RegExp(`^(.+?)\\s+${stName}$`, 'i');
    const match = raw.match(regex);
    if (match) {
      const prefix = match[1].trim();
      if (!/^(?:SS|USS|HMS|RMS|MV|HMAS|USNS|CSS|IJN|SMS|RV|SV|MS|TSS|PS)$/i.test(prefix)) {
        const city = titleCasePhrase(prefix);
        return `${city}, ${stName}`;
      }
    }
  }

  return titleCasePhrase(raw);
}
