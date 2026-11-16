import { useState, useEffect, useCallback, useRef } from 'react';
import { UserSettings } from '../types';
import {
  SetupStatusState,
  evaluateSyncSetupStatus,
  getCartoKey,
  getEffectiveGeminiKey,
  isSetupRequiredMissing
} from '../services/setupStatusService';
import { detectLMStudioModels } from '../components/SettingsPanel';

export function useSetupStatus(userSettings: UserSettings, sessionGeminiOverride: boolean = false) {
  const [probeResult, setProbeResult] = useState<{
    outcome: 'SUCCESS' | 'NO_MODELS' | 'ERROR';
    message?: string;
  } | undefined>(undefined);

  const [status, setStatus] = useState<SetupStatusState>(() =>
    evaluateSyncSetupStatus(
      sessionGeminiOverride ? { ...userSettings, aiProvider: 'gemini' } : userSettings,
      undefined
    )
  );

  const probingRef = useRef(false);

  const runProbe = useCallback(async (settingsToUse: UserSettings) => {
    if (sessionGeminiOverride || settingsToUse.aiProvider === 'gemini') {
      const geminiKey = getEffectiveGeminiKey(settingsToUse);
      const isReady = Boolean(geminiKey && geminiKey.trim() && geminiKey.trim() !== 'dummy-key-for-ts-check');
      setProbeResult(isReady ? { outcome: 'SUCCESS' } : { outcome: 'ERROR', message: 'No Gemini API key' });
      return;
    }

    if (!settingsToUse.lmStudioUrl) {
      setProbeResult({ outcome: 'ERROR', message: 'No LM Studio URL' });
      return;
    }

    probingRef.current = true;
    try {
      const result = await detectLMStudioModels(settingsToUse.lmStudioUrl);
      if (result.outcome === 'SUCCESS') {
        setProbeResult({ outcome: 'SUCCESS', message: result.message });
      } else if (result.outcome === 'NO_MODELS') {
        setProbeResult({ outcome: 'NO_MODELS', message: result.message });
      } else {
        setProbeResult({ outcome: 'ERROR', message: result.message });
      }
    } catch (err: any) {
      setProbeResult({ outcome: 'ERROR', message: err?.message || 'Connection failed' });
    } finally {
      probingRef.current = false;
    }
  }, [sessionGeminiOverride]);

  // Run probe on mount and whenever aiProvider or lmStudioUrl changes
  useEffect(() => {
    runProbe(userSettings);
  }, [userSettings.aiProvider, userSettings.lmStudioUrl, userSettings.geminiApiKey, sessionGeminiOverride, runProbe]);

  // Re-evaluate immediately whenever settings or probeResult change
  useEffect(() => {
    const effectiveSettings = sessionGeminiOverride ? { ...userSettings, aiProvider: 'gemini' } : userSettings;
    const nextStatus = evaluateSyncSetupStatus(effectiveSettings, probeResult);
    setStatus(nextStatus);
  }, [userSettings, probeResult, sessionGeminiOverride]);

  // Listen to storage events to re-evaluate if settings change externally
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'terraExplorerSettings') {
        const effectiveSettings = sessionGeminiOverride ? { ...userSettings, aiProvider: 'gemini' } : userSettings;
        setStatus(evaluateSyncSetupStatus(effectiveSettings, probeResult));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [userSettings, probeResult, sessionGeminiOverride]);

  const refreshStatus = useCallback(() => {
    runProbe(userSettings);
  }, [runProbe, userSettings]);

  return {
    status,
    isMissingRequired: isSetupRequiredMissing(status),
    probeResult,
    refreshStatus
  };
}
