import { describe, it, expect } from 'vitest';
import { DEFAULT_SHACKLETON_ROUTE, DEFAULT_FRANKLIN_ROUTE, DEFAULT_GENGHIS_ROUTE, DEFAULT_SAVED_ROUTES, isSavedWaypointComplete } from '../../App';
import { generateContextualChips, generateContextualQuestionChips } from '../followUpService';
import { resolveWaterAwareRoute } from '../geographic/waterRoutingService';

describe('Shackleton Diagnostic vs Other Saved Routes', () => {
  it('compares all Shackleton waypoints against Franklin and Genghis Khan', () => {
    console.log('=== SHACKLETON ROUTE DIAGNOSTIC ===');
    const shackleton = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-shackleton')!;
    expect(shackleton).toBeDefined();

    shackleton.waypoints?.forEach((wp, idx) => {
      const questionChips = generateContextualQuestionChips(wp);
      const contextualChips = generateContextualChips(wp, true);
      console.log(`[Shackleton WP ${idx + 1}] ID=${wp.id} Name="${wp.name}"`);
      console.log(`  entityType="${wp.entityType}" type="${(wp as any).type}" descLength=${wp.description?.length || 0}`);
      console.log(`  context="${wp.context}"`);
      console.log(`  routeTitle="${wp.routeTitle}" routeGroupId="${wp.routeGroupId}"`);
      console.log(`  climate=${JSON.stringify((wp as any).climate)} notableCount=${(wp as any).notable?.length || 0}`);
      console.log(`  followUpsCount=${(wp as any).followUps?.length || 0}`);
      console.log(`  questionChipsCount=${questionChips.length} chips=[${questionChips.join(' | ')}]`);
      console.log(`  contextualChipsCount=${contextualChips.length}`);
    });

    console.log('\n=== FRANKLIN ROUTE DIAGNOSTIC ===');
    const franklin = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-franklin')!;
    franklin.waypoints?.forEach((wp, idx) => {
      const questionChips = generateContextualQuestionChips(wp);
      const contextualChips = generateContextualChips(wp, true);
      console.log(`[Franklin WP ${idx + 1}] ID=${wp.id} Name="${wp.name}"`);
      console.log(`  questionChipsCount=${questionChips.length} chips=[${questionChips.join(' | ')}]`);
    });

    console.log('\n=== GENGHIS ROUTE DIAGNOSTIC ===');
    const genghis = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-genghis')!;
    genghis.waypoints?.forEach((wp, idx) => {
      const questionChips = generateContextualQuestionChips(wp);
      const contextualChips = generateContextualChips(wp, true);
      console.log(`[Genghis WP ${idx + 1}] ID=${wp.id} Name="${wp.name}"`);
      console.log(`  questionChipsCount=${questionChips.length} chips=[${questionChips.join(' | ')}]`);
    });
  });
});
