import { Waypoint, ProvenanceRecord, HistoricalIssue, Route, RouteGroup, RouteEvidenceMode, RouteWaypointMembership, isValidCoordinates } from '../types';
import { generateContentWithRetry, modelName } from './geminiService';
import { PIPELINE_DEBUG, logWaypointSnapshot, logFieldDiff, logHierarchy, logPipelineSummary, PipelineSummary } from '../utils/pipelineDebug';
import { parseAndExtract } from '../utils/jsonParser';
import { validateEarthGeography } from './celestialCapabilities';
import { isRouteSequential, groupWaypointsByRoute, logHistoricalRouteStructure, validateHistoricalRouteData } from '../utils/routeSequenceUtils';
import { validateEntityAlias } from './geographic/entityIdentityValidator';
import { getHistoricalEntityKnowledge, validateHistoricalCoordinate } from './geographic/historicalCoordinateValidator';
import { resolveGeographicEntity } from './geographic/geographicResolver';
import { calculateDistanceKm } from './geographic/geographicDistance';
import { validateCandidateAgainstRegistry, validateDocumentedSegment, getAuthoritativeEventModel, resolveCanonicalRouteGroup, buildCanonicalEventTopology, findAuthoritativeAnchorAcrossEvent, isAnchorMatch } from './geographic/historicalRouteRegistry';
import { validateHistoricalWaypointContent } from './historicalContentValidation';
import { normalizeSemanticEntityTitle } from './queryNormalizer';
import { isItineraryOrActivityPhrase, unwrapPhysicalEntityName } from './entityValidation';
import { resolveWaterAwareRoute, isMaritimeJourney } from './geographic/waterRoutingService';

/**
 * Normalizes raw/malformed AI route membership structures into a clean RouteWaypointMembership[] array
 * and ensures scalar legacy fields (routeGroupId, routeGroupName) are strictly strings or undefined.
 * This is the ONLY boundary at which malformed AI route membership structures are interpreted.
 */
export function normalizeRouteMemberships(rawWaypoint: any): {
  memberships: RouteWaypointMembership[];
  primaryGroupId?: string;
  primaryGroupName?: string;
  warning?: string;
} {
  if (!rawWaypoint || typeof rawWaypoint !== 'object') {
    return { memberships: [] };
  }

  const memberships: RouteWaypointMembership[] = [];
  let warning: string | undefined;

  // Case B: Explicit memberships array provided
  if (Array.isArray(rawWaypoint.memberships) && rawWaypoint.memberships.length > 0) {
    for (const m of rawWaypoint.memberships) {
      if (m && typeof m === 'object' && m.routeGroupId) {
        memberships.push({
          routeGroupId: String(m.routeGroupId).trim(),
          routeGroupName: m.routeGroupName != null ? String(m.routeGroupName).trim() : undefined,
          sequence: typeof m.sequence === 'number' ? m.sequence : undefined,
          membershipType: m.membershipType
        });
      }
    }
  }

  // Case C & D: Legacy parallel arrays (routeGroupId: string[], routeGroupName: string[])
  if (memberships.length === 0 && Array.isArray(rawWaypoint.routeGroupId)) {
    const groupIds: any[] = rawWaypoint.routeGroupId;
    const groupNames: any[] = Array.isArray(rawWaypoint.routeGroupName) ? rawWaypoint.routeGroupName : [];

    if (groupNames.length > 0 && groupIds.length !== groupNames.length) {
      warning = `Mismatched parallel array lengths: routeGroupId has ${groupIds.length} entries, routeGroupName has ${groupNames.length} entries.`;
      console.warn(`[ROUTE MEMBERSHIP NORMALIZATION] ${warning}`);
    }

    for (let i = 0; i < groupIds.length; i++) {
      const gId = groupIds[i];
      if (gId != null && typeof gId !== 'object') {
        const cleanId = String(gId).trim();
        if (cleanId.length > 0) {
          const gName = (i < groupNames.length && groupNames[i] != null && typeof groupNames[i] !== 'object')
            ? String(groupNames[i]).trim()
            : undefined;
          memberships.push({
            routeGroupId: cleanId,
            routeGroupName: gName,
            sequence: typeof rawWaypoint.sequence === 'number' ? rawWaypoint.sequence : undefined,
            membershipType: 'SHARED_ROUTE_ANCHOR'
          });
        }
      }
    }
  }

  // Case A: Scalar membership (routeGroupId is a string or primitive)
  if (memberships.length === 0 && rawWaypoint.routeGroupId != null && !Array.isArray(rawWaypoint.routeGroupId)) {
    const rawGId = String(rawWaypoint.routeGroupId).trim();
    if (rawGId.length > 0 && typeof rawWaypoint.routeGroupId !== 'object') {
      const rawGName = (rawWaypoint.routeGroupName != null && !Array.isArray(rawWaypoint.routeGroupName) && typeof rawWaypoint.routeGroupName !== 'object')
        ? String(rawWaypoint.routeGroupName).trim()
        : undefined;
      memberships.push({
        routeGroupId: rawGId,
        routeGroupName: rawGName,
        sequence: typeof rawWaypoint.sequence === 'number' ? rawWaypoint.sequence : undefined,
        membershipType: 'ROUTE_EXCLUSIVE'
      });
    }
  }

  // If routeGroupId was not provided but routeGroupName was provided as a string
  if (memberships.length === 0 && rawWaypoint.routeGroupName != null && !Array.isArray(rawWaypoint.routeGroupName) && typeof rawWaypoint.routeGroupName !== 'object') {
    const rawGName = String(rawWaypoint.routeGroupName).trim();
    if (rawGName.length > 0) {
      memberships.push({
        routeGroupId: rawGName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        routeGroupName: rawGName,
        sequence: typeof rawWaypoint.sequence === 'number' ? rawWaypoint.sequence : undefined,
        membershipType: 'ROUTE_EXCLUSIVE'
      });
    }
  }

  const primary = memberships[0];
  return {
    memberships,
    primaryGroupId: primary?.routeGroupId,
    primaryGroupName: primary?.routeGroupName,
    warning
  };
}

