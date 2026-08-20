/**
 * English Display Name Normalization Layer
 * Resolves authoritative English display names for geographic entities while preserving
 * canonical local-language names in candidate metadata for backend and search operations.
 */

// Common geographic mappings for non-Latin script entities
const KNOWN_ENGLISH_NAMES: Record<string, string> = {
    // Pakistan & South Asia
    'سبی': 'Sibi',
    'کوئٹہ': 'Quetta',
    'پشاور': 'Peshawar',
    'لاہور': 'Lahore',
    'کراچی': 'Karachi',
    'اسلام آباد': 'Islamabad',
    'راولپنڈی': 'Rawalpindi',
    'ملتان': 'Multan',
    'فیصل آباد': 'Faisalabad',
    'حیدرآباد': 'Hyderabad',
    'سکھر': 'Sukkur',
    'گوادر': 'Gwadar',
    'ژوب': 'Zhob',
    'خضدار': 'Khuzdar',
    'تربت': 'Turbat',
    'ڈیرہ غازی خان': 'Dera Ghazi Khan',
    'ڈیرہ اسماعیل خان': 'Dera Ismail Khan',
    'بہاولپور': 'Bahawalpur',
    'سرگودھا': 'Sargodha',
    'سیالکوٹ': 'Sialkot',
    'گوجرانوالہ': 'Gujranwala',
    'مظفر آباد': 'Muzaffarabad',
    'گلگت': 'Gilgit',
    'سکردو': 'Skardu',

    // Afghanistan & Central Asia
    'کابل': 'Kabul',
    'قندھار': 'Kandahar',
    'ہرات': 'Herat',
    'مزار شریف': 'Mazar-i-Sharif',
    'جلال آباد': 'Jalalabad',
    'بلخ': 'Balkh',
    'دوشنبه': 'Dushanbe',
    'سمرقند': 'Samarkand',
    'بخارا': 'Bukhara',
    'تاشکند': 'Tashkent',

    // Iran / Persian Gulf / Middle East
    'میناب': 'Minab',
    'بندرعباس': 'Bandar Abbas',
    'بندر عباس': 'Bandar Abbas',
    'هرمز': 'Hormuz',
    'تنگه هرمز': 'Strait of Hormuz',
    'قشم': 'Qeshm',
    'سیریک': 'Sirik',
    'سرزه': 'Sarzeh',
    'جاسک': 'Jask',
    'رودان': 'Rudan',
    'بندر لنگه': 'Bandar Lengeh',
    'کیش': 'Kish',
    'چابهار': 'Chabahar',
    'تهران': 'Tehran',
    'شیراز': 'Shiraz',
    'اصفهان': 'Isfahan',
    'تبریز': 'Tabriz',
    'مشهد': 'Mashhad',

    // Yemen / Red Sea
    'لحج': 'Lahij',
    'عدن': 'Aden',
    'صنعاء': 'Sanaa',
    'تعز': 'Taiz',
    'الحديدة': 'Al Hudaydah',
    'إب': 'Ibb',
    'ذمار': 'Dhamar',
    'المكلا': 'Mukalla',
    'سيئون': 'Sayyan',
    'مأرب': 'Marib',
    'حجة': 'Hajjah',
    'سقطرى': 'Socotra',
    'باب المندب': 'Bab-el-Mandeb',

    // Arabia / Gulf
    'دبي': 'Dubai',
    'أبو ظبي': 'Abu Dhabi',
    'الدوحة': 'Doha',
    'مسقط': 'Muscat',
    'الرياض': 'Riyadh',
    'جدة': 'Jeddah',
    'مكة': 'Mecca',
    'المدينة المنورة': 'Medina',
    'المنامة': 'Manama',
    'الكويت': 'Kuwait City',

    // Levant & North Africa
    'القاهرة': 'Cairo',
    'الإسكندرية': 'Alexandria',
    'بغداد': 'Baghdad',
    'البصرة': 'Basra',
    'الموصل': 'Mosul',
    'دمشق': 'Damascus',
    'حلب': 'Aleppo',
    'بيروت': 'Beirut',
    'طرابلس': 'Tripoli',
    'عمان': 'Amman',
    'القدس': 'Jerusalem',
    'الخرطوم': 'Khartoum',
    'الرباط': 'Rabat',
    'الدار البيضاء': 'Casablanca',
    'تونس': 'Tunis',
    'الجزائر': 'Algiers'
};

const ARABIC_PERSIAN_CHAR_MAP: Record<string, string> = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ء': "'",
    'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 'th',
    'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'ژ': 'zh',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
    'ط': 't', 'ظ': 'z', 'ع': "'", 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ک': 'k', 'ك': 'k', 'گ': 'g',
    'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'w', 'ه': 'h', 'ی': 'y', 'ي': 'y', 'ة': 'ah'
};

