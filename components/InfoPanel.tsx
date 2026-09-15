
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ENTITY_SCHEMAS } from '../entitySchema';
import { LocationInfo, SkinType, isValidCoordinates, LocationType } from '../types';
import { formatUserFacingCategory, formatClimateName } from '../utils/categoryFormatting';
import { fetchAndValidateImages } from '../services/imageService';
import { fetchAndValidateLocationNews } from '../services/locationService';
import { isLMStudioNoModelError, LM_STUDIO_NO_MODEL_MESSAGE, LM_STUDIO_NO_MODEL_INSTRUCTION } from '../services/geminiService';
import {
  X, Users, Info, Crown, Map, Pin, ExternalLink, Loader2,
  BookOpen, Rocket, Trophy, Music, FlaskConical, Palette, Clapperboard, Image as ImageIcon,
  Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Save, StickyNote, ChevronLeft, ChevronRight,
  MapPin, Route as RouteIcon
} from 'lucide-react';
import StackedImageCarousel from './StackedImageCarousel';
import {
  classifyContext,
  isPureGeographicLabel,
  sanitizeContextMarkdown,
  ContextCategory,
  CONTEXT_CATEGORY_HEADINGS
} from '../utils/contextClassification';
import { generateDefaultRouteName, normalizeSemanticEntityTitle, isCoordinateTitle } from '../services/queryNormalizer';
export { classifyContext, isPureGeographicLabel, sanitizeContextMarkdown };