export const runRoutePipeline = async (
  text: string,
  isUrl: boolean,
  generateRawRoute: (text: string, isUrl: boolean) => Promise<{
    waypoints: any[];
    title?: string;
    routeConfidence?: any;
    routeType?: string;
    isSequential?: boolean;
    routeEvidenceMode?: RouteEvidenceMode;
    routeGroups?: RouteGroup[];
  }>,
  intent?: string,
  onWaypointProgress?: (waypoint: Waypoint, allDiscoveredSoFar: Waypoint[], index: number, total: number) => void
): Promise<Route> => {
  const pipelineId = Math.random().toString(16).substring(2, 8);
  console.log(`[Pipeline ${pipelineId}] === STARTING 7-STAGE HISTORICAL & ROUTE VALIDATION PIPELINE ===`);

  const logPipelineTrace = (stageName: string, items: any[]) => {
    const groupMap = new Map<string, { name: string; count: number; ids: string[]; seqs: (number | string)[] }>();
    items.forEach(w => {
      // Expand by memberships if available, or fall back to single routeGroupId
      const memberships: RouteWaypointMembership[] = (Array.isArray(w.memberships) && w.memberships.length > 0)
        ? w.memberships
        : [{
            routeGroupId: (typeof w.routeGroupId === 'string' && w.routeGroupId.trim()) ? w.routeGroupId.trim() : 'default',
            routeGroupName: (typeof w.routeGroupName === 'string' && w.routeGroupName.trim()) ? w.routeGroupName.trim() : undefined,
            sequence: w.sequence
          }];

      memberships.forEach(m => {
        const gId = m.routeGroupId;
        const gName = m.routeGroupName || gId;
        if (!groupMap.has(gId)) {
          groupMap.set(gId, { name: gName, count: 0, ids: [], seqs: [] });
        }
        const g = groupMap.get(gId)!;
        g.count++;
        g.ids.push(w.id || w.canonicalName || w.name);
        g.seqs.push(m.sequence ?? w.sequence ?? 'none');
      });
    });

    console.log(`\n===== ROUTE GROUP INVENTORY: ${stageName} =====`);
    console.log(`Total Waypoints: ${items.length}`);
    for (const [gId, g] of groupMap.entries()) {
      console.log(`Group: ${g.name} / ${gId}`);
      console.log(`Waypoint count: ${g.count}`);
      console.log(`Waypoint IDs: [${g.ids.join(', ')}]`);
      console.log(`Sequences: [${g.seqs.join(', ')}]`);
      console.log(`----------------------------------------`);
    }
    console.log(`==============================================\n`);
  };

  // Progressive emission tracker across Stage 1 streaming and Stage 3 reconciliation
  const progressivelyEmittedWaypoints = new Map<string, Waypoint>();

  // Single candidate normalization helper for early streaming candidate validation
  const normalizeSingleCandidate = (item: any, i: number, defaultTitle?: string): Waypoint => {
    let validAlternateNames: string[] = [];
    if (Array.isArray(item.alternateNames)) {
      validAlternateNames = item.alternateNames
        .filter((alt: any) => typeof alt === 'string' && alt.trim().length > 0)
        .map((alt: string) => alt.trim())
        .filter((alt: string) => validateEntityAlias(item.canonicalName || item.name || '', alt));
    }

    const { memberships, primaryGroupId, primaryGroupName } = normalizeRouteMemberships(item);
    const unwrappedRawName = unwrapPhysicalEntityName(item.name);
    const unwrappedRawCanonical = unwrapPhysicalEntityName(item.canonicalName);

    const normalizedWpTitle = normalizeSemanticEntityTitle({
      explicitTitle: unwrappedRawName,
      canonicalName: unwrappedRawCanonical,
      name: unwrappedRawName,
      subject: unwrappedRawCanonical || unwrappedRawName,
      routeTitle: item.routeTitle || defaultTitle,
      description: item.description,
      coordinates: { lat: typeof item.lat === 'number' ? item.lat : Number(item.lat), lng: typeof item.lng === 'number' ? item.lng : Number(item.lng) }
    });

    const finalName = normalizedWpTitle || unwrappedRawName || item.name || "Unknown Waypoint";
    const finalCanonical = unwrappedRawCanonical || item.canonicalName || normalizedWpTitle || finalName;
    const cleanSlug = (finalCanonical || finalName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const deterministicId = item.id && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `wp-${i + 1}-${cleanSlug || 'location'}`;

    return {
      id: deterministicId,
      name: finalName,
      canonicalName: finalCanonical,
      historicalRegion: item.historicalRegion,
      modernLocation: item.modernLocation,
      lat: typeof item.lat === 'number' ? item.lat : (Number(item.lat) || 0),
      lng: typeof item.lng === 'number' ? item.lng : (Number(item.lng) || 0),
      role: item.role,
      parentId: item.parentId,
      sequence: typeof item.sequence === 'number' ? item.sequence : (memberships[0]?.sequence),
      alternateNames: validAlternateNames,
      context: item.context || "",
      routeTitle: item.routeTitle || defaultTitle,
      routeContext: item.routeContext ? (typeof item.routeContext === 'object' ? item.routeContext : { title: primaryGroupName || 'Route Context', text: String(item.routeContext) }) : undefined,
      routeContextText: typeof item.routeContext === 'string' ? item.routeContext : (item.routeContextText || item.routeContext?.text),
      description: item.description,
      significance: item.significance,
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
      historicalPeriod: item.historicalPeriod,
      entities: Array.isArray(item.entities) ? item.entities : [],
      historicalConfidence: item.historicalConfidence,
      modelConfidence: item.modelConfidence,
      verifiedEvidence: item.verifiedEvidence,
      routeGroupId: primaryGroupId,
      routeGroupName: primaryGroupName,
      memberships,
      routeEvidenceMode: item.routeEvidenceMode,
      waypointType: (['route_waypoint', 'historical_site', 'administrative_depot'].includes(item.waypointType)) ? item.waypointType : 'route_waypoint',
      segmentEvidence: (['DOCUMENTED_ROUTE_SEGMENT', 'HIGH_LEVEL_HISTORICAL_ASSOCIATION', 'INFERRED_CONNECTION'].includes(item.segmentEvidence)) ? item.segmentEvidence : 'DOCUMENTED_ROUTE_SEGMENT',
      segmentEvidenceReason: typeof item.segmentEvidenceReason === 'string' ? item.segmentEvidenceReason : undefined,
      date: item.date,
      year: item.year,
      timestamp: item.timestamp,
      temporalRelation: item.temporalRelation,
      relationship: item.relationship,
      order: item.order,
      isSequential: item.isSequential,
      sourceEvidence: item.sourceEvidence,
      metadata: {
        ...(item.metadata || {})
      },
      provenance: [{
        stage: 'normalization',
        source: 'deterministic',
        timestamp: new Date().toISOString(),
        summary: 'Initialized structure, normalized route memberships, and verified entity aliases'
      }]
    };
  };

  // Single candidate geographic validator for early streaming release
  const validateSingleCandidate = async (w: Waypoint, sourceTxt: string): Promise<Waypoint | null> => {
    const isItineraryActivity = isItineraryOrActivityPhrase(w.name) || isItineraryOrActivityPhrase(w.canonicalName);
    if (isItineraryActivity) return null;

    const isNameValid = Boolean(
      w.name &&
      w.name.toLowerCase() !== text.toLowerCase() &&
      !/^(where was|where were|what are|filming locations|places used)\b/i.test(w.name)
    );
    if (!isNameValid) return null;

    const histKnowledge = getHistoricalEntityKnowledge(w.canonicalName || w.name);
    let entityIdentityValid = true;
    let coordGeographicallyValid = true;

    if (w.alternateNames && w.alternateNames.length > 0) {
      for (const alt of w.alternateNames) {
        if (!validateEntityAlias(w.canonicalName || w.name, alt)) {
          entityIdentityValid = false;
          break;
        }
      }
    }
    if (!entityIdentityValid) return null;

    if (histKnowledge) {
      const coordValidation = await validateHistoricalCoordinate(
        w.canonicalName || w.name,
        { lat: w.lat, lng: w.lng },
        {
          intent,
          coordinateSource: 'ai',
          expectedRegion: histKnowledge.expectedRegion,
          entityType: histKnowledge.entityType || 'historical_site'
        }
      );
      if (!coordValidation.valid) {
        if (histKnowledge.approximateCoordinates) {
          w.lat = histKnowledge.approximateCoordinates.lat;
          w.lng = histKnowledge.approximateCoordinates.lng;
        } else {
          coordGeographicallyValid = false;
        }
      }
    } else {
      const queryName = w.canonicalName || w.name;
      const resolved = await resolveGeographicEntity(queryName);
      if (resolved && !('status' in resolved) && resolved.coordinates && isValidCoordinates(resolved.coordinates)) {
        const distKm = calculateDistanceKm(w.lat, w.lng, resolved.coordinates.lat, resolved.coordinates.lng);
        const shouldUpdate = isUrl || sourceTxt.length > 200 || distKm > 50 || (w.lat === 0 && w.lng === 0);
        if (shouldUpdate && (distKm > 0.001 || (w.lat === 0 && w.lng === 0))) {
          w.lat = resolved.coordinates.lat;
          w.lng = resolved.coordinates.lng;
        }
      }
    }

    if (!coordGeographicallyValid) return null;

    const isSentinel = (typeof w.lat === 'number' && typeof w.lng === 'number') &&
      ((Math.abs(w.lat - 12.345) < 0.01 && Math.abs(w.lng - 67.89) < 0.01) || (w.lat === 0 && w.lng === 0));
    const isCoordValid = typeof w.lat === 'number' && typeof w.lng === 'number' && !isNaN(w.lat) && !isNaN(w.lng) && (w.lat !== 0 || w.lng !== 0) && w.lat >= -90 && w.lat <= 90 && w.lng >= -180 && w.lng <= 180 && !isSentinel;
    if (!isCoordValid) return null;

    const celestialValidation = validateEarthGeography({
      name: w.name,
      canonicalName: w.canonicalName,
      historicalRegion: w.historicalRegion,
      modernLocation: w.modernLocation,
      description: w.description
    });
    if (!celestialValidation.isValid) return null;

    // Source evidence check if pasted source text provided (NOT a URL and length > 200)
    if (!isUrl && sourceTxt && sourceTxt.length > 200 && !histKnowledge) {
      const nameLower = (w.canonicalName || w.name || '').toLowerCase().trim();
      const rawNameLower = (w.name || '').toLowerCase().trim();
      const coreName = nameLower.split(',')[0].replace(/\s+(?:in|near|at)\s+.*$/i, '').trim();
      const inSource = (nameLower.length > 2 && sourceTxt.includes(nameLower)) ||
        (rawNameLower.length > 2 && sourceTxt.includes(rawNameLower)) ||
        (coreName.length > 2 && sourceTxt.includes(coreName));
      const aliasInSource = Array.isArray(w.alternateNames) && w.alternateNames.some(alt => alt.trim().length > 2 && sourceTxt.includes(alt.toLowerCase().trim()));
      const hasSourceEvidence = Boolean(w.sourceEvidence && typeof w.sourceEvidence === 'string' && w.sourceEvidence.trim().length > 0);

      if (!inSource && !aliasInSource && !hasSourceEvidence) {
        console.log(`[Progressive Candidate Validation] REJECT "${w.name}": Source evidence not found in pasted text`);
        return null;
      }
    }

    console.log(`[Progressive Candidate Validation] ACCEPT "${w.name}" (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})`);
    return w;
  };

  // Stage 1: Generate
  console.log(`[Pipeline ${pipelineId}] Stage 1: Generate (Calling AI)`);
  console.log(`[Pipeline ${pipelineId}] Stage 1 Input: length=${text.length}, isUrl=${isUrl}, preview="${text.slice(0, 100).replace(/\n/g, ' ')}"`);

  // Connect streaming candidate progress handler to Stage 1
  const onCandidateProgress = async (rawCand: any, candIndex: number) => {
    try {
      console.log(`[TRACE ROUTE] Stage 1 candidate ${candIndex} validation started: "${rawCand.name || 'unnamed'}"`);
      const normalizedCand = normalizeSingleCandidate(rawCand, candIndex - 1);
      const validatedCand = await validateSingleCandidate(normalizedCand, text.toLowerCase());
      if (validatedCand) {
        console.log(`[TRACE ROUTE] Stage 1 candidate ${candIndex} validated: "${validatedCand.name}" (${validatedCand.lat.toFixed(4)}, ${validatedCand.lng.toFixed(4)})`);
        if (!progressivelyEmittedWaypoints.has(validatedCand.id)) {
          progressivelyEmittedWaypoints.set(validatedCand.id, validatedCand);
          const currentDiscovered = Array.from(progressivelyEmittedWaypoints.values());
          console.log(`[TRACE ROUTE] Stage 1 candidate ${candIndex} progressive emission: "${validatedCand.name}" (${currentDiscovered.length} emitted so far)`);
          if (onWaypointProgress) {
            onWaypointProgress(validatedCand, currentDiscovered, currentDiscovered.length, currentDiscovered.length);
          }
        }
      } else {
        console.log(`[TRACE ROUTE] Stage 1 candidate ${candIndex} rejected during progressive validation: "${rawCand.name || 'unnamed'}"`);
      }
    } catch (streamValErr) {
      console.warn(`[TRACE ROUTE] Error during progressive candidate validation:`, streamValErr);
    }
  };

  let {
    waypoints: rawItems,
    title: rawTitle,
    routeConfidence: rawRouteConfidence,
    routeType: rawRouteType,
    isSequential: rawIsSequential,
    routeEvidenceMode: rawRouteEvidenceMode,
    routeGroups: rawRouteGroups,
    metadata: rawMetadata
  } = (await generateRawRoute(text, isUrl, { onCandidateProgress })) as any;

  console.log(`[Pipeline ${pipelineId}] Stage 1 Output: candidateCount=${rawItems ? rawItems.length : 0}, title="${rawTitle || 'Untitled'}", sourceMetadataLength=${rawMetadata?.sourceText ? rawMetadata.sourceText.length : 0}`);

  logPipelineTrace("Stage 1: Generate", rawItems);

  // Stage 2: Normalize
  console.log(`[Pipeline ${pipelineId}] Stage 2: Normalize (Structural initialization & alias validation)`);
  console.log(`[Pipeline ${pipelineId}] Stage 2 Input candidateCount=${rawItems ? rawItems.length : 0}`);
  console.log(`\n===== ROUTE MEMBERSHIP NORMALIZATION =====`);
  let normalizedItems = rawItems.map((item, i): Waypoint => {
    // Strip invalid or conflated aliases
    let validAlternateNames: string[] = [];
    if (Array.isArray(item.alternateNames)) {
      validAlternateNames = item.alternateNames
        .filter((alt: any) => typeof alt === 'string' && alt.trim().length > 0)
        .map((alt: string) => alt.trim())
        .filter((alt: string) => validateEntityAlias(item.canonicalName || item.name || '', alt));
    }

    // Safely normalize route memberships (handles scalar, explicit memberships[], or legacy parallel arrays)
    const { memberships, primaryGroupId, primaryGroupName, warning } = normalizeRouteMemberships(item);
    if (warning) {
      console.log(`[Item ${i}: "${item.name}"] Warning: ${warning}`);
    }

    // Unwrap physical place names if wrapped in activity labels like "Get On Board (Villa Melzi)"
    const unwrappedRawName = unwrapPhysicalEntityName(item.name);
    const unwrappedRawCanonical = unwrapPhysicalEntityName(item.canonicalName);

    const normalizedWpTitle = normalizeSemanticEntityTitle({
      explicitTitle: unwrappedRawName,
      canonicalName: unwrappedRawCanonical,
      name: unwrappedRawName,
      subject: unwrappedRawCanonical || unwrappedRawName,
      routeTitle: item.routeTitle || rawTitle,
      description: item.description,
      coordinates: { lat: typeof item.lat === 'number' ? item.lat : Number(item.lat), lng: typeof item.lng === 'number' ? item.lng : Number(item.lng) }
    });

    const finalName = normalizedWpTitle || unwrappedRawName || item.name || "Unknown Waypoint";
    const finalCanonical = unwrappedRawCanonical || item.canonicalName || normalizedWpTitle || finalName;
    const cleanSlug = (finalCanonical || finalName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const deterministicId = item.id && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `wp-${i + 1}-${cleanSlug || 'location'}`;

    const wp: Waypoint = {
      id: deterministicId,
      name: finalName,
      canonicalName: finalCanonical,
      historicalRegion: item.historicalRegion,
      modernLocation: item.modernLocation,
      lat: typeof item.lat === 'number' ? item.lat : (Number(item.lat) || 0),
      lng: typeof item.lng === 'number' ? item.lng : (Number(item.lng) || 0),
      role: item.role,
      parentId: item.parentId,
      sequence: typeof item.sequence === 'number' ? item.sequence : (memberships[0]?.sequence),
      alternateNames: validAlternateNames,
      context: item.context || "",
      routeTitle: item.routeTitle || rawTitle,
      routeContext: item.routeContext ? (typeof item.routeContext === 'object' ? item.routeContext : { title: primaryGroupName || 'Route Context', text: String(item.routeContext) }) : undefined,
      routeContextText: typeof item.routeContext === 'string' ? item.routeContext : (item.routeContextText || item.routeContext?.text),
      description: item.description,
      significance: item.significance,
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
      historicalPeriod: item.historicalPeriod,
      entities: Array.isArray(item.entities) ? item.entities : [],
      historicalConfidence: item.historicalConfidence,
      modelConfidence: item.modelConfidence,
      verifiedEvidence: item.verifiedEvidence,
      routeGroupId: primaryGroupId,
      routeGroupName: primaryGroupName,
      memberships,
      routeEvidenceMode: item.routeEvidenceMode || rawRouteEvidenceMode,
      waypointType: (['route_waypoint', 'historical_site', 'administrative_depot'].includes(item.waypointType)) ? item.waypointType : 'route_waypoint',
      segmentEvidence: (['DOCUMENTED_ROUTE_SEGMENT', 'HIGH_LEVEL_HISTORICAL_ASSOCIATION', 'INFERRED_CONNECTION'].includes(item.segmentEvidence)) ? item.segmentEvidence : 'DOCUMENTED_ROUTE_SEGMENT',
      segmentEvidenceReason: typeof item.segmentEvidenceReason === 'string' ? item.segmentEvidenceReason : undefined,
      date: item.date,
      year: item.year,
      timestamp: item.timestamp,
      temporalRelation: item.temporalRelation,
      relationship: item.relationship,
      order: item.order,
      isSequential: item.isSequential,
      sourceEvidence: item.sourceEvidence,
      metadata: {
        ...(rawMetadata || {}),
        ...(item.metadata || {})
      },
      provenance: [{
        stage: 'normalization',
        source: 'deterministic',
        timestamp: new Date().toISOString(),
        summary: 'Initialized structure, normalized route memberships, and verified entity aliases'
      }]
    };
    if (i === 0) logFieldDiff('Stage 2: Normalize', item, wp);
    if (i === 0) logWaypointSnapshot('Stage 2: Normalize', wp);
    return wp;
  });
  console.log(`==========================================\n`);
  console.log(`[Pipeline ${pipelineId}] Stage 2 Output: candidateCount=${normalizedItems.length}`);

  logPipelineTrace("Stage 2: Normalize", normalizedItems);

  let issues: HistoricalIssue[] = [];
  let validationIssuesCount = 0;
  let placeholderRemoved = 0;
  let placeholderRepaired = 0;

  // Stage 3: Structural & Multi-Stage Historical Validation
  console.log(`[Pipeline ${pipelineId}] Stage 3: Structural & Historical Waypoint Validation (candidateCount=${normalizedItems.length})`);

  const sourceText = (rawMetadata?.sourceText || '').trim();
  const sourceMode = isUrl ? 'url' : (sourceText.length > 200 ? 'pasted_article' : 'query_text');
  console.log(`[Pipeline ${pipelineId}] Stage 3 Source Metadata: length=${sourceText.length}, mode="${sourceMode}", preview="${sourceText.slice(0, 100).replace(/\n/g, ' ')}"`);
  let rejectedActivityCount = 0;
  let rejectedUnsupportedCount = 0;

  // Track coordinate reuse frequency among valid physical candidates (excluding discarded itinerary/editorial phrases)
  const coordUsageCounts = new Map<string, number>();
  for (const item of normalizedItems) {
    const isActivity = isItineraryOrActivityPhrase(item.name) || isItineraryOrActivityPhrase(item.canonicalName);
    const isBadName = !item.name || item.name.toLowerCase() === text.toLowerCase() || /^(where was|where were|what are|filming locations|places used)\b/i.test(item.name);
    if (!isActivity && !isBadName && typeof item.lat === 'number' && typeof item.lng === 'number' && (item.lat !== 0 || item.lng !== 0)) {
      const coordKey = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      coordUsageCounts.set(coordKey, (coordUsageCounts.get(coordKey) || 0) + 1);
    }
  }

  const validatedItems: Waypoint[] = [];

  for (const w of normalizedItems) {
    // 1. Initial Name / Entity Identity Validation & Itinerary Action Rejection
    const isItineraryActivity = isItineraryOrActivityPhrase(w.name) ||
      isItineraryOrActivityPhrase(w.canonicalName);

    if (isItineraryActivity) {
      rejectedActivityCount++;
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Editorial/itinerary phrase rejected`);
      console.log(`[Route Validation] Waypoint rejected: ${w.name} — itinerary/activity phrase`);
      continue;
    }

    const isNameValid = Boolean(
      w.name &&
      w.name.toLowerCase() !== text.toLowerCase() &&
      !/^(where was|where were|what are|filming locations|places used)\b/i.test(w.name)
    );

    if (!isNameValid) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Name matches query pattern`);
      console.log(`[Route Validation] Waypoint rejected: ${w.name} — matches query pattern`);
      continue;
    }

    const coordKey = (typeof w.lat === 'number' && typeof w.lng === 'number') ? `${w.lat.toFixed(4)},${w.lng.toFixed(4)}` : '';
    const isSuspiciousDuplicate = (coordUsageCounts.get(coordKey) || 0) > 1;

    // 2. Historical Knowledge Base check & Geographic Coordinate Validation
    const histKnowledge = getHistoricalEntityKnowledge(w.canonicalName || w.name);
    let entityIdentityValid = true;
    let eventAssociationValid = true;
    let sequencePositionValid = true;
    let conflictDetails = 'none';

    if (histKnowledge) {
      if (histKnowledge.allowedCountries && histKnowledge.allowedCountries.length > 0 && w.modernLocation) {
        const matchesCountry = histKnowledge.allowedCountries.some(c => w.modernLocation!.toLowerCase().includes(c.toLowerCase()));
        if (!matchesCountry && !histKnowledge.allowedCountries.some(c => (w.description || '').toLowerCase().includes(c.toLowerCase()))) {
          // Flagged foreign entity conflict
        }
      }
    }

    // Verify alias non-conflation
    if (w.alternateNames && w.alternateNames.length > 0) {
      for (const alt of w.alternateNames) {
        if (!validateEntityAlias(w.canonicalName || w.name, alt)) {
          entityIdentityValid = false;
          conflictDetails = `Invalid alias conflation: ${alt}`;
          break;
        }
      }
    }

    // Comprehensive Entity-Aware Historical Coordinate Validation & Deterministic Repair
    let coordGeographicallyValid = true;
    let coordValidation: any = null;

    if (histKnowledge) {
      coordValidation = await validateHistoricalCoordinate(
        w.canonicalName || w.name,
        { lat: w.lat, lng: w.lng },
        {
          intent,
          coordinateSource: 'ai',
          expectedRegion: histKnowledge.expectedRegion,
          entityType: histKnowledge.entityType || 'historical_site'
        }
      );

      if (!coordValidation.valid) {
        console.warn(`[Pipeline ${pipelineId}] Historical Coordinate Conflict for "${w.name}": ${coordValidation.reason} (Expected: ${coordValidation.expectedRegion || histKnowledge.expectedRegion}, RevGeo: ${coordValidation.reverseGeocodeSummary || 'unknown'}).`);
        if (histKnowledge.approximateCoordinates) {
          console.log(`[Pipeline ${pipelineId}] Deterministically repairing coordinates for "${w.name}" from (${w.lat}, ${w.lng}) to authoritative (${histKnowledge.approximateCoordinates.lat}, ${histKnowledge.approximateCoordinates.lng})`);
          w.lat = histKnowledge.approximateCoordinates.lat;
          w.lng = histKnowledge.approximateCoordinates.lng;
          coordGeographicallyValid = true;
          w.provenance!.push({
            stage: 'deterministic_repair',
            source: 'deterministic',
            timestamp: new Date().toISOString(),
            summary: `Repaired coordinates to authoritative historical location for ${histKnowledge.entity} (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})`
          });
        } else {
          coordGeographicallyValid = false;
          conflictDetails = `Geographic mismatch: ${coordValidation.reason}`;
        }
      }
    }

    // General Geographic Entity Resolution & Deterministic Coordinate Repair (for non-historical-knowledge entities)
    let generalGeoResolution: any = null;
    if (!histKnowledge) {
      const queryName = w.canonicalName || w.name;
      const resolved = await resolveGeographicEntity(queryName);
      if (resolved && !('status' in resolved) && resolved.coordinates && isValidCoordinates(resolved.coordinates)) {
        generalGeoResolution = resolved;
        const distKm = calculateDistanceKm(w.lat, w.lng, resolved.coordinates.lat, resolved.coordinates.lng);
        // For pasted articles / source documents, or suspicious duplicate coordinates, or large mismatch (> 50km):
        // ALWAYS update to trusted resolved coordinates!
        const shouldUpdateCoordinates = sourceMode === 'pasted_article' || isUrl || isSuspiciousDuplicate || distKm > 50 || (w.lat === 0 && w.lng === 0);
        if (shouldUpdateCoordinates && (distKm > 0.001 || (w.lat === 0 && w.lng === 0))) {
          console.log(`[Route Validation] Coordinate updated: ${w.name} (${w.lat}, ${w.lng}) → (${resolved.coordinates.lat}, ${resolved.coordinates.lng}) [${distKm.toFixed(1)}km mismatch corrected via trusted resolver]`);
          w.lat = resolved.coordinates.lat;
          w.lng = resolved.coordinates.lng;
          coordGeographicallyValid = true;
          w.provenance!.push({
            stage: 'deterministic_repair',
            source: 'deterministic',
            timestamp: new Date().toISOString(),
            summary: `Repaired coordinates to trusted geographic location for ${resolved.name} (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})`
          });
        }
      } else if (isSuspiciousDuplicate) {
        console.warn(`[Route Validation] Physical entity "${w.name}" has suspicious duplicate coordinate (${w.lat}, ${w.lng}) that could not be independently resolved. Rejecting.`);
        coordGeographicallyValid = false;
        conflictDetails = `Unresolvable duplicate model coordinate (${w.lat}, ${w.lng})`;
      }
    }

    // Coordinate Validity Check post-resolution
    const isSentinel = (typeof w.lat === 'number' && typeof w.lng === 'number') &&
      ((Math.abs(w.lat - 12.345) < 0.01 && Math.abs(w.lng - 67.89) < 0.01) || (w.lat === 0 && w.lng === 0));
    const isCoordValid = typeof w.lat === 'number' && typeof w.lng === 'number' && !isNaN(w.lat) && !isNaN(w.lng) && (w.lat !== 0 || w.lng !== 0) && w.lat >= -90 && w.lat <= 90 && w.lng >= -180 && w.lng <= 180 && !isSentinel;

    if (!isCoordValid) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Invalid coordinates`);
      console.log(`[Route Validation] Waypoint rejected: ${w.name} — invalid coordinates`);
      continue;
    }

    // Diagnostic Block: ===== HISTORICAL WAYPOINT VALIDATION =====
    console.log(`\n===== HISTORICAL WAYPOINT VALIDATION =====
Requested Entity: "${w.canonicalName || w.name}"
Resolved Entity: "${w.name}"
Coordinates: ${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}
Coordinates Syntactically Valid: ${isCoordValid}
Coordinates Geographically Valid: ${coordGeographicallyValid}
Expected Region: ${histKnowledge?.expectedRegion || 'unspecified'}
Reverse Geocode: ${coordValidation?.reverseGeocodeSummary || 'none'}
Entity Identity Valid: ${entityIdentityValid}
Aliases Valid: ${w.alternateNames?.length ? 'VALID' : 'NONE'}
Historical Existence: ${histKnowledge ? 'VERIFIED_IN_KNOWLEDGE_BASE' : 'DOCUMENTED'}
Event Association: ${eventAssociationValid}
Route Group: ${w.routeGroupId || 'default'}
Sequence Position: ${w.sequence ?? 'unassigned'}
Conflict Details: ${conflictDetails}
Validation Decision: ${isCoordValid && isNameValid && entityIdentityValid && coordGeographicallyValid ? 'ACCEPT' : 'REJECT'}
==========================================\n`);

    if (!entityIdentityValid) {
      console.warn(`[Pipeline ${pipelineId}] Historical Validation failed for ${w.name}: Entity identity mismatch or conflation`);
      console.log(`[Route Validation] Waypoint rejected: ${w.name} — entity identity mismatch`);
      continue;
    }
    if (!coordGeographicallyValid) {
      console.warn(`[Pipeline ${pipelineId}] Historical Validation failed for ${w.name}: Coordinates geographically invalid and non-repairable`);
      console.log(`[Route Validation] Coordinate rejected: ${w.name} — identity/coordinate mismatch`);
      console.log(`[Route Validation] Waypoint rejected: ${w.name} — coordinates geographically invalid`);
      continue;
    }

    // Reject NYC fallback
    if (Math.abs(w.lat - 40.7128) < 0.001 && Math.abs(w.lng - -74.006) < 0.001) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed for ${w.name}: Resolved to NYC fallback coordinates`);
      continue;
    }

    // Celestial Body Validation: Enforce Earth-only support
    const celestialValidation = validateEarthGeography({
      name: w.name,
      canonicalName: w.canonicalName,
      historicalRegion: w.historicalRegion,
      modernLocation: w.modernLocation,
      description: w.description
    });

    if (!celestialValidation.isValid) {
      console.warn(`[Pipeline ${pipelineId}] Celestial Body Validation failed for ${w.name}: Unsupported celestial body '${celestialValidation.celestialBody}'.`);
      continue;
    }

    const genericRegionPatterns = [
      /central asia/i,
      /the balkans/i,
      /europe/i,
      /asia/i,
      /various cities/i,
      /\bregion\b/i,
      /\bempire\b/i,
      /^(oklahoma|indian territory|oklahoma \(indian territory\)|tennessee|georgia|arkansas|north carolina|alabama)$/i
    ];
    const isGenericRegion = genericRegionPatterns.some(pattern => pattern.test(w.name.trim()));

    // Route-Name Hallucination Detection (e.g. "Bell, Tennessee" for "Bell Route")
    let isRouteNameHallucination = false;
    let hallucinationReason = "";
    const cleanGroupName = (typeof w.routeGroupName === 'string') ? w.routeGroupName.toLowerCase() : '';
    if (cleanGroupName.includes('bell') && /^\s*bell\b/i.test(w.name)) {
      if (!histKnowledge || histKnowledge.entity.toLowerCase() !== 'bell') {
        isRouteNameHallucination = true;
        hallucinationReason = `Waypoint "${w.name}" matches route name "Bell Route" without independent historical documentation.`;
      }
    }
    if (cleanGroupName.includes('benge') && /^\s*benge\b/i.test(w.name)) {
      if (!histKnowledge) {
        isRouteNameHallucination = true;
        hallucinationReason = `Waypoint "${w.name}" matches detachment name "Benge Route" without independent historical documentation.`;
      }
    }

    // Authoritative Route Grounding Registry Check
    const registryValidation = validateCandidateAgainstRegistry(
      rawTitle || text,
      w.canonicalName || w.name,
      w.routeGroupId || 'default',
      w.routeGroupName,
      w.memberships
    );
    let routeMembershipValid = true;
    let routeMembershipReason = "Documented or geographically plausible detachment corridor stop";

    if (registryValidation.isRegisteredEvent) {
      if (!registryValidation.isRegisteredAnchor) {
        routeMembershipValid = false;
        routeMembershipReason = registryValidation.reason;
      } else if (!registryValidation.isGroupValid) {
        routeMembershipValid = false;
        routeMembershipReason = registryValidation.reason;
      } else if (registryValidation.anchor) {
        // Authoritatively anchor type and role
        w.waypointType = registryValidation.anchor.waypointType;
        w.canonicalName = registryValidation.anchor.canonicalName;
        // Enforce authoritative coordinates over LLM hallucinations
        w.lat = registryValidation.anchor.lat;
        w.lng = registryValidation.anchor.lng;
        routeMembershipReason = registryValidation.reason;

        // Reconcile canonical memberships onto the waypoint
        if (registryValidation.canonicalMemberships && registryValidation.canonicalMemberships.length > 0) {
          w.memberships = registryValidation.canonicalMemberships;
          // Set primary scalar legacy fields to the group that matches the candidate, or the primary group
          const resolvedCandGroupId = (w.routeGroupId ? resolveCanonicalRouteGroup(registryValidation.eventTitle || 'Trail of Tears', w.routeGroupId)?.id : undefined) ||
            (w.routeGroupName ? resolveCanonicalRouteGroup(registryValidation.eventTitle || 'Trail of Tears', w.routeGroupName)?.id : undefined) ||
            w.routeGroupId;
          const matchedMem = registryValidation.canonicalMemberships.find(m => m.routeGroupId === resolvedCandGroupId) || registryValidation.canonicalMemberships.find(m => m.routeGroupId === w.routeGroupId) || registryValidation.canonicalMemberships[0];
          w.routeGroupId = matchedMem.routeGroupId;
          w.routeGroupName = matchedMem.routeGroupName;
        } else if (registryValidation.canonicalGroupDef) {
          w.routeGroupId = registryValidation.canonicalGroupDef.id;
          w.routeGroupName = registryValidation.canonicalGroupDef.name;
        }
      }
    }

    // Duplicate physical coordinates guard for distinct historical entities within the SAME route group
    const duplicateCoordConflict = validatedItems.find(item =>
      (item.routeGroupId || 'default') === (w.routeGroupId || 'default') &&
      Math.abs(item.lat - w.lat) < 0.0001 && Math.abs(item.lng - w.lng) < 0.0001 &&
      (item.canonicalName || item.name).toLowerCase() !== (w.canonicalName || w.name).toLowerCase()
    );
    let hasDuplicateCoordConflict = false;
    if (duplicateCoordConflict) {
      hasDuplicateCoordConflict = true;
      console.warn(`[Pipeline ${pipelineId}] REJECTING candidate "${w.name}": Shares identical coordinates (${w.lat}, ${w.lng}) with distinct entity "${duplicateCoordConflict.name}" in group "${w.routeGroupId || 'default'}"`);
    }

    // Source Evidence Validation Gate (for non-authoritative/non-registered events)
    let sourceEvidenceValid = true;
    if (!registryValidation.isRegisteredEvent && !histKnowledge) {
      const hasSourceEvidence = Boolean(w.sourceEvidence && typeof w.sourceEvidence === 'string' && w.sourceEvidence.trim().length > 0);
      const isHistoricalEventIntent = intent === 'HISTORICAL_EVENT' || intent === 'MULTI_LOCATION_DISCOVERY';
      if (!hasSourceEvidence && !isHistoricalEventIntent) {
        sourceEvidenceValid = false;
      }

      // Deterministic validation against actual source text if provided
      const sourceText = (w.metadata?.sourceText || (w as any).sourceText || '').toLowerCase();
      if (sourceText && sourceText.length > 0) {
        const nameLower = (w.canonicalName || w.name || '').toLowerCase().trim();
        const rawNameLower = (w.name || '').toLowerCase().trim();
        const inSource = (nameLower.length > 2 && sourceText.includes(nameLower)) || (rawNameLower.length > 2 && sourceText.includes(rawNameLower));
        const aliasInSource = Array.isArray(w.alternateNames) && w.alternateNames.some(alt => alt.trim().length > 2 && sourceText.includes(alt.toLowerCase().trim()));
        if (!inSource && !aliasInSource) {
          sourceEvidenceValid = false;
          conflictDetails = `Candidate "${w.name}" not mentioned in provided source content`;
        }
      }
    }

    const historicalEventMatch = entityIdentityValid && coordGeographicallyValid;
    const isAccepted = isCoordValid && isNameValid && historicalEventMatch && !isGenericRegion && !isRouteNameHallucination && routeMembershipValid && !hasDuplicateCoordConflict && sourceEvidenceValid;

    // Diagnostic Log: [CANONICAL HISTORICAL ROUTE VALIDATION]
    console.log(`[CANONICAL HISTORICAL ROUTE VALIDATION Candidate]
  ENTITY: ${isNameValid && entityIdentityValid ? 'PASS' : 'FAIL'} ("${w.canonicalName || w.name}")
  COORDINATES: ${isCoordValid && coordGeographicallyValid && !hasDuplicateCoordConflict ? 'PASS' : 'FAIL'} (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})
  EVENT MEMBERSHIP: ${historicalEventMatch ? 'PASS' : 'FAIL'}
  ROUTE MEMBERSHIP: ${routeMembershipValid ? 'PASS' : 'FAIL'} (Assigned: "${w.routeGroupId || 'default'}")
  WAYPOINT ROLE: ${w.waypointType || 'route_waypoint'}
  GENERIC REGION: ${isGenericRegion ? 'FAIL' : 'PASS'}
  ROUTE-NAME HALLUCINATION: ${isRouteNameHallucination ? 'FAIL (' + hallucinationReason + ')' : 'PASS'}
  SOURCE EVIDENCE: ${sourceEvidenceValid ? 'PASS' : 'FAIL'}
  REASON: ${w.segmentEvidenceReason || routeMembershipReason}
  ACTION: ${isAccepted ? 'ACCEPT' : 'REJECT'}`);

    if (!isAccepted) {
      if (!sourceEvidenceValid) {
        rejectedUnsupportedCount++;
        console.log(`[Route Validation] Waypoint rejected: ${w.name} — no source evidence`);
      }
      if (registryValidation.isRegisteredEvent || (rawTitle || text).toLowerCase().includes('trail of tears')) {
        console.warn(`[TRAIL OF TEARS CANDIDATE REJECTED]
name: "${w.name}"
routeGroupId: "${w.routeGroupId || 'default'}"
reason: "${!routeMembershipValid ? routeMembershipReason : (isGenericRegion ? 'Generic geographic region/state' : (isRouteNameHallucination ? hallucinationReason : (hasDuplicateCoordConflict ? 'Duplicate physical coordinates conflict' : 'Invalid entity/coordinates')))}"
expectedGroupId: "${registryValidation.expectedGroupId || 'N/A'}"`);
      }
      console.warn(`[Pipeline ${pipelineId}] Rejected candidate "${w.name}" in group "${w.routeGroupId}": genericRegion=${isGenericRegion}, hallucination=${isRouteNameHallucination}, routeValid=${routeMembershipValid}, dupCoord=${hasDuplicateCoordConflict}, sourceEvidenceValid=${sourceEvidenceValid}`);
      continue;
    }

    console.log(`[Route Validation] Waypoint accepted: ${w.name}`);
    validatedItems.push(w);
    if (!progressivelyEmittedWaypoints.has(w.id)) {
      progressivelyEmittedWaypoints.set(w.id, w);
      if (onWaypointProgress) {
        try {
          onWaypointProgress(w, [...validatedItems], validatedItems.length, normalizedItems.length);
        } catch (cbErr) {
          console.warn(`[Pipeline ${pipelineId}] onWaypointProgress callback error:`, cbErr);
        }
      }
    }
  }

  console.log(`\n===== TRACE ROUTE SOURCE & VALIDATION METRICS =====
Source Mode: ${sourceMode}
Source Content Length: ${sourceText.length} chars
Total Candidates: ${normalizedItems.length}
Rejected Activity/Editorial Phrases: ${rejectedActivityCount}
Rejected Unsupported/Hallucinated: ${rejectedUnsupportedCount}
Accepted Waypoints: ${validatedItems.length}
==================================================\n`);

  normalizedItems = validatedItems;
  logPipelineTrace("Stage 3: Historical Validation", normalizedItems);

  // Route Type & Multi-Route Event Classification
  let effectiveRouteType = rawRouteType;
  let effectiveEvidenceMode = rawRouteEvidenceMode;

  const normalizedRawType = String(rawRouteType || '').trim().toLowerCase();
  const effectiveIntent = intent || (/\b(battle|siege|war|treaty|assassination|revolution|conflict|expedition|event)\b/i.test(text || rawTitle || '') ? 'HISTORICAL_EVENT' : undefined);

  if (normalizedItems.length === 1) {
    if (
      normalizedRawType === 'regional_event' ||
      normalizedRawType === 'single_location' ||
      normalizedRawType === 'point' ||
      (normalizedRawType && effectiveIntent === 'HISTORICAL_EVENT')
    ) {
      effectiveRouteType = 'single_location';
      console.log(`[ROUTE TYPE RECONCILIATION]
Generated routeType: ${rawRouteType}
Valid waypoint count: ${normalizedItems.length}
Intent: ${effectiveIntent || 'UNKNOWN'}
Action: NORMALIZE_SINGLE_HISTORICAL_LOCATION
Reason: Single validated historical event location is sufficient; no additional waypoint evidence required.`);
    } else if (rawRouteType && normalizedRawType !== 'single_location' && normalizedRawType !== 'point') {
      console.log(`[ROUTE TYPE RECONCILIATION]
Generated routeType: ${rawRouteType}
Valid waypoint count: ${normalizedItems.length}
Intent: ${effectiveIntent || 'UNKNOWN'}
Action: CANNOT_NORMALIZE`);
    }
  }

  const normalizedEffectiveType = String(effectiveRouteType || '').trim().toLowerCase();

  // Canonical historical topology reconciliation assertion:
  // For authoritative multi-route events (e.g. Trail of Tears), maintain deterministic integrity
  // or when recovering from an empty/truncated AI output. If the caller specifically requested/generated
  // a subset of routes (e.g. Northern Route only), do not resurrect unrequested route groups!
  const authoritativeEventModel = getAuthoritativeEventModel(text) || getAuthoritativeEventModel(rawTitle);
  if (authoritativeEventModel) {
    const canonicalTopology = buildCanonicalEventTopology(text) || buildCanonicalEventTopology(rawTitle);
    if (canonicalTopology && canonicalTopology.route.length >= 1) {
      console.log(`[Pipeline ${pipelineId}] Reconciling canonical topology with AI enrichment for registered historical event "${canonicalTopology.title}".`);

      // Determine requested / generated route groups in scope from VALID canonical route groups
      const canonicalGroupIds = new Set(canonicalTopology.routeGroups.map(rg => rg.id));
      const validGeneratedGroupIds = new Set<string>();
      for (const item of normalizedItems) {
        const resG = resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, item.routeGroupId) || resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, item.routeGroupName);
        if (resG && canonicalGroupIds.has(resG.id)) {
          validGeneratedGroupIds.add(resG.id);
        } else if (item.routeGroupId && canonicalGroupIds.has(item.routeGroupId)) {
          validGeneratedGroupIds.add(item.routeGroupId);
        }
      }
      if (Array.isArray(rawRouteGroups)) {
        rawRouteGroups.forEach(rg => {
          const resG = resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, rg.id) || resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, rg.name);
          if (resG && canonicalGroupIds.has(resG.id)) {
            validGeneratedGroupIds.add(resG.id);
          } else if (rg.id && canonicalGroupIds.has(rg.id)) {
            validGeneratedGroupIds.add(rg.id);
          }
        });
      }

      // Check if the query specifically targeted a single route (e.g., "Trail of Tears Northern Route")
      const queryLower = (text || rawTitle || '').toLowerCase();
      const isNorthernTarget = queryLower.includes('northern');
      const isBengeTarget = queryLower.includes('benge');
      const isBellTarget = queryLower.includes('bell');
      const isWaterTarget = queryLower.includes('water');
      const isSpecificRouteTarget = isNorthernTarget || isBengeTarget || isBellTarget || isWaterTarget;

      // Filter canonical topology groups to only those in scope ONLY if a specific subset was targeted in the query!
      // AI response must NOT be allowed to prune or alter the authoritative event's route groups.
      let scopedCanonicalRoute = canonicalTopology.route;
      let scopedCanonicalGroups = canonicalTopology.routeGroups;
      let activeAllowedGroupIds: Set<string> | null = null;

      if (isSpecificRouteTarget) {
        const allowedGroupIds = new Set<string>();
        if (isNorthernTarget) allowedGroupIds.add('northern-route');
        if (isBengeTarget) allowedGroupIds.add('benge-route');
        if (isBellTarget) allowedGroupIds.add('bell-route');
        if (isWaterTarget) allowedGroupIds.add('water-route');
        activeAllowedGroupIds = allowedGroupIds;

        scopedCanonicalGroups = canonicalTopology.routeGroups.filter(rg => allowedGroupIds.has(rg.id));
        scopedCanonicalRoute = canonicalTopology.route.filter(r => allowedGroupIds.has(r.routeGroupId));
      }

      // Build route-scoped lookup map of validated AI candidates for enrichment
      // Key: `${routeGroupId}::${normalizedAnchorName}` and fallback key: `${normalizedAnchorName}`
      const aiEnrichmentMap = new Map<string, Waypoint>();
      const aiEnrichmentFallbackMap = new Map<string, Waypoint>();
      for (const item of normalizedItems) {
        const gId = item.routeGroupId || 'default';
        const nameNorm = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const canNorm = (item.canonicalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (nameNorm) {
          aiEnrichmentMap.set(`${gId}::${nameNorm}`, item);
          if (!aiEnrichmentFallbackMap.has(nameNorm)) aiEnrichmentFallbackMap.set(nameNorm, item);
        }
        if (canNorm) {
          aiEnrichmentMap.set(`${gId}::${canNorm}`, item);
          if (!aiEnrichmentFallbackMap.has(canNorm)) aiEnrichmentFallbackMap.set(canNorm, item);
        }
      }

      const hasBogusGroups = Array.isArray(rawRouteGroups) && rawRouteGroups.length > 0 && rawRouteGroups.some(rg => !resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, rg.id) && !resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, rg.name));
      const shouldRecoverFullTopology = hasBogusGroups || (validGeneratedGroupIds.size === 0 && !Array.isArray(rawRouteGroups) && normalizedItems.length === 0);

      if (shouldRecoverFullTopology) {
        // Full canonical topology recovery (e.g. 13 waypoints across 4 groups for Trail of Tears)
        const reconciledItems: Waypoint[] = [];
        for (const canonicalWp of scopedCanonicalRoute) {
          const normCan = (canonicalWp.canonicalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const normName = (canonicalWp.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const aiCand = (normCan ? aiEnrichmentMap.get(`${canonicalWp.routeGroupId}::${normCan}`) : undefined) ||
            (normName ? aiEnrichmentMap.get(`${canonicalWp.routeGroupId}::${normName}`) : undefined) ||
            (normCan ? aiEnrichmentFallbackMap.get(normCan) : undefined) ||
            (normName ? aiEnrichmentFallbackMap.get(normName) : undefined);

          if (aiCand) {
            const baseProvenance = aiCand.provenance || [];
            const assignedId = (aiCand.id && aiCand.id !== 'undefined' && !aiCand.id.startsWith('custom-') && !aiCand.id.startsWith('wrong-') && !aiCand.id.startsWith('fabricated-') && (!aiCand.routeGroupId || aiCand.routeGroupId === canonicalWp.routeGroupId)) ? aiCand.id : canonicalWp.id;
            reconciledItems.push({
              ...canonicalWp,
              id: assignedId,
              canonicalName: canonicalWp.canonicalName,
              name: canonicalWp.name,
              lat: canonicalWp.lat,
              lng: canonicalWp.lng,
              waypointType: canonicalWp.waypointType,
              sequence: canonicalWp.sequence,
              routeGroupId: canonicalWp.routeGroupId,
              routeGroupName: canonicalWp.routeGroupName,
              memberships: canonicalWp.memberships,
              description: aiCand.description || canonicalWp.description,
              significance: aiCand.significance || canonicalWp.significance,
              context: aiCand.context || canonicalWp.context,
              routeContext: aiCand.routeContext || canonicalWp.routeContext,
              historicalPeriod: aiCand.historicalPeriod || canonicalWp.historicalPeriod,
              role: canonicalWp.role || aiCand.role,
              provenance: [
                ...baseProvenance,
                {
                  stage: 'normalization',
                  source: 'hybrid',
                  timestamp: new Date().toISOString(),
                  summary: `Canonical waypoint topology reconciled with AI enrichment for ${canonicalWp.name}`
                }
              ]
            });
          } else {
            reconciledItems.push({
              ...canonicalWp,
              provenance: [
                ...(canonicalWp.provenance || []),
                {
                  stage: 'normalization',
                  source: 'deterministic',
                  timestamp: new Date().toISOString(),
                  summary: `Initialized canonical waypoint from historical registry for ${canonicalWp.name}`
                }
              ]
            });
          }
        }

        normalizedItems = reconciledItems;
        rawRouteGroups = scopedCanonicalGroups as any;
        effectiveRouteType = canonicalTopology.routeType;
        effectiveEvidenceMode = canonicalTopology.routeEvidenceMode as RouteEvidenceMode;
        rawIsSequential = canonicalTopology.isSequential;
      } else {
        // Candidate-level reconciliation for provided valid items
        const reconciledItems: Waypoint[] = [];
        const presentGroupIds = new Set<string>();

        for (const cand of normalizedItems) {
          const anchorMatch = findAuthoritativeAnchorAcrossEvent(authoritativeEventModel.eventTitle, cand.name) || findAuthoritativeAnchorAcrossEvent(authoritativeEventModel.eventTitle, cand.canonicalName);
          if (anchorMatch) {
            const anchor = anchorMatch.anchor;
            let targetGroupId = cand.routeGroupId || 'default';
            let targetGroupDef = authoritativeEventModel.routeGroups[targetGroupId];
            if (!targetGroupDef) {
              const resGroup = resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, targetGroupId) || resolveCanonicalRouteGroup(authoritativeEventModel.eventTitle, cand.routeGroupName);
              if (resGroup) {
                targetGroupId = resGroup.id;
                targetGroupDef = resGroup;
              } else if (anchorMatch.memberships.length > 0) {
                targetGroupId = anchorMatch.memberships[0].routeGroupId;
                targetGroupDef = authoritativeEventModel.routeGroups[targetGroupId];
              }
            }

            presentGroupIds.add(targetGroupId);

            let canonicalSeq = cand.sequence;
            if (targetGroupDef) {
              const aIdx = targetGroupDef.documentedAnchors.findIndex(a => isAnchorMatch(cand.canonicalName || cand.name, a));
              if (aIdx >= 0) {
                canonicalSeq = aIdx + 1;
              }
            }

            const assignedId = (cand.id && cand.id !== 'undefined' && !cand.id.startsWith('custom-') && !cand.id.startsWith('wrong-') && !cand.id.startsWith('fabricated-')) ? cand.id : `${targetGroupId}-${anchor.id}`;
            const baseProvenance = cand.provenance || [];
            const targetMemberships = (anchorMatch.memberships || []).filter(m => m.routeGroupId === targetGroupId);
            const finalMemberships = targetMemberships.length > 0
              ? targetMemberships
              : [{ routeGroupId: targetGroupId, routeGroupName: targetGroupDef?.name, sequence: canonicalSeq, membershipType: 'ROUTE_EXCLUSIVE' as const }];

            reconciledItems.push({
              ...cand,
              id: assignedId,
              canonicalName: anchor.canonicalName,
              name: anchor.name,
              lat: anchor.lat,
              lng: anchor.lng,
              waypointType: anchor.waypointType,
              sequence: canonicalSeq,
              routeGroupId: targetGroupId,
              routeGroupName: targetGroupDef?.name || cand.routeGroupName || 'Historical Route',
              memberships: finalMemberships,
              description: cand.description || anchor.historicalContext,
              significance: cand.significance || anchor.historicalContext,
              context: cand.context || anchor.historicalContext,
              routeContext: cand.routeContext || anchor.historicalContext,
              historicalPeriod: cand.historicalPeriod,
              role: cand.role || anchor.role,
              provenance: [
                ...baseProvenance,
                {
                  stage: 'normalization',
                  source: 'hybrid',
                  timestamp: new Date().toISOString(),
                  summary: `Canonical waypoint topology reconciled with AI enrichment for ${anchor.name}`
                }
              ]
            });
          }
        }

        if (reconciledItems.length > 0) {
          normalizedItems = reconciledItems;
          rawRouteGroups = canonicalTopology.routeGroups.filter(rg => presentGroupIds.has(rg.id)) as any;
          effectiveRouteType = canonicalTopology.routeType;
          effectiveEvidenceMode = canonicalTopology.routeEvidenceMode as RouteEvidenceMode;
          rawIsSequential = canonicalTopology.isSequential;
        } else {
          normalizedItems = scopedCanonicalRoute.map((canonicalItem: any): Waypoint => ({
            ...canonicalItem,
            provenance: [
              {
                stage: 'normalization',
                source: 'deterministic',
                timestamp: new Date().toISOString(),
                summary: `Initialized canonical waypoint from historical registry for ${canonicalItem.name}`
              }
            ]
          }));
          rawRouteGroups = scopedCanonicalGroups as any;
          effectiveRouteType = canonicalTopology.routeType;
          effectiveEvidenceMode = canonicalTopology.routeEvidenceMode as RouteEvidenceMode;
          rawIsSequential = canonicalTopology.isSequential;
        }
      }

      // Enforce coordinate immutability assertion: canonical coordinates must match registry exactly
      for (const item of normalizedItems) {
        const expectedAnchorMatch = findAuthoritativeAnchorAcrossEvent(authoritativeEventModel.eventTitle, item.canonicalName || item.name);
        if (expectedAnchorMatch) {
          const expectedAnchor = expectedAnchorMatch.anchor;
          if (Math.abs(item.lat - expectedAnchor.lat) > 1e-6 || Math.abs(item.lng - expectedAnchor.lng) > 1e-6) {
            console.warn(`[Pipeline ${pipelineId}] Coordinate mutation prevented for ${item.name}: Reverting (${item.lat}, ${item.lng}) -> (${expectedAnchor.lat}, ${expectedAnchor.lng})`);
            item.lat = expectedAnchor.lat;
            item.lng = expectedAnchor.lng;
          }
        }
      }
    }
  } else if (normalizedEffectiveType === 'point' || normalizedEffectiveType === 'single_location') {
    if (normalizedItems.length < 1) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed: '${effectiveRouteType}' routeType must have at least 1 valid waypoint. Found ${normalizedItems.length}`);
      return { waypoints: [], title: rawTitle, routeConfidence: rawRouteConfidence, routeType: effectiveRouteType as any, routeEvidenceMode: effectiveEvidenceMode };
    }
  } else {
    if (normalizedItems.length < 2) {
      console.warn(`[Pipeline ${pipelineId}] Structural Validation failed: Multi-location routeType '${effectiveRouteType}' must have at least 2 valid waypoints. Found ${normalizedItems.length}`);
      return { waypoints: [], title: rawTitle, routeConfidence: rawRouteConfidence, routeType: effectiveRouteType as any, routeEvidenceMode: effectiveEvidenceMode };
    }
  }

  // Stage 4: Deterministic Repair & Route Grouping
  console.log(`[Pipeline ${pipelineId}] Stage 4: Deterministic Repair & Route Grouping`);
  const repairedItems: Waypoint[] = [];

  // Group waypoints by route group and repair sequence route-locally
  // When explicit route groups are specified (such as canonical topology or AI-defined route groups),
  // pass them so groupWaypointsByRoute does not resurrect unrequested route groups.
  const routeGroups = groupWaypointsByRoute(normalizedItems, {
    title: rawTitle,
    routeType: effectiveRouteType as any,
    routeEvidenceMode: effectiveEvidenceMode,
    routeGroups: rawRouteGroups
  });

  console.log(`\n===== ROUTE GROUPING =====`);
  for (const group of routeGroups) {
    console.log(`Group ID: ${group.id}`);
    console.log(`Group Name: ${group.name}`);
    console.log(`Group Type: ${group.type || 'documented_route'}`);
    console.log(`Evidence Mode: ${group.routeEvidenceMode || effectiveEvidenceMode || 'DOCUMENTED_ROUTE'}`);
    console.log(`Is Sequential: ${group.isSequential}`);
    console.log(`Waypoints: [${group.waypoints.map(w => `${w.name} (Seq: ${w.sequence ?? 'none'})`).join(', ')}]`);
    console.log(`--------------------------`);
  }
  console.log(`==========================\n`);

  for (const group of routeGroups) {
    let groupWps = group.waypoints;

    // Protection against unsupported circular route closure (closing loop duplicate)
    if (groupWps.length >= 3) {
      const firstWp = groupWps[0];
      const lastWp = groupWps[groupWps.length - 1];
      const sameName = (firstWp.canonicalName || firstWp.name).toLowerCase() === (lastWp.canonicalName || lastWp.name).toLowerCase();
      const sameCoords = Math.abs(firstWp.lat - lastWp.lat) < 0.001 && Math.abs(firstWp.lng - lastWp.lng) < 0.001;

      if (sameName || sameCoords) {
        const isRegisteredCircuit = Boolean(authoritativeEventModel);
        if (!isRegisteredCircuit) {
          console.log(`[Route Validation] Segment rejected: ${lastWp.name} → ${firstWp.name} — unsupported route closure`);
          groupWps = groupWps.slice(0, groupWps.length - 1);
          group.waypoints = groupWps;
        }
      }
    }

    for (let i = 0; i < groupWps.length; i++) {
      const current = groupWps[i];
      const prev = repairedItems.length > 0 ? repairedItems[repairedItems.length - 1] : null;

      // Duplicate physical coordinates guard for distinct historical entities
      const existingSameCoord = repairedItems.find(item =>
        Math.abs(item.lat - current.lat) < 0.0001 && Math.abs(item.lng - current.lng) < 0.0001
      );

      if (existingSameCoord) {
        const isSameEntity = (existingSameCoord.canonicalName || existingSameCoord.name).toLowerCase() === (current.canonicalName || current.name).toLowerCase();
        const isSameGroup = (existingSameCoord.routeGroupId || 'default') === (current.routeGroupId || 'default');
        if (isSameEntity && isSameGroup && existingSameCoord.role === current.role) {
          // Exact duplicate instance of the same entity within the same route group: skip
          continue;
        }

        if (!isSameEntity) {
          console.warn(`[Pipeline ${pipelineId}] Duplicate physical coordinates detected for distinct entities: "${existingSameCoord.name}" and "${current.name}" at (${current.lat}, ${current.lng})`);
          const currentKb = getHistoricalEntityKnowledge(current.canonicalName || current.name);
          const existingKb = getHistoricalEntityKnowledge(existingSameCoord.canonicalName || existingSameCoord.name);

          if (currentKb?.approximateCoordinates && (
            Math.abs(currentKb.approximateCoordinates.lat - current.lat) > 0.01 ||
            Math.abs(currentKb.approximateCoordinates.lng - current.lng) > 0.01
          )) {
            console.log(`[Pipeline ${pipelineId}] Deterministically repairing conflicting duplicate coordinates for "${current.name}" to (${currentKb.approximateCoordinates.lat}, ${currentKb.approximateCoordinates.lng})`);
            current.lat = currentKb.approximateCoordinates.lat;
            current.lng = currentKb.approximateCoordinates.lng;
            current.provenance!.push({
              stage: 'deterministic_repair',
              source: 'deterministic',
              timestamp: new Date().toISOString(),
              summary: `Repaired conflicting duplicate coordinates to distinct authoritative site for ${currentKb.entity}`
            });
          } else if (existingKb?.approximateCoordinates && (
            Math.abs(existingKb.approximateCoordinates.lat - existingSameCoord.lat) > 0.01 ||
            Math.abs(existingKb.approximateCoordinates.lng - existingSameCoord.lng) > 0.01
          )) {
            console.log(`[Pipeline ${pipelineId}] Deterministically repairing conflicting duplicate coordinates for "${existingSameCoord.name}" to (${existingKb.approximateCoordinates.lat}, ${existingKb.approximateCoordinates.lng})`);
            existingSameCoord.lat = existingKb.approximateCoordinates.lat;
            existingSameCoord.lng = existingKb.approximateCoordinates.lng;
            existingSameCoord.provenance!.push({
              stage: 'deterministic_repair',
              source: 'deterministic',
              timestamp: new Date().toISOString(),
              summary: `Repaired conflicting duplicate coordinates to distinct authoritative site for ${existingKb.entity}`
            });
          }
        }
      }

      current.name = current.name.trim();
      if (current.description) current.description = current.description.trim();
      if (current.significance) current.significance = current.significance.trim();

      // Enforce route-local sequence beginning deterministically at 1 within each route group
      const localSeq = i + 1;
      if (current.sequence !== localSeq) {
        current.sequence = localSeq;
        current.provenance!.push({
          stage: 'deterministic_repair',
          source: 'deterministic',
          timestamp: new Date().toISOString(),
          summary: `Assigned route-local sequence ${localSeq} in group ${group.id}`
        });
      }

      current.globalSequence = repairedItems.length + 1;
      current.routeGroupId = group.id;
      current.routeGroupName = group.name;

      current.provenance!.push({
        stage: 'deterministic_repair',
        source: 'deterministic',
        timestamp: new Date().toISOString()
      });

      repairedItems.push(current);
    }
  }

  logPipelineTrace("Stage 4: Deterministic Repair & Grouping", repairedItems);

  // Stage 5: LLM Audit
  console.log(`[Pipeline ${pipelineId}] Stage 5: LLM Audit`);
  const isAuthoritativeEvent = Boolean(getAuthoritativeEventModel(rawTitle || text));
  if (isAuthoritativeEvent) {
    console.log(`[Pipeline ${pipelineId}] Skipping LLM audit for authoritative historical event "${rawTitle || text}" to protect canonical registry truth.`);
    issues = [];
  } else {
    try {
      const auditPrompt = `
        You are an expert historian auditor. Review the following historical route waypoints.
        You must optimize for precision over recall. Return corrections ONLY when highly confident (>0.90). If uncertain, return no issue rather than speculate.

        Look for:
        - Glaring historical inaccuracies in names or descriptions.
        - Anachronisms.
        - Waypoints that are continents, countries, vast empires, or broad regions (e.g. "Europe", "Persian Empire"). For these, suggest a specific, traversable historical stop (city, port, oasis, fortress) that replaces the broad region in the context of the journey.


        Input Data:
        ${JSON.stringify(repairedItems.map(w => ({ id: w.id, name: w.name, description: w.description, historicalPeriod: w.historicalPeriod })), null, 2)}

        Output Schema:
        Return a STRICT JSON array of HistoricalIssue objects:
        [
          {
            "waypointId": "wp-xxx",
            "operation": "replace",
            "severity": "error",
            "confidence": 0.95,
            "field": "name",
            "originalValue": "Old Name",
            "replacement": "Corrected Name",
            "reason": "Why it was corrected",
            "source": "historical_llm"
          }
        ]

        If no issues are found, return [].
      `;
      const response = await generateContentWithRetry({
        model: modelName,
        contents: auditPrompt,
        config: { maxOutputTokens: 2048 }
      });

      const parseResult = parseAndExtract(response.text);

      console.log(`\n===== LLM AUDIT JSON PIPELINE =====`);
      console.log(`Extraction: ${parseResult.extracted ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Parse: ${parseResult.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Repair: ${parseResult.success && parseResult.repairs && parseResult.repairs.length > 0 ? 'SUCCESS' : (parseResult.success ? 'SKIPPED' : 'FAILED')}`);
      console.log(`Fallback: ${!parseResult.success ? 'USED' : 'SKIPPED'}`);
      console.log(`===================================\n`);

      if (parseResult.success && Array.isArray(parseResult.value)) {
         const parsed = parseResult.value;
         issues = parsed.filter((iss: any) => iss && typeof iss === 'object' && iss.waypointId && (iss.confidence === undefined || iss.confidence >= 0.90));
         console.log(`[Pipeline ${pipelineId}] Audit passed with ${issues.length} high-confidence actionable issues.`);
      }
    } catch (auditErr) {
      console.error(`[Pipeline ${pipelineId}] Audit failed:`, auditErr);
      console.log(`[Pipeline ${pipelineId}] Proceeding with 0 patches due to audit failure.`);
      issues = [];
    }
  }

  // Stage 6: Patch
  console.log(`[Pipeline ${pipelineId}] Stage 6: Patch (${issues.length} high-confidence issues)`);
  const MUTABLE_ENRICHMENT_FIELDS = new Set([
    'description',
    'significance',
    'context',
    'historicalPeriod'
  ]);

  const patchedItems = repairedItems.map((wp, idx) => {
    const wpIssues = issues.filter(iss => iss.waypointId === wp.id);
    if (wpIssues.length === 0) return wp;

    let patchedWp = { ...wp };
    let patchesApplied = 0;

    for (const issue of wpIssues) {
      if (issue.operation === 'replace' && issue.field) {
        if (!MUTABLE_ENRICHMENT_FIELDS.has(issue.field)) {
          console.warn(
            `[Pipeline ${pipelineId}] AUDIT PATCH REJECTED\n` +
            `waypointId: ${wp.id}\n` +
            `field: ${issue.field}\n` +
            `original: ${(wp as any)[issue.field]}\n` +
            `replacement: ${issue.replacement}\n` +
            `reason: canonical waypoint identity is immutable`
          );
          continue;
        }

        if ((patchedWp as any)[issue.field] === issue.originalValue || !issue.originalValue) {
          (patchedWp as any)[issue.field] = issue.replacement;
          patchesApplied++;
        } else {
           console.warn(`[Pipeline ${pipelineId}] Aborted patch on ${patchedWp.name}.${issue.field} due to stale originalValue.`);
        }
      }
    }

    if (patchesApplied > 0) {
      patchedWp.provenance!.push({
        stage: 'patch',
        source: 'llm',
        timestamp: new Date().toISOString(),
        summary: `Applied ${patchesApplied} historical narrative patches`
      });
    }

    if (idx === 0) logFieldDiff('Stage 6: Patch', wp, patchedWp);
    if (idx === 0) logWaypointSnapshot('Stage 6: Patch', patchedWp);

    return patchedWp;
  });

  // Stage 6.5: Final Deterministic Validation Guard
  console.log(`[Pipeline ${pipelineId}] Stage 6.5: Final Deterministic Validation Guard`);
  const placeholderPatterns = [
    /NEEDS_LLM_REPLACEMENT/i,
    /UNKNOWN_LOCATION/i,
    /INVALID_LOCATION/i,
    /Needs LLM Replacement/i,
    /UNKNOWN/i,
    /TBD/i,
    /PLACEHOLDER/i
  ];

  const cleanItems: Waypoint[] = [];
  const itemsToProcess = [...patchedItems];

  for (let i = 0; i < itemsToProcess.length; i++) {
    const wp = itemsToProcess[i];
    const fieldsToScan = [wp.name, wp.canonicalName, wp.modernLocation, wp.description].filter(Boolean) as string[];
    const hasPlaceholder = fieldsToScan.some(text => placeholderPatterns.some(pattern => pattern.test(text)));

    if (hasPlaceholder) {
      console.log(`\n===== PLACEHOLDER REMOVAL =====`);
      console.log(`Removed:\n${wp.id} ${wp.name} ${wp.name.includes('NEEDS_LLM_REPLACEMENT') ? 'NEEDS_LLM_REPLACEMENT' : 'INVALID_LOCATION'}`);

      const removedId = wp.id;
      const newParentId = wp.parentId;
      const childrenToUpdate = itemsToProcess.filter(c => c.parentId === removedId);

      if (childrenToUpdate.length > 0) {
         childrenToUpdate.forEach(c => c.parentId = newParentId);
         console.log(`Reparented:\n${childrenToUpdate.map(c => `${c.id} -> ${newParentId || 'none'}`).join('\n')}`);
      }
      console.log(`===============================`);

      placeholderRemoved++;
      itemsToProcess.splice(i, 1);
      i--;
      continue;
    }
  }

  cleanItems.push(...itemsToProcess);

  logPipelineTrace("Stage 6.5: Clean Waypoints", cleanItems);

  console.log(`[Pipeline ${pipelineId}] WAYPOINTS BEFORE STAGE 7:`);
  cleanItems.forEach(wp => console.log(`  - ${wp.name} (ID: ${wp.id}, parentId: ${wp.parentId})`));

  // Stage 7: Sequential Hierarchy
  if (intent === 'route' && cleanItems.length > 0) {
    const isMultiRouteEvent = effectiveEvidenceMode === 'MULTI_ROUTE_EVENT' || cleanItems.some(w => Boolean(w.routeGroupId));

    if (isMultiRouteEvent) {
      // For multi-route events, build hierarchy per route group independently
      const distinctGroupIds = Array.from(new Set(cleanItems.map(w => w.routeGroupId || 'default')));
      for (const gId of distinctGroupIds) {
        const groupWps = cleanItems.filter(w => (w.routeGroupId || 'default') === gId);
        groupWps.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        let lastPrimaryId: string | undefined = undefined;

        for (let i = 0; i < groupWps.length; i++) {
          const wp = groupWps[i];
          const oldParent = wp.parentId;
          let newParent: string | undefined = undefined;
          let reason = "";

          const isPrimary = wp.role === 'primary' || !wp.role;
          if (isPrimary) {
            if (!lastPrimaryId) {
              newParent = undefined;
              reason = "First primary node in route group";
            } else {
              newParent = lastPrimaryId;
              reason = "Chronological chain of primary nodes in group";
            }
            lastPrimaryId = wp.id;
          } else {
            if (lastPrimaryId) {
              newParent = lastPrimaryId;
              reason = "Attached related/context node to nearest preceding primary in group";
            } else {
              newParent = undefined;
              reason = "No preceding primary node available in group";
            }
          }

          if (oldParent !== newParent) {
            console.log(`\n===== HIERARCHY REPAIR =====\nWaypoint: ${wp.name}\nOld Parent: ${oldParent || 'none'}\nNew Parent: ${newParent || 'none'}\nReason: ${reason}\n==============================`);
            if (newParent) {
              wp.parentId = newParent;
            } else {
              delete wp.parentId;
            }
          }
        }
      }
    } else {
      // Single continuous route: preserve existing traversal order
      cleanItems.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      let lastPrimaryId: string | undefined = undefined;

      for (let i = 0; i < cleanItems.length; i++) {
        const wp = cleanItems[i];
        const oldParent = wp.parentId;
        let newParent: string | undefined = undefined;
        let reason = "";

        const isPrimary = wp.role === 'primary' || !wp.role;
        if (isPrimary) {
           if (!lastPrimaryId) {
              newParent = undefined;
              reason = "First primary node in route";
           } else {
              newParent = lastPrimaryId;
              reason = "Chronological chain of primary nodes";
           }
           lastPrimaryId = wp.id;
        } else {
           if (lastPrimaryId) {
               newParent = lastPrimaryId;
               reason = "Attached related/context node to nearest preceding primary";
           } else {
               newParent = undefined;
               reason = "No preceding primary node available to attach to";
           }
        }

        if (oldParent !== newParent) {
            console.log(`\n===== HIERARCHY REPAIR =====\nWaypoint: ${wp.name}\nOld Parent: ${oldParent || 'none'}\nNew Parent: ${newParent || 'none'}\nReason: ${reason}\n==============================`);
            if (newParent) {
               wp.parentId = newParent;
            } else {
               delete wp.parentId;
            }
        }
      }
    }

    console.log(`\n===== STAGE 7 FINAL HIERARCHY =====`);
    console.log(`PRIMARY CHAIN:`);
    let primaryIndex = 1;
    cleanItems.filter(wp => wp.role === 'primary').forEach(wp => {
      const parentName = wp.parentId ? cleanItems.find(p => p.id === wp.parentId)?.name || wp.parentId : 'none';
      console.log(`${primaryIndex++}. ${wp.name} parent:${parentName}`);
    });
    console.log(`CHILD CONTEXT:`);
    cleanItems.filter(wp => wp.role !== 'primary').forEach(wp => {
      const parentName = wp.parentId ? cleanItems.find(p => p.id === wp.parentId)?.name || wp.parentId : 'none';
      console.log(`${wp.name} -> ${parentName}`);
    });
    console.log(`==============================\n`);
  }

  logHierarchy(cleanItems);

  if (cleanItems.length > 0) {
      logWaypointSnapshot('Stage 7: Sequential Hierarchy', cleanItems[0]);
  }

  // Final Validation for Orphaned Parents
  for (const wp of cleanItems) {
     if (wp.parentId) {
         const parentExists = cleanItems.some(p => p.id === wp.parentId);
         if (!parentExists) {
             console.log(`\n===== ORPHANED PARENT DETECTED =====`);
             console.log(`Waypoint: ${wp.id}`);
             console.log(`Invalid Parent: ${wp.parentId}`);
             console.log(`===================================\n`);
         }
     }
  }

  const isMultiRoute = effectiveEvidenceMode === 'MULTI_ROUTE_EVENT' || cleanItems.some(w => Boolean(w.routeGroupId));
  const isParentHierarchyValid = isMultiRoute
    ? cleanItems.every(w => Boolean(w.routeGroupId || w.routeGroupName || w.sequence !== undefined || w.parentId !== undefined))
    : cleanItems.every((w, idx) => idx === 0 || w.parentId !== undefined);

  const summary: PipelineSummary = {
      generated: rawItems.length,
      validated: normalizedItems.length,
      validationIssues: validationIssuesCount,
      llmRepairs: issues.length - validationIssuesCount,
      deterministicRepairs: repairedItems.length - normalizedItems.length,
      retryInvocations: 0, // Set upstream
      canonicalFieldsPresent: cleanItems.every(w => w.canonicalName !== undefined || w.modernLocation !== undefined || w.historicalRegion !== undefined),
      parentHierarchyValid: isParentHierarchyValid,
      placeholderRemoved,
      placeholderRepaired, // Repaired placeholders are technically LLM repairs if they didn't hit this removal block
      finalRouteValid: cleanItems.length > 0 && !cleanItems.some(wp => [wp.name, wp.canonicalName, wp.modernLocation, wp.description].filter(Boolean).some(text => placeholderPatterns.some(pattern => pattern.test(text as string))))
  };

  logPipelineSummary(summary);

  console.log(`[Pipeline ${pipelineId}] === PIPELINE COMPLETE ===`);
  if (intent === 'MULTI_LOCATION_DISCOVERY') {
    console.log(`[DISCOVERY RESULTS]\nquery="${text.toLowerCase()}"\nresultCount=${cleanItems.length}\nmode=MULTI_LOCATION`);
  }
  // Deterministic Global Sequence Derivation & Route-Local Sequence Enforcement
  // Invariant:
  // 1. Order route groups according to their explicit order in the Historical Route Registry (or rawRouteGroups).
  // 2. Order waypoints within each route group by route-local sequence.
  // 3. Use waypoint ID only as a deterministic tie-breaker if necessary.
  // 4. Flatten the ordered route groups into the final waypoint collection.
  // 5. Assign: globalSequence = flattenedWaypointIndex + 1.
  // 6. globalSequence is strictly derived metadata and NEVER used for rendering or route-local numbering.

  const canonicalReconciledRouteGroups = rawRouteGroups ? rawRouteGroups.map(rg => {
    const canonicalDef = resolveCanonicalRouteGroup(rawTitle || text, rg.id) ||
      resolveCanonicalRouteGroup(rawTitle || text, rg.name);
    if (canonicalDef) {
      return {
        ...rg,
        id: canonicalDef.id,
        name: canonicalDef.name
      };
    }
    return rg;
  }) : rawRouteGroups;

  // Group cleanItems by route group
  const rawGrouped = groupWaypointsByRoute(cleanItems, {
    title: rawTitle,
    routeType: effectiveRouteType as any,
    routeEvidenceMode: effectiveEvidenceMode,
    routeGroups: canonicalReconciledRouteGroups
  });

  // Reconcile group order with authoritative registry if available
  const authModel = getAuthoritativeEventModel(rawTitle || text);
  let orderedGroups = [...rawGrouped];
  if (authModel && authModel.routeGroups) {
    const registryOrder = Object.keys(authModel.routeGroups);
    orderedGroups.sort((a, b) => {
      const idxA = registryOrder.indexOf(a.id);
      const idxB = registryOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }

  // Deduplicate and flatten in deterministic order
  const seenWaypoints = new Set<string>();
  const flattenedOrderedWaypoints: Waypoint[] = [];

  for (const group of orderedGroups) {
    // Sort within route group by route-local sequence, tie-breaker: waypoint ID
    const sortedGroupWps = [...(group.waypoints || [])].sort((a, b) => {
      const seqDiff = (a.sequence ?? 0) - (b.sequence ?? 0);
      if (seqDiff !== 0) return seqDiff;
      return (a.id || '').localeCompare(b.id || '');
    });

    // Enforce contiguous route-local sequence 1..N
    sortedGroupWps.forEach((wp, localIdx) => {
      if (!seenWaypoints.has(wp.id)) {
        seenWaypoints.add(wp.id);
        wp.sequence = localIdx + 1;
        wp.routeGroupId = group.id;
        wp.routeGroupName = group.name;
        flattenedOrderedWaypoints.push(wp);
      }
    });

    // Update group.waypoints to match the sorted collection
    group.waypoints = sortedGroupWps.filter(w => seenWaypoints.has(w.id));
  }

  // Assign derived globalSequence = flattenedWaypointIndex + 1
  flattenedOrderedWaypoints.forEach((wp, idx) => {
    wp.globalSequence = idx + 1;
  });

  // Replace cleanItems with the deterministic flattened collection
  cleanItems.length = 0;
  cleanItems.push(...flattenedOrderedWaypoints);

  const finalRouteGroups = orderedGroups;
  const populatedRouteGroups = finalRouteGroups.filter(g => g.waypoints && g.waypoints.length > 0);
  const unpopulatedRouteGroups = finalRouteGroups.filter(g => !g.waypoints || g.waypoints.length === 0);

  console.log(`\n===== ROUTE COMPLETENESS =====`);
  for (const group of populatedRouteGroups) {
    const wpCount = group.waypoints.length;
    const isComplete = wpCount >= 2;
    console.log(`Route: ${group.name} (${group.id})`);
    console.log(`Waypoints: ${wpCount}`);
    console.log(`Segments: ${Math.max(0, wpCount - 1)}`);
    console.log(`Status: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
    if (!isComplete) {
      console.log(`Reason: fewer than 2 surviving authoritative waypoints`);
    }
    console.log(`------------------------------`);
  }
  console.log(`==============================\n`);

  if (unpopulatedRouteGroups.length > 0) {
    console.warn(
      `[Pipeline ${pipelineId}] INCOMPLETE HISTORICAL ROUTE GROUP WARNING:\n` +
      `Declared route groups with 0 waypoints:\n` +
      unpopulatedRouteGroups.map(g => `  - ${g.name} (${g.id})`).join('\n')
    );
  }

  // Phase 7: Canonical Data Integrity Check & Segment Evidence Derivation
  if ((rawTitle || text).toLowerCase().includes('trail of tears')) {
    console.log(`\n========================================`);
    console.log(`[TRAIL OF TEARS FINAL PRODUCTION AUDIT]`);
    console.log(`========================================`);
    for (const group of populatedRouteGroups) {
      // Deterministically derive segment evidence for consecutive pairs in the group
      for (let i = 0; i < group.waypoints.length - 1; i++) {
        const fromWp = group.waypoints[i];
        const toWp = group.waypoints[i + 1];
        const segmentAudit = validateDocumentedSegment(rawTitle || text, fromWp.canonicalName || fromWp.name, toWp.canonicalName || toWp.name, group.id);
        fromWp.segmentEvidence = segmentAudit.segmentEvidence;
        fromWp.segmentEvidenceReason = segmentAudit.reason;
      }

      for (const wp of group.waypoints) {
        console.log(`* id: ${wp.id}
  name: ${wp.name}
  canonicalName: ${wp.canonicalName || wp.name}
  lat: ${wp.lat}
  lng: ${wp.lng}
  routeGroupId: ${wp.routeGroupId || 'default'}
  routeGroupName: ${wp.routeGroupName || group.name}
  sequence: ${wp.sequence}
  globalSequence: ${wp.globalSequence}
  waypointType: ${wp.waypointType || 'route_waypoint'}
  segmentEvidence: ${wp.segmentEvidence || 'DOCUMENTED_ROUTE_SEGMENT'}
  segmentEvidenceReason: ${wp.segmentEvidenceReason || 'Standard sequence'}
  provenance: ${wp.provenance && wp.provenance.length > 0 ? wp.provenance.map(p => p.stage).join(' -> ') : 'initial_generation'}`);
      }
    }

    console.log(`\n[TRAIL OF TEARS FINAL GROUP COUNTS]`);
    const countFor = (id: string) => (populatedRouteGroups.find(g => g.id === id)?.waypoints.length || 0);
    console.log(`Northern Route: ${countFor('northern-route')}`);
    console.log(`Benge Route: ${countFor('benge-route')}`);
    console.log(`Bell Route: ${countFor('bell-route')}`);
    console.log(`Water Route: ${countFor('water-route')}`);

    console.log(`\n[TRAIL OF TEARS FINAL SEGMENT AUDIT]`);
    for (const group of populatedRouteGroups) {
      for (let i = 0; i < group.waypoints.length - 1; i++) {
        const fromWp = group.waypoints[i];
        const toWp = group.waypoints[i + 1];
        const willDraw = fromWp.waypointType !== 'non_route_location' && toWp.waypointType !== 'non_route_location' && fromWp.segmentEvidence === 'DOCUMENTED_ROUTE_SEGMENT';
        console.log(`${fromWp.name} → ${toWp.name}
routeGroupId: ${group.id}
sequence ${fromWp.sequence} → sequence ${toWp.sequence}
segmentEvidence: ${fromWp.segmentEvidence}
renderable: ${willDraw ? 'YES' : 'NO'}`);
      }
    }
    console.log(`========================================\n`);
  } else {
    console.log(`\n===== [FINAL CANONICAL ROUTE DATA] =====`);
    for (const group of populatedRouteGroups) {
      console.log(`Route Group: ${group.name} (${group.id})`);
      for (let i = 0; i < group.waypoints.length - 1; i++) {
        const fromWp = group.waypoints[i];
        const toWp = group.waypoints[i + 1];
        const segmentAudit = validateDocumentedSegment(rawTitle || text, fromWp.canonicalName || fromWp.name, toWp.canonicalName || toWp.name, group.id);
        fromWp.segmentEvidence = segmentAudit.segmentEvidence;
        fromWp.segmentEvidenceReason = segmentAudit.reason;
      }

      group.waypoints.forEach((wp) => {
        console.log(`  ${wp.sequence}. id="${wp.id}" name="${wp.name}" canonical="${wp.canonicalName || wp.name}" lat=${wp.lat} lng=${wp.lng} type=${wp.waypointType || 'route_waypoint'} evidence=${wp.segmentEvidence || 'DOCUMENTED_ROUTE_SEGMENT'}`);
      });
    }
    console.log(`=========================================\n`);
  }

  console.log(`\n===== [ROUTE INVARIANT CHECK] =====`);
  const idSet = new Set<string>();
  let duplicateIds = 0;
  let invariantViolations = 0;

  for (const wp of cleanItems) {
    if (idSet.has(wp.id)) {
      duplicateIds++;
      console.warn(`[Integrity Violation] Duplicate waypoint ID detected: "${wp.id}" (${wp.name})`);
    }
    idSet.add(wp.id);
  }

  for (const group of populatedRouteGroups) {
    const sequences = group.waypoints.map(w => w.sequence);
    const isContiguousFromOne = sequences.every((seq, idx) => seq === idx + 1);
    const hasConsistentGroupId = group.waypoints.every(w => (w.routeGroupId || 'default') === group.id);
    const hasUniqueIds = new Set(group.waypoints.map(w => w.id)).size === group.waypoints.length;

    console.log(`${group.name}:`);
    console.log(`  sequence: [${sequences.join(', ')}] (starts at 1: ${isContiguousFromOne ? 'YES' : 'NO'})`);
    console.log(`  unique IDs: ${hasUniqueIds ? 'YES' : 'NO'}`);
    console.log(`  routeGroup consistency: ${hasConsistentGroupId ? 'YES' : 'NO'}`);

    if (!isContiguousFromOne || !hasConsistentGroupId || !hasUniqueIds) {
      invariantViolations++;
    }
  }

  console.log(`\nTotal Canonical Waypoints: ${cleanItems.length}`);
  console.log(`Populated Route Groups: ${populatedRouteGroups.length}`);
  console.log(`Unpopulated Route Groups: ${unpopulatedRouteGroups.length}`);
  console.log(`Integrity Check Result: ${duplicateIds === 0 && invariantViolations === 0 ? 'PASSED' : 'FLAGGED'}`);
  console.log(`===================================\n`);

  const isSequential = isRouteSequential(cleanItems, {
    routeType: effectiveRouteType,
    isSequential: rawIsSequential
  });

  // Resolve water-aware routing geometry for maritime routes and detachments
  const groupsToResolve = populatedRouteGroups.length > 0 ? populatedRouteGroups : finalRouteGroups;
  for (const group of groupsToResolve) {
    if (group.waypoints && group.waypoints.length >= 2) {
      if (isMaritimeJourney({ title: rawTitle, routeType: effectiveRouteType, corridorDescription: group.description }, group, group.waypoints)) {
        const resolvedGroupWps = resolveWaterAwareRoute(group.waypoints, { title: rawTitle, routeType: effectiveRouteType });
        group.waypoints = resolvedGroupWps;
      }
    }
  }

  const finalWaypoints = isMaritimeJourney({ title: rawTitle, routeType: effectiveRouteType }, undefined, cleanItems)
    ? resolveWaterAwareRoute(cleanItems, { title: rawTitle, routeType: effectiveRouteType })
    : cleanItems;

  const finalRoute: Route = {
    waypoints: finalWaypoints,
    title: rawTitle,
    routeConfidence: rawRouteConfidence,
    routeType: effectiveRouteType as any,
    isSequential,
    routeEvidenceMode: effectiveEvidenceMode,
    routeGroups: populatedRouteGroups.length > 0 ? populatedRouteGroups : finalRouteGroups
  };

  logPipelineTrace("Final Canonical Route", finalRoute.waypoints);

  logHistoricalRouteStructure(finalRoute);

  const validationResult = validateHistoricalRouteData(finalRoute);
  if (!validationResult.isValid && process.env.NODE_ENV !== 'production') {
    console.warn(`[Pipeline ${pipelineId}] Historical Route Validation flagged ${validationResult.issues.length} issue(s):`);
    validationResult.issues.forEach(iss => console.warn(`  - ${iss}`));
  }

  return finalRoute;
};
