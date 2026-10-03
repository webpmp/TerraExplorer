import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../../components/Controls';
import { DEFAULT_SHACKLETON_ROUTE, DEFAULT_GENGHIS_ROUTE, DEFAULT_SAVED_ROUTES, isSavedWaypointComplete } from '../../App';
import { generateContextualChips } from '../followUpService';
import { resolveWaterAwareRoute } from '../geographic/waterRoutingService';
import { LocationInfo, LocationType, Waypoint } from '../../types';

describe('[SHACKLETON CHIPS TRACE] Full Lifecycle Trace', () => {
  const baseControlsProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'modern' as const,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isNarrationEnabled: true,
    onToggleNarration: vi.fn(),
    isNarrationAvailable: true,
    showNews: true,
    isScanningArea: false,
    onCancelScan: vi.fn(),
    onCycleSkin: vi.fn(),
    isSettingsOpen: false,
    onToggleSettings: vi.fn(),
    onOpenSettingsTab: vi.fn(),
    isOSMDisplayed: false
  };

  it('traces Shackleton wp-shackleton-1 vs Genghis Khan wp-genghis-1 through all 7 stages', () => {
    console.log('\n================== TRACE 1: SHACKLETON EXPEDITION -> WAYPOINT 1 (PLYMOUTH) ==================');
    const shackletonRoute = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-shackleton') || DEFAULT_SHACKLETON_ROUTE;
    const shackletonWps = resolveWaterAwareRoute(shackletonRoute.waypoints!, { title: shackletonRoute.name });
    const wp1 = shackletonWps[0];

    // Stage 1: loadWaypointData input
    const isSavedWp1 = Boolean(
      (wp1.isSaved && (wp1.description || wp1.savedSnapshot)) ||
      (wp1.savedSnapshot && wp1.savedSnapshot.description) ||
      Boolean(shackletonRoute && wp1.description)
    );
    const isComplete1 = isSavedWaypointComplete(wp1);
    const snapshot1 = wp1.savedSnapshot;

    console.log(`[SHACKLETON CHIPS TRACE] 1. loadWaypointData input: id="${wp1.id}" name="${wp1.name}" savedSnapshotPresent=${Boolean(snapshot1)} followUps=${JSON.stringify(snapshot1?.followUps || [])} descriptionLength=${snapshot1?.description?.length || wp1.description?.length || 0} isSavedWp=${isSavedWp1} isSavedContentComplete=${isComplete1}`);

    // Stage 2: restoredPayload constructed
    const restoredPayload1: LocationInfo = {
      id: wp1.id,
      name: wp1.name,
      canonicalName: wp1.canonicalName || snapshot1?.canonicalName || wp1.name,
      coordinates: { lat: wp1.lat, lng: wp1.lng },
      waypoint: wp1,
      type: (wp1.entityType as any) || snapshot1?.type || LocationType.POI,
      entityType: wp1.entityType || snapshot1?.entityType || "landmark",
      description: (snapshot1?.description || wp1.description || "").trim(),
      historicalContext: wp1.context || wp1.historicalContext || snapshot1?.historicalContext,
      routeTitle: wp1.routeTitle || wp1.routeGroupName || snapshot1?.routeTitle || shackletonRoute.name,
      routeGroupId: wp1.routeGroupId || snapshot1?.routeGroupId,
      routeContext: wp1.context ? {
        title: wp1.routeGroupName || wp1.routeTitle || shackletonRoute.name || "Route Context",
        text: wp1.context
      } : (snapshot1?.routeContext || undefined),
      climate: wp1.climate || snapshot1?.climate,
      notable: wp1.notable || snapshot1?.notable || [],
      images: wp1.images || snapshot1?.images || [],
      followUps: wp1.followUps || snapshot1?.followUps || [],
      news: wp1.news || snapshot1?.news || [],
      status: "success",
      sectionState: { description: "ready", news: "idle", images: "ready", nearby: "ready" }
    };

    console.log(`[SHACKLETON CHIPS TRACE] 2. restoredPayload constructed: id="${restoredPayload1.id}" name="${restoredPayload1.name}" descLength=${restoredPayload1.description?.length || 0} notableCount=${restoredPayload1.notable?.length || 0} climate=${JSON.stringify(restoredPayload1.climate)} historicalContext="${restoredPayload1.historicalContext || ''}" type="${restoredPayload1.type}" entityType="${restoredPayload1.entityType}" routeContext=${JSON.stringify(restoredPayload1.routeContext)} followUpsCount=${restoredPayload1.followUps?.length || 0}`);

    // Stage 3: activeLocationContext prop
    const locationInfo1 = restoredPayload1;
    const interactionState1 = 'PIN_SELECTED';
    const computedActiveLocationContext1 = (locationInfo1 && interactionState1 === 'PIN_SELECTED')
      ? locationInfo1
      : null;

    const isSameAsLocationInfo1 = computedActiveLocationContext1 === locationInfo1;
    console.log(`[SHACKLETON CHIPS TRACE] 3. activeLocationContext prop: id="${(computedActiveLocationContext1 as any)?.id}" name="${computedActiveLocationContext1?.name}" isSameAsLocationInfo=${isSameAsLocationInfo1} descLength=${computedActiveLocationContext1?.description?.length || 0} notableCount=${(computedActiveLocationContext1 as any)?.notable?.length || 0} climate=${JSON.stringify((computedActiveLocationContext1 as any)?.climate)} historicalContext="${(computedActiveLocationContext1 as any)?.historicalContext || ''}" type="${(computedActiveLocationContext1 as any)?.type}" entityType="${computedActiveLocationContext1?.entityType}" routeContext=${JSON.stringify((computedActiveLocationContext1 as any)?.routeContext)} followUpsCount=${(computedActiveLocationContext1 as any)?.followUps?.length || 0}`);

    // Stage 4: generateContextualChips
    const chips1 = computedActiveLocationContext1 ? generateContextualChips(computedActiveLocationContext1, true) : [];
    console.log(`[SHACKLETON CHIPS TRACE] 4. generateContextualChips: id="${(computedActiveLocationContext1 as any)?.id}" name="${computedActiveLocationContext1?.name}" chipCount=${chips1.length} chips=[${chips1.map(c => c.label).join(' | ')}]`);

    // Stage 5, 6, 7: Render Controls in modern, retro-green, retro-amber, parchment
    const skins: Array<'modern' | 'retro-green' | 'retro-amber' | 'parchment'> = ['modern', 'retro-green', 'retro-amber', 'parchment'];

    for (const skin of skins) {
      console.log(`\n--- Testing Shackleton in Skin: ${skin} ---`);
      const scanningStatusText: string | null = null;
      const isNonParchment = skin !== 'parchment';
      const hasChips = chips1.length > 0;
      const isScanningAllowed = !scanningStatusText || scanningStatusText.toUpperCase().includes("RESEARCHING FOLLOW-UP");
      const shouldRender = isNonParchment && hasChips && isScanningAllowed;

      console.log(`[SHACKLETON CHIPS TRACE] 5. Controls JSX condition: chipsLength=${chips1.length} scanningStatusText="${scanningStatusText}" skin="${skin}" isNonParchment=${isNonParchment} hasChips=${hasChips} isScanningAllowed=${isScanningAllowed} shouldRenderChips=${shouldRender}`);

      const html = renderToStaticMarkup(
        <Controls
          {...baseControlsProps}
          skin={skin}
          scanningStatusText={scanningStatusText}
          activeWaypointTitle={wp1.name}
          activeLocationContext={computedActiveLocationContext1}
        />
      );

      if (shouldRender) {
        expect(html).toContain('data-testid="contextual-chips-container"');
      } else {
        expect(html).not.toContain('data-testid="contextual-chips-container"');
      }
    }

    console.log('\n================== TRACE 2: GENGHIS KHAN -> WAYPOINT 1 (BURKHAN KHALDUN) ==================');
    const genghisRoute = DEFAULT_SAVED_ROUTES.find(r => r.id === 'default-genghis') || DEFAULT_GENGHIS_ROUTE;
    const genghisWps = resolveWaterAwareRoute(genghisRoute.waypoints!, { title: genghisRoute.name });
    const gwp1 = genghisWps[0];

    // Stage 1: loadWaypointData input
    const isSavedWpG = Boolean(
      (gwp1.isSaved && (gwp1.description || gwp1.savedSnapshot)) ||
      (gwp1.savedSnapshot && gwp1.savedSnapshot.description) ||
      Boolean(genghisRoute && gwp1.description)
    );
    const isCompleteG = isSavedWaypointComplete(gwp1);
    const snapshotG = gwp1.savedSnapshot;

    console.log(`[SHACKLETON CHIPS TRACE] 1. loadWaypointData input: id="${gwp1.id}" name="${gwp1.name}" savedSnapshotPresent=${Boolean(snapshotG)} followUps=${JSON.stringify(snapshotG?.followUps || [])} descriptionLength=${snapshotG?.description?.length || gwp1.description?.length || 0} isSavedWp=${isSavedWpG} isSavedContentComplete=${isCompleteG}`);

    // Stage 2: restoredPayload constructed
    const restoredPayloadG: LocationInfo = {
      id: gwp1.id,
      name: gwp1.name,
      canonicalName: gwp1.canonicalName || snapshotG?.canonicalName || gwp1.name,
      coordinates: { lat: gwp1.lat, lng: gwp1.lng },
      waypoint: gwp1,
      type: (gwp1.entityType as any) || snapshotG?.type || LocationType.POI,
      entityType: gwp1.entityType || snapshotG?.entityType || "landmark",
      description: (snapshotG?.description || gwp1.description || "").trim(),
      historicalContext: gwp1.context || gwp1.historicalContext || snapshotG?.historicalContext,
      routeTitle: gwp1.routeTitle || gwp1.routeGroupName || snapshotG?.routeTitle || genghisRoute.name,
      routeGroupId: gwp1.routeGroupId || snapshotG?.routeGroupId,
      routeContext: gwp1.context ? {
        title: gwp1.routeGroupName || gwp1.routeTitle || genghisRoute.name || "Route Context",
        text: gwp1.context
      } : (snapshotG?.routeContext || undefined),
      climate: gwp1.climate || snapshotG?.climate,
      notable: gwp1.notable || snapshotG?.notable || [],
      images: gwp1.images || snapshotG?.images || [],
      followUps: gwp1.followUps || snapshotG?.followUps || [],
      news: gwp1.news || snapshotG?.news || [],
      status: "success",
      sectionState: { description: "ready", news: "idle", images: "ready", nearby: "ready" }
    };

    console.log(`[SHACKLETON CHIPS TRACE] 2. restoredPayload constructed: id="${restoredPayloadG.id}" name="${restoredPayloadG.name}" descLength=${restoredPayloadG.description?.length || 0} notableCount=${restoredPayloadG.notable?.length || 0} climate=${JSON.stringify(restoredPayloadG.climate)} historicalContext="${restoredPayloadG.historicalContext || ''}" type="${restoredPayloadG.type}" entityType="${restoredPayloadG.entityType}" routeContext=${JSON.stringify(restoredPayloadG.routeContext)} followUpsCount=${restoredPayloadG.followUps?.length || 0}`);

    // Stage 3: activeLocationContext prop
    const locationInfoG = restoredPayloadG;
    const interactionStateG = 'PIN_SELECTED';
    const computedActiveLocationContextG = (locationInfoG && interactionStateG === 'PIN_SELECTED')
      ? locationInfoG
      : null;

    const isSameAsLocationInfoG = computedActiveLocationContextG === locationInfoG;
    console.log(`[SHACKLETON CHIPS TRACE] 3. activeLocationContext prop: id="${(computedActiveLocationContextG as any)?.id}" name="${computedActiveLocationContextG?.name}" isSameAsLocationInfo=${isSameAsLocationInfoG} descLength=${computedActiveLocationContextG?.description?.length || 0} notableCount=${(computedActiveLocationContextG as any)?.notable?.length || 0} climate=${JSON.stringify((computedActiveLocationContextG as any)?.climate)} historicalContext="${(computedActiveLocationContextG as any)?.historicalContext || ''}" type="${(computedActiveLocationContextG as any)?.type}" entityType="${computedActiveLocationContextG?.entityType}" routeContext=${JSON.stringify((computedActiveLocationContextG as any)?.routeContext)} followUpsCount=${(computedActiveLocationContextG as any)?.followUps?.length || 0}`);

    // Stage 4: generateContextualChips
    const chipsG = computedActiveLocationContextG ? generateContextualChips(computedActiveLocationContextG, true) : [];
    console.log(`[SHACKLETON CHIPS TRACE] 4. generateContextualChips: id="${(computedActiveLocationContextG as any)?.id}" name="${computedActiveLocationContextG?.name}" chipCount=${chipsG.length} chips=[${chipsG.map(c => c.label).join(' | ')}]`);

    for (const skin of skins) {
      console.log(`\n--- Testing Genghis Khan in Skin: ${skin} ---`);
      const scanningStatusText: string | null = null;
      const isNonParchment = skin !== 'parchment';
      const hasChips = chipsG.length > 0;
      const isScanningAllowed = !scanningStatusText || scanningStatusText.toUpperCase().includes("RESEARCHING FOLLOW-UP");
      const shouldRender = isNonParchment && hasChips && isScanningAllowed;

      console.log(`[SHACKLETON CHIPS TRACE] 5. Controls JSX condition: chipsLength=${chipsG.length} scanningStatusText="${scanningStatusText}" skin="${skin}" isNonParchment=${isNonParchment} hasChips=${hasChips} isScanningAllowed=${isScanningAllowed} shouldRenderChips=${shouldRender}`);

      const html = renderToStaticMarkup(
        <Controls
          {...baseControlsProps}
          skin={skin}
          scanningStatusText={scanningStatusText}
          activeWaypointTitle={gwp1.name}
          activeLocationContext={computedActiveLocationContextG}
        />
      );

      if (shouldRender) {
        expect(html).toContain('data-testid="contextual-chips-container"');
      } else {
        expect(html).not.toContain('data-testid="contextual-chips-container"');
      }
    }
  });
});
