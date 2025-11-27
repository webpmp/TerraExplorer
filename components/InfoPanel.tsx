
import React, { useState, useEffect } from 'react';
import { LocationInfo, SkinType, NotableItem } from '../types';
import { 
  X, Users, Thermometer, Info, Newspaper, Crown, Map, Pin, ExternalLink, Loader2,
  BookOpen, Rocket, Trophy, Music, FlaskConical, Palette, Clapperboard, Image as ImageIcon,
  Copy, Check
} from 'lucide-react';

interface InfoPanelProps {
  info: LocationInfo | null;
  onClose: () => void;
  isLoading: boolean;
  skin: SkinType;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onLoadMoreNews: () => Promise<void>;
}

// Helper to validate data availability
const isValidData = (val: string | undefined) => {
  if (!val) return false;
  const v = val.toLowerCase().trim();
  
  // Check for keywords appearing within the string (substring match)
  if (v.includes('n/a') || v.includes('not applicable') || v.includes('not available') || v.includes('unknown')) {
      return false;
  }

  // Exact matches for specific states
  return ![
    'none', 
    '', 
    'uninhabited', 
    '0', 
    'no permanent population'
  ].includes(v);
};

const CopyButton: React.FC<{ text: string; className?: string; skin: SkinType }> = ({ text, className = "", skin }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRetro = skin !== 'modern';
  const themeClass = isRetro 
    ? "hover:text-black hover:bg-current border border-transparent hover:border-current rounded-none" 
    : "hover:bg-white/10 rounded-full";

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 transition-all opacity-60 hover:opacity-100 ${themeClass} ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

const getNotableIcon = (category: string = "General") => {
  const c = category?.toLowerCase() || "";
  if (c.includes('lit') || c.includes('writ') || c.includes('author') || c.includes('poet')) return <BookOpen size={16} />;
  if (c.includes('space') || c.includes('astro')) return <Rocket size={16} />;
  if (c.includes('sport') || c.includes('athl')) return <Trophy size={16} />;
  if (c.includes('music') || c.includes('sing') || c.includes('band')) return <Music size={16} />;
  if (c.includes('sci') || c.includes('phys') || c.includes('chem')) return <FlaskConical size={16} />;
  if (c.includes('art') || c.includes('paint')) return <Palette size={16} />;
  if (c.includes('film') || c.includes('act') || c.includes('direct')) return <Clapperboard size={16} />;
  // Default
  return <Crown size={16} />;
};

const NotablePersonCard: React.FC<{ 
  item: NotableItem; 
  theme: any; 
  skin: SkinType; 
  bodySize: string; 
  subtextSize: string 
}> = ({ item, theme, skin, bodySize, subtextSize }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchImage = async () => {
      try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(item.name)}&prop=pageimages&format=json&pithumbsize=100&origin=*&redirects=1`);
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages && active) {
            const pageId = Object.keys(pages)[0];
            if (pageId !== "-1") {
                setImageUrl(pages[pageId]?.thumbnail?.source || null);
            }
        }
      } catch (e) {
        // ignore
      }
    };
    fetchImage();
    return () => { active = false; };
  }, [item.name]);

  return (
    <div className={`p-3 ${theme.card} flex items-start gap-3 group/item relative`}>
      <div className={`shrink-0 mt-0.5 ${theme.icon} flex items-center justify-center w-10`}>
        {imageUrl ? (
           <img 
             src={imageUrl} 
             alt={item.name} 
             className={`w-10 h-10 object-cover ${skin === 'modern' ? 'rounded-full' : 'rounded-none grayscale contrast-125'} border ${skin === 'modern' ? 'border-white/20' : 'border-current'}`} 
           />
        ) : (
           <div className={`w-10 h-10 flex items-center justify-center ${skin === 'modern' ? 'bg-white/5 rounded-full' : 'border border-current'}`}>
              {getNotableIcon(item.category)}
           </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
          <a 
              href={`https://en.wikipedia.org/wiki/${encodeURIComponent(item.name.replace(/ /g, '_'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${bodySize} font-bold ${theme.headerTitle} hover:underline decoration-1 underline-offset-2 block truncate`}
          >
              {item.name}
          </a>
          <p className={`${subtextSize} mt-0.5 ${theme.bodyText} line-clamp-2`}>{item.significance}</p>
      </div>
      <div className="opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 flex items-start">
         <CopyButton text={`${item.name} - ${item.significance}`} skin={skin} />
      </div>
    </div>
  );
};

