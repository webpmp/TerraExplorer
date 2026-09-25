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

/**
 * Normalizes written calendar dates (e.g. "December 5, 1914", "June 28, 1914", "January 1")
 * into spoken words (e.g. "December fifth, nineteen fourteen", "June twenty-eighth, nineteen fourteen", "January first").
 * 
 * Conservative: Only matches recognized Month + Day (+ Year) patterns.
 */
function normalizeDates(text: string): string {
  // 1. Match Month Day, Year
  let result = text.replace(DATE_WITH_YEAR_REGEX, (_match, monthStr, dayStr, yearStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const dayNum = parseInt(dayStr, 10);
    const dayOrdinal = DAY_ORDINALS[dayNum] || dayStr;
    const yearSpeech = formatYearToSpeech(yearStr);
    return `${canonicalMonth} ${dayOrdinal}, ${yearSpeech}`;
  });

  // 2. Match standalone Month Day
  result = result.replace(DATE_WITHOUT_YEAR_REGEX, (_match, monthStr, dayStr) => {
    const canonicalMonth = MONTH_NAMES[monthStr.toLowerCase()] || monthStr;
    const dayNum = parseInt(dayStr, 10);
    const dayOrdinal = DAY_ORDINALS[dayNum] || dayStr;
    return `${canonicalMonth} ${dayOrdinal}`;
  });

  return result;
}

/**
 * Normalizes narration text immediately before speech synthesis.
 * Improves spoken pronunciation of historical terms and calendar dates.
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

  return normalized;
}
