import { GeoCoordinates, Waypoint, Route, RouteGroup } from '../../types';
import { latLngToVector3, vector3ToLatLng } from '../../utils/globeCoordinates';
import { calculateDistanceKm } from './geographicDistance';
import { isMaritimeHistoricalEntity } from './historicalCoordinateValidator';
import * as THREE from 'three';

export interface Polygon {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  vertices: Array<[number, number]>; // [lat, lng]
}

export interface WaterNode {
  id: string;
  lat: number;
  lng: number;
  neighbors: string[];
}

/**
 * Simplified Global Land Obstacle Polygons & Navigable Maritime Graph.
 *
 * Geographic Resolution & Design:
 * - Resolution: Macroscopic / continental scale (~50-100km vertex granularity).
 * - Intended Scope: Visual & geographic validity on TerraExplorer 3D globe and 2D map views
 *   to ensure connected maritime voyage segments remain over open water and navigate around
 *   continental landmasses, peninsulas (Iberia, Florida, Peloponnese, Malay, Horn of Africa),
 *   and major islands (Great Britain, Ireland, Madagascar, Greenland, Japan, Cuba) rather than
 *   drawing direct straight lines across land.
 * - Limitations: Not intended for high-resolution inshore harbor navigation or bathymetric depth routing.
 *   Estuary/port approach segments connect the nearest maritime approach node directly to the coastal port.
 * - Offline Determinism: Requires zero network calls or external routing APIs.
 */
export const GLOBAL_LAND_POLYGONS: Polygon[] = [
  // 1. AFRICA
  {
    name: 'Africa',
    minLat: -34.85,
    maxLat: 37.35,
    minLng: -17.55,
    maxLng: 51.45,
    vertices: [
      [37.1, 9.9], [36.8, 11.0], [35.8, 10.6], [33.9, 10.1], [32.9, 13.2],
      [31.2, 16.5], [32.2, 20.1], [32.8, 22.0], [31.6, 25.1], [31.3, 30.0],
      [31.3, 32.3], [29.9, 32.5], [27.8, 34.3], [23.9, 35.5], [20.0, 37.2],
      [15.6, 39.5], [12.8, 43.0], [11.8, 43.3], [11.6, 51.2], [10.4, 51.3],
      [7.8, 49.8], [5.3, 48.5], [2.0, 45.3], [-0.5, 42.6], [-4.0, 39.7],
      [-7.0, 39.5], [-10.7, 40.6], [-15.2, 40.5], [-19.8, 36.0], [-25.9, 32.6],
      [-28.7, 32.2], [-32.0, 29.0], [-33.9, 25.6], [-34.8, 20.0], [-34.4, 18.5],
      [-33.0, 17.9], [-28.6, 16.5], [-22.5, 14.4], [-16.5, 11.8], [-12.3, 13.6],
      [-6.0, 12.3], [-4.5, 11.8], [1.0, 9.5], [4.5, 8.5], [4.0, 6.0],
      [5.5, 0.0], [5.0, -3.0], [4.3, -7.5], [6.3, -10.5], [7.5, -12.5],
      [9.5, -13.7], [12.0, -16.0], [14.7, -17.5], [16.0, -16.5], [20.8, -17.0],
      [23.5, -16.0], [28.0, -12.5], [30.5, -9.8], [33.6, -7.5], [35.8, -5.9],
      [35.9, -5.3], [35.2, -3.0], [35.7, -0.5], [36.9, 3.8], [36.9, 7.8],
      [37.1, 9.9]
    ]
  },

  // 2. SOUTH AMERICA
  {
    name: 'South America',
    minLat: -54.0,
    maxLat: 12.5,
    minLng: -81.4,
    maxLng: -34.5,
    vertices: [
      [12.4, -71.7], [11.7, -72.6], [10.5, -75.5], [8.9, -77.3], [7.2, -77.9],
      [4.0, -77.4], [1.0, -79.0], [-1.5, -80.8], [-4.7, -81.3], [-6.0, -81.1],
      [-9.0, -78.6], [-13.7, -76.3], [-17.0, -72.0], [-23.6, -70.4], [-30.0, -71.4],
      [-33.0, -71.6], [-36.8, -73.1], [-41.5, -73.0], [-46.0, -75.0], [-50.0, -75.0],
      [-52.5, -74.5], [-53.5, -73.0], [-53.8, -71.3], [-53.0, -70.95], [-52.65, -70.4],
      [-52.42, -69.6], [-52.25, -68.35], [-51.6, -68.8], [-47.0, -65.5],
      [-42.5, -64.0], [-39.0, -62.0], [-36.0, -57.0], [-34.5, -58.4], [-34.8, -54.0],
      [-32.0, -52.0], [-27.5, -48.5], [-23.0, -43.2], [-21.5, -41.0], [-18.0, -39.5],
      [-13.0, -38.5], [-8.0, -34.9], [-5.0, -35.3], [-2.5, -44.2], [-0.5, -50.0],
      [2.0, -50.5], [4.5, -51.5], [5.8, -55.2], [7.0, -58.5], [8.5, -60.0],
      [10.6, -61.7], [10.5, -67.0], [11.5, -69.8], [12.4, -71.7]
    ]
  },

  // 2b. TIERRA DEL FUEGO
  {
    name: 'Tierra del Fuego',
    minLat: -56.0,
    maxLat: -52.6,
    minLng: -71.5,
    maxLng: -65.0,
    vertices: [
      [-52.65, -68.55], [-52.75, -69.6], [-53.4, -70.3], [-54.0, -70.4],
      [-55.0, -69.0], [-55.9, -67.3], [-54.8, -65.0], [-53.5, -67.5], [-52.65, -68.55]
    ]
  },

  // 3. NORTH AMERICA
  {
    name: 'North America',
    minLat: 7.2,
    maxLat: 72.0,
    minLng: -168.0,
    maxLng: -52.6,
    vertices: [
      [8.0, -77.5], [9.5, -79.0], [8.5, -83.0], [10.0, -85.8], [13.5, -87.5],
      [16.0, -88.5], [18.5, -88.0], [21.5, -87.0], [20.5, -90.5], [18.5, -92.5],
      [19.0, -96.0], [22.0, -97.8], [26.0, -97.2], [29.0, -95.0], [29.5, -89.5],
      [30.4, -87.0], [29.8, -84.0], [25.0, -80.5], [28.5, -80.5], [32.0, -81.0],
      [35.0, -75.5], [39.0, -74.5], [40.4, -74.1], [40.75, -73.8], [41.0, -71.9],
      [42.0, -70.0], [42.5, -70.8], [44.5, -66.0], [45.0, -61.0], [47.0, -60.5],
      [49.0, -64.5], [49.5, -67.0], [53.5, -56.0],
      [58.0, -62.5], [60.5, -64.5], [62.5, -78.0], [58.5, -80.0], [52.0, -80.0],
      [55.0, -88.0], [59.0, -94.5], [64.0, -90.0], [68.0, -85.0],
      // Canadian Arctic Mainland Coast (along Queen Maud Gulf / Coronation Gulf / Mackenzie)
      [71.9, -95.0], // Boothia Peninsula
      [67.8, -96.0], // Chantrey Inlet / Simpson Strait
      [67.5, -102.0], // Queen Maud Gulf mainland
      [66.8, -108.0], // Bathurst Inlet
      [68.0, -114.0], // Coronation Gulf mainland
      [69.0, -117.0], // Dolphin and Union Strait
      [69.3, -124.0], // Amundsen Gulf mainland / Darnley Bay
      [69.4, -133.0], // Mackenzie Delta / Tuktoyaktuk
      [69.6, -141.0], // Yukon/Alaska Arctic Coast
      [70.5, -148.0], // Prudhoe Bay
      [71.3, -156.5], // Point Barrow
      [66.0, -168.0], [64.5, -165.0],
      [59.0, -162.0], [55.0, -163.0], [57.0, -154.0], [60.0, -148.0], [59.0, -140.0],
      [56.0, -132.0], [51.0, -128.0], [49.0, -125.0], [46.0, -124.0], [38.0, -123.0],
      [34.0, -119.5], [32.5, -117.0], [28.0, -114.0], [23.0, -110.0], [24.0, -107.5],
      [20.5, -105.5], [16.0, -98.0], [15.0, -93.0], [13.5, -89.0], [9.0, -84.0],
      [7.2, -81.0], [8.0, -77.5]
    ]
  },

  // 4. EURASIA (Europe & Asia)
  {
    name: 'Eurasia',
    minLat: 1.2,
    maxLat: 77.5,
    minLng: -9.5,
    maxLng: 170.0,
    vertices: [
      [36.0, -5.6], [37.0, -9.0], [43.0, -9.3], [43.8, -8.0], [43.5, -1.8],
      [47.0, -2.5], [48.5, -4.7], [49.5, -1.5], [50.0, 1.0], [50.9, 1.7],
      [51.5, 3.5], [53.5, 6.0], [54.0, 8.5], [57.0, 10.0], [55.5, 12.0],
      [54.0, 14.0], [54.5, 19.0], [59.0, 24.0], [60.0, 30.0], [65.0, 25.0],
      [70.0, 28.0], [71.0, 26.0], [68.0, 40.0], [68.5, 50.0], [70.0, 60.0],
      [73.0, 70.0], [76.5, 95.0], [77.5, 105.0], [73.0, 130.0], [71.0, 150.0],
      [67.0, 170.0], [65.0, 175.0], [60.0, 163.0], [53.0, 158.0], [51.0, 143.0],
      [43.0, 132.0], [39.0, 124.0], [37.0, 126.0], [35.0, 129.0], [38.0, 128.5],
      [39.0, 118.0], [35.0, 119.5], [31.5, 121.5], [28.0, 121.0], [24.5, 118.5],
      [22.3, 114.2], [21.5, 108.5], [16.0, 108.0], [10.5, 107.5], [8.5, 104.5],
      [10.0, 99.0], [6.0, 102.0], [1.3, 103.8], [2.2, 102.2], [3.1, 101.3],
      [5.4, 100.3], [8.0, 98.3], [13.0, 100.5], [15.0, 96.0], [20.0, 93.0],
      [22.0, 91.5], [21.5, 87.0], [16.0, 81.5], [13.0, 80.3], [8.1, 77.5],
      [10.0, 76.0], [15.0, 73.8], [19.0, 72.8], [23.0, 68.5], [25.0, 66.5],
      [25.0, 61.5], [27.0, 56.5], [29.0, 51.0], [30.0, 48.5], [28.0, 49.0],
      [26.0, 50.5], [24.5, 54.5], [24.0, 56.5], [22.5, 59.5], [17.0, 54.0],
      [13.0, 45.0], [12.7, 43.5], [15.0, 42.0], [22.0, 39.0], [28.0, 34.5],
      [29.5, 32.5], [31.0, 34.5], [33.5, 35.0], [36.5, 36.0], [36.5, 31.0],
      [37.0, 27.5], [40.0, 26.5], [41.0, 29.0], [42.0, 28.0], [44.5, 29.0],
      [46.5, 31.0], [45.0, 35.0], [44.0, 39.0], [41.5, 41.5], [40.5, 23.0],
      [38.0, 24.0], [36.5, 22.5], [39.0, 20.0], [42.0, 18.5], [45.5, 13.5],
      [44.0, 12.5], [41.0, 15.0], [40.0, 18.0], [38.0, 16.0], [39.0, 16.0],
      [41.0, 13.5], [43.5, 10.3], [44.4, 9.0], [44.3, 8.5], [43.5, 7.0],
      [43.0, 3.0], [41.5, 2.0], [38.5, -0.2], [36.8, -2.5], [36.0, -5.6]
    ]
  },

  // 5. AUSTRALIA
  {
    name: 'Australia',
    minLat: -39.2,
    maxLat: -10.5,
    minLng: 113.0,
    maxLng: 153.7,
    vertices: [
      [-10.7, 142.5], [-14.5, 144.5], [-19.0, 146.5], [-24.0, 151.5], [-28.2, 153.6],
      [-33.9, 151.2], [-37.5, 150.0], [-39.0, 146.5], [-38.5, 143.0], [-36.0, 139.5],
      [-35.0, 136.0], [-32.0, 132.5], [-31.5, 128.0], [-34.0, 123.0], [-35.0, 117.5],
      [-34.3, 115.1], [-31.9, 115.8], [-28.8, 114.6], [-25.0, 113.1], [-21.8, 114.1],
      [-20.0, 119.0], [-18.0, 122.0], [-15.0, 125.0], [-12.5, 131.0], [-12.0, 136.5],
      [-16.0, 139.0], [-14.0, 141.5], [-10.7, 142.5]
    ]
  },

  // 6. GREAT BRITAIN
  {
    name: 'Great Britain',
    minLat: 49.9,
    maxLat: 58.7,
    minLng: -6.0,
    maxLng: 1.8,
    vertices: [
      [50.0, -5.2], [50.4, -4.1], [50.7, -1.9], [51.15, 1.3], [51.38, 1.44],
      [51.44, 0.75], [51.44, 0.28], [51.50, 0.28], [51.53, 0.85], [51.80, 1.25],
      [52.48, 1.76], [52.95, 1.30], [52.90, 0.35], [53.55, 0.05], [53.65, 0.10],
      [54.12, -0.08], [54.70, -1.15], [55.77, -1.99], [56.05, -2.75], [56.45, -2.60],
      [57.50, -1.78], [57.68, -2.00], [58.64, -3.07], [58.60, -5.00],
      [57.0, -5.8], [55.5, -5.0], [54.0, -3.0], [53.3, -4.5], [51.6, -5.0],
      [50.1, -5.7], [50.0, -5.2]
    ]
  },

  // 7. IRELAND
  {
    name: 'Ireland',
    minLat: 51.4,
    maxLat: 55.4,
    minLng: -10.5,
    maxLng: -5.9,
    vertices: [
      [51.4, -9.5], [51.8, -8.0], [52.2, -6.3], [53.4, -6.0], [54.5, -5.6],
      [55.3, -6.9], [55.2, -8.5], [54.2, -10.0], [53.2, -9.9], [52.0, -10.3],
      [51.4, -9.5]
    ]
  },

  // 8. MADAGASCAR
  {
    name: 'Madagascar',
    minLat: -25.6,
    maxLat: -11.9,
    minLng: 43.2,
    maxLng: 50.5,
    vertices: [
      [-12.0, 49.3], [-15.5, 50.5], [-20.0, 48.7], [-25.2, 47.0], [-25.6, 45.2],
      [-22.0, 43.3], [-16.0, 44.4], [-12.0, 49.3]
    ]
  },

  // 9. GREENLAND
  {
    name: 'Greenland',
    minLat: 59.8,
    maxLat: 83.6,
    minLng: -73.0,
    maxLng: -12.0,
    vertices: [
      [60.0, -44.0], [65.0, -40.0], [70.0, -22.0], [77.0, -18.0], [82.0, -25.0],
      [83.0, -35.0], [80.0, -60.0], [75.0, -60.0], [70.0, -54.0], [65.0, -52.0],
      [60.0, -45.0], [60.0, -44.0]
    ]
  },

  // 10. JAPAN (Main Island / Honshu)
  {
    name: 'Japan',
    minLat: 31.0,
    maxLat: 45.5,
    minLng: 130.0,
    maxLng: 146.0,
    vertices: [
      [31.2, 130.5], [33.5, 135.0], [35.0, 139.0], [36.0, 140.5], [39.0, 142.0],
      [41.5, 141.0], [44.0, 145.0], [45.5, 142.0], [43.0, 140.0], [40.5, 139.8],
      [37.5, 137.0], [35.5, 133.0], [34.0, 131.0], [31.2, 130.5]
    ]
  },

  // 11. CUBA
  {
    name: 'Cuba',
    minLat: 19.8,
    maxLat: 23.3,
    minLng: -85.0,
    maxLng: -74.1,
    vertices: [
      [22.0, -84.9], [23.1, -82.4], [23.2, -80.5], [21.5, -77.0], [20.2, -74.2],
      [19.9, -75.8], [20.0, -77.5], [21.8, -80.0], [22.0, -84.9]
    ]
  }
];

