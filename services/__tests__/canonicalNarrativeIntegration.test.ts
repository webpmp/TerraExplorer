import { describe, it, expect } from 'vitest';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';
import { getNarrationDescription, getNarrationTitle, buildNarrationScript } from '../narrationService';
import { LocationType } from '../../types';

describe('Canonical Narrative Resolver & Narration Integration', () => {
  it('resolves base description identically for InfoPanel and narration', () => {
    const info = {
      name: 'Villa Carlotta',
      type: LocationType.POI,
      description: 'A historic villa and botanical garden on Lake Como.'
    };

    const canonical = resolveCanonicalNarrative(info);
    expect(canonical.title).toBe('Villa Carlotta');
    expect(canonical.narrativeText).toBe('A historic villa and botanical garden on Lake Como.');

    const narrationDesc = getNarrationDescription(info);
    expect(narrationDesc).toBe('A historic villa and botanical garden on Lake Como.');

    const spokenScript = buildNarrationScript(getNarrationTitle(info), narrationDesc);
    expect(spokenScript).toBe('Villa Carlotta. A historic villa and botanical garden on Lake Como.');
  });

  it('appends unique significance to the canonical narrative once', () => {
    const info = {
      name: 'Como Cathedral',
      type: LocationType.POI,
      description: 'The Roman Catholic cathedral of the city of Como.',
      significance: 'It is one of the most important buildings in the Lake Como region.'
    };

    const canonical = resolveCanonicalNarrative(info);
    expect(canonical.narrativeText).toContain('The Roman Catholic cathedral of the city of Como.');
    expect(canonical.narrativeText).toContain('It is one of the most important buildings in the Lake Como region.');
    expect(canonical.sourceParts).toContain('significance');

    const narrationDesc = getNarrationDescription(info);
    expect(narrationDesc).toContain('The Roman Catholic cathedral of the city of Como.');
    expect(narrationDesc).toContain('It is one of the most important buildings in the Lake Como region.');
  });

  it('does not duplicate significance if already contained in description', () => {
    const desc = 'Built in 1396, it is one of the most important Gothic cathedrals in northern Italy.';
    const sig = 'one of the most important Gothic cathedrals';
    const info = {
      name: 'Como Cathedral',
      type: LocationType.POI,
      description: desc,
      significance: sig
    };

    const canonical = resolveCanonicalNarrative(info);
    // Should not append duplicate significance
    expect(canonical.narrativeText).toBe(desc);
    expect(canonical.sourceParts).not.toContain('significance');

    const narrationDesc = getNarrationDescription(info);
    expect(narrationDesc).toBe(desc);
  });

  it('incorporates structured historical and cultural context into canonical narrative', () => {
    const info = {
      name: 'Villa del Balbianello',
      type: LocationType.POI,
      description: 'A villa in the comune of Lenno overlooking Lake Como.',
      historicalContext: 'Constructed in 1787 on the site of a Franciscan monastery by Cardinal Angelo Maria Durini.',
      filmContext: 'Featured as a prominent filming location in Star Wars: Episode II - Attack of the Clones and Casino Royale.'
    };

    const canonical = resolveCanonicalNarrative(info);
    expect(canonical.narrativeText).toContain('A villa in the comune of Lenno overlooking Lake Como.');
    expect(canonical.narrativeText).toContain('## Historical Context');
    expect(canonical.narrativeText).toContain('Constructed in 1787');
    expect(canonical.narrativeText).toContain('## Film & Media');
    expect(canonical.narrativeText).toContain('Featured as a prominent filming location');

    const narrationDesc = getNarrationDescription(info);
    // Narration should contain both structured context details without markdown hash headers
    expect(narrationDesc).toContain('Constructed in 1787');
    expect(narrationDesc).toContain('Star Wars: Episode II');
    expect(narrationDesc).not.toContain('##');
  });

  it('keeps route context separate from canonical entity narrative', () => {
    const info = {
      name: 'Bellagio',
      type: LocationType.POI,
      description: 'A village on a promontory jutting out into Lake Como.',
      routeContext: {
        title: 'Lake Como Tour - Stop 1',
        text: 'The opening gathering point for the northern lake excursion.'
      }
    };

    const canonical = resolveCanonicalNarrative(info);
    // Route context must be separated
    expect(canonical.routeContext?.text).toBe('The opening gathering point for the northern lake excursion.');
    expect(canonical.narrativeText).toBe('A village on a promontory jutting out into Lake Como.');
    expect(canonical.narrativeText).not.toContain('The opening gathering point');

    const narrationDesc = getNarrationDescription(info);
    expect(narrationDesc).toBe('A village on a promontory jutting out into Lake Como.');
    expect(narrationDesc).not.toContain('The opening gathering point');
  });

  it('proves narration and InfoPanel narrative parity for enriched records', () => {
    const enrichedLocationInfo = {
      canonicalName: 'Antiquarium Museum of Ossuccio',
      name: 'Antiquarium Museum',
      type: LocationType.POI,
      description: 'Archaeological museum housing Roman and medieval artifacts from Isola Comacina.',
      significance: 'Preserves the singular archaeological record of Lake Como early Christian heritage.',
      historicalBackground: 'Established in the mid-20th century following major excavations on the neighboring island.'
    };

    const canonical = resolveCanonicalNarrative(enrichedLocationInfo);
    const narrationDesc = getNarrationDescription(enrichedLocationInfo);

    // Narration description must match the cleaned version of canonical narrative
    expect(canonical.narrativeText).toContain('Archaeological museum housing Roman and medieval artifacts');
    expect(canonical.narrativeText).toContain('Preserves the singular archaeological record');
    expect(canonical.narrativeText).toContain('Established in the mid-20th century');

    expect(narrationDesc).toContain('Archaeological museum housing Roman and medieval artifacts');
    expect(narrationDesc).toContain('Preserves the singular archaeological record');
    expect(narrationDesc).toContain('Established in the mid-20th century');
  });
});
