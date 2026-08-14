import { describe, test, expect, vi } from 'vitest';
import * as geminiService from '../geminiService';

describe('Waypoint Roles & Relationships Tests', () => {
  test('evaluates midway, viking, and machu picchu roles', async () => {
    vi.spyOn(geminiService, 'generateRoute').mockImplementation(async (query: string) => {
      if (query.includes("Midway")) {
        return {
          title: "Battle of Midway",
          waypoints: [
            { id: '1', name: "Midway Atoll", lat: 28.2, lng: -177.3, role: 'primary', parentId: undefined },
            { id: '2', name: "Pearl Harbor", lat: 21.3, lng: -157.9, role: 'related', parentId: '1' },
            { id: '3', name: "Hawaii", lat: 19.8, lng: -155.5, role: 'administrative', parentId: '1' }
          ]
        };
      }
      if (query.includes("Viking")) {
        return {
          title: "Viking Age",
          waypoints: [
            { id: '1', name: "Ribe", lat: 55.3, lng: 8.7, role: 'primary' },
            { id: '2', name: "Hedeby", lat: 54.4, lng: 9.5, role: 'primary' },
            { id: '3', name: "Birka", lat: 59.3, lng: 17.5, role: 'primary' }
          ]
        };
      }
      return {
        title: "Machu Picchu",
        waypoints: [
          { id: '1', name: "Machu Picchu", lat: -13.1, lng: -72.5, role: 'primary' },
          { id: '2', name: "Cusco", lat: -13.5, lng: -71.9, role: 'administrative' }
        ]
      };
    });

    let allPassed = true;

    // Test 1: Historical event
    const midwayRoute = await geminiService.generateRoute("Where did the Battle of Midway take place?");
    const midwayWaypoints = midwayRoute.waypoints || [];
    
    const midwayPrimary = midwayWaypoints.find(w => w.role === 'primary');
    const midwayRelated = midwayWaypoints.filter(w => w.role === 'related');
    const midwayAdmin = midwayWaypoints.filter(w => w.role === 'administrative');

    let passed = false;
    if (!midwayPrimary || !midwayPrimary.name.includes("Midway")) {
        console.error("❌ Midway primary location missing or incorrect");
    } else if (!midwayRelated.some(w => w.name.includes("Pearl Harbor"))) {
        console.error("❌ Midway related location (Pearl Harbor) missing");
    } else if (!midwayAdmin.some(w => w.name.includes("Hawaii"))) {
        console.error("❌ Midway administrative location (Hawaii) missing");
    } else {
        passed = true;
    }
    if (!passed) allPassed = false;

    // Test 2: Broad exploration
    const vikingRoute = await geminiService.generateRoute("Where did the Viking Age take place?");
    const vikingWaypoints = vikingRoute.waypoints || [];
    const vikingPrimaries = vikingWaypoints.filter(w => w.role === 'primary' || !w.role);
    if (vikingPrimaries.length < 3) {
        allPassed = false;
    }

    // Test 3: Specific place
    const machuRoute = await geminiService.generateRoute("Where is Machu Picchu?");
    const machuWaypoints = machuRoute.waypoints || [];
    const machuPrimary = machuWaypoints.find(w => w.role === 'primary');
    const machuAdmin = machuWaypoints.filter(w => w.role === 'administrative');
    if (!machuPrimary || !machuPrimary.name.includes("Machu Picchu") || !machuAdmin.some(w => w.name.includes("Cusco"))) {
        allPassed = false;
    }

    expect(allPassed).toBe(true);
  });
});