export const MedievalEmeraldBronzePinIcon: React.FC<{ width?: number; height?: number; className?: string }> = ({ width = 54, height = 38, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 160 110"
    width={width}
    height={height}
    className={`opacity-85 hover:opacity-100 ${className}`.trim()}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="bronzeHead" cx="35%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#d6b56a" />
        <stop offset="35%" stopColor="#a77b32" />
        <stop offset="72%" stopColor="#76501f" />
        <stop offset="100%" stopColor="#4b3215" />
      </radialGradient>
      <radialGradient id="emerald" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#2a8a5b" />
        <stop offset="45%" stopColor="#115E3B" />
        <stop offset="100%" stopColor="#061F13" />
      </radialGradient>
      <linearGradient id="shaft" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#3a3022" />
        <stop offset="45%" stopColor="#171511" />
        <stop offset="100%" stopColor="#51442e" />
      </linearGradient>
      <filter id="shadowBlur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
    </defs>
    {/* Perspective ground shadow */}
    <g filter="url(#shadowBlur)" opacity="0.12">
      <path
        d="M 49,96 L 51,96
             L 81,72
             C 86,63 118,65 122,50
             C 126,35 102,24 88,34
             C 76,43 72,55 76,68
             L 49,96 Z"
        fill="#3a3a3a"
      />
    </g>
    {/* Main pin graphic */}
    <g>
      <path
        d="M 48,58 L 52,58 L 53,91 L 50,97 L 47,91 Z"
        fill="url(#shaft)"
      />
      <circle
        cx="50"
        cy="43"
        r="25"
        fill="url(#bronzeHead)"
        stroke="#4b3215"
        strokeWidth="2"
      />
      <circle
        cx="50"
        cy="43"
        r="19"
        fill="none"
        stroke="#c39a4d"
        strokeWidth="2"
        opacity="0.7"
      />
      <circle
        cx="50"
        cy="43"
        r="11"
        fill="url(#emerald)"
        stroke="#6e5427"
        strokeWidth="1.5"
      />
      <ellipse
        cx="44"
        cy="36"
        rx="5"
        ry="3"
        fill="#ffffff"
        opacity="0.1"
      />
    </g>
  </svg>
);

export const AntiqueBookIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-open-book-perfect-fill ${className}`}
    aria-hidden="true"
  >
    {/* Main Left Page Face (Light Parchment) */}
    <path d="M12 21a3 3 0 0 0-3-3H2V3h6a4 4 0 0 1 4 4z" fill="#E6D5C3"></path>
    {/* Main Right Page Face (Light Parchment) */}
    <path d="M12 21a3 3 0 0 1 3-3h7V3h-6a4 4 0 0 0-4 4z" fill="#E6D5C3"></path>
    {/* Bottom Left Thick Page Edge (Dark Chocolate Brown) */}
    <path d="M2 18v3h7a3 3 0 0 0 3-3H2z" fill="#5C3A21"></path>
    {/* Bottom Right Thick Page Edge (Dark Chocolate Brown) */}
    <path d="M22 18v3h-7a3 3 0 0 1-3-3h10z" fill="#5C3A21"></path>
    {/* Outer Structural Lines (Black/CurrentColor Outlines) */}
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    <path d="M2 18a3 3 0 0 1 3-3h3"></path>
    <path d="M22 18a3 3 0 0 0-3-3h-3"></path>
    {/* Hanging Ribbon Bookmark (Deep Red/Amber for extra contrast) */}
    <path d="M10 7v9l2-1.5 2 1.5V7" fill="#A0522D"></path>
  </svg>
);

export const VoyagerCeremonialBanner: React.FC<{
  isFavorite: boolean;
  onFavoriteClick: () => void;
  favoriteTitle: string;
  favoriteDialog?: React.ReactNode;
}> = ({ isFavorite, onFavoriteClick, favoriteTitle, favoriteDialog }) => {
  return (
    <div className="relative w-full px-1 py-0 flex items-center justify-center select-none" data-testid="voyager-ceremonial-banner">
      {/* Option 3: THE VOYAGER Horizontal Banner SVG Artwork */}
      <svg
        viewBox="0 0 800 90"
        className="w-full h-auto max-h-[62px] block drop-shadow-sm pointer-events-none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="voyager-g-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A67C1E" />
            <stop offset="30%" stopColor="#FDF1A9" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="70%" stopColor="#F3E5AB" />
            <stop offset="100%" stopColor="#8A640F" />
          </linearGradient>
          <linearGradient id="voyager-g-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0A2F1D" />
            <stop offset="50%" stopColor="#115E3B" />
            <stop offset="100%" stopColor="#0A2F1D" />
          </linearGradient>
          <linearGradient id="voyager-g-emerald-fold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#061F13" />
            <stop offset="100%" stopColor="#010A06" />
          </linearGradient>
        </defs>

        {/* Folded ribbon ends */}
        <path d="M 15,25 L 65,25 L 65,75 L 15,75 L 32,50 Z" fill="url(#voyager-g-emerald-fold)" />
        <path d="M 785,25 L 735,25 L 735,75 L 785,75 L 768,50 Z" fill="url(#voyager-g-emerald-fold)" />

        {/* Fold underlap shadow triangles */}
        <path d="M 55,15 L 65,25 L 55,25 Z" fill="#020C07" />
        <path d="M 745,15 L 735,25 L 745,25 Z" fill="#020C07" />

        {/* Main emerald banner cloth */}
        <path
          d="M 55,15 L 745,15 L 735,75 L 65,75 Z"
          fill="url(#voyager-g-emerald)"
          stroke="#051A10"
          strokeWidth="2"
        />

        {/* Outer gold border */}
        <path
          d="M 68,23 L 732,23 L 725,67 L 75,67 Z"
          fill="none"
          stroke="url(#voyager-g-gold)"
          strokeWidth="1.5"
          opacity="0.9"
        />

        {/* Inner subtle double gold border */}
        <path
          d="M 72,27 L 728,27 L 721,63 L 79,63 Z"
          fill="none"
          stroke="url(#voyager-g-gold)"
          strokeWidth="0.7"
          opacity="0.6"
        />

        {/* Central rotated diamond medallion */}
        <rect
          x="-19"
          y="-19"
          width="38"
          height="38"
          fill="#0A2F1D"
          stroke="url(#voyager-g-gold)"
          strokeWidth="2.5"
          transform="translate(400,45) rotate(45)"
        />

        {/* Center compass emblem artwork */}
        <g transform="translate(400,45)">
          <circle r="14" fill="none" stroke="url(#voyager-g-gold)" strokeWidth="1" opacity="0.85" />
          <circle r="11" fill="none" stroke="url(#voyager-g-gold)" strokeWidth="0.5" strokeDasharray="1 1.5" opacity="0.6" />

          {/* Secondary 4-point diagonal facets */}
          <polygon points="0,-11 2.5,-2.5 11,0 2.5,2.5 0,11 -2.5,2.5 -11,0 -2.5,-2.5" fill="url(#voyager-g-gold)" opacity={isFavorite ? "0.95" : "0.55"} />

          {/* Primary 4-point compass rose facets */}
          <polygon points="0,-15 2.5,-2 0,0" fill="#FDF1A9" />
          <polygon points="0,-15 -2.5,-2 0,0" fill="#A67C1E" />
          <polygon points="15,0 2,2.5 0,0" fill="#FDF1A9" />
          <polygon points="15,0 2,-2.5 0,0" fill="#A67C1E" />
          <polygon points="0,15 -2.5,2 0,0" fill="#FDF1A9" />
          <polygon points="0,15 2.5,2 0,0" fill="#A67C1E" />
          <polygon points="-15,0 -2,-2.5 0,0" fill="#FDF1A9" />
          <polygon points="-15,0 -2,2.5 0,0" fill="#A67C1E" />

          {/* Center pivot jewel */}
          <circle r="2.5" fill="url(#voyager-g-gold)" stroke="#061F13" strokeWidth="0.5" />
        </g>
      </svg>

      {/* Accessible Interactive Center Compass Button */}
      <button
        type="button"
        onClick={onFavoriteClick}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] z-10"
        title={favoriteTitle}
        aria-label={favoriteTitle}
      >
        <span className="sr-only">{favoriteTitle}</span>
      </button>

      {/* Dialog Popover if open */}
      {favoriteDialog}
    </div>
  );
};

export interface GalleryImage {
  url: string;
  caption?: string;
  attribution?: string;
}

// Helper to check for placeholder / unavailable strings that must NEVER be displayed in the UI
export function isPlaceholderString(val: any): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toLowerCase();
  return (
    s === '' ||
    s === 'unknown' ||
    s.startsWith('unknown ') ||
    s === 'unavailable' ||
    s.startsWith('unavailable ') ||
    s === 'n/a' ||
    s === 'na' ||
    s === 'none' ||
    s === 'null' ||
    s === 'undefined' ||
    s === '[object object]' ||
    s === 'placeholder' ||
    s === 'no description' ||
    s === 'not available' ||
    s === 'not applicable' ||
    s === 'no data' ||
    s === '0' ||
    s === 'uninhabited' ||
    s === 'no permanent population' ||
    s === 'lookup_failed' ||
    s.startsWith('climate data unavailable') ||
    s.startsWith('climate data is unavailable') ||
    s.startsWith('specific climate data is unavailable') ||
    s.startsWith('documentary enrichment unavailable') ||
    s.startsWith('information unavailable') ||
    s.includes('enrichment unavailable') ||
    s.includes('information unavailable')
  );
}

export const cleanMetadataString = (val: unknown): string | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string' && typeof val !== 'number') return undefined;
  const str = String(val).trim();
  if (!str || isPlaceholderString(str)) return undefined;
  return str;
};

export const formatImageAttribution = (attr: string | undefined): string | undefined => {
  const cleaned = cleanMetadataString(attr);
  if (!cleaned) return undefined;

  // If it already contains a prefix like "Photo:", "Credit:", "Source:", "Image:", preserve it
  if (/^(photo|credit|source|image|by|courtesy of)\s*[:\-]/i.test(cleaned)) {
    return cleaned;
  }

  return `Photo: ${cleaned}`;
};

export const normalizeDisplayText = (value: any): string => {
  let str = '';
  if (typeof value === 'string') {
    str = value;
  } else if (value && typeof value === 'object') {
    if (typeof value.text === 'string') str = value.text;
    else if (typeof value.summary === 'string') str = value.summary;
    else if (typeof value.title === 'string') str = value.title;
    else if (typeof value.name === 'string') str = value.name;
    else if (typeof value.description === 'string') str = value.description;
  }

  if (!str) return '';

  return str
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
};

const US_STATE_ABBRS: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio',
  ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
  dc: 'district of columbia', pr: 'puerto rico', vi: 'virgin islands', gu: 'guam'
};

const COMMON_GEO_ABBRS: Record<string, string> = {
  us: 'united states', usa: 'united states',
  uk: 'united kingdom',
  uae: 'united arab emirates'
};

const COMMON_COUNTRY_ABBRS: Record<string, string> = {
  us: 'united states', usa: 'united states',
  uk: 'united kingdom',
  uae: 'united arab emirates'
};

const CONTINENTS = [
  'Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'
];

/**
 * Normalizes a geographic or entity name strictly for comparison purposes:
 * - strips diacritics / accents
 * - converts to lowercase
/**
 * Normalizes a geographic or entity name strictly for comparison purposes:
 * - converts & to 'and'
 * - strips diacritics / accents
 * - converts to lowercase
 * - strips periods, apostrophes, quotes
 * - normalizes whitespace and punctuation
 */
export const normalizeGeoComparisonName = (str: unknown): string => {
  if (str === null || str === undefined) return '';
  const s = String(str).trim();
  if (!s) return '';

  return s
    .replace(/\s*&\s*/g, ' and ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Standardizes common geographic tokens (e.g. "saint" vs "st", state abbreviations)
 */
const standardizeGeoTokens = (norm: string): string => {
  let s = norm
    .replace(/^mt\s+/, 'mount ')
    .replace(/^st\s+/, 'saint ')
    .replace(/^(city|town|village|municipality|state|province|territory|department|region|county)\s+of\s+/, '')
    .trim();

  if (US_STATE_ABBRS[s]) return US_STATE_ABBRS[s];
  if (COMMON_GEO_ABBRS[s]) return COMMON_GEO_ABBRS[s];
  return s;
};

/**
 * Reusable helper that determines whether two geographic components represent the same
 * geographic information or whether one is an overlapping/compound nested representation of the other.
 */
export const areGeoComponentsRedundant = (
  compA: string,
  compB: string
): { isRedundant: boolean; relation?: 'exact' | 'abbreviation' | 'parenthetical' | 'compound_nested'; preferred?: string } => {
  if (!compA || !compB) return { isRedundant: false };
  const rawA = String(compA).trim();
  const rawB = String(compB).trim();
  if (!rawA || !rawB) return { isRedundant: false };

  const normA = normalizeGeoComparisonName(rawA);
  const normB = normalizeGeoComparisonName(rawB);
  if (!normA || !normB) return { isRedundant: false };

  // 1. Direct normalized match
  if (normA === normB) {
    const preferred = rawA.length >= rawB.length ? rawA : rawB;
    return { isRedundant: true, relation: 'exact', preferred };
  }

  // 2. Standardized prefix & abbreviation equivalence (e.g. "St. Louis" <=> "Saint Louis", "NM" <=> "New Mexico")
  const stdA = standardizeGeoTokens(normA);
  const stdB = standardizeGeoTokens(normB);
  if (stdA && stdA === stdB) {
    const preferred = rawA.length >= rawB.length ? rawA : rawB;
    return { isRedundant: true, relation: 'abbreviation', preferred };
  }

  // 3. Parenthetical variations (e.g., "South Georgia (UK)" vs "South Georgia")
  const stripParen = (s: string) => s.replace(/\s*\(.*?\)\s*/g, '').trim();
  const noParenNormA = normalizeGeoComparisonName(stripParen(rawA));
  const noParenNormB = normalizeGeoComparisonName(stripParen(rawB));
  if (noParenNormA && noParenNormA === noParenNormB) {
    const preferred = !rawA.includes('(') ? rawA : (!rawB.includes('(') ? rawB : rawA);
    return { isRedundant: true, relation: 'parenthetical', preferred };
  }

  // 4. Compound / conjunctive hierarchy: e.g. "South Georgia" vs "South Georgia and the South Sandwich Islands"
  const isCompoundOf = (shortNorm: string, longNorm: string) => {
    if (shortNorm.length < 3) return false;
    if (shortNorm === longNorm) return true;

    // Check conjunctive compound: starts with, ends with, or enclosed with "and"
    if (
      longNorm.startsWith(`${shortNorm} and `) ||
      longNorm.endsWith(` and ${shortNorm}`) ||
      longNorm.includes(` ${shortNorm} and `) ||
      longNorm.includes(` and ${shortNorm} and `)
    ) {
      return true;
    }

    // Check common geographical suffix/prefix wrappers (islands, island, territory, state, province)
    if (
      longNorm === `${shortNorm} islands` ||
      longNorm === `${shortNorm} island` ||
      longNorm === `${shortNorm} territory` ||
      longNorm === `territory of ${shortNorm}` ||
      longNorm === `state of ${shortNorm}` ||
      longNorm === `province of ${shortNorm}` ||
      longNorm === `republic of ${shortNorm}`
    ) {
      return true;
    }

    return false;
  };

  if (isCompoundOf(normA, normB) || isCompoundOf(stdA, stdB)) {
    return { isRedundant: true, relation: 'compound_nested', preferred: rawA };
  }
  if (isCompoundOf(normB, normA) || isCompoundOf(stdB, stdA)) {
    return { isRedundant: true, relation: 'compound_nested', preferred: rawB };
  }

  return { isRedundant: false };
};

/**
 * Deduplicates a list of geographic hierarchy components, eliminating exact duplicates,
 * normalized punctuation/casing variants, and compound/nested representations
 * while preferring the most specific geographic context.
 */
export const deduplicateGeographicHierarchy = (
  components: (string | undefined | null)[]
): string[] => {
  if (!components || !Array.isArray(components)) return [];

  const validComponents = components
    .map(c => (typeof c === 'string' ? c.trim() : ''))
    .filter(c => Boolean(c) && !isPlaceholderString(c));

  if (validComponents.length <= 1) return validComponents;

  const result: string[] = [];

  for (const candidate of validComponents) {
    let shouldAdd = true;
    let replaceIdx = -1;
    let replacementVal: string | undefined;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      const red = areGeoComponentsRedundant(candidate, existing);
      if (red.isRedundant) {
        shouldAdd = false;
        // If candidate is the preferred/more specific component over existing, replace existing
        if (
          red.preferred &&
          normalizeGeoComparisonName(red.preferred) === normalizeGeoComparisonName(candidate) &&
          normalizeGeoComparisonName(candidate) !== normalizeGeoComparisonName(existing)
        ) {
          replaceIdx = i;
          replacementVal = red.preferred;
        }
        break;
      }
    }

    if (replaceIdx >= 0 && replacementVal) {
      result[replaceIdx] = replacementVal;
    } else if (shouldAdd) {
      result.push(candidate);
    }
  }

  return result;
};

/**
 * Checks whether a candidate geographic hierarchy component is redundant with the displayed title
 * (or canonical entity name).
 */
export const isRedundantWithTitle = (
  component: string,
  displayedTitle: string,
  canonicalName?: string
): boolean => {
  const normComp = normalizeGeoComparisonName(component);
  if (!normComp) return true;

  const titlesToCheck = [displayedTitle, canonicalName].filter(Boolean) as string[];

  for (const rawTitle of titlesToCheck) {
    const normTitle = normalizeGeoComparisonName(rawTitle);
    if (!normTitle) continue;

    // 1. Direct exact or redundancy check
    const red = areGeoComponentsRedundant(component, rawTitle);
    if (red.isRedundant) return true;

    // 2. Base title after splitting comma / parentheses
    const baseTitle = rawTitle.split(',')[0].replace(/\s*\(.*?\)\s*/g, '').trim();
    if (baseTitle && baseTitle !== rawTitle) {
      const redBase = areGeoComponentsRedundant(component, baseTitle);
      if (redBase.isRedundant) return true;
    }

    // 3. Base component after splitting comma / parentheses
    const baseComp = component.split(',')[0].replace(/\s*\(.*?\)\s*/g, '').trim();
    if (baseComp && baseComp !== component) {
      const redBase = areGeoComponentsRedundant(baseComp, rawTitle);
      if (redBase.isRedundant) return true;
    }
  }

  return false;
};

export interface HeaderGeographicResult {
  displayTitle: string;
  displaySubtitle: string | null;
  displayAltNames: string | null;
}

export interface ParsedLocationHierarchy {
  settlement?: string;
  state?: string;
  country?: string;
  continent?: string;
}

const cleanVal = (v: any): string | undefined => {
  const cleaned = cleanMetadataString(v);
  if (!cleaned || isPlaceholderString(cleaned)) return undefined;
  return cleaned;
};

/**
 * Extracts a settlement name preferring city > town > village > hamlet > locality > municipality.
 */
export const extractHeaderSettlement = (info: any): string | undefined => {
  if (!info) return undefined;

  const rawCity = cleanVal(info.city || info.address?.city || info.context?.city || info.waypoint?.city);
  if (rawCity) return rawCity;

  const rawTown = cleanVal(info.town || info.address?.town || info.context?.town || info.waypoint?.town);
  if (rawTown) return rawTown;

  const rawVillage = cleanVal(info.village || info.address?.village || info.context?.village || info.waypoint?.village);
  if (rawVillage) return rawVillage;

  const rawHamlet = cleanVal(info.hamlet || info.address?.hamlet || info.context?.hamlet || info.waypoint?.hamlet);
  if (rawHamlet) return rawHamlet;

  const rawLocality = cleanVal(info.locality || info.address?.locality || info.context?.locality || info.waypoint?.locality);
  if (rawLocality) return rawLocality;

  const rawMun = cleanVal(info.municipality || info.address?.municipality || info.context?.municipality || info.waypoint?.municipality);
  if (rawMun) {
    const cleanedMun = rawMun
      .replace(/^Municipality of\s+/i, '')
      .replace(/\s+Municipality$/i, '')
      .replace(/^Dimos\s+/i, '')
      .replace(/\s+Dimos$/i, '')
      .trim();
    if (cleanedMun && !isPlaceholderString(cleanedMun)) return cleanedMun;
  }

  return undefined;
};

/**
 * Extracts country name from structured fields.
 */
export const extractHeaderCountry = (info: any): string | undefined => {
  if (!info) return undefined;
  const rawCountry = cleanVal(
    info.country ||
    info.context?.country ||
    info.address?.country ||
    info.waypoint?.country ||
    info.territory ||
    info.context?.territory ||
    info.waypoint?.territory
  );
  if (rawCountry && !isPlaceholderString(rawCountry)) {
    return rawCountry;
  }
  return undefined;
};

/**
 * Extracts state/province/region for fallback when city is absent.
 */
export const extractHeaderState = (info: any): string | undefined => {
  if (!info) return undefined;
  const rawState = cleanVal(
    info.state || info.region || info.province || info.adminArea ||
    info.context?.state || info.context?.region || info.context?.province ||
    info.address?.state || info.address?.region || info.address?.province ||
    info.waypoint?.state || info.waypoint?.region
  );
  if (rawState && !isPlaceholderString(rawState)) {
    return rawState;
  }
  return undefined;
};

/**
 * Parses a comma-separated location string, filtering out postal codes, street addresses,
 * and administrative noise, extracting candidate settlement, state, country, or continent.
 */
export const parseLocationHierarchyString = (locStr: string): ParsedLocationHierarchy => {
  if (!locStr || typeof locStr !== 'string') return {};

  const rawParts = locStr.split(',').map(s => s.trim()).filter(Boolean);
  if (rawParts.length === 0) return {};

  const isPostalCode = (s: string) => /^\d{3,6}(-\d{4})?$/i.test(s) || /^\d{2}\s*\d{2,4}$/.test(s) || /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(s) || /^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i.test(s);
  const isStreetOrBuildingNumber = (s: string) => /^\d+\s+[A-Za-z]/i.test(s) || /^\d+[a-z]?$/i.test(s);
  const isAdministrativeNoise = (s: string) => /\b(\d+(st|nd|rd|th)?\s+district|district of|regional unit of|regional unit|metropolitan city of|metropolitan city|arrondissement|county|suburb|quarter|borough)\b/i.test(s);

  let cleanParts: string[] = [];
  let foundCleanMunicipality: string | undefined;

  for (const part of rawParts) {
    if (isPlaceholderString(part) || isPostalCode(part) || isStreetOrBuildingNumber(part)) {
      continue;
    }
    if (/^Municipality of\s+/i.test(part) || /\s+Municipality$/i.test(part) || /^Dimos\s+/i.test(part) || /\s+Dimos$/i.test(part)) {
      const cleanMun = part
        .replace(/^Municipality of\s+/i, '')
        .replace(/\s+Municipality$/i, '')
        .replace(/^Dimos\s+/i, '')
        .replace(/\s+Dimos$/i, '')
        .trim();
      if (cleanMun && !isPlaceholderString(cleanMun)) {
        foundCleanMunicipality = cleanMun;
        if (!cleanParts.some(p => p.toLowerCase() === cleanMun.toLowerCase())) {
          cleanParts.push(cleanMun);
        }
      }
      continue;
    }

    if (isAdministrativeNoise(part)) {
      continue;
    }

    if (!cleanParts.some(p => p.toLowerCase() === part.toLowerCase())) {
      cleanParts.push(part);
    }
  }

  // Deduplicate hierarchy parts
  cleanParts = deduplicateGeographicHierarchy(cleanParts);

  if (cleanParts.length === 0) return {};

  if (cleanParts.length === 1) {
    const single = cleanParts[0];
    const isContinent = CONTINENTS.some(c => c.toLowerCase() === single.toLowerCase());
    if (isContinent) return { continent: single };
    return { country: single };
  }

  if (cleanParts.length === 2) {
    const first = cleanParts[0];
    const second = cleanParts[1];
    const isContinent = CONTINENTS.some(c => c.toLowerCase() === second.toLowerCase());
    if (isContinent) {
      return { country: first, continent: second };
    }
    const isUSStateSecond = Boolean(US_STATE_ABBRS[second.toLowerCase()]) || Object.values(US_STATE_ABBRS).some(s => s.toLowerCase() === second.toLowerCase());
    if (isUSStateSecond) {
      return { settlement: first, state: second, country: 'United States' };
    }
    return { settlement: first, country: second };
  }

  const country = cleanParts[cleanParts.length - 1];
  const state = cleanParts[cleanParts.length - 2];
  const settlement = foundCleanMunicipality || cleanParts[cleanParts.length - 3] || cleanParts[0];

  return { settlement, state, country };
};

/**
 * Returns a concise human-readable location string (e.g. "Athens, Greece") for the InfoPanel header.
 */
export const getHeaderLocation = (
  info: any,
  displayedTitle?: string
): string | null => {
  if (!info) return null;

  const rawTitle = cleanMetadataString(
    displayedTitle ||
    (info as any).displayName ||
    info.canonicalName ||
    info.name ||
    info.waypoint?.name ||
    ''
  ) || '';

  const rawSettlement = extractHeaderSettlement(info);
  const rawState = extractHeaderState(info);
  const rawCountry = extractHeaderCountry(info);
  const rawContinent = cleanVal(info.continent || info.context?.continent);

  let parsedSettlement: string | undefined;
  let parsedState: string | undefined;
  let parsedCountry: string | undefined;
  let parsedContinent: string | undefined;

  const locString = cleanVal(
    info.locationString ||
    info.waypoint?.locationString ||
    info.address?.full ||
    (info.address?.displayName && info.address.displayName !== rawTitle ? info.address.displayName : undefined)
  );

  if (locString) {
    const parsed = parseLocationHierarchyString(locString);
    parsedSettlement = parsed.settlement;
    parsedState = parsed.state;
    parsedCountry = parsed.country;
    parsedContinent = parsed.continent;
  }

  // Deduplicate and resolve best candidates for each hierarchy tier
  const candidateSettlements = deduplicateGeographicHierarchy([rawSettlement, parsedSettlement]);
  const candidateStates = deduplicateGeographicHierarchy([rawState, parsedState]);
  const candidateCountries = deduplicateGeographicHierarchy([rawCountry, parsedCountry]);

  // Overall candidate list in specificity order: settlement -> state -> country
  const allCandidates = deduplicateGeographicHierarchy([
    ...candidateSettlements,
    ...candidateStates,
    ...candidateCountries
  ]);

  // Filter out any candidates that are redundant with displayedTitle or canonicalName
  const nonRedundantGeo = allCandidates.filter(comp => !isRedundantWithTitle(comp, rawTitle, info.name));

  if (nonRedundantGeo.length === 0) {
    const continent = parsedContinent || rawContinent;
    if (continent && !isRedundantWithTitle(continent, rawTitle, info.name)) {
      return continent;
    }
    return null;
  }

  if (nonRedundantGeo.length === 1) {
    return nonRedundantGeo[0];
  }

  if (nonRedundantGeo.length === 2) {
    return `${nonRedundantGeo[0]}, ${nonRedundantGeo[1]}`;
  }

  // 3+ components: prefer most specific + most general (first and last)
  return `${nonRedundantGeo[0]}, ${nonRedundantGeo[nonRedundantGeo.length - 1]}`;
};

/**
 * Reusable geographic normalization and deduplication engine that produces
 * clean, non-redundant title, subtitle, and alt names for the InfoPanel header.
 */
export const normalizeHeaderGeographicHierarchy = (
  info: any,
  rawTitleOverride?: string,
  isSingleLocation: boolean = true
): HeaderGeographicResult => {
  if (!info) {
    return { displayTitle: '', displaySubtitle: null, displayAltNames: null };
  }

  const isGenericOrCoordinateTitle = (str?: string): boolean => {
    if (!str || typeof str !== 'string') return true;
    if (isCoordinateTitle(str)) return true;
    const trimmed = str.trim().toLowerCase();
    return !trimmed ||
      trimmed === 'route context' ||
      trimmed === 'route' ||
      trimmed === 'default' ||
      trimmed === 'location' ||
      trimmed === 'saved route' ||
      trimmed === 'unknown' ||
      trimmed === 'unknown waypoint' ||
      trimmed === 'searching...' ||
      trimmed === 'location info';
  };

  const rawCandidate = info.canonicalName || (info as any).displayName || info.waypoint?.canonicalName || info.name || info.waypoint?.name || '';
  let rawTitle = cleanMetadataString(rawTitleOverride || rawCandidate) || '';
  if (isGenericOrCoordinateTitle(rawTitle) && rawCandidate && !isGenericOrCoordinateTitle(rawCandidate)) {
    rawTitle = cleanMetadataString(rawCandidate) || '';
  }

  // Authoritative normalization of semantic title
  rawTitle = normalizeSemanticEntityTitle({
    explicitTitle: rawTitle,
    canonicalName: info.canonicalName || info.waypoint?.canonicalName,
    displayName: (info as any).displayName,
    name: info.name || info.waypoint?.name,
    description: info.description || info.waypoint?.description,
    historicalContext: (info as any).historicalContext || (info as any).context,
    routeTitle: (info as any).routeTitle || info.waypoint?.routeTitle,
    coordinates: info.coordinates || info.waypoint
  });

  // Step A: Parse candidate place name & title geographic qualifiers
  let primaryNameCandidate = rawTitle;
  let titleGeoSuffixes: string[] = [];

  if (rawTitle.includes(',')) {
    const commaParts = rawTitle.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (commaParts.length > 1) {
      primaryNameCandidate = commaParts[0];
      titleGeoSuffixes = commaParts.slice(1);
    }
  } else {
    const parenMatch = rawTitle.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch && parenMatch[1] && parenMatch[2]) {
      primaryNameCandidate = parenMatch[1].trim();
      titleGeoSuffixes = [parenMatch[2].trim()];
    }
  }

  // Step D: Establish final title
  let finalTitle = rawTitle;
  if (titleGeoSuffixes.length > 0) {
    const allSuffixesAreGeo = titleGeoSuffixes.every(suffix => {
      const isKnownAbbr = !!US_STATE_ABBRS[suffix.toLowerCase()] || !!COMMON_GEO_ABBRS[suffix.toLowerCase()] || !!COMMON_COUNTRY_ABBRS[suffix.toLowerCase()];
      const matchesStructured = [
        extractHeaderSettlement(info),
        extractHeaderState(info),
        extractHeaderCountry(info),
        cleanVal(info.territory || info.context?.territory)
      ].some(
        f => f && areGeoComponentsRedundant(f, suffix).isRedundant
      );
      return isKnownAbbr || matchesStructured;
    });

    if (allSuffixesAreGeo && primaryNameCandidate.length > 0) {
      finalTitle = primaryNameCandidate;
    }
  }

  const finalSubtitle = getHeaderLocation(info, finalTitle);

  // Alternate names
  const altNamesList: string[] = [];
  const candidateAlt = [info.waypoint?.canonicalName, ...(Array.isArray(info.waypoint?.alternateNames) ? info.waypoint.alternateNames : [])];
  for (const alt of candidateAlt) {
    if (alt && typeof alt === 'string') {
      const trimmed = alt.trim();
      if (
        trimmed &&
        !isRedundantWithTitle(trimmed, finalTitle) &&
        (!finalSubtitle || !isRedundantWithTitle(trimmed, finalSubtitle)) &&
        !altNamesList.some(a => normalizeGeoComparisonName(a) === normalizeGeoComparisonName(trimmed))
      ) {
        altNamesList.push(trimmed);
      }
    }
  }

  return {
    displayTitle: finalTitle,
    displaySubtitle: finalSubtitle,
    displayAltNames: altNamesList.length > 0 ? `Also known as ${altNamesList.join(', ')}` : null
  };
};

/**
 * Formats the non-redundant geographic context line for an entity.
 */
export const formatGeographicContext = (
  info: any,
  displayedTitle?: string
): string | null => {
  if (!info) return null;
  return getHeaderLocation(info, displayedTitle);
};

export const getScrollFadeMaskStyle = (topFade: boolean, bottomFade: boolean): React.CSSProperties => {
  if (topFade && bottomFade) {
    return {
      maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
    };
  }
  if (topFade) {
    return {
      maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black 100%)',
    };
  }
  if (bottomFade) {
    return {
      maskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, black 0, black calc(100% - 16px), transparent 100%)',
    };
  }
  return {
    maskImage: 'none',
    WebkitMaskImage: 'none',
  };
};

export const calculateScrollFade = (scrollTop: number, scrollHeight: number, clientHeight: number): { top: boolean; bottom: boolean } => {
  const canScroll = scrollHeight > clientHeight + 1;
  if (!canScroll) {
    return { top: false, bottom: false };
  }
  const isAtTop = scrollTop <= 2;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;
  return {
    top: !isAtTop,
    bottom: !isAtBottom,
  };
};

interface InfoPanelProps {
  info: any; // Raw input (can be LocationInfo or waypoint wrapper)
  onClose: () => void;
  isLoading: boolean;
  isNewsFetching?: boolean;
  showNews?: boolean;
  skin: SkinType;
  isFavorite: boolean;
  onSaveFavorite: (name: string) => void;
  onRemoveFavorite: () => void;
  currentFavoriteName?: string;
  onFetchNews?: () => Promise<any>;
  onLoadMoreNews?: () => Promise<void>;
  routeNav?: {
    current: number;
    total: number;
    routeGroupName?: string;
    routeGroupId?: string;
    routeLocalCurrent?: number;
    routeLocalTotal?: number;
    onNext: () => void;
    onPrev: () => void;
  };
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenSettingsTab?: (tab: 'providers' | 'general' | 'appearance' | 'audio') => void;
}

interface Note {
  id: string;
  text: string;
  timestamp: number;
}



// Helper to validate data availability
const isValidData = (val: string | null | undefined, isDescription: boolean = false) => {
  if (val === null || val === undefined) return false;
  if (isPlaceholderString(val)) return false;
  return true;
};

// Helper to determine authoritative, accurately-labeled population title (never "Modern", never duplicate "Population")
export const getPopulationLabel = (popItem: any): string => {
  if (!popItem) return "Current Estimate";

  if (popItem.label && typeof popItem.label === 'string') {
    const trimmed = popItem.label.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.includes('modern') && !lower.includes('population')) {
      return trimmed;
    }
  }

  const censusYear = popItem.censusYear ||
    (typeof popItem.timeframe === 'string' && /census/i.test(popItem.timeframe) ? popItem.timeframe.match(/\b(\d{4})\b/)?.[1] : null) ||
    (typeof popItem.source === 'string' && /census/i.test(popItem.source) ? popItem.source.match(/\b(\d{4})\b/)?.[1] : null) ||
    (typeof popItem.label === 'string' && /census/i.test(popItem.label) ? popItem.label.match(/\b(\d{4})\b/)?.[1] : null);

  if (censusYear) {
    return `${censusYear} Census`;
  }

  const year = popItem.year ||
    (typeof popItem.timeframe === 'string' ? popItem.timeframe.match(/^\s*(\d{4})\s*$/)?.[1] : null) ||
    (typeof popItem.label === 'string' && /\b(\d{4})\b/.test(popItem.label) ? popItem.label.match(/\b(\d{4})\b/)?.[1] : null);

  if (year) {
    const isCensus = (typeof popItem.source === 'string' && /census/i.test(popItem.source)) ||
                     (typeof popItem.timeframe === 'string' && /census/i.test(popItem.timeframe));
    return isCensus ? `${year} Census` : `${year} Estimate`;
  }

  if (popItem.timeframe && typeof popItem.timeframe === 'string') {
    const tf = popItem.timeframe.trim();
    if (!tf.toLowerCase().includes('population') && !tf.toLowerCase().includes('modern')) {
      return tf;
    }
  }

  return "Current Estimate";
};

// Helper to safely convert mixed array elements to plain strings (useful for Copy buttons)
const getSafeTextString = (item: any): string => {
  if (item === null || item === undefined) return "";
  if (typeof item === 'string' || typeof item === 'number') return String(item);

  if (typeof item === 'object') {
    if (item.name && item.significance) {
      return `${item.name}: ${item.significance}`;
    }
    if (item.name) return String(item.name);
    if (item.text) return String(item.text);
    if (item.description) return String(item.description);

    try {
      const values = Object.values(item).filter(v => typeof v === 'string');
      if (values.length > 0) return values.join(': ');
      return JSON.stringify(item);
    } catch {
      return "Invalid data";
    }
  }
  return String(item);
};

// Helper to safely render mixed array elements (strings or structured objects)
const renderSafeText = (item: any): React.ReactNode => {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string' || typeof item === 'number') return String(item);

  if (typeof item === 'object') {
    if (item.name && item.significance) {
      return (
        <span className="block">
          <span className="font-bold">{item.name}</span>: {item.significance}
        </span>
      );
    }
    if (item.name) return String(item.name);
    if (item.text) return String(item.text);
    if (item.description) return String(item.description);

    try {
      const values = Object.values(item).filter(v => typeof v === 'string');
      if (values.length > 0) return values.join(': ');
      return JSON.stringify(item);
    } catch {
      return "Invalid data";
    }
  }
  return String(item);
};

export const CopyButton: React.FC<{ text: string; className?: string; skin: SkinType }> = ({ text, className = "", skin }) => {
  const [copied, setCopied] = useState(false);
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  const isParchment = skin === 'parchment';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const themeClass = isRetro
    ? "hover:text-black hover:bg-current border border-transparent hover:border-current rounded-none"
    : isParchment
    ? "hover:bg-[#d2b48c]/50 hover:text-[#3e2723] border border-transparent rounded-sm"
    : "hover:bg-white/10 rounded-full";

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 transition-all opacity-60 hover:opacity-100 ${themeClass} ${className}`.trim()}
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