/**
 * Standard global ocean navigation graph nodes.
 * Key open ocean intersections, straits, capes, and maritime hubs.
 */
export const GLOBAL_WATER_NODES: Record<string, WaterNode> = {
  // English Channel, Thames Estuary & North Sea
  'plymouth_offshore': { id: 'plymouth_offshore', lat: 50.1, lng: -4.3, neighbors: ['english_channel_west', 'lands_end_clearance'] },
  'lands_end_clearance': { id: 'lands_end_clearance', lat: 49.8, lng: -6.0, neighbors: ['plymouth_offshore', 'celtic_sea', 'english_channel_west'] },
  'english_channel_west': { id: 'english_channel_west', lat: 49.5, lng: -4.0, neighbors: ['plymouth_offshore', 'lands_end_clearance', 'bay_of_biscay_north', 'north_atlantic_ne', 'celtic_sea', 'dover_strait'] },
  'dover_strait': { id: 'dover_strait', lat: 51.1, lng: 1.55, neighbors: ['english_channel_west', 'north_sea_south', 'thames_north_sea_gateway'] },
  'thames_greenhithe': { id: 'thames_greenhithe', lat: 51.46, lng: 0.32, neighbors: ['thames_estuary_southend'] },
  'thames_estuary_southend': { id: 'thames_estuary_southend', lat: 51.51, lng: 0.80, neighbors: ['thames_greenhithe', 'thames_estuary_outer'] },
  'thames_estuary_outer': { id: 'thames_estuary_outer', lat: 51.52, lng: 1.25, neighbors: ['thames_estuary_southend', 'thames_north_sea_gateway'] },
  'thames_north_sea_gateway': { id: 'thames_north_sea_gateway', lat: 51.75, lng: 1.70, neighbors: ['thames_estuary_outer', 'dover_strait', 'east_anglia_offshore', 'north_sea_south'] },
  'east_anglia_offshore': { id: 'east_anglia_offshore', lat: 52.60, lng: 2.10, neighbors: ['thames_north_sea_gateway', 'north_sea_south', 'north_sea_humber_offshore'] },
  'north_sea_humber_offshore': { id: 'north_sea_humber_offshore', lat: 53.80, lng: 1.20, neighbors: ['east_anglia_offshore', 'north_sea_south', 'north_sea_central', 'scotland_east_offshore'] },
  'north_sea_south': { id: 'north_sea_south', lat: 54.0, lng: 3.5, neighbors: ['dover_strait', 'skagerrak', 'north_sea_central', 'hamburg_approach', 'thames_north_sea_gateway', 'east_anglia_offshore', 'north_sea_humber_offshore'] },
  'hamburg_approach': { id: 'hamburg_approach', lat: 54.0, lng: 8.0, neighbors: ['north_sea_south'] },
  'north_sea_central': { id: 'north_sea_central', lat: 57.0, lng: 2.0, neighbors: ['north_sea_south', 'north_sea_humber_offshore', 'scotland_east_offshore', 'buchan_offshore', 'orkney_east_approach'] },
  'scotland_east_offshore': { id: 'scotland_east_offshore', lat: 56.50, lng: -1.20, neighbors: ['north_sea_humber_offshore', 'north_sea_central', 'buchan_offshore'] },
  'buchan_offshore': { id: 'buchan_offshore', lat: 57.70, lng: -1.40, neighbors: ['scotland_east_offshore', 'north_sea_central', 'orkney_east_approach'] },
  'orkney_east_approach': { id: 'orkney_east_approach', lat: 58.85, lng: -2.30, neighbors: ['buchan_offshore', 'north_sea_central', 'scotland_north'] },
  'skagerrak': { id: 'skagerrak', lat: 57.8, lng: 9.0, neighbors: ['north_sea_south', 'kattegat'] },
  'kattegat': { id: 'kattegat', lat: 56.5, lng: 11.8, neighbors: ['skagerrak', 'baltic_west'] },
  'baltic_west': { id: 'baltic_west', lat: 55.0, lng: 14.5, neighbors: ['kattegat'] },
  'scotland_north': { id: 'scotland_north', lat: 59.0, lng: -4.5, neighbors: ['orkney_east_approach', 'hebrides_west'] },
  'hebrides_west': { id: 'hebrides_west', lat: 57.5, lng: -10.5, neighbors: ['scotland_north', 'ireland_west_offshore', 'greenland_south_cape_farewell'] },
  'ireland_west_offshore': { id: 'ireland_west_offshore', lat: 53.5, lng: -11.5, neighbors: ['hebrides_west', 'ireland_southwest_offshore'] },
  'ireland_southwest_offshore': { id: 'ireland_southwest_offshore', lat: 51.0, lng: -11.0, neighbors: ['ireland_west_offshore', 'celtic_sea'] },
  'celtic_sea': { id: 'celtic_sea', lat: 50.5, lng: -8.5, neighbors: ['lands_end_clearance', 'ireland_southwest_offshore', 'english_channel_west', 'north_atlantic_ne'] },

  // Atlantic Ocean (East & West)
  'bay_of_biscay_north': { id: 'bay_of_biscay_north', lat: 46.5, lng: -6.5, neighbors: ['english_channel_west', 'cape_finisterre_offshore'] },
  'cape_finisterre_offshore': { id: 'cape_finisterre_offshore', lat: 43.5, lng: -10.5, neighbors: ['bay_of_biscay_north', 'lisbon_offshore', 'north_atlantic_ne'] },
  'lisbon_offshore': { id: 'lisbon_offshore', lat: 38.5, lng: -10.5, neighbors: ['cape_finisterre_offshore', 'cape_st_vincent_offshore', 'canary_islands_north'] },
  'cape_st_vincent_offshore': { id: 'cape_st_vincent_offshore', lat: 36.8, lng: -9.5, neighbors: ['lisbon_offshore', 'gibraltar_west', 'canary_islands_north', 'casablanca_offshore'] },
  'gibraltar_west': { id: 'gibraltar_west', lat: 36.0, lng: -7.0, neighbors: ['cape_st_vincent_offshore', 'gibraltar_strait', 'casablanca_offshore'] },
  'gibraltar_strait': { id: 'gibraltar_strait', lat: 35.9, lng: -5.6, neighbors: ['gibraltar_west', 'alboran_sea'] },
  'casablanca_offshore': { id: 'casablanca_offshore', lat: 33.8, lng: -9.5, neighbors: ['gibraltar_west', 'cape_st_vincent_offshore', 'canary_islands_north'] },
  'canary_islands_north': { id: 'canary_islands_north', lat: 28.5, lng: -16.0, neighbors: ['lisbon_offshore', 'cape_st_vincent_offshore', 'casablanca_offshore', 'cape_verde_north', 'mid_atlantic_north'] },
  'cape_verde_north': { id: 'cape_verde_north', lat: 17.0, lng: -25.0, neighbors: ['canary_islands_north', 'equatorial_atlantic_central', 'west_africa_bulge_offshore', 'brazil_recife_offshore'] },
  'west_africa_bulge_offshore': { id: 'west_africa_bulge_offshore', lat: 3.0, lng: -10.0, neighbors: ['cape_verde_north', 'west_africa_gulf_guinea', 'equatorial_atlantic_central'] },
  'west_africa_gulf_guinea': { id: 'west_africa_gulf_guinea', lat: 2.0, lng: 4.0, neighbors: ['west_africa_bulge_offshore', 'equatorial_atlantic_central', 'angola_offshore'] },
  'angola_offshore': { id: 'angola_offshore', lat: -10.0, lng: 11.0, neighbors: ['west_africa_gulf_guinea', 'namibia_offshore', 'south_atlantic_central'] },
  'namibia_offshore': { id: 'namibia_offshore', lat: -25.0, lng: 12.0, neighbors: ['angola_offshore', 'cape_good_hope_west'] },
  'cape_good_hope_west': { id: 'cape_good_hope_west', lat: -35.0, lng: 16.0, neighbors: ['namibia_offshore', 'cape_good_hope_south', 'south_atlantic_central'] },
  'cape_good_hope_south': { id: 'cape_good_hope_south', lat: -36.5, lng: 20.0, neighbors: ['cape_good_hope_west', 'durban_offshore', 'southern_ocean_atlantic'] },
  'durban_offshore': { id: 'durban_offshore', lat: -31.0, lng: 32.0, neighbors: ['cape_good_hope_south', 'mozambique_channel_south', 'madagascar_south'] },

  // Mediterranean Sea
  'alboran_sea': { id: 'alboran_sea', lat: 36.2, lng: -3.0, neighbors: ['gibraltar_strait', 'mediterranean_west', 'valencia_offshore'] },
  'valencia_offshore': { id: 'valencia_offshore', lat: 38.5, lng: 0.5, neighbors: ['alboran_sea', 'balearic_sea', 'mediterranean_west'] },
  'balearic_sea': { id: 'balearic_sea', lat: 40.5, lng: 3.5, neighbors: ['valencia_offshore', 'mediterranean_west', 'ligurian_sea'] },
  'ligurian_sea': { id: 'ligurian_sea', lat: 43.5, lng: 8.8, neighbors: ['balearic_sea', 'mediterranean_west', 'tyrrhenian_sea'] },
  'mediterranean_west': { id: 'mediterranean_west', lat: 38.0, lng: 3.5, neighbors: ['alboran_sea', 'valencia_offshore', 'balearic_sea', 'ligurian_sea', 'tyrrhenian_sea', 'tunisia_north_clearance'] },
  'tunisia_north_clearance': { id: 'tunisia_north_clearance', lat: 38.2, lng: 10.5, neighbors: ['mediterranean_west', 'sicily_strait', 'tyrrhenian_sea'] },
  'tyrrhenian_sea': { id: 'tyrrhenian_sea', lat: 40.0, lng: 12.0, neighbors: ['ligurian_sea', 'mediterranean_west', 'tunisia_north_clearance', 'sicily_strait'] },
  'sicily_strait': { id: 'sicily_strait', lat: 36.5, lng: 13.0, neighbors: ['tunisia_north_clearance', 'tyrrhenian_sea', 'mediterranean_central', 'ionian_sea'] },
  'mediterranean_central': { id: 'mediterranean_central', lat: 34.5, lng: 18.0, neighbors: ['sicily_strait', 'ionian_sea', 'mediterranean_east'] },
  'ionian_sea': { id: 'ionian_sea', lat: 37.5, lng: 19.5, neighbors: ['sicily_strait', 'mediterranean_central', 'crete_south'] },
  'crete_south': { id: 'crete_south', lat: 34.5, lng: 24.5, neighbors: ['ionian_sea', 'aegean_sea', 'mediterranean_east'] },
  'aegean_sea': { id: 'aegean_sea', lat: 37.5, lng: 25.5, neighbors: ['crete_south', 'mediterranean_east'] },
  'mediterranean_east': { id: 'mediterranean_east', lat: 33.5, lng: 30.0, neighbors: ['mediterranean_central', 'crete_south', 'aegean_sea', 'port_said_offshore'] },
  'port_said_offshore': { id: 'port_said_offshore', lat: 31.8, lng: 32.5, neighbors: ['mediterranean_east'] },

  // Red Sea & Middle East
  'red_sea_north': { id: 'red_sea_north', lat: 27.5, lng: 34.5, neighbors: ['red_sea_central'] },
  'red_sea_central': { id: 'red_sea_central', lat: 20.0, lng: 38.5, neighbors: ['red_sea_north', 'bab_el_mandeb'] },
  'bab_el_mandeb': { id: 'bab_el_mandeb', lat: 12.6, lng: 43.4, neighbors: ['red_sea_central', 'gulf_of_aden'] },
  'gulf_of_aden': { id: 'gulf_of_aden', lat: 12.0, lng: 48.0, neighbors: ['bab_el_mandeb', 'horn_of_africa_offshore', 'socotra_north'] },
  'horn_of_africa_offshore': { id: 'horn_of_africa_offshore', lat: 12.0, lng: 52.5, neighbors: ['gulf_of_aden', 'somalia_offshore', 'socotra_north', 'arabian_sea_west'] },
  'somalia_offshore': { id: 'somalia_offshore', lat: 4.0, lng: 49.0, neighbors: ['horn_of_africa_offshore', 'east_africa_central'] },
  'socotra_north': { id: 'socotra_north', lat: 13.5, lng: 54.0, neighbors: ['gulf_of_aden', 'horn_of_africa_offshore', 'arabian_sea_west', 'arabian_sea_central'] },
  'strait_of_hormuz': { id: 'strait_of_hormuz', lat: 26.5, lng: 56.5, neighbors: ['gulf_of_oman', 'persian_gulf_central'] },
  'persian_gulf_central': { id: 'persian_gulf_central', lat: 27.5, lng: 51.5, neighbors: ['strait_of_hormuz'] },
  'gulf_of_oman': { id: 'gulf_of_oman', lat: 24.5, lng: 59.0, neighbors: ['strait_of_hormuz', 'ras_al_hadd_offshore', 'arabian_sea_north'] },
  'ras_al_hadd_offshore': { id: 'ras_al_hadd_offshore', lat: 22.5, lng: 60.5, neighbors: ['gulf_of_oman', 'arabian_sea_west'] },

  // Indian Ocean
  'arabian_sea_west': { id: 'arabian_sea_west', lat: 18.0, lng: 59.0, neighbors: ['horn_of_africa_offshore', 'ras_al_hadd_offshore', 'socotra_north', 'arabian_sea_central'] },
  'arabian_sea_north': { id: 'arabian_sea_north', lat: 22.0, lng: 66.0, neighbors: ['gulf_of_oman', 'mumbai_offshore'] },
  'arabian_sea_central': { id: 'arabian_sea_central', lat: 12.0, lng: 65.0, neighbors: ['socotra_north', 'arabian_sea_west', 'mumbai_offshore', 'india_southwest_offshore', 'equatorial_indian_ocean'] },
  'mumbai_offshore': { id: 'mumbai_offshore', lat: 18.5, lng: 71.5, neighbors: ['arabian_sea_north', 'arabian_sea_central', 'india_southwest_offshore'] },
  'india_southwest_offshore': { id: 'india_southwest_offshore', lat: 8.0, lng: 75.0, neighbors: ['mumbai_offshore', 'arabian_sea_central', 'sri_lanka_south'] },
  'sri_lanka_south': { id: 'sri_lanka_south', lat: 5.5, lng: 80.5, neighbors: ['india_southwest_offshore', 'bay_of_bengal_central', 'malacca_north', 'equatorial_indian_ocean'] },
  'bay_of_bengal_central': { id: 'bay_of_bengal_central', lat: 14.0, lng: 87.0, neighbors: ['sri_lanka_south', 'kolkata_offshore', 'andaman_sea'] },
  'kolkata_offshore': { id: 'kolkata_offshore', lat: 20.5, lng: 89.0, neighbors: ['bay_of_bengal_central'] },
  'andaman_sea': { id: 'andaman_sea', lat: 10.0, lng: 96.0, neighbors: ['bay_of_bengal_central', 'malacca_north'] },
  'malacca_north': { id: 'malacca_north', lat: 5.5, lng: 97.5, neighbors: ['sri_lanka_south', 'andaman_sea', 'malacca_strait_central'] },
  'malacca_strait_central': { id: 'malacca_strait_central', lat: 2.8, lng: 101.2, neighbors: ['malacca_north', 'malacca_south'] },
  'malacca_south': { id: 'malacca_south', lat: 1.8, lng: 102.5, neighbors: ['malacca_strait_central', 'johor_southwest_clearance'] },
  'johor_southwest_clearance': { id: 'johor_southwest_clearance', lat: 1.3, lng: 103.4, neighbors: ['malacca_south', 'singapore_strait'] },
  'singapore_strait': { id: 'singapore_strait', lat: 1.2, lng: 103.9, neighbors: ['johor_southwest_clearance', 'south_china_sea_south', 'sunda_strait_north'] },
  'sunda_strait_north': { id: 'sunda_strait_north', lat: -5.5, lng: 106.0, neighbors: ['singapore_strait', 'sunda_strait_south'] },
  'sunda_strait_south': { id: 'sunda_strait_south', lat: -7.0, lng: 105.0, neighbors: ['sunda_strait_north', 'equatorial_indian_ocean', 'australia_northwest'] },
  'equatorial_indian_ocean': { id: 'equatorial_indian_ocean', lat: -5.0, lng: 75.0, neighbors: ['sri_lanka_south', 'arabian_sea_central', 'madagascar_north', 'sunda_strait_south', 'mid_indian_ocean'] },
  'mozambique_channel_south': { id: 'mozambique_channel_south', lat: -22.0, lng: 38.0, neighbors: ['durban_offshore', 'mozambique_channel_north', 'madagascar_south'] },
  'mozambique_channel_north': { id: 'mozambique_channel_north', lat: -13.0, lng: 42.0, neighbors: ['mozambique_channel_south', 'madagascar_north', 'east_africa_central'] },
  'east_africa_central': { id: 'east_africa_central', lat: -4.0, lng: 41.0, neighbors: ['mozambique_channel_north', 'somalia_offshore', 'madagascar_north'] },
  'madagascar_north': { id: 'madagascar_north', lat: -10.0, lng: 52.0, neighbors: ['mozambique_channel_north', 'east_africa_central', 'equatorial_indian_ocean', 'mauritius_offshore'] },
  'madagascar_south': { id: 'madagascar_south', lat: -27.0, lng: 48.0, neighbors: ['durban_offshore', 'mozambique_channel_south', 'mauritius_offshore', 'mid_indian_ocean'] },
  'mauritius_offshore': { id: 'mauritius_offshore', lat: -20.0, lng: 58.0, neighbors: ['madagascar_north', 'madagascar_south', 'mid_indian_ocean'] },
  'mid_indian_ocean': { id: 'mid_indian_ocean', lat: -25.0, lng: 80.0, neighbors: ['equatorial_indian_ocean', 'mauritius_offshore', 'madagascar_south', 'australia_west'] },
  'australia_northwest': { id: 'australia_northwest', lat: -18.0, lng: 115.0, neighbors: ['sunda_strait_south', 'shark_bay_offshore', 'timor_sea'] },
  'shark_bay_offshore': { id: 'shark_bay_offshore', lat: -25.0, lng: 111.0, neighbors: ['australia_northwest', 'australia_west'] },
  'australia_west': { id: 'australia_west', lat: -32.0, lng: 112.0, neighbors: ['mid_indian_ocean', 'shark_bay_offshore', 'cape_leeuwin_south'] },
  'cape_leeuwin_south': { id: 'cape_leeuwin_south', lat: -36.0, lng: 115.0, neighbors: ['australia_west', 'great_australian_bight'] },
  'great_australian_bight': { id: 'great_australian_bight', lat: -38.0, lng: 130.0, neighbors: ['cape_leeuwin_south', 'bass_strait_west'] },
  'bass_strait_west': { id: 'bass_strait_west', lat: -39.5, lng: 143.0, neighbors: ['great_australian_bight', 'bass_strait_east'] },
  'bass_strait_east': { id: 'bass_strait_east', lat: -39.0, lng: 148.5, neighbors: ['bass_strait_west', 'cape_howe_offshore', 'tasman_sea_central'] },
  'cape_howe_offshore': { id: 'cape_howe_offshore', lat: -38.0, lng: 151.5, neighbors: ['bass_strait_east', 'sydney_offshore'] },

  // Western Atlantic / Americas East Coast / Caribbean
  'north_atlantic_ne': { id: 'north_atlantic_ne', lat: 48.0, lng: -20.0, neighbors: ['english_channel_west', 'celtic_sea', 'cape_finisterre_offshore', 'mid_atlantic_north', 'newfoundland_east'] },
  'mid_atlantic_north': { id: 'mid_atlantic_north', lat: 35.0, lng: -40.0, neighbors: ['north_atlantic_ne', 'canary_islands_north', 'bermuda_east', 'equatorial_atlantic_central'] },
  'equatorial_atlantic_central': { id: 'equatorial_atlantic_central', lat: 0.0, lng: -30.0, neighbors: ['cape_verde_north', 'mid_atlantic_north', 'west_africa_bulge_offshore', 'brazil_recife_offshore', 'south_atlantic_central'] },
  'south_atlantic_central': { id: 'south_atlantic_central', lat: -25.0, lng: -20.0, neighbors: ['equatorial_atlantic_central', 'angola_offshore', 'cape_good_hope_west', 'rio_de_janeiro_offshore', 'tristan_da_cunha'] },
  'tristan_da_cunha': { id: 'tristan_da_cunha', lat: -37.0, lng: -12.0, neighbors: ['south_atlantic_central', 'cape_good_hope_west', 'southern_ocean_atlantic', 'south_georgia_north'] },
  'southern_ocean_atlantic': { id: 'southern_ocean_atlantic', lat: -50.0, lng: 0.0, neighbors: ['cape_good_hope_south', 'tristan_da_cunha', 'south_georgia_north'] },
  'brazil_recife_offshore': { id: 'brazil_recife_offshore', lat: -8.0, lng: -34.5, neighbors: ['cape_verde_north', 'equatorial_atlantic_central', 'brazil_northeast_clearance', 'rio_de_janeiro_offshore'] },
  'brazil_northeast_clearance': { id: 'brazil_northeast_clearance', lat: -4.0, lng: -34.5, neighbors: ['brazil_recife_offshore', 'brazil_north_offshore'] },
  'brazil_north_offshore': { id: 'brazil_north_offshore', lat: 1.0, lng: -44.0, neighbors: ['brazil_northeast_clearance', 'guyana_offshore'] },
  'guyana_offshore': { id: 'guyana_offshore', lat: 8.0, lng: -52.0, neighbors: ['brazil_north_offshore', 'caribbean_east'] },
  'rio_de_janeiro_offshore': { id: 'rio_de_janeiro_offshore', lat: -24.0, lng: -41.0, neighbors: ['brazil_recife_offshore', 'south_atlantic_central', 'buenos_aires_offshore'] },
  'buenos_aires_offshore': { id: 'buenos_aires_offshore', lat: -36.0, lng: -55.0, neighbors: ['rio_de_janeiro_offshore', 'patagonia_north_offshore'] },
  'patagonia_north_offshore': { id: 'patagonia_north_offshore', lat: -43.0, lng: -62.0, neighbors: ['buenos_aires_offshore', 'falklands_north'] },
  'falklands_north': { id: 'falklands_north', lat: -50.0, lng: -58.0, neighbors: ['patagonia_north_offshore', 'falklands_south', 'south_georgia_north'] },
  'falklands_south': { id: 'falklands_south', lat: -53.5, lng: -58.0, neighbors: ['falklands_north', 'cape_horn_south', 'south_georgia_north', 'scotia_sea_central', 'magellan_east_approach'] },
  'magellan_east_approach': { id: 'magellan_east_approach', lat: -52.45, lng: -68.3, neighbors: ['falklands_south', 'magellan_primera_angostura', 'scotia_sea_central'] },
  'magellan_primera_angostura': { id: 'magellan_primera_angostura', lat: -52.52, lng: -69.55, neighbors: ['magellan_east_approach', 'magellan_segunda_angostura'] },
  'magellan_segunda_angostura': { id: 'magellan_segunda_angostura', lat: -52.70, lng: -70.45, neighbors: ['magellan_primera_angostura', 'magellan_paso_ancho'] },
  'magellan_paso_ancho': { id: 'magellan_paso_ancho', lat: -52.95, lng: -70.85, neighbors: ['magellan_segunda_angostura', 'punta_arenas_approach'] },
  'punta_arenas_approach': { id: 'punta_arenas_approach', lat: -53.16, lng: -70.85, neighbors: ['magellan_paso_ancho'] },
  'cape_horn_south': { id: 'cape_horn_south', lat: -57.0, lng: -67.0, neighbors: ['falklands_south', 'scotia_sea_central', 'chile_southwest_clearance', 'drake_passage_south'] },
  'chile_southwest_clearance': { id: 'chile_southwest_clearance', lat: -55.5, lng: -76.0, neighbors: ['cape_horn_south', 'chile_south_pacific'] },
  'drake_passage_south': { id: 'drake_passage_south', lat: -60.0, lng: -60.0, neighbors: ['cape_horn_south', 'elephant_island_offshore', 'scotia_sea_central'] },
  'elephant_island_offshore': { id: 'elephant_island_offshore', lat: -61.0, lng: -55.0, neighbors: ['drake_passage_south', 'scotia_sea_central', 'weddell_sea_north'] },
  'weddell_sea_north': { id: 'weddell_sea_north', lat: -68.0, lng: -50.0, neighbors: ['elephant_island_offshore', 'weddell_sea_south'] },
  'weddell_sea_south': { id: 'weddell_sea_south', lat: -76.0, lng: -36.0, neighbors: ['weddell_sea_north'] },
  'scotia_sea_central': { id: 'scotia_sea_central', lat: -56.0, lng: -45.0, neighbors: ['falklands_south', 'cape_horn_south', 'drake_passage_south', 'elephant_island_offshore', 'south_georgia_north'] },
  'south_georgia_north': { id: 'south_georgia_north', lat: -53.5, lng: -37.0, neighbors: ['falklands_north', 'falklands_south', 'scotia_sea_central', 'tristan_da_cunha', 'southern_ocean_atlantic', 'stromness_grytviken'] },
  'stromness_grytviken': { id: 'stromness_grytviken', lat: -54.2, lng: -36.6, neighbors: ['south_georgia_north'] },

  // North America East & Caribbean
  'newfoundland_east': { id: 'newfoundland_east', lat: 47.0, lng: -50.0, neighbors: ['north_atlantic_ne', 'halifax_offshore', 'bermuda_east', 'greenland_south_cape_farewell'] },
  'halifax_offshore': { id: 'halifax_offshore', lat: 43.5, lng: -63.0, neighbors: ['newfoundland_east', 'boston_offshore', 'bermuda_east'] },
  'boston_offshore': { id: 'boston_offshore', lat: 41.5, lng: -69.5, neighbors: ['halifax_offshore', 'new_york_offshore'] },
  'new_york_offshore': { id: 'new_york_offshore', lat: 40.0, lng: -73.0, neighbors: ['boston_offshore', 'cape_hatteras_offshore', 'bermuda_east'] },
  'cape_hatteras_offshore': { id: 'cape_hatteras_offshore', lat: 35.0, lng: -74.5, neighbors: ['new_york_offshore', 'miami_offshore', 'bermuda_east'] },
  'bermuda_east': { id: 'bermuda_east', lat: 32.0, lng: -64.0, neighbors: ['mid_atlantic_north', 'newfoundland_east', 'halifax_offshore', 'new_york_offshore', 'cape_hatteras_offshore', 'caribbean_north'] },
  'miami_offshore': { id: 'miami_offshore', lat: 25.5, lng: -79.8, neighbors: ['cape_hatteras_offshore', 'florida_straits', 'caribbean_north'] },
  'florida_straits': { id: 'florida_straits', lat: 24.0, lng: -81.5, neighbors: ['miami_offshore', 'gulf_of_mexico_east', 'caribbean_north', 'havana_offshore'] },
  'havana_offshore': { id: 'havana_offshore', lat: 23.3, lng: -82.5, neighbors: ['florida_straits', 'yucatan_channel'] },
  'gulf_of_mexico_east': { id: 'gulf_of_mexico_east', lat: 26.0, lng: -86.0, neighbors: ['florida_straits', 'gulf_of_mexico_west', 'yucatan_channel'] },
  'gulf_of_mexico_west': { id: 'gulf_of_mexico_west', lat: 26.0, lng: -93.0, neighbors: ['gulf_of_mexico_east'] },
  'yucatan_channel': { id: 'yucatan_channel', lat: 21.8, lng: -85.5, neighbors: ['florida_straits', 'havana_offshore', 'gulf_of_mexico_east', 'caribbean_west'] },
  'caribbean_north': { id: 'caribbean_north', lat: 21.0, lng: -72.0, neighbors: ['miami_offshore', 'florida_straits', 'bermuda_east', 'caribbean_east', 'caribbean_central'] },
  'caribbean_central': { id: 'caribbean_central', lat: 15.0, lng: -75.0, neighbors: ['caribbean_north', 'caribbean_west', 'caribbean_east'] },
  'caribbean_west': { id: 'caribbean_west', lat: 16.0, lng: -83.0, neighbors: ['yucatan_channel', 'caribbean_central'] },
  'caribbean_east': { id: 'caribbean_east', lat: 14.0, lng: -63.0, neighbors: ['caribbean_north', 'caribbean_central', 'guyana_offshore'] },

  // Arctic Ocean & Northwest Passage
  'greenland_south_cape_farewell': { id: 'greenland_south_cape_farewell', lat: 59.0, lng: -44.0, neighbors: ['hebrides_west', 'north_atlantic_ne', 'newfoundland_east', 'davis_strait'] },
  'davis_strait': { id: 'davis_strait', lat: 65.0, lng: -55.0, neighbors: ['greenland_south_cape_farewell', 'baffin_bay_central'] },
  'baffin_bay_central': { id: 'baffin_bay_central', lat: 72.0, lng: -65.0, neighbors: ['davis_strait', 'lancaster_sound_east'] },
  'lancaster_sound_east': { id: 'lancaster_sound_east', lat: 74.0, lng: -80.0, neighbors: ['baffin_bay_central', 'barrow_strait'] },
  'barrow_strait': { id: 'barrow_strait', lat: 74.5, lng: -93.0, neighbors: ['lancaster_sound_east', 'peel_sound_north', 'amundsen_gulf_node'] },
  'peel_sound_north': { id: 'peel_sound_north', lat: 72.5, lng: -96.5, neighbors: ['barrow_strait', 'franklin_strait'] },
  'franklin_strait': { id: 'franklin_strait', lat: 70.5, lng: -96.5, neighbors: ['peel_sound_north', 'victoria_strait'] },
  'victoria_strait': { id: 'victoria_strait', lat: 69.5, lng: -99.0, neighbors: ['franklin_strait', 'queen_maud_gulf_node'] },
  'queen_maud_gulf_node': { id: 'queen_maud_gulf_node', lat: 68.2, lng: -102.0, neighbors: ['victoria_strait', 'coronation_gulf'] },
  'coronation_gulf': { id: 'coronation_gulf', lat: 68.5, lng: -112.0, neighbors: ['queen_maud_gulf_node', 'amundsen_gulf_node'] },
  'amundsen_gulf_node': { id: 'amundsen_gulf_node', lat: 70.5, lng: -122.0, neighbors: ['coronation_gulf', 'barrow_strait', 'beaufort_sea_east'] },
  'beaufort_sea_east': { id: 'beaufort_sea_east', lat: 71.0, lng: -135.0, neighbors: ['amundsen_gulf_node', 'beaufort_sea_west'] },
  'beaufort_sea_west': { id: 'beaufort_sea_west', lat: 72.0, lng: -155.0, neighbors: ['beaufort_sea_east', 'chukchi_sea'] },
  'chukchi_sea': { id: 'chukchi_sea', lat: 70.0, lng: -168.0, neighbors: ['beaufort_sea_west', 'bering_strait_north'] },
  'bering_strait_north': { id: 'bering_strait_north', lat: 67.0, lng: -168.0, neighbors: ['chukchi_sea', 'bering_sea_central'] },

  // Pacific Ocean
  'central_america_pacific': { id: 'central_america_pacific', lat: 12.0, lng: -88.0, neighbors: ['galapagos_north', 'mexico_pacific_south'] },
  'mexico_pacific_south': { id: 'mexico_pacific_south', lat: 17.0, lng: -102.0, neighbors: ['central_america_pacific', 'baja_california_south', 'hawaii_east'] },
  'baja_california_south': { id: 'baja_california_south', lat: 22.0, lng: -110.0, neighbors: ['mexico_pacific_south', 'los_angeles_offshore', 'hawaii_east'] },
  'los_angeles_offshore': { id: 'los_angeles_offshore', lat: 33.5, lng: -119.0, neighbors: ['baja_california_south', 'san_francisco_offshore', 'hawaii_east'] },
  'san_francisco_offshore': { id: 'san_francisco_offshore', lat: 37.5, lng: -123.5, neighbors: ['los_angeles_offshore', 'seattle_offshore', 'hawaii_north'] },
  'seattle_offshore': { id: 'seattle_offshore', lat: 48.0, lng: -126.0, neighbors: ['san_francisco_offshore', 'gulf_of_alaska'] },
  'gulf_of_alaska': { id: 'gulf_of_alaska', lat: 56.0, lng: -145.0, neighbors: ['seattle_offshore', 'aleutian_islands_east'] },
  'aleutian_islands_east': { id: 'aleutian_islands_east', lat: 53.0, lng: -165.0, neighbors: ['gulf_of_alaska', 'bering_sea_central', 'north_pacific_central'] },
  'bering_sea_central': { id: 'bering_sea_central', lat: 58.0, lng: -175.0, neighbors: ['aleutian_islands_east', 'kamchatka_offshore', 'bering_strait_north'] },
  'kamchatka_offshore': { id: 'kamchatka_offshore', lat: 52.0, lng: 160.0, neighbors: ['bering_sea_central', 'japan_north_pacific'] },
  'japan_north_pacific': { id: 'japan_north_pacific', lat: 42.0, lng: 145.0, neighbors: ['kamchatka_offshore', 'tokyo_offshore'] },
  'tokyo_offshore': { id: 'tokyo_offshore', lat: 34.5, lng: 140.5, neighbors: ['japan_north_pacific', 'taiwan_strait_east', 'north_pacific_central', 'guam_north'] },
  'taiwan_strait_east': { id: 'taiwan_strait_east', lat: 24.0, lng: 123.0, neighbors: ['tokyo_offshore', 'south_china_sea_north', 'philippines_east'] },
  'south_china_sea_north': { id: 'south_china_sea_north', lat: 21.0, lng: 116.0, neighbors: ['taiwan_strait_east', 'south_china_sea_south', 'luzon_strait'] },
  'luzon_strait': { id: 'luzon_strait', lat: 20.0, lng: 121.0, neighbors: ['south_china_sea_north', 'taiwan_strait_east', 'philippines_east'] },
  'south_china_sea_south': { id: 'south_china_sea_south', lat: 9.0, lng: 110.0, neighbors: ['south_china_sea_north', 'singapore_strait', 'sulu_sea'] },
  'philippines_east': { id: 'philippines_east', lat: 14.0, lng: 126.0, neighbors: ['taiwan_strait_east', 'luzon_strait', 'guam_north', 'mindanao_east'] },
  'mindanao_east': { id: 'mindanao_east', lat: 7.0, lng: 128.0, neighbors: ['philippines_east', 'papua_north', 'sulu_sea'] },
  'sulu_sea': { id: 'sulu_sea', lat: 8.0, lng: 120.0, neighbors: ['south_china_sea_south', 'mindanao_east', 'celebes_sea'] },
  'celebes_sea': { id: 'celebes_sea', lat: 3.0, lng: 123.0, neighbors: ['sulu_sea', 'molucca_sea'] },
  'molucca_sea': { id: 'molucca_sea', lat: 0.0, lng: 127.0, neighbors: ['celebes_sea', 'banda_sea', 'papua_north'] },
  'banda_sea': { id: 'banda_sea', lat: -5.0, lng: 128.0, neighbors: ['molucca_sea', 'timor_sea', 'arafura_sea'] },
  'timor_sea': { id: 'timor_sea', lat: -11.0, lng: 125.0, neighbors: ['banda_sea', 'australia_northwest', 'arafura_sea'] },
  'arafura_sea': { id: 'arafura_sea', lat: -9.5, lng: 135.0, neighbors: ['banda_sea', 'timor_sea', 'torres_strait'] },
  'torres_strait': { id: 'torres_strait', lat: -10.5, lng: 142.5, neighbors: ['arafura_sea', 'coral_sea_north'] },
  'coral_sea_north': { id: 'coral_sea_north', lat: -15.0, lng: 150.0, neighbors: ['torres_strait', 'papua_north', 'coral_sea_south', 'fiji_west'] },
  'coral_sea_south': { id: 'coral_sea_south', lat: -25.0, lng: 155.5, neighbors: ['coral_sea_north', 'sydney_offshore'] },
  'sydney_offshore': { id: 'sydney_offshore', lat: -34.0, lng: 153.5, neighbors: ['coral_sea_south', 'cape_howe_offshore', 'tasman_sea_central'] },
  'papua_north': { id: 'papua_north', lat: -2.0, lng: 145.0, neighbors: ['mindanao_east', 'molucca_sea', 'coral_sea_north', 'guam_south'] },
  'guam_north': { id: 'guam_north', lat: 14.0, lng: 144.5, neighbors: ['tokyo_offshore', 'philippines_east', 'guam_south', 'marshall_islands'] },
  'guam_south': { id: 'guam_south', lat: 6.0, lng: 145.0, neighbors: ['guam_north', 'papua_north', 'marshall_islands'] },
  'marshall_islands': { id: 'marshall_islands', lat: 9.0, lng: 168.0, neighbors: ['guam_north', 'guam_south', 'hawaii_west', 'fiji_west'] },
  'hawaii_north': { id: 'hawaii_north', lat: 25.0, lng: -158.0, neighbors: ['san_francisco_offshore', 'hawaii_east', 'hawaii_west', 'north_pacific_central'] },
  'hawaii_east': { id: 'hawaii_east', lat: 20.0, lng: -150.0, neighbors: ['baja_california_south', 'los_angeles_offshore', 'mexico_pacific_south', 'hawaii_north', 'tahiti_north'] },
  'hawaii_west': { id: 'hawaii_west', lat: 19.0, lng: -165.0, neighbors: ['hawaii_north', 'marshall_islands', 'tahiti_north'] },
  'north_pacific_central': { id: 'north_pacific_central', lat: 35.0, lng: 175.0, neighbors: ['tokyo_offshore', 'aleutian_islands_east', 'hawaii_north'] },
  'tahiti_north': { id: 'tahiti_north', lat: -15.0, lng: -148.0, neighbors: ['hawaii_east', 'hawaii_west', 'fiji_west', 'easter_island_north'] },
  'fiji_west': { id: 'fiji_west', lat: -18.0, lng: 177.0, neighbors: ['coral_sea_north', 'marshall_islands', 'tahiti_north', 'auckland_north'] },
  'tasman_sea_central': { id: 'tasman_sea_central', lat: -38.0, lng: 160.0, neighbors: ['sydney_offshore', 'bass_strait_east', 'auckland_north', 'new_zealand_south'] },
  'auckland_north': { id: 'auckland_north', lat: -35.0, lng: 174.0, neighbors: ['fiji_west', 'tasman_sea_central', 'cook_strait_east'] },
  'cook_strait_east': { id: 'cook_strait_east', lat: -41.5, lng: 175.0, neighbors: ['auckland_north', 'new_zealand_south'] },
  'new_zealand_south': { id: 'new_zealand_south', lat: -47.0, lng: 168.0, neighbors: ['tasman_sea_central', 'cook_strait_east'] },
  'easter_island_north': { id: 'easter_island_north', lat: -26.0, lng: -110.0, neighbors: ['tahiti_north', 'galapagos_south', 'chile_central_pacific'] },
  'galapagos_north': { id: 'galapagos_north', lat: 1.0, lng: -91.0, neighbors: ['central_america_pacific', 'galapagos_south', 'peru_lima_offshore'] },
  'galapagos_south': { id: 'galapagos_south', lat: -3.0, lng: -91.0, neighbors: ['galapagos_north', 'easter_island_north', 'peru_lima_offshore'] },
  'peru_lima_offshore': { id: 'peru_lima_offshore', lat: -12.5, lng: -80.0, neighbors: ['galapagos_north', 'galapagos_south', 'chile_central_pacific'] },
  'chile_central_pacific': { id: 'chile_central_pacific', lat: -33.0, lng: -75.0, neighbors: ['peru_lima_offshore', 'easter_island_north', 'chile_south_pacific'] },
  'chile_south_pacific': { id: 'chile_south_pacific', lat: -50.0, lng: -76.0, neighbors: ['chile_central_pacific', 'chile_southwest_clearance'] }
};

