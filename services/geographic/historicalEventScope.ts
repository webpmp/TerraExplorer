import { HistoricalGeographicScope } from '../../domain';
import { getHistoricalEntityKnowledge } from './historicalCoordinateValidator';
import { toCanonicalTitleCase } from './historicalCoordinateValidator';

export interface HistoricalEventScopeResult {
  scope: HistoricalGeographicScope;
  singleLocation: boolean;
  routing: 'SINGLE_LOCATION' | 'HISTORICAL_NON_POINT';
  reason: string;
}

/**
 * Determines whether a historical event has a single canonical geographic location
 * (POINT_EVENT) or represents a broad regional/global/non-point historical occurrence.
 */
export function determineHistoricalEventScope(
  entityName: string,
  rawQuery?: string
): HistoricalEventScopeResult {
  const normEntity = (entityName || '').toLowerCase().trim();
  const cleanEntity = normEntity.replace(/^(?:the|a|an)\s+/i, '').trim();
  const queryStr = (rawQuery || '').toLowerCase().trim();

  // 1. Authoritative Historical Knowledge Base check
  const kbEntry =
    getHistoricalEntityKnowledge(normEntity) ||
    getHistoricalEntityKnowledge(cleanEntity) ||
    getHistoricalEntityKnowledge(entityName);

  if (kbEntry) {
    if (kbEntry.geographicScope) {
      const isPoint = kbEntry.geographicScope === 'POINT_EVENT';
      const singleLoc = kbEntry.singleLocation ?? isPoint;
      return {
        scope: kbEntry.geographicScope,
        singleLocation: singleLoc,
        routing: singleLoc ? 'SINGLE_LOCATION' : 'HISTORICAL_NON_POINT',
        reason: singleLoc
          ? `Authoritative historical knowledge base identifies point site: ${kbEntry.entity}`
          : (kbEntry.geographicScope === 'GLOBAL_EVENT'
              ? 'entity has no single canonical geographic location'
              : `Authoritative historical knowledge base identifies broad ${kbEntry.geographicScope}: ${kbEntry.entity}`)
      };
    }

    if (kbEntry.singleLocation === false) {
      return {
        scope: 'GLOBAL_EVENT',
        singleLocation: false,
        routing: 'HISTORICAL_NON_POINT',
        reason: 'entity has no single canonical geographic location'
      };
    }

    if (kbEntry.approximateCoordinates || kbEntry.exactLocationConfirmed) {
      return {
        scope: 'POINT_EVENT',
        singleLocation: true,
        routing: 'SINGLE_LOCATION',
        reason: `Authoritative historical knowledge base provides coordinates for event site: ${kbEntry.entity}`
      };
    }
  }

  // 2. Heuristic Pattern: Global historical events, macro-economic crises, and multi-theater conflicts
  const globalPatterns = [
    /\b(?:great\s+depression|depression\s+of\s+1929|world\s+war\s+(?:i{1,3}|iv|1|2|3)|second\s+world\s+war|first\s+world\s+war|cold\s+war|space\s+race|industrial\s+revolution|global\s+financial\s+crisis)\b/i,
    /\b(?:world\s+war|global\s+conflict|global\s+pandemic|worldwide\s+depression|economic\s+crisis)\b/i
  ];

  for (const pattern of globalPatterns) {
    if (pattern.test(cleanEntity) || pattern.test(queryStr)) {
      return {
        scope: 'GLOBAL_EVENT',
        singleLocation: false,
        routing: 'HISTORICAL_NON_POINT',
        reason: 'entity has no single canonical geographic location'
      };
    }
  }

  // 3. Heuristic Pattern: Broad regional movements, eras, and cultural transformations
  const regionalPatterns = [
    /\b(?:viking\s+age|bronze\s+age|iron\s+age|stone\s+age|middle\s+ages|dark\s+ages|renaissance|enlightenment|reformation|protestant\s+reformation|counter-reformation|age\s+of\s+discovery|age\s+of\s+sail|feudalism|pax\s+romana|pax\s+mongolica)\b/i,
    /\b(?:migration\s+period|mongol\s+conquests|islamic\s+golden\s+age|crusades)\b/i
  ];

  for (const pattern of regionalPatterns) {
    if (pattern.test(cleanEntity) || pattern.test(queryStr)) {
      return {
        scope: 'REGIONAL_EVENT',
        singleLocation: false,
        routing: 'HISTORICAL_NON_POINT',
        reason: 'entity is a historical era or regional movement spanning multiple geographic areas'
      };
    }
  }

  // 4. Heuristic Pattern: Point event indicators (Battles, Massacres, Signings, Disasters, Specific Events at specific sites)
  const pointPatterns = [
    /\b(?:battle|siege|massacre|assassination|assassinated|murder|shot|signing|signed|treaty|surrender|sinking|sink|sank|wreck|disaster|explosion|bombing|eruption|erupted|launch|launched|landing|landed|riot|protest|summit|mutiny|strike|fire|skirmish|disappearance|disappear|disappeared|crash|crashed|founding|founded|festival|concert|woodstock)\b/i
  ];

  for (const pattern of pointPatterns) {
    if (pattern.test(cleanEntity) || pattern.test(queryStr)) {
      return {
        scope: 'POINT_EVENT',
        singleLocation: true,
        routing: 'SINGLE_LOCATION',
        reason: 'entity describes a localized historical event at a specific physical site'
      };
    }
  }

  // Default fallback for unspecified historical events:
  // If no localized keyword is present, treat as non-point historical event rather than guessing a point
  return {
    scope: 'NON_GEOGRAPHIC_HISTORICAL_EVENT',
    singleLocation: false,
    routing: 'HISTORICAL_NON_POINT',
    reason: 'entity has no single canonical geographic location'
  };
}

/**
 * Standardized logger for historical event scope decisions.
 */
export function logHistoricalEventScope(info: {
  entity: string;
  scope: HistoricalGeographicScope;
  singleLocation: boolean;
  routing: 'SINGLE_LOCATION' | 'HISTORICAL_NON_POINT';
  coordinateResolution?: 'SKIPPED' | 'EXECUTED';
  reason?: string;
}): void {
  console.log(`[HISTORICAL EVENT SCOPE]
entity: ${info.entity}
scope: ${info.scope}
singleLocation: ${info.singleLocation}
routing: ${info.routing}${info.coordinateResolution ? `\ncoordinateResolution: ${info.coordinateResolution}` : ''}${info.reason ? `\nreason: ${info.reason}` : ''}`);
}
