import { normalizeDisplayText, isPlaceholderString } from '../components/InfoPanel';
import {
  classifyContext,
  isPureGeographicLabel,
  CONTEXT_CATEGORY_HEADINGS,
  sanitizeContextMarkdown,
  ContextCategory,
  isContextSubsumedByDescription
} from './contextClassification';
import { normalizeDescription } from './descriptionNormalization';
import { evaluateDescriptionReadiness } from './descriptionReadiness';

export interface CanonicalNarrativeResult {
  title: string;
  narrativeText: string;
  lines: string[];
  routeContext?: {
    title: string;
    text: string;
  };
  sourceParts: string[];
}

export interface ResolveCanonicalNarrativeOptions {
  isSingleLocation?: boolean;
}

/**
 * Pure Canonical Narrative Resolver
 *
 * Single source of truth for location narrative text across InfoPanel presentation
 * and spoken TTS narration.
 *
 * Responsibilities:
 * 1. Determines primary base description (wp.description vs info.description vs significance)
 * 2. Normalizes text and strips placeholder/redundant headers (e.g. "# Description")
 * 3. Appends meaningful, distinct significance (once)
 * 4. Incorporates categorized structured context (Historical, Film & Media, Cultural, Scientific)
 * 5. Separates route-level context from entity narrative
 * 6. Strips coordinate artifacts and redundant list sections
 */
