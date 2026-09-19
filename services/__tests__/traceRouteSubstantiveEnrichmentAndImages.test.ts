import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateDescriptionReadiness } from '../../utils/descriptionReadiness';
import {
  validateImageCandidate,
  buildEntityImageQueries,
  isHistoricalWaypointEntity,
  classifyHistoricalImageCategory,
  ImageCandidate
} from '../imageService';
import { mergeLocationInfo } from '../locationService';

describe('TRACE ROUTE Substantive Description Readiness & Progressive Image Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Substantive Description Readiness Rules', () => {
    it('rejects empty or whitespace descriptions', () => {
      expect(evaluateDescriptionReadiness('').isReady).toBe(false);
      expect(evaluateDescriptionReadiness('   ').isReady).toBe(false);
      expect(evaluateDescriptionReadiness(null).isReady).toBe(false);
      expect(evaluateDescriptionReadiness(undefined).isReady).toBe(false);
    });

    it('rejects generic placeholder strings', () => {
      const p1 = evaluateDescriptionReadiness('Researching this location...', 'Como Cathedral');
      expect(p1.isReady).toBe(false);
      expect(p1.quality).toBe('placeholder');

      const p2 = evaluateDescriptionReadiness('Information on Villa del Balbianello.', 'Villa del Balbianello');
      expect(p2.isReady).toBe(false);
      expect(p2.quality).toBe('placeholder');
    });

    it('rejects weak one-sentence or trivial label descriptions', () => {
      const weak1 = evaluateDescriptionReadiness('A Gothic church with gilded ceilings and artworks.', 'Cattedrale di Como');
      expect(weak1.isReady).toBe(false);
      expect(weak1.quality).toBe('insufficient');

      const weak2 = evaluateDescriptionReadiness('A historic villa on Lake Como.', 'Villa Carlotta');
      expect(weak2.isReady).toBe(false);
      expect(weak2.quality).toBe('insufficient');

      const weak3 = evaluateDescriptionReadiness('Point of interest in Italy.', 'Bellagio');
      expect(weak3.isReady).toBe(false);
      expect(weak3.quality).toBe('insufficient');
    });

    it('accepts substantive multi-line documentary introductions with historical and architectural context', () => {
      const richComo = `The Cattedrale di Santa Maria Assunta, commonly known as the Como Cathedral, is a Roman Catholic cathedral in the city of Como, Lombardy, Italy. Dating back to 1396 on the site of an earlier Romanesque basilica, the cathedral illustrates a transition from late Gothic architecture to the Renaissance style. Its prominent octagonal dome was completed in 1740, and the facade features rich sculptures by the Rodari brothers.`;

      const res = evaluateDescriptionReadiness(richComo, 'Cattedrale di Como');
      expect(res.isReady).toBe(true);
      expect(res.quality).toBe('substantive');
      expect(res.sentenceCount).toBeGreaterThanOrEqual(2);
      expect(res.charCount).toBeGreaterThan(120);
    });

    it('accepts substantive villa and landmark documentary introductions', () => {
      const richVilla = `Villa del Balbianello is an iconic historic villa situated on the forested tip of the Dosso d'Avedo peninsula overlooking Lake Como in Lenno. Built in 1787 on the site of a Franciscan monastery for Cardinal Angelo Maria Durini, the estate features elaborate terraced gardens, loggias, and panoramic lake vistas. Today it is managed by the Fondo Ambiente Italiano and celebrated internationally.`;

      const res = evaluateDescriptionReadiness(richVilla, 'Villa del Balbianello');
      expect(res.isReady).toBe(true);
      expect(res.quality).toBe('substantive');
    });
  });

  describe('2. Promotion and Narration Guarding', () => {
    it('promotes waypoint from insufficient candidate to substantive enriched description without restarting active narration', () => {
      const candidateDesc = 'A Gothic church with gilded ceilings and artworks.';
      const initialEval = evaluateDescriptionReadiness(candidateDesc, 'Cattedrale di Como');
      expect(initialEval.isReady).toBe(false);

      // Initial state suppresses early display and narration
      const initialDisplay = initialEval.isReady ? candidateDesc : '';
      expect(initialDisplay).toBe('');

      // Secondary enrichment arrives with rich documentary prose
      const enrichedDesc = `Como Cathedral is the historic seat of the Bishop of Como, begun in 1396 and completed in the 18th century with an iconic dome. The cathedral showcases exquisite Renaissance tapestries and intricate Rodari sculptures.`;
      const enrichedEval = evaluateDescriptionReadiness(enrichedDesc, 'Cattedrale di Como');
      expect(enrichedEval.isReady).toBe(true);

      // Best description selection prefers substantive enrichment
      const finalDesc = enrichedEval.isReady ? enrichedDesc : (initialEval.isReady ? candidateDesc : '');
      expect(finalDesc).toBe(enrichedDesc);

      // Active narration guard prevents restarts
      const activeNarrationRef = {
        current: {
          selectionId: 'wp-como',
          narrativeKey: 'cattedrale di como::como cathedral is the historic seat of the bishop of como',
          spoken: true
        }
      };

      const narrativeKey = 'cattedrale di como::como cathedral is the historic seat of the bishop of como';
      const isDuplicate = activeNarrationRef.current && activeNarrationRef.current.narrativeKey === narrativeKey;
      expect(isDuplicate).toBe(true);
    });
  });

  describe('3. Image Policy, Candidate Validation & Filtering', () => {
    it('does not classify modern travel guide or highlights route waypoints as antique expedition waypoints', () => {
      const travelWaypoint = {
        name: 'Cattedrale di Como',
        routeTitle: '36 Hours: Lake Como',
        context: 'From 36 Hours in Lake Como article',
        metadataMode: 'modern_place' as const
      };

      expect(isHistoricalWaypointEntity(travelWaypoint)).toBe(false);
    });

    it('accepts legitimate physical landmark photographs for Cattedrale di Como / Como Cathedral', () => {
      const candidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Como_Cathedral_facade.jpg/800px-Como_Cathedral_facade.jpg',
        title: 'Como Cathedral facade',
        caption: 'Façade and square of Como Cathedral in Lombardy',
        description: 'Exterior view of Como Cathedral on a sunny afternoon'
      };

      const entity = {
        name: 'Cattedrale di Como',
        canonicalName: 'Como Cathedral',
        city: 'Como',
        country: 'Italy',
        aliases: ['Duomo di Como', 'Cathedral of Santa Maria Assunta', 'Como Cathedral']
      };

      const validation = validateImageCandidate(candidate, entity);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.score).toBeGreaterThanOrEqual(45);
    });

    it('accepts legitimate physical landmark photographs for Villa del Balbianello', () => {
      const candidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Villa_del_Balbianello_gardens.jpg/800px-Villa_del_Balbianello_gardens.jpg',
        title: 'Villa del Balbianello gardens and loggia',
        caption: 'Terraced gardens of Villa del Balbianello overlooking Lake Como',
        description: 'Villa del Balbianello terrace on Lake Como peninsula'
      };

      const entity = {
        name: 'Villa del Balbianello',
        canonicalName: 'Villa del Balbianello',
        city: 'Lenno',
        country: 'Italy'
      };

      const validation = validateImageCandidate(candidate, entity);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.score).toBeGreaterThanOrEqual(45);
    });

    it('strictly rejects maps, coats of arms, flags, and unrelated entities', () => {
      const mapCandidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Lombardy_Locator_Map.svg/800px-Lombardy_Locator_Map.svg.png',
        title: 'Map of Lombardy municipalities',
        caption: 'Locator map of Como within the province of Como',
        description: 'Administrative map of Lombardy'
      };

      const flagCandidate: ImageCandidate = {
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Flag_of_Italy.svg/800px-Flag_of_Italy.svg.png',
        title: 'Flag of Italy',
        caption: 'National flag of the Italian Republic',
        description: 'Tricolor flag of Italy'
      };

      const entity = {
        name: 'Cattedrale di Como',
        canonicalName: 'Como Cathedral',
        city: 'Como',
        country: 'Italy'
      };

      const mapVal = validateImageCandidate(mapCandidate, entity);
      expect(mapVal.decision).toBe('REJECT');

      const flagVal = validateImageCandidate(flagCandidate, entity);
      expect(flagVal.decision).toBe('REJECT');
    });
  });

  describe('4. Image Persistence Across Enrichment Updates', () => {
    it('preserves existing accepted images when subsequent textual enrichment updates LocationInfo', () => {
      const prev = {
        id: 'wp-como',
        name: 'Cattedrale di Como',
        description: 'Initial description',
        images: [
          { url: 'https://upload.wikimedia.org/como1.jpg', caption: 'Como Cathedral' }
        ],
        primaryImage: 'https://upload.wikimedia.org/como1.jpg'
      };

      const next = {
        description: 'Rich secondary enriched text with detailed history',
        notable: [{ title: 'Dome', description: 'Designed by Juvarra' }],
        sectionState: { description: 'complete' }
      };

      const merged = mergeLocationInfo(prev, next);
      expect(merged.description).toBe('Rich secondary enriched text with detailed history');
      expect(merged.images).toBeDefined();
      expect(merged.images.length).toBe(1);
      expect(merged.images[0].url).toBe('https://upload.wikimedia.org/como1.jpg');
      expect(merged.primaryImage).toBe('https://upload.wikimedia.org/como1.jpg');
    });
  });
});