export const SectionHeader: React.FC<{
  title: string;
  icon?: React.ReactNode;
  theme?: any;
  isRetro?: boolean;
  isParchment?: boolean;
  className?: string;
}> = ({ title, icon, theme = {}, isRetro = false, isParchment = false, className = "" }) => {
  const headerColorClass = isRetro
    ? 'text-current'
    : isParchment
      ? 'text-[#8b5a2b]'
      : 'text-cyan-300';

  const ruleColorClass = isRetro
    ? 'bg-current/25'
    : isParchment
      ? 'bg-[#8b5a2b]/25'
      : 'bg-cyan-400/20';

  return (
    <div className={`info-panel-section-header overflow-hidden mt-3 mb-[15px] min-w-0 max-w-full ${theme.icon || ''} ${className}`}>
      <h3 className={`text-sm font-semibold uppercase tracking-[0.16em] leading-tight min-w-0 max-w-full whitespace-normal break-normal ${headerColorClass}`}>
        {icon && <span className="inline-block align-middle mr-2 shrink-0 opacity-80">{icon}</span>}
        {title}
        <span
          className={`section-header-rule inline-block align-middle w-full h-[1px] -mr-[100%] ml-2 ${ruleColorClass}`}
          aria-hidden="true"
        />
      </h3>
    </div>
  );
};

import { parseNotableFactItem, deduplicateNotableFacts, normalizeFactComparisonKey } from '../utils/notableFactsUtils';
import { normalizeDescription } from '../utils/descriptionNormalization';
export { parseNotableFactItem, deduplicateNotableFacts, normalizeFactComparisonKey, normalizeDescription };

