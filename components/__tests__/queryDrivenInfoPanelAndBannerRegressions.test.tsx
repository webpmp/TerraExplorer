import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel, { normalizeHeaderGeographicHierarchy, VoyagerCeremonialBanner } from '../InfoPanel';
import { deriveQueryTopicTitle } from '../../services/queryNormalizer';
import { LocationInfo } from '../../types';

describe('Query-Driven InfoPanel Content & Waypoint Navigation Regressions', () => {
  describe('1. Query Title Derivation & Clean Header Rendering without Odd Characters', () => {
    test('derives canonical query topic title for multi-result historical queries', () => {
      expect(deriveQueryTopicTitle('Where were the major battles of World War I?')).toBe('Battles of World War I');
      expect(deriveQueryTopicTitle('major battles of the American Civil War')).toBe('Battles of the American Civil War');
      expect(deriveQueryTopicTitle('Where was Game of Thrones filmed?')).toBe('Game of Thrones Filming Locations');
      expect(deriveQueryTopicTitle('where are the famous waterfalls of iceland')).toBe('Famous Waterfalls of Iceland');
      expect(deriveQueryTopicTitle('ancient wonders of the world')).toBe('Ancient Wonders of the World');
    });

    test('preserves canonical location title for normal single-location queries', () => {
      const eiffelTower = {
        name: 'Eiffel Tower',
        canonicalName: 'Eiffel Tower',
        locationString: 'Paris, France',
        type: 'Point of Interest' as any,
        entityType: 'landmark',
        coordinates: { lat: 48.8584, lng: 2.2945 }
      };
      const result = normalizeHeaderGeographicHierarchy(eiffelTower, undefined, true);
      expect(result.displayTitle).toBe('Eiffel Tower');
      expect(result.displaySubtitle).toBe('Paris, France');

      const stalingrad = {
        name: 'Stalingrad (modern-day Volgograd)',
        canonicalName: 'Stalingrad',
        locationString: 'Volgograd Oblast, Russia',
        type: 'City' as any,
        entityType: 'city',
        coordinates: { lat: 48.7080, lng: 44.5133 }
      };
      const stalingradResult = normalizeHeaderGeographicHierarchy(stalingrad, undefined, true);
      expect(stalingradResult.displayTitle).toBe('Stalingrad');
    });

    test('renders clean Parchment InfoPanel header with current Waypoint Title, Subtitle, Category, Coordinates without bullet separator or stray characters', () => {
      const verdunInfo: LocationInfo = {
        name: 'Verdun',
        canonicalName: 'Verdun',
        routeTitle: 'Major Battles of World War I',
        locationString: 'Saulvaux, France',
        type: 'Landmark' as any,
        entityType: 'landmark',
        coordinates: { lat: 48.66, lng: 5.43 },
        description: 'Site of the Battle of Verdun in northeastern France.',
        routeContext: {
          title: 'Major Battles of World War I',
          text: 'Key Western Front conflict in 1916.'
        },
        waypoint: {
          id: 'wp-verdun',
          name: 'Verdun',
          canonicalName: 'Verdun',
          alternateNames: ['Verdun-sur-Meuse'],
          routeTitle: 'Major Battles of World War I',
          lat: 48.66,
          lng: 5.43,
          sequence: 1
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={verdunInfo}
          onClose={vi.fn()}
          skin="parchment"
          routeNav={{
            current: 1,
            total: 3,
            onNext: vi.fn(),
            onPrev: vi.fn()
          }}
        />
      );

      // Verify header contents identify the current waypoint
      expect(html).toContain('Verdun');
      expect(html).toContain('Saulvaux, France');
      expect(html).toContain('LANDMARK');
      expect(html).toContain('48.66° N, 5.43° E');
      expect(html).not.toContain('Verdun • Saulvaux, France');

      // Verify collection/query title is preserved in Details section
      expect(html).toContain('Major Battles of World War I');

      // Verify no stray "Also known as" or unexpected text nodes in the header
      expect(html).not.toContain('Also known as');
      expect(html).not.toContain('Also known as Verdun');
      expect(html).not.toContain('Also known as Verdun-sur-Meuse');
    });

    test('renders The Marne waypoint header with Connantre, France subtitle and preserved collection title in Details', () => {
      const theMarneInfo: LocationInfo = {
        name: 'The Marne',
        canonicalName: 'The Marne',
        routeTitle: 'Major Battles of World War I',
        locationString: 'Connantre, France',
        type: 'Landmark' as any,
        entityType: 'landmark',
        coordinates: { lat: 48.76, lng: 3.90 },
        description: 'The Battle of the Marne resulted in heavy casualties, with estimates ranging from 250,000 to 300,000.',
        routeContext: {
          title: 'Major Battles of World War I',
          text: 'The opening campaign of World War I in northeastern France.'
        },
        waypoint: {
          id: 'wp-marne',
          name: 'The Marne',
          canonicalName: 'The Marne',
          lat: 48.76,
          lng: 3.90,
          sequence: 1
        }
      };

      const html = renderToStaticMarkup(
        <InfoPanel
          info={theMarneInfo}
          onClose={vi.fn()}
          skin="parchment"
          routeNav={{
            current: 1,
            total: 3,
            onNext: vi.fn(),
            onPrev: vi.fn()
          }}
        />
      );

      // Desired Header structure:
      // The Marne
      // Connantre, France
      // LANDMARK
      // 48.76° N, 3.90° E
      expect(html).toContain('The Marne');
      expect(html).toContain('Connantre, France');
      expect(html).toContain('LANDMARK');
      expect(html).toContain('48.76° N, 3.90° E');
      expect(html).not.toContain('The Marne • Connantre, France');
      expect(html).not.toContain('Major Battles of World War I •');

      // Details section retains query-level collection title
      expect(html).toContain('Major Battles of World War I');
    });
  });

  describe('2. Single Waypoint Navigation Bar (Exactly 1 Waypoint)', () => {
    const singleWaypointInfo: LocationInfo = {
      name: 'Eiffel Tower',
      canonicalName: 'Eiffel Tower',
      locationString: 'Paris, France',
      type: 'Point of Interest' as any,
      entityType: 'historical_waypoint',
      coordinates: { lat: 48.8584, lng: 2.2945 },
      description: 'Iconic wrought-iron lattice tower on the Champ de Mars in Paris, France.',
      waypoint: {
        id: 'wp-1',
        name: 'Eiffel Tower',
        canonicalName: 'Eiffel Tower',
        lat: 48.8584,
        lng: 2.2945,
        sequence: 1
      }
    };

    const singleNav = {
      current: 1,
      total: 1,
      onNext: vi.fn(),
      onPrev: vi.fn()
    };

    test('Parchment theme renders centered "WAYPOINT [symbol] 1 OF 1" without navigation buttons', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={singleWaypointInfo}
          onClose={vi.fn()}
          skin="parchment"
          routeNav={singleNav}
        />
      );

      // Does NOT render previous or next buttons
      expect(html).not.toContain('aria-label="Previous waypoint"');
      expect(html).not.toContain('aria-label="Next waypoint"');

      // Renders centered text on both sides of center emblem
      expect(html).toContain('WAYPOINT');
      expect(html).toContain('1 OF 1');
      expect(html).toContain('text-center');
      expect(html).toContain('data-testid="voyager-ceremonial-banner"');
    });

    test('Modern theme renders centered "Waypoint 1 of 1" without navigation buttons', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={singleWaypointInfo}
          onClose={vi.fn()}
          skin="modern"
          routeNav={singleNav}
        />
      );

      // Does NOT render previous or next buttons
      expect(html).not.toContain('aria-label="Previous waypoint"');
      expect(html).not.toContain('aria-label="Next waypoint"');

      // Renders clean centered counter
      expect(html).toContain('Waypoint 1 of 1');
      expect(html).toContain('justify-center');
    });
  });

  describe('3. Multiple Waypoints Navigation & Symmetrical Centering Geometry', () => {
    const multiWaypointInfo: LocationInfo = {
      name: 'Ypres Front Battles',
      canonicalName: 'Ypres Front Battles',
      routeTitle: 'Battles of World War I',
      locationString: 'West Flanders, Belgium',
      type: 'Point of Interest' as any,
      entityType: 'historical_waypoint',
      coordinates: { lat: 50.8514, lng: 2.8856 },
      description: 'Site of pivotal First World War battles in western Belgium.',
      routeContext: {
        title: 'Battles of World War I',
        text: 'Ypres witnessed three major confrontations on the Western Front between 1914 and 1917.'
      },
      waypoint: {
        id: 'wp-ypres',
        name: 'Ypres Front Battles',
        canonicalName: 'Ypres Front Battles',
        routeTitle: 'Battles of World War I',
        lat: 50.8514,
        lng: 2.8856,
        sequence: 1
      }
    };

    const multiNav = {
      current: 1,
      total: 3,
      onNext: vi.fn(),
      onPrev: vi.fn()
    };

    const loadingNav = {
      current: 1,
      total: 3,
      isDiscoveryLoading: true,
      onNext: vi.fn(),
      onPrev: vi.fn()
    };

    test('Parchment theme renders "< WAYPOINT [symbol] 1 OF 3 >" with edge buttons and centered text regions', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={multiWaypointInfo}
          onClose={vi.fn()}
          skin="parchment"
          routeNav={multiNav}
        />
      );

      // Previous button retains exact edge positioning
      expect(html).toContain('absolute left-2 sm:left-4 top-1/2 -translate-y-1/2');
      expect(html).toContain('aria-label="Previous waypoint"');

      // Next button retains exact edge positioning
      expect(html).toContain('absolute right-2 sm:right-4 top-1/2 -translate-y-1/2');
      expect(html).toContain('aria-label="Next waypoint"');

      // Text regions are centered (text-center) within symmetrical flex-1 containers surrounding the center spacer
      expect(html).toContain('text-center');
      expect(html).toContain('WAYPOINT');
      expect(html).toContain('1 OF 3');
      expect(html).not.toContain('text-right');
      expect(html).not.toContain('text-left');
    });

    test('Parchment theme renders "IDENTIFYING [symbol] WAYPOINTS" during loading state with symmetrical centered geometry', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={multiWaypointInfo}
          onClose={vi.fn()}
          skin="parchment"
          routeNav={loadingNav}
        />
      );

      // During loading, navigation buttons are hidden
      expect(html).not.toContain('aria-label="Previous waypoint"');
      expect(html).not.toContain('aria-label="Next waypoint"');

      // Renders centered identifying label with text-center
      expect(html).toContain('IDENTIFYING');
      expect(html).toContain('WAYPOINTS');
      expect(html).toContain('text-center');
    });

    test('Modern theme renders "IDENTIFYING WAYPOINTS" during loading state', () => {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={multiWaypointInfo}
          onClose={vi.fn()}
          skin="modern"
          routeNav={loadingNav}
        />
      );

      expect(html).not.toContain('aria-label="Previous waypoint"');
      expect(html).not.toContain('aria-label="Next waypoint"');
      expect(html).toContain('IDENTIFYING WAYPOINTS');
    });
  });

  describe('4. Center Compass Action Label & Route Editor Invocation: Unsaved vs Saved Route', () => {
    const dummyInfo: LocationInfo = {
      name: 'Verdun',
      description: 'Battlefield',
      coordinates: { lat: 48.66, lng: 5.43 }
    };

    const nav = {
      current: 1,
      total: 3,
      onNext: vi.fn(),
      onPrev: vi.fn()
    };

    test('unsaved route displays title="Save Route", aria-label="Save Route", and invokes onEditRoute when clicked', () => {
      const onEditRoute = vi.fn();
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          skin="parchment"
          isFavorite={false}
          routeNav={nav}
          onEditRoute={onEditRoute}
        />
      );

      expect(html).toContain('title="Save Route"');
      expect(html).toContain('aria-label="Save Route"');
      expect(html).not.toContain('aria-label="Edit Route"');

      // Verify that clicking the center compass button on an unsaved route calls onEditRoute to open the route editor
      const banner = VoyagerCeremonialBanner({
        isFavorite: false,
        onFavoriteClick: onEditRoute,
        favoriteTitle: 'Save Route',
        routeNav: nav
      });
      const button = banner.props.children[1];
      button.props.onClick();
      expect(onEditRoute).toHaveBeenCalledTimes(1);
    });

    test('saved route displays title="Edit Route", aria-label="Edit Route", and invokes onEditRoute when clicked', () => {
      const onEditRoute = vi.fn();
      const html = renderToStaticMarkup(
        <InfoPanel
          info={dummyInfo}
          onClose={vi.fn()}
          skin="parchment"
          isFavorite={true}
          routeNav={nav}
          onEditRoute={onEditRoute}
        />
      );

      expect(html).toContain('title="Edit Route"');
      expect(html).toContain('aria-label="Edit Route"');
      expect(html).not.toContain('aria-label="Save Route"');

      // Verify that clicking the center compass button on a saved route calls onEditRoute to open the route editor
      const banner = VoyagerCeremonialBanner({
        isFavorite: true,
        onFavoriteClick: onEditRoute,
        favoriteTitle: 'Edit Route',
        routeNav: nav
      });
      const button = banner.props.children[1];
      button.props.onClick();
      expect(onEditRoute).toHaveBeenCalledTimes(1);
    });
  });
});
