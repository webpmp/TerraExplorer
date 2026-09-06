import { describe, it, expect } from 'vitest';
import { resolveGeographicMetadata } from '../geographic/geographicResolver';
import { validateImageCandidate, buildHistoricalImageQueries } from '../imageService';
import { MapMarker } from '../../types';
import { runRoutePipeline } from '../routePipeline';

describe('Historical Waypoint Identity, Image Relevance & Resolution Test Suite', () => {

  describe('1. Geographic Identity Preservation for Historical Waypoints', () => {
    it('preserves authoritative coordinates and entity identity for New Echota without substituting reverse geocoded locality', async () => {
      const historicalAnchor: MapMarker = {
        id: 'wp-new-echota',
        name: 'New Echota',
        lat: 34.5408,
        lng: -84.9100,
        type: 'historical_waypoint',
        country: 'United States',
        state: 'Georgia'
      };

      const resolved = await resolveGeographicMetadata(historicalAnchor);

      expect(resolved.name).toBe('New Echota');
      expect(resolved.lat).toBe(34.5408);
      expect(resolved.lng).toBe(-84.9100);
      expect(resolved.state).toBe('Georgia');
      expect(resolved.country).toBe('United States');
      expect(resolved.type).toBe('historical_waypoint');
      expect(resolved.metadataMode).toBe('historical_site');
    });
  });

  describe('2. Entity-First Query Generation & Scoring for Historical Images', () => {
    it('places canonical entity and historic site queries first in buildHistoricalImageQueries and avoids prose fragments', () => {
      const queries = buildHistoricalImageQueries({
        cleanLocationName: 'New Echota',
        exploration: 'Trail of Tears',
        region: 'Georgia',
        event: 'Treaty of New Echota',
        year: '1835',
        people: [],
        activities: [],
        artifacts: []
      });

      expect(queries[0]).toBe('New Echota');
      expect(queries[1]).toBe('New Echota historic site');
      expect(queries[2]).toBe('New Echota historic buildings');
      expect(queries[3]).toBe('New Echota archaeological site');
      expect(queries.some(q => q === 'New Echota Treaty of New Echota')).toBe(true);
      expect(queries.some(q => q.includes('It marks the beginning'))).toBe(false);
    });

    it('Scenario: New Echota - rejects generic event imagery, other state parks, and unrelated tribal removals while accepting genuine entity evidence', () => {
      const newEchotaEntity = {
        name: 'New Echota',
        canonicalName: 'New Echota',
        state: 'Georgia',
        country: 'United States',
        entityType: 'historical_site',
        isHistoricalWaypoint: true,
        routeContext: {
          title: 'Trail of Tears',
          exploration: 'Trail of Tears',
          cleanLocationName: 'New Echota',
          year: '1835'
        }
      };

      // 1. Genuine New Echota Historic Site
      const genuineNewEchota = {
        url: 'https://upload.wikimedia.org/new_echota_council_house.jpg',
        title: 'New Echota Supreme Court and Council House',
        description: 'Reconstructed buildings at New Echota Historic Site in Georgia, capital of the Cherokee Nation prior to the 1838 Trail of Tears.'
      };
      const res1 = validateImageCandidate(genuineNewEchota, newEchotaEntity);
      expect(res1.decision).toBe('ACCEPT');
      expect(res1.score).toBeGreaterThanOrEqual(70);

      // 2. Explicit New Echota Historical Map / Document
      const newEchotaMap = {
        url: 'https://upload.wikimedia.org/treaty_new_echota_map.jpg',
        title: '1835 Map of the Cherokee Lands at New Echota',
        description: 'Survey map illustrating the Cherokee territory surrounding New Echota at the time of the 1835 Treaty.'
      };
      const resMap = validateImageCandidate(newEchotaMap, newEchotaEntity);
      expect(resMap.decision).toBe('ACCEPT');
      expect(resMap.score).toBeGreaterThanOrEqual(75);

      // 3. Generic Trail of Tears Map (Lacking New Echota) -> REJECT
      const genericTrailMap = {
        url: 'https://upload.wikimedia.org/trail_of_tears_routes_map.jpg',
        title: 'Map of the Trail of Tears National Historic Trail',
        description: 'Overview cartography showing routes taken by the Cherokee, Creek, Chickasaw, Choctaw, and Seminole during Indian Removal.'
      };
      const resGenMap = validateImageCandidate(genericTrailMap, newEchotaEntity);
      expect(resGenMap.decision).toBe('REJECT');

      // 4. Cherokee Trail of Tears State Park (Missouri) -> REJECT
      const stateParkCandidate = {
        url: 'https://upload.wikimedia.org/cherokee_trail_of_tears_state_park.jpg',
        title: 'Cherokee Trail of Tears State Park, Missouri',
        description: 'Campgrounds and visitor center at Trail of Tears State Park in Cape Girardeau County, Missouri.'
      };
      const resPark = validateImageCandidate(stateParkCandidate, newEchotaEntity);
      expect(resPark.decision).toBe('REJECT');

      // 5. Choctaw Trail of Tears -> REJECT
      const choctawCandidate = {
        url: 'https://upload.wikimedia.org/choctaw_removal.jpg',
        title: 'Choctaw Trail of Tears Removal Painting',
        description: 'Historic painting depicting Choctaw families on their forced march during Indian Removal in Mississippi.'
      };
      const resChoctaw = validateImageCandidate(choctawCandidate, newEchotaEntity);
      expect(resChoctaw.decision).toBe('REJECT');
    });

    it('Scenario: Fort Cass (Tennessee) - accepts Fort Cass historical site / military depot imagery and rejects generic removal or Fort Gibson', () => {
      const fortCassEntity = {
        name: 'Fort Cass',
        canonicalName: 'Fort Cass',
        state: 'Tennessee',
        country: 'United States',
        entityType: 'historical_waypoint',
        isHistoricalWaypoint: true,
        routeContext: {
          title: 'Trail of Tears',
          exploration: 'Trail of Tears',
          cleanLocationName: 'Fort Cass',
          year: '1838'
        }
      };

      const validFortCass = {
        url: 'https://upload.wikimedia.org/fort_cass_headquarters.jpg',
        title: 'Fort Cass Military Headquarters Historic Site, Charleston TN',
        description: 'Historical marker and site of Fort Cass, the federal military headquarters and Cherokee internment encampment in Charleston, Tennessee.'
      };
      const resCass = validateImageCandidate(validFortCass, fortCassEntity);
      expect(resCass.decision).toBe('ACCEPT');

      const fortGibsonCandidate = {
        url: 'https://upload.wikimedia.org/fort_gibson_barracks.jpg',
        title: 'Fort Gibson Stockade and Barracks, Oklahoma',
        description: 'Reconstructed log stockade at Fort Gibson Historic Site in Oklahoma, destination point of the Cherokee removal.'
      };
      const resGibson = validateImageCandidate(fortGibsonCandidate, fortCassEntity);
      expect(resGibson.decision).toBe('REJECT');
    });

    it('Scenario: Independence Rock (Oregon Trail) - accepts Independence Rock landmark and rejects generic Oregon Trail highway or Pony Express', () => {
      const indepRockEntity = {
        name: 'Independence Rock',
        canonicalName: 'Independence Rock',
        state: 'Wyoming',
        country: 'United States',
        entityType: 'historical_waypoint',
        isHistoricalWaypoint: true,
        routeContext: {
          title: 'Oregon Trail',
          exploration: 'Oregon Trail',
          cleanLocationName: 'Independence Rock',
          year: '1845'
        }
      };

      const validRock = {
        url: 'https://upload.wikimedia.org/independence_rock_emigrants.jpg',
        title: 'Independence Rock with Emigrant Inscriptions',
        description: 'Historic granite rock along the Sweetwater River in Wyoming where Oregon Trail emigrants carved their names.'
      };
      const resRock = validateImageCandidate(validRock, indepRockEntity);
      expect(resRock.decision).toBe('ACCEPT');

      const genericOregonHighway = {
        url: 'https://upload.wikimedia.org/oregon_trail_highway.jpg',
        title: 'Oregon Trail Highway US Route 26',
        description: 'Modern paved highway following the historic pioneer route through Nebraska and Wyoming.'
      };
      const resHighway = validateImageCandidate(genericOregonHighway, indepRockEntity);
      expect(resHighway.decision).toBe('REJECT');
    });
  });

  describe('3. Trail of Tears End-to-End Coordinate, Entity Integrity & Route Grouping Suite', () => {
    it('rejects corrupted Tennessee coordinates for New Echota and repairs them to authoritative Georgia coordinates', async () => {
      const corruptedNewEchotaMarker: MapMarker = {
        id: 'wp-new-echota-corrupt',
        name: 'New Echota',
        lat: 35.6974,
        lng: -85.1280, // Tennessee coordinates
        type: 'historical_waypoint',
        country: 'United States',
        state: 'Georgia'
      };

      const resolved = await resolveGeographicMetadata(corruptedNewEchotaMarker);

      // Must be corrected to Georgia site
      expect(resolved.state).toBe('Georgia');
      expect(resolved.lat).toBeCloseTo(34.5408, 2);
      expect(resolved.lng).toBeCloseTo(-84.9100, 2);
    });

    it('validates and preserves distinct authoritative coordinates and entities for Fort Cass and Fort Gibson', async () => {
      const fortCassMarker: MapMarker = {
        id: 'wp-fort-cass',
        name: 'Fort Cass',
        lat: 35.2858,
        lng: -84.7578,
        type: 'historical_waypoint',
        country: 'United States',
        state: 'Tennessee'
      };

      const fortGibsonMarker: MapMarker = {
        id: 'wp-fort-gibson',
        name: 'Fort Gibson',
        lat: 35.7981,
        lng: -95.2497,
        type: 'historical_waypoint',
        country: 'United States',
        state: 'Oklahoma'
      };

      const resolvedCass = await resolveGeographicMetadata(fortCassMarker);
      const resolvedGibson = await resolveGeographicMetadata(fortGibsonMarker);

      expect(resolvedCass.name).toBe('Fort Cass');
      expect(resolvedCass.state).toBe('Tennessee');
      expect(resolvedCass.lat).toBeCloseTo(35.2858, 2);
      expect(resolvedCass.lng).toBeCloseTo(-84.7578, 2);

      expect(resolvedGibson.name).toBe('Fort Gibson');
      expect(resolvedGibson.state).toBe('Oklahoma');
      expect(resolvedGibson.lat).toBeCloseTo(35.7981, 2);
      expect(resolvedGibson.lng).toBeCloseTo(-95.2497, 2);

      // Must NOT have identical coordinates
      expect(resolvedCass.lat).not.toEqual(resolvedGibson.lat);
      expect(resolvedCass.lng).not.toEqual(resolvedGibson.lng);
    });

    it('validates and preserves Tahlequah authoritative location in Oklahoma', async () => {
      const tahlequahMarker: MapMarker = {
        id: 'wp-tahlequah',
        name: 'Tahlequah',
        lat: 35.9154,
        lng: -94.9700,
        type: 'historical_waypoint',
        country: 'United States',
        state: 'Oklahoma'
      };

      const resolvedTahlequah = await resolveGeographicMetadata(tahlequahMarker);

      expect(resolvedTahlequah.name).toBe('Tahlequah');
      expect(resolvedTahlequah.state).toBe('Oklahoma');
      expect(resolvedTahlequah.lat).toBeCloseTo(35.9154, 2);
      expect(resolvedTahlequah.lng).toBeCloseTo(-94.9700, 2);
    });

    it('end-to-end pipeline: repairs corrupted coordinates for Trail of Tears while strictly preserving sequence 1-4 and route groups', async () => {
      const mockRawTrailOfTears = async () => ({
        title: 'Trail of Tears',
        routeType: 'multi_location_campaign',
        routeEvidenceMode: 'MULTI_ROUTE_EVENT' as any,
        isSequential: false,
        routeGroups: [
          {
            id: 'northern-route',
            name: 'Northern Route',
            type: 'documented_route' as any,
            isSequential: true,
            description: 'Cherokee detachment route led by Evan Jones'
          },
          {
            id: 'benge-route',
            name: 'Benge Route',
            type: 'documented_route' as any,
            isSequential: true,
            description: 'Cherokee detachment route led by John Benge'
          }
        ],
        waypoints: [
          {
            id: 'wp-1',
            name: 'New Echota',
            canonicalName: 'New Echota',
            lat: 35.6974, // Corrupted Tennessee lat
            lng: -85.1280, // Corrupted Tennessee lng
            sequence: 1,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            significance: 'Capital of the Cherokee Nation prior to 1838'
          },
          {
            id: 'wp-2',
            name: 'Fort Cass',
            canonicalName: 'Fort Cass',
            lat: 35.7184, // Corrupted conflated Oklahoma lat
            lng: -96.2036, // Corrupted conflated Oklahoma lng
            sequence: 2,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            significance: 'Military removal headquarters in Tennessee'
          },
          {
            id: 'wp-3',
            name: 'Fort Gibson',
            canonicalName: 'Fort Gibson',
            lat: 35.7184, // Oklahoma terminus
            lng: -96.2036,
            sequence: 3,
            routeGroupId: 'northern-route',
            routeGroupName: 'Northern Route',
            role: 'primary',
            significance: 'Indian Territory destination post'
          },
          {
            id: 'wp-4',
            name: 'Tahlequah',
            canonicalName: 'Tahlequah',
            lat: 35.7896,
            lng: -94.1082,
            sequence: 1,
            routeGroupId: 'benge-route',
            routeGroupName: 'Benge Route',
            role: 'primary',
            significance: 'New Cherokee capital established in 1839'
          }
        ]
      });

      const pipelineResult = await runRoutePipeline(
        'Where did the trail of tears take place?',
        false,
        mockRawTrailOfTears as any,
        'HISTORICAL_EVENT'
      );

      expect(pipelineResult.waypoints).toHaveLength(4);

      const [newEchota, fortCass, fortGibson, tahlequah] = pipelineResult.waypoints;

      // 1. Waypoint 1: New Echota
      expect(newEchota.name).toBe('New Echota');
      expect(newEchota.lat).toBeCloseTo(34.5408, 2);
      expect(newEchota.lng).toBeCloseTo(-84.9100, 2);
      expect(newEchota.routeGroupId).toBe('northern-route');
      expect(newEchota.sequence).toBe(1);

      // 2. Waypoint 2: Fort Cass
      expect(fortCass.name).toBe('Fort Cass');
      expect(fortCass.lat).toBeCloseTo(35.2858, 2);
      expect(fortCass.lng).toBeCloseTo(-84.7578, 2);
      expect(fortCass.routeGroupId).toBe('northern-route');
      expect(fortCass.sequence).toBe(2);

      // 3. Waypoint 3: Fort Gibson
      expect(fortGibson.name).toBe('Fort Gibson');
      expect(fortGibson.lat).toBeCloseTo(35.7981, 2);
      expect(fortGibson.lng).toBeCloseTo(-95.2497, 2);
      expect(fortGibson.routeGroupId).toBe('northern-route');
      expect(fortGibson.sequence).toBe(3);

      // 4. Waypoint 4: Tahlequah
      expect(tahlequah.name).toBe('Tahlequah');
      expect(tahlequah.lat).toBeCloseTo(35.7094, 2);
      expect(tahlequah.lng).toBeCloseTo(-94.8216, 2);
      expect(tahlequah.routeGroupId).toBe('benge-route');
      expect(tahlequah.sequence).toBe(1);

      // Group structure verification
      expect(pipelineResult.routeGroups).toHaveLength(2);
      expect(pipelineResult.routeGroups![0].name).toBe('Northern Route');
      expect(pipelineResult.routeGroups![0].waypoints.map(w => w.name)).toEqual(['New Echota', 'Fort Cass', 'Fort Gibson']);
      expect(pipelineResult.routeGroups![1].name).toBe('Benge Route');
      expect(pipelineResult.routeGroups![1].waypoints.map(w => w.name)).toEqual(['Tahlequah']);
    });
  });

});
