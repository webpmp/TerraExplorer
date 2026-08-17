import { OSMVectorFeature } from './osmMapDataProvider';

/**
 * High-quality deterministic OSM-derived fallback dataset.
 * Ensures the visual map detail layer is immediately, 100% reliably visible
 * across major world regions even when external Overpass mirrors return 429/504 or are offline.
 */
export const OSM_FALLBACK_FEATURES: OSMVectorFeature[] = [
  // ==========================================
  // 1. BOUNDARIES (Country & Major State Lines)
  // ==========================================
  {
    id: 'boundary-us-mx',
    type: 'boundary',
    name: 'US-Mexico Border',
    englishName: 'US-Mexico Border',
    coordinates: [
      [32.534, -117.123],
      [32.553, -116.928],
      [32.576, -116.602],
      [32.617, -115.823],
      [32.673, -115.485],
      [32.719, -114.719],
      [31.332, -111.002],
      [31.332, -108.209],
      [31.784, -106.528]
    ]
  },
  {
    id: 'boundary-ca-nv',
    type: 'boundary',
    name: 'California-Nevada Border',
    englishName: 'California-Nevada Border',
    coordinates: [
      [42.000, -120.001],
      [39.000, -120.001],
      [35.002, -114.633]
    ]
  },
  {
    id: 'boundary-ca-az',
    type: 'boundary',
    name: 'California-Arizona Border',
    englishName: 'California-Arizona Border',
    coordinates: [
      [35.002, -114.633],
      [34.269, -114.135],
      [33.610, -114.596],
      [32.719, -114.719]
    ]
  },
  {
    id: 'boundary-europe-fr-de',
    type: 'boundary',
    name: 'France-Germany Border',
    englishName: 'France-Germany Border',
    coordinates: [
      [49.002, 8.232],
      [48.972, 8.163],
      [48.583, 7.842],
      [48.001, 7.562],
      [47.589, 7.589]
    ]
  },
  {
    id: 'boundary-uk-scot',
    type: 'boundary',
    name: 'England-Scotland Border',
    englishName: 'England-Scotland Border',
    coordinates: [
      [55.812, -2.043],
      [55.651, -2.482],
      [55.334, -2.762],
      [54.982, -3.072]
    ]
  },

  // ==========================================
  // 2. MAJOR HIGHWAYS & MOTORWAYS
  // ==========================================
  {
    id: 'road-i5',
    type: 'road_motorway',
    name: 'Interstate 5',
    englishName: 'I-5',
    coordinates: [
      [32.543, -117.034], // San Ysidro / Tijuana Border
      [32.715, -117.161], // San Diego
      [33.025, -117.265], // Del Mar / Encinitas
      [33.195, -117.379], // Oceanside
      [33.388, -117.589], // San Clemente
      [33.684, -117.826], // Irvine
      [33.835, -117.914], // Anaheim
      [34.052, -118.243], // Los Angeles
      [34.200, -118.440], // San Fernando Valley
      [34.420, -118.558], // Santa Clarita
      [34.880, -118.890], // Grapevine / Tejon Pass
      [35.373, -119.018], // Bakersfield
      [36.746, -119.772], // Fresno area
      [37.774, -121.420], // Tracy / Central Valley
      [38.581, -121.494], // Sacramento
      [40.586, -122.391], // Redding
      [42.326, -122.875], // Medford, OR
      [44.052, -123.086], // Eugene, OR
      [45.515, -122.678], // Portland, OR
      [47.606, -122.332], // Seattle, WA
      [49.002, -122.756]  // Canada Border
    ]
  },
  {
    id: 'road-i8',
    type: 'road_motorway',
    name: 'Interstate 8',
    englishName: 'I-8',
    coordinates: [
      [32.753, -117.208], // San Diego Ocean Beach / Mission Bay
      [32.794, -116.962], // El Cajon
      [32.835, -116.760], // Alpine
      [32.778, -116.514], // Pine Valley
      [32.663, -116.035], // Jacumba
      [32.750, -115.820], // Ocotillo
      [32.792, -115.563], // El Centro
      [32.790, -115.350], // Holtville
      [32.748, -114.627], // Yuma, AZ
      [32.880, -113.310], // Gila Bend
      [32.890, -111.758]  // Casa Grande / I-10 junction
    ]
  },
  {
    id: 'road-i10',
    type: 'road_motorway',
    name: 'Interstate 10',
    englishName: 'I-10',
    coordinates: [
      [34.019, -118.491], // Santa Monica
      [34.052, -118.243], // Los Angeles
      [34.063, -117.650], // Ontario
      [34.108, -117.289], // San Bernardino
      [33.925, -116.880], // Banning / Beaumont
      [33.830, -116.545], // Palm Springs
      [33.722, -116.216], // Indio
      [33.680, -115.650], // Chiriaco Summit
      [33.610, -114.596], // Blythe / AZ border
      [33.448, -112.074], // Phoenix
      [32.222, -110.974]  // Tucson
    ]
  },
  {
    id: 'road-i15',
    type: 'road_motorway',
    name: 'Interstate 15',
    englishName: 'I-15',
    coordinates: [
      [32.684, -117.112], // San Diego
      [33.119, -117.086], // Escondido
      [33.493, -117.148], // Temecula
      [33.875, -117.566], // Corona
      [34.108, -117.289], // San Bernardino
      [34.320, -117.470], // Cajon Pass
      [34.536, -117.292], // Victorville
      [34.895, -117.017], // Barstow
      [35.260, -116.070], // Baker
      [35.612, -115.421], // Primm
      [36.169, -115.139], // Las Vegas
      [37.096, -113.568], // St. George, UT
      [40.760, -111.891]  // Salt Lake City
    ]
  },
  {
    id: 'road-us101',
    type: 'road_primary',
    name: 'US-101',
    englishName: 'US-101',
    coordinates: [
      [34.052, -118.243], // Los Angeles
      [34.165, -118.605], // Woodland Hills
      [34.220, -119.050], // Camarillo
      [34.280, -119.290], // Ventura
      [34.420, -119.698], // Santa Barbara
      [34.895, -120.435], // Santa Maria
      [35.282, -120.659], // San Luis Obispo
      [36.677, -121.655], // Salinas
      [37.338, -121.886], // San Jose
      [37.774, -122.419]  // San Francisco
    ]
  },
  {
    id: 'road-ca99',
    type: 'road_primary',
    name: 'CA-99',
    englishName: 'CA-99',
    coordinates: [
      [35.373, -119.018], // Bakersfield
      [36.330, -119.290], // Visalia
      [36.746, -119.772], // Fresno
      [37.302, -120.482], // Merced
      [37.639, -120.996], // Modesto
      [37.957, -121.290], // Stockton
      [38.581, -121.494]  // Sacramento
    ]
  },
  {
    id: 'road-i80',
    type: 'road_motorway',
    name: 'Interstate 80',
    englishName: 'I-80',
    coordinates: [
      [37.774, -122.419], // San Francisco
      [37.804, -122.271], // Oakland
      [38.250, -122.040], // Fairfield
      [38.581, -121.494], // Sacramento
      [38.895, -121.076], // Auburn
      [39.327, -120.183], // Truckee / Donner Pass
      [39.529, -119.813], // Reno, NV
      [40.760, -111.891], // Salt Lake City
      [41.878, -87.629],  // Chicago, IL
      [40.712, -74.006]   // New York Area
    ]
  },
  {
    id: 'road-m25',
    type: 'road_motorway',
    name: 'M25 Motorway',
    englishName: 'M25',
    coordinates: [
      [51.684, -0.211],
      [51.701, 0.082],
      [51.482, 0.282],
      [51.272, -0.052],
      [51.352, -0.502],
      [51.684, -0.211]
    ]
  },
  {
    id: 'road-tomei',
    type: 'road_motorway',
    name: 'Tomei Expressway',
    englishName: 'Tomei Expressway',
    coordinates: [
      [35.632, 139.621], // Tokyo
      [35.452, 139.462], // Atsugi
      [35.253, 139.021], // Odawara
      [35.122, 138.862], // Numazu / Fuji
      [34.972, 138.382], // Shizuoka
      [34.712, 137.722], // Hamamatsu
      [35.181, 136.906]  // Nagoya
    ]
  },

  // ==========================================
  // 3. MAJOR RIVERS & WATER BODIES
  // ==========================================
  {
    id: 'river-colorado',
    type: 'waterway',
    name: 'Colorado River',
    englishName: 'Colorado River',
    coordinates: [
      [40.282, -105.821], // Rocky Mountains
      [39.063, -108.550], // Grand Junction
      [36.106, -112.112], // Grand Canyon
      [36.015, -114.737], // Hoover Dam / Lake Mead
      [35.002, -114.633], // Needles
      [34.220, -114.150], // Lake Havasu
      [33.610, -114.596], // Blythe
      [32.719, -114.719], // Yuma
      [31.802, -114.752]  // Gulf of California
    ]
  },
  {
    id: 'water-salton-sea',
    type: 'water',
    name: 'Salton Sea',
    englishName: 'Salton Sea',
    coordinates: [
      [33.552, -116.082],
      [33.452, -115.852],
      [33.202, -115.582],
      [33.152, -115.752],
      [33.352, -116.052],
      [33.552, -116.082]
    ]
  },
  {
    id: 'water-lake-tahoe',
    type: 'water',
    name: 'Lake Tahoe',
    englishName: 'Lake Tahoe',
    coordinates: [
      [39.222, -120.021],
      [39.152, -119.942],
      [38.932, -119.972],
      [38.982, -120.122],
      [39.222, -120.021]
    ]
  },
  {
    id: 'river-sacramento',
    type: 'waterway',
    name: 'Sacramento River',
    englishName: 'Sacramento River',
    coordinates: [
      [41.250, -122.310], // Mt Shasta
      [40.586, -122.391], // Redding
      [39.750, -122.010], // Red Bluff / Chico
      [38.581, -121.494], // Sacramento
      [38.050, -121.850]  // San Francisco Bay Delta
    ]
  },
  {
    id: 'river-thames',
    type: 'waterway',
    name: 'River Thames',
    englishName: 'River Thames',
    coordinates: [
      [51.682, -1.821],
      [51.752, -1.252], // Oxford
      [51.452, -0.972], // Reading
      [51.507, -0.127], // London Center
      [51.492, 0.052],  // Greenwich
      [51.502, 0.752]   // Thames Estuary
    ]
  },
  {
    id: 'river-seine',
    type: 'waterway',
    name: 'Seine River',
    englishName: 'Seine River',
    coordinates: [
      [47.502, 4.702],
      [48.292, 4.072],
      [48.856, 2.352],  // Paris Center
      [49.442, 1.092],  // Rouen
      [49.492, 0.102]   // Le Havre
    ]
  },

  // ==========================================
  // 4. MAJOR NATIONAL PARKS
  // ==========================================
  {
    id: 'park-yosemite',
    type: 'park',
    name: 'Yosemite National Park',
    englishName: 'Yosemite National Park',
    coordinates: [
      [37.952, -119.752],
      [37.902, -119.252],
      [37.552, -119.452],
      [37.652, -119.852],
      [37.952, -119.752]
    ]
  },
  {
    id: 'park-grand-canyon',
    type: 'park',
    name: 'Grand Canyon National Park',
    englishName: 'Grand Canyon National Park',
    coordinates: [
      [36.352, -113.252],
      [36.402, -111.852],
      [35.952, -111.952],
      [36.052, -113.352],
      [36.352, -113.252]
    ]
  },
  {
    id: 'park-joshua-tree',
    type: 'park',
    name: 'Joshua Tree National Park',
    englishName: 'Joshua Tree National Park',
    coordinates: [
      [34.052, -116.352],
      [34.052, -115.752],
      [33.652, -115.752],
      [33.752, -116.352],
      [34.052, -116.352]
    ]
  },

  // ==========================================
  // 5. MAJOR POPULATED PLACES (Cities & Towns)
  // ==========================================
  // --- Southern California ---
  { id: 'city-la', type: 'place_city', coordinates: [[34.0522, -118.2437]], point: [34.0522, -118.2437], name: 'Los Angeles', englishName: 'Los Angeles', importance: 3 },
  { id: 'city-sd', type: 'place_city', coordinates: [[32.7157, -117.1611]], point: [32.7157, -117.1611], name: 'San Diego', englishName: 'San Diego', importance: 3 },
  { id: 'city-sf', type: 'place_city', coordinates: [[37.7749, -122.4194]], point: [37.7749, -122.4194], name: 'San Francisco', englishName: 'San Francisco', importance: 3 },
  { id: 'city-sj', type: 'place_city', coordinates: [[37.3382, -121.8863]], point: [37.3382, -121.8863], name: 'San Jose', englishName: 'San Jose', importance: 3 },
  { id: 'city-sac', type: 'place_city', coordinates: [[38.5816, -121.4944]], point: [38.5816, -121.4944], name: 'Sacramento', englishName: 'Sacramento', importance: 3 },
  { id: 'city-fre', type: 'place_city', coordinates: [[36.7468, -119.7726]], point: [36.7468, -119.7726], name: 'Fresno', englishName: 'Fresno', importance: 2 },
  { id: 'city-bak', type: 'place_city', coordinates: [[35.3733, -119.0187]], point: [35.3733, -119.0187], name: 'Bakersfield', englishName: 'Bakersfield', importance: 2 },
  { id: 'city-ana', type: 'place_city', coordinates: [[33.8366, -117.9143]], point: [33.8366, -117.9143], name: 'Anaheim', englishName: 'Anaheim', importance: 2 },
  { id: 'city-irv', type: 'place_city', coordinates: [[33.6846, -117.8265]], point: [33.6846, -117.8265], name: 'Irvine', englishName: 'Irvine', importance: 2 },
  { id: 'city-riv', type: 'place_city', coordinates: [[33.9806, -117.3755]], point: [33.9806, -117.3755], name: 'Riverside', englishName: 'Riverside', importance: 2 },
  { id: 'city-sb', type: 'place_city', coordinates: [[34.1083, -117.2898]], point: [34.1083, -117.2898], name: 'San Bernardino', englishName: 'San Bernardino', importance: 2 },
  { id: 'city-ps', type: 'place_town', coordinates: [[33.8303, -116.5453]], point: [33.8303, -116.5453], name: 'Palm Springs', englishName: 'Palm Springs', importance: 2 },
  { id: 'city-ec', type: 'place_town', coordinates: [[32.7920, -115.5631]], point: [32.7920, -115.5631], name: 'El Centro', englishName: 'El Centro', importance: 2 },
  { id: 'city-tij', type: 'place_city', coordinates: [[32.5149, -117.0382]], point: [32.5149, -117.0382], name: 'Tijuana', englishName: 'Tijuana', importance: 3 },
  { id: 'city-mex', type: 'place_city', coordinates: [[32.6245, -115.4523]], point: [32.6245, -115.4523], name: 'Mexicali', englishName: 'Mexicali', importance: 2 },
  { id: 'city-phx', type: 'place_city', coordinates: [[33.4484, -112.0740]], point: [33.4484, -112.0740], name: 'Phoenix', englishName: 'Phoenix', importance: 3 },
  { id: 'city-lv', type: 'place_city', coordinates: [[36.1699, -115.1398]], point: [36.1699, -115.1398], name: 'Las Vegas', englishName: 'Las Vegas', importance: 3 },
  { id: 'city-sea', type: 'place_city', coordinates: [[47.6062, -122.3321]], point: [47.6062, -122.3321], name: 'Seattle', englishName: 'Seattle', importance: 3 },
  { id: 'city-por', type: 'place_city', coordinates: [[45.5152, -122.6784]], point: [45.5152, -122.6784], name: 'Portland', englishName: 'Portland', importance: 3 },

  // --- North America (East & Central) ---
  { id: 'city-nyc', type: 'place_city', coordinates: [[40.7128, -74.0060]], point: [40.7128, -74.0060], name: 'New York', englishName: 'New York', importance: 3 },
  { id: 'city-bos', type: 'place_city', coordinates: [[42.3601, -71.0589]], point: [42.3601, -71.0589], name: 'Boston', englishName: 'Boston', importance: 3 },
  { id: 'city-dc', type: 'place_city', coordinates: [[38.9072, -77.0369]], point: [38.9072, -77.0369], name: 'Washington, D.C.', englishName: 'Washington, D.C.', importance: 3 },
  { id: 'city-chi', type: 'place_city', coordinates: [[41.8781, -87.6298]], point: [41.8781, -87.6298], name: 'Chicago', englishName: 'Chicago', importance: 3 },
  { id: 'city-mia', type: 'place_city', coordinates: [[25.7617, -80.1918]], point: [25.7617, -80.1918], name: 'Miami', englishName: 'Miami', importance: 3 },

  // --- Europe ---
  { id: 'city-lon', type: 'place_city', coordinates: [[51.5074, -0.1278]], point: [51.5074, -0.1278], name: 'London', englishName: 'London', importance: 3 },
  { id: 'city-par', type: 'place_city', coordinates: [[48.8566, 2.3522]], point: [48.8566, 2.3522], name: 'Paris', englishName: 'Paris', importance: 3 },
  { id: 'city-ber', type: 'place_city', coordinates: [[52.5200, 13.4050]], point: [52.5200, 13.4050], name: 'Berlin', englishName: 'Berlin', importance: 3 },
  { id: 'city-rom', type: 'place_city', coordinates: [[41.9028, 12.4964]], point: [41.9028, 12.4964], name: 'Rome', englishName: 'Rome', importance: 3 },
  { id: 'city-mad', type: 'place_city', coordinates: [[40.4168, -3.7038]], point: [40.4168, -3.7038], name: 'Madrid', englishName: 'Madrid', importance: 3 },
  { id: 'city-ams', type: 'place_city', coordinates: [[52.3676, 4.9041]], point: [52.3676, 4.9041], name: 'Amsterdam', englishName: 'Amsterdam', importance: 3 },
  { id: 'city-ath', type: 'place_city', coordinates: [[37.9838, 23.7275]], point: [37.9838, 23.7275], name: 'Athens', englishName: 'Athens', importance: 3 },

  // --- Asia & Middle East ---
  { id: 'city-tok', type: 'place_city', coordinates: [[35.6762, 139.6503]], point: [35.6762, 139.6503], name: 'Tokyo', englishName: 'Tokyo', importance: 3 },
  { id: 'city-osa', type: 'place_city', coordinates: [[34.6937, 135.5023]], point: [34.6937, 135.5023], name: 'Osaka', englishName: 'Osaka', importance: 3 },
  { id: 'city-kyo', type: 'place_city', coordinates: [[35.0116, 135.7681]], point: [35.0116, 135.7681], name: 'Kyoto', englishName: 'Kyoto', importance: 3 },
  { id: 'city-cai', type: 'place_city', coordinates: [[30.0444, 31.2357]], point: [30.0444, 31.2357], name: 'القاهرة', englishName: 'Cairo', importance: 3 },
  { id: 'city-dxb', type: 'place_city', coordinates: [[25.2048, 55.2708]], point: [25.2048, 55.2708], name: 'دبي', englishName: 'Dubai', importance: 3 },
  { id: 'city-min', type: 'place_town', coordinates: [[27.1467, 57.0801]], point: [27.1467, 57.0801], name: 'میناب', englishName: 'Minab', importance: 2 },
  { id: 'city-bba', type: 'place_city', coordinates: [[27.1865, 56.2808]], point: [27.1865, 56.2808], name: 'بندرعباس', englishName: 'Bandar Abbas', importance: 3 },

  // --- Australia & Americas ---
  { id: 'city-syd', type: 'place_city', coordinates: [[-33.8688, 151.2093]], point: [-33.8688, 151.2093], name: 'Sydney', englishName: 'Sydney', importance: 3 },
  { id: 'city-mel', type: 'place_city', coordinates: [[-37.8136, 144.9631]], point: [-37.8136, 144.9631], name: 'Melbourne', englishName: 'Melbourne', importance: 3 }
];

/**
 * Filter fallback features that intersect the given viewport extent
 */
export function getFallbackFeaturesForViewport(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): OSMVectorFeature[] {
  const result: OSMVectorFeature[] = [];

  for (const f of OSM_FALLBACK_FEATURES) {
    if (f.point) {
      const [lat, lng] = f.point;
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        result.push(f);
      }
    } else if (f.coordinates && f.coordinates.length > 0) {
      // Check if any point of the line/polygon is within the viewport (with small padding)
      const intersects = f.coordinates.some(([lat, lng]) => {
        return lat >= minLat - 1.5 && lat <= maxLat + 1.5 && lng >= minLng - 1.5 && lng <= maxLng + 1.5;
      });
      if (intersects) {
        result.push(f);
      }
    }
  }

  return result;
}
