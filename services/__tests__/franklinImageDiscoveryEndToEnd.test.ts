import { describe, it, expect } from 'vitest';
import { DEFAULT_FRANKLIN_ROUTE } from '../../App';
import { validateImageCandidate, extractHistoricalImageContext, buildHistoricalImageQueries, buildEntityImageQueries, isHistoricalWaypointEntity, resolveImageIntent } from '../imageService';

describe('Franklin Expedition End-to-End Image Discovery & Validation Matrix', () => {
  const FRANKLIN_CANDIDATE_DATA: Record<string, any[]> = {
    'wp-fr-1': [
      {
        title: 'Greenhithe waterfront on the River Thames',
        description: 'Waterfront view of Greenhithe in Kent, England, departure point of the Franklin Expedition',
        url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Greenhithe_waterfront.jpg'
      }
    ],
    'wp-fr-2': [
      {
        title: 'Stromness Harbour, Orkney',
        description: 'View of Stromness harbour in Orkney, Scotland, last British port of call for HMS Erebus and HMS Terror',
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Stromness_Harbour.jpg'
      }
    ],
    'wp-fr-3': [
      {
        title: 'Whalefish Islands Disko Bay Greenland',
        description: 'Whalefish Islands off the coast of western Greenland where Franklin Expedition ships transferred final provisions',
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Whalefish_Islands.jpg'
      }
    ],
    'wp-fr-4': [
      {
        title: 'Lancaster Sound in the Canadian Arctic',
        description: 'Pack ice and waters in Lancaster Sound, the eastern gateway to the Northwest Passage',
        url: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Lancaster_Sound.jpg'
      }
    ],
    'wp-fr-5': [
      {
        title: 'Franklin Expedition Graves on Beechey Island',
        description: 'Headboards of the three Franklin expedition graves (Torrington, Hartnell, Braine) on the shore of Beechey Island',
        url: 'https://upload.wikimedia.org/wikipedia/commons/5/55/Beechey_Island_graves.jpg'
      }
    ],
    'wp-fr-6': [
      {
        title: 'Cornwallis Island coastal landscape',
        description: 'Arctic shoreline of Cornwallis Island in Nunavut, circumnavigated by Sir John Franklin in 1846',
        url: 'https://upload.wikimedia.org/wikipedia/commons/6/66/Cornwallis_Island.jpg'
      }
    ],
    'wp-fr-7': [
      {
        title: 'Peel Sound frozen strait',
        description: 'Sea ice in Peel Sound, Nunavut, where the Franklin Expedition ships sailed south towards King William Island',
        url: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Peel_Sound.jpg'
      }
    ],
    'wp-fr-8': [
      {
        title: 'Point Victory Cairn on King William Island',
        description: 'Historic cairn and site at Point Victory where the Franklin Expedition record paper was discovered in 1859',
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Point_Victory_cairn.jpg'
      }
    ],
    'wp-fr-9': [
      {
        title: 'HMS Terror wreck site in Terror Bay',
        description: 'Archaeological site and bay at Terror Bay, King William Island, where the wreck of HMS Terror was found in 2016',
        url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Terror_Bay_HMS_Terror.jpg'
      }
    ],
    'wp-fr-10': [
      {
        title: 'HMS Erebus discovery in Queen Maud Gulf',
        description: 'Underwater archaeological site in Queen Maud Gulf where the flagship HMS Erebus was discovered in 2014',
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Queen_Maud_Gulf_Erebus.jpg'
      }
    ]
  };

  it('validates authentic historical imagery for all 10 Franklin Expedition waypoints', () => {
    for (const wp of DEFAULT_FRANKLIN_ROUTE.waypoints!) {
      const candidates = FRANKLIN_CANDIDATE_DATA[wp.id];
      expect(candidates).toBeDefined();

      const histContext = extractHistoricalImageContext(wp as any);
      const intent = resolveImageIntent(wp as any);

      const entityAliases = Array.from(new Set([
        ...((wp as any).aliases || []),
        ...(histContext.artifacts || []),
        ...(histContext.people || [])
      ]));

      for (const candidate of candidates) {
        const validation = validateImageCandidate(candidate, {
          ...wp,
          aliases: entityAliases,
          imageIntent: intent
        } as any, intent);

        expect(
          validation.decision,
          `Waypoint ${wp.id} (${wp.name}) candidate "${candidate.title}" should be ACCEPTED. Got ${validation.decision} (${validation.reason})`
        ).toBe('ACCEPT');
      }
    }
  });
});
