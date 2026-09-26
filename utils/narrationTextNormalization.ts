/**
 * Narration-only text normalization utility for pronunciation optimization in TTS.
 * 
 * Performs deterministic, synchronous, side-effect free transformations on text
 * specifically before sending to speech synthesis providers (System Voice, Kokoro, Orpheus).
 * 
 * Preserves the original input and UI/application state.
 */

const DAY_ORDINALS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
  13: 'thirteenth',
  14: 'fourteenth',
  15: 'fifteenth',
  16: 'sixteenth',
  17: 'seventeenth',
  18: 'eighteenth',
  19: 'nineteenth',
  20: 'twentieth',
  21: 'twenty-first',
  22: 'twenty-second',
  23: 'twenty-third',
  24: 'twenty-fourth',
  25: 'twenty-fifth',
  26: 'twenty-sixth',
  27: 'twenty-seventh',
  28: 'twenty-eighth',
  29: 'twenty-ninth',
  30: 'thirtieth',
  31: 'thirty-first'
};

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen'
];

const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
];

const MONTH_NAMES: Record<string, string> = {
  january: 'January',
  jan: 'January',
  february: 'February',
  feb: 'February',
  march: 'March',
  mar: 'March',
  april: 'April',
  apr: 'April',
  may: 'May',
  june: 'June',
  jun: 'June',
  july: 'July',
  jul: 'July',
  august: 'August',
  aug: 'August',
  september: 'September',
  sep: 'September',
  sept: 'September',
  october: 'October',
  oct: 'October',
  november: 'November',
  nov: 'November',
  december: 'December',
  dec: 'December'
};

/**
 * Converts a number from 0 to 99 into English words.
 */
