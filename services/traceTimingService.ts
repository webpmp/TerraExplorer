interface TraceTimingRecord {
  traceStartTime: number;
  wp1SubstantiveReadyTime: number | null;
  activeRequestId: string | null;
}

const timingState: TraceTimingRecord = {
  traceStartTime: 0,
  wp1SubstantiveReadyTime: null,
  activeRequestId: null
};

export function initTraceTiming(requestId: string): void {
  timingState.traceStartTime = Date.now();
  timingState.wp1SubstantiveReadyTime = null;
  timingState.activeRequestId = requestId;
  console.log(`[TRACE TIMING] TRACE_ROUTE_INITIATED req="${requestId}"`);
}

export function recordWP1SubstantiveReady(): void {
  if (!timingState.wp1SubstantiveReadyTime) {
    timingState.wp1SubstantiveReadyTime = Date.now();
  }
}

export function getTraceTimingState() {
  return { ...timingState };
}

export function logTraceTiming(
  marker:
    | 'WP1_SUBSTANTIVE_READY'
    | 'WP1_INFOPANEL_COMMITTED'
    | 'WP1_INFOPANEL_VISIBLE'
    | 'WP1_NARRATION_REQUESTED'
    | 'KOKORO_HTTP_REQUEST_STARTED'
    | 'KOKORO_GENERATION_STARTED'
    | 'KOKORO_AUDIO_COMPLETE'
    | 'KOKORO_PLAYBACK_STARTED'
    | 'KOKORO_PLAYBACK_ENDED'
    | 'ORPHEUS_HTTP_REQUEST_STARTED'
    | 'ORPHEUS_GENERATION_STARTED'
    | 'ORPHEUS_FIRST_AUDIO'
    | 'ORPHEUS_OPENING_REQUEST_STARTED'
    | 'ORPHEUS_OPENING_AUDIO_COMPLETE'
    | 'ORPHEUS_OPENING_PLAYBACK_STARTED'
    | 'ORPHEUS_OPENING_PLAYBACK_ENDED'
    | 'ORPHEUS_REMAINDER_REQUEST_STARTED'
    | 'ORPHEUS_REMAINDER_AUDIO_COMPLETE'
    | 'ORPHEUS_REMAINDER_SCHEDULED'
    | 'ORPHEUS_REMAINDER_PLAYBACK_STARTED'
    | 'ORPHEUS_TRANSITION_GAP_DETECTED'
    | 'INITIAL_PLAYBACK_BUFFER_REACHED'
    | 'ORPHEUS_AUDIO_COMPLETE'
    | 'WP1_PLAYBACK_STARTED'
    | 'PLAYBACK_QUEUE_DRAINED'
    | 'NARRATION_PLAYBACK_ENDED',
  waypointId: string,
  waypointTitle: string,
  extraDetails?: string
): void {
  const now = Date.now();
  if (marker === 'WP1_SUBSTANTIVE_READY' && !timingState.wp1SubstantiveReadyTime) {
    timingState.wp1SubstantiveReadyTime = now;
  }

  const elapsedTrace = timingState.traceStartTime > 0 ? now - timingState.traceStartTime : 0;
  const elapsedSubstantive = timingState.wp1SubstantiveReadyTime ? now - timingState.wp1SubstantiveReadyTime : 0;

  const details = extraDetails ? ` | ${extraDetails}` : '';
  console.log(
    `[TRACE TIMING] ${marker} id="${waypointId}" title="${waypointTitle}" elapsedSinceTraceStart=+${elapsedTrace}ms elapsedSinceSubstantive=+${elapsedSubstantive}ms${details}`
  );
}