/**
 * Checks if a 2D point (lat, lng) is inside a polygon using ray casting algorithm.
 */
export function isPointInsidePolygon(lat: number, lng: number, polygon: Polygon): boolean {
  if (
    lat < polygon.minLat ||
    lat > polygon.maxLat ||
    lng < polygon.minLng ||
    lng > polygon.maxLng
  ) {
    return false;
  }

  const vs = polygon.vertices;
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const yi = vs[i][0], xi = vs[i][1];
    const yj = vs[j][0], xj = vs[j][1];

    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point is on land (inside any global land polygon).
 */
export function isPointOnLand(lat: number, lng: number): boolean {
  // Normalize longitude to [-180, 180]
  let normLng = lng;
  while (normLng < -180) normLng += 360;
  while (normLng > 180) normLng -= 360;

  for (const poly of GLOBAL_LAND_POLYGONS) {
    if (isPointInsidePolygon(lat, normLng, poly)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if two line segments (p1-p2 and q1-q2) in lat/lng space intersect.
 */
function lineSegmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): boolean {
  const ccw = (a: [number, number], b: [number, number], c: [number, number]) => {
    return (c[0] - a[0]) * (b[1] - a[1]) > (b[0] - a[0]) * (c[1] - a[1]);
  };

  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
}

/**
 * Checks if a path segment between two coordinates intersects any landmass.
 * Samples along the spherical great circle arc to ensure accurate detection on a 3D globe.
 */
export function doesSegmentIntersectLand(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  options: { sampleSteps?: number; interiorOnly?: boolean } = {}
): boolean {
  const { sampleSteps = 32, interiorOnly = true } = options;

  const v1 = latLngToVector3(start.lat, start.lng).normalize();
  const v2 = latLngToVector3(end.lat, end.lng).normalize();
  const angle = v1.angleTo(v2);

  if (angle < 0.001) {
    return false;
  }

  // Ensure dense sampling across long arcs (~1 sample per 100-120 km)
  const distanceSteps = Math.ceil(angle * 60);
  const steps = Math.max(16, Math.max(sampleSteps, distanceSteps));

  // If start is on land, start sampling after leaving the coastal margin (e.g. t >= 0.08)
  // If end is on land, stop sampling before entering the coastal margin
  const startOnLand = isPointOnLand(start.lat, start.lng);
  const endOnLand = isPointOnLand(end.lat, end.lng);

  const startT = (startOnLand && interiorOnly) ? 0.08 : (1 / steps);
  const endT = (endOnLand && interiorOnly) ? 0.92 : ((steps - 1) / steps);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t < startT || t > endT) continue;

    // Spherical linear interpolation
    const sinTheta = Math.sin(angle);
    if (sinTheta < 0.0001) continue;

    const a = Math.sin((1 - t) * angle) / sinTheta;
    const b = Math.sin(t * angle) / sinTheta;
    const p = new THREE.Vector3(
      v1.x * a + v2.x * b,
      v1.y * a + v2.y * b,
      v1.z * a + v2.z * b
    ).normalize();

    const { lat, lng } = vector3ToLatLng(p);
    if (isPointOnLand(lat, lng)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates great circle distance in km between two lat/lng points.
 */
export function sphericalDistanceKm(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  return calculateDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
}

/**
 * Finds the nearest navigable water graph node that has clear line-of-sight to the given point.
 * Prioritizes local coastal approach nodes (<500km) to prevent ports in estuaries/harbors
 * from jumping across oceans to distant nodes.
 */
function findClosestVisibleWaterNode(
  point: { lat: number; lng: number },
  allNodes: Record<string, WaterNode>
): string | null {
  const entries = Object.values(allNodes);

  // Sort nodes by raw distance
  const sorted = entries.map(n => ({
    node: n,
    dist: sphericalDistanceKm(point, n)
  })).sort((a, b) => a.dist - b.dist);

  // 1. Check nearby nodes (< 600km) that have clear line of sight
  for (const item of sorted) {
    if (item.dist > 600) break;
    if (!doesSegmentIntersectLand(point, item.node, { sampleSteps: 12 })) {
      return item.node.id;
    }
  }

  // 2. If no nearby node has perfectly clear LOS (e.g. coastal port in estuary or harbor),
  // choose the closest local approach node rather than jumping to a distant continent
  if (sorted[0] && sorted[0].dist <= 600) {
    return sorted[0].node.id;
  }

  // 3. For open ocean points far from nodes, find closest visible node
  for (const item of sorted) {
    if (!doesSegmentIntersectLand(point, item.node, { sampleSteps: 16 })) {
      return item.node.id;
    }
  }

  return sorted[0]?.node.id ?? null;
}

/**
 * A* Pathfinding over the global water navigation graph.
 */
export function findWaterRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): GeoCoordinates[] {
  // If direct line stays in water, return direct path
  if (!doesSegmentIntersectLand(start, end)) {
    return [
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng }
    ];
  }

  const startNodeId = findClosestVisibleWaterNode(start, GLOBAL_WATER_NODES);
  const endNodeId = findClosestVisibleWaterNode(end, GLOBAL_WATER_NODES);

  if (!startNodeId || !endNodeId) {
    return [
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng }
    ];
  }

  if (startNodeId === endNodeId) {
    const midNode = GLOBAL_WATER_NODES[startNodeId];
    return [
      { lat: start.lat, lng: start.lng },
      { lat: midNode.lat, lng: midNode.lng },
      { lat: end.lat, lng: end.lng }
    ];
  }

  // A* Priority Queue & Maps
  const openSet = new Set<string>([startNodeId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(startNodeId, sphericalDistanceKm(start, GLOBAL_WATER_NODES[startNodeId]));
  fScore.set(startNodeId, gScore.get(startNodeId)! + sphericalDistanceKm(GLOBAL_WATER_NODES[startNodeId], end));

  while (openSet.size > 0) {
    let currentId: string | null = null;
    let lowestF = Infinity;

    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentId = id;
      }
    }

    if (!currentId) break;

    if (currentId === endNodeId) {
      // Reconstruct path
      const pathNodes: WaterNode[] = [];
      let curr: string | undefined = currentId;
      while (curr) {
        pathNodes.unshift(GLOBAL_WATER_NODES[curr]);
        curr = cameFrom.get(curr);
      }

      const rawPath: GeoCoordinates[] = [
        { lat: start.lat, lng: start.lng },
        ...pathNodes.map(n => ({ lat: n.lat, lng: n.lng })),
        { lat: end.lat, lng: end.lng }
      ];

      return simplifyWaterRoute(rawPath);
    }

    openSet.delete(currentId);
    const currentNode = GLOBAL_WATER_NODES[currentId];

    for (const neighborId of currentNode.neighbors) {
      const neighborNode = GLOBAL_WATER_NODES[neighborId];
      if (!neighborNode) continue;

      const edgeDist = sphericalDistanceKm(currentNode, neighborNode);
      const tentativeG = (gScore.get(currentId) ?? Infinity) + edgeDist;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + sphericalDistanceKm(neighborNode, end));
        openSet.add(neighborId);
      }
    }
  }

  // Fallback: If no path found in graph, return direct
  return [
    { lat: start.lat, lng: start.lng },
    { lat: end.lat, lng: end.lng }
  ];
}

