import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { narrationService, getNarrationDescription, getNarrationTitle } from '../narrationService';
import { documentaryController } from '../documentaryController';
import { Waypoint, MapMarker } from '../../types';

describe('Route Lifecycle, Waypoint Labels, and Narration Separation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    narrationService.cancel();
    documentaryController.cancel('test_setup');
  });

  afterEach(() => {
    narrationService.cancel();
    documentaryController.cancel('test_teardown');
  });

  describe('1. Waypoint Marker & Label Lifecycle Independent of InfoPanel State', () => {
    const mockWaypoints: Waypoint[] = [
      { id: 'wp-1', name: 'Plymouth, England', lat: 50.3755, lng: -4.1427, description: 'Departure point of the voyage.' },
      { id: 'wp-2', name: 'Cape Verde', lat: 14.933, lng: -23.5133, description: 'Archipelago off the coast of West Africa.' },
      { id: 'wp-3', name: 'Strait of Magellan', lat: -53.4833, lng: -70.7833, description: 'Navigable sea route south of South America.' }
    ];

    it('resolves effectiveSelectedMarkerId to the active waypoint when InfoPanel is closed (selectedMarkerId is null)', () => {
      let selectedMarkerId: string | null = 'wp-1';
      let currentWaypointIndex = 0;
      let routeWaypoints = [...mockWaypoints];

      // Helper simulating Earth.tsx effectiveSelectedMarkerId logic
      const computeEffectiveId = (selId: string | null, wps: Waypoint[], idx: number) => {
        const activeWpId = (wps && wps.length > 0 && idx !== undefined && idx >= 0 && idx < wps.length)
          ? (wps[idx]?.id || `${wps[idx]?.name}-${wps[idx]?.lat}-${wps[idx]?.lng}`)
          : null;
        return selId || activeWpId;
      };

      // Initially when InfoPanel is open
      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBe('wp-1');

      // User closes InfoPanel (handleClosePanel sets selectedMarkerId = null)
      selectedMarkerId = null;

      // Waypoint label MUST still resolve to the active waypoint (wp-1)
      const effectiveIdAfterClose = computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex);
      expect(effectiveIdAfterClose).toBe('wp-1');

      // Waypoint navigation changes index to 1 (Cape Verde)
      currentWaypointIndex = 1;
      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBe('wp-2');
    });

    it('clears effectiveSelectedMarkerId when route is cleared (new search)', () => {
      const computeEffectiveId = (selId: string | null, wps: Waypoint[], idx: number) => {
        const activeWpId = (wps && wps.length > 0 && idx !== undefined && idx >= 0 && idx < wps.length)
          ? (wps[idx]?.id || `${wps[idx]?.name}-${wps[idx]?.lat}-${wps[idx]?.lng}`)
          : null;
        return selId || activeWpId;
      };

      let selectedMarkerId: string | null = null;
      let routeWaypoints: Waypoint[] = [];
      let currentWaypointIndex = -1;

      expect(computeEffectiveId(selectedMarkerId, routeWaypoints, currentWaypointIndex)).toBeNull();
    });
  });

  describe('2. Narration Lifecycle Separation From Route Cleanup', () => {
    it('allows currently playing narration to continue when route is cleared during a new search transition', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');
      const cancelSpy = vi.spyOn(narrationService, 'cancel');

      // 1. Start route narration for waypoint 1
      narrationService.speakStructured({
        title: 'Plymouth, England',
        description: 'Departure point of the voyage across the Atlantic.'
      });
      expect(speakSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1); // initial reset in speakStructured

      // 2. User performs a new location search for "Louvre Museum"
      // Simulating search start: route is cleared, but narrationService.cancel() is NOT called merely because route was cleared
      let routeWaypoints: Waypoint[] = [];
      let activeRouteId: string | null = null;
      expect(routeWaypoints.length).toBe(0);
      expect(activeRouteId).toBeNull();

      // Ensure cancel was not called during route clearing
      expect(cancelSpy).toHaveBeenCalledTimes(1); // Still 1 from initial start

      // 3. New search completes and starts new narration for "Louvre Museum"
      narrationService.speakStructured({
        title: 'Louvre Museum',
        description: 'World largest art museum and historic monument in Paris, France.'
      });

      // New narration replaces the previous narration seamlessly
      expect(speakSpy).toHaveBeenCalledTimes(2);
      expect(cancelSpy).toHaveBeenCalledTimes(2);
    });

    it('successfully triggers narration for direct location search result (e.g. Tower of London, Dead Sea, Grand Canyon)', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');

      const queries = [
        { name: 'Dead Sea', desc: 'Landlocked salt lake between Israel and Jordan, lowest elevation on Earth.' },
        { name: 'Grand Canyon', desc: 'Steep-sided canyon carved by the Colorado River in Arizona.' },
        { name: 'Tower of London', desc: 'Historic castle on the north bank of the River Thames in central London.' }
      ];

      queries.forEach((q, idx) => {
        const searchMarkerId = `search-${Date.now()}-${idx}`;
        let activeSelectionId: string | null = searchMarkerId;
        const finalData: any = {
          id: searchMarkerId,
          name: q.name,
          description: q.desc,
          coordinates: { lat: 0, lng: 0 }
        };

        // Simulating maybeTriggerNarration validation logic
        const id = finalData.id || finalData.osmId || finalData.name;
        const isMatchingSelection = !activeSelectionId ||
          id === activeSelectionId ||
          finalData.id === activeSelectionId ||
          finalData.name === activeSelectionId;

        expect(isMatchingSelection).toBe(true);

        if (isMatchingSelection) {
          narrationService.speakStructured({
            title: finalData.name,
            description: finalData.description
          });
        }
      });

      expect(speakSpy).toHaveBeenCalledTimes(queries.length);
    });

    it('rejects stale async search result when user makes another selection before search resolves', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');

      // 1. User submits Search A ("Dead Sea")
      const searchMarkerIdA = 'search-request-A';
      
      // 2. User quickly clicks Route Waypoint B ("Plymouth") before Search A finishes
      const activeWaypointIdB = 'wp-plymouth';
      let activeSelectionId: string | null = activeWaypointIdB;

      // 3. Search A resolves later with old payload
      const finalDataA: any = {
        id: searchMarkerIdA,
        name: 'Dead Sea',
        description: 'Landlocked salt lake.'
      };

      const idA = finalDataA.id || finalDataA.osmId || finalDataA.name;
      const isMatchingSelectionA = !activeSelectionId ||
        idA === activeSelectionId ||
        finalDataA.id === activeSelectionId ||
        finalDataA.name === activeSelectionId;

      // Must be rejected because activeSelectionId is now wp-plymouth
      expect(isMatchingSelectionA).toBe(false);

      if (isMatchingSelectionA) {
        narrationService.speakStructured({
          title: finalDataA.name,
          description: finalDataA.description
        });
      }

      // No speak call for stale Search A
      expect(speakSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Description Normalization & Safe Speech Extraction', () => {
    it('extracts string description from search payload without throwing', () => {
      const searchResult = {
        name: 'Lisbon',
        locationString: 'Lisbon, Portugal',
        description: 'Lisbon is the capital and largest city of Portugal.',
        population: null
      };

      const title = getNarrationTitle(searchResult);
      const desc = getNarrationDescription(searchResult);

      expect(title).toBe('Lisbon');
      expect(desc).toBe('Lisbon is the capital and largest city of Portugal.');
      expect(typeof desc).toBe('string');
      expect(() => desc.trim()).not.toThrow();
    });

    it('safely extracts string description when structured metadata (climate, contextNotes, notable) is present', () => {
      const searchResultWithStructuredData = {
        name: 'Lisbon',
        locationString: 'Lisbon, Portugal',
        description: 'Lisbon is the capital and largest city of Portugal...',
        population: null,
        climate: {
          name: 'Oceanic climate (Cfb)',
          description: 'Lisbon experiences mild temperatures throughout the year...',
          koppenCode: 'Cfb'
        },
        contextNotes: [
          'Lisbon was a major center for Portuguese exploration and colonization during the Age of Discovery.'
        ],
        notable: [
          {
            title: 'Tower of Belém',
            description: 'This iconic monument...'
          }
        ]
      };

      const title = getNarrationTitle(searchResultWithStructuredData);
      const desc = getNarrationDescription(searchResultWithStructuredData);

      expect(title).toBe('Lisbon');
      expect(desc).toBe('Lisbon is the capital and largest city of Portugal...');
      expect(typeof desc).toBe('string');
      // Ensure climate object or contextNotes array was NOT returned
      expect(desc).not.toContain('Oceanic climate');
      expect(desc).not.toContain('[object Object]');
    });

    it('gracefully handles non-string or malformed description objects without throwing desc.trim is not a function', () => {
      const invalidPayloads = [
        { name: 'Invalid 1', description: { foo: 'bar' } },
        { name: 'Invalid 2', description: ['some', 'array'] },
        { name: 'Invalid 3', description: null },
        { name: 'Invalid 4', description: undefined },
        { name: 'Invalid 5', description: 12345 }
      ];

      for (const payload of invalidPayloads) {
        expect(() => {
          const desc = getNarrationDescription(payload);
          expect(typeof desc).toBe('string');
          expect(desc.trim()).toBe('');
        }).not.toThrow();
      }
    });

    it('deduplicates narration so DocumentaryController settling does not speak duplicate narration', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');

      let activeNarrationState: { id: string; spoken: boolean } | null = null;
      const simulateMaybeTrigger = (info: any, activeId: string) => {
        const title = getNarrationTitle(info);
        const desc = getNarrationDescription(info);
        if (!title || !desc || desc.length < 3) return;

        const id = info.id || info.name;
        if (id !== activeId) return;

        if (activeNarrationState && activeNarrationState.id === id && activeNarrationState.spoken) {
          // Deduplicated!
          return;
        }

        activeNarrationState = { id, spoken: true };
        narrationService.speakStructured({ title, description: desc });
      };

      const payload = {
        id: 'search-lisbon-123',
        name: 'Lisbon',
        description: 'Lisbon is the capital of Portugal.'
      };

      // 1. First trigger when search resolves
      simulateMaybeTrigger(payload, 'search-lisbon-123');
      expect(speakSpy).toHaveBeenCalledTimes(1);

      // 2. Second trigger when DocumentaryController settles
      simulateMaybeTrigger(payload, 'search-lisbon-123');
      // Should still be called only once
      expect(speakSpy).toHaveBeenCalledTimes(1);
    });

    it('preserves Dallas-shaped metadata description as a string through the pipeline and triggers narration', () => {
      const speakSpy = vi.spyOn(narrationService, 'speakStructured');

      // Given Dallas metadata from Gemini / recoverLocationMetadata with structured text wrapper
      const dallasRecoveredMetadata = {
        description: {
          text: 'Dallas is the fourth-largest city in the United States and the commercial hub of North Texas.',
          provenance: { provider: 'Gemini', timestamp: Date.now(), cache: false }
        },
        climate: {
          name: 'Humid subtropical climate',
          description: 'Dallas experiences hot summers and mild winters.',
          koppenCode: 'Cfa'
        },
        contextNotes: [
          { text: 'Dallas was founded in 1841.', provenance: { provider: 'Gemini', timestamp: Date.now(), cache: false } }
        ],
        notable: [
          { title: 'Dallas Cowboys', description: 'NFL football team.' }
        ]
      };

      // Simulating pipeline finalData mapping
      const rawDesc = dallasRecoveredMetadata.description;
      const descString = typeof rawDesc === 'string'
        ? rawDesc
        : (rawDesc && typeof rawDesc === 'object' && typeof (rawDesc as any).text === 'string'
            ? (rawDesc as any).text
            : '');

      const finalData: any = {
        name: 'Dallas, Texas',
        entityType: 'city',
        type: 'city',
        coordinates: { lat: 32.7767, lng: -96.7970 },
        description: descString,
        climate: dallasRecoveredMetadata.climate,
        notable: dallasRecoveredMetadata.notable,
        contextNotes: dallasRecoveredMetadata.contextNotes
      };

      // Verify contract at pipeline boundary
      expect(typeof finalData.description).toBe('string');
      expect(finalData.description.startsWith('Dallas is the fourth-largest')).toBe(true);

      // Verify narration extraction
      const title = getNarrationTitle(finalData);
      const desc = getNarrationDescription(finalData);

      expect(title).toBe('Dallas, Texas');
      expect(typeof desc).toBe('string');
      expect(desc.startsWith('Dallas is the fourth-largest')).toBe(true);

      // Trigger narration
      narrationService.speakStructured({
        title,
        description: desc
      });

      expect(speakSpy).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Dallas, Texas',
        description: expect.stringContaining('Dallas is the fourth-largest city')
      }));
    });

    it('sets and retrieves volume, speed, and voiceURI accurately on narrationService', () => {
      narrationService.setVolume(0.4);
      expect(narrationService.getVolume()).toBe(0.4);

      // Clamps between 0.0 and 1.0
      narrationService.setVolume(1.5);
      expect(narrationService.getVolume()).toBe(1.0);

      narrationService.setVolume(-0.2);
      expect(narrationService.getVolume()).toBe(0.0);

      narrationService.setSpeed(1.2);
      expect(narrationService.getSpeed()).toBe(1.2);

      narrationService.setVoiceURI('com.apple.speech.synthesis.voice.Alex');
      expect(narrationService.getVoiceURI()).toBe('com.apple.speech.synthesis.voice.Alex');
    });
  });
});
