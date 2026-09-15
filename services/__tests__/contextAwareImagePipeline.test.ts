import { describe, it, expect } from 'vitest';
import {
  detectImageIntentCategory,
  classifyCandidateMedia,
  getPhotographicSuitability,
  getIntentMediaCompatibility,
  resolveImageIntent,
  validateImageCandidate,
  buildEntityImageQueries,
  ImageCandidate
} from '../imageService';

describe('Context-Aware Image Search Pipeline', () => {
  describe('1. Intent Detection', () => {
    it('infers PHYSICAL_LOCATION by default for location searches', () => {
      const intent1 = detectImageIntentCategory('Vatican City', 'Vatican City', 'city');
      expect(intent1.category).toBe('PHYSICAL_LOCATION');
      expect(intent1.explicitMediaIntent).toBe(false);

      const intent2 = detectImageIntentCategory('Paris', 'Paris', 'city');
      expect(intent2.category).toBe('PHYSICAL_LOCATION');
      expect(intent2.explicitMediaIntent).toBe(false);

      const intent3 = detectImageIntentCategory('Forbidden City', 'Forbidden City', 'landmark');
      expect(intent3.category).toBe('PHYSICAL_LOCATION');
      expect(intent3.explicitMediaIntent).toBe(false);
    });

    it('detects explicit media intent from natural language queries', () => {
      const coa = detectImageIntentCategory('Vatican City coat of arms', 'Vatican City', 'city');
      expect(coa.category).toBe('COAT_OF_ARMS');
      expect(coa.explicitMediaIntent).toBe(true);

      const flag = detectImageIntentCategory('Vatican City flag', 'Vatican City', 'city');
      expect(flag.category).toBe('FLAG');
      expect(flag.explicitMediaIntent).toBe(true);

      const map = detectImageIntentCategory('map of Vatican City', 'Vatican City', 'city');
      expect(map.category).toBe('MAP');
      expect(map.explicitMediaIntent).toBe(true);

      const seal = detectImageIntentCategory('seal of Vatican City', 'Vatican City', 'city');
      expect(seal.category).toBe('SEAL');
      expect(seal.explicitMediaIntent).toBe(true);

      const photos = detectImageIntentCategory('historical photos of Vatican City', 'Vatican City', 'city');
      expect(photos.category).toBe('HISTORICAL_PHOTOGRAPH');
      expect(photos.explicitMediaIntent).toBe(true);

      const painting = detectImageIntentCategory('Battle of Hastings painting', 'Battle of Hastings', 'historical_event');
      expect(painting.category).toBe('PAINTING');
      expect(painting.explicitMediaIntent).toBe(true);
    });

    it('detects historical event visual context', () => {
      const eventIntent = detectImageIntentCategory('Battle of Hastings', 'Battle of Hastings', 'historical_event');
      expect(eventIntent.category).toBe('HISTORICAL_EVENT');
      expect(eventIntent.explicitMediaIntent).toBe(false);
    });
  });

  describe('2. Media Classification & Compatibility', () => {
    it('classifies coats of arms, flags, seals, and SVGs accurately', () => {
      const coaCandidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Coat_of_arms_of_the_Vatican_City.svg/800px-Coat_of_arms_of_the_Vatican_City.svg.png',
        title: 'Coat of arms of the Vatican City',
        description: 'Coat of arms of the Holy See and Vatican City State'
      };
      const coaClass = classifyCandidateMedia(coaCandidate);
      expect(coaClass.mediaType).toBe('COAT_OF_ARMS');
      expect(getPhotographicSuitability(coaClass.mediaType)).toBe('NONE');

      const flagCandidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flag_of_the_Vatican_City.svg/800px-Flag_of_the_Vatican_City.svg.png',
        title: 'Flag of the Vatican City',
        description: 'National flag of the Vatican'
      };
      const flagClass = classifyCandidateMedia(flagCandidate);
      expect(flagClass.mediaType).toBe('FLAG');
      expect(getPhotographicSuitability(flagClass.mediaType)).toBe('NONE');
    });

    it('classifies genuine photographs and landmarks accurately', () => {
      const photoCandidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/St._Peter%27s_Square%2C_Vatican_City_-_April_2007.jpg/800px-St._Peter%27s_Square%2C_Vatican_City_-_April_2007.jpg',
        title: "St. Peter's Square, Vatican City",
        description: "View of St. Peter's Square and the Basilica from above"
      };
      const photoClass = classifyCandidateMedia(photoCandidate);
      expect(['PHOTOGRAPH', 'LOCATION_VIEW']).toContain(photoClass.mediaType);
      expect(getPhotographicSuitability(photoClass.mediaType)).toBe('HIGH');
    });

    it('computes intent-media compatibility correctly', () => {
      expect(getIntentMediaCompatibility('COAT_OF_ARMS', 'COAT_OF_ARMS').isExplicitMatch).toBe(true);
      expect(getIntentMediaCompatibility('COAT_OF_ARMS', 'COAT_OF_ARMS').compatibility).toBe('HIGH');
      expect(getIntentMediaCompatibility('COAT_OF_ARMS', 'PHOTOGRAPH').compatibility).toBe('LOW');

      expect(getIntentMediaCompatibility('PHYSICAL_LOCATION', 'COAT_OF_ARMS').compatibility).toBe('INCOMPATIBLE');
      expect(getIntentMediaCompatibility('PHYSICAL_LOCATION', 'FLAG').compatibility).toBe('INCOMPATIBLE');
      expect(getIntentMediaCompatibility('PHYSICAL_LOCATION', 'PHOTOGRAPH').compatibility).toBe('HIGH');

      expect(getIntentMediaCompatibility('HISTORICAL_EVENT', 'PAINTING').compatibility).toBe('HIGH');
      expect(getIntentMediaCompatibility('HISTORICAL_EVENT', 'MAP').compatibility).toBe('HIGH');
    });
  });

  describe('3. Default Location Searches (Vatican City)', () => {
    const vaticanEntity = {
      name: 'Vatican City',
      canonicalName: 'Vatican City',
      city: 'Vatican City',
      country: 'Vatican City',
      entityType: 'city',
      rawQuery: 'Vatican City'
    };

    it('accepts genuine photographs and landmarks of Vatican City', () => {
      const stPeters: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/St_Peters_Basilica.jpg',
        title: "St. Peter's Basilica, Vatican City",
        description: "Front facade view of St. Peter's Basilica in Vatican City."
      };
      const resStPeters = validateImageCandidate(stPeters, vaticanEntity);
      expect(resStPeters.decision).toBe('ACCEPT');
      expect(resStPeters.score).toBeGreaterThanOrEqual(60);

      const stPetersSquare: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/St_Peters_Square.jpg',
        title: "St. Peter's Square, Vatican City",
        description: "Panoramic view of Saint Peter's Square in Vatican City."
      };
      const resSquare = validateImageCandidate(stPetersSquare, vaticanEntity);
      expect(resSquare.decision).toBe('ACCEPT');

      const vaticanGardens: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Vatican_Gardens.jpg',
        title: 'Vatican Gardens, Vatican City',
        description: 'Landscape photograph of the Vatican Gardens.'
      };
      const resGardens = validateImageCandidate(vaticanGardens, vaticanEntity);
      expect(resGardens.decision).toBe('ACCEPT');

      const histPhoto1944: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Vatican_1944_photo.jpg',
        title: 'Vatican City in 1944',
        description: 'Historical photograph of Vatican City during World War II in 1944.'
      };
      const resHistPhoto = validateImageCandidate(histPhoto1944, vaticanEntity);
      expect(resHistPhoto.decision).toBe('ACCEPT');
    });

    it('rejects non-photographic administrative graphics (Coat of arms, Flag, Seal, Logo, Map) for default location search', () => {
      const coa: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Coat_of_arms_of_the_Vatican_City.svg/800px-Coat_of_arms_of_the_Vatican_City.svg.png',
        title: 'Coat of arms of the Vatican City',
        description: 'Coat of arms of the Holy See and Vatican City State'
      };
      const resCoa = validateImageCandidate(coa, vaticanEntity);
      expect(resCoa.decision).toBe('REJECT');
      expect(['NON_PHOTOGRAPHIC_MEDIA_FOR_LOCATION_INTENT', 'Generic national flag, insufficient entity relevance']).toContain(resCoa.reason);

      const flag: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flag_of_the_Vatican_City.svg/800px-Flag_of_the_Vatican_City.svg.png',
        title: 'Flag of the Vatican City',
        description: 'National flag of the Vatican'
      };
      const resFlag = validateImageCandidate(flag, vaticanEntity);
      expect(resFlag.decision).toBe('REJECT');

      const seal: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Seal_of_Vatican_City.svg/800px-Seal_of_Vatican_City.svg.png',
        title: 'Seal of the Vatican City',
        description: 'Official seal of Vatican City'
      };
      const resSeal = validateImageCandidate(seal, vaticanEntity);
      expect(resSeal.decision).toBe('REJECT');

      const map: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Map_of_Vatican_City.png',
        title: 'Map of Vatican City',
        description: 'Locator diagram and map of Vatican City territory'
      };
      const resMap = validateImageCandidate(map, vaticanEntity);
      expect(resMap.decision).toBe('REJECT');
    });
  });

  describe('4. Explicit Media Searches', () => {
    it('accepts Coat of arms when explicitly requested: "Vatican City coat of arms"', () => {
      const queryEntity = {
        name: 'Vatican City',
        canonicalName: 'Vatican City',
        city: 'Vatican City',
        rawQuery: 'Vatican City coat of arms'
      };

      const coa: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Coat_of_arms_of_the_Vatican_City.svg/800px-Coat_of_arms_of_the_Vatican_City.svg.png',
        title: 'Coat of arms of the Vatican City',
        description: 'Coat of arms of Vatican City State'
      };
      const res = validateImageCandidate(coa, queryEntity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(100); // Tier 1 + 60 explicit boost

      const photo: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/St_Peters_Basilica.jpg',
        title: "St. Peter's Basilica, Vatican City",
        description: "Front facade view of St. Peter's Basilica in Vatican City."
      };
      const photoRes = validateImageCandidate(photo, queryEntity);
      // Photo score must be significantly lower than Coat of Arms score
      expect(res.score).toBeGreaterThan(photoRes.score);
    });

    it('accepts Flag when explicitly requested: "Vatican City flag"', () => {
      const queryEntity = {
        name: 'Vatican City',
        canonicalName: 'Vatican City',
        rawQuery: 'Vatican City flag'
      };

      const flag: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flag_of_the_Vatican_City.svg/800px-Flag_of_the_Vatican_City.svg.png',
        title: 'Flag of the Vatican City',
        description: 'National flag of the Vatican'
      };
      const res = validateImageCandidate(flag, queryEntity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(100);
    });

    it('accepts Map when explicitly requested: "map of Vatican City"', () => {
      const queryEntity = {
        name: 'Vatican City',
        canonicalName: 'Vatican City',
        rawQuery: 'map of Vatican City'
      };

      const map: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Map_of_Vatican_City.png',
        title: 'Map of Vatican City',
        description: 'Locator diagram and map of Vatican City territory'
      };
      const res = validateImageCandidate(map, queryEntity);
      expect(res.decision).toBe('ACCEPT');
      expect(res.score).toBeGreaterThanOrEqual(100);
    });
  });

  describe('5. Historical Events (Battle of Hastings)', () => {
    const hastingsEntity = {
      name: 'Battle of Hastings',
      canonicalName: 'Battle of Hastings',
      entityType: 'historical_event',
      rawQuery: 'Battle of Hastings'
    };

    it('accepts paintings, illustrations, battle maps, and battlefield photographs for Battle of Hastings by default', () => {
      const painting: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Battle_of_Hastings_painting.jpg',
        title: 'Battle of Hastings',
        description: '19th century historical painting depicting the Battle of Hastings by Francois-Joseph Heim'
      };
      const resPainting = validateImageCandidate(painting, hastingsEntity);
      expect(resPainting.decision).toBe('ACCEPT');

      const illustration: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Bayeux_Tapestry_scene.jpg',
        title: 'Battle of Hastings in Bayeux Tapestry',
        description: 'Historical illustration and embroidery of the Battle of Hastings'
      };
      const resIllustration = validateImageCandidate(illustration, hastingsEntity);
      expect(resIllustration.decision).toBe('ACCEPT');

      const battleMap: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Battle_of_Hastings_map.png',
        title: 'Map of the Battle of Hastings',
        description: 'Troop disposition map showing Anglo-Saxon and Norman lines at the Battle of Hastings'
      };
      const resMap = validateImageCandidate(battleMap, hastingsEntity);
      expect(resMap.decision).toBe('ACCEPT');

      const battlefieldPhoto: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Battle_Abbey_battlefield.jpg',
        title: 'Battle of Hastings battlefield at Battle Abbey',
        description: 'Photograph of the historic battlefield hill in East Sussex'
      };
      const resPhoto = validateImageCandidate(battlefieldPhoto, hastingsEntity);
      expect(resPhoto.decision).toBe('ACCEPT');
    });

    it('prioritizes requested media type for explicit event query: "Battle of Hastings painting"', () => {
      const explicitEntity = {
        name: 'Battle of Hastings',
        canonicalName: 'Battle of Hastings',
        entityType: 'historical_event',
        rawQuery: 'Battle of Hastings painting'
      };

      const painting: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Battle_of_Hastings_painting.jpg',
        title: 'Battle of Hastings',
        description: '19th century historical painting depicting the Battle of Hastings'
      };
      const resPainting = validateImageCandidate(painting, explicitEntity);
      expect(resPainting.decision).toBe('ACCEPT');
      expect(resPainting.score).toBeGreaterThanOrEqual(100);
    });
  });

  describe('6. Famous Landmarks Preservation', () => {
    it('generates rich photo-first queries for Eiffel Tower, Statue of Liberty, Grand Canyon, and Forbidden City', () => {
      const eiffelQueries = buildEntityImageQueries({
        name: 'Eiffel Tower',
        canonicalName: 'Eiffel Tower',
        city: 'Paris',
        country: 'France',
        entityType: 'monument'
      });
      expect(eiffelQueries).toContain('Eiffel Tower');
      expect(eiffelQueries).toContain('Eiffel Tower France');

      const forbiddenQueries = buildEntityImageQueries({
        name: 'Forbidden City',
        canonicalName: 'Forbidden City',
        city: 'Beijing',
        country: 'China',
        entityType: 'palace'
      });
      expect(forbiddenQueries).toContain('Forbidden City');
      expect(forbiddenQueries).toContain('Forbidden City Palace Museum Beijing');
    });
  });
});