export function formatNumber0to99(n: number): string {
  if (n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

/**
 * Converts a calendar year (e.g. 1914, 1865, 2024, 1066) into natural spoken English words.
 */
export function formatYearToSpeech(yearInput: string | number): string {
  const year = typeof yearInput === 'number' ? yearInput : parseInt(yearInput, 10);
  if (isNaN(year) || year < 0 || year > 9999) {
    return String(yearInput);
  }

  // 4-digit years (1000 - 9999)
  if (year >= 1000 && year <= 9999) {
    // Exact thousands: 1000, 2000, 3000...
    if (year % 1000 === 0) {
      return `${formatNumber0to99(Math.floor(year / 1000))} thousand`;
    }

    // 2001 - 2009: "two thousand one" .. "two thousand nine"
    if (year >= 2001 && year <= 2009) {
      return `two thousand ${formatNumber0to99(year % 100)}`;
    }

    const century = Math.floor(year / 100);
    const remainder = year % 100;
    const centuryWords = formatNumber0to99(century);

    // 1800 - 1899: "eighteen hundred forty-five" or "eighteen hundred"
    if (century === 18) {
      if (remainder === 0) {
        return 'eighteen hundred';
      }
      return `eighteen hundred ${formatNumber0to99(remainder)}`;
    }

    if (remainder === 0) {
      return `${centuryWords} hundred`;
    }
    if (remainder < 10) {
      return `${centuryWords} oh ${formatNumber0to99(remainder)}`;
    }
    return `${centuryWords} ${formatNumber0to99(remainder)}`;
  }

  // 3-digit years (100 - 999)
  if (year >= 100 && year <= 999) {
    const hundreds = Math.floor(year / 100);
    const remainder = year % 100;
    const hundredsWords = formatNumber0to99(hundreds);

    if (remainder === 0) {
      return `${hundredsWords} hundred`;
    }
    if (remainder < 10) {
      return `${hundredsWords} oh ${formatNumber0to99(remainder)}`;
    }
    return `${hundredsWords} ${formatNumber0to99(remainder)}`;
  }

  // 1-99
  if (year >= 1 && year <= 99) {
    return formatNumber0to99(year);
  }

  return String(year);
}

/**
 * Normalizes specific historical phrases:
 * - "World War I" -> "World War One"
 * - "World War II" -> "World War Two"
 * 
 * Conservative: Does not globally rewrite arbitrary Roman numerals.
 */
function normalizeWorldWar(text: string): string {
  // Replace World War II first to prevent partial collision with World War I
  let result = text.replace(/\bWorld\s+War\s+II\b/gi, (match) => {
    if (match === match.toUpperCase()) return 'WORLD WAR TWO';
    if (match[0] === match[0].toLowerCase()) return 'world war Two';
    return 'World War Two';
  });

  result = result.replace(/\bWorld\s+War\s+I\b/gi, (match) => {
    if (match === match.toUpperCase()) return 'WORLD WAR ONE';
    if (match[0] === match[0].toLowerCase()) return 'world war One';
    return 'World War One';
  });

  return result;
}

const MONTHS_PATTERN = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';

const DATE_WITH_YEAR_REGEX = new RegExp(
  `\\b(${MONTHS_PATTERN})\\.?\\s+([12][0-9]|3[01]|0?[1-9])(?:st|nd|rd|th)?(?:,\\s*|\\s+)(\\d{1,4})\\b`,
  'gi'
);

const DATE_WITHOUT_YEAR_REGEX = new RegExp(
  `\\b(${MONTHS_PATTERN})\\.?\\s+([12][0-9]|3[01]|0?[1-9])(?:st|nd|rd|th)?\\b`,
  'gi'
);

const MONTH_DAY_RANGE_WITH_YEAR_REGEX = new RegExp(
  `\\b(${MONTHS_PATTERN})\\.?\\s+([12][0-9]|3[01]|0?[1-9])(?:st|nd|rd|th)?\\s*(?:–|-|to)\\s*([12][0-9]|3[01]|0?[1-9])(?:st|nd|rd|th)?(?:,\\s*|\\s+)(\\d{1,4})\\b`,
  'gi'
);

const MONTH_YEAR_REGEX = new RegExp(
  `\\b(${MONTHS_PATTERN})\\.?\\s+(\\d{3,4})\\b`,
  'gi'
);

const SEASONS_PATTERN = 'Winter|Spring|Summer|Autumn|Fall|Late\\s+Winter|Early\\s+Winter|Late\\s+Spring|Early\\s+Spring|Late\\s+Summer|Early\\s+Summer|Late\\s+Autumn|Early\\s+Autumn|Late\\s+Fall|Early\\s+Fall|Mid-Winter|Mid-Summer';

/**
 * Normalizes written calendar dates into spoken words.
 */
function normalizeDates(text: string): string {
  // 1. Match Month Day-Day, Year (e.g. "May 16-21, 1804")
  let result = text.replace(MONTH_DAY_RANGE_WITH_YEAR_REGEX, (_match, monthStr, day1Str, day2Str, yearStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const day1Num = parseInt(day1Str, 10);
    const day2Num = parseInt(day2Str, 10);
    const day1Ordinal = DAY_ORDINALS[day1Num] || day1Str;
    const day2Ordinal = DAY_ORDINALS[day2Num] || day2Str;
    const yearSpeech = formatYearToSpeech(yearStr);
    return `${canonicalMonth} ${day1Ordinal} to ${day2Ordinal}, ${yearSpeech}`;
  });

  // 2. Match Month Day, Year
  result = result.replace(DATE_WITH_YEAR_REGEX, (_match, monthStr, dayStr, yearStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const dayNum = parseInt(dayStr, 10);
    const dayOrdinal = DAY_ORDINALS[dayNum] || dayStr;
    const yearSpeech = formatYearToSpeech(yearStr);
    return `${canonicalMonth} ${dayOrdinal}, ${yearSpeech}`;
  });

  // 3. Match standalone Month Day
  result = result.replace(DATE_WITHOUT_YEAR_REGEX, (_match, monthStr, dayStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const dayNum = parseInt(dayStr, 10);
    const dayOrdinal = DAY_ORDINALS[dayNum] || dayStr;
    return `${canonicalMonth} ${dayOrdinal}`;
  });

  // 4. Match Month Year (e.g. "July 1845", "April 1916")
  result = result.replace(MONTH_YEAR_REGEX, (_match, monthStr, yearStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const yearSpeech = formatYearToSpeech(yearStr);
    return `${canonicalMonth} ${yearSpeech}`;
  });

  return result;
}

/**
 * Normalizes year ranges (e.g. "1845–1846", "1845-1846", "1845–46", "1845-48", "1804-1805").
 */
function normalizeYearRanges(text: string): string {
  // Full 4-digit to 4-digit or 3-digit to 3-digit ranges: 1845–1846, 1845-1846, 1200–1205
  let result = text.replace(/\b([12][0-9]{3}|[1-9][0-9]{2})\s*(?:–|-)\s*([12][0-9]{3}|[1-9][0-9]{2})\b/g, (_match, startYear, endYear) => {
    return `${formatYearToSpeech(startYear)} to ${formatYearToSpeech(endYear)}`;
  });

  // 4-digit to 2-digit abbreviated ranges: 1845–46, 1845-48, 1914–18
  result = result.replace(/\b([12][0-9]{3})\s*(?:–|-)\s*([0-9]{2})\b/g, (_match, startYearStr, endAbbrStr) => {
    const startYear = parseInt(startYearStr, 10);
    const century = Math.floor(startYear / 100);
    const endRemainder = parseInt(endAbbrStr, 10);
    const endYear = century * 100 + endRemainder;
    return `${formatYearToSpeech(startYear)} to ${formatYearToSpeech(endYear)}`;
  });

  return result;
}

/**
 * Normalizes standalone historical year contexts without converting general numerical measurements:
 * - Season + Year (e.g. "Winter 1845-1846", "Summer 1846")
 * - Leading timestamp / timeline entry (e.g. "1846: The ships...")
 * - Historical prepositions (e.g. "in 1845", "during 1846", "by 1914", "since 1845", "around 1206", "between 1845 and 1848", "discovered in 2014", "resting place ... discovered in 2016")
 * 
 * Excludes units and measurements (meters, km, miles, kg, feet, passengers, people, men, items, etc.).
 */
function normalizeHistoricalYears(text: string): string {
  // 1. Season + Year (e.g. "Winter 1845", "Summer 1846", "Late Winter 1845")
  const seasonYearRegex = new RegExp(`\\b(${SEASONS_PATTERN})\\s+([12][0-9]{3}|[1-9][0-9]{2})\\b`, 'gi');
  let result = text.replace(seasonYearRegex, (_match, season, yearStr) => {
    return `${season} ${formatYearToSpeech(yearStr)}`;
  });

  // 2. Leading year with colon at start of sentence/string/clause (e.g. "1846: The ships...", "May 19, 1845: The...", "1206: Temüjin...")
  // Note: if preceded by date, date normalizer already handled year, colon is preserved
  result = result.replace(/(?:^|(?<=[.!?\n]\s*))\b([12][0-9]{3}|[1-9][0-9]{2})\s*:\s*/g, (_match, yearStr) => {
    return `${formatYearToSpeech(yearStr)}: `;
  });

  // 3. Preposition + Year (e.g. "in 1845", "during 1914", "by 1848", "since 1845", "around 1206", "until 1848", "from 1845", "circa 1845")
  // Negative lookahead ensures we don't match quantities followed by unit words: meters, km, feet, miles, etc.
  result = result.replace(/\b(in|during|by|since|around|until|from|circa|c\.)\s+([12][0-9]{3}|[1-9][0-9]{2})\b(?!\s*(?:meters?|m\b|kilomet(?:er|re)s?|km\b|miles?|ft\b|feet|inches|in\b|yards?|yd\b|percent|%|hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|passengers?|people|men|crew|soldiers?|troops?|ships?|vessels?|guns?|cannons?|rounds?|tonnes?|tons?|pounds?|lbs?|kg\b|kilograms?|dollars?|\$|euros?|pounds?|gbp\b|usd\b))/gi, (_match, prep, yearStr) => {
    return `${prep} ${formatYearToSpeech(yearStr)}`;
  });

  // 4. "discovered in / founded in / built in / established in / died in / born in / abandoned in + Year"
  result = result.replace(/\b(discovered|founded|established|built|constructed|abandoned|sunk|sunken|launched|departed|arrived|died|born|signed|chartered|conquered|annexed)\s+in\s+([12][0-9]{3}|[1-9][0-9]{2})\b/gi, (_match, verb, yearStr) => {
    return `${verb} in ${formatYearToSpeech(yearStr)}`;
  });

  return result;
}

/**
 * Normalizes narration text immediately before speech synthesis.
 * Improves spoken pronunciation of historical terms, date ranges, and calendar dates.
 * 
 * Requirements:
 * - Deterministic, synchronous, side-effect free
 * - Preserves original input string
 * - Returns a new string for TTS
 */
export function normalizeNarrationText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = normalizeWorldWar(text);
  normalized = normalizeDates(normalized);
  normalized = normalizeYearRanges(normalized);
  normalized = normalizeHistoricalYears(normalized);

  return normalized;
}
