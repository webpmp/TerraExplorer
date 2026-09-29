import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import {
  isSuitableHeaderBackgroundImage,
  getHeaderFocalPosition,
  getHeaderBackgroundImageUrl
} from '../../utils/imageHeaderUtils';
import { LocationInfo, LocationType } from '../../types';

describe('Modern Theme InfoPanel Header Contextual Background Image Suite', () => {
  const hmsVictoryLocation: LocationInfo = {
    name: 'HMS Victory',
    canonicalName: 'HMS Victory',
    type: LocationType.Historical,
    entityType: 'ship',
    category: 'LANDMARK',
    locationString: 'Portsmouth, United Kingdom',
    coordinates: { lat: 50.8018, lng: -1.1097 },
    description: 'HMS Victory is a 104-gun first-rate ship of the line of the Royal Navy, famous as Lord Nelson’s flagship at the Battle of Trafalgar.',
    primaryImage: {
      url: 'https://images.example.com/hms-victory-full.jpg',
      caption: 'HMS Victory preserved in dry dock at Portsmouth.'
    }
  };

  const mountFujiLocation: LocationInfo = {
    name: 'Mount Fuji',
    type: LocationType.Landmark,
    entityType: 'volcano',
    category: 'MOUNTAIN',
    locationString: 'Honshu, Japan',
    coordinates: { lat: 35.3606, lng: 138.7274 },
    description: 'Mount Fuji is an active stratovolcano and the highest peak in Japan.',
    images: [
      {
        url: 'https://images.example.com/mount-fuji.jpg',
        caption: 'Snow-capped peak of Mount Fuji.'
      }
    ]
  };

  const windsorCastleLocation: LocationInfo = {
    name: 'Windsor Castle',
    type: LocationType.Historical,
    entityType: 'castle',
    category: 'HISTORIC BUILDING',
    locationString: 'Windsor, Berkshire, England',
    coordinates: { lat: 51.4839, lng: -0.6044 },
    description: 'Windsor Castle is a royal residence at Windsor in the English county of Berkshire.',
    image: 'https://images.example.com/windsor-castle.jpg'
  };

  describe('1. Modern Theme + Valid Enriched Image Rendering', () => {
    it('renders subtle contextual background image layer in modern theme for HMS Victory', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={hmsVictoryLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
          onSaveFavorite={vi.fn()}
          onRemoveFavorite={vi.fn()}
        />
      );

      // Background image layer is present with decorative semantics
      expect(html).toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('src="https://images.example.com/hms-victory-full.jpg"');
      expect(html).toContain('role="presentation"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('pointer-events-none');

      // Cropping & blending styling
      expect(html).toContain('object-cover');
      expect(html).toContain('scale-110');
      expect(html).toContain('mix-blend-luminosity');
      expect(html).toContain('object-position:50% 35%');

      // Gradient overlay blend
      expect(html).toContain('bg-gradient-to-r from-blue-950/75 via-blue-900/50 to-cyan-950/75 mix-blend-multiply');

      // Text and buttons remain intact and layered in relative z-10 / z-50
      expect(html).toContain('HMS Victory</h2>');
      expect(html).toContain('Portsmouth, United Kingdom');
      expect(html).toContain('SHIP</span>');
      expect(html).toContain('50.80° N, 1.11° W');
      expect(html).toContain('aria-label="Close panel"');
    });

    it('renders mountain focal crop for Mount Fuji', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={mountFujiLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
        />
      );

      expect(html).toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('src="https://images.example.com/mount-fuji.jpg"');
      expect(html).toContain('object-position:50% 40%');
    });

    it('renders architectural focal crop for Windsor Castle', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={windsorCastleLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
        />
      );

      expect(html).toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('src="https://images.example.com/windsor-castle.jpg"');
      expect(html).toContain('object-position:50% 35%');
    });
  });

  describe('2. Modern Theme with No Image or Unsuitable Image', () => {
    it('does not render background image layer when location has no images', () => {
      const locationWithoutImage: LocationInfo = {
        name: 'Empty Location',
        type: LocationType.City,
        coordinates: { lat: 10, lng: 20 },
        description: 'A city with no images.'
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={locationWithoutImage}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
        />
      );

      expect(html).not.toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('bg-gradient-to-r from-blue-900 to-cyan-900');
      expect(html).toContain('Empty Location</h2>');
    });

    it('rejects unsuitable images like flags, SVG icons, and maps', () => {
      expect(isSuitableHeaderBackgroundImage('https://example.com/Flag_of_France.svg')).toBe(false);
      expect(isSuitableHeaderBackgroundImage('https://example.com/Flag_of_UK.png')).toBe(false);
      expect(isSuitableHeaderBackgroundImage('https://example.com/Coat_of_arms_of_Spain.png')).toBe(false);
      expect(isSuitableHeaderBackgroundImage('https://example.com/Paris_locator_map.png')).toBe(false);
      expect(isSuitableHeaderBackgroundImage('https://example.com/icon_monument.svg')).toBe(false);
      expect(isSuitableHeaderBackgroundImage('https://example.com/hms_victory_rigging.jpg')).toBe(true);
    });

    it('does not render background image when only flag or map image is provided', () => {
      const flagOnlyLocation: LocationInfo = {
        name: 'France',
        type: LocationType.Country,
        coordinates: { lat: 46.2276, lng: 2.2137 },
        description: 'Country in Western Europe.',
        primaryImage: 'https://example.com/Flag_of_France.svg'
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={flagOnlyLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="modern"
          isFavorite={false}
        />
      );

      expect(html).not.toContain('data-testid="modern-header-background-image"');
    });
  });

  describe('3. Non-Modern Themes Isolation (Parchment, Retro-Green, Retro-Amber)', () => {
    it('never renders background image layer in parchment theme', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={hmsVictoryLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="parchment"
          isFavorite={false}
        />
      );

      expect(html).not.toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('parchment-background');
      expect(html).toContain('HMS Victory</h2>');
    });

    it('never renders background image layer in retro-green theme', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={hmsVictoryLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="retro-green"
          isFavorite={false}
        />
      );

      expect(html).not.toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('bg-green-900/30');
    });

    it('never renders background image layer in retro-amber theme', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={hmsVictoryLocation}
          onClose={vi.fn()}
          isLoading={false}
          skin="retro-amber"
          isFavorite={false}
        />
      );

      expect(html).not.toContain('data-testid="modern-header-background-image"');
      expect(html).toContain('bg-amber-900/30');
    });
  });

  describe('4. Custom / Explicit Focal Position Support', () => {
    it('supports custom percentage focal positions and descriptive focal point aliases', () => {
      expect(getHeaderFocalPosition({ name: 'Generic' }, { focalPoint: 'top-center' })).toBe('50% 20%');
      expect(getHeaderFocalPosition({ name: 'Generic' }, { focalPoint: 'bottom' })).toBe('50% 80%');
      expect(getHeaderFocalPosition({ name: 'Generic' }, { focalPoint: '25% 75%' })).toBe('25% 75%');
      expect(getHeaderFocalPosition({ imageFocalPoint: '30% 60%' })).toBe('30% 60%');
    });
  });
});