export const getCleanDescriptionLines = (info: any) => {
    if (!info || !info.description) return [];
    const descText = typeof info.description === 'string'
      ? info.description
      : (info.description?.text || (Array.isArray(info.description?.paragraphs) ? info.description.paragraphs.join('\n\n') : ''));

    if (isPlaceholderString(descText)) return [];

    const coordinates = info.coordinates || info.waypoint?.coordinates || (typeof info.lat === 'number' && typeof info.lng === 'number' ? { lat: info.lat, lng: info.lng } : null);
    const normalizedText = normalizeDescription(descText, { coordinates });
    const sanitizedMarkdown = sanitizeContextMarkdown(normalizedText);
    const rawLines = sanitizedMarkdown.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0 && !isPlaceholderString(l));

    const isNotableHeading = (text: string) => {
      const clean = text.replace(/^#{1,3}\s*/, '').replace(/[:*_\s]+$/, '').trim().toLowerCase();
      return (
        clean === 'notable facts' ||
        clean === 'notable fact' ||
        clean === 'notable' ||
        clean === 'fun facts' ||
        clean === 'fun fact' ||
        clean === 'quick facts' ||
        clean === 'quick fact' ||
        clean === 'key facts' ||
        clean === 'key fact' ||
        clean === 'fast facts' ||
        clean === 'interesting facts'
      );
    };

    // Process lines: remove fake context headings when followed by geographic labels,
    // reclassify headings, drop pure geographic standalone labels,
    // and strip redundant notable facts / quick facts sections from description narrative.
    const lines: string[] = [];
    let skippingNotableSection = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const headingClean = line.replace(/^#{1,3}\s*/, '').trim();

      if (isNotableHeading(line)) {
        skippingNotableSection = true;
        continue;
      }

      if (line.startsWith('#')) {
        skippingNotableSection = false;
      }

      if (skippingNotableSection) {
        continue;
      }

      const isContextHeading = /^(?:historical\s+context|historical\s+background|history|context|background|cultural\s+context|film\s*(?:&|and)\s*media|media\s+context|filming\s+location|scientific\s*(?:&|\/|and)\s*geographic\s*context)$/i.test(headingClean);

      if (isContextHeading) {
        const nextLine = rawLines[i + 1] || '';
        if (isPureGeographicLabel(nextLine)) {
          // Drop both the heading and the geographic label
          if (nextLine && isPureGeographicLabel(nextLine)) {
            i++;
          }
          continue;
        }

        const classification = classifyContext(nextLine);
        if (classification.category && classification.isMeaningful) {
          lines.push(`## ${classification.heading}`);
        } else if (classification.isGeographicOnly) {
          if (nextLine && isPureGeographicLabel(nextLine)) {
            i++;
          }
          continue;
        } else {
          // Keep content as plain narrative without fake context heading
        }
      } else {
        lines.push(line);
      }
    }

    if (lines.length > 0) {
        const firstLineRaw = lines[0];
        const firstLineClean = firstLineRaw.replace(/^#+\s*/, '').trim();
        const firstLineLower = firstLineClean.toLowerCase();
        const infoNameClean = (info.canonicalName || info.name || '').trim().toLowerCase();

        // Check if first line is a standalone title/detail heading
        const isGenericHeader = firstLineLower === 'overview' || firstLineLower === 'description';
        const isExactNameHeader = firstLineLower === infoNameClean;

        // Check if first line is a short standalone detail heading (e.g. "HMS Santa Maria", "RMS Titanic", "Mayflower")
        const isHeadingShape = (firstLineRaw.startsWith('#') || (firstLineClean.split(' ').length <= 8 && firstLineClean.length < 80 && !firstLineClean.match(/[.!?]$/)));

        let isRedundantIntro = false;
        if (lines.length > 1 && isHeadingShape) {
            const nextLineClean = lines[1].replace(/^#+\s*/, '').trim();
            const nextLineLower = nextLineClean.toLowerCase();

            // If the next line immediately repeats the first line's subject (e.g. "HMS Santa Maria is...", "RMS Titanic was...", "The Mayflower carried...")
            const startsWithSubject = nextLineLower.startsWith(firstLineLower) ||
                                      nextLineLower.replace(/^(the|a|an)\s+/, '').startsWith(firstLineLower.replace(/^(the|a|an)\s+/, ''));

            const containsSubjectEarly = (firstLineLower.length >= 4 && nextLineLower.substring(0, Math.min(nextLineLower.length, firstLineLower.length + 30)).includes(firstLineLower));

            const isVariantOfName = (firstLineLower.includes(infoNameClean) || (infoNameClean.length >= 4 && infoNameClean.includes(firstLineLower))) &&
                                    (nextLineLower.includes(infoNameClean) || nextLineLower.includes(firstLineLower));

            if (startsWithSubject || containsSubjectEarly || isVariantOfName) {
                isRedundantIntro = true;
            }
        }

        if (isGenericHeader || isExactNameHeader || isRedundantIntro) {
            lines.shift();
        }
    }

    return lines;
};

const InfoPanel: React.FC<InfoPanelProps> = ({
  info: rawInfo,
  onClose,
  isLoading,
  isNewsFetching,
  showNews = true,
  skin,
  isFavorite,
  onSaveFavorite,
  onRemoveFavorite,
  currentFavoriteName,
  onFetchNews,
  onLoadMoreNews,
  routeNav,
  isError,
  errorMessage,
  onRetry,
  onOpenSettingsTab
}: InfoPanelProps) => {
  const isMultiLocation = Boolean(routeNav?.total && routeNav.total > 1);
  const isSingleLocation = !isMultiLocation;

  const info = React.useMemo(() => {
    if (!rawInfo) return null;

    const wp = rawInfo.waypoint || {};

    // 1. Name
    const name = wp.name || rawInfo.name || "Unknown Location";

    // 2. Description fallback
    // Priority: wp.description > rawInfo.description > wp.significance
    const extractText = (val: any): string => {
       if (!val) return "";
       if (typeof val === "string") return normalizeDisplayText(val);
       if (typeof val === "object") {
           let text = "";
           const h = val.heading || val.heading1 || val.title;
           const t = val.text || val.text1 || val.description || val.summary || val.value || val.body;

           if (h) {
               text += `${normalizeDisplayText(h)}\n\n`;
           }
           if (t) {
               text += normalizeDisplayText(t);
           } else {
               // Fallback: concatenate string values, explicitly excluding other metadata sections
               const excludedKeys = ['notable', 'notableFacts', 'notable_facts', 'climate', 'population', 'news', 'contextNotes', 'entities', 'historicalPeriod'];
               const vals = Object.entries(val)
                 .filter(([k, v]) => typeof v === 'string' && !excludedKeys.includes(k) && !k.toLowerCase().includes('notable'))
                 .map(([k, v]) => normalizeDisplayText(v));
               if (vals.length > 0 && !h) {
                   text += vals.join('\n\n');
               }
           }
           return text.trim();
       }
       return normalizeDisplayText(String(val));
    };

    const geographicDesc = extractText(rawInfo.description) || null;
    const historicalDesc = extractText(wp.description) || null;
    const routeContextText = (rawInfo.routeContext?.text ? extractText(rawInfo.routeContext.text) : null) ||
      (wp.routeContext?.text ? extractText(wp.routeContext.text) : null) ||
      (wp.routeContextText ? extractText(wp.routeContextText) : null);

    let combinedDescParts: string[] = [];

    // Determine the primary narrative description:
    let rawDesc = "";
    if (historicalDesc && historicalDesc !== routeContextText) {
      rawDesc = historicalDesc;
    } else if (geographicDesc && geographicDesc !== routeContextText) {
      rawDesc = geographicDesc;
    } else if (historicalDesc) {
      rawDesc = historicalDesc;
    } else if (geographicDesc) {
      rawDesc = geographicDesc;
    }

    if (rawDesc && !isPlaceholderString(rawDesc)) {
      let cleanDesc = rawDesc;
      if (/^#+\s+description/i.test(cleanDesc.trim())) {
        cleanDesc = cleanDesc.replace(/^#+\s+description/i, '').trim();
      }
      if (cleanDesc && !isPlaceholderString(cleanDesc)) {
        combinedDescParts.push(cleanDesc);
      }
    }

    // Add significance if unique
    if (wp.significance && !isPlaceholderString(wp.significance) && wp.significance !== rawDesc && wp.significance !== routeContextText) {
      if (isSingleLocation) {
        if (!combinedDescParts.some(p => p.includes(wp.significance))) {
          combinedDescParts.push(wp.significance);
        }
      } else {
        combinedDescParts.push(`## Significance\n\n${wp.significance}`);
      }
    }

    // Consolidated contextual narrative sections (Historical, Film & Media, Cultural, Scientific/Geographic)
    // Only render categories when substantive, non-geographic information is present.
    const contextCandidates: string[] = [];
    if ((rawInfo as any).historicalBackground && !isPlaceholderString((rawInfo as any).historicalBackground)) {
      contextCandidates.push((rawInfo as any).historicalBackground);
    }
    if ((rawInfo as any).historicalContext && !isPlaceholderString((rawInfo as any).historicalContext)) {
      contextCandidates.push((rawInfo as any).historicalContext);
    }
    if ((rawInfo as any).filmContext && !isPlaceholderString((rawInfo as any).filmContext)) {
      contextCandidates.push((rawInfo as any).filmContext);
    }
    if ((rawInfo as any).mediaContext && !isPlaceholderString((rawInfo as any).mediaContext)) {
      contextCandidates.push((rawInfo as any).mediaContext);
    }
    if ((rawInfo as any).culturalContext && !isPlaceholderString((rawInfo as any).culturalContext)) {
      contextCandidates.push((rawInfo as any).culturalContext);
    }
    if ((rawInfo as any).scientificContext && !isPlaceholderString((rawInfo as any).scientificContext)) {
      contextCandidates.push((rawInfo as any).scientificContext);
    }

    // Group candidates by semantic category
    const categorizedContext: Partial<Record<ContextCategory, string[]>> = {};

    for (const rawSnippet of contextCandidates) {
      const snippet = normalizeDisplayText(String(rawSnippet)).trim();
      if (!snippet || isPlaceholderString(snippet) || isPureGeographicLabel(snippet)) {
        continue;
      }
      if (combinedDescParts.some(p => p.includes(snippet))) {
        continue;
      }

      const res = classifyContext(snippet);
      if (res.category && res.isMeaningful) {
        if (!categorizedContext[res.category]) {
          categorizedContext[res.category] = [];
        }
        if (!categorizedContext[res.category]!.includes(snippet)) {
          categorizedContext[res.category]!.push(snippet);
        }
      }
    }

    // Append only active, categorized context sections with semantic headings
    for (const [category, snippets] of Object.entries(categorizedContext) as [ContextCategory, string[]][]) {
      if (snippets && snippets.length > 0) {
        const heading = CONTEXT_CATEGORY_HEADINGS[category];
        const mergedText = snippets.join(' ');
        if (mergedText && !combinedDescParts.some(p => p.includes(mergedText))) {
          combinedDescParts.push(`## ${heading}\n\n${mergedText}`);
        }
      }
    }

    let desc = combinedDescParts.join('\n\n');

    // 3. Context Notes
    const contextNotes: any[] = [];
    let contextNotesSource = "None";

    const normalizeContextNotes = (notes: any) => {
        if (!notes) return [];
        if (Array.isArray(notes)) {
            return notes.map(n => (typeof n === 'object' && n.text) ? n.text : String(n));
        }
        return [typeof notes === 'object' && notes.text ? notes.text : String(notes)];
    };

    if (rawInfo.contextNotes) {
      contextNotes.push(...normalizeContextNotes(rawInfo.contextNotes));
      contextNotesSource = "rawInfo.contextNotes";
    } else if (wp.contextNotes) {
      contextNotes.push(...normalizeContextNotes(wp.contextNotes));
      contextNotesSource = "wp.contextNotes";
    }

    // 3b. Significance
    const significance = rawInfo.significance || wp.significance || null;

    // 4. Coordinates
    const coordinates = wp.coordinates || rawInfo.coordinates;

    // 5. Population and Climate
    let population = null;
    const rawEntityType = (wp.entityType || rawInfo.entityType || rawInfo.type || '').toString().toLowerCase();
    const isSettlement = rawEntityType === 'city' || rawEntityType === 'town' || rawEntityType === 'village' || rawEntityType === 'municipality' || rawEntityType === 'settlement' || rawEntityType === 'country' || rawEntityType === 'state';

    if (rawInfo.population && isSettlement && rawInfo.population.status !== 'lookup_failed' && rawInfo.population.status !== 'not_applicable') {
        let currentItem: any = null;
        let historicalItem: any = null;

        if (typeof rawInfo.population === "string" || typeof rawInfo.population === "number") {
            const rawStr = String(rawInfo.population).trim();
            if (!isPlaceholderString(rawStr)) {
                const num = typeof rawInfo.population === "number" ? rawInfo.population : parseInt(rawStr.replace(/,/g, ''), 10);
                if (!isNaN(num) && num > 0) {
                    currentItem = {
                        value: num,
                        formattedValue: typeof rawInfo.population === "number" ? num.toLocaleString() : rawStr,
                        label: "Current Estimate"
                    };
                }
            }
        } else if (typeof rawInfo.population === "object" && rawInfo.population !== null) {
            const pObj = rawInfo.population;

            // Current / recent population
            if (pObj.current) {
                if (typeof pObj.current === "object") {
                    const c = pObj.current;
                    const val = c.value !== undefined && c.value !== null ? Number(c.value) : (c.formattedValue ? parseInt(String(c.formattedValue).replace(/,/g, ''), 10) : null);
                    const formatted = c.formattedValue || (val && !isNaN(val) ? val.toLocaleString() : String(c.value || ""));
                    if (formatted && !isPlaceholderString(formatted) && val !== 0) {
                        currentItem = {
                            value: val,
                            formattedValue: formatted,
                            year: c.year || pObj.year || pObj.populationYear,
                            censusYear: c.censusYear || pObj.censusYear,
                            timeframe: c.timeframe || pObj.timeframe,
                            label: c.label || pObj.label,
                            source: c.source || pObj.source
                        };
                    }
                } else if (typeof pObj.current === "string" || typeof pObj.current === "number") {
                    const cStr = String(pObj.current).trim();
                    if (!isPlaceholderString(cStr)) {
                        const val = typeof pObj.current === "number" ? pObj.current : parseInt(cStr.replace(/,/g, ''), 10);
                        if (!isNaN(val) && val > 0) {
                            currentItem = {
                                value: val,
                                formattedValue: typeof pObj.current === "number" ? val.toLocaleString() : cStr,
                                year: pObj.year || pObj.populationYear,
                                censusYear: pObj.censusYear,
                                timeframe: pObj.timeframe,
                                label: pObj.label,
                                source: pObj.source
                            };
                        }
                    }
                }
            } else if (pObj.value !== undefined && pObj.value !== null && pObj.status !== 'lookup_failed' && pObj.status !== 'not_applicable') {
                const val = Number(pObj.value);
                if (!isNaN(val) && val > 0) {
                    currentItem = {
                        value: val,
                        formattedValue: pObj.formattedValue || val.toLocaleString(),
                        year: pObj.year || pObj.populationYear,
                        censusYear: pObj.censusYear,
                        timeframe: pObj.timeframe,
                        label: pObj.label,
                        source: pObj.source
                    };
                }
            }

            // Historical population
            if (pObj.historical) {
                if (typeof pObj.historical === "object") {
                    const h = pObj.historical;
                    const val = h.value !== undefined && h.value !== null ? Number(h.value) : (h.formattedValue ? parseInt(String(h.formattedValue).replace(/,/g, ''), 10) : null);
                    const formatted = h.formattedValue || (val && !isNaN(val) ? val.toLocaleString() : String(h.value || ""));
                    if (formatted && !isPlaceholderString(formatted)) {
                        historicalItem = {
                            value: val,
                            formattedValue: formatted,
                            timeframe: isPlaceholderString(h.timeframe) ? "" : h.timeframe,
                            year: h.year,
                            label: h.label && !h.label.toLowerCase().includes('population') ? h.label : "Historical",
                            source: h.source || pObj.source
                        };
                    }
                } else if (typeof pObj.historical === "string" || typeof pObj.historical === "number") {
                    const hStr = String(pObj.historical).trim();
                    if (!isPlaceholderString(hStr)) {
                        historicalItem = {
                            formattedValue: typeof pObj.historical === "number" ? pObj.historical.toLocaleString() : hStr,
                            timeframe: "",
                            label: "Historical",
                            source: pObj.source
                        };
                    }
                }
            }
        }

        if (currentItem || historicalItem) {
            population = {
                current: currentItem,
                historical: historicalItem
            };
        }
    }
    const populationSource = population ? "Enriched Geographic Metadata (rawInfo.population)" : "None";

    let climate = null;
    if (rawInfo.climate) {
        let cName = "";
        let cDesc = "";
        if (typeof rawInfo.climate === 'string') {
            cName = rawInfo.climate;
        } else if (typeof rawInfo.climate === 'object') {
            cName = rawInfo.climate.name || rawInfo.climate.value || "";
            cDesc = rawInfo.climate.description || "";
        }

        if (!isPlaceholderString(cName)) {
            climate = {
                name: cName,
                description: isPlaceholderString(cDesc) ? "" : cDesc,
                koppenCode: rawInfo.climate.koppenCode || ""
            };
        }
    }
    const climateSource = climate ? "Enriched Geographic Metadata (rawInfo.climate)" : "None";

    // console.log("=== INFOPANEL FIELD TRACING ===");
    // console.log("Description Source:", descSource);
    // console.log("Context Notes Source:", contextNotesSource);
    // console.log("Population Source:", populationSource);

    // 6. Safe Arrays
    let news: any[] = [];
    if (Array.isArray(rawInfo.news)) {
      news = rawInfo.news;
    } else if (rawInfo.news && typeof rawInfo.news === 'object') {
      news = [rawInfo.news];
    } else if (typeof rawInfo.news === 'string') {
      news = [{ title: "Latest News", summary: rawInfo.news }];
    }

    news = news.map(n => ({
       title: n.title || n.headline || "News Update",
       summary: n.summary || n.description || n.snippet || "",
       url: n.url || n.link || "#",
       source: n.source || n.publisher || "News Source",
       date: n.date || n.publishedDate || n.pubDate || n.time || ""
    }));

    let notable: any[] = [];
    if (Array.isArray(rawInfo.notable)) {
        notable = deduplicateNotableFacts(rawInfo.notable.map(parseNotableFactItem).filter(Boolean));
    } else if (rawInfo.notable && typeof rawInfo.notable === 'object') {
        const parsed = parseNotableFactItem(rawInfo.notable);
        if (parsed) notable = [parsed];
    } else if (typeof rawInfo.notable === 'string') {
        const parsed = parseNotableFactItem(rawInfo.notable);
        if (parsed) notable = [parsed];
    }

    const relatedEntities = (rawInfo.relatedEntities && rawInfo.relatedEntities.length > 0) ? rawInfo.relatedEntities : [];

    return {
      ...rawInfo,
      name,
      canonicalName: rawInfo.canonicalName || (wp as any)?.canonicalName || name,
      type: wp.type || rawInfo.type || LocationType.POI,
      entityType: wp.entityType || rawInfo.entityType,
      intent: rawInfo.intent || (wp as any)?.intent,
      historicalContext: rawInfo.historicalContext || (wp as any)?.historicalContext,
      historicalPeriod: (wp as any)?.historicalPeriod || (rawInfo as any)?.historicalPeriod,
      routeTitle: (wp as any)?.routeTitle || (rawInfo as any)?.routeTitle || (rawInfo as any)?.routeContext?.title,
      entities: (wp as any)?.entities || (rawInfo as any)?.entities,
      highlights: (wp as any)?.highlights || (rawInfo as any)?.highlights,
      // Route Context Source Precedence:
      // 1. rawInfo.routeContext
      // 2. wp.routeContext
      // 3. wp.routeContextText
      // 4. authoritative route-specific historical content
      // 5. undefined
      routeContext: rawInfo.routeContext
        ? rawInfo.routeContext
        : (wp.routeContext
          ? wp.routeContext
          : (wp.routeContextText
            ? { title: wp.routeGroupName || 'Route Context', text: wp.routeContextText }
            : undefined)),
      description: desc,
      population,
      climate,
      contextNotes,
      significance,
      coordinates: wp.coordinates || rawInfo.coordinates || { lat: 0, lng: 0 },
      boundary: rawInfo.boundary,
      news,
      notable,
      relatedEntities,
      waypoint: rawInfo.waypoint || undefined
    };
  }, [rawInfo, isSingleLocation, isMultiLocation]);

  const displayCategory = useMemo(() => {
    if (!info) return '';
    const rawType = (info.entityType || (info.waypoint as any)?.entityType || info.type || '').toString().toLowerCase();
    if (rawType === 'historical_event') {
      return 'Historical Event';
    }
    if (rawType === 'historical_event_site') {
      return 'Historical Event Site';
    }
    const isHistorical = rawType.includes('historical') || rawType.includes('historic') || rawType === 'battlefield' || (info.waypoint && isSingleLocation);

    if (isSingleLocation && isHistorical) {
      return 'Historical Site';
    }
    const formatted = formatUserFacingCategory(info.entityType, info.name, info.type);
    if (isSingleLocation && (formatted.toLowerCase() === 'historical waypoint' || formatted.toLowerCase() === 'waypoint')) {
      return 'Historical Site';
    }
    return formatted;
  }, [info, isSingleLocation]);

  const { displayTitle, displaySubtitle, displayAltNames } = useMemo(() => {
    if (!info) return { displayTitle: '', displaySubtitle: null, displayAltNames: null };
    return normalizeHeaderGeographicHierarchy(info, undefined, isSingleLocation);
  }, [info, isSingleLocation]);

  const [newsState, setNewsState] = useState<'idle' | 'loading' | 'loaded' | 'empty' | 'error'>(() => {
    if (rawInfo?.news && Array.isArray(rawInfo.news) && rawInfo.news.length > 0) {
      return 'loaded';
    }
    return 'idle';
  });
  const [newsList, setNewsList] = useState<any[]>(() => {
    if (rawInfo?.news && Array.isArray(rawInfo.news) && rawInfo.news.length > 0) {
      return rawInfo.news;
    }
    return [];
  });
  const [isMoreNewsLoading, setIsMoreNewsLoading] = useState(false);
  const locationNewsRef = useRef<string | null>(rawInfo?.name || null);

  const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'entities'>('overview');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [wikiImage, setWikiImage] = useState<string | null>(null);

  const [showFavoriteDialog, setShowFavoriteDialog] = useState(false);
  const [favoriteNameInput, setFavoriteNameInput] = useState("");

  const [notes, setNotes] = useState<Note[]>([]);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");

  const newNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editNoteTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isAddingNote) {
      newNoteTextareaRef.current?.focus();
    }
  }, [isAddingNote]);

  useEffect(() => {
    if (editingNoteId) {
      editNoteTextareaRef.current?.focus();
    }
  }, [editingNoteId]);

  const locationInitializedRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fadeState = calculateScrollFade(el.scrollTop, el.scrollHeight, el.clientHeight);
    setScrollFade(prev => {
      if (prev.top === fadeState.top && prev.bottom === fadeState.bottom) return prev;
      return fadeState;
    });
  }, []);

  useEffect(() => {
    updateScrollFade();
  }, [info, newsState, activeTab, isError, isLoading, updateScrollFade]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollFade();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        updateScrollFade();
      });
      ro.observe(el);
      if (el.firstElementChild) {
        ro.observe(el.firstElementChild);
      }
      return () => ro.disconnect();
    }
  }, [updateScrollFade]);

  const maskStyle = useMemo(() => {
    return getScrollFadeMaskStyle(scrollFade.top, scrollFade.bottom);
  }, [scrollFade.top, scrollFade.bottom]);

  useEffect(() => {
    setImages([]);
    setCurrentImageIndex(0);
    setWikiImage(null);
    setActiveTab('overview');
    setShowFavoriteDialog(false);

    const locName = info?.name || "";
    if (locationNewsRef.current !== locName) {
      locationNewsRef.current = locName;
      if (rawInfo?.news && Array.isArray(rawInfo.news) && rawInfo.news.length > 0) {
        setNewsState('loaded');
        setNewsList(rawInfo.news);
      } else {
        setNewsState('idle');
        setNewsList([]);
      }
    } else if (rawInfo?.news && Array.isArray(rawInfo.news) && rawInfo.news.length > 0) {
      setNewsList(rawInfo.news);
      setNewsState('loaded');
    }
  }, [info?.name, rawInfo?.news]);

  const handleLoadInitialNews = async () => {
    if (!info?.name || showNews === false) return;
    const infoStart = Date.now();
    console.log(`[NEWS TRACE] InfoPanel request START location="${info.name}"`);
    setNewsState('loading');
    try {
      if (onFetchNews) {
        const res = await onFetchNews();
        const items = Array.isArray(res) ? res : (rawInfo?.news || []);
        const infoElapsed = Date.now() - infoStart;
        console.log(`[NEWS TRACE] InfoPanel received articles=${items?.length || 0} elapsed=${infoElapsed}ms`);
        if (items && items.length > 0) {
          setNewsList(items);
          setNewsState('loaded');
        } else {
          setNewsList([]);
          setNewsState('empty');
        }
      } else {
        const items = await fetchAndValidateLocationNews(info.name, info);
        const infoElapsed = Date.now() - infoStart;
        console.log(`[NEWS TRACE] InfoPanel received articles=${items?.length || 0} elapsed=${infoElapsed}ms`);
        if (items && items.length > 0) {
          setNewsList(items);
          setNewsState('loaded');
        } else {
          setNewsList([]);
          setNewsState('empty');
        }
      }
    } catch (err: any) {
      const infoElapsed = Date.now() - infoStart;
      console.error(`[NEWS TRACE] ERROR stage=InfoPanel elapsed=${infoElapsed}ms message="${err?.message}"`);
      console.error("Failed to load news:", err);
      setNewsState('error');
    }
  };

  const handleLoadMore = async () => {
    if (!info?.name || showNews === false) return;
    setIsMoreNewsLoading(true);
    try {
      if (onLoadMoreNews) {
        await onLoadMoreNews();
      }
    } catch (err) {
      console.error("Failed to load more news:", err);
    } finally {
      setIsMoreNewsLoading(false);
    }
  };

  useEffect(() => {
    if (!info) {
        setNotes([]);
        return;
    }

    const locationKey = `notes_${info.name}_${(info.coordinates?.lat || 0).toFixed(4)}_${(info.coordinates?.lng || 0).toFixed(4)}`;

    const isNewLocation = locationInitializedRef.current !== locationKey;

    if (isNewLocation) {
        locationInitializedRef.current = locationKey;
        const savedNotes = localStorage.getItem(locationKey);
        if (savedNotes) {
            try {
                const parsed = JSON.parse(savedNotes);
                setNotes(parsed);
                if (parsed.length > 0) setIsNotesExpanded(true);
                else setIsNotesExpanded(false);
            } catch (e) {
                setNotes([]);
                setIsNotesExpanded(false);
            }
        } else if (info.defaultNote) {
            const defNote: Note = {
                id: `default-${Date.now()}`,
                text: info.defaultNote,
                timestamp: Date.now()
            };
            const initialNotes = [defNote];
            setNotes(initialNotes);
            setIsNotesExpanded(true);
            localStorage.setItem(locationKey, JSON.stringify(initialNotes));
        } else {
            setNotes([]);
            setIsNotesExpanded(false);
        }
    }
  }, [info]);

  const saveNotesToStorage = (updatedNotes: Note[]) => {
    if (!info) return;
    const locationKey = `notes_${info.name}_${(info.coordinates?.lat || 0).toFixed(4)}_${(info.coordinates?.lng || 0).toFixed(4)}`;
    localStorage.setItem(locationKey, JSON.stringify(updatedNotes));
    setNotes(updatedNotes);
  };

  const handleStartAddNote = () => {
    setEditingNoteId(null);
    setEditNoteText("");
    setNewNoteText("");
    setIsNotesExpanded(true);
    setIsAddingNote(true);
  };

  const handleSaveNewNote = () => {
    if (!newNoteText.trim()) return;

    const note: Note = {
      id: Date.now().toString(),
      text: newNoteText.trim(),
      timestamp: Date.now()
    };

    const updated = [...notes, note];
    saveNotesToStorage(updated);
    setNewNoteText("");
    setIsAddingNote(false);
  };

  const handleCancelNewNote = () => {
    setNewNoteText("");
    setIsAddingNote(false);
    if (notes.length === 0) {
      setIsNotesExpanded(false);
    }
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    saveNotesToStorage(updated);
    if (editingNoteId === id) {
      setEditingNoteId(null);
      setEditNoteText("");
    }
  };

  const startEditing = (note: Note) => {
    setIsAddingNote(false);
    setNewNoteText("");
    setEditingNoteId(note.id);
    setEditNoteText(note.text);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteText("");
  };

  const saveEdit = (id: string) => {
    if (editNoteText.trim() === "") {
      handleDeleteNote(id);
    } else {
      const updated = notes.map(n => n.id === id ? { ...n, text: editNoteText.trim() } : n);
      saveNotesToStorage(updated);
    }
    setEditingNoteId(null);
    setEditNoteText("");
  };

  const hasNotes = (notes && notes.length > 0) || isAddingNote;

  const handleFavoriteClick = () => {
    if (showFavoriteDialog) {
        setShowFavoriteDialog(false);
        return;
    }

    if (isFavorite && currentFavoriteName) {
        setFavoriteNameInput(currentFavoriteName);
    } else {
        if (routeNav) {
            const defaultName = generateDefaultRouteName({
                routeTitle: (info as any)?.routeTitle || info?.routeContext?.title,
                routeGroupName: routeNav.routeGroupName,
                locationName: info?.name,
                canonicalName: (info as any)?.canonicalName
            });
            setFavoriteNameInput(defaultName);
        } else {
            setFavoriteNameInput(info?.name || "");
        }
    }
    setShowFavoriteDialog(true);
  };

  const submitFavorite = (e: React.FormEvent) => {
    e.preventDefault();
    if (favoriteNameInput.trim()) {
        onSaveFavorite(favoriteNameInput.trim());
        setShowFavoriteDialog(false);
    }
  };

  useEffect(() => {
    if (!info?.name) {
      setImages([]);
      setWikiImage(null);
      return;
    }

    const fetchImages = async () => {
      try {
        const searchContext = {
          searchId: (info as any)?.searchId || (rawInfo as any)?.searchId,
          waypointId: (info as any)?.waypoint?.id || (info as any)?.id || info.name,
          relatedWaypoints: (info as any)?.relatedWaypoints
        };
        const foundImages = await fetchAndValidateImages(info, searchContext);
        setImages(foundImages);
        setWikiImage(foundImages[0]?.url || null);
      } catch (e) {
        console.error("Failed to fetch image", e);
        setImages([]);
        setWikiImage(null);
      }
    };
    fetchImages();
  }, [info?.name, (info as any)?.canonicalName, info?.city, info?.country, info?.coordinates?.lat, info?.coordinates?.lng, info?.imageSearchTerm, info?.primaryImage, info?.images, info?.image, info?.imageCaption, (info as any)?.imageAttribution, (info as any)?.routeTitle, (info as any)?.historicalPeriod, (info as any)?.significance, (info as any)?.entityType, (info as any)?.searchId, (rawInfo as any)?.searchId]);

  const themes = {
    'modern': {
      container: "bg-black/75 backdrop-blur-md border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      panelBg: "bg-transparent",
      header: "bg-gradient-to-r from-blue-900 to-cyan-900",
      headerTitle: "brand-font text-white",
      locationTitle: "brand-font text-white",
      tag: "text-cyan-300 border-cyan-400/50 bg-cyan-900/60 rounded-full",
      subtext: "text-cyan-200 opacity-90",
      bodyText: "text-gray-100",
      card: "bg-white/10 border border-white/20 rounded-lg hover:bg-white/15 transition-colors block relative group",
      icon: "text-cyan-300",
      tabActive: "border-b-2 border-cyan-400 text-cyan-400 bg-cyan-900/20",
      tabInactive: "text-gray-400 hover:text-white hover:bg-white/5",
      listDot: "bg-cyan-400 rounded-full",
      closeBtn: "hover:bg-white/20 text-white rounded-full",
      actionBtn: "hover:bg-white/20 text-white rounded-full",
      loadMoreBtn: "bg-white/5 border border-white/20 hover:bg-white/10 text-cyan-300 rounded-lg text-xs tracking-widest uppercase font-bold",
      notesInput: "bg-black/40 border border-white/20 text-white placeholder-gray-400 focus:border-cyan-400 rounded-lg",
      noteCard: "bg-black/40 border border-white/10 rounded-lg",
      navBtn: "bg-white/10 hover:bg-white/20 text-white border border-white/10",
      popover: "bg-slate-900 border border-cyan-500/50 rounded-lg shadow-xl"
    },
    'retro-green': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      panelBg: "bg-transparent",
      header: "bg-green-900/30",
      headerTitle: "text-green-300 uppercase",
      locationTitle: "text-green-300 uppercase",
      tag: "text-black bg-green-400 border-green-400 rounded-none font-bold",
      subtext: "text-green-300",
      bodyText: "text-green-200",
      card: "bg-black border border-green-400 rounded-none hover:bg-green-900/20 block relative group",
      icon: "text-green-300",
      tabActive: "bg-green-400 text-black border-2 border-green-400",
      tabInactive: "text-green-400 border-2 border-transparent hover:border-green-400/50",
      listDot: "bg-green-400 rounded-none",
      closeBtn: "hover:bg-green-400 hover:text-black text-green-300 border border-green-400 rounded-none",
      actionBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none",
      loadMoreBtn: "bg-green-900/30 border border-green-400 hover:bg-green-400 hover:text-black text-green-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro",
      notesInput: "bg-black border border-green-400 text-green-300 placeholder-green-400/50 focus:bg-green-900/20 rounded-none font-retro",
      noteCard: "bg-black border border-green-400 rounded-none",
      navBtn: "bg-black border border-green-400 hover:bg-green-400 hover:text-black text-green-300",
      popover: "bg-black border-2 border-green-400 rounded-none shadow-[0_0_10px_rgba(74,222,128,0.4)]"
    },
    'retro-amber': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      panelBg: "bg-transparent",
      header: "bg-amber-900/30",
      headerTitle: "text-amber-300 uppercase",
      locationTitle: "text-amber-300 uppercase",
      tag: "text-black bg-amber-400 border-amber-400 rounded-none font-bold",
      subtext: "text-amber-300",
      bodyText: "text-amber-200",
      card: "bg-black border border-amber-400 rounded-none hover:bg-amber-900/20 block relative group",
      icon: "text-amber-300",
      tabActive: "bg-amber-400 text-black border-2 border-amber-400",
      tabInactive: "text-amber-400 border-2 border-transparent hover:border-amber-400/50",
      listDot: "bg-amber-400 rounded-none",
      closeBtn: "hover:bg-amber-400 hover:text-black text-amber-300 border border-amber-400 rounded-none",
      actionBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none",
      loadMoreBtn: "bg-amber-900/30 border border-amber-400 hover:bg-amber-400 hover:text-black text-amber-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro",
      notesInput: "bg-black border border-amber-400 text-amber-300 placeholder-amber-400/50 focus:bg-amber-900/20 rounded-none font-retro",
      noteCard: "bg-black border border-amber-400 rounded-none",
      navBtn: "bg-black border border-amber-400 hover:bg-amber-400 hover:text-black text-amber-300",
      popover: "bg-black border-2 border-amber-400 rounded-none shadow-[0_0_10px_rgba(251,191,36,0.4)]"
    },
    'parchment': {
      container: "shadow-[4px_4px_10px_rgba(0,0,0,0.3)] text-[#3e2723] font-sans",
      panelBg: "bg-transparent",
      header: "",
      headerTitle: "text-[#8b5a2b] uppercase tracking-wider brand-font",
      locationTitle: "text-[#8b5a2b] font-garamond tracking-wide",
      tag: "text-[#3e2723] bg-[#d2b48c] rounded-sm font-bold shadow-sm",
      subtext: "text-[#8b5a2b]",
      bodyText: "text-[#5c3a21]",
      card: "bg-[#f4ead5] shadow-[inset_1px_1px_4px_rgba(255,255,255,0.4)] rounded-sm hover:bg-[#e8d5b5] transition-colors block relative group",
      icon: "text-[#8b5a2b]",
      tabActive: "text-[#3e2723] font-bold bg-[#e8d5b5]/40",
      tabInactive: "text-[#8b5a2b] hover:bg-[#e8d5b5]/50 hover:text-[#5c3a21]",
      listDot: "bg-[#8b5a2b] rounded-sm",
      closeBtn: "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 hover:bg-[#d2b48c]/50 hover:text-[#5c3a21] text-[#8b5a2b] rounded",
      actionBtn: "text-[#8b5a2b] rounded",
      loadMoreBtn: "bg-transparent hover:bg-transparent text-[#5c3a21] rounded-sm text-sm tracking-widest uppercase font-bold",
      notesInput: "bg-[#f4ead5]/40 border border-[#8b5a2b]/30 text-[#522B07] placeholder-[#8b5a2b]/60 focus:border-[#8b5a2b]/70 shadow-[inset_0_1px_2px_rgba(139,90,43,0.1)] rounded-sm outline-none caret-[#522B07]",
      noteCard: "bg-[#f4ead5]/40 border border-[#8b5a2b]/20 rounded-sm shadow-sm",
      navBtn: "bg-transparent hover:text-[#3e2723] text-[#5c3a21] hover:opacity-80 transition-opacity",
      popover: "bg-[#f4ead5] rounded-sm shadow-[0_4px_15px_rgba(0,0,0,0.4)]"
    }
  };

  const theme = themes[skin];
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  const isParchment = skin === 'parchment';

  const titleSize = isRetro ? 'text-2xl' : 'text-2xl';
  const subtextSize = isRetro ? 'text-sm' : 'text-xs';
  const bodySize = isRetro ? 'text-lg' : 'text-sm';
  const smallTextSize = isRetro ? 'text-sm' : 'text-xs';
  const tabTextSize = isRetro ? 'text-xl' : 'text-xs';
  const tabIconSize = isRetro ? 18 : 14;

  const sectionHeaderStyle = isRetro ? 'text-sm font-bold uppercase tracking-wider text-current leading-tight' : isParchment ? 'text-xs font-bold uppercase tracking-wider text-[#8b5a2b] leading-tight' : 'text-xs font-bold uppercase tracking-wider text-white/95 leading-tight';
  const semanticTitleStyle = isRetro ? 'font-bold text-xl text-current leading-snug' : isParchment ? 'font-bold text-sm text-[#8b5a2b] leading-snug' : 'font-bold text-sm text-white/95 leading-snug';
  const bodyTextStyle = `font-normal ${bodySize} ${theme.bodyText} opacity-90 leading-relaxed`;
  const metaStyle = isRetro ? (skin === 'retro-amber' ? 'text-xs text-amber-300/70 font-mono' : 'text-xs text-green-300/70 font-mono') : isParchment ? 'text-xs text-[#8b5a2b]/75 font-sans' : 'text-xs text-white/60 font-sans';

  const notesTextareaClass = isParchment
    ? 'bg-[#f4ead5]/40 border border-[#8b5a2b]/30 focus:border-[#8b5a2b]/70 shadow-[inset_0_1px_2px_rgba(139,90,43,0.1)] rounded-sm text-[#522B07] placeholder-[#8b5a2b]/60 caret-[#522B07]'
    : skin === 'retro-green'
    ? 'bg-black border border-green-400 focus:bg-green-900/20 text-green-300 placeholder-green-400/50 rounded-none font-retro'
    : skin === 'retro-amber'
    ? 'bg-black border border-amber-400 focus:bg-amber-900/20 text-amber-300 placeholder-amber-400/50 rounded-none font-retro'
    : 'bg-black/40 border border-white/20 focus:border-cyan-400 text-white placeholder-gray-400 rounded-lg';

  const noteSaveBtnThemeClass = isParchment
    ? 'text-[#8b5a2b] hover:text-[#3e2723]'
    : skin === 'retro-amber'
    ? 'text-amber-400 hover:text-amber-200'
    : isRetro
    ? 'text-green-400 hover:text-green-200'
    : 'text-cyan-400 hover:text-cyan-200';

  const noteCancelBtnThemeClass = isParchment
    ? 'text-[#8b5a2b] hover:text-[#3e2723]'
    : skin === 'retro-amber'
    ? 'text-amber-400 hover:text-red-400'
    : isRetro
    ? 'text-green-400 hover:text-red-400'
    : 'text-gray-400 hover:text-red-400';

  const noteEditBtnThemeClass = isParchment
    ? 'text-[#8b5a2b] hover:text-[#3e2723]'
    : skin === 'retro-amber'
    ? 'hover:text-amber-200'
    : isRetro
    ? 'hover:text-green-200'
    : 'hover:text-cyan-200';

  const noteDeleteBtnThemeClass = isParchment
    ? 'text-[#8b5a2b] hover:text-red-700'
    : skin === 'retro-amber'
    ? 'hover:text-red-400 text-amber-400/70'
    : isRetro
    ? 'hover:text-red-400 text-green-400/70'
    : 'text-gray-400 hover:text-red-400';

  const handleFetchNews = useCallback(() => {
    if (!onFetchNews) return;
    setNewsState('loading');
    onFetchNews();
  }, [onFetchNews]);

  const handleLoadMoreNews = async () => {
    if (isMoreNewsLoading || !onLoadMoreNews) return;
    setIsMoreNewsLoading(true);
    try {
      await onLoadMoreNews();
    } finally {
      setIsMoreNewsLoading(false);
    }
  };

  const renderNoteText = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => {
      if (part.match(/^https?:\/\//)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline decoration-1 underline-offset-2 break-all ${isRetro ? 'hover:text-current font-bold' : isParchment ? 'text-[#8b5a2b] hover:text-[#5c3a21] font-bold' : 'text-cyan-400 hover:text-cyan-300'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const schema = ENTITY_SCHEMAS[info?.entityType || 'city'] || ENTITY_SCHEMAS['city'];

  interface SectionRenderer {
    render: () => React.ReactNode;
    copyText?: () => string;
  }

  const SECTION_RENDERERS: Record<string, SectionRenderer> = {
    overview: {
      copyText: () => {
        if (!info) return '';
        let parts: string[] = [];
        const isDuplicateHeader = Boolean(
          info.routeContext?.title &&
          (displayTitle.trim().toLowerCase() === info.routeContext.title.trim().toLowerCase() ||
           (displaySubtitle && displaySubtitle.trim().toLowerCase() === info.routeContext.title.trim().toLowerCase()))
        );
        const shouldIncludeRoute = !isDuplicateHeader && info.routeContext?.title && info.routeContext?.text;
        if (shouldIncludeRoute) {
          parts.push(`${info.routeContext.title}\n${info.routeContext.text}`);
        }
        const lines = getCleanDescriptionLines(info);
        const cleanText = lines.map(line => line.replace(/^#{1,3}\s/, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1')).join('\n');
        if (cleanText.trim()) {
          if (!shouldIncludeRoute || cleanText.trim() !== info.routeContext?.text?.trim()) {
            parts.push(cleanText.trim());
          }
        }
        return parts.join('\n\n').trim();
      },
      render: () => {
        const routeText = info.routeContext?.text?.trim() || "";
        const descText = info.description?.trim() || "";
        const hasRoute = !!info.routeContext && routeText.length > 0;
        const isDuplicateHeader = Boolean(
          info.routeContext?.title &&
          (displayTitle.trim().toLowerCase() === info.routeContext.title.trim().toLowerCase() ||
           (displaySubtitle && displaySubtitle.trim().toLowerCase() === info.routeContext.title.trim().toLowerCase()))
        );
        const renderRouteContext = !isDuplicateHeader && hasRoute;
        const hasDesc = descText.length > 0 && !isPlaceholderString(descText) && (!renderRouteContext || descText !== routeText);
        if (!hasDesc && !renderRouteContext) return null;

        return (
          <div className="space-y-4">
            {renderRouteContext && (
              <div className="mb-2">
                <SectionHeader
                  title={info.routeContext.title}
                  theme={theme}
                  isRetro={isRetro}
                  isParchment={isParchment}
                />
                <p className={`${bodyTextStyle} mb-3 border-b ${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-3`}>
                  {info.routeContext.text}
                </p>
              </div>
            )}
            {hasDesc && (
              <div className="relative group/desc">
                <div className="absolute top-0 -right-2 opacity-0 group-hover/desc:opacity-100 transition-opacity z-10">
                  <CopyButton text={fullCopyText} skin={skin} />
                </div>
                <div className={`pr-8 space-y-3`}>
                  {(() => {
                    const allLines = getCleanDescriptionLines(info);
                    const lines = renderRouteContext ? allLines.filter(l => l.trim() !== routeText) : allLines;
                    const blocks: React.ReactNode[] = [];
                    let currentList: string[] = [];

                    const flushList = (keyPrefix: number) => {
                      if (currentList.length > 0) {
                        blocks.push(
                          <ul key={`list-${keyPrefix}`} className={`list-disc pl-5 space-y-1 ${bodyTextStyle}`}>
                            {currentList.map((b, bIdx) => (
                              <li key={bIdx}>{b}</li>
                            ))}
                          </ul>
                        );
                        currentList = [];
                      }
                    };

                    const redundantHeadings = [
                      'significance', 'historical region', 'historical milestone',
                      'strategic location', 'cultural symbol', 'description', 'overview',
                      'notable facts', 'notable fact', 'notable', 'fun facts', 'fun fact',
                      'quick facts', 'quick fact', 'key facts', 'key fact', 'fast facts', 'interesting facts'
                    ];

                    lines.forEach((line: string, i: number) => {
                      let text = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1');

                      if (text.match(/^[-*]\s/)) {
                        currentList.push(text.replace(/^[-*]\s/, ''));
                        return;
                      }

                      flushList(i);

                      const isMarkdownHeading = text.startsWith('## ') || text.startsWith('# ');
                      const cleanedText = text.replace(/^#{1,3}\s/, '');
                      const isRedundantHeading = redundantHeadings.includes(cleanedText.toLowerCase().trim());

                      if (isRedundantHeading) {
                        // Skip redundant fragment headings - keep content dense and unified
                        return;
                      }

                      const isHeuristicHeading = cleanedText.split(' ').length <= 8 && cleanedText.length < 60 && !cleanedText.match(/[.!?:;]$/) && !cleanedText.match(/^[a-z]/) && lines[i+1] && !lines[i+1].match(/^[-*]\s/);

                      if (isMarkdownHeading || isHeuristicHeading) {
                        blocks.push(
                          <h3 key={`h-${i}`}
                            className={`mt-3 mb-1.5 ${semanticTitleStyle}`}>
                            {cleanedText}
                          </h3>
                        );
                      } else {
                        const isFirstParagraph = !blocks.some(b => (b as any).type === 'p');
                        if (isParchment && isFirstParagraph && cleanedText.length > 0) {
                          blocks.push(
                            <p key={`p-${i}`} className={`clear-both parchment-drop-cap ${bodyTextStyle}`}>
                              {cleanedText}
                            </p>
                          );
                        } else {
                          blocks.push(<p key={`p-${i}`} className={bodyTextStyle}>{cleanedText}</p>);
                        }
                      }
                    });

                    flushList(lines.length);
                    return blocks;
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      }
    },

    gallery: {
      render: () => {
        const imageCandidates: GalleryImage[] = [];

        if (images && images.length > 0) {
          imageCandidates.push(...images);
        }
        if (Array.isArray(info.images) && info.images.length > 0) {
          imageCandidates.push(
            ...info.images.map((im: any) => (typeof im === 'string' ? { url: im } : im))
          );
        }
        if (info.primaryImage) {
          imageCandidates.push(
            typeof info.primaryImage === 'string' ? { url: info.primaryImage } : info.primaryImage
          );
        }
        if (info.image && typeof info.image === 'string') {
          imageCandidates.push({
            url: info.image,
            caption: cleanMetadataString(info.imageCaption),
            attribution: cleanMetadataString((info as any).imageAttribution),
          });
        }
        if (wikiImage) {
          imageCandidates.push({
            url: wikiImage,
            caption: cleanMetadataString(info.imageCaption),
            attribution: cleanMetadataString((info as any).imageAttribution),
          });
        }

        if (imageCandidates.length === 0) return null;

        return (
          <StackedImageCarousel
            images={imageCandidates}
            locationName={info.name || 'Location'}
            fallbackCaption={info.imageCaption}
            fallbackAttribution={(info as any).imageAttribution}
            skin={skin}
            theme={theme}
            initialIndex={currentImageIndex}
            onIndexChange={setCurrentImageIndex}
          />
        );
      }
    },

    notable: {
      copyText: () => {
        if (!info || !Array.isArray(info.notable) || info.notable.length === 0) return '';
        const uniqueFacts = deduplicateNotableFacts(info.notable);
        let txt = `Notable Facts\n\n`;
        txt += uniqueFacts.map((n: any) => {
          const title = normalizeDisplayText(n.title || n.name || (typeof n === 'string' ? n : ''));
          const desc = normalizeDisplayText(n.description || n.summary || '');
          return `${title}${desc ? `\n${desc}` : ''}`;
        }).join('\n\n');
        return txt.trim();
      },
      render: () => {
        if (!Array.isArray(info.notable) || info.notable.length === 0) return null;
        const uniqueFacts = deduplicateNotableFacts(info.notable);
        if (uniqueFacts.length === 0) return null;

        return (
          <div className="space-y-2">
            <SectionHeader
              title="Notable Facts"
              theme={theme}
              isRetro={isRetro}
              isParchment={isParchment}
            />
            <div className="space-y-3">
              {uniqueFacts.map((rawN: any, i: number) => {
                const n = parseNotableFactItem(rawN) || rawN;
                const title = normalizeDisplayText(n.title || n.name || (typeof n === 'string' ? n : ''));
                const description = normalizeDisplayText(n.description || n.summary || (n.text && n.text !== title ? n.text : ''));
                if (!title && !description) return null;
                return (
                  <div key={`notable-${i}`} className="space-y-0.5">
                    {title && (
                      <h4 className={semanticTitleStyle}>
                        {title}
                      </h4>
                    )}
                    {description && (
                      <p className={bodyTextStyle}>
                        {description}
                      </p>
                    )}
                    {n.wikipediaUrl && (
                      <a href={n.wikipediaUrl} target="_blank" rel="noopener noreferrer" className={`text-xs inline-flex items-center gap-1 mt-0.5 hover:opacity-80 transition-opacity ${(theme as any).actionText || 'text-blue-400'}`}>
                        Learn more →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    },

    historicalContext: { render: () => null },
    historicalPeriod: { render: () => null },
    keyFigures: { render: () => null },

    modernContext: {
      copyText: () => {
         if (!info) return '';
         let txt = '';
         if (info.climate && !isPlaceholderString(info.climate.name)) {
             txt += `Climate\n${info.climate.name}\n${!isPlaceholderString(info.climate.description) ? info.climate.description : ''}\n\n`;
         }
         if (info.population) {
             txt += `Population\n`;
             if (info.population.historical && !isPlaceholderString(info.population.historical.formattedValue)) {
                 const histLabel = info.population.historical.label && !info.population.historical.label.toLowerCase().includes('population') ? info.population.historical.label : 'Historical';
                 txt += `${histLabel}: ${info.population.historical.formattedValue}`;
                 if (info.population.historical.timeframe && !isPlaceholderString(info.population.historical.timeframe)) {
                     txt += ` (${info.population.historical.timeframe})`;
                 }
                 txt += `\n`;
             }
             if (info.population.current && !isPlaceholderString(info.population.current.formattedValue)) {
                 const label = getPopulationLabel(info.population.current);
                 txt += `${label}: ${info.population.current.formattedValue}\n`;
             }
             txt += `\n`;
         }
         return txt.trim();
      },
      render: () => {
        const hasPop = info.population && ((info.population.historical && !isPlaceholderString(info.population.historical.formattedValue)) || (info.population.current && !isPlaceholderString(info.population.current.formattedValue)));
        const hasClimate = info.climate && !isPlaceholderString(info.climate.name);

        if (!hasPop && !hasClimate) return null;

        return (
         <div className="space-y-4">
           {hasClimate && (
             <div className="space-y-1">
                 <SectionHeader
                     title="Climate"
                     theme={theme}
                     isRetro={isRetro}
                     isParchment={isParchment}
                 />
                 <p className={semanticTitleStyle} style={{ textTransform: 'none' }}>
                   {formatClimateName(info.climate.name)}
                 </p>
                 {info.climate.description && !isPlaceholderString(info.climate.description) && (
                   <p className={bodyTextStyle}>{info.climate.description}</p>
                 )}
             </div>
           )}

           {hasPop && (
             <div className="space-y-1">
                 <SectionHeader
                     title="Population"
                     theme={theme}
                     isRetro={isRetro}
                     isParchment={isParchment}
                 />
                 {info.population.historical && !isPlaceholderString(info.population.historical.formattedValue) && (
                   <div className="mb-1">
                     <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
                       {info.population.historical.label && !info.population.historical.label.toLowerCase().includes('population') ? info.population.historical.label : "Historical"}
                     </span>
                     <p className={`${semanticTitleStyle} font-mono`}>{info.population.historical.formattedValue}</p>
                     {info.population.historical.timeframe && !isPlaceholderString(info.population.historical.timeframe) && (
                       <p className={`${metaStyle} font-mono mt-0.5`}>{info.population.historical.timeframe}</p>
                     )}
                   </div>
                 )}
                 {info.population.current && !isPlaceholderString(info.population.current.formattedValue) && (
                   <div>
                     <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
                       {getPopulationLabel(info.population.current)}
                     </span>
                     <p className={`${semanticTitleStyle} font-mono`}>{info.population.current.formattedValue}</p>
                   </div>
                 )}
             </div>
           )}
         </div>
        );
      }
    },

    liveNews: {
      copyText: () => {
         if (showNews === false || newsState === 'idle') return '';
         const effectiveNews = newsList.length > 0 ? newsList : (info?.news || []);
         if (!info || effectiveNews.length === 0) return '';
         let txt = `News\n`;
         effectiveNews.forEach((item: any) => {
             txt += `- ${normalizeDisplayText(item.title)}\n`;
         });
         return txt.trim();
      },
      render: () => {
        if (showNews === false) return null;
        const effectiveNews = newsList.length > 0 ? newsList : (info?.news || []);

        if (newsState === 'idle') {
          return (
            <button
              onClick={handleLoadInitialNews}
              className={`w-full py-2.5 transition-colors ${theme.loadMoreBtn}`}
            >
              Load News
            </button>
          );
        }

        return (
        <div className="space-y-3">
          <SectionHeader
              title="News"
              theme={theme}
              isRetro={isRetro}
              isParchment={isParchment}
          />

          {newsState === 'loading' && (
            <p className={`${bodyTextStyle} italic opacity-80`}>
              Loading news...
            </p>
          )}

          {newsState === 'empty' && (
            <p className={`${bodyTextStyle} opacity-80`}>
              No recent news found for this location.
            </p>
          )}

          {newsState === 'error' && (
            <div className="space-y-2">
              <p className={`${bodyTextStyle} text-red-400 opacity-90`}>
                Unable to load news.
              </p>
              <button
                onClick={handleLoadInitialNews}
                className={`w-full py-2.5 transition-colors ${theme.loadMoreBtn}`}
              >
                Try Again
              </button>
            </div>
          )}

          {newsState === 'loaded' && effectiveNews.length > 0 && (
            <>
              <div className="space-y-4">
                {effectiveNews.map((item: any, idx: number) => (
                   <div key={idx} className="space-y-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block ${semanticTitleStyle} hover:underline decoration-1 underline-offset-2`}
                      >
                        {normalizeDisplayText(item.title)}
                      </a>
                      {normalizeDisplayText(item.summary) && (
                         <p className={bodyTextStyle}>
                           {normalizeDisplayText(item.summary)}
                         </p>
                      )}
                      <div className={`flex items-center flex-wrap gap-1.5 ${metaStyle} pt-0.5`}>
                        <span>{item.source}</span>
                        {item.date && (
                          <>
                            <span>·</span>
                            <span>{item.date}</span>
                          </>
                        )}
                        <span>·</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 hover:opacity-100 opacity-80 transition-opacity"
                          title="Open news link"
                        >
                           <span>Read</span>
                           <ExternalLink size={11} className="inline" />
                        </a>
                      </div>
                   </div>
                ))}
              </div>
              <button
                onClick={handleLoadMore}
                disabled={isMoreNewsLoading}
                className={`w-full py-2.5 mt-2 transition-colors ${theme.loadMoreBtn}`}
              >
                {isMoreNewsLoading ? "Scanning..." : "Load More News"}
              </button>
            </>
          )}
        </div>
        );
      }
    },
    relatedPlaces: {
      render: () => {
      if (!info.relatedEntities || info.relatedEntities.length === 0) return null;
      return (
        <div className="space-y-3">
            <SectionHeader
                title="Related Places"
                icon={<MapPin size={16} />}
                theme={theme}
                isRetro={isRetro}
                isParchment={isParchment}
            />
            <div className="flex flex-wrap gap-2">
              {info.relatedEntities.map((place: any, i: number) => {
                 const text = normalizeDisplayText(place);
                 if (!text) return null;
                 return <span key={i} className={`px-2 py-1 text-xs rounded-full border ${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}`}>{text}</span>
              })}
            </div>
        </div>
      );
      }
    }
  };

  // Section aliases
  SECTION_RENDERERS.images = SECTION_RENDERERS.gallery;
  SECTION_RENDERERS.image = SECTION_RENDERERS.gallery;
  SECTION_RENDERERS.notableFacts = SECTION_RENDERERS.notable;
  SECTION_RENDERERS.climate = SECTION_RENDERERS.modernContext;
  SECTION_RENDERERS.news = SECTION_RENDERERS.liveNews;

  const fullCopyText = useMemo(() => {
      if (!info) return '';
      let txt = `${info.name || 'Location'}\n\n`;
      schema.ui.sections.forEach((section: any) => {
          const renderer = SECTION_RENDERERS[section.id];
          if (renderer && renderer.copyText) {
              const copyData = renderer.copyText();
              if (copyData) txt += copyData + '\n\n';
          }
      });
      return txt.trim();
  }, [info, schema]);

  const isLMStudioNoModel = (info as any)?.errorType === 'LM_STUDIO_NO_MODEL' ||
                            (rawInfo as any)?.errorType === 'LM_STUDIO_NO_MODEL' ||
                            isLMStudioNoModelError(info) ||
                            isLMStudioNoModelError(rawInfo) ||
                            isLMStudioNoModelError(errorMessage);

  const showContentSkeleton = isLoading && (!info?.description) && !isLMStudioNoModel && !isError;
  const contextItems = info?.contextNotes;

  if (!rawInfo && !isLoading && !isError) {
    return null;
  }

  return (
    <>
      <div
        className={`absolute top-[282px] right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-342px)] flex flex-col gap-3 animate-in slide-in-from-right-12 fade-in duration-500 pointer-events-none ${isParchment ? 'group' : ''}`}
        data-testid="info-panel"
        data-infopanel="true"
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Main Info Box */}
        <div
          className={`${theme.container} relative flex flex-col shrink min-h-0 ${isParchment ? '[isolation:isolate] group' : 'overflow-hidden'} pointer-events-auto`}
          data-infopanel="true"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Parchment paper-effect background layer — parchment theme only */}
          {isParchment && (
            <div className="parchment-background" aria-hidden="true" />
          )}
          {/* Header */}

          <div className={`relative p-5 shrink-0 flex flex-col items-center ${skin === 'modern' ? 'border-b border-white/10' : ''} ${theme.header}`.replace(/\s+/g, ' ').trim()}>
            {/* 1. Close X button */}
            <button onClick={onClose} className={`absolute top-3 right-3 p-1 z-50 ${isParchment ? '' : 'pointer-events-auto '}transition-colors ${theme.closeBtn}`} aria-label="Close panel">
              <X size={20} />
            </button>

            {/* 2. Save Location and Copy text buttons */}
            {!(isParchment && isMultiLocation) && (
              <div className="flex justify-center w-full -mt-[10px] mb-[26px] relative z-10 gap-2">
                <button
                  onClick={handleFavoriteClick}
                  className={`p-2 transition-colors ${theme.actionBtn}`}
                  title={isFavorite ? "Edit Favorite" : (routeNav ? "Save Route" : "Save Location")}
                >
                  {isParchment ? (
                    <MedievalEmeraldBronzePinIcon className={isFavorite ? "opacity-100 scale-105" : ""} />
                  ) : (
                    <Pin size={24} className={isFavorite ? "fill-current" : ""} />
                  )}
                </button>

                {/* Favorite Dialog Popover */}
                {showFavoriteDialog && (
                   <div className={`absolute top-full mt-2 w-64 p-3 z-50 flex flex-col gap-3 left-1/2 -translate-x-1/2 ${theme.popover}`}>
                      <h3 className={`text-xs text-left font-bold uppercase tracking-wider ${isRetro ? 'text-current' : isParchment ? 'text-[#8b5a2b]' : 'text-cyan-300'}`}>
                        {isFavorite ? 'Edit Favorite' : (routeNav ? 'Save Route' : 'Save Location')}
                      </h3>
                      <form onSubmit={submitFavorite} className="flex flex-col gap-2">
                         <input
                           type="text"
                           value={favoriteNameInput}
                           onChange={(e) => setFavoriteNameInput(e.target.value)}
                           placeholder="Enter name..."
                           className={`w-full p-2 text-sm bg-transparent border outline-none ${theme.notesInput} ${isParchment ? 'border-[#8b5a2b]/30 focus:border-[#8b5a2b]' : ''}`}
                           autoFocus
                         />
                         <div className="flex gap-2 justify-end">
                            {isFavorite && (
                                <button
                                  type="button"
                                  onClick={() => { onRemoveFavorite(); setShowFavoriteDialog(false); }}
                                  className="p-1.5 hover:text-red-400 transition-colors"
                                  title="Remove"
                                  aria-label="Remove favorite"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowFavoriteDialog(false)}
                              className={`px-2 py-1 text-xs opacity-70 hover:opacity-100 rounded transition-colors ${
                                isParchment 
                                  ? 'text-[#5c3a21] hover:bg-[#e8d5b5]/50' 
                                  : isRetro 
                                  ? 'hover:bg-white/10' 
                                  : 'hover:bg-white/10 text-gray-300 hover:text-white'
                              }`}
                            >
                                Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={!favoriteNameInput.trim()}
                              className={`px-3 py-1 text-xs font-bold uppercase transition-colors disabled:opacity-50 ${
                                isParchment
                                  ? 'bg-[#8b5a2b] text-[#f4ead5] hover:bg-[#5c3a21] rounded-sm shadow-sm'
                                  : isRetro
                                  ? (skin === 'retro-amber' ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-green-400 text-black hover:bg-green-300')
                                  : 'bg-cyan-600 hover:bg-cyan-500 text-white rounded'
                              }`}
                            >
                                Save
                            </button>
                         </div>
                      </form>
                   </div>
                )}
              </div>
            )}

            {/* 3. Location title & geographic hierarchy */}
            <div className="flex flex-col gap-2 items-center text-center w-full min-w-0">
              <div className="flex flex-col items-center justify-center gap-1 w-full min-w-0">
                 <h2 className={`${titleSize} font-bold text-center w-full min-w-0 max-w-full whitespace-normal break-normal ${theme.locationTitle || theme.headerTitle}`}>
                   {displayTitle || (isError ? "Error" : isLoading ? "Searching..." : "Location Info")}
                 </h2>
                 {displaySubtitle && (
                   <div className={`mt-1 w-full min-w-0 max-w-full whitespace-normal break-normal ${isParchment ? 'text-xl font-normal font-garamond text-[#8b5a2b]' : `${bodySize} font-medium ${isRetro ? 'text-current opacity-90' : 'text-slate-300'}`}`}>
                     {displaySubtitle}
                   </div>
                 )}
                 {displayCategory && (
                   <span className={`${smallTextSize} uppercase px-2 py-0.5 ${theme.tag}`}>
                     {displayCategory.toUpperCase()}
                   </span>
                 )}
              </div>
              <p className={`${subtextSize} font-mono ${theme.subtext} w-full min-w-0 max-w-full whitespace-normal break-normal`}>
                {isValidCoordinates(info?.coordinates)
                  ? `${info!.coordinates.lat >= 0 ? info!.coordinates.lat.toFixed(2) + '° N' : Math.abs(info!.coordinates.lat).toFixed(2) + '° S'}, ${info!.coordinates.lng >= 0 ? info!.coordinates.lng.toFixed(2) + '° E' : Math.abs(info!.coordinates.lng).toFixed(2) + '° W'}${info?.isApproximate ? ' (Approximate)' : ''}`
                  : (isLoading 
                      ? 'Searching...' 
                      : ((info as any)?.geographicScope === 'GLOBAL_EVENT' || (info as any)?.geographicScope === 'global'
                          ? 'Global Scope'
                          : ((info as any)?.geographicScope === 'REGIONAL_EVENT' || (info as any)?.geographicScope === 'regional'
                              ? 'Regional Scope'
                              : ((info as any)?.geographicScope === 'NON_GEOGRAPHIC_HISTORICAL_EVENT'
                                  ? 'Non-Geographic Event'
                                  : 'Coordinates unavailable'))))}
              </p>
            </div>
          </div>

          {/* Ceremonial Voyager Banner for multi-waypoint routes in parchment skin */}
          {isParchment && isMultiLocation && (
            <VoyagerCeremonialBanner
              isFavorite={isFavorite}
              onFavoriteClick={handleFavoriteClick}
              favoriteTitle={isFavorite ? "Edit Favorite" : (routeNav ? "Save Route" : "Save Location")}
              favoriteDialog={
                showFavoriteDialog ? (
                  <div className={`absolute top-full mt-2 w-64 p-3 z-50 flex flex-col gap-3 left-1/2 -translate-x-1/2 ${theme.popover}`}>
                    <h3 className={`text-xs text-left font-bold uppercase tracking-wider text-[#8b5a2b]`}>
                      {isFavorite ? 'Edit Favorite' : (routeNav ? 'Save Route' : 'Save Location')}
                    </h3>
                    <form onSubmit={submitFavorite} className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={favoriteNameInput}
                        onChange={(e) => setFavoriteNameInput(e.target.value)}
                        placeholder="Enter name..."
                        className={`w-full p-2 text-sm bg-transparent border outline-none ${theme.notesInput} border-[#8b5a2b]/30 focus:border-[#8b5a2b]`}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        {isFavorite && (
                          <button
                            type="button"
                            onClick={() => { onRemoveFavorite(); setShowFavoriteDialog(false); }}
                            className="p-1.5 hover:text-red-400 transition-colors"
                            title="Remove"
                            aria-label="Remove favorite"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowFavoriteDialog(false)}
                          className="px-2 py-1 text-xs opacity-70 hover:opacity-100 rounded transition-colors text-[#5c3a21] hover:bg-[#e8d5b5]/50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!favoriteNameInput.trim()}
                          className="px-3 py-1 text-xs font-bold uppercase transition-colors disabled:opacity-50 bg-[#8b5a2b] text-[#f4ead5] hover:bg-[#5c3a21] rounded-sm shadow-sm"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null
              }
            />
          )}

          {/* Route Navigation */}
          {isMultiLocation && routeNav && (
             <div className={`relative z-[1] ${isParchment ? 'px-3 py-1 bg-transparent' : isRetro ? 'px-3 py-1.5 border-b border-current opacity-80' : 'px-3 py-1.5 border-b border-white/10 bg-white/5'} flex items-center justify-between min-w-0`}>
                <button onClick={routeNav.onPrev} className={`p-1.5 rounded-full ${theme.navBtn} pointer-events-auto shrink-0`} aria-label="Previous waypoint">
                    <ChevronLeft size={16} />
                </button>
                <div className="flex flex-col items-center text-center px-2 min-w-0">
                    <span className={`${isRetro ? 'text-base' : 'text-xs'} font-bold uppercase tracking-widest ${theme.subtext}`}>
                        {routeNav.routeGroupName && routeNav.routeLocalCurrent !== undefined && routeNav.routeLocalTotal !== undefined
                          ? `Waypoint ${routeNav.routeLocalCurrent} of ${routeNav.routeLocalTotal}`
                          : `Waypoint ${routeNav.current} of ${routeNav.total}`}
                    </span>
                </div>
                <button onClick={routeNav.onNext} className={`p-1.5 rounded-full ${theme.navBtn} pointer-events-auto shrink-0`} aria-label="Next waypoint">
                    <ChevronRight size={16} />
                </button>
            </div>
          )}


          {/* Scrollable Content */}
          <div
            ref={scrollRef}
            onScroll={updateScrollFade}
            className={`flex-1 overflow-y-auto overflow-x-hidden ${theme.panelBg} relative pointer-events-auto info-panel-scrollable ${isParchment ? 'parchment-scrollbar' : ''}`}
            style={maskStyle}
            data-infopanel="true"
            onWheel={(e) => e.stopPropagation()}
          >
            {(isError || isLMStudioNoModel) ? (
               <div className="p-6 flex flex-col items-center justify-center min-h-48 text-center space-y-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 ${isRetro ? 'bg-red-900/40 text-red-400' : 'bg-red-500/20 text-red-400'}`}>
                      <X size={20} />
                  </div>
                  <p className={`font-medium ${theme.headerTitle}`}>
                    {isLMStudioNoModel
                      ? LM_STUDIO_NO_MODEL_MESSAGE
                      : (errorMessage || (rawInfo as any)?.errorMessage || "Unable to retrieve location details")}
                  </p>
                  {isLMStudioNoModel ? (
                    <p className={`text-xs ${theme.subtext} max-w-xs mt-1 leading-relaxed`}>
                      {onOpenSettingsTab ? (
                        <span>
                          (
                          <button
                            type="button"
                            onClick={() => onOpenSettingsTab('providers')}
                            className="underline hover:opacity-100 transition-opacity font-semibold cursor-pointer"
                          >
                            Settings &gt; Providers
                          </button>
                          )
                        </span>
                      ) : (
                        <span>{LM_STUDIO_NO_MODEL_INSTRUCTION}</span>
                      )}
                    </p>
                  ) : ((rawInfo as any)?.errorInstruction ? (
                    <p className={`text-xs ${theme.subtext} max-w-xs mt-1 leading-relaxed`}>
                      {(rawInfo as any).errorInstruction}
                    </p>
                  ) : null)}
                  {onRetry && (
                     <button onClick={onRetry} className={`px-4 py-1.5 mt-2 text-xs uppercase tracking-wider font-bold rounded transition-colors bg-white/10 hover:bg-white/20 ${theme.bodyText}`}>
                        Retry
                     </button>
                  )}
               </div>
            ) : showContentSkeleton ? (
               <div className="p-6 space-y-8 animate-pulse">
                  {/* skeleton content */}
                  <div className="space-y-3">
                    <div className={`h-4 ${isRetro ? 'bg-green-500/20' : 'bg-white/10'} rounded w-3/4`}></div>
                    <div className={`h-4 ${isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                    <div className={`h-4 w-[90%] ${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                 </div>
               </div>
            ) : info ? (
                <div className="p-5 pb-6 space-y-5 animate-in fade-in duration-300">
                    {schema.ui.sections.map((section: any) => {
                        const renderer = SECTION_RENDERERS[section.id];
                        if (renderer && renderer.render) return <React.Fragment key={section.id}>{renderer.render()}</React.Fragment>;
                        return null;
                    })}
                </div>
            ) : null}
          </div>
        </div>

        {/* My Notes Section */}
        {hasNotes ? (
          <div
            className={`pointer-events-auto shrink-0 transition-all duration-300 relative ${isParchment ? '[isolation:isolate]' : 'overflow-hidden'} ${theme.container} ${!isNotesExpanded ? 'hover:brightness-110 cursor-pointer' : ''}`}
            data-infopanel="true"
            onWheel={(e) => e.stopPropagation()}
          >
               {isParchment && (
                 <div className="parchment-background" aria-hidden="true" />
               )}
               <div className="relative z-[1]">
                 <div
                   className={`px-5 py-3 flex items-center justify-between cursor-pointer ${
                     isNotesExpanded
                       ? skin === 'retro-green'
                         ? 'border-b border-green-400/50'
                         : skin === 'retro-amber'
                         ? 'border-b border-amber-400/50'
                         : isParchment
                         ? 'border-b border-[#8b5a2b]/20'
                         : 'border-b border-white/10'
                       : ''
                   }`}
                   onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                 >
                  <div className="flex items-center gap-2">
                      <StickyNote size={16} className={theme.icon} />
                      <span className={`font-bold uppercase ${isRetro ? 'text-lg font-retro' : 'text-sm'} ${theme.headerTitle}`}>My Notes</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          skin === 'retro-green'
                            ? 'bg-green-400 text-black font-bold'
                            : skin === 'retro-amber'
                            ? 'bg-amber-400 text-black font-bold'
                            : isParchment
                            ? 'bg-[#d2b48c] text-[#3e2723]'
                            : 'bg-cyan-900/60 text-cyan-300 border border-cyan-400/40'
                        }`}
                      >
                          {notes.length}
                      </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isNotesExpanded && !isAddingNote && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartAddNote();
                        }}
                        className={`p-1 transition-colors ${
                          isParchment
                            ? 'text-[#8b5a2b] hover:text-[#3e2723] hover:bg-[#e8d5b5]/50 rounded'
                            : skin === 'retro-amber'
                            ? 'text-amber-400 hover:text-amber-200 hover:bg-amber-400/20'
                            : isRetro
                            ? 'text-green-400 hover:text-green-200 hover:bg-green-400/20'
                            : 'text-cyan-400 hover:text-cyan-200 hover:bg-white/10 rounded-full'
                        }`}
                        title="Add Note"
                        aria-label="Add Note"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                    {isNotesExpanded ? <ChevronDown size={18} className={theme.subtext} /> : <ChevronUp size={18} className={theme.subtext} />}
                  </div>
               </div>

               {isNotesExpanded && (
                   <div className="p-4 bg-opacity-50 animate-in slide-in-from-top-2 duration-300">
                       {/* Add Note Single Large Textarea */}
                       {isAddingNote && (
                         <div className="mb-3">
                           <textarea
                             ref={newNoteTextareaRef}
                             value={newNoteText}
                             onChange={(e) => setNewNoteText(e.target.value)}
                             placeholder="Write a note..."
                             className={`w-full p-2.5 text-sm transition-colors outline-none resize-none ${notesTextareaClass}`}
                             rows={3}
                             autoFocus
                           />
                           <div className="flex justify-end gap-2 mt-1.5">
                             <button
                               type="button"
                               onClick={handleCancelNewNote}
                               className={`p-1.5 transition-colors ${noteCancelBtnThemeClass}`}
                               title="Cancel"
                               aria-label="Cancel"
                             >
                               <X size={14} />
                             </button>
                             <button
                               type="button"
                               onClick={handleSaveNewNote}
                               disabled={!newNoteText.trim()}
                               className={`p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${noteSaveBtnThemeClass}`}
                               title="Save note"
                               aria-label="Save note"
                             >
                               {isParchment ? <AntiqueBookIcon size={14} /> : <Save size={14} />}
                             </button>
                           </div>
                         </div>
                       )}

                       {/* Notes List */}
                       <div className="space-y-2">
                         {notes.map((note) => (
                             <div
                               key={note.id}
                               className={`p-2.5 rounded transition-colors group relative ${
                                 isParchment
                                   ? 'bg-[#e8d5b5]/40 hover:bg-[#e8d5b5]/60 border border-[#8b5a2b]/20'
                                   : isRetro
                                   ? 'bg-black/50 border border-current/20'
                                   : 'bg-white/5 hover:bg-white/10'
                               }`}
                             >
                                 {editingNoteId === note.id ? (
                                     <div>
                                         <textarea
                                           ref={editTextareaRef}
                                           value={editingNoteText}
                                           onChange={(e) => setEditingNoteText(e.target.value)}
                                           className={`w-full p-2 text-sm bg-transparent border outline-none resize-none ${theme.notesInput} ${isParchment ? 'border-[#8b5a2b]/30 focus:border-[#8b5a2b]' : ''}`}
                                           rows={3}
                                           autoFocus
                                         />
                                         <div className="flex justify-end gap-2 mt-1.5">
                                             <button
                                               type="button"
                                               onClick={handleCancelEdit}
                                               className={`p-1.5 transition-colors ${noteCancelBtnThemeClass}`}
                                               title="Cancel edit"
                                               aria-label="Cancel edit"
                                             >
                                                 <X size={14} />
                                             </button>
                                             <button
                                               type="button"
                                               onClick={() => handleSaveEdit(note.id)}
                                               disabled={!editingNoteText.trim()}
                                               className={`p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${noteSaveBtnThemeClass}`}
                                               title="Save changes"
                                               aria-label="Save changes"
                                             >
                                                 {isParchment ? <AntiqueBookIcon size={14} /> : <Save size={14} />}
                                             </button>
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="flex justify-between items-start gap-2">
                                         <p className={`text-sm whitespace-pre-wrap flex-1 ${isParchment ? 'text-[#3e2723]' : theme.text}`}>{note.text}</p>
                                         <div className="flex gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                             <button
                                               type="button"
                                               onClick={() => handleStartEdit(note)}
                                               className={`p-1 transition-colors ${noteEditBtnThemeClass}`}
                                               title="Edit note"
                                               aria-label="Edit note"
                                             >
                                                 <Edit2 size={13} />
                                             </button>
                                             <button
                                               type="button"
                                               onClick={() => handleDeleteNote(note.id)}
                                               className={`p-1 transition-colors ${noteDeleteBtnThemeClass}`}
                                               title="Delete note"
                                               aria-label="Delete note"
                                             >
                                                 <Trash2 size={13} />
                                             </button>
                                         </div>
                                     </div>
                                 )}
                             </div>
                         ))}
                       </div>

                       {/* Add Note Button below list if not adding */}
                       {!isAddingNote && notes.length > 0 && (
                         <button
                           type="button"
                           onClick={handleStartAddNote}
                           className={`w-full py-2 mt-2 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${theme.actionBtn}`}
                         >
                           <Plus size={14} /> Add Note
                         </button>
                       )}
                   </div>
               )}
               </div>
          </div>
        ) : (
          <div className={`relative p-4 shrink-0 flex justify-center items-center pointer-events-auto transition-all ${isParchment ? '[isolation:isolate]' : 'overflow-hidden'} ${theme.container}`}>
             {isParchment && (
               <div className="parchment-background" aria-hidden="true" />
             )}
             <button
                type="button"
                onClick={handleStartAddNote}
                className={`relative z-[1] flex w-full justify-center items-center ${
                  isParchment
                    ? 'bg-transparent hover:bg-transparent text-[#5c3a21] hover:text-[#3e2723] rounded-sm'
                    : 'gap-2 ' + theme.actionBtn + ' hover:brightness-110'
                } px-6 py-3 font-bold uppercase tracking-wider text-sm transition-colors`}
             >
                {!isParchment && <StickyNote size={16} />}
                Add Note
             </button>
          </div>
        )}
    </div>
    </>
  );
};

export default InfoPanel;