/**
 * Simplifies a generated water route by eliminating intermediate nodes that have clear
 * unobstructed line-of-sight through open water (shortcut optimization).
 */
export function simplifyWaterRoute(path: GeoCoordinates[]): GeoCoordinates[] {
  if (path.length <= 2) return path;

  const result: GeoCoordinates[] = [path[0]];
  let currentIndex = 0;

  while (currentIndex < path.length - 1) {
    let furthestVisible = currentIndex + 1;

    for (let i = path.length - 1; i > currentIndex + 1; i--) {
      const p1 = path[currentIndex];
      const p2 = path[i];

      // Limit shortcutting over long open ocean distances (> 1500 km) so maritime routes preserve
      // intermediate oceanic waypoints (e.g. Falklands corridor) on both 2D map and 3D globe
      if (sphericalDistanceKm(p1, p2) > 1500 && i > currentIndex + 1) {
        continue;
      }

      if (!doesSegmentIntersectLand(p1, p2, { sampleSteps: 20 })) {
        furthestVisible = i;
        break;
      }
    }

    result.push(path[furthestVisible]);
    currentIndex = furthestVisible;
  }

  // Clean up nearly collinear points (within ~1.5 degree threshold) to reduce excess points
  if (result.length > 2) {
    const pruned: GeoCoordinates[] = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      const prev = pruned[pruned.length - 1];
      const curr = result[i];
      const next = result[i + 1];

      // Angle check
      const v1 = latLngToVector3(curr.lat, curr.lng).sub(latLngToVector3(prev.lat, prev.lng)).normalize();
      const v2 = latLngToVector3(next.lat, next.lng).sub(latLngToVector3(curr.lat, curr.lng)).normalize();
      const dot = v1.dot(v2);

      // If angle deflection is very small (> 0.998) and direct segment prev->next is over water, skip curr
      if (dot > 0.998 && !doesSegmentIntersectLand(prev, next, { sampleSteps: 12 })) {
        continue;
      }
      pruned.push(curr);
    }
    pruned.push(result[result.length - 1]);
    return pruned;
  }

  return result;
}

