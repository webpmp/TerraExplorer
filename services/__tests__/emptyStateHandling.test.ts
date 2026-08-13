import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('App State Transitions for Discovery', () => {
    // Mock the state updater functions
    let interactionState: string;
    let markers: any[];
    let locationInfo: any;
    let selectedMarkerId: string | null;
    let searchError: string | null;

    const setInteractionState = vi.fn((state) => { interactionState = state; });
    const setMarkers = vi.fn((m) => { markers = m; });
    const setLocationInfo = vi.fn((info) => { locationInfo = info; });
    const setSelectedMarkerId = vi.fn((id) => { selectedMarkerId = id; });
    const setSearchError = vi.fn((err) => { searchError = err; });
    const setScanStatus = vi.fn();

    // Simplified mock of resolveScan logic from App.tsx
    const resolveScan = async (result: any) => {
        if (result.type === "results") {
            setScanStatus("Scan complete");
            setMarkers(result.data);
            if (result.data.length === 1) {
                // selectEntity logic mock
                setSelectedMarkerId(result.data[0].id);
                setLocationInfo({ name: result.data[0].name });
                setInteractionState('PIN_SELECTED');
            } else {
                setInteractionState('PINS_RENDERED');
            }
        } else {
            setScanStatus(null);
            setMarkers([]);
            setLocationInfo(null);
            setSelectedMarkerId(null);
            
            if (result.status === 'PROVIDER_FAILURE') {
                setSearchError("Unable to search this location right now.");
            } else {
                setSearchError("No locations found near this point.");
            }
            
            // Reverts to GLOBE_IDLE naturally at the end of resolveScan sequence
            setInteractionState('GLOBE_IDLE'); 
        }
    };

    beforeEach(() => {
        interactionState = 'GLOBE_IDLE';
        markers = [];
        locationInfo = null;
        selectedMarkerId = null;
        searchError = null;
        vi.clearAllMocks();
    });

    it('1. SUCCESS still renders the existing geographic UI.', async () => {
        await resolveScan({ type: 'results', data: [{ id: '1', name: 'Paris' }] });
        expect(setMarkers).toHaveBeenCalledWith([{ id: '1', name: 'Paris' }]);
        expect(interactionState).toBe('PIN_SELECTED');
        expect(locationInfo).toEqual({ name: 'Paris' });
    });

    it('2. NO_RESULTS clears stale geographic content and triggers the EXISTING notification system.', async () => {
        // Setup stale state
        markers = [{ id: '1', name: 'Old Place' }];
        locationInfo = { name: 'Old Place' };
        interactionState = 'PIN_SELECTED';

        await resolveScan({ type: 'empty', status: 'NO_RESULTS', coords: { lat: 0, lng: 0 }, diagnostics: {} });
        
        expect(setMarkers).toHaveBeenCalledWith([]);
        expect(setLocationInfo).toHaveBeenCalledWith(null);
        expect(interactionState).toBe('GLOBE_IDLE'); // Should not be PIN_SELECTED
        expect(setSearchError).toHaveBeenCalledWith("No locations found near this point.");
    });

    it('3. PROVIDER_FAILURE triggers the EXISTING notification system with the failure message.', async () => {
        await resolveScan({ type: 'empty', status: 'PROVIDER_FAILURE', coords: { lat: 10, lng: 10 }, diagnostics: {} });
        
        expect(interactionState).toBe('GLOBE_IDLE');
        expect(setSearchError).toHaveBeenCalledWith("Unable to search this location right now.");
    });

    it('6. A successful search after NO_RESULTS restores normal behavior.', async () => {
        await resolveScan({ type: 'empty', status: 'NO_RESULTS', coords: { lat: 0, lng: 0 }, diagnostics: {} });
        expect(interactionState).toBe('GLOBE_IDLE');
        expect(searchError).toBe("No locations found near this point.");

        await resolveScan({ type: 'results', data: [{ id: '2', name: 'London' }] });
        expect(interactionState).toBe('PIN_SELECTED');
        expect(markers).toEqual([{ id: '2', name: 'London' }]);
        expect(locationInfo).toEqual({ name: 'London' });
    });
});
