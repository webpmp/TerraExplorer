import React, { useState, useEffect } from 'react';
import { SkinType } from '../types';
import { SetupStatusState, ServiceStatus } from '../services/setupStatusService';
import {
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Settings as SettingsIcon,
  X,
  Sparkles,
  ChevronRight
} from 'lucide-react';

export interface SetupPanelProps {
  skin: SkinType;
  status: SetupStatusState;
  isDismissed: boolean;
  onDismiss: () => void;
  onOpenSettings: (tab: 'providers' | 'general' | 'appearance' | 'audio') => void;
  onReopen: () => void;
}

export const SetupPanel: React.FC<SetupPanelProps> = ({
  skin,
  status,
  isDismissed,
  onDismiss,
  onOpenSettings,
  onReopen
}) => {
  const isParchment = skin === 'parchment';
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';

  const isAiReady = status.ai.status === 'ready';
  const isMapReady = status.map.status === 'ready';
  const bothRequiredReady = isAiReady && isMapReady;

  const [showComplete, setShowComplete] = useState(false);
  const [hasCollapsedAfterSuccess, setHasCollapsedAfterSuccess] = useState(false);

  useEffect(() => {
    if (bothRequiredReady && !hasCollapsedAfterSuccess) {
      setShowComplete(true);
      const timer = setTimeout(() => {
        setShowComplete(false);
        setHasCollapsedAfterSuccess(true);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [bothRequiredReady, hasCollapsedAfterSuccess]);

  // Theme-specific styles
  const cardSkinClass =
    skin === 'retro-green'
      ? 'setup-card-retro-green rounded-xl border p-5 sm:p-6'
      : skin === 'retro-amber'
      ? 'setup-card-retro-amber rounded-xl border p-5 sm:p-6'
      : skin === 'parchment'
      ? 'setup-card-parchment p-6 sm:p-8'
      : 'setup-card-modern rounded-xl border p-5 sm:p-6';

  const cardClasses = `
    setup-card-container relative z-10
    transition-all duration-300 animate-in fade-in zoom-in-95
    ${cardSkinClass}
  `;

  const chipSkinClass =
    skin === 'retro-green'
      ? 'setup-chip-retro-green border shadow-lg'
      : skin === 'retro-amber'
      ? 'setup-chip-retro-amber border shadow-lg'
      : skin === 'parchment'
      ? 'setup-chip-parchment'
      : 'setup-chip-modern border shadow-lg';

  // If user dismissed and required services still missing, show small "Finish setup" chip
  if (isDismissed || hasCollapsedAfterSuccess) {
    if (bothRequiredReady) {
      return null;
    }
    return (
      <div className="fixed finish-setup-chip-container bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <button
          type="button"
          onClick={onReopen}
          data-testid="finish-setup-chip"
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${isParchment ? 'rounded-none' : 'rounded-full'} ${chipSkinClass}`}
        >
          {isParchment && (
            <div className="parchment-background" aria-hidden="true" />
          )}
          <span className="relative z-[1] flex items-center gap-2">
            <AlertCircle size={14} className={skin === 'retro-amber' ? 'text-[#ffb000]' : skin === 'retro-green' ? 'text-green-300' : 'text-amber-400'} />
            <span>Finish Setup</span>
            <ChevronRight size={14} />
          </span>
        </button>
      </div>
    );
  }

  const titleClasses = `
    text-sm sm:text-base font-bold tracking-wider uppercase flex items-center justify-between
    ${isParchment ? 'text-[#3e2723]' : ''}
    ${skin === 'modern' ? 'text-cyan-300' : ''}
    ${skin === 'retro-green' ? 'text-green-300' : ''}
    ${skin === 'retro-amber' ? 'text-[#ffb000]' : ''}
  `;

  const rowSkinClass =
    skin === 'retro-green'
      ? 'setup-row-retro-green'
      : skin === 'retro-amber'
      ? 'setup-row-retro-amber'
      : skin === 'parchment'
      ? 'setup-row-parchment'
      : 'setup-row-modern';

  const rowClasses = `
    p-3 rounded-lg border flex flex-col gap-2 transition-colors ${rowSkinClass}
  `;

  const getStatusBadge = (statusVal: ServiceStatus, isOptional: boolean = false) => {
    if (statusVal === 'ready') {
      return (
        <span className={`inline-flex items-center gap-1 text-[11px] ${isParchment ? 'setup-badge-ready-parchment' : 'setup-badge-ready'}`}>
          <CheckCircle2 size={13} />
          Ready
        </span>
      );
    }
    if (isOptional) {
      return (
        <span className={`inline-flex items-center gap-1 text-[11px] ${isParchment ? 'setup-badge-optional-parchment' : 'setup-badge-optional'}`}>
          <HelpCircle size={13} />
          Optional
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] ${isParchment ? 'setup-badge-attention-parchment' : 'setup-badge-attention'}`}>
        <AlertCircle size={13} />
        Needs Attention
      </span>
    );
  };

  const actionBtnClass =
    skin === 'retro-green'
      ? 'setup-btn-retro-green'
      : skin === 'retro-amber'
      ? 'setup-btn-retro-amber'
      : skin === 'parchment'
      ? 'setup-btn-parchment'
      : 'setup-btn-modern';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TerraExplorer Setup Checklist"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onDismiss();
        }
      }}
    >
      <div className={cardClasses} data-testid="setup-panel">
        {isParchment && (
          <div className="parchment-background" aria-hidden="true" />
        )}
        <div className={`relative z-[1] flex flex-col gap-3 max-h-[calc(100dvh-4rem)] overflow-y-auto ${isParchment ? 'parchment-scrollbar' : 'custom-scrollbar'}`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-current/20">
          <div className={titleClasses}>
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <span>TerraExplorer Setup</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-current/10 transition-colors opacity-70 hover:opacity-100 cursor-pointer"
            title="Dismiss checklist"
            aria-label="Dismiss checklist"
          >
            <X size={18} />
          </button>
        </div>

      {showComplete ? (
        <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 animate-in fade-in zoom-in-95 duration-300">
          <CheckCircle2 size={36} className="text-emerald-400" />
          <h3 className="font-bold text-base">Setup Complete!</h3>
          <p className="text-xs opacity-75 max-w-xs">
            All required providers are active. Welcome to TerraExplorer!
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <p className="text-xs opacity-80 leading-relaxed">
            Configure your AI and map providers to start exploring. AI enables descriptions, notable facts, and routes.
          </p>

          {/* Row 1: AI Provider (Required) */}
          <div className={rowClasses} data-testid="setup-row-ai">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">AI Provider</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.2 rounded font-semibold ${isParchment ? 'bg-[#c62828]/20 text-[#c62828] border border-[#c62828]/40' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                    Required
                  </span>
                </div>
                <p className="text-[11px] opacity-75 mt-0.5 leading-snug">
                  Recommended: LM Studio (free, private, runs on your machine). Fallback: Gemini API key.
                </p>
              </div>
              <div className="shrink-0">
                {getStatusBadge(status.ai.status)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href="https://lmstudio.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] underline opacity-80 hover:opacity-100"
              >
                <span>Setup guide</span>
                <ExternalLink size={10} />
              </a>
              <button
                type="button"
                onClick={() => onOpenSettings('providers')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${actionBtnClass}`}
              >
                <SettingsIcon size={11} />
                <span>Open Settings</span>
              </button>
            </div>
          </div>

          {/* Row 2: Map Provider (Required) */}
          <div className={rowClasses} data-testid="setup-row-map">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Map Provider</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.2 rounded font-semibold ${isParchment ? 'bg-[#c62828]/20 text-[#c62828] border border-[#c62828]/40' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                    Required
                  </span>
                </div>
                <p className="text-[11px] opacity-75 mt-0.5 leading-snug">
                  Carto API key required to load map tiles.
                </p>
              </div>
              <div className="shrink-0">
                {getStatusBadge(status.map.status)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href="https://carto.com/developers/basemap-styles/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] underline opacity-80 hover:opacity-100"
              >
                <span>Get a key</span>
                <ExternalLink size={10} />
              </a>
              <button
                type="button"
                onClick={() => onOpenSettings('providers')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${actionBtnClass}`}
              >
                <SettingsIcon size={11} />
                <span>Open Settings</span>
              </button>
            </div>
          </div>

          {/* Row 3: News Provider (Optional) */}
          <div className={rowClasses} data-testid="setup-row-news">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">News Provider</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.2 rounded font-semibold ${isParchment ? 'border border-[#8b5a2b]/30 text-[#8b5a2b]' : 'opacity-70 border border-current/20'}`}>
                    Optional
                  </span>
                </div>
                <p className="text-[11px] opacity-75 mt-0.5 leading-snug">
                  Choose one of New York Times, NewsAPI.org, or NewsData.io.
                </p>
              </div>
              <div className="shrink-0">
                {getStatusBadge(status.news.status, true)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href="https://developer.nytimes.com/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] underline opacity-80 hover:opacity-100"
              >
                <span>Get a key</span>
                <ExternalLink size={10} />
              </a>
              <button
                type="button"
                onClick={() => onOpenSettings('providers')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${actionBtnClass}`}
              >
                <SettingsIcon size={11} />
                <span>Open Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default SetupPanel;