/**
 * Determines whether a route, route group, or query context represents a genuine maritime/oceanic journey.
 *
 * Requirements:
 * - Requires strong, positive maritime evidence (oceanic navigation, sea voyages, naval vessels, shipwrecks, circumnavigations).
 * - Generic historical terms such as "expedition", "march", or "river landing" never independently establish maritime status.
 * - Prevents terrestrial expeditions (Lewis & Clark, Trail of Tears, Silk Road) from false-positive ocean routing.
 */
export function isMaritimeJourney(
  routeContext?: Partial<Route> | {
    title?: string;
    routeType?: string;
    routeEvidenceMode?: string;
    corridorDescription?: string;
    description?: string;
    [key: string]: any;
  },
  group?: Partial<RouteGroup>,
  waypoints?: Waypoint[]
): boolean {
  // 1. Text corpus from route and group metadata
  const textCorpus = [
    routeContext?.title,
    routeContext?.routeType,
    routeContext?.description,
    routeContext?.corridorDescription,
    group?.name,
    group?.id,
    group?.description,
    group?.corridorDescription
  ].filter(Boolean).join(' ').toLowerCase();

  // 2. Explicit non-water / overland indicators
  const isExplicitOverland = /\b(overland|hiking|hiking\s+trail|walking|bicycle|cycling|flight|aviation|rail|railway|train|highway|road\s+trip|march|caravan)\b/i.test(textCorpus);
  const hasStrongOceanicContext = /\b(ocean\s+voyage|circumnavigation|transatlantic|transpacific|sea\s+route|sea\s+voyage|open\s+ocean|naval\s+voyage|shipwreck|northwest\s+passage|strait\s+of\s+magellan|drake\s+passage)\b/i.test(textCorpus);

  if (isExplicitOverland && !hasStrongOceanicContext) {
    return false;
  }

  // 3. Positive maritime indicators in route or group metadata
  const maritimeKeywords = /\b(maritime|naval|ocean\s+voyage|oceanic|open\s+ocean|sea\s+route|sea\s+voyage|sailing\s+vessel|circumnavigation|shipwreck|shipwrecks|transatlantic|transpacific|strait\s+crossing|northwest\s+passage|cape\s+horn|drake\s+passage|weddell\s+sea|baffin\s+bay|shackleton|endurance|magellan|columbus|hms\s+erebus|hms\s+terror|hms\s+beagle|lusitania|titanic|batavia|franklin\s+expedition)\b/i;

  if (maritimeKeywords.test(textCorpus)) {
    return true;
  }

  // 4. Waypoint inspection: check if waypoints represent genuine maritime stops / shipwrecks / oceanic ports
  if (waypoints && waypoints.length >= 2) {
    const maritimeWaypointCount = waypoints.filter(wp => {
      if (isMaritimeHistoricalEntity(wp)) return true;
      const wpText = `${wp.name} ${wp.canonicalName || ''} ${wp.context || ''} ${wp.description || ''} ${wp.significance || ''}`.toLowerCase();
      return /\b(seaport|ocean\s+port|naval\s+base|coastal\s+wharf|whaling\s+station|sea\s+ice|pack\s+ice|shipwreck|sailed\s+across|open\s+sea|oceanic)\b/i.test(wpText);
    }).length;

    if (maritimeWaypointCount >= Math.ceil(waypoints.length / 2)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves water-aware routing geometry for all consecutive waypoint pairs in a maritime route.
 * Invariant: Preserves the original historical waypoints collection (IDs, order, attributes) unchanged,
 * and attaches resolved intermediate geometry to `wp.pathGeometry`.
 */
export function resolveWaterAwareRoute(
  waypoints: Waypoint[],
  routeContext?: Partial<Route> | { title?: string; routeType?: string; [key: string]: any }
): Waypoint[] {
  if (!waypoints || waypoints.length < 2) {
    return waypoints;
  }

  const isMaritime = isMaritimeJourney(routeContext, undefined, waypoints);
  if (!isMaritime) {
    // Invariant: A non-maritime waypoint collection returned through resolveWaterAwareRoute() must not contain pathGeometry.
    return waypoints.map(wp => {
      if (wp.pathGeometry) {
        const { pathGeometry, ...cleanWp } = wp;
        return cleanWp;
      }
      return wp;
    });
  }

  // Clone waypoints shallowly to avoid mutating caller's original references
  const resolvedWaypoints: Waypoint[] = waypoints.map(wp => ({ ...wp }));

  for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
    const wp1 = resolvedWaypoints[i];
    const wp2 = resolvedWaypoints[i + 1];

    if (
      typeof wp1.lat !== 'number' || typeof wp1.lng !== 'number' ||
      typeof wp2.lat !== 'number' || typeof wp2.lng !== 'number'
    ) {
      continue;
    }

    const groupMatch = (wp1.routeGroupId || 'default') === (wp2.routeGroupId || 'default');
    if (!groupMatch) continue;

    const waterPath = findWaterRoute(
      { lat: wp1.lat, lng: wp1.lng },
      { lat: wp2.lat, lng: wp2.lng }
    );

    // If alternate water geometry was generated (more than just start and end)
    wp1.pathGeometry = waterPath;
  }

  return resolvedWaypoints;
}
