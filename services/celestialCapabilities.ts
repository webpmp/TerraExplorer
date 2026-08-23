export type CelestialBody =
  | 'earth'
  | 'moon'
  | 'mars'
  | 'venus'
  | 'mercury'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'titan'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'io'
  | 'enceladus'
  | 'other_celestial';

/**
 * Geographic platform capabilities registry.
 * Extensible for future multi-planetary support.
 */
export const geographicCapabilities: Record<CelestialBody, boolean> = {
  earth: true,
  moon: false,
  mars: false,
  venus: false,
  mercury: false,
  jupiter: false,
  saturn: false,
  uranus: false,
  neptune: false,
  pluto: false,
  titan: false,
  europa: false,
  ganymede: false,
  callisto: false,
  io: false,
  enceladus: false,
  other_celestial: false
};

export function isCelestialBodySupported(body: CelestialBody): boolean {
  return geographicCapabilities[body] === true;
}

export interface CelestialDetectionInput {
  name?: string | null;
  canonicalName?: string | null;
  historicalRegion?: string | null;
  modernLocation?: string | null;
  query?: string | null;
  description?: string | null;
  entity?: string | null;
}

// Earth locations that contain celestial-sounding keywords but are valid Earth locations
const KNOWN_EARTH_EXCEPTIONS = [
  /half\s+moon\s+bay/i,
  /moon\s+township/i,
  /craters\s+of\s+the\s+moon/i,
  /mars\s+hill/i,
  /mars\s*,\s*pa\b/i,
  /mars\s*,\s*pennsylvania/i,
  /luna\s+county/i,
  /isla\s+de\s+la\s+luna/i,
  /moon\s+river/i,
  /europa\s+point/i,
  /titan\s+missile/i,
];

/**
 * Deterministically determines the celestial body for a given geographic entity,
 * route waypoint, or query string.
 */
