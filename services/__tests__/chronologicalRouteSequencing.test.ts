import { describe, it, expect } from 'vitest';
import { normalizeNarrationText, normalizeRegnalRomanNumerals } from '../../utils/narrationTextNormalization';
import {
  extractMeaningfulWaypointDate,
  sortWaypointsChronologically,
  isRouteSequential,
  getSequentialRouteSegments,
  getSequentialWaypointPairs
} from '../../utils/routeSequenceUtils';
import { Waypoint } from '../../types';

describe('Chronological Historical Route & Roman Numeral Speech Normalization Suite', () => {
  describe('1. Roman Numeral Regnal Speech Normalization', () => {
    it('normalizes Darius III to Darius the Third for speech while keeping InfoPanel text unchanged', () => {
      const visualText = 'Darius III was the last Achaemenid King of Kings of Persia.';
      const spokenText = normalizeNarrationText(visualText);

      expect(spokenText).toBe('Darius the Third was the last Achaemenid King of Kings of Persia.');
      expect(visualText).toBe('Darius III was the last Achaemenid King of Kings of Persia.');
    });

    it('normalizes various historical regnal names and titles', () => {
      expect(normalizeNarrationText('Alexander III of Macedon')).toBe('Alexander the Third of Macedon');
      expect(normalizeNarrationText('Louis XIV built the Palace of Versailles.')).toBe('Louis the Fourteenth built the Palace of Versailles.');
      expect(normalizeNarrationText('King Henry VIII reigned over England.')).toBe('King Henry the Eighth reigned over England.');
      expect(normalizeNarrationText('Charles V abdicated in 1556.')).toBe('Charles the Fifth abdicated in fifteen fifty-six.');
      expect(normalizeNarrationText('Pope John Paul II visited Poland.')).toBe('Pope John Paul the Second visited Poland.');
      expect(normalizeNarrationText('Cleopatra VII ruled Egypt.')).toBe('Cleopatra the Seventh ruled Egypt.');
      expect(normalizeNarrationText('Napoleon III led the Second Empire.')).toBe('Napoleon the Third led the Second Empire.');
      expect(normalizeNarrationText('Ptolemy I Soter established the dynasty.')).toBe('Ptolemy the First Soter established the dynasty.');
    });

    it('handles possessive regnal names e.g. Darius III\'s army', () => {
      expect(normalizeNarrationText("Darius III's army was defeated at Issus."))
        .toBe("Darius the Third's army was defeated at Issus.");
      expect(normalizeNarrationText("Henry VIII's six marriages are famous."))
        .toBe("Henry the Eighth's six marriages are famous.");
    });

    it('preserves non-person Roman numeral structures without adding "the"', () => {
      expect(normalizeNarrationText('Read Chapter I and Section II before continuing.'))
        .toBe('Read Chapter I and Section II before continuing.');
      expect(normalizeNarrationText('Consult Part III and Volume IV of the report.'))
        .toBe('Consult Part III and Volume IV of the report.');
      expect(normalizeNarrationText('Phase I and Stage II testing.'))
        .toBe('Phase I and Stage II testing.');
    });
  });

  describe('2. Historical Chronology & Route Connection Lines', () => {
    const granicus: Waypoint = {
      id: 'granicus',
      name: 'Battle of the Granicus',
      canonicalName: 'Granicus River',
      lat: 40.2333,
      lng: 27.2500,
      historicalPeriod: '334 BC',
      description: 'Fought in May 334 BC near Troy, Alexander shattered the Persian satrapal army.'
    };

    const issus: Waypoint = {
      id: 'issus',
      name: 'Battle of Issus',
      canonicalName: 'Issus',
      lat: 36.8400,
      lng: 36.2200,
      historicalPeriod: '333 BC',
      description: 'Major battle fought in 333 BC near modern Iskenderun where Alexander defeated Darius III.'
    };

    const tyre: Waypoint = {
      id: 'tyre',
      name: 'Siege of Tyre',
      canonicalName: 'Tyre',
      lat: 33.2705,
      lng: 35.1966,
      historicalPeriod: '332 BC',
      description: 'Seven-month siege in 332 BC resulting in Macedonian capture of the Phoenician island stronghold.'
    };

    const gaugamela: Waypoint = {
      id: 'gaugamela',
      name: 'Battle of Gaugamela',
      canonicalName: 'Gaugamela',
      lat: 36.3600,
      lng: 43.2500,
      historicalPeriod: '331 BC',
      description: 'Decisive battle in October 331 BC destroying Achaemenid imperial power.'
    };

    const hydaspes: Waypoint = {
      id: 'hydaspes',
      name: 'Battle of the Hydaspes',
      canonicalName: 'Hydaspes River',
      lat: 32.8282,
      lng: 73.7297,
      historicalPeriod: '326 BC',
      description: 'Fought in 326 BC against King Porus along the Jhelum River in ancient Punjab.'
    };

    it('extracts correct numeric domain dates for BCE and CE events', () => {
      expect(extractMeaningfulWaypointDate(granicus)).toBe(-334);
      expect(extractMeaningfulWaypointDate(issus)).toBe(-333);
      expect(extractMeaningfulWaypointDate(tyre)).toBe(-332);
      expect(extractMeaningfulWaypointDate(gaugamela)).toBe(-331);
      expect(extractMeaningfulWaypointDate(hydaspes)).toBe(-326);
    });

    it('sorts intentionally scrambled progressive discovery into strict chronological order', () => {
      // Scrambled discovery order: Gaugamela, Hydaspes, Granicus, Tyre, Issus
      const scrambledDiscovery = [gaugamela, hydaspes, granicus, tyre, issus];

      const sorted = sortWaypointsChronologically(scrambledDiscovery);

      expect(sorted.map(w => w.name)).toEqual([
        'Battle of the Granicus',
        'Battle of Issus',
        'Siege of Tyre',
        'Battle of Gaugamela',
        'Battle of the Hydaspes'
      ]);

      expect(sorted.map(w => w.sequence)).toEqual([1, 2, 3, 4, 5]);
    });

    it('determines that dated historical battle waypoints form a sequential route', () => {
      const battles = [granicus, issus, tyre, gaugamela, hydaspes];
      const isSeq = isRouteSequential(battles);
      expect(isSeq).toBe(true);
    });

    it('generates sequential connecting line segments connecting the battles in chronological order', () => {
      const scrambled = [gaugamela, hydaspes, granicus, tyre, issus];
      const sorted = sortWaypointsChronologically(scrambled);

      const segments = getSequentialRouteSegments(sorted);
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0].waypoints.map(w => w.name)).toEqual([
        'Battle of the Granicus',
        'Battle of Issus',
        'Siege of Tyre',
        'Battle of Gaugamela',
        'Battle of the Hydaspes'
      ]);

      const pairs = getSequentialWaypointPairs(sorted);
      expect(pairs.length).toBe(4);
      expect(pairs[0][0].name).toBe('Battle of the Granicus');
      expect(pairs[0][1].name).toBe('Battle of Issus');
      expect(pairs[1][0].name).toBe('Battle of Issus');
      expect(pairs[1][1].name).toBe('Siege of Tyre');
      expect(pairs[2][0].name).toBe('Siege of Tyre');
      expect(pairs[2][1].name).toBe('Battle of Gaugamela');
      expect(pairs[3][0].name).toBe('Battle of Gaugamela');
      expect(pairs[3][1].name).toBe('Battle of the Hydaspes');
    });

    it('does not fabricate dates or connecting lines for undated general locations', () => {
      const filmingLocations: Waypoint[] = [
        { id: 'loc-1', name: 'Dubrovnik Old Town', lat: 42.6403, lng: 18.1083, description: 'King\'s Landing filming location in Croatia.' },
        { id: 'loc-2', name: 'Dark Hedges', lat: 55.1345, lng: -6.3808, description: 'Kingsroad filming site in Northern Ireland.' },
        { id: 'loc-3', name: 'Vatnajökull', lat: 64.4217, lng: -16.7867, description: 'Beyond the Wall filming location in Iceland.' }
      ];

      expect(filmingLocations.every(w => extractMeaningfulWaypointDate(w) === null)).toBe(true);
      expect(isRouteSequential(filmingLocations, { routeType: 'network' })).toBe(false);
      expect(getSequentialRouteSegments(filmingLocations, { routeType: 'network' }).length).toBe(0);
    });

    it('preserves active waypoint selection index when progressive discoveries arrive', () => {
      // Step 1: First candidate arrives: Granicus
      let discovered: Waypoint[] = [granicus];
      let sorted = sortWaypointsChronologically(discovered);
      let activeSelectionId = 'granicus';
      let activeIdx = sorted.findIndex(w => w.id === activeSelectionId);
      expect(activeIdx).toBe(0);

      // Step 2: Gaugamela (331 BC) arrives
      discovered = [granicus, gaugamela];
      sorted = sortWaypointsChronologically(discovered);
      activeIdx = sorted.findIndex(w => w.id === activeSelectionId);
      expect(activeIdx).toBe(0); // Granicus is still index 0

      // Step 3: Issus (333 BC) arrives (inserted between Granicus and Gaugamela)
      discovered = [granicus, gaugamela, issus];
      sorted = sortWaypointsChronologically(discovered);
      activeIdx = sorted.findIndex(w => w.id === activeSelectionId);
      expect(activeIdx).toBe(0); // Granicus remains index 0

      // Step 4: User selects Gaugamela
      activeSelectionId = 'gaugamela';
      activeIdx = sorted.findIndex(w => w.id === activeSelectionId);
      expect(activeIdx).toBe(2); // Granicus=0, Issus=1, Gaugamela=2

      // Step 5: Tyre (332 BC) arrives (inserted before Gaugamela)
      discovered = [granicus, gaugamela, issus, tyre];
      sorted = sortWaypointsChronologically(discovered);
      activeIdx = sorted.findIndex(w => w.id === activeSelectionId);
      expect(activeIdx).toBe(3); // Gaugamela cleanly shifted to index 3 without resetting user's selection
      expect(sorted[activeIdx].name).toBe('Battle of Gaugamela');
    });
  });
});
