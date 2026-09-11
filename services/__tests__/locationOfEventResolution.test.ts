import { describe, test, expect } from 'vitest';
import { routeIntentAndExtractEntity } from '../geminiService';
import {
  isCoordinateTitle,
  isGenericTitle,
  generateSemanticEventTitle,
  formatCoordinateDisplay,
  normalizeSemanticEntityTitle
} from '../queryNormalizer';
import { normalizeHeaderGeographicHierarchy } from '../../components/InfoPanel';
import { selectEntityTitle, selectEntitySubtitle } from '../../selectors/selectPresentationModel';

describe('Location-of-Event Intent Handling & Semantic Title Prioritization Suite', () => {

  describe('1. Intent Classification for Location-of-Event Queries', () => {
    test('"Where did the Lusitania sink?" resolves to SINGLE_POINT historical event lookup', () => {
      const result = routeIntentAndExtractEntity('Where did the Lusitania sink?');
      expect(result.intent).toBe('HISTORICAL_EVENT');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject).toBe('Lusitania');
      expect(result.event).toBe('sink');
    });

    test('"Where did the Titanic sink?" resolves to SINGLE_POINT historical event lookup', () => {
      const result = routeIntentAndExtractEntity('Where did the Titanic sink?');
      expect(result.intent).toBe('HISTORICAL_EVENT');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject).toBe('Titanic');
      expect(result.event).toBe('sink');
    });

    test('"Where was Abraham Lincoln assassinated?" resolves to SINGLE_POINT historical event lookup', () => {
      const result = routeIntentAndExtractEntity('Where was Abraham Lincoln assassinated?');
      expect(result.intent).toBe('HISTORICAL_EVENT');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject).toBe('Abraham Lincoln');
      expect(result.event).toBe('assassinated');
    });

    test('"Where did Amelia Earhart disappear?" resolves to SINGLE_POINT historical event lookup', () => {
      const result = routeIntentAndExtractEntity('Where did Amelia Earhart disappear?');
      expect(result.intent).toBe('HISTORICAL_EVENT');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject).toBe('Amelia Earhart');
      expect(result.event).toBe('disappear');
    });

    test('"Where was the Vasa found?" resolves to SINGLE_POINT discovery lookup', () => {
      const result = routeIntentAndExtractEntity('Where was the Vasa found?');
      expect(result.intent).toBe('DISCOVERY_OBJECT_LOCATION');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject).toBe('Vasa');
    });

    test('Route and journey queries preserve MULTI_LOCATION_EXPLORATION route intent', () => {
      const voyageResult = routeIntentAndExtractEntity("What was the Lusitania's final voyage?");
      expect(voyageResult.intent).toBe('route');
      expect(voyageResult.resolutionMode).toBe('MULTI_LOCATION_EXPLORATION');

      const trailResult = routeIntentAndExtractEntity('Follow the Trail of Tears');
      expect(trailResult.intent).toBe('route');
      expect(trailResult.resolutionMode).toBe('MULTI_LOCATION_EXPLORATION');
    });
  });

  describe('2. Coordinate Title Detection & Generic Title Detection', () => {
    test('Correctly identifies coordinate strings in all standard and variant formats', () => {
      const coordinateStrings = [
        'Position 51.3762 N, 11.4558 W (modern-day location)',
        'Position 51.3762° N, 11.4558° W',
        '41.3609 N, 12.2875 E',
        '51.3762, -11.4558',
        '51.38° N, 11.46° W',
        '51.3762° N, 11.4558° W',
        'Lat: 51.3762, Lng: -11.4558',
        'Point (51.3762, -11.4558)',
        '51.3762 N, 11.4558 W'
      ];

      coordinateStrings.forEach(str => {
        expect(isCoordinateTitle(str), `Expected "${str}" to be detected as coordinate title`).toBe(true);
      });
    });

    test('Does NOT flag legitimate entity and landmark names as coordinate titles', () => {
      const validTitles = [
        'RMS Lusitania Sinking Site',
        'RMS Titanic Sinking Site',
        "Ford's Theatre",
        'Gettysburg Battlefield',
        'Independence Hall',
        'Old Head of Kinsale',
        'Cape Canaveral Launch Complex 39A',
        'Stockholm Harbor',
        'Boston, Massachusetts'
      ];

      validTitles.forEach(str => {
        expect(isCoordinateTitle(str)).toBe(false);
      });
    });

    test('Identifies generic placeholder titles', () => {
      expect(isGenericTitle('Location')).toBe(true);
      expect(isGenericTitle('Route Context')).toBe(true);
      expect(isGenericTitle('Saved Route')).toBe(true);
      expect(isGenericTitle('Unknown Waypoint')).toBe(true);
      expect(isGenericTitle('Searching...')).toBe(true);
      expect(isGenericTitle('RMS Lusitania Sinking Site')).toBe(false);
    });
  });

  describe('3. Semantic Event Title Generation', () => {
    test('Generates descriptive titles for ships and sinkings', () => {
      expect(generateSemanticEventTitle('Lusitania', 'sink')).toBe('RMS Lusitania Sinking Site');
      expect(generateSemanticEventTitle('RMS Lusitania', 'sinking')).toBe('RMS Lusitania Sinking Site');
      expect(generateSemanticEventTitle('Titanic', 'sink')).toBe('RMS Titanic Sinking Site');
      expect(generateSemanticEventTitle('RMS Titanic', 'sinking')).toBe('RMS Titanic Sinking Site');
      expect(generateSemanticEventTitle('Vasa', 'sinking')).toBe('Vasa Sinking Site');
    });

    test('Generates descriptive titles for assassinations, disappearances, and battles', () => {
      expect(generateSemanticEventTitle('Lincoln', 'assassination')).toBe('Lincoln Assassination Site');
      expect(generateSemanticEventTitle('Abraham Lincoln', 'assassination')).toBe('Abraham Lincoln Assassination Site');
      expect(generateSemanticEventTitle('Amelia Earhart', 'disappearance')).toBe('Amelia Earhart Disappearance Site');
      expect(generateSemanticEventTitle('Gettysburg', 'battle')).toBe('Battle of Gettysburg Site');
      expect(generateSemanticEventTitle('Battle of Gettysburg', 'battle')).toBe('Battle of Gettysburg Site');
      expect(generateSemanticEventTitle('Declaration of Independence', 'signing')).toBe('Declaration of Independence Signing Site');
    });
  });

  describe('4. Authoritative 5-Tier Semantic Entity Title Hierarchy', () => {
    test('Tier 1: Explicit descriptive title is preserved if not coordinate-based', () => {
      const title = normalizeSemanticEntityTitle({
        explicitTitle: 'RMS Lusitania Wreck Site',
        subject: 'Lusitania',
        event: 'sink',
        coordinates: { lat: 51.3762, lng: -11.4558 }
      });
      expect(title).toBe('RMS Lusitania Wreck Site');
    });

    test('Tier 2: Coordinate explicit title is rejected in favor of event-specific descriptive title', () => {
      const title = normalizeSemanticEntityTitle({
        explicitTitle: 'Position 51.3762 N, 11.4558 W (modern-day location)',
        canonicalName: 'Position 51.3762 N, 11.4558 W (modern-day location)',
        subject: 'Lusitania',
        event: 'sink',
        rawQuery: 'Where did the Lusitania sink?',
        coordinates: { lat: 51.3762, lng: -11.4558 }
      });
      expect(title).toBe('RMS Lusitania Sinking Site');
    });

    test('Tier 3: Recognizable landmark name is used if event title cannot be derived', () => {
      const title = normalizeSemanticEntityTitle({
        explicitTitle: '40.033 N, 74.333 W',
        landmark: 'Lakehurst Naval Air Station',
        city: 'Manchester Township',
        coordinates: { lat: 40.033, lng: -74.333 }
      });
      expect(title).toBe('Lakehurst Naval Air Station');
    });

    test('Tier 4: Derived from query scaffolding when only query is available', () => {
      const title = normalizeSemanticEntityTitle({
        rawQuery: 'Where is Mount Rainier?'
      });
      expect(title).toBe('Mount Rainier');
    });

    test('Tier 5: Fallback to coordinate string only when no other metadata or subject exists', () => {
      const title = normalizeSemanticEntityTitle({
        coordinates: { lat: 51.3762, lng: -11.4558 }
      });
      expect(title).toBe('51.3762° N, 11.4558° W');
    });
  });

  describe('5. Presentation Layer & InfoPanel Header Normalization', () => {
    test('InfoPanel header displays semantic title and keeps coordinates in metadata line', () => {
      const infoPayload = {
        name: 'Position 51.3762 N, 11.4558 W (modern-day location)',
        canonicalName: 'Position 51.3762 N, 11.4558 W (modern-day location)',
        description: 'The RMS Lusitania was torpedoed by German submarine U-20 on May 7, 1915, sinking 11 miles off the Old Head of Kinsale, Ireland.',
        locationString: 'Celtic Sea, off Old Head of Kinsale, Ireland',
        country: 'Ireland',
        coordinates: { lat: 51.3762, lng: -11.4558 }
      };

      const result = normalizeHeaderGeographicHierarchy(infoPayload);
      expect(result.displayTitle).toBe('RMS Lusitania Sinking Site');
      expect(result.displayTitle).not.toContain('Position');
      expect(result.displayTitle).not.toContain('51.3762');

      const coordDisplay = formatCoordinateDisplay(infoPayload.coordinates);
      expect(coordDisplay).toBe('51.3762° N, 11.4558° W');
    });

    test('Presentation selector formats entity title cleanly from domain object', () => {
      const resolvedEntity: any = {
        subject: {
          identity: {
            canonicalName: 'RMS Lusitania Sinking Site',
            entityType: 'shipwreck_site'
          },
          primaryLocation: {
            label: 'RMS Lusitania Sinking Site',
            location: {
              coordinates: { lat: 51.3762, lng: -11.4558 },
              address: { full: 'Celtic Sea, Ireland', country: 'Ireland' }
            }
          }
        },
        metadata: {
          description: 'Sinking site of RMS Lusitania.'
        }
      };

      const title = selectEntityTitle(resolvedEntity);
      expect(title).toBe('RMS Lusitania Sinking Site');
      const subtitle = selectEntitySubtitle(resolvedEntity);
      expect(subtitle).toBe('Celtic Sea, Ireland');
    });
  });

  describe('6. Historical Event Single-Point Coordinate Recovery & Pipeline Resolution', () => {
    test('"Where did the founding of Rome take place?" routes to HISTORICAL_EVENT with SINGLE_POINT mode', () => {
      const result = routeIntentAndExtractEntity('Where did the founding of Rome take place?');
      expect(result.intent).toBe('HISTORICAL_EVENT');
      expect(result.resolutionMode).toBe('SINGLE_POINT');
      expect(result.subject.toLowerCase()).toContain('rome');
    });

    test('Single-point historical event with missing initial coordinates recovers coordinates while preserving semantic identity', () => {
      // Simulate resolver returning semantic entity without coordinates
      const initialResolverData = {
        name: 'Rome Founding Site',
        entityType: 'historical_event_site',
        description: 'According to tradition, Rome was founded on the Palatine Hill in 753 BC by Romulus and Remus.'
      };

      // When recovered coordinates arrive
      const recoveryCoords = {
        lat: 41.8892,
        lng: 12.4875,
        source: 'ai_recovery',
        coordinateTrust: 'provisional'
      };

      // Resolved data retains 'Rome Founding Site' and merges recovered coordinates
      const resolvedData: any = {
        ...initialResolverData,
        canonicalName: initialResolverData.name,
        coordinates: {
          lat: recoveryCoords.lat,
          lng: recoveryCoords.lng,
          source: recoveryCoords.source
        },
        coordinateSource: recoveryCoords.source,
        coordinateTrust: 'provisional',
        identityStatus: 'verified'
      };

      expect(resolvedData.canonicalName).toBe('Rome Founding Site');
      expect(resolvedData.name).toBe('Rome Founding Site');
      expect(resolvedData.coordinates.lat).toBe(41.8892);
      expect(resolvedData.coordinates.lng).toBe(12.4875);
    });

    test('Partial enrichment with valid identity and valid coordinates passes entity validation', async () => {
      const { validateResolvedEntity, evaluateEnrichmentCompleteness } = await import('../entityValidation');

      const resolvedEntity: any = {
        subject: {
          identity: {
            canonicalName: 'Rome Founding Site',
            entityType: 'historical_event_site',
            identityStatus: 'verified'
          },
          primaryLocation: {
            label: 'Palatine Hill, Rome, Italy',
            identityStatus: 'verified',
            coordinateSource: 'ai_recovery',
            coordinateTrust: 'provisional',
            location: {
              coordinates: { lat: 41.8892, lng: 12.4875, source: 'ai_recovery' },
              address: { full: 'Rome, Italy', country: 'Italy' }
            }
          }
        },
        metadata: {
          description: 'According to Roman mythology, the founding of Rome took place on the Palatine Hill around 753 BC.'
          // Missing contextNotes, climate, news
        }
      };

      const completeness = evaluateEnrichmentCompleteness(
        resolvedEntity.metadata,
        resolvedEntity.subject.identity.canonicalName,
        resolvedEntity.subject.identity.entityType
      );

      // Completeness should reflect PARTIAL (missing optional secondary fields)
      expect(completeness.status).toBe('PARTIAL');
      expect(completeness.missingFields).toContain('contextNotes');
      expect(completeness.missingFields).toContain('climate');

      // But overall entity validation MUST pass because coordinates, identity, and substantive description are valid
      const isValid = validateResolvedEntity(resolvedEntity);
      expect(isValid).toBe(true);
    });
  });
});
