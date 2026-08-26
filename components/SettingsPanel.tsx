import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, X, Server, Newspaper, Film, Volume2, KeyRound, ExternalLink } from 'lucide-react';
import { SkinType, UserSettings, AIProvider, NewsProvider } from '../types';
import { narrationService } from '../services/narrationService';

interface SettingsPanelProps {
  settings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
  onClose: () => void;
  skin: SkinType;
  initialTab?: SettingsTab;
}

type SettingsTab = 'ai' | 'documentary' | 'news';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'ai', label: 'AI PROVIDER' },
  { id: 'documentary', label: 'DOC MODE' },
  { id: 'news', label: 'NEWS' }
];

export interface NewsConnectionTestResult {
  outcome: 'SUCCESS' | 'FAILED';
  status?: number | string;
  message: string;
}

export const testNewsConnectionService = async (
  provider: NewsProvider,
  apiKeys?: { nytApiKey?: string; newsApiKey?: string; newsDataApiKey?: string },
  envGetter?: () => Record<string, string | undefined>
): Promise<NewsConnectionTestResult> => {
  const providerNames: Record<string, string> = {
    nyt: 'New York Times',
    newsapi: 'NewsAPI',
    newsdata: 'NewsData',
    gemini: 'Gemini'
  };
  const providerLabel = providerNames[provider] || provider;

  const defaultGetEnv = () => typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : (typeof process !== 'undefined' ? process.env : {});
  const env = (envGetter || defaultGetEnv)();
  const nytKey = apiKeys?.nytApiKey || env?.VITE_NYT_API_KEY || '';
  const newsApiKey = apiKeys?.newsApiKey || env?.VITE_NEWS_API_KEY || '';
  const newsDataKey = apiKeys?.newsDataApiKey || env?.VITE_NEWS_DATA_API_KEY || '';

  let hasKey = false;
  let url = '';
  let host = '';

    if (provider === 'nyt') {
      hasKey = !!nytKey;
      if (hasKey) {
        url = `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=test&api-key=${nytKey}`;
        host = 'api.nytimes.com/svc/search/v2/articlesearch.json';
      }
    } else if (provider === 'newsapi') {
      hasKey = !!newsApiKey;
      if (hasKey) {
        url = `https://newsapi.org/v2/everything?q=news&pageSize=10&apiKey=${newsApiKey}`;
        host = 'newsapi.org/v2/everything';
      }
    } else if (provider === 'newsdata') {
      hasKey = !!newsDataKey;
      if (hasKey) {
        url = `https://newsdata.io/api/1/news?apikey=${newsDataKey}&q=test&language=en`;
        host = 'newsdata.io/api/1/news';
      }
    }

  console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=START\nAPIKeyConfigured=${hasKey}\nAPIKeySource=environment`);

  let testOutcome: 'SUCCESS' | 'FAILED' = 'FAILED';

  try {
    if (!hasKey) {
      throw new Error(`API key not configured for ${providerLabel}`);
    }

    console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=REQUEST\nEndpoint=${host}`);

    const res = await fetch(url);
    if (res.ok) {
      let usableArticlesCount = 0;
      try {
        const data = await res.json();

        if (Array.isArray(data.articles)) {
          // NewsAPI
          usableArticlesCount = data.articles.length;
        } else if (Array.isArray(data.results)) {
          // NewsData
          usableArticlesCount = data.results.length;
        } else if (Array.isArray(data.response?.docs)) {
          // NYT
          usableArticlesCount = data.response.docs.length;
        }
      } catch {
        // Ignore JSON parse errors
      }

      if (usableArticlesCount === 0) {
        testOutcome = 'FAILED';
        const errorMsg = `No usable articles returned by ${providerLabel}`;
        console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=FAILED\nStatus=${res.status}\nResponseReceived=true\nArticlesReturned=0\nError=${errorMsg}`);
        return {
          outcome: 'FAILED',
          status: res.status,
          message: errorMsg
        };
      }

      testOutcome = 'SUCCESS';
      console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=SUCCESS\nStatus=${res.status}\nResponseReceived=true\nArticlesReturned=${usableArticlesCount}`);
      return {
        outcome: 'SUCCESS',
        status: res.status,
        message: 'API Key is valid!'
      };
    } else {
      testOutcome = 'FAILED';
      let safeError = res.statusText || 'Request failed';
      if (res.status === 401) safeError = 'invalid/unauthorized API key';
      else if (res.status === 403) safeError = 'access forbidden';
      else if (res.status === 429) safeError = 'rate limited';

      console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=FAILED\nStatus=${res.status}\nError=${safeError}`);
      return {
        outcome: 'FAILED',
        status: res.status,
        message: `Error: ${res.status} ${res.statusText}`
      };
    }
  } catch (e: any) {
    testOutcome = 'FAILED';
    const safeError = e.message || 'Connection failed';
    console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=FAILED\nStatus=UNKNOWN\nError=${safeError}`);
    return {
      outcome: 'FAILED',
      status: 'UNKNOWN',
      message: safeError
    };
  } finally {
    console.log(`[NEWS TEST CONNECTION]\nProvider=${providerLabel}\nAction=COMPLETE\nResult=${testOutcome}`);
  }
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdateSettings, onClose, skin, initialTab = 'ai' }) => {
  const isParchment = skin === 'parchment';
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>(() => narrationService.getVoices());
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [isDetectingModels, setIsDetectingModels] = React.useState(false);
  const [modelTestStatus, setModelTestStatus] = React.useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [modelTestMessage, setModelTestMessage] = React.useState('');
  const [newsTestStatus, setNewsTestStatus] = React.useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [newsTestMessage, setNewsTestMessage] = React.useState('');
  const [isVoiceTesting, setIsVoiceTesting] = React.useState(false);
  const [voiceTestMessage, setVoiceTestMessage] = React.useState('');

  useEffect(() => {
    const unsubscribe = narrationService.onVoicesChanged((voices) => {
      setAvailableVoices(voices);
    });
    return unsubscribe;
  }, []);

  const handleDetectModels = async () => {
    if (!settings.lmStudioUrl) return;
    setIsDetectingModels(true);
    try {
      const res = await fetch(`${settings.lmStudioUrl}/models`);
      if (res.ok) {
        const data = await res.json();
        const models = data.data?.map((m: any) => m.id) || [];
        setAvailableModels(models);
        if (models.length > 0 && !settings.lmStudioModel) {
          onUpdateSettings({ ...settings, lmStudioModel: models[0] });
        }
      }
    } catch (e) {
      console.error("Failed to detect models", e);
    }
    setIsDetectingModels(false);
  };

  const handleTestModelConnection = async () => {
    setModelTestStatus('testing');
    setModelTestMessage('Testing...');
    try {
      const res = await fetch(`${settings.lmStudioUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.lmStudioModel || 'local-model',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10
        })
      });
      if (res.ok) {
        setModelTestStatus('success');
        setModelTestMessage('Connection successful!');
      } else {
        const errorText = await res.text();
        setModelTestStatus('error');
        if (errorText.toLowerCase().includes('no models loaded') || errorText.includes('No models loaded')) {
          setModelTestMessage('No model loaded. Please load a model in LM Studio.');
        } else {
          setModelTestMessage(`Error: ${res.statusText || res.status}`);
        }
      }
    } catch (e: any) {
      setModelTestStatus('error');
      setModelTestMessage(e.message || 'Connection failed');
    }
  };

  const handleTestNewsConnection = async () => {
    setNewsTestStatus('testing');
    setNewsTestMessage('Testing...');
    const result = await testNewsConnectionService(settings.newsProvider, {
      nytApiKey: settings.nytApiKey,
      newsApiKey: settings.newsApiKey,
      newsDataApiKey: settings.newsDataApiKey
    });
    if (result.outcome === 'SUCCESS') {
      setNewsTestStatus('success');
      setNewsTestMessage(result.message);
    } else {
      setNewsTestStatus('error');
      setNewsTestMessage(result.message);
    }
  };

  const handleTestVoice = () => {
    if (!settings.narrationEnabled) return;
    if (isVoiceTesting) {
      narrationService.cancel();
      setIsVoiceTesting(false);
      setVoiceTestMessage('');
      return;
    }
    setIsVoiceTesting(true);
    setVoiceTestMessage('Playing sample...');
    narrationService.speakStructured({
      title: "TerraExplorer",
      description: "Voice volume and narration preview at current settings.",
      voiceURI: settings.narrationVoice,
      speed: settings.narrationSpeed,
      volume: settings.narrationVolume,
      onStart: () => {
        setIsVoiceTesting(true);
        setVoiceTestMessage('Playing sample...');
      },
      onEnd: () => {
        setIsVoiceTesting(false);
        setVoiceTestMessage('');
      },
      onError: () => {
        setIsVoiceTesting(false);
        setVoiceTestMessage('');
      }
    });
  };

  const themes = {
    'modern': {
      container: "bg-black/75 backdrop-blur-md border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      header: "bg-gradient-to-r from-blue-900 to-cyan-900",
      headerTitle: "brand-font text-white",
      closeBtn: "hover:bg-white/20 text-white rounded-full p-1 transition-colors",
      tabBar: "border-b border-cyan-400/20 bg-black/40",
      tabActive: "border-b-2 border-cyan-400 text-cyan-300 bg-cyan-900/20",
      tabInactive: "text-white/60 hover:text-white hover:bg-white/5 border-b-2 border-transparent",
      divider: "border-white/10"
    },
    'retro-green': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      header: "bg-green-900/30 border-b-2 border-green-400",
      headerTitle: "text-green-300 uppercase",
      closeBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none p-1 transition-colors",
      tabBar: "border-b-2 border-green-400 bg-black/50",
      tabActive: "bg-green-900/40 text-green-300 border-b-2 border-green-400 font-bold",
      tabInactive: "text-green-400/60 hover:text-green-300 hover:bg-green-900/10 border-b-2 border-transparent",
      divider: "border-green-400/30"
    },
    'retro-amber': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      header: "bg-amber-900/30 border-b-2 border-amber-400",
      headerTitle: "text-amber-300 uppercase",
      closeBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none p-1 transition-colors",
      tabBar: "border-b-2 border-amber-400 bg-black/50",
      tabActive: "bg-amber-900/40 text-amber-300 border-b-2 border-amber-400 font-bold",
      tabInactive: "text-amber-400/60 hover:text-amber-300 hover:bg-amber-900/10 border-b-2 border-transparent",
      divider: "border-amber-400/30"
    },
    'parchment': {
      container: "bg-[#f4ead5] border border-[#8b5a2b] shadow-[4px_4px_10px_rgba(0,0,0,0.3)] text-[#3e2723] font-sans",
      header: "bg-[#e8d5b5]/30 border-b border-[#8b5a2b]",
      headerTitle: "text-[#5c3a21] font-bold uppercase tracking-wider brand-font",
      closeBtn: "hover:bg-[#d2b48c]/50 hover:text-[#5c3a21] text-[#8b5a2b] rounded p-1 transition-colors",
      tabBar: "border-b border-[#8b5a2b] bg-[#e8d5b5]/20",
      tabActive: "text-[#3e2723] font-bold border-b-2 border-[#8b5a2b] bg-[#e8d5b5]/40",
      tabInactive: "text-[#8b5a2b]/70 hover:text-[#5c3a21] hover:bg-[#e8d5b5]/20 border-b-2 border-transparent",
      divider: "border-[#8b5a2b]/30"
    }
  };

  const theme = themes[skin];

  const containerClasses = `
    relative w-96 flex flex-col shrink min-h-0 h-[700px] pointer-events-auto transition-all duration-300 overflow-hidden
    ${theme.container}
  `;

  const headerClasses = `
    p-4 flex items-center justify-between shrink-0
    ${theme.header}
  `;

  const contentClasses = `
    flex-1 overflow-y-auto p-6 space-y-6
    ${isRetro ? 'scrollbar-none' : ''}
  `;

  const sectionTitleClasses = `
    text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-4
    ${isParchment ? 'text-[#8b5a2b]' : ''}
    ${skin === 'modern' ? 'text-white/60' : ''}
    ${isRetro ? 'text-[#33ff33] border-b border-[#33ff33] pb-1' : ''}
    ${skin === 'retro-amber' ? 'text-[#ffb000] border-[#ffb000]' : ''}
  `;

  const labelClasses = `
    block text-sm font-medium mb-1
    ${isParchment ? 'text-[#3e2723]/80' : ''}
    ${skin === 'modern' ? 'text-white/80' : ''}
  `;

  const inputClasses = `
    w-full px-3 py-2 rounded-lg text-sm transition-colors
    ${isParchment ? 'bg-[#e6d5b8] border-[#8b5a2b]/30 text-[#3e2723] focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]' : ''}
    ${skin === 'modern' ? 'bg-white/10 border-white/20 text-white focus:bg-white/20 focus:border-white/40' : ''}
    ${isRetro ? 'bg-transparent border-2 border-[#33ff33] text-[#33ff33] rounded-none focus:outline-none' : ''}
    ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000]' : ''}
  `;

  const sliderClasses = `
    w-full cursor-pointer
    ${skin === 'modern' ? 'accent-cyan-400' : ''}
    ${skin === 'retro-green' ? 'accent-[#33ff33]' : ''}
    ${skin === 'retro-amber' ? 'accent-[#ffb000]' : ''}
    ${skin === 'parchment' ? 'accent-[#8b5a2b]' : ''}
  `;

  const handleAiProviderChange = (provider: AIProvider) => {
    onUpdateSettings({ ...settings, aiProvider: provider });
  };

  const handleNewsProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateSettings({ ...settings, newsProvider: e.target.value as NewsProvider });
  };

  return (
    <div className={containerClasses}>
      <div className={headerClasses}>
        <div className="flex items-center gap-3">
          <SettingsIcon size={20} className={isRetro && skin === 'retro-amber' ? 'text-[#ffb000]' : isRetro ? 'text-[#33ff33]' : 'text-current'} />
          <h2 className={`text-lg font-bold ${theme.headerTitle}`}>
            SETTINGS
          </h2>
        </div>
        <button 
          onClick={onClose}
          className={theme.closeBtn}
          aria-label="Close settings"
        >
          <X size={18} />
        </button>
      </div>

      {/* Top-Level Tab Navigation */}
      <div 
        role="tablist" 
        aria-label="Settings categories"
        className={`flex shrink-0 ${theme.tabBar}`}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`settings-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const currentIndex = TABS.findIndex((t) => t.id === tab.id);
                  const nextTab = TABS[(currentIndex + 1) % TABS.length];
                  setActiveTab(nextTab.id);
                  document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const currentIndex = TABS.findIndex((t) => t.id === tab.id);
                  const prevTab = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
                  setActiveTab(prevTab.id);
                  document.getElementById(`settings-tab-${prevTab.id}`)?.focus();
                }
              }}
              className={`flex-1 py-2.5 px-1.5 text-xs uppercase tracking-wider font-semibold transition-colors text-center focus:outline-none ${
                isActive ? theme.tabActive : theme.tabInactive
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel Content */}
      <div 
        id={`settings-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        className={contentClasses}
      >
        {/* Tab 1: AI Provider */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className={sectionTitleClasses}>
              <Server size={16} />
              <span>AI Provider</span>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Provider</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => handleAiProviderChange(e.target.value as AIProvider)}
                  className={inputClasses}
                >
                  <option value="lmstudio">Local (LM Studio)</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>

              {settings.aiProvider === 'lmstudio' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className={labelClasses}>LM Studio API URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings.lmStudioUrl}
                        onChange={(e) => onUpdateSettings({ ...settings, lmStudioUrl: e.target.value })}
                        className={inputClasses}
                        placeholder="http://localhost:1234/v1"
                      />
                      <button
                        type="button"
                        onClick={handleDetectModels}
                        disabled={isDetectingModels || !settings.lmStudioUrl}
                        className={`px-3 py-2 rounded-lg text-sm border whitespace-nowrap transition-colors
                          ${isParchment ? 'border-[#8b5a2b]/30 hover:bg-[#e6d5b8]' : ''}
                          ${skin === 'modern' ? 'border-white/20 hover:bg-white/10' : ''}
                          ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/10 text-[#33ff33] disabled:opacity-50' : ''}
                          ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/20' : ''}
                        `}
                      >
                        {isDetectingModels ? 'Detecting...' : 'Detect'}
                      </button>
                    </div>
                    <p className={`text-xs mt-1 opacity-70 ${isRetro ? 'uppercase' : ''}`}>
                      Must include /v1 for OpenAI compatibility.
                    </p>
                  </div>

                  {availableModels.length > 0 && (
                    <div>
                      <label className={labelClasses}>Model</label>
                      <select
                        value={settings.lmStudioModel || availableModels[0]}
                        onChange={(e) => onUpdateSettings({ ...settings, lmStudioModel: e.target.value })}
                        className={inputClasses}
                      >
                        {availableModels.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestModelConnection}
                      disabled={modelTestStatus === 'testing' || !settings.lmStudioUrl}
                      className={`px-4 py-2 rounded-lg text-sm border font-medium transition-colors
                        ${isParchment ? 'border-[#8b5a2b] bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 text-[#8b5a2b]' : ''}
                        ${skin === 'modern' ? 'border-white/30 bg-white/10 hover:bg-white/20' : ''}
                        ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/20 text-[#33ff33] disabled:opacity-50' : ''}
                        ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/20' : ''}
                      `}
                    >
                      {modelTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                    {modelTestStatus !== 'idle' && (
                      <span className={`text-xs ${modelTestStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                        {modelTestMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: DOC MODE & Narration */}
        {activeTab === 'documentary' && (
          <div className="space-y-6">
            {/* Section 1: DOC MODE */}
            <div>
              <div>
                <div className={`flex items-center justify-between mb-1 ${isRetro ? 'border-b border-[#33ff33] pb-1' : ''} ${skin === 'retro-amber' ? 'border-[#ffb000]' : ''}`}>
                  <div className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${isParchment ? 'text-[#8b5a2b]' : ''} ${skin === 'modern' ? 'text-white/60' : ''} ${isRetro ? 'text-[#33ff33]' : ''} ${skin === 'retro-amber' ? 'text-[#ffb000]' : ''}`}>
                    <Film size={16} />
                    <span>DOC MODE</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!settings.documentaryMode}
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        documentaryMode: !settings.documentaryMode
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.documentaryMode
                        ? isParchment
                          ? 'bg-[#8b5a2b]'
                          : isRetro
                          ? skin === 'retro-amber'
                            ? 'bg-[#ffb000]'
                            : 'bg-[#33ff33]'
                          : 'bg-cyan-500'
                        : isParchment
                        ? 'bg-[#d2b48c]'
                        : isRetro
                        ? 'bg-transparent border-current'
                        : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.documentaryMode ? 'translate-x-5' : 'translate-x-0'
                      } ${isRetro ? (skin === 'retro-amber' ? 'bg-[#ffb000]' : 'bg-[#33ff33]') : ''}`}
                    />
                  </button>
                </div>
                <p className={`text-xs opacity-70 mt-2 mb-4 ${isRetro ? 'uppercase' : ''}`}>
                  Automatically guides the camera through a cinematic descent from the globe to the selected location.
                </p>
              </div>

              <div
                className={`space-y-4 transition-opacity duration-200 ${
                  settings.documentaryMode ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={labelClasses}>Camera Transition Duration</label>
                    <span className="text-xs opacity-70">
                      {(typeof settings.documentaryDuration === 'number' ? settings.documentaryDuration : 5.5).toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2.0"
                    max="10.0"
                    step="0.1"
                    value={typeof settings.documentaryDuration === 'number' ? settings.documentaryDuration : 5.5}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        documentaryDuration: parseFloat(e.target.value)
                      })
                    }
                    disabled={!settings.documentaryMode}
                    className={sliderClasses}
                  />
                </div>
              </div>
            </div>

            {/* Visual divider between DOC MODE and Narration */}
            <hr className={`border-t ${theme.divider}`} />

            {/* Section 2: Narration */}
            <div>
              <div>
                <div className={`flex items-center justify-between mb-1 ${isRetro ? 'border-b border-[#33ff33] pb-1' : ''} ${skin === 'retro-amber' ? 'border-[#ffb000]' : ''}`}>
                  <div className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${isParchment ? 'text-[#8b5a2b]' : ''} ${skin === 'modern' ? 'text-white/60' : ''} ${isRetro ? 'text-[#33ff33]' : ''} ${skin === 'retro-amber' ? 'text-[#ffb000]' : ''}`}>
                    <Volume2 size={16} />
                    <span>Narration</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!settings.narrationEnabled}
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        narrationEnabled: !settings.narrationEnabled
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.narrationEnabled
                        ? isParchment
                          ? 'bg-[#8b5a2b]'
                          : isRetro
                          ? skin === 'retro-amber'
                            ? 'bg-[#ffb000]'
                            : 'bg-[#33ff33]'
                          : 'bg-cyan-500'
                        : isParchment
                        ? 'bg-[#d2b48c]'
                        : isRetro
                        ? 'bg-transparent border-current'
                        : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.narrationEnabled ? 'translate-x-5' : 'translate-x-0'
                      } ${isRetro ? (skin === 'retro-amber' ? 'bg-[#ffb000]' : 'bg-[#33ff33]') : ''}`}
                    />
                  </button>
                </div>
                <p className={`text-xs opacity-70 mt-2 mb-4 ${isRetro ? 'uppercase' : ''}`}>
                  Narrates the selected location's title and description using speech synthesis.
                </p>
              </div>

              <div
                className={`space-y-4 transition-opacity duration-200 ${
                  settings.narrationEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                <div>
                  <label className={labelClasses}>Voice</label>
                  <select
                    value={settings.narrationVoice || ''}
                    onChange={(e) => {
                      const voice = e.target.value;
                      narrationService.setVoiceURI(voice);
                      onUpdateSettings({
                        ...settings,
                        narrationVoice: voice
                      });
                    }}
                    disabled={!settings.narrationEnabled}
                    className={inputClasses}
                  >
                    <option value="">System Default Voice</option>
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={labelClasses}>Speed</label>
                    <span className="text-xs opacity-70">
                      {(settings.narrationSpeed ?? 0.9).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={settings.narrationSpeed ?? 0.9}
                    onChange={(e) => {
                      const speed = parseFloat(e.target.value);
                      narrationService.setSpeed(speed);
                      onUpdateSettings({
                        ...settings,
                        narrationSpeed: speed
                      });
                    }}
                    disabled={!settings.narrationEnabled}
                    className={sliderClasses}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={labelClasses}>Volume</label>
                    <span className="text-xs opacity-70">
                      {Math.round((settings.narrationVolume ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.narrationVolume ?? 1.0}
                    onChange={(e) => {
                      const volume = parseFloat(e.target.value);
                      narrationService.setVolume(volume);
                      onUpdateSettings({
                        ...settings,
                        narrationVolume: volume
                      });
                    }}
                    disabled={!settings.narrationEnabled}
                    className={sliderClasses}
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    disabled={!settings.narrationEnabled}
                    className={`px-4 py-2 rounded-lg text-sm border font-medium transition-colors
                      ${isParchment ? 'border-[#8b5a2b] bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 text-[#8b5a2b]' : ''}
                      ${skin === 'modern' ? 'border-white/30 bg-white/10 hover:bg-white/20' : ''}
                      ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/20 text-[#33ff33] disabled:opacity-50' : ''}
                      ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/20' : ''}
                    `}
                  >
                    {isVoiceTesting ? 'Stop Sample' : 'Test Voice'}
                  </button>
                  {voiceTestMessage && (
                    <span className={`text-xs ${isParchment ? 'text-[#8b5a2b]' : isRetro ? 'text-current' : 'text-cyan-400'}`}>
                      {voiceTestMessage}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: News */}
        {activeTab === 'news' && (
          <div className="space-y-4">
            <div className={`flex items-center justify-between mb-1 ${isRetro ? 'border-b border-[#33ff33] pb-1' : ''} ${skin === 'retro-amber' ? 'border-[#ffb000]' : ''}`}>
              <div className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${isParchment ? 'text-[#8b5a2b]' : ''} ${skin === 'modern' ? 'text-white/60' : ''} ${isRetro ? 'text-[#33ff33]' : ''} ${skin === 'retro-amber' ? 'text-[#ffb000]' : ''}`}>
                <Newspaper size={16} />
                <span>NEWS PROVIDER</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isParchment ? 'text-[#8b5a2b]' : isRetro ? (skin === 'retro-amber' ? 'text-[#ffb000]' : 'text-[#33ff33]') : 'text-white/80'}`}>
                  SHOW NEWS
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showNews !== false}
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      showNews: settings.showNews === false ? true : false
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.showNews !== false
                      ? isParchment
                        ? 'bg-[#8b5a2b]'
                        : isRetro
                        ? skin === 'retro-amber'
                          ? 'bg-[#ffb000]'
                          : 'bg-[#33ff33]'
                        : 'bg-cyan-500'
                      : isParchment
                      ? 'bg-[#d2b48c]'
                      : isRetro
                      ? 'bg-transparent border-current'
                      : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      settings.showNews !== false ? 'translate-x-5' : 'translate-x-0'
                    } ${isRetro ? (skin === 'retro-amber' ? 'bg-[#ffb000]' : 'bg-[#33ff33]') : ''}`}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Service</label>
                <select
                  value={settings.newsProvider}
                  onChange={handleNewsProviderChange}
                  className={inputClasses}
                >
                  <option value="nyt">The New York Times</option>
                  <option value="newsapi">NewsAPI.org</option>
                  <option value="newsdata">NewsData.io</option>
                  <option value="gemini">Gemini (Default AI Search)</option>
                </select>
              </div>

              {settings.newsProvider !== 'gemini' && (
                <div className="pt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestNewsConnection}
                    disabled={newsTestStatus === 'testing'}
                    className={`px-4 py-2 rounded-lg text-sm border font-medium transition-colors
                      ${isParchment ? 'border-[#8b5a2b] bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 text-[#8b5a2b]' : ''}
                      ${skin === 'modern' ? 'border-white/30 bg-white/10 hover:bg-white/20' : ''}
                      ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/20 text-[#33ff33] disabled:opacity-50' : ''}
                      ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/20' : ''}
                    `}
                  >
                    {newsTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {newsTestStatus !== 'idle' && (
                    <span className={`text-xs ${newsTestStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {newsTestMessage}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Separator */}
            <hr className={`border-t my-4 ${theme.divider}`} />

            {/* API KEY SETUP Section */}
            <div className="space-y-4">
              <div className={sectionTitleClasses}>
                <KeyRound size={16} />
                <span>API KEY SETUP</span>
              </div>

              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${isParchment ? 'text-[#8b5a2b]' : skin === 'modern' ? 'text-cyan-300' : isRetro ? (skin === 'retro-amber' ? 'text-[#ffb000]' : 'text-[#33ff33]') : 'text-white/80'}`}>
                  News API Sources
                </h4>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">New York Times</span>
                      <a
                        href="https://developer.nytimes.com/get-started"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 hover:underline ${isParchment ? 'text-[#8b5a2b]' : skin === 'modern' ? 'text-cyan-400' : isRetro ? 'text-current' : 'text-cyan-400'}`}
                      >
                        <span>developer.nytimes.com</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                    <p className={`mt-0.5 opacity-70 ${isRetro ? 'uppercase' : ''}`}>
                      Obtain an API key from the New York Times Developer Portal.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">News API</span>
                      <a
                        href="https://newsapi.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 hover:underline ${isParchment ? 'text-[#8b5a2b]' : skin === 'modern' ? 'text-cyan-400' : isRetro ? 'text-current' : 'text-cyan-400'}`}
                      >
                        <span>newsapi.org</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                    <p className={`mt-0.5 opacity-70 ${isRetro ? 'uppercase' : ''}`}>
                      Obtain an API key from News API.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">NewsData</span>
                      <a
                        href="https://newsdata.io/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 hover:underline ${isParchment ? 'text-[#8b5a2b]' : skin === 'modern' ? 'text-cyan-400' : isRetro ? 'text-current' : 'text-cyan-400'}`}
                      >
                        <span>newsdata.io</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                    <p className={`mt-0.5 opacity-70 ${isRetro ? 'uppercase' : ''}`}>
                      Obtain an API key from NewsData.io.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wider mb-1 ${isParchment ? 'text-[#8b5a2b]' : skin === 'modern' ? 'text-cyan-300' : isRetro ? (skin === 'retro-amber' ? 'text-[#ffb000]' : 'text-[#33ff33]') : 'text-white/80'}`}>
                  API KEYS
                </h4>
                <p className={`text-xs opacity-70 mb-2 ${isRetro ? 'uppercase' : ''}`}>
                  Create a .env.local file in the project root and add your API keys:
                </p>
                <div className={`p-3 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto select-all ${
                  isParchment 
                    ? 'bg-[#e6d5b8] text-[#3e2723] border border-[#8b5a2b]/30' 
                    : isRetro 
                    ? (skin === 'retro-amber' ? 'bg-black/60 text-[#ffb000] border border-[#ffb000]' : 'bg-black/60 text-[#33ff33] border border-[#33ff33]') 
                    : 'bg-black/50 text-cyan-200 border border-white/10'
                }`}>
                  <pre className="whitespace-pre">{`VITE_NYT_API_KEY=""
VITE_NEWS_API_KEY=""
VITE_NEWS_DATA_API_KEY=""
GEMINI_API_KEY=""`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;
