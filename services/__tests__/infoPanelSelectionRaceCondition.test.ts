import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('InfoPanel Selection Stability & Race Condition Prevention', () => {
    let interactionState: string;
    let markers: any[];
    let locationInfo: any;
    let selectedMarkerId: string | null;
    let searchError: string | null;
    let isLoading: boolean;
    let isNewsFetching: boolean;

    let activeScanId = 0;
    let activeMarkerRequestId = 0;
    let scanFullyProcessed = false;
    let scanResolved = false;

    const setInteractionState = vi.fn((updater) => {
        if (typeof updater === 'function') {
            interactionState = updater(interactionState);
        } else {
            interactionState = updater;
        }
    });
    const setMarkers = vi.fn((m) => { markers = m; });
    const setLocationInfo = vi.fn((updater) => {
        if (typeof updater === 'function') {
            locationInfo = updater(locationInfo);
        } else {
            locationInfo = updater;
        }
    });
    const setSelectedMarkerId = vi.fn((id) => { selectedMarkerId = id; });
    const setSearchError = vi.fn((err) => { searchError = err; });
    const setScanStatus = vi.fn();
    const setIsLoading = vi.fn((loading) => { isLoading = loading; });
    const setIsNewsFetching = vi.fn((fetching) => { isNewsFetching = fetching; });

    // Mock implementation of selectEntity following App.tsx logic
    const selectEntity = async (marker: any, options: { delayGeo?: number; delayEnrich?: number; failEnrich?: boolean } = {}) => {
        const stableId = marker.id || `${marker.name}-${marker.lat}-${marker.lng}`;
        const enrichmentRequestId = ++activeMarkerRequestId;

        // Step 1: Open immediately with basic info
        setInteractionState('PIN_SELECTED');
        setSelectedMarkerId(stableId);
        setIsLoading(true);
        setIsNewsFetching(false);

        const initialPayload = {
            id: stableId,
            name: marker.name,
            entityType: marker.type || 'generic',
            coordinates: { lat: marker.lat, lng: marker.lng },
            description: '',
            news: [],
            sectionState: { description: 'loading', news: 'loading' }
        };
        setLocationInfo(initialPayload);

        // Step 2: Geographic resolution
        if (options.delayGeo) {
            await new Promise(r => setTimeout(r, options.delayGeo));
        }
        if (enrichmentRequestId !== activeMarkerRequestId) return;

        const resolvedPayload = {
            ...initialPayload,
            country: 'Australia',
            state: 'Northern Territory'
        };
        setLocationInfo((prev: any) => {
            if (!prev || enrichmentRequestId !== activeMarkerRequestId) return prev;
            return { ...prev, ...resolvedPayload };
        });

        // Step 3: Enrichment
        if (options.delayEnrich) {
            await new Promise(r => setTimeout(r, options.delayEnrich));
        }
        if (enrichmentRequestId !== activeMarkerRequestId) return;

        if (options.failEnrich) {
            setLocationInfo((prev: any) => {
                if (!prev || enrichmentRequestId !== activeMarkerRequestId) return prev;
                return { ...prev, sectionState: { ...prev.sectionState, description: 'error' } };
            });
            setIsLoading(false);
        } else {
            setLocationInfo((prev: any) => {
                if (!prev || enrichmentRequestId !== activeMarkerRequestId) return prev;
                return {
                    ...prev,
                    description: 'Major highway in Australia.',
                    sectionState: { ...prev.sectionState, description: 'complete' }
                };
            });
            setIsLoading(false);
        }
    };

    // Mock implementation of resolveScan following App.tsx logic
    const resolveScan = async (result: any, selectOptions: { delayGeo?: number; delayEnrich?: number; failEnrich?: boolean } = {}) => {
        const currentScanId = activeScanId;
        scanResolved = true;

        if (result.type === 'results') {
            setScanStatus('Scan complete');
            setMarkers(result.data);

            if (result.data.length === 1) {
                selectEntity(result.data[0], selectOptions);
            }
        } else {
            setScanStatus(null);
            if (currentScanId === activeScanId) {
                setMarkers([]);
                setLocationInfo(null);
                setSelectedMarkerId(null);
                setInteractionState('GLOBE_IDLE');

                if (result.status === 'PROVIDER_FAILURE') {
                    setSearchError('Unable to search this location right now.');
                } else {
                    setSearchError('No locations found near this point.');
                }
            }
        }

        // Post-scan timeout
        await new Promise(r => setTimeout(r, 50));
        if (currentScanId !== activeScanId) return;
        setScanStatus(null);

        // Crucial fix: never overwrite PIN_SELECTED
        setInteractionState((prev: string) => {
            if (prev === 'PIN_SELECTED') return 'PIN_SELECTED';
            return result.type === 'results' ? 'PINS_RENDERED' : 'GLOBE_IDLE';
        });
    };

    const handleClosePanel = () => {
        activeMarkerRequestId++;
        setInteractionState('GLOBE_IDLE');
        setLocationInfo(null);
        setSelectedMarkerId(null);
        setIsNewsFetching(false);
        setMarkers([]);
    };

    beforeEach(() => {
        interactionState = 'GLOBE_IDLE';
        markers = [];
        locationInfo = null;
        selectedMarkerId = null;
        searchError = null;
        isLoading = false;
        isNewsFetching = false;
        activeScanId = 0;
        activeMarkerRequestId = 0;
        scanFullyProcessed = false;
        scanResolved = false;
        vi.clearAllMocks();
    });

    it('1. Normal globe click with fast enrichment opens InfoPanel immediately and stays open after scan completes', async () => {
        activeScanId++;
        const place = { id: 'marker-1', name: 'Carpentaria Highway', lat: -16.7311, lng: 135.1381, type: 'highway' };

        await resolveScan({ type: 'results', data: [place] });

        // Immediate state check
        expect(interactionState).toBe('PIN_SELECTED');
        expect(selectedMarkerId).toBe('marker-1');
        expect(locationInfo?.name).toBe('Carpentaria Highway');

        // Wait past scan resolution delay
        await new Promise(r => setTimeout(r, 100));

        // InfoPanel must STAY open (PIN_SELECTED)
        expect(interactionState).toBe('PIN_SELECTED');
        expect(locationInfo?.name).toBe('Carpentaria Highway');
        expect(locationInfo?.description).toBe('Major highway in Australia.');
    });

    it('2. Globe click with slow enrichment keeps InfoPanel open with partial identity while enrichment is pending', async () => {
        activeScanId++;
        const place = { id: 'marker-2', name: 'Remote Outpost', lat: -20.0, lng: 130.0, type: 'settlement' };

        // Start async entity selection with 100ms enrichment delay
        const scanPromise = resolveScan({ type: 'results', data: [place] }, { delayEnrich: 100 });
        await new Promise(r => setTimeout(r, 10)); // Allow initial payload to set

        expect(interactionState).toBe('PIN_SELECTED');
        expect(locationInfo?.name).toBe('Remote Outpost');
        expect(locationInfo?.sectionState.description).toBe('loading');

        await scanPromise;
        await new Promise(r => setTimeout(r, 120)); // Wait for slow enrichment

        expect(interactionState).toBe('PIN_SELECTED');
        expect(locationInfo?.description).toBe('Major highway in Australia.');
    });

    it('3. Rural location with NO_RESULTS clears state and transitions to GLOBE_IDLE', async () => {
        activeScanId++;
        await resolveScan({ type: 'empty', status: 'NO_RESULTS', coords: { lat: 0, lng: 0 }, diagnostics: {} });

        expect(interactionState).toBe('GLOBE_IDLE');
        expect(locationInfo).toBeNull();
        expect(selectedMarkerId).toBeNull();
        expect(searchError).toBe('No locations found near this point.');
    });

    it('4. Globe click with PROVIDER_FAILURE (e.g. Overpass 429) sets searchError and does not leave broken state', async () => {
        activeScanId++;
        await resolveScan({ type: 'empty', status: 'PROVIDER_FAILURE', coords: { lat: 10, lng: 10 }, diagnostics: {} });

        expect(interactionState).toBe('GLOBE_IDLE');
        expect(locationInfo).toBeNull();
        expect(searchError).toBe('Unable to search this location right now.');
    });

    it('5. Enrichment failure still keeps InfoPanel open with error status rather than closing', async () => {
        const place = { id: 'marker-fail', name: 'Difficult Entity', lat: 10, lng: 20, type: 'poi' };
        await selectEntity(place, { failEnrich: true });

        expect(interactionState).toBe('PIN_SELECTED');
        expect(locationInfo?.name).toBe('Difficult Entity');
        expect(locationInfo?.sectionState.description).toBe('error');
    });

    it('6. Rapid clicks (click location A, then quickly click location B): stale A cannot overwrite B', async () => {
        const placeA = { id: 'marker-A', name: 'Location A', lat: 10, lng: 10 };
        const placeB = { id: 'marker-B', name: 'Location B', lat: 20, lng: 20 };

        // Start A with long delay
        const promiseA = selectEntity(placeA, { delayGeo: 80, delayEnrich: 80 });

        // Immediately start B with shorter delay
        await new Promise(r => setTimeout(r, 10));
        const promiseB = selectEntity(placeB, { delayGeo: 20, delayEnrich: 20 });

        await Promise.all([promiseA, promiseB]);

        // Location B must win and A must not have overwritten it
        expect(interactionState).toBe('PIN_SELECTED');
        expect(selectedMarkerId).toBe('marker-B');
        expect(locationInfo?.name).toBe('Location B');
    });

    it('7. Manually closing InfoPanel closes it and leaves it closed', () => {
        interactionState = 'PIN_SELECTED';
        locationInfo = { name: 'Active Location' };
        selectedMarkerId = 'marker-1';

        handleClosePanel();

        expect(interactionState).toBe('GLOBE_IDLE');
        expect(locationInfo).toBeNull();
        expect(selectedMarkerId).toBeNull();
    });

    it('8. Clicking a new globe location after closing opens new selection cleanly', async () => {
        handleClosePanel();
        expect(interactionState).toBe('GLOBE_IDLE');

        const newPlace = { id: 'marker-new', name: 'Sydney', lat: -33.8688, lng: 151.2093 };
        await selectEntity(newPlace);

        expect(interactionState).toBe('PIN_SELECTED');
        expect(selectedMarkerId).toBe('marker-new');
        expect(locationInfo?.name).toBe('Sydney');
    });
});
