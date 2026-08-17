import { describe, it, expect } from 'vitest';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';
import { normalizeEnglishDisplayName } from '../../utils/englishNameNormalization';

describe('OSMMapDataProvider', () => {
  it('correctly maps camera distance to detail levels with strict close-level threshold', () => {
    expect(osmMapDataProvider.getDetailLevel(4.5)).toBe('global');
    expect(osmMapDataProvider.getDetailLevel(3.5)).toBe('global');
    expect(osmMapDataProvider.getDetailLevel(2.5)).toBe('regional');
    expect(osmMapDataProvider.getDetailLevel(2.0)).toBe('regional');
    expect(osmMapDataProvider.getDetailLevel(1.8)).toBe('local');
    expect(osmMapDataProvider.getDetailLevel(1.5)).toBe('local');
    expect(osmMapDataProvider.getDetailLevel(1.3)).toBe('close');
  });

  it('enforces that calculateViewportExtent returns null for global, regional, and local distances', () => {
    // Global distance -> null
    expect(osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 4.0)).toBeNull();

    // Regional distance (> 1.8) -> null (Detail Gate CLOSED)
    expect(osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 2.5)).toBeNull();
    expect(osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 1.9)).toBeNull();

    // Local distance (> 1.45) -> null (Detail Gate CLOSED)
    expect(osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 1.6)).toBeNull();

    // Close distance (<= 1.45) -> Detail Gate OPEN
    const closeExtent = osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 1.3);
    expect(closeExtent).not.toBeNull();
    expect(closeExtent?.detailLevel).toBe('close');
  });

  it('rejects non-physical entities from becoming map labels', () => {
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Lahij insurgency')).toBe(false);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Battle of Hastings')).toBe(false);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('War of 1812')).toBe(false);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Spanish-American War')).toBe(false);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Civil Rights Movement')).toBe(false);

    expect(osmMapDataProvider.isPhysicalGeographicEntity('Paris')).toBe(true);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Biscayne National Park')).toBe(true);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Minab')).toBe(true);
    expect(osmMapDataProvider.isPhysicalGeographicEntity('Mount Everest')).toBe(true);
  });

  it('cleans and deduplicates geographic names', () => {
    expect(
      osmMapDataProvider.cleanGeographicName('Biscayne National Park - National Park', 'National Park')
    ).toBe('Biscayne National Park');

    expect(
      osmMapDataProvider.cleanGeographicName('Everglades National Park - National Park')
    ).toBe('Everglades National Park');

    expect(
      osmMapDataProvider.cleanGeographicName('Yellowstone National Park (National Park)', 'National Park')
    ).toBe('Yellowstone National Park');

    expect(
      osmMapDataProvider.cleanGeographicName('Lake Tahoe - Lake')
    ).toBe('Lake Tahoe');

    expect(
      osmMapDataProvider.cleanGeographicName('Paris - Capital')
    ).toBe('Paris');

    expect(
      osmMapDataProvider.cleanGeographicName('London City City')
    ).toBe('London City');

    expect(
      osmMapDataProvider.cleanGeographicName('Tokyo')
    ).toBe('Tokyo');
  });

  it('resolves authoritative English display names for non-Latin geographic places', () => {
    expect(normalizeEnglishDisplayName('میناب')).toBe('Minab');
    expect(normalizeEnglishDisplayName('بندرعباس')).toBe('Bandar Abbas');
    expect(normalizeEnglishDisplayName('القاهرة')).toBe('Cairo');
    expect(normalizeEnglishDisplayName('دبي')).toBe('Dubai');
  });

  it('retrieves geographic fallback features for Southern California when at close zoom', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(32.715, -117.16, 1.3);
    expect(extent).not.toBeNull();

    const features = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features.length).toBeGreaterThan(0);

    const featureNames = features.map(f => f.englishName || f.name);
    expect(featureNames).toContain('San Diego');
    expect(featureNames).toContain('I-5');
    expect(featureNames).toContain('I-8');
  });

  it('retrieves geographic fallback features for London at close zoom', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(51.5074, -0.1278, 1.3);
    expect(extent).not.toBeNull();

    const features = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features.length).toBeGreaterThan(0);

    const featureNames = features.map(f => f.englishName || f.name);
    expect(featureNames).toContain('London');
    expect(featureNames).toContain('River Thames');
  });

  it('retrieves geographic fallback features for Paris at close zoom', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(48.8566, 2.3522, 1.3);
    expect(extent).not.toBeNull();

    const features = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features.length).toBeGreaterThan(0);

    const featureNames = features.map(f => f.englishName || f.name);
    expect(featureNames).toContain('Paris');
    expect(featureNames).toContain('Seine River');
  });

  it('tags features with valid source metadata and respects cache', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(35.6762, 139.6503, 1.3);
    expect(extent).not.toBeNull();

    const features1 = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features1.length).toBeGreaterThan(0);
    expect(features1[0].source).toBeDefined();

    // Cache hit
    const features2 = await osmMapDataProvider.getFeaturesForViewport(extent!);
    expect(features2.length).toBe(features1.length);
  });

  it('isolates geography so London features are not returned for Tokyo', async () => {
    const tokyoExtent = osmMapDataProvider.calculateViewportExtent(35.6762, 139.6503, 1.3);
    expect(tokyoExtent).not.toBeNull();

    const tokyoFeatures = await osmMapDataProvider.getFeaturesForViewport(tokyoExtent!);
    const tokyoNames = tokyoFeatures.map(f => f.englishName || f.name);

    expect(tokyoNames).toContain('Tokyo');
    expect(tokyoNames).not.toContain('London');
    expect(tokyoNames).not.toContain('Los Angeles');
  });

  it('handles intentional request cancellation cleanly without errors', async () => {
    const extent = osmMapDataProvider.calculateViewportExtent(34.05, -118.25, 1.3);
    expect(extent).not.toBeNull();

    const abortController = new AbortController();
    abortController.abort(); // Abort immediately

    const features = await osmMapDataProvider.getFeaturesForViewport(extent!, {
      requestId: 99,
      signal: abortController.signal
    });

    expect(features).toEqual([]);
  });
});
