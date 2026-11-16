import React from 'react';
import { SkinType } from '../types';
import { AlertCircle, ArrowRight } from 'lucide-react';

export interface GeminiFallbackPromptProps {
  skin: SkinType;
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const GeminiFallbackPrompt: React.FC<GeminiFallbackPromptProps> = ({
  skin,
  isOpen,
  onAccept,
  onDecline
}) => {
  if (!isOpen) return null;

  const isParchment = skin === 'parchment';
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';

  const cardSkinClass =
    skin === 'retro-green'
      ? 'fallback-card-retro-green'
      : skin === 'retro-amber'
      ? 'fallback-card-retro-amber'
      : skin === 'parchment'
      ? 'fallback-card-parchment'
      : 'fallback-card-modern';

  return (
    <div
      role="dialog"
      aria-labelledby="gemini-fallback-title"
      data-testid="gemini-fallback-prompt"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200"
    >
      <div
        className={`relative w-full max-w-md p-6 rounded-xl border ${cardSkinClass}`}
      >
        {isParchment && (
          <div className="parchment-background" aria-hidden="true" />
        )}
        <div className="relative z-[1] flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <AlertCircle size={22} />
          </div>
          <div>
            <h3 id="gemini-fallback-title" className="text-base font-bold">
              LM Studio isn&apos;t responding
            </h3>
            <p className="text-xs opacity-80 mt-1 leading-relaxed">
              LM Studio isn&apos;t responding. Use Gemini instead for this session?
            </p>
          </div>
        </div>

        <p className="text-xs opacity-75 mb-5 leading-relaxed">
          Your Gemini API key is configured. Data will be sent to Google Gemini only for this browsing session. You can switch back anytime in Settings.
        </p>

        <div className="flex items-center justify-end gap-3 text-xs font-semibold">
          <button
            type="button"
            onClick={onDecline}
            data-testid="gemini-fallback-decline"
            className={`px-4 py-2 rounded-lg border transition-colors cursor-pointer ${
              isParchment
                ? 'setup-btn-parchment'
                : skin === 'retro-green'
                ? 'setup-btn-retro-green'
                : skin === 'retro-amber'
                ? 'setup-btn-retro-amber'
                : 'setup-btn-modern'
            }`}
          >
            Keep trying LM Studio
          </button>
          <button
            type="button"
            onClick={onAccept}
            data-testid="gemini-fallback-accept"
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-colors cursor-pointer ${
              isParchment
                ? 'bg-[#8b5a2b] text-white hover:bg-[#6d4520]'
                : skin === 'retro-green'
                ? 'bg-green-400 text-black hover:bg-green-300'
                : skin === 'retro-amber'
                ? 'bg-amber-400 text-black hover:bg-amber-300'
                : 'bg-cyan-500 text-black hover:bg-cyan-400'
            }`}
          >
            <span>Use Gemini</span>
            <ArrowRight size={13} />
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default GeminiFallbackPrompt;
