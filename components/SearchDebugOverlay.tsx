import React, { useState, useEffect } from 'react';
import { SearchDebugEvent, subscribeSearchDebug, getSearchDebugHistory, clearSearchDebugHistory } from '../services/searchDebugTracer';
import { osmTelemetry, OSMPerfSnapshot } from '../services/osmTelemetryService';
import { Bug, X, Trash2, Copy, Check, Activity, Search } from 'lucide-react';

export const SearchDebugOverlay: React.FC = () => {
  const [events, setEvents] = useState<SearchDebugEvent[]>([]);
  const [osmPerf, setOsmPerf] = useState<OSMPerfSnapshot>(() => osmTelemetry.getSnapshot());
  const [activeTab, setActiveTab] = useState<'search' | 'osm'>('search');
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEvents(getSearchDebugHistory());
    const unsubscribeSearch = subscribeSearchDebug((_event, allEvents) => {
      setEvents([...allEvents]);
    });
    const unsubscribeOSM = osmTelemetry.subscribe((snapshot) => {
      setOsmPerf({ ...snapshot });
    });
    return () => {
      unsubscribeSearch();
      unsubscribeOSM();
    };
  }, []);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  const handleCopy = () => {
    const dataToCopy = activeTab === 'search'
      ? events
      : { osmPerfSnapshot: osmPerf, eventsCount: events.length };
    const text = JSON.stringify(dataToCopy, null, 2);

    // 1. Modern Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopy(text);
      });
      return;
    }

    // 2. Fallback via hidden textarea execCommand
    fallbackCopy(text);
  };

  const fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        window.prompt('Copy search diagnostics manually (Cmd+C / Tap and hold):', text);
      }
    } catch {
      window.prompt('Copy search diagnostics manually (Cmd+C / Tap and hold):', text);
    }
  };

  const handleClear = () => {
    clearSearchDebugHistory();
    setEvents([]);
  };

  // Status color helper
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'FINAL_RESULT':
        return '#22c55e'; // green
      case 'NETWORK_START':
        return '#3b82f6'; // blue
      case 'NETWORK_COMPLETE':
        return '#06b6d4'; // cyan
      case 'NETWORK_ERROR':
      case 'EXCEPTION':
        return '#ef4444'; // red
      case 'NO_RESULT':
      case 'VALIDATION_FAILED':
        return '#f59e0b'; // amber
      default:
        return '#94a3b8'; // slate
    }
  };

  return (
    <>
      {/* Collapsed Small Utility Button below copyright footer */}
      {!isOpen && (
        <div
          className="search-debug-container"
          style={{
            position: 'fixed',
            bottom: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99990,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              backgroundColor: latestEvent?.status === 'EXCEPTION' || latestEvent?.status === 'NETWORK_ERROR' ? '#7f1d1d' : 'rgba(15, 23, 42, 0.85)',
              color: '#94a3b8',
              border: `1px solid ${latestEvent ? getStatusColor(latestEvent.status) : 'rgba(51, 65, 85, 0.6)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '9px',
              lineHeight: '1.2',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            <Bug size={11} color={latestEvent ? getStatusColor(latestEvent.status) : '#38bdf8'} />
            <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>DEBUG</span>
            {latestEvent && (
              <span
                style={{
                  color: getStatusColor(latestEvent.status),
                  maxWidth: '90px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '8.5px',
                }}
              >
                [{latestEvent.category || latestEvent.status}]
              </span>
            )}
          </button>
        </div>
      )}

      {/* Expanded Centered Diagnostic Modal Dialog */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            pointerEvents: 'auto',
            padding: '12px',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #334155',
              borderRadius: '8px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '78vh',
              width: 'min(94vw, 560px)',
              overflow: 'hidden',
              fontFamily: 'monospace',
              fontSize: '11px',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #334155',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  style={{
                    background: activeTab === 'search' ? '#0284c7' : 'transparent',
                    color: activeTab === 'search' ? '#ffffff' : '#94a3b8',
                    border: '1px solid #38bdf8',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                  }}
                >
                  <Search size={12} />
                  <span>SEARCH</span>
                  <span style={{ opacity: 0.8 }}>({events.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('osm')}
                  style={{
                    background: activeTab === 'osm' ? '#0284c7' : 'transparent',
                    color: activeTab === 'osm' ? '#ffffff' : '#94a3b8',
                    border: '1px solid #38bdf8',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                  }}
                >
                  <Activity size={12} />
                  <span>OSM PERF</span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy JSON"
                  style={{
                    background: copied ? '#15803d' : '#334155',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}
                >
                  {copied ? <Check size={13} color="#ffffff" /> : <Copy size={13} />}
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  title="Clear"
                  style={{
                    background: 'none',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#cbd5e1',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '10px',
                  }}
                >
                  <Trash2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* TAB CONTENT: OSM PERFORMANCE TELEMETRY */}
            {activeTab === 'osm' && (
              <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '10.5px' }}>
                {/* Timeline */}
                <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>OSM TIMELINE</span>
                    <span style={{ fontSize: '9.5px', color: osmPerf.device.isMobileOrTablet ? '#a78bfa' : '#38bdf8' }}>
                      {osmPerf.device.isMobileOrTablet ? 'Mode: Globe → OSM (Mobile/iPad direct)' : 'Mode: Globe → Fog → OSM (Desktop)'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>Activation: <b style={{ color: '#22c55e' }}>{osmPerf.timeline.osmActivation !== null ? `+${osmPerf.timeline.osmActivation}ms` : 'N/A'}</b></div>
                    <div>Fog begins: <b style={{ color: '#93c5fd' }}>{osmPerf.device.isMobileOrTablet ? 'Bypassed' : (osmPerf.timeline.fogBegin !== null ? `+${osmPerf.timeline.fogBegin}ms` : 'N/A')}</b></div>
                    <div>First tile req: <b style={{ color: '#f59e0b' }}>{osmPerf.timeline.firstTileRequest !== null ? `+${osmPerf.timeline.firstTileRequest}ms` : 'N/A'}</b></div>
                    <div>First tile load: <b style={{ color: '#22c55e' }}>{osmPerf.timeline.firstTileLoaded !== null ? `+${osmPerf.timeline.firstTileLoaded}ms` : 'N/A'}</b></div>
                    <div>First tile visible: <b style={{ color: '#06b6d4' }}>{osmPerf.timeline.firstTileVisible !== null ? `+${osmPerf.timeline.firstTileVisible}ms` : 'N/A'}</b></div>
                    <div>Fog ends: <b style={{ color: '#cbd5e1' }}>{osmPerf.device.isMobileOrTablet ? 'Bypassed' : (osmPerf.timeline.fogEnd !== null ? `+${(osmPerf.timeline.fogEnd / 1000).toFixed(1)}s` : 'N/A')}</b></div>
                    <div>OSM ready: <b style={{ color: '#eab308' }}>{osmPerf.timeline.osmReady !== null ? `+${osmPerf.timeline.osmReady}ms` : 'N/A'}</b></div>
                    <div>Loading done: <b style={{ color: '#cbd5e1' }}>{osmPerf.timeline.osmLoadingComplete !== null ? `+${osmPerf.timeline.osmLoadingComplete}ms` : 'N/A'}</b></div>
                    <div style={{ gridColumn: 'span 2', borderTop: '1px dotted #1e293b', paddingTop: '3px', marginTop: '2px' }}>
                      Perceived transition: <b style={{ color: '#38bdf8' }}>{osmPerf.timeline.userPerceivedOSMTransitionMs !== null ? `${osmPerf.timeline.userPerceivedOSMTransitionMs}ms` : (osmPerf.timeline.fogEnd !== null ? `${(osmPerf.timeline.fogEnd / 1000).toFixed(1)}s` : 'In progress...')}</b>
                    </div>
                  </div>
                </div>

                {/* Tile Telemetry & Volume */}
                <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '2px' }}>
                    TILES & REQUEST TELEMETRY
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>Requested: <b>{osmPerf.tiles.totalRequested}</b></div>
                    <div>Active In-Flight: <b style={{ color: osmPerf.tiles.activeInFlight > 0 ? '#f59e0b' : '#22c55e' }}>{osmPerf.tiles.activeInFlight}</b> (Max: <b style={{ color: osmPerf.tiles.maxObservedActiveCount > 6 ? '#ef4444' : '#22c55e' }}>{osmPerf.tiles.maxObservedActiveCount}</b>)</div>
                    <div>Queued / Started: <b>{osmPerf.tiles.queued} / {osmPerf.tiles.started}</b></div>
                    <div>Loaded / Rendered: <b style={{ color: '#22c55e' }}>{osmPerf.tiles.completed} / {osmPerf.tiles.rendered}</b></div>
                    <div>Failed: <b style={{ color: osmPerf.tiles.failed > 0 ? '#ef4444' : '#94a3b8' }}>{osmPerf.tiles.failed}</b></div>
                    <div>Cancelled: <b>{osmPerf.tiles.cancelled}</b></div>
                    <div>Duplicate: <b style={{ color: osmPerf.tiles.duplicateRequests > 0 ? '#f59e0b' : '#22c55e' }}>{osmPerf.tiles.duplicateRequests}</b></div>
                    <div>Zoom level: <b>z{osmPerf.tiles.zoomLevel ?? 'N/A'} (min {osmPerf.tiles.minZoom}, max {osmPerf.tiles.maxZoom})</b></div>
                    <div>Viewport (Req / Vis): <b>{osmPerf.tiles.initialViewportRequested} / {osmPerf.tiles.actuallyVisible}</b></div>
                    <div>Outside Viewport: <b>{osmPerf.tiles.outsideViewportEstimated}</b></div>
                    <div>Simultaneous Zooms: <b>{osmPerf.tiles.multipleZoomsSimultaneous ? 'YES' : 'NO'}</b></div>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '9.5px', color: '#94a3b8', borderTop: '1px dotted #1e293b', paddingTop: '3px' }}>
                    Sources: Vector(<b>{osmPerf.tiles.sources?.maplibreVector ?? 0}</b>) · Service(<b>{osmPerf.tiles.sources?.rasterService ?? 0}</b>) · Img(<b>{osmPerf.tiles.sources?.rasterImg ?? 0}</b>) · Viewport(<b>{osmPerf.tiles.sources?.viewportCalc ?? 0}</b>)
                  </div>
                  <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #334155' }}>
                    <div>Avg duration: <b>{osmPerf.tiles.averageDurationMs !== null ? `${osmPerf.tiles.averageDurationMs}ms` : 'N/A'}</b> | Slowest: <b style={{ color: '#ef4444' }}>{osmPerf.tiles.slowestDurationMs !== null ? `${(osmPerf.tiles.slowestDurationMs / 1000).toFixed(2)}s` : 'N/A'}</b></div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px', fontSize: '9.5px', color: '#94a3b8' }}>
                      <span>&lt;1s: <b>{osmPerf.tiles.bucketUnder1s}</b></span>
                      <span>1-3s: <b>{osmPerf.tiles.bucket1to3s}</b></span>
                      <span>3-5s: <b>{osmPerf.tiles.bucket3to5s}</b></span>
                      <span>5-10s: <b>{osmPerf.tiles.bucket5to10s}</b></span>
                      <span>&gt;10s: <b style={{ color: osmPerf.tiles.bucketOver10s > 0 ? '#ef4444' : 'inherit' }}>{osmPerf.tiles.bucketOver10s}</b></span>
                    </div>
                  </div>
                </div>

                {/* Frame Rate & Stalls */}
                <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '2px' }}>
                    FRAME RATE & STALLS
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>Before OSM: <b>{osmPerf.frames.fpsBeforeOSM ?? 'N/A'} FPS</b></div>
                    <div>Fog transition: <b style={{ color: (osmPerf.frames.fpsFogTransition ?? 60) < 30 ? '#ef4444' : '#22c55e' }}>{osmPerf.frames.fpsFogTransition ?? 'N/A'} FPS</b></div>
                    <div>OSM loading: <b style={{ color: (osmPerf.frames.fpsOSMLoading ?? 60) < 30 ? '#ef4444' : '#22c55e' }}>{osmPerf.frames.fpsOSMLoading ?? 'N/A'} FPS</b></div>
                    <div>After OSM settles: <b>{osmPerf.frames.fpsAfterOSM ?? 'N/A'} FPS</b></div>
                    <div>Minimum FPS: <b style={{ color: (osmPerf.frames.minFPS ?? 60) < 20 ? '#ef4444' : '#f59e0b' }}>{osmPerf.frames.minFPS ?? 'N/A'} FPS</b></div>
                    <div>Max frame time: <b style={{ color: '#f59e0b' }}>{osmPerf.frames.maxFrameTimeMs !== null ? `${osmPerf.frames.maxFrameTimeMs}ms` : 'N/A'}</b></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #334155', fontSize: '9.5px', color: '#94a3b8' }}>
                    <span>Frames &gt;33ms: <b>{osmPerf.frames.framesOver33ms}</b></span>
                    <span>&gt;50ms: <b style={{ color: osmPerf.frames.framesOver50ms > 0 ? '#f59e0b' : 'inherit' }}>{osmPerf.frames.framesOver50ms}</b></span>
                    <span>&gt;100ms: <b style={{ color: osmPerf.frames.framesOver100ms > 0 ? '#ef4444' : 'inherit' }}>{osmPerf.frames.framesOver100ms}</b></span>
                  </div>
                </div>

                {/* Device & WebGL Telemetry */}
                <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #1e293b' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #1e293b', paddingBottom: '2px' }}>
                    DEVICE & GPU
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>Viewport: <b>{osmPerf.device.viewportWidth}×{osmPerf.device.viewportHeight}</b></div>
                    <div>Pixel Ratio: <b>{osmPerf.device.devicePixelRatio}</b></div>
                    <div>CPU Cores: <b>{osmPerf.device.hardwareConcurrency}</b></div>
                    <div>Device Memory: <b>{osmPerf.device.deviceMemory}</b></div>
                  </div>
                  <div style={{ marginTop: '4px', color: '#cbd5e1', fontSize: '10px' }}>
                    <div>Renderer: <b style={{ color: '#38bdf8' }}>{osmPerf.device.webGLRenderer}</b></div>
                    <div>Vendor: <b>{osmPerf.device.webGLVendor}</b></div>
                    <div style={{ color: '#94a3b8', fontSize: '9px', marginTop: '2px' }}>{osmPerf.device.gpuMemoryStatus}</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SEARCH DIAGNOSTICS */}
            {activeTab === 'search' && (
              <>
                {/* Latest Summary */}
                {latestEvent ? (
                  <div style={{ padding: '8px 12px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#94a3b8', shrink: 0 }}>Latest Query:</span>
                      <span style={{ color: '#f8fafc', fontWeight: 'bold', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'right' }}>{latestEvent.query || '(none)'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: '#94a3b8', shrink: 0 }}>Stage / Status:</span>
                      <span style={{ color: getStatusColor(latestEvent.status), fontWeight: 'bold', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'right' }}>
                        {latestEvent.stage} → {latestEvent.status}
                      </span>
                    </div>
                    {latestEvent.category && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                        <span style={{ color: '#94a3b8', shrink: 0 }}>Category:</span>
                        <span style={{ color: '#f59e0b', fontWeight: 'bold', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'right' }}>{latestEvent.category}</span>
                      </div>
                    )}
                    {latestEvent.details && (
                      <div style={{ marginTop: '4px', padding: '4px 6px', backgroundColor: '#182234', borderRadius: '4px', fontSize: '10px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <span style={{ color: '#93c5fd' }}>Details: </span>
                        <span style={{ color: '#e2e8f0', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{JSON.stringify(latestEvent.details)}</span>
                      </div>
                    )}
                    {latestEvent.networkInfo && (
                      <div style={{ marginTop: '4px', padding: '4px 6px', backgroundColor: '#182234', borderRadius: '4px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <div style={{ color: '#38bdf8' }}>Network Request:</div>
                        <div style={{ color: '#94a3b8', wordBreak: 'break-all', overflowWrap: 'anywhere', fontSize: '10px' }}>
                          {latestEvent.networkInfo.url}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '10px', flexWrap: 'wrap' }}>
                          <span>Status: <b>{latestEvent.networkInfo.status ?? 'pending'}</b></span>
                          <span>Elapsed: <b>{latestEvent.networkInfo.elapsedMs ?? 0}ms</b></span>
                          {latestEvent.networkInfo.error && <span style={{ color: '#ef4444', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>Err: {latestEvent.networkInfo.error}</span>}
                        </div>
                      </div>
                    )}
                    {latestEvent.errorMessage && (
                      <div style={{ marginTop: '4px', padding: '4px 6px', backgroundColor: '#450a0a', borderRadius: '4px', color: '#fca5a5', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        <b>Error:</b> {latestEvent.errorMessage}
                      </div>
                    )}
                    {latestEvent.errorStack && (
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '4px 6px',
                          backgroundColor: '#1f1515',
                          borderRadius: '4px',
                          color: '#f87171',
                          maxHeight: '70px',
                          overflowY: 'auto',
                          fontSize: '9px',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}
                      >
                        {latestEvent.errorStack}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                    No search events recorded yet. Perform a search above.
                  </div>
                )}

                {/* Event Stream Log */}
                <div
                  style={{
                    padding: '8px 12px',
                    overflowY: 'auto',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase' }}>
                    Event Stream (Newest at bottom):
                  </div>
                  {events.map(ev => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '4px 6px',
                        backgroundColor: '#111827',
                        borderLeft: `3px solid ${getStatusColor(ev.status)}`,
                        borderRadius: '2px',
                        fontSize: '10px',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>#{ev.id} [{ev.stage}]</span>
                        <span>{ev.timestamp.split('T')[1]?.slice(0, 8)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span style={{ color: getStatusColor(ev.status), fontWeight: 'bold' }}>{ev.status}</span>
                        {ev.category && <span style={{ color: '#f59e0b' }}>{ev.category}</span>}
                      </div>
                      {ev.query && <div style={{ color: '#cbd5e1', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>q: "{ev.query}"</div>}
                      {ev.entity && <div style={{ color: '#93c5fd', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>entity: "{ev.entity}"</div>}
                      {ev.details && <div style={{ color: '#94a3b8', fontSize: '9px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{JSON.stringify(ev.details)}</div>}
                      {ev.errorMessage && <div style={{ color: '#f87171', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>err: {ev.errorMessage}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
