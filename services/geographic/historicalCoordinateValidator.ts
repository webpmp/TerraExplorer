import { GeoCoordinates, isValidCoordinates, CoordinateSource } from '../../types';
import { reverseGeocode } from './geographicResolver';

export interface HistoricalValidationContext {
  rawQuery?: string;
  intent?: string;
  entityType?: string;
  coordinateSource?: CoordinateSource;
  expectedRegion?: string;
}

export interface HistoricalCoordinateValidationResult {
  valid: boolean;
  reason: string;
  expectedRegion?: string;
  reverseGeocodeSummary?: string;
  isApproximate?: boolean;
}

export interface HistoricalEntityKnowledge {
  entity: string;
  entityType: string;
  expectedRegion: string;
  approximateRegion?: string;
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
  }
};

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

  // 1. Numeric coordinate sanity
  if (!candidateCoords || !isValidCoordinates(candidateCoords)) {
    const res: HistoricalCoordinateValidationResult = {
      valid: false,
      reason: 'INVALID_NUMERIC_COORDINATES',
      expectedRegion: context?.expectedRegion
    };
    logValidation(entityName, candidateCoords, candidateSource, 'None', res);
    return res;
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
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
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
          logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
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
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
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
    logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
    return res;
  }

  // 4. Heuristic validation for generic historical queries
  const isHistoricalQuery = 
    context?.intent === 'DISCOVERY_OBJECT_LOCATION' || 
    context?.intent === 'HISTORICAL_EVENT' ||
    context?.entityType === 'historical_site' ||
    context?.entityType === 'shipwreck' ||
    context?.entityType === 'archaeological_site';

  if (isHistoricalQuery && context?.expectedRegion) {
    const expLower = context.expectedRegion.toLowerCase();
    const revLower = revSummary.toLowerCase();

    // Check for direct contradiction between expected region and reverse geocode
    if ((expLower.includes('ocean') || expLower.includes('sea')) && revGeo?.county) {
      // Expected ocean, but landed in a specific inland county
      if (!revLower.includes('coastal') && !revLower.includes('island')) {
        const res: HistoricalCoordinateValidationResult = {
          valid: false,
          reason: 'GEOGRAPHIC_MISMATCH',
          expectedRegion: context.expectedRegion,
          reverseGeocodeSummary: revSummary
        };
        logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
        return res;
      }
    }
  }

  const res: HistoricalCoordinateValidationResult = {
    valid: true,
    reason: 'NO_CONTRADICTION_DETECTED',
    expectedRegion: context?.expectedRegion,
    reverseGeocodeSummary: revSummary
  };
  logValidation(entityName, candidateCoords, candidateSource, revSummary, res);
  return res;
}

function logValidation(
  entity: string,
  coords: GeoCoordinates | null | undefined,
  source: string,
  revSummary: string,
  result: HistoricalCoordinateValidationResult
) {
  const coordStr = coords ? `${coords.lat},${coords.lng}` : 'None';
  console.log(`[HISTORICAL COORDINATE VALIDATION]
entity: ${entity}
candidate: ${coordStr}
candidateSource: ${source}
reverseGeocode: ${revSummary}
expectedRegion: ${result.expectedRegion || 'Unknown'}
result: ${result.valid ? 'ACCEPT' : 'REJECT'}
reason: ${result.reason}`);
}

export function getHistoricalEntityKnowledge(entityName: string): HistoricalEntityKnowledge | undefined {
  const normEntity = (entityName || '').toLowerCase().trim().replace(/^the\s+/i, '');
  return HISTORICAL_KNOWLEDGE_BASE[normEntity] || HISTORICAL_KNOWLEDGE_BASE[entityName.toLowerCase().trim()];
}

export function toCanonicalTitleCase(str: string): string {
  if (!str) return '';
  const hist = getHistoricalEntityKnowledge(str);
  if (hist?.entity) return hist.entity;
  return str
    .replace(/\b([a-z])/g, (_, l) => l.toUpperCase())
    .trim();
}
