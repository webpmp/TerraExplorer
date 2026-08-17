import { describe, it, expect } from 'vitest';
import { MapMarker } from '../../types';

describe('Marker Lifecycle & InfoPanel Separation', () => {
  it('preserves discovery markers when InfoPanel is opened and closed', () => {
    let markers: MapMarker[] = [];
    let selectedMarkerId: string | null = null;
    let isInfoPanelOpen = false;
    const logs: string[] = [];

    // Helper functions simulating App.tsx
    const setDiscoveryResults = (newMarkers: MapMarker[]) => {
      markers = newMarkers;
      logs.push(`[Marker Lifecycle] DISCOVERY_RESULTS_SET count=${markers.length}`);
    };

    const selectMarker = (marker: MapMarker) => {
      selectedMarkerId = marker.id;
      isInfoPanelOpen = true;
      logs.push(`[Marker Lifecycle] MARKER_SELECTED name="${marker.name}"`);
      logs.push(`[Marker Lifecycle] INFOPANEL_OPEN`);
    };

    const closeInfoPanel = () => {
      selectedMarkerId = null;
      isInfoPanelOpen = false;
      // CRITICAL INVARIANT: do NOT clear markers!
      logs.push(`[Marker Lifecycle] INFOPANEL_CLOSED markersPreserved=${markers.length}`);
    };

    // 1. Discovery returns 6 markers
    const initialMarkers: MapMarker[] = [
      { id: '1', name: 'Place 1', lat: 34.0, lng: -118.0 },
      { id: '2', name: 'Place 2', lat: 34.1, lng: -118.1 },
      { id: '3', name: 'Place 3', lat: 34.2, lng: -118.2 },
      { id: '4', name: 'Place 4', lat: 34.3, lng: -118.3 },
      { id: '5', name: 'Place 5', lat: 34.4, lng: -118.4 },
      { id: '6', name: 'Place 6', lat: 34.5, lng: -118.5 }
    ];
    setDiscoveryResults(initialMarkers);
    expect(markers.length).toBe(6);

    // 2. Open InfoPanel on a marker
    selectMarker(markers[0]);
    expect(selectedMarkerId).toBe('1');
    expect(isInfoPanelOpen).toBe(true);
    expect(markers.length).toBe(6);

    // 3. Close InfoPanel
    closeInfoPanel();
    expect(selectedMarkerId).toBeNull();
    expect(isInfoPanelOpen).toBe(false);
    expect(markers.length).toBe(6); // Markers MUST still be 6!

    // 4. Select another marker and close again
    selectMarker(markers[2]);
    expect(selectedMarkerId).toBe('3');
    expect(isInfoPanelOpen).toBe(true);
    expect(markers.length).toBe(6);

    closeInfoPanel();
    expect(selectedMarkerId).toBeNull();
    expect(isInfoPanelOpen).toBe(false);
    expect(markers.length).toBe(6);

    expect(logs).toContain('[Marker Lifecycle] DISCOVERY_RESULTS_SET count=6');
    expect(logs).toContain('[Marker Lifecycle] MARKER_SELECTED name="Place 1"');
    expect(logs).toContain('[Marker Lifecycle] INFOPANEL_OPEN');
    expect(logs).toContain('[Marker Lifecycle] INFOPANEL_CLOSED markersPreserved=6');
  });

  it('replaces old markers only when a new discovery scan or new search occurs', () => {
    let markers: MapMarker[] = [
      { id: '1', name: 'Old Place', lat: 34.0, lng: -118.0 }
    ];
    const logs: string[] = [];

    const startNewScan = () => {
      logs.push(`[Marker Lifecycle] DISCOVERY_REPLACED oldCount=${markers.length} newCount=0`);
      markers = [];
    };

    const resolveNewScan = (newMarkers: MapMarker[]) => {
      markers = newMarkers;
      logs.push(`[Marker Lifecycle] DISCOVERY_RESULTS_SET count=${markers.length}`);
    };

    // User initiates new search or click
    startNewScan();
    expect(markers.length).toBe(0);

    resolveNewScan([
      { id: '2', name: 'New Place A', lat: 51.5, lng: -0.1 },
      { id: '3', name: 'New Place B', lat: 51.6, lng: -0.2 }
    ]);
    expect(markers.length).toBe(2);
    expect(markers[0].name).toBe('New Place A');
    expect(logs).toContain('[Marker Lifecycle] DISCOVERY_REPLACED oldCount=1 newCount=0');
    expect(logs).toContain('[Marker Lifecycle] DISCOVERY_RESULTS_SET count=2');
  });
});
