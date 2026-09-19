import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocationInfo, LocationType, Waypoint } from '../../types';
import {
  getNarrationTitle,
  getNarrationDescription,
  buildNarrationScript,
  removeLeadingTitleFromDescription
} from '../narrationService';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';

describe('Narration Title Deduplication & Enrichment Lifecycle Suite', () => {
  describe('Title-Prefix Deduplication in Spoken Narration', () => {
    it('removes leading duplicate title followed by copula and article (e.g. "Title is a...")', () => {
      const title = 'Teresio Olivelli park';
      const desc = 'Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.';

      const cleanDesc = removeLeadingTitleFromDescription(title, desc);
      expect(cleanDesc).toBe('A beloved local swimming spot in Briosco, Lombardy, Italy.');

      const script = buildNarrationScript(title, desc);
      expect(script).toBe('Teresio Olivelli park. A beloved local swimming spot in Briosco, Lombardy, Italy.');
      // Ensure title name is not spoken twice
      expect((script.match(/Teresio Olivelli park/gi) || []).length).toBe(1);
    });

    it('handles case-insensitivity in title matching (e.g. Title in uppercase, desc in lowercase)', () => {
      const title = 'Teresio Olivelli Park';
      const desc = 'teresio olivelli park is a beloved local swimming spot in Briosco...';

      const cleanDesc = removeLeadingTitleFromDescription(title, desc);
      expect(cleanDesc).toBe('A beloved local swimming spot in Briosco...');

      const script = buildNarrationScript(title, desc);
      expect(script).toBe('Teresio Olivelli Park. A beloved local swimming spot in Briosco...');
    });

    it('handles normal punctuation differences (comma, dash, period, colon)', () => {
      const title = 'Teresio Olivelli Park';

      // Comma
      const descComma = 'Teresio Olivelli Park, located in Briosco, offers swimming.';
      expect(removeLeadingTitleFromDescription(title, descComma)).toBe('Located in Briosco, offers swimming.');
      expect(buildNarrationScript(title, descComma)).toBe('Teresio Olivelli Park. Located in Briosco, offers swimming.');

      // Period
      const descPeriod = 'Teresio Olivelli Park. It is a picturesque park on the lake.';
      expect(removeLeadingTitleFromDescription(title, descPeriod)).toBe('It is a picturesque park on the lake.');
      expect(buildNarrationScript(title, descPeriod)).toBe('Teresio Olivelli Park. It is a picturesque park on the lake.');

      // Dash
      const descDash = 'Teresio Olivelli Park - a beloved destination in Lombardy.';
      expect(removeLeadingTitleFromDescription(title, descDash)).toBe('A beloved destination in Lombardy.');
      expect(buildNarrationScript(title, descDash)).toBe('Teresio Olivelli Park. A beloved destination in Lombardy.');
    });

    it('handles titles with leading articles ("The", "A", "An")', () => {
      const title = 'The Eiffel Tower';
      const desc = 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris.';

      const cleanDesc = removeLeadingTitleFromDescription(title, desc);
      expect(cleanDesc).toBe('A wrought-iron lattice tower on the Champ de Mars in Paris.');

      const script = buildNarrationScript(title, desc);
      expect(script).toBe('The Eiffel Tower. A wrought-iron lattice tower on the Champ de Mars in Paris.');
      expect((script.match(/Eiffel Tower/gi) || []).length).toBe(1);
    });

    it('preserves title occurrences that appear later in the description without removing them', () => {
      const title = 'Villa del Balbianello';
      const desc = 'Set on a promontory overlooking Lake Como, Villa del Balbianello features an extensive historic estate.';

      const cleanDesc = removeLeadingTitleFromDescription(title, desc);
      // Because Villa del Balbianello is not at the start, it remains intact
      expect(cleanDesc).toBe(desc);

      const script = buildNarrationScript(title, desc);
      expect(script).toBe('Villa del Balbianello. Set on a promontory overlooking Lake Como, Villa del Balbianello features an extensive historic estate.');
    });

    it('preserves descriptions that do not start with title', () => {
      const title = 'Como Cathedral';
      const desc = 'Dedicated to the Blessed Virgin Mary, this cathedral was constructed in the 14th century.';

      const cleanDesc = removeLeadingTitleFromDescription(title, desc);
      expect(cleanDesc).toBe(desc);

      const script = buildNarrationScript(title, desc);
      expect(script).toBe('Como Cathedral. Dedicated to the Blessed Virgin Mary, this cathedral was constructed in the 14th century.');
    });
  });

  describe('Enrichment Lifecycle & Loading State Separation', () => {
    let activeNarrationState: { selectionId: string; narrativeKey?: string; spoken: boolean } | null = null;
    let activeSelectionId: string | null = null;
    let speakMock: ReturnType<typeof vi.fn>;

    const simulateNarrationTrigger = (info: LocationInfo | null): boolean => {
      if (!info) return false;
      const title = getNarrationTitle(info);
      const desc = getNarrationDescription(info);
      const id = (info as any).id || info.osmId || info.name;
      const stableId = activeSelectionId || id;
      const narrativeKey = `${title.toLowerCase().trim()}::${desc.trim()}`;

      if (!title || !desc || desc.length < 3) return false;

      const isMatchingSelection = !activeSelectionId || id === activeSelectionId || (info as any).id === activeSelectionId;
      if (!isMatchingSelection) return false;

      if (
        activeNarrationState &&
        activeNarrationState.spoken &&
        (activeNarrationState.selectionId === stableId ||
          activeNarrationState.selectionId === id ||
          (Boolean(activeNarrationState.narrativeKey) && activeNarrationState.narrativeKey === narrativeKey))
      ) {
        return false;
      }

      activeNarrationState = {
        selectionId: stableId,
        narrativeKey,
        spoken: true
      };

      const spokenScript = buildNarrationScript(title, desc);
      speakMock({ title, description: desc, script: spokenScript });
      return true;
    };

    beforeEach(() => {
      activeNarrationState = null;
      activeSelectionId = null;
      speakMock = vi.fn();
    });

    it('does not trigger narration during loading when description is empty', () => {
      const stableId = 'wp-teresio';
      activeSelectionId = stableId;

      const initialPayload: LocationInfo = {
        id: stableId,
        name: 'Teresio Olivelli Park',
        type: LocationType.POI,
        description: '', // Empty during loading
        sectionState: { description: 'loading' } as any
      };

      // Attempt narration while loading
      const triggered = simulateNarrationTrigger(initialPayload);
      expect(triggered).toBe(false);
      expect(speakMock).not.toHaveBeenCalled();
    });

    it('waits for enriched finalized description and narrates without repeating title', () => {
      const stableId = 'wp-teresio';
      activeSelectionId = stableId;

      // 1. Initial selection state (loading)
      const initialPayload: LocationInfo = {
        id: stableId,
        name: 'Teresio Olivelli Park',
        type: LocationType.POI,
        description: '',
        sectionState: { description: 'loading' } as any
      };
      expect(simulateNarrationTrigger(initialPayload)).toBe(false);

      // 2. Finalized enrichment completes
      const enrichedPayload: LocationInfo = {
        id: stableId,
        name: 'Teresio Olivelli Park',
        type: LocationType.POI,
        description: 'Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.',
        sectionState: { description: 'complete' } as any
      };

      const triggered = simulateNarrationTrigger(enrichedPayload);
      expect(triggered).toBe(true);
      expect(speakMock).toHaveBeenCalledTimes(1);

      const calledArgs = speakMock.mock.calls[0][0];
      expect(calledArgs.script).toBe('Teresio Olivelli Park. A beloved local swimming spot in Briosco, Lombardy, Italy.');
    });

    it('supports locations with legitimate pre-existing descriptions that do not require enrichment', () => {
      const stableId = 'wp-pre-existing';
      activeSelectionId = stableId;

      const payload: LocationInfo = {
        id: stableId,
        name: 'Bellagio',
        type: LocationType.POI,
        description: 'A picturesque historic village situated on the promontory of Lake Como.',
        sectionState: { description: 'complete' } as any
      };

      const canonical = resolveCanonicalNarrative(payload);
      expect(canonical.narrativeText).toBe('A picturesque historic village situated on the promontory of Lake Como.');

      const triggered = simulateNarrationTrigger(payload);
      expect(triggered).toBe(true);
      expect(speakMock).toHaveBeenCalledTimes(1);
      expect(speakMock.mock.calls[0][0].script).toBe('Bellagio. A picturesque historic village situated on the promontory of Lake Como.');
    });

    it('preserves narration guard identity based on stable selection identity', () => {
      const stableId = 'wp-teresio';
      activeSelectionId = stableId;

      const enrichedPayload: LocationInfo = {
        id: stableId,
        name: 'Teresio Olivelli Park',
        type: LocationType.POI,
        description: 'Teresio Olivelli park is a beloved local swimming spot in Briosco, Lombardy, Italy.',
        sectionState: { description: 'complete' } as any
      };

      expect(simulateNarrationTrigger(enrichedPayload)).toBe(true);

      // Re-trigger with same selection ID (e.g. component re-render or onSettle)
      expect(simulateNarrationTrigger(enrichedPayload)).toBe(false);
      expect(speakMock).toHaveBeenCalledTimes(1);
    });
  });
});