export function detectCelestialBody(input: CelestialDetectionInput | string | null | undefined): CelestialBody {
  if (!input) return 'earth';

  const normalized: CelestialDetectionInput = typeof input === 'string'
    ? { query: input, name: input }
    : input;

  const fields = [
    normalized.modernLocation || '',
    normalized.historicalRegion || '',
    normalized.canonicalName || '',
    normalized.name || '',
    normalized.query || '',
    normalized.entity || '',
    normalized.description || ''
  ];

  const fullText = fields.join(' | ').trim();
  if (!fullText) return 'earth';

  // Check known Earth exceptions first if explicit Earth administrative region is present
  const isEarthException = KNOWN_EARTH_EXCEPTIONS.some(pattern => pattern.test(fullText));
  const hasEarthAdministrativeContext = /\b(california|pennsylvania|idaho|north carolina|new mexico|bolivia|georgia|gibraltar|arizona|united states|usa|earth|uk|france|italy|spain|germany|japan|china|russia)\b/i.test(fullText);

  if (isEarthException && hasEarthAdministrativeContext) {
    return 'earth';
  }

  // 1. Explicit ModernLocation / HistoricalRegion checks
  const explicitRegion = `${normalized.historicalRegion || ''} ${normalized.modernLocation || ''}`.trim();
  if (/^\s*(?:the\s+)?moon\s*$/i.test(explicitRegion) || /,\s*moon\s*$/i.test(explicitRegion) || /\b(?:luna|lunar\s+surface)\b/i.test(explicitRegion)) {
    return 'moon';
  }
  if (/^\s*mars\s*$/i.test(explicitRegion) || /,\s*mars\s*$/i.test(explicitRegion) || /\b(?:martian\s+surface)\b/i.test(explicitRegion)) {
    return 'mars';
  }
  if (/^\s*venus\s*$/i.test(explicitRegion) || /,\s*venus\s*$/i.test(explicitRegion)) {
    return 'venus';
  }
  if (/^\s*mercury\s*$/i.test(explicitRegion) || /,\s*mercury\s*$/i.test(explicitRegion)) {
    return 'mercury';
  }
  if (/^\s*titan\s*$/i.test(explicitRegion) || /,\s*saturn\s*$/i.test(explicitRegion)) {
    return 'titan';
  }
  if (/^\s*europa\s*$/i.test(explicitRegion) || /,\s*jupiter\s*$/i.test(explicitRegion)) {
    return 'europa';
  }

  // 2. Specific Lunar Features & Events
  const moonPatterns = [
    /\bsea\s+of\s+tranquility\b/i,
    /\btranquility\s+base\b/i,
    /\bmare\s+(?:tranquillitatis|serenitatis|imbrium|crisium|nectaris|fecunditatis|nubium|humorum|cognitum|orientale|vaporum|frigoris|marginis|undarum|spumans|anguis|ingenii|muscoviense|moscoviense)\b/i,
    /\boceanus\s+procellarum\b/i,
    /\bsinus\s+(?:iridum|aestuum|medii|roris|amoris|concordiae|fidei|honoratum|luctus|successus)\b/i,
    /\blacus\s+(?:mortis|somniorum|timoris|felicitatis|bonitatis|doloris|gaudii|hiemalis|lenitatis|luxuriae|oblivionis|odio|perseverantiae|solitudinis|spei|veris)\b/i,
    /\b(?:fra\s+mauro|taurus-littrow|descartes\s+highlands|hadley\s+rille)\b/i,
    /\bapollo\s+11\s+(?:moon\s+landing|landing\s+site|lunar\s+landing|lunar\s+module|lunar\s+surface|moon)\b/i,
    /\bapollo\s+(?:12|14|15|16|17)\s+(?:moon\s+landing|landing\s+site|lunar\s+landing|lunar\s+module|lunar\s+surface|moon)\b/i,
    /\b(?:moon\s+landing|landing\s+on\s+the\s+moon|first\s+man\s+on\s+the\s+moon|walk\s+on\s+the\s+moon|on\s+the\s+moon)\b/i
  ];

  if (moonPatterns.some(p => p.test(fullText))) {
    return 'moon';
  }

  // 3. Specific Martian Features & Events
  const marsPatterns = [
    /\bolympus\s+mons\b/i,
    /\bvalles\s+marineris\b/i,
    /\b(?:gale|jezero|gusev)\s+crater\b/i,
    /\bmeridiani\s+planum\b/i,
    /\b(?:chryse|utopia|elysium)\s+planitia\b/i,
    /\b(?:tharsis|syrtis\s+major|cydonia|hellas\s+planitia)\b/i,
    /\bcuriosity\s+rover(?:\s+on\s+mars|\s+landing|\s+location)?\b/i,
    /\bperseverance\s+rover(?:\s+on\s+mars|\s+landing|\s+location)?\b/i,
    /\bopportunity\s+rover(?:\s+on\s+mars|\s+landing|\s+location)?\b/i,
    /\bspirit\s+rover(?:\s+on\s+mars|\s+landing|\s+location)?\b/i,
    /\bviking\s+(?:1|2)\s+(?:lander|landing|site)\b/i,
    /\bon\s+mars\b/i,
    /\bmars\s+rover\b/i,
    /\bmars\s+landing\b/i
  ];

  if (marsPatterns.some(p => p.test(fullText))) {
    return 'mars';
  }

  // 4. Specific Venusian Features
  const venusPatterns = [
    /\bishtar\s+terra\b/i,
    /\baphrodite\s+terra\b/i,
    /\bmaxwell\s+montes\b/i,
    /\bvenera\s+(?:\d+|landing|lander)\b/i,
    /\bon\s+venus\b/i,
    /\bplanet\s+venus\b/i
  ];

  if (venusPatterns.some(p => p.test(fullText))) {
    return 'venus';
  }

  // 5. Specific Mercurian Features
  const mercuryPatterns = [
    /\bcaloris\s+basin\b/i,
    /\bon\s+mercury\b/i,
    /\bplanet\s+mercury\b/i
  ];

  if (mercuryPatterns.some(p => p.test(fullText))) {
    return 'mercury';
  }

  // 6. Outer Moons (Titan, Europa, Ganymede, Callisto, Io, Enceladus)
  if (/\btitan\s*,\s*saturn\b/i.test(fullText) || /\bmoon\s+of\s+saturn\b/i.test(fullText) || (/\btitan\b/i.test(fullText) && /\b(saturn|kraken\s+mare|ligeia\s+mare|huygens\s+probe)\b/i.test(fullText))) {
    return 'titan';
  }

  if (/\beuropa\s*,\s*jupiter\b/i.test(fullText) || /\bmoon\s+of\s+jupiter\b/i.test(fullText) || (/\beuropa\b/i.test(fullText) && /\b(jupiter|jovian|ice\s+crust|subsurface\s+ocean)\b/i.test(fullText) && !/\beurope\b/i.test(fullText))) {
    return 'europa';
  }

  if (/\bganymede\b/i.test(fullText) && (/\b(jupiter|jovian|moon)\b/i.test(fullText) || !hasEarthAdministrativeContext)) {
    return 'ganymede';
  }

  if (/\bcallisto\b/i.test(fullText) && (/\b(jupiter|jovian|cratered\s+moon)\b/i.test(fullText) || !hasEarthAdministrativeContext)) {
    return 'callisto';
  }

  if (/\b(?:io|enceladus|triton|charon|phobos|deimos)\b/i.test(fullText) && /\b(jupiter|saturn|neptune|pluto|mars|moon|orbit|crater|geyser)\b/i.test(fullText)) {
    return 'other_celestial';
  }

  // 7. General outer planets / deep space
  if (/\b(?:planet\s+(?:jupiter|saturn|uranus|neptune|pluto)|exoplanet|asteroid\s+(?:belt|bennu|ryugu|ceres|vesta)|comet\s+(?:halley|67p|hale-bopp))\b/i.test(fullText)) {
    return 'other_celestial';
  }

  return 'earth';
}

/**
 * Validates that an entity, query, or waypoint is supported on Earth.
 */
export function validateEarthGeography(input: CelestialDetectionInput | string | null | undefined): {
  isValid: boolean;
  celestialBody: CelestialBody;
  error?: string;
} {
  const body = detectCelestialBody(input);
  const isSupported = isCelestialBodySupported(body);

  if (!isSupported) {
    return {
      isValid: false,
      celestialBody: body,
      error: `Unsupported celestial body '${body}'. TerraExplorer currently supports Earth geography only.`
    };
  }

  return {
    isValid: true,
    celestialBody: 'earth'
  };
}
