import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canonicalizeImageUrl,
  SearchImageRegistry,
  searchImageRegistry
} from '../imageDeduplicationService';
import {
  fetchAndValidateImages,
  assignUniqueImagesForWaypoints,
  validateImageCandidate,
  classifyImageEvidence
} from '../imageService';

describe('Unique Image Selection Across Related Waypoints Suite', () => {
  beforeEach(() => {
    searchImageRegistry.reset();
    vi.restoreAllMocks();
  });

  describe('1. Canonical Image Identity & Deduplication', () => {
    it('detects exact duplicate URLs', () => {
      const url1 = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Salem_Witch_House.jpg';
      const url2 = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Salem_Witch_House.jpg';
      expect(canonicalizeImageUrl(url1)).toBe(canonicalizeImageUrl(url2));
    });

    it('resolves equivalent Wikimedia thumbnail and original full-size URLs to the same canonical identity', () => {
      const thumbUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Queen_Annes_Revenge_Artifact.jpg/800px-Queen_Annes_Revenge_Artifact.jpg';
      const fullUrl = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Queen_Annes_Revenge_Artifact.jpg';
      const mediumThumbUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Queen_Annes_Revenge_Artifact.jpg/1200px-Queen_Annes_Revenge_Artifact.jpg';

      const canon1 = canonicalizeImageUrl(thumbUrl);
      const canon2 = canonicalizeImageUrl(fullUrl);
      const canon3 = canonicalizeImageUrl(mediumThumbUrl);

      expect(canon1).toBe(canon2);
      expect(canon2).toBe(canon3);
      expect(canon1).toBe('wikimedia:commons:queen_annes_revenge_artifact.jpg');
    });

    it('normalizes HTTP vs HTTPS, trailing slashes, and redundant query parameters', () => {
      const u1 = 'http://example.com/images/historic_site.jpg?width=800&crop=1';
      const u2 = 'https://example.com/images/historic_site.jpg?fit=true';
      expect(canonicalizeImageUrl(u1)).toBe(canonicalizeImageUrl(u2));
    });

    it('does NOT treat different photographs of the same entity or topic as duplicates', () => {
      const photo1 = 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Queen_Annes_Revenge_Artifact_1.jpg';
      const photo2 = 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Queen_Annes_Revenge_Artifact_2.jpg';
      const photo3 = 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Queen_Annes_Revenge_Excavation.jpg';
      const painting = 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Queen_Annes_Revenge_Illustration.jpg';

      const ids = new Set([
        canonicalizeImageUrl(photo1),
        canonicalizeImageUrl(photo2),
        canonicalizeImageUrl(photo3),
        canonicalizeImageUrl(painting)
      ]);

      expect(ids.size).toBe(4);
    });
  });

  describe('2. SearchImageRegistry Search-Scoped Lifecycle', () => {
    it('isolates image registrations by searchId (Search A assignments do not affect Search B)', () => {
      const registry = new SearchImageRegistry();
      const searchA = registry.createSearchSession('Salem Witch Trials');
      const searchB = registry.createSearchSession('Salem Witch Trials');

      const imgUrl = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Salem_House.jpg';

      registry.registerImage(searchA, 'waypoint-1', imgUrl);

      // In Search A, it is used
      expect(registry.isImageUsedInSearch(searchA, imgUrl).isUsed).toBe(true);
      expect(registry.isImageUsedInSearch(searchA, imgUrl).usedByWaypointId).toBe('waypoint-1');

      // In Search B, it is fresh and eligible
      expect(registry.isImageUsedInSearch(searchB, imgUrl).isUsed).toBe(false);
    });
  });

  describe('3. Historic Site & Shipwreck Entity Alias Recognition', () => {
    it('Queen Anne\'s Revenge qualifies as an alias match for Queen Anne\'s Revenge Shipwreck', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/QAR.jpg',
        title: 'Queen Anne\'s Revenge',
        description: 'Flagship of the pirate Blackbeard, wrecked off Beaufort Inlet in 1718.'
      };

      const entity = {
        name: 'Queen Anne\'s Revenge Shipwreck',
        entityType: 'shipwreck_site',
        country: 'United States'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(50);
    });
  });

  describe('4. Search-Scoped Unique Image Selection', () => {
    it('two related waypoints with different relevant images receive different images', async () => {
      const searchId = searchImageRegistry.createSearchSession('Salem Witch Trials');

      const wp1 = {
        name: 'Salem Witch Trials Memorial',
        entityType: 'monument',
        images: [
          'https://upload.wikimedia.org/wikipedia/commons/1/11/Salem_Memorial.jpg',
          'https://upload.wikimedia.org/wikipedia/commons/2/22/Salem_Witch_House.jpg'
        ]
      };

      const wp2 = {
        name: 'Salem Village Historic Site',
        entityType: 'historic_site',
        images: [
          // wp2 has Salem_Memorial.jpg first, but also has unique Salem_Village_Church.jpg and Salem_Witch_House.jpg
          'https://upload.wikimedia.org/wikipedia/commons/1/11/Salem_Memorial.jpg',
          'https://upload.wikimedia.org/wikipedia/commons/3/33/Salem_Village_Church.jpg'
        ]
      };

      // Waypoint 1 fetches first
      const wp1Images = await fetchAndValidateImages(wp1 as any, {
        searchId,
        waypointId: 'wp-1'
      });

      expect(wp1Images[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/1/11/Salem_Memorial.jpg');

      // Waypoint 2 fetches next in the same search session
      const wp2Images = await fetchAndValidateImages(wp2 as any, {
        searchId,
        waypointId: 'wp-2'
      });

      // Waypoint 2 skips Salem_Memorial.jpg duplicate and selects Salem_Village_Church.jpg
      expect(wp2Images[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/3/33/Salem_Village_Church.jpg');
    });

    it('a slightly lower-ranked but still relevant unique image is preferred over a duplicate', async () => {
      const searchId = searchImageRegistry.createSearchSession('Lord of the Rings filming');

      const wp1 = {
        name: 'Hobbiton Movie Set',
        entityType: 'landmark',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Shire_Hobbiton.jpg', title: 'Hobbiton Movie Set in Matamata', description: 'Hobbiton Movie Set location' }
        ]
      };

      const wp2 = {
        name: 'Alexander Farm Shire Set',
        entityType: 'landmark',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Shire_Hobbiton.jpg', title: 'Hobbiton Movie Set in Matamata', description: 'Alexander Farm movie set' },
          { url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Green_Dragon_Inn.jpg', title: 'Green Dragon Inn Hobbiton', description: 'Alexander Farm Shire Set' }
        ]
      };

      const wp1Imgs = await fetchAndValidateImages(wp1 as any, { searchId, waypointId: 'wp-1' });
      expect(wp1Imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/a/a1/Shire_Hobbiton.jpg');

      const wp2Imgs = await fetchAndValidateImages(wp2 as any, { searchId, waypointId: 'wp-2' });
      expect(wp2Imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/b/b2/Green_Dragon_Inn.jpg');
    });

    it('an irrelevant image is never selected solely to satisfy uniqueness (relevance takes priority)', async () => {
      const searchId = searchImageRegistry.createSearchSession('Forbidden City');

      const wp1 = {
        name: 'Forbidden City Meridian Gate',
        entityType: 'landmark',
        city: 'Beijing',
        country: 'China',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Forbidden_City_Gate.jpg', title: 'Forbidden City Meridian Gate' }
        ]
      };

      const wp2 = {
        name: 'Forbidden City Palace Complex',
        entityType: 'landmark',
        city: 'Beijing',
        country: 'China',
        images: [
          // Candidate 1 is already used
          { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Forbidden_City_Gate.jpg', title: 'Forbidden City Meridian Gate' },
          // Candidate 2 is completely irrelevant (San Francisco cabaret)
          { url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/SF_Nightclub.jpg', title: 'Asian-themed cabaret in San Francisco', coordinates: { lat: 37.7749, lng: -122.4194 } }
        ]
      };

      const wp1Imgs = await fetchAndValidateImages(wp1 as any, { searchId, waypointId: 'wp-1' });
      expect(wp1Imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/1/11/Forbidden_City_Gate.jpg');

      // Waypoint 2 must NOT select the SF Nightclub! It should allow the duplicate rather than selecting irrelevant imagery.
      const wp2Imgs = await fetchAndValidateImages(wp2 as any, { searchId, waypointId: 'wp-2' });
      expect(wp2Imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/1/11/Forbidden_City_Gate.jpg');
    });

    it('a duplicate is allowed when no sufficiently relevant unique alternative exists', async () => {
      const searchId = searchImageRegistry.createSearchSession('Remote Shipwreck Site');

      const wp1 = {
        name: 'SS El Faro Wreck Location',
        entityType: 'shipwreck_site',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/SS_El_Faro.jpg', title: 'SS El Faro cargo ship' }
        ]
      };

      const wp2 = {
        name: 'SS El Faro Discovery Site',
        entityType: 'shipwreck_site',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/SS_El_Faro.jpg', title: 'SS El Faro cargo ship' }
        ]
      };

      await fetchAndValidateImages(wp1 as any, { searchId, waypointId: 'wp-1' });
      const wp2Imgs = await fetchAndValidateImages(wp2 as any, { searchId, waypointId: 'wp-2' });

      expect(wp2Imgs.length).toBe(1);
      expect(wp2Imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/e/e1/SS_El_Faro.jpg');
    });

    it('existing single-waypoint image selection behavior remains unchanged when searchContext is omitted', async () => {
      const singleInfo = {
        name: 'Eiffel Tower',
        entityType: 'landmark',
        city: 'Paris',
        country: 'France',
        images: [
          { url: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Eiffel_Tower_Paris.jpg', title: 'Eiffel Tower, Paris' }
        ]
      };

      const imgs = await fetchAndValidateImages(singleInfo as any);
      expect(imgs.length).toBe(1);
      expect(imgs[0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/e/e2/Eiffel_Tower_Paris.jpg');
    });
  });

  describe('5. Batch Assignment across multiple waypoints', () => {
    it('assignUniqueImagesForWaypoints assigns unique images across 3 related waypoints', async () => {
      const searchId = searchImageRegistry.createSearchSession('Historic Expedition');

      const wps = [
        {
          id: 'wp-1',
          name: 'St. Charles, Missouri',
          entityType: 'historical_waypoint',
          images: [
            { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Lewis_Clark_Expedition.jpg', title: 'Corps of Discovery at St. Charles 1804' },
            { url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/St_Charles_Historic.jpg', title: 'St. Charles Historic Missouri' }
          ]
        },
        {
          id: 'wp-2',
          name: 'Fort Mandan, North Dakota',
          entityType: 'historical_waypoint',
          images: [
            { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Lewis_Clark_Expedition.jpg', title: 'Corps of Discovery at St. Charles 1804' },
            { url: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Fort_Mandan_1804.jpg', title: 'Fort Mandan North Dakota Historic' }
          ]
        },
        {
          id: 'wp-3',
          name: 'Fort Clatsop, Oregon',
          entityType: 'historical_waypoint',
          images: [
            { url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Lewis_Clark_Expedition.jpg', title: 'Corps of Discovery at St. Charles 1804' },
            { url: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Fort_Clatsop_Winter.jpg', title: 'Fort Clatsop Winter Historic' }
          ]
        }
      ];

      const resultMap = await assignUniqueImagesForWaypoints(wps as any, { searchId });

      expect(resultMap.get('wp-1')![0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/1/11/Lewis_Clark_Expedition.jpg');
      expect(resultMap.get('wp-2')![0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/3/33/Fort_Mandan_1804.jpg');
      expect(resultMap.get('wp-3')![0].url).toBe('https://upload.wikimedia.org/wikipedia/commons/4/44/Fort_Clatsop_Winter.jpg');
    });
  });

  describe('6. Entity-First Historic Site & POI Image Discovery Matrix', () => {
    it('exact Historic Site entity match with no geographic metadata remains eligible and is not assigned NO_ENTITY_SPECIFIC_EVIDENCE', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Parthenon_Ruins.jpg',
        title: 'Parthenon',
        description: 'Former temple on the Athenian Acropolis, dedicated to goddess Athena.'
      };

      const entity = {
        name: 'Parthenon',
        entityType: 'historic_site'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.reason).toBe('STRONG_ENTITY_MATCH');
      expect(res.score).toBeGreaterThanOrEqual(50);
    });

    it('alias entity match (e.g. Queen Anne\'s Revenge for Queen Anne\'s Revenge Shipwreck) remains eligible', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/QAR_Vessel.jpg',
        title: 'Queen Anne\'s Revenge',
        description: 'Flagship vessel commanded by Edward Teach (Blackbeard).'
      };

      const entity = {
        name: 'Queen Anne\'s Revenge Shipwreck',
        entityType: 'shipwreck_site'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.reason).toBe('STRONG_ENTITY_MATCH');
    });

    it('contextual entity match (e.g. Blackbeard\'s Queen Anne\'s Revenge for Queen Anne\'s Revenge)', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Blackbeards_QAR.jpg',
        title: 'Blackbeard\'s Queen Anne\'s Revenge',
        description: 'The infamous pirate flagship off North Carolina.'
      };

      const entity = {
        name: 'Queen Anne\'s Revenge',
        entityType: 'shipwreck_site'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
    });

    it('entity-specific image with unverified waypoint coordinates remains eligible', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Gettysburg_Site.jpg',
        title: 'Gettysburg National Military Park',
        description: 'Historic battlefield memorial and landscape in Gettysburg, Pennsylvania.'
      };

      const entity = {
        name: 'Gettysburg National Military Park',
        entityType: 'battlefield',
        coordinates: { lat: 39.8156, lng: -77.2311 },
        coordinateSource: 'ai_recovery',
        identityStatus: 'unverified'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
    });

    it('entity-specific image with conflicting unverified coordinates remains accepted', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/QAR_Cannon.jpg',
        title: 'Queen Anne\'s Revenge Shipwreck Cannon',
        description: 'Recovered bronze cannon from Beaufort Inlet, North Carolina.',
        coordinates: { lat: 34.6922, lng: -76.6853 }
      };

      // Waypoint has incorrect / displaced unverified coordinates (e.g. over Indian Ocean or far away)
      const entity = {
        name: 'Queen Anne\'s Revenge Shipwreck',
        entityType: 'shipwreck_site',
        coordinates: { lat: -10.0, lng: 70.0 }, // Indian Ocean
        coordinateSource: 'ai_recovery',
        identityStatus: 'unverified'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.reason).toBe('STRONG_ENTITY_MATCH_COORDINATE_CONFLICT_UNVERIFIED');
    });

    it('entity-specific image with verified matching coordinates receives top rank and score boost', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Colosseum_Rome.jpg',
        title: 'Colosseum',
        description: 'Flavian Amphitheatre in central Rome, Italy.',
        coordinates: { lat: 41.8902, lng: 12.4922 }
      };

      const entity = {
        name: 'Colosseum',
        entityType: 'historic_site',
        city: 'Rome',
        country: 'Italy',
        coordinates: { lat: 41.8902, lng: 12.4922 },
        coordinateSource: 'osm_verified',
        identityStatus: 'verified'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.reason).toBe('STRONG_ENTITY_MATCH_GEO_VERIFIED');
      expect(res.score).toBeGreaterThanOrEqual(80);
    });

    it('distinct entity with matching geographic region is rejected (ENTITY_MISMATCH)', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Pantheon.jpg',
        title: 'Pantheon, Rome',
        description: 'Former Roman temple, now a Catholic church in Rome, Italy.',
        coordinates: { lat: 41.8986, lng: 12.4769 }
      };

      const entity = {
        name: 'Colosseum',
        entityType: 'historic_site',
        city: 'Rome',
        country: 'Italy'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('REJECT');
      expect(['ENTITY_MISMATCH', 'DIFFERENT_ENTITY', 'NO_ENTITY_SPECIFIC_EVIDENCE']).toContain(res.reason);
    });

    it('similar-name entities are not incorrectly treated as the same entity', () => {
      // e.g. "St. Paul's Cathedral London" vs "St. Paul's Church Melbourne"
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/St_Pauls_Melbourne.jpg',
        title: 'St Paul\'s Cathedral Melbourne Australia',
        description: 'Anglican cathedral in Melbourne, Victoria, Australia.'
      };

      const entity = {
        name: 'St. Paul\'s Cathedral',
        entityType: 'historic_site',
        city: 'London',
        country: 'United Kingdom'
      };

      const res = validateImageCandidate(candidate, entity);
      // Because candidate explicitly refers to Melbourne Australia while entity is in London UK
      expect(res.decision).toBe('REJECT');
    });

    it('generic category-only POI searches retain existing geographic and relevance safeguards', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/SF_Nightclub.jpg',
        title: 'Asian-themed cabaret in San Francisco',
        description: 'Nightlife venue in San Francisco, California.'
      };

      const entity = {
        name: 'Coffee Shop',
        entityType: 'amenity',
        city: 'San Francisco',
        country: 'United States'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('REJECT');
    });

    it('historical artifacts and archaeological project images are accepted for historic sites and shipwrecks', () => {
      const candidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/QAR_Artifacts.jpg',
        title: 'Queen Anne\'s Revenge Shipwreck Artifacts',
        description: 'Lead shot and medical equipment excavated from Queen Anne\'s Revenge.'
      };

      const entity = {
        name: 'Queen Anne\'s Revenge',
        entityType: 'shipwreck_site'
      };

      const res = validateImageCandidate(candidate, entity);
      expect(res.decision).toBe('ACCEPT');
    });
  });
});