const CYRILLIC_CHAR_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

export function containsNonLatinScript(text: string): boolean {
    if (!text) return false;
    // Checks for Arabic/Persian, Cyrillic, Greek, Hebrew, CJK, Hangul, Devanagari, Thai
    return /[\u0600-\u06FF\u0750-\u077F\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0900-\u097F\u0E00-\u0E7F]/.test(text);
}

export function transliterateToLatin(text: string): string {
    if (!text) return '';
    let result = '';
    const lower = text.toLowerCase();

    for (let i = 0; i < lower.length; i++) {
        const char = lower[i];
        if (char === 'ی' || char === 'ي') {
            // Word-final or post-consonant 'ی' in Arabic/Urdu/Persian geographic names typically transliterates to 'i'
            const isWordEnd = i === lower.length - 1 || /\s/.test(lower[i + 1]);
            const isPrecededByConsonant = i > 0 && ARABIC_PERSIAN_CHAR_MAP[lower[i - 1]] !== undefined && !['a', 'i', 'u', 'o', 'e'].includes(ARABIC_PERSIAN_CHAR_MAP[lower[i - 1]]);
            if (isWordEnd || isPrecededByConsonant) {
                result += 'i';
            } else {
                result += 'y';
            }
        } else if (ARABIC_PERSIAN_CHAR_MAP[char] !== undefined) {
            result += ARABIC_PERSIAN_CHAR_MAP[char];
        } else if (CYRILLIC_CHAR_MAP[char] !== undefined) {
            result += CYRILLIC_CHAR_MAP[char];
        } else {
            result += char;
        }
    }

    // Capitalize words
    return result
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Resolves the preferred English display name from candidate metadata and properties.
 */
export function normalizeEnglishDisplayName(name: string, rawProviders?: Record<string, any>): string {
    if (!name) return 'Unknown Location';
    const trimmed = name.trim();

    // 1. Direct dictionary match for known local names
    if (KNOWN_ENGLISH_NAMES[trimmed]) {
        return KNOWN_ENGLISH_NAMES[trimmed];
    }

    // 2. Check metadata in rawProviders (Overpass tags, Nominatim namedetails, Wikipedia title)
    if (rawProviders && typeof rawProviders === 'object') {
        for (const providerKey of Object.keys(rawProviders)) {
            const raw = rawProviders[providerKey];
            if (!raw) continue;

            // Overpass tags
            const tags = raw.tags || raw;
            const enTag = tags['name:en'] || tags['int_name'] || tags['name_en'] || tags['official_name:en'] || tags['alt_name:en'] || tags['name:latin'];
            if (enTag && typeof enTag === 'string' && !containsNonLatinScript(enTag)) {
                return enTag.trim();
            }

            // Nominatim namedetails or extratags
            const nameDetails = raw.namedetails || raw.extratags;
            if (nameDetails) {
                const nomEn = nameDetails['name:en'] || nameDetails['int_name'] || nameDetails['name_en'] || nameDetails['official_name:en'];
                if (nomEn && typeof nomEn === 'string' && !containsNonLatinScript(nomEn)) {
                    return nomEn.trim();
                }
            }

            // Nominatim address fields
            if (raw.address && typeof raw.address === 'object') {
                const addrCity = raw.address.city || raw.address.town || raw.address.village || raw.address.municipality;
                if (addrCity && typeof addrCity === 'string' && !containsNonLatinScript(addrCity)) {
                    return addrCity.trim();
                }
            }

            // Nominatim display_name (if it has Latin comma-separated segments)
            if (raw.display_name && typeof raw.display_name === 'string') {
                const parts = raw.display_name.split(',').map((p: string) => p.trim());
                for (const part of parts) {
                    if (part && !containsNonLatinScript(part) && !/^\d+$/.test(part)) {
                        const cleanPart = part.replace(/\s+(District|Division|Tehsil|Taluka|County|Province|State|Region)$/i, '').trim();
                        if (cleanPart && !containsNonLatinScript(cleanPart)) {
                            return cleanPart;
                        }
                    }
                }
            }

            // Wikipedia article title (Wikipedia en titles are English)
            if (raw.title && typeof raw.title === 'string' && !containsNonLatinScript(raw.title)) {
                return raw.title.split(',')[0].trim();
            }
        }
    }

    // 3. If name contains non-Latin scripts, attempt transliteration
    if (containsNonLatinScript(trimmed)) {
        const transliterated = transliterateToLatin(trimmed);
        if (transliterated && transliterated.length > 0) {
            return transliterated;
        }
    }

    // 4. Return existing clean Latin name
    return trimmed;
}