export function resolveCanonicalNarrative(
  info: any,
  options?: ResolveCanonicalNarrativeOptions
): CanonicalNarrativeResult {
  if (!info || typeof info !== 'object') {
    return {
      title: '',
      narrativeText: '',
      lines: [],
      sourceParts: []
    };
  }

  const wp = info.waypoint && typeof info.waypoint === 'object' ? info.waypoint : (info || {});
  const isSingleLocation = options?.isSingleLocation ?? true;

  // 1. Resolve Title
  const title = (
    info.canonicalName ||
    wp.canonicalName ||
    info.name ||
    wp.name ||
    info.title ||
    wp.title ||
    ''
  ).trim();

  // Helper to extract clean text from string or structured object
  const extractText = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return normalizeDisplayText(val);
    if (typeof val === 'object') {
      let text = '';
      const h = val.heading || val.heading1 || val.title;
      const t = val.text || val.text1 || val.description || val.summary || val.value || val.body;

      if (h) {
        text += `${normalizeDisplayText(h)}\n\n`;
      }
      if (t) {
        text += normalizeDisplayText(t);
      } else {
        const excludedKeys = [
          'notable',
          'notableFacts',
          'notable_facts',
          'climate',
          'population',
          'news',
          'contextNotes',
          'entities',
          'historicalPeriod'
        ];
        const vals = Object.entries(val)
          .filter(
            ([k, v]) =>
              typeof v === 'string' &&
              !excludedKeys.includes(k) &&
              !k.toLowerCase().includes('notable')
          )
          .map(([, v]) => normalizeDisplayText(v));
        if (vals.length > 0 && !h) {
          text += vals.join('\n\n');
        }
      }
      return text.trim();
    }
    return normalizeDisplayText(String(val));
  };

  const geographicDesc = extractText(info.description) || null;
  const historicalDesc = extractText(wp.description) || null;
  const routeContextText =
    (info.routeContext?.text ? extractText(info.routeContext.text) : null) ||
    (wp.routeContext?.text ? extractText(wp.routeContext.text) : null) ||
    (wp.routeContextText ? extractText(wp.routeContextText) : null);

  const geoReadiness = evaluateDescriptionReadiness(geographicDesc, title);
  const histReadiness = evaluateDescriptionReadiness(historicalDesc, title);

  // If the location's description enrichment is currently loading, suppress any provisional text
  const isDescriptionLoading = info.sectionState?.description === 'loading' || wp.sectionState?.description === 'loading';
  if (isDescriptionLoading && !geoReadiness.isReady) {
    return {
      title,
      narrativeText: '',
      lines: [],
      routeContext: undefined,
      sourceParts: []
    };
  }

  const combinedDescParts: string[] = [];
  const sourceParts: string[] = [];

  // Determine the primary narrative description: prioritize substantive descriptions
  let rawDesc = '';
  if (geoReadiness.isReady && geographicDesc && geographicDesc !== routeContextText) {
    rawDesc = geographicDesc;
    sourceParts.push('info.description');
  } else if (histReadiness.isReady && historicalDesc && historicalDesc !== routeContextText) {
    rawDesc = historicalDesc;
    sourceParts.push('waypoint.description');
  } else if (geoReadiness.isReady && geographicDesc) {
    rawDesc = geographicDesc;
    sourceParts.push('info.description');
  } else if (histReadiness.isReady && historicalDesc) {
    rawDesc = historicalDesc;
    sourceParts.push('waypoint.description');
  } else if (geographicDesc && geographicDesc !== routeContextText) {
    rawDesc = geographicDesc;
    sourceParts.push('info.description');
  } else if (historicalDesc && historicalDesc !== routeContextText) {
    rawDesc = historicalDesc;
    sourceParts.push('waypoint.description');
  } else if (geographicDesc) {
    rawDesc = geographicDesc;
    sourceParts.push('info.description');
  } else if (historicalDesc) {
    rawDesc = historicalDesc;
    sourceParts.push('waypoint.description');
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

  // Add significance if unique and non-duplicate
  const significanceCandidate = wp.significance || info.significance;
  if (
    significanceCandidate &&
    !isPlaceholderString(significanceCandidate) &&
    significanceCandidate !== rawDesc &&
    significanceCandidate !== routeContextText
  ) {
    const cleanSig = extractText(significanceCandidate);
    if (cleanSig && !isPlaceholderString(cleanSig)) {
      if (isSingleLocation) {
        if (!combinedDescParts.some((p) => p.includes(cleanSig))) {
          combinedDescParts.push(cleanSig);
          sourceParts.push('significance');
        }
      } else {
        if (!combinedDescParts.some((p) => p.includes(cleanSig))) {
          combinedDescParts.push(`## Significance\n\n${cleanSig}`);
          sourceParts.push('significance');
        }
      }
    }
  }

  // Consolidated contextual narrative sections (Historical, Film & Media, Cultural, Scientific/Geographic)
  const contextCandidates: Array<{ key: string; val: any }> = [];
  if (info.historicalBackground && !isPlaceholderString(info.historicalBackground)) {
    contextCandidates.push({ key: 'historicalBackground', val: info.historicalBackground });
  }
  if (info.historicalContext && !isPlaceholderString(info.historicalContext)) {
    contextCandidates.push({ key: 'historicalContext', val: info.historicalContext });
  }
  if (info.filmContext && !isPlaceholderString(info.filmContext)) {
    contextCandidates.push({ key: 'filmContext', val: info.filmContext });
  }
  if (info.mediaContext && !isPlaceholderString(info.mediaContext)) {
    contextCandidates.push({ key: 'mediaContext', val: info.mediaContext });
  }
  if (info.culturalContext && !isPlaceholderString(info.culturalContext)) {
    contextCandidates.push({ key: 'culturalContext', val: info.culturalContext });
  }
  if (info.scientificContext && !isPlaceholderString(info.scientificContext)) {
    contextCandidates.push({ key: 'scientificContext', val: info.scientificContext });
  }

  // Group candidates by semantic category
  const categorizedContext: Partial<Record<ContextCategory, string[]>> = {};
  const currentBaseNarrative = combinedDescParts.join('\n\n');

  for (const item of contextCandidates) {
    const snippet = normalizeDisplayText(String(item.val)).trim();
    if (!snippet || isPlaceholderString(snippet) || isPureGeographicLabel(snippet)) {
      continue;
    }
    if (combinedDescParts.some((p) => p.includes(snippet)) || isContextSubsumedByDescription(snippet, currentBaseNarrative)) {
      continue;
    }
    if (
      routeContextText &&
      (snippet === routeContextText ||
        routeContextText.includes(snippet) ||
        snippet.includes(routeContextText))
    ) {
      continue;
    }

    const res = classifyContext(snippet);
    if (res.category && res.isMeaningful) {
      if (!categorizedContext[res.category]) {
        categorizedContext[res.category] = [];
      }
      if (!categorizedContext[res.category]!.includes(snippet)) {
        categorizedContext[res.category]!.push(snippet);
        if (!sourceParts.includes(item.key)) {
          sourceParts.push(item.key);
        }
      }
    }
  }

  // Append active, categorized context sections with semantic headings
  for (const [category, snippets] of Object.entries(categorizedContext) as [
    ContextCategory,
    string[]
  ][]) {
    if (snippets && snippets.length > 0) {
      const heading = CONTEXT_CATEGORY_HEADINGS[category];
      const mergedText = snippets.join(' ');
      const headingRegex = new RegExp(`^#{1,3}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im');
      if (
        mergedText &&
        !combinedDescParts.some((p) => p.includes(mergedText) || mergedText.includes(p)) &&
        !isContextSubsumedByDescription(mergedText, currentBaseNarrative) &&
        !combinedDescParts.some((p) => headingRegex.test(p)) &&
        (!routeContextText ||
          (!routeContextText.includes(mergedText) && !mergedText.includes(routeContextText)))
      ) {
        combinedDescParts.push(`## ${heading}\n\n${mergedText}`);
      }
    }
  }

  const rawAssembledDesc = combinedDescParts.join('\n\n');

  // Resolve Route Context
  let routeContext: { title: string; text: string } | undefined = undefined;
  if (info.routeContext?.text) {
    routeContext = {
      title: info.routeContext.title || wp.routeGroupName || 'Route Context',
      text: extractText(info.routeContext.text)
    };
  } else if (wp.routeContext?.text) {
    routeContext = {
      title: wp.routeContext.title || wp.routeGroupName || 'Route Context',
      text: extractText(wp.routeContext.text)
    };
  } else if (wp.routeContextText) {
    routeContext = {
      title: wp.routeGroupName || 'Route Context',
      text: extractText(wp.routeContextText)
    };
  }

  // Clean lines using standard normalization and heading sanitization
  const coordinates =
    info.coordinates ||
    wp.coordinates ||
    (typeof info.lat === 'number' && typeof info.lng === 'number'
      ? { lat: info.lat, lng: info.lng }
      : null);
  const normalizedText = normalizeDescription(rawAssembledDesc, { coordinates });
  const sanitizedMarkdown = sanitizeContextMarkdown(normalizedText);
  const rawLines = sanitizedMarkdown
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0 && !isPlaceholderString(l));

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

    const isContextHeading =
      /^(?:historical\s+context|historical\s+background|history|context|background|cultural\s+context|film\s*(?:&|and)\s*media|media\s+context|filming\s+location|scientific\s*(?:&|\/|and)\s*geographic\s*context)$/i.test(
        headingClean
      );

    if (isContextHeading) {
      const nextLine = rawLines[i + 1] || '';
      if (isPureGeographicLabel(nextLine)) {
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
      }
    } else {
      lines.push(line);
    }
  }

  // Deduplicate leading redundant title/overview heading if next line contains subject
  if (lines.length > 0) {
    const firstLineRaw = lines[0];
    const firstLineClean = firstLineRaw.replace(/^#+\s*/, '').trim();
    const firstLineLower = firstLineClean.toLowerCase();
    const infoNameClean = title.toLowerCase();

    const isGenericHeader = firstLineLower === 'overview' || firstLineLower === 'description';
    const isExactNameHeader = firstLineLower === infoNameClean;
    const isHeadingShape =
      firstLineRaw.startsWith('#') ||
      (firstLineClean.split(' ').length <= 8 &&
        firstLineClean.length < 80 &&
        !firstLineClean.match(/[.!?]$/));

    let isRedundantIntro = false;
    if (lines.length > 1 && isHeadingShape) {
      const nextLineClean = lines[1].replace(/^#+\s*/, '').trim();
      const nextLineLower = nextLineClean.toLowerCase();

      const startsWithSubject =
        nextLineLower.startsWith(firstLineLower) ||
        nextLineLower.replace(/^(the|a|an)\s+/, '').startsWith(firstLineLower.replace(/^(the|a|an)\s+/, ''));

      const containsSubjectEarly =
        firstLineLower.length >= 4 &&
        nextLineLower.substring(0, Math.min(nextLineLower.length, firstLineLower.length + 30)).includes(firstLineLower);

      const isVariantOfName =
        (firstLineLower.includes(infoNameClean) ||
          (infoNameClean.length >= 4 && infoNameClean.includes(firstLineLower))) &&
        (nextLineLower.includes(infoNameClean) || nextLineLower.includes(firstLineLower));

      if (startsWithSubject || containsSubjectEarly || isVariantOfName) {
        isRedundantIntro = true;
      }
    }

    if (isGenericHeader || isExactNameHeader || isRedundantIntro) {
      lines.shift();
    }
  }

  // Strip orphan headings
  const cleanedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      let hasContent = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('#')) break;
        if (lines[j].trim().length > 0) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) continue;
    }
    cleanedLines.push(line);
  }

  const narrativeText = cleanedLines.join('\n\n');

  console.log(
    `[Narrative] CANONICAL_RESOLVED title="${title}" narrativeLength=${narrativeText.length} sourceParts=${sourceParts.join(',')}`
  );

  return {
    title,
    narrativeText,
    lines: cleanedLines,
    routeContext,
    sourceParts
  };
}