const InfoPanel: React.FC<InfoPanelProps> = ({ info, onClose, isLoading, skin, isFavorite, onToggleFavorite, onLoadMoreNews }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'notable'>('overview');
  const [isNewsLoading, setIsNewsLoading] = useState(false);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState(false);

  // Fetch image if population is missing
  useEffect(() => {
    const hasPopulation = isValidData(info?.population);
    
    if (info?.name && !hasPopulation) {
      const fetchImage = async () => {
        try {
          // Added &redirects=1 to handle name variations (e.g. "Endurance" -> "Endurance (1912 ship)")
          const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(info.name)}&prop=pageimages&format=json&pithumbsize=400&origin=*&redirects=1`);
          const data = await res.json();
          const pages = data.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            // Check if pageId is valid (not -1 for missing)
            if (pageId !== "-1") {
                const url = pages[pageId]?.thumbnail?.source;
                if (url) {
                    setWikiImage(url);
                } else {
                    setWikiImage(null);
                }
            } else {
                setWikiImage(null);
            }
          }
        } catch (e) {
          console.error("Failed to fetch image", e);
          setWikiImage(null);
        }
      };
      fetchImage();
    } else if (info?.name && hasPopulation) {
        // If population becomes available (e.g. after loading), clear image
        setWikiImage(null);
    }
  }, [info?.name, info?.population]);

  // We render if we have info OR if we are loading (showing skeleton)
  // If isLoading is true but info is present, we show partial state
  if (!info && !isLoading) return null;

  const handleLoadMore = async () => {
    setIsNewsLoading(true);
    await onLoadMoreNews();
    setIsNewsLoading(false);
  };

  // Theme configuration - Updated for Higher Contrast (using 300/400 instead of 500/600)
  const themes = {
    'modern': {
      container: "bg-black/80 backdrop-blur-xl border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      header: "bg-gradient-to-r from-blue-900 to-cyan-900",
      headerTitle: "brand-font text-white",
      tag: "text-cyan-300 border-cyan-400/50 bg-cyan-900/60 rounded-full",
      subtext: "text-cyan-200 opacity-90",
      bodyText: "text-gray-100",
      card: "bg-white/10 border border-white/20 rounded-lg hover:bg-white/15 transition-colors block relative group",
      icon: "text-cyan-300",
      tabActive: "border-b-2 border-cyan-400 text-cyan-400 bg-cyan-900/20",
      tabInactive: "text-gray-400 hover:text-white hover:bg-white/5",
      listDot: "bg-cyan-400 rounded-full",
      closeBtn: "hover:bg-white/20 text-white rounded-full",
      actionBtn: "hover:bg-white/20 text-white rounded-full",
      loadMoreBtn: "bg-white/5 border border-white/20 hover:bg-white/10 text-cyan-300 rounded-lg text-xs tracking-widest uppercase font-bold"
    },
    'retro-green': {
      container: "bg-black border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      header: "bg-green-900/30 border-b-2 border-green-400",
      headerTitle: "text-green-300 uppercase",
      tag: "text-black bg-green-400 border-green-400 rounded-none font-bold",
      subtext: "text-green-300",
      bodyText: "text-green-200",
      card: "bg-black border border-green-400 rounded-none hover:bg-green-900/20 block relative group",
      icon: "text-green-300",
      tabActive: "bg-green-400 text-black border-2 border-green-400",
      tabInactive: "text-green-400 border-2 border-transparent hover:border-green-400/50",
      listDot: "bg-green-400 rounded-none",
      closeBtn: "hover:bg-green-400 hover:text-black text-green-300 border border-green-400 rounded-none",
      actionBtn: "hover:bg-green-400 hover:text-black text-green-300 border border-green-400 rounded-none",
      loadMoreBtn: "bg-green-900/30 border border-green-400 hover:bg-green-400 hover:text-black text-green-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro"
    },
    'retro-amber': {
      container: "bg-black border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      header: "bg-amber-900/30 border-b-2 border-amber-400",
      headerTitle: "text-amber-300 uppercase",
      tag: "text-black bg-amber-400 border-amber-400 rounded-none font-bold",
      subtext: "text-amber-300",
      bodyText: "text-amber-200",
      card: "bg-black border border-amber-400 rounded-none hover:bg-amber-900/20 block relative group",
      icon: "text-amber-300",
      tabActive: "bg-amber-400 text-black border-2 border-amber-400",
      tabInactive: "text-amber-400 border-2 border-transparent hover:border-amber-400/50",
      listDot: "bg-amber-400 rounded-none",
      closeBtn: "hover:bg-amber-400 hover:text-black text-amber-300 border border-amber-400 rounded-none",
      actionBtn: "hover:bg-amber-400 hover:text-black text-amber-300 border border-amber-400 rounded-none",
      loadMoreBtn: "bg-amber-900/30 border border-amber-400 hover:bg-amber-400 hover:text-black text-amber-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro"
    }
  };

  const theme = themes[skin];
  const isRetro = skin !== 'modern';

  // Dynamic Font Sizes for Retro Mode
  const titleSize = isRetro ? 'text-3xl' : 'text-2xl';
  const subtextSize = isRetro ? 'text-sm' : 'text-xs';
  const bodySize = isRetro ? 'text-lg' : 'text-sm';
  const smallTextSize = isRetro ? 'text-sm' : 'text-[10px]';
  const tabTextSize = isRetro ? 'text-sm' : 'text-xs';

  const hasPopulation = isValidData(info?.population);
  const hasClimate = isValidData(info?.climate);
  const hasFunFacts = info?.funFacts && info.funFacts.length > 0;

  // Full Screen Image Modal
  if (expandedImage && wikiImage) {
      return (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setExpandedImage(false)}>
              <div className="relative max-w-full max-h-full">
                  <img src={wikiImage} alt={info?.name} className={`max-w-full max-h-[90vh] object-contain ${isRetro ? 'grayscale contrast-125' : ''}`} />
                  <button className={`absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20`}>
                      <X size={24} />
                  </button>
                  <div className="absolute bottom-4 left-0 right-0 text-center text-white/80 font-mono text-sm uppercase tracking-widest pointer-events-none">
                      Tap anywhere to close
                  </div>
              </div>
          </div>
      )
  }

  // Render Full Skeleton if no info at all
  if (!info && isLoading) {
      return (
        <div className="absolute top-20 right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-140px)] flex flex-col animate-in slide-in-from-right-12 fade-in duration-500">
            <div className={`p-6 ${theme.container} ${isRetro ? 'animate-pulse' : ''}`}>
            {isRetro && <div className="text-center mb-4 uppercase text-2xl font-bold">Scanning...</div>}
            <div className={`h-8 w-3/4 ${isRetro ? 'bg-current opacity-40' : 'bg-white/20 rounded'} mb-4`}></div>
            <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
            <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
            <div className={`h-4 w-2/3 ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
            {!isRetro && <p className="text-cyan-300 mt-4 text-sm font-mono text-center animate-pulse">Accessing Global Database...</p>}
            </div>
        </div>
      );
  }

  // At this point we have info (potentially partial)
  // If info exists but description is empty and isLoading is true, show content skeleton
  const showContentSkeleton = isLoading && (!info?.description || info.description === "");

  return (
    <div className="absolute top-20 right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-140px)] flex flex-col animate-in slide-in-from-right-12 fade-in duration-500">
        <div className={`${theme.container} flex flex-col h-full overflow-hidden`}>
          {/* Header - Always visible if info is present */}
          <div className={`relative p-5 shrink-0 ${theme.header}`}>
            <div className="absolute top-3 right-3 flex gap-2">
              <button 
                onClick={onToggleFavorite}
                className={`p-1 transition-colors ${theme.actionBtn}`}
                title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Pin size={20} className={isFavorite ? "fill-current" : ""} />
              </button>
              <button 
                onClick={onClose}
                className={`p-1 transition-colors ${theme.closeBtn}`}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col gap-1 pr-12">
              <div className="flex items-center gap-2">
                 <h2 className={`${titleSize} font-bold ${theme.headerTitle}`}>{info!.name}</h2>
                 <span className={`${smallTextSize} uppercase px-1.5 py-0.5 ${theme.tag}`}>
                  {info!.type}
                </span>
              </div>
              {/* Safe check for coordinates to prevent crash if undefined */}
              <p className={`${subtextSize} font-mono ${theme.subtext}`}>
                {info!.coordinates?.lat ? info!.coordinates.lat.toFixed(2) : '0.00'}° N, 
                {info!.coordinates?.lng ? info!.coordinates.lng.toFixed(2) : '0.00'}° E
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${isRetro ? 'border-current opacity-60' : 'border-white/10'}`}>
            <button 
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'overview' ? theme.tabActive : theme.tabInactive}`}
            >
              <Map size={14} /> Overview
            </button>
            <button 
              onClick={() => setActiveTab('news')}
              className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'news' ? theme.tabActive : theme.tabInactive}`}
            >
              <Newspaper size={14} /> News
            </button>
            <button 
              onClick={() => setActiveTab('notable')}
              className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'notable' ? theme.tabActive : theme.tabInactive}`}
            >
              <Crown size={14} /> Notable
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-5 overflow-y-auto custom-scrollbar flex-1 relative">
            
            {showContentSkeleton ? (
               <div className={`space-y-4 ${isRetro ? 'animate-pulse' : 'animate-pulse'}`}>
                  <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'}`}></div>
                  <div className={`h-4 w-5/6 ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'}`}></div>
                  <div className={`h-4 w-4/6 ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'}`}></div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                     <div className={`h-16 ${theme.card}`}></div>
                     <div className={`h-16 ${theme.card}`}></div>
                  </div>
                  {isRetro && <div className="text-center mt-4 text-sm font-bold uppercase">Retrieving Data...</div>}
               </div>
            ) : (
                <>
                {activeTab === 'overview' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="relative group/desc">
                      {/* Added pr-8 to text to prevent overlap with absolute positioned copy button */}
                      <p className={`leading-relaxed ${bodySize} font-medium ${theme.bodyText} pr-8`}>
                      {info!.description}
                      </p>
                      <div className="absolute top-0 right-0 opacity-0 group-hover/desc:opacity-100 transition-opacity">
                        <CopyButton text={info!.description} skin={skin} />
                      </div>
                    </div>

                    {(hasPopulation || hasClimate || wikiImage) && (
                      <div className={`grid ${((hasPopulation || wikiImage) && hasClimate) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                        {hasPopulation ? (
                          <div className={`p-3 ${theme.card}`}>
                              {/* Header row with flex justify-between for copy button to avoid overlap */}
                              <div className={`flex items-center justify-between mb-1`}>
                                <div className={`flex items-center gap-2 ${theme.icon}`}>
                                    <Users size={16} />
                                    <span className={`${smallTextSize} font-bold uppercase`}>Population</span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyButton text={info!.population || ""} skin={skin} />
                                </div>
                              </div>
                              <p className={`${isRetro ? 'text-lg' : 'text-sm'} font-bold font-mono`}>{info!.population}</p>
                          </div>
                        ) : wikiImage ? (
                          <div 
                            className={`p-0 overflow-hidden relative h-28 ${theme.card} group cursor-pointer`}
                            onClick={() => setExpandedImage(true)}
                          >
                             <img src={wikiImage} alt={info!.name} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isRetro ? 'grayscale contrast-125' : ''}`} />
                             <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center gap-1">
                                <ImageIcon size={12} className="text-white/80" />
                             </div>
                             {/* Expand icon on hover */}
                             <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-1 rounded-full text-white">
                                <ExternalLink size={12} />
                             </div>
                          </div>
                        ) : null}

                        {hasClimate && (
                          <div className={`p-3 ${theme.card}`}>
                              {/* Header row with flex justify-between for copy button to avoid overlap */}
                              <div className={`flex items-center justify-between mb-1`}>
                                <div className={`flex items-center gap-2 ${theme.icon}`}>
                                    <Thermometer size={16} />
                                    <span className={`${smallTextSize} font-bold uppercase`}>Climate</span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyButton text={info!.climate || ""} skin={skin} />
                                </div>
                              </div>
                              <p className={`${isRetro ? 'text-lg' : 'text-sm'} font-bold`}>{info!.climate}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {hasFunFacts && (
                      <div className="relative group/facts">
                      <div className={`flex items-center justify-between mb-2 ${theme.icon}`}>
                          <div className="flex items-center gap-2">
                            <Info size={16} />
                            <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Quick Facts</span>
                          </div>
                          <div className="opacity-0 group-hover/facts:opacity-100 transition-opacity">
                            <CopyButton text={info!.funFacts.join('\n')} skin={skin} />
                          </div>
                      </div>
                      <ul className="space-y-2">
                          {info!.funFacts.map((fact, idx) => (
                          <li key={idx} className={`flex gap-3 ${bodySize} ${theme.bodyText}`}>
                              <span className={`block w-1.5 h-1.5 mt-2 flex-shrink-0 ${theme.listDot}`} />
                              {fact}
                          </li>
                          ))}
                      </ul>
                      </div>
                    )}
                </div>
                )}

                {activeTab === 'news' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {info!.news && info!.news.length > 0 ? (
                    info!.news.map((item, idx) => {
                        const linkUrl = item.url || `https://www.google.com/search?q=${encodeURIComponent(item.headline + " " + info.name)}`;
                        return (
                            <div key={idx} className={`p-3 ${theme.card} group/news relative`}>
                                <div className="pr-6">
                                    <a 
                                        href={linkUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="block"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <h4 className={`${bodySize} font-bold mb-1 ${theme.bodyText} group-hover/news:underline`}>{item.headline}</h4>
                                            <ExternalLink size={isRetro ? 14 : 12} className={`opacity-50 shrink-0 ${theme.icon}`} />
                                        </div>
                                        <span className={`${smallTextSize} uppercase opacity-70 ${theme.subtext}`}>Source: {item.source}</span>
                                    </a>
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover/news:opacity-100 transition-opacity z-10">
                                    <CopyButton text={`${item.headline} - ${item.url || "Source: " + item.source}`} skin={skin} />
                                </div>
                            </div>
                        );
                    })
                    ) : (
                    <p className={`${bodySize} italic ${theme.bodyText}`}>No recent news for {info!.name}.</p>
                    )}
                    
                    {info!.news && info!.news.length > 0 && (
                        <button 
                            onClick={handleLoadMore} 
                            disabled={isNewsLoading}
                            className={`w-full py-3 flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${theme.loadMoreBtn}`}
                        >
                            {isNewsLoading ? <Loader2 size={16} className="animate-spin" /> : "MORE NEWS"}
                        </button>
                    )}
                </div>
                )}

                {activeTab === 'notable' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {info!.notable && info!.notable.length > 0 ? (
                    info!.notable.map((item, idx) => (
                        <NotablePersonCard 
                          key={idx}
                          item={item}
                          theme={theme}
                          skin={skin}
                          bodySize={bodySize}
                          subtextSize={subtextSize}
                        />
                    ))
                    ) : (
                    <p className={`${bodySize} italic ${theme.bodyText}`}>No notable figures recorded in this database.</p>
                    )}
                </div>
                )}
                </>
            )}

          </div>
        </div>
    </div>
  );
};

export default InfoPanel;
