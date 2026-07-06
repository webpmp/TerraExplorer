import React from 'react';
import { Settings as SettingsIcon, X, Server, Newspaper } from 'lucide-react';
import { SkinType, UserSettings, AIProvider, NewsProvider } from '../types';

interface SettingsPanelProps {
  settings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
  onClose: () => void;
  skin: SkinType;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdateSettings, onClose, skin }) => {
  const isParchment = skin === 'parchment';
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';

  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [isDetectingModels, setIsDetectingModels] = React.useState(false);
  const [modelTestStatus, setModelTestStatus] = React.useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [modelTestMessage, setModelTestMessage] = React.useState('');
  const [newsTestStatus, setNewsTestStatus] = React.useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [newsTestMessage, setNewsTestMessage] = React.useState('');

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
        setModelTestStatus('error');
        setModelTestMessage(`Error: ${res.statusText}`);
      }
    } catch (e: any) {
      setModelTestStatus('error');
      setModelTestMessage(e.message || 'Connection failed');
    }
  };

  const handleTestNewsConnection = async () => {
    setNewsTestStatus('testing');
    setNewsTestMessage('Testing...');
    try {
      let url = '';
      if (settings.newsProvider === 'newsapi') {
        url = `https://newsapi.org/v2/everything?q=test&pageSize=1&apiKey=${settings.newsApiKey}`;
      } else if (settings.newsProvider === 'newsdata') {
        url = `https://newsdata.io/api/1/news?apikey=${settings.newsApiKey}&q=test&language=en`;
      } else if (settings.newsProvider === 'nyt') {
        url = `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=test&api-key=${settings.newsApiKey}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        setNewsTestStatus('success');
        setNewsTestMessage('API Key is valid!');
      } else {
        setNewsTestStatus('error');
        setNewsTestMessage(`Error: ${res.status} ${res.statusText}`);
      }
    } catch (e: any) {
      setNewsTestStatus('error');
      setNewsTestMessage(e.message || 'Connection failed');
    }
  };


  const themes = {
    'modern': {
      container: "bg-black/75 backdrop-blur-md border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      header: "bg-gradient-to-r from-blue-900 to-cyan-900",
      headerTitle: "brand-font text-white",
      closeBtn: "hover:bg-white/20 text-white rounded-full p-1 transition-colors"
    },
    'retro-green': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      header: "bg-green-900/30 border-b-2 border-green-400",
      headerTitle: "text-green-300 uppercase",
      closeBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none p-1 transition-colors"
    },
    'retro-amber': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      header: "bg-amber-900/30 border-b-2 border-amber-400",
      headerTitle: "text-amber-300 uppercase",
      closeBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none p-1 transition-colors"
    },
    'parchment': {
      container: "bg-[#f4ead5] border border-[#8b5a2b] shadow-[4px_4px_10px_rgba(0,0,0,0.3)] text-[#3e2723] font-sans",
      header: "bg-[#e8d5b5]/30 border-b border-[#8b5a2b]",
      headerTitle: "text-[#5c3a21] font-bold uppercase tracking-wider brand-font",
      closeBtn: "hover:bg-[#d2b48c]/50 hover:text-[#5c3a21] text-[#8b5a2b] rounded p-1 transition-colors"
    }
  };

  const theme = themes[skin];

  const containerClasses = `
    relative w-96 flex flex-1 flex-col shrink min-h-0 pointer-events-auto transition-all duration-300 overflow-hidden
    ${theme.container}
  `;

  const headerClasses = `
    p-4 flex items-center justify-between shrink-0
    ${theme.header}
  `;

  const contentClasses = `
    flex-1 overflow-y-auto p-6 space-y-8
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

  const radioClasses = `
    flex items-center gap-2 text-sm p-3 rounded-lg border cursor-pointer transition-colors
    ${isParchment ? 'border-[#8b5a2b]/30 hover:bg-[#e6d5b8]/50' : ''}
    ${skin === 'modern' ? 'border-white/10 hover:bg-white/10' : ''}
    ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/10' : ''}
    ${skin === 'retro-amber' ? 'border-[#ffb000] hover:bg-[#ffb000]/10' : ''}
  `;

  const radioSelectedClasses = `
    ${isParchment ? 'bg-[#e6d5b8] border-[#8b5a2b]' : ''}
    ${skin === 'modern' ? 'bg-white/20 border-white/40' : ''}
    ${isRetro ? 'bg-[#33ff33]/20 border-[#33ff33]' : ''}
    ${skin === 'retro-amber' ? 'bg-[#ffb000]/20 border-[#ffb000]' : ''}
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
        >
          <X size={18} />
        </button>
      </div>

      <div className={contentClasses}>
        {/* AI Configuration */}
        <div>
          <div className={sectionTitleClasses}>
            <Server size={16} />
            <span>AI Provider</span>
          </div>
          
          <div className="space-y-3 mb-4">
            <label 
              className={`${radioClasses} ${settings.aiProvider === 'gemini' ? radioSelectedClasses : ''}`}
            >
              <input 
                type="radio" 
                name="aiProvider" 
                value="gemini" 
                checked={settings.aiProvider === 'gemini'} 
                onChange={() => handleAiProviderChange('gemini')}
                className="hidden"
              />
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center
                ${settings.aiProvider === 'gemini' ? (skin === 'retro-amber' ? 'border-[#ffb000]' : skin === 'retro-green' ? 'border-[#33ff33]' : isParchment ? 'border-[#8b5a2b]' : 'border-white') : 'border-current'}
              `}>
                {settings.aiProvider === 'gemini' && <div className="w-2 h-2 rounded-full bg-current" />}
              </div>
              <span className="font-medium">Gemini (Default)</span>
            </label>

            <label 
              className={`${radioClasses} ${settings.aiProvider === 'lmstudio' ? radioSelectedClasses : ''}`}
            >
              <input 
                type="radio" 
                name="aiProvider" 
                value="lmstudio" 
                checked={settings.aiProvider === 'lmstudio'} 
                onChange={() => handleAiProviderChange('lmstudio')}
                className="hidden"
              />
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center
                ${settings.aiProvider === 'lmstudio' ? (skin === 'retro-amber' ? 'border-[#ffb000]' : skin === 'retro-green' ? 'border-[#33ff33]' : isParchment ? 'border-[#8b5a2b]' : 'border-white') : 'border-current'}
              `}>
                {settings.aiProvider === 'lmstudio' && <div className="w-2 h-2 rounded-full bg-current" />}
              </div>
              <span className="font-medium">Local (LM Studio)</span>
            </label>
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
                    onClick={handleDetectModels}
                    disabled={isDetectingModels || !settings.lmStudioUrl}
                    className={`px-3 py-2 rounded-lg text-sm border whitespace-nowrap transition-colors
                      ${isParchment ? 'border-[#8b5a2b]/30 hover:bg-[#e6d5b8]' : ''}
                      ${skin === 'modern' ? 'border-white/20 hover:bg-white/10' : ''}
                      ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/10 text-[#33ff33] disabled:opacity-50' : ''}
                      ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/10' : ''}
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
                    {availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
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

        {/* News Configuration */}
        <div>
          <div className={sectionTitleClasses}>
            <Newspaper size={16} />
            <span>News Provider</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClasses}>Service</label>
              <select
                value={settings.newsProvider}
                onChange={handleNewsProviderChange}
                className={inputClasses}
              >
                <option value="gemini">Gemini (Default AI Search)</option>
                <option value="newsapi">NewsAPI.org</option>
                <option value="newsdata">NewsData.io</option>
                <option value="nyt">The New York Times</option>
              </select>
            </div>

            {settings.newsProvider !== 'gemini' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                  <label className={labelClasses}>API Key</label>
                  <input
                    type="password"
                    value={settings.newsApiKey}
                    onChange={(e) => onUpdateSettings({ ...settings, newsApiKey: e.target.value })}
                    className={inputClasses}
                    placeholder={`Enter ${settings.newsProvider === 'nyt' ? 'NYT' : settings.newsProvider === 'newsapi' ? 'NewsAPI' : 'NewsData'} API Key`}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTestNewsConnection}
                    disabled={newsTestStatus === 'testing' || !settings.newsApiKey}
                    className={`px-4 py-2 rounded-lg text-sm border font-medium transition-colors
                      ${isParchment ? 'border-[#8b5a2b] bg-[#8b5a2b]/10 hover:bg-[#8b5a2b]/20 text-[#8b5a2b]' : ''}
                      ${skin === 'modern' ? 'border-white/30 bg-white/10 hover:bg-white/20' : ''}
                      ${isRetro ? 'border-[#33ff33] rounded-none hover:bg-[#33ff33]/20 text-[#33ff33] disabled:opacity-50' : ''}
                      ${skin === 'retro-amber' ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/20' : ''}
                    `}
                  >
                    {newsTestStatus === 'testing' ? 'Testing...' : 'Test API Key'}
                  </button>
                  {newsTestStatus !== 'idle' && (
                    <span className={`text-xs ${newsTestStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {newsTestMessage}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
