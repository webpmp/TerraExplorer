
import React, { useState, useEffect, useRef } from 'react';
import { LocationInfo, SkinType, NotableItem } from '../types';
import { 
  X, Users, Thermometer, Info, Newspaper, Crown, Map, Pin, ExternalLink, Loader2,
  BookOpen, Rocket, Trophy, Music, FlaskConical, Palette, Clapperboard, Image as ImageIcon,
  Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Save, StickyNote
} from 'lucide-react';

interface InfoPanelProps {
  info: LocationInfo | null;
  onClose: () => void;
  isLoading: boolean;
  isNewsFetching: boolean;
  skin: SkinType;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onLoadMoreNews: () => Promise<void>;
}

interface Note {
  id: string;
  text: string;
  timestamp: number;
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
    // Safety check if item or name is missing
    if (!item || !item.name) return;

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
  }, [item?.name]);

  // Guard against null item rendering
  if (!item || !item.name) return null;

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
          <p className={`${subtextSize} mt-0.5 ${theme.bodyText} line-clamp-4`}>{item.significance}</p>
      </div>
      <div className="opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 flex items-start">
         <CopyButton text={`${item.name} - ${item.significance}`} skin={skin} />
      </div>
    </div>
  );
};

const InfoPanel: React.FC<InfoPanelProps> = ({ info, onClose, isLoading, isNewsFetching, skin, isFavorite, onToggleFavorite, onLoadMoreNews }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'notable'>('overview');
  const [isMoreNewsLoading, setIsMoreNewsLoading] = useState(false);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState(false);

  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  
  // Ref to track if we've initialized the expanded state for the current location
  const locationInitializedRef = useRef<string | null>(null);

  // Clean up wiki image when location changes to prevent stale images
  useEffect(() => {
    setWikiImage(null);
  }, [info?.name]);

  // Load Notes
  useEffect(() => {
    if (!info) {
        setNotes([]);
        return;
    }

    const locationKey = `notes_${info.name}_${info.coordinates.lat.toFixed(4)}_${info.coordinates.lng.toFixed(4)}`;
    
    // Check if we already initialized this location to prevent overriding user toggle
    // If it's a new location, we set default expanded state
    const isNewLocation = locationInitializedRef.current !== locationKey;
    
    if (isNewLocation) {
        locationInitializedRef.current = locationKey;
        const savedNotes = localStorage.getItem(locationKey);
        if (savedNotes) {
            try {
                const parsed = JSON.parse(savedNotes);
                setNotes(parsed);
                // If notes exist, expand by default for new location
                if (parsed.length > 0) setIsNotesExpanded(true);
                else setIsNotesExpanded(false);
            } catch (e) {
                setNotes([]);
                setIsNotesExpanded(false);
            }
        } else {
            setNotes([]);
            setIsNotesExpanded(false);
        }
    }
  }, [info]);

  // Save Notes Helper
  const saveNotesToStorage = (updatedNotes: Note[]) => {
    if (!info) return;
    const locationKey = `notes_${info.name}_${info.coordinates.lat.toFixed(4)}_${info.coordinates.lng.toFixed(4)}`;
    localStorage.setItem(locationKey, JSON.stringify(updatedNotes));
    setNotes(updatedNotes);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    
    const note: Note = {
        id: Date.now().toString(),
        text: newNote.trim(),
        timestamp: Date.now()
    };
    
    const updated = [...notes, note];
    saveNotesToStorage(updated);
    setNewNote("");
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    saveNotesToStorage(updated);
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditNoteText(note.text);
  };

  const saveEdit = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, text: editNoteText } : n);
    saveNotesToStorage(updated);
    setEditingNoteId(null);
    setEditNoteText("");
  };

  // Fetch image if population is missing
  useEffect(() => {
    const hasPopulation = isValidData(info?.population);
    
    if (info?.name && !hasPopulation) {
      const fetchImage = async () => {
        try {
          const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(info.name)}&prop=pageimages&format=json&pithumbsize=400&origin=*&redirects=1`);
          const data = await res.json();
          const pages = data.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            if (pageId !== "-1") {
                const url = pages[pageId]?.thumbnail?.source;
                setWikiImage(url || null);
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
        setWikiImage(null);
    }
  }, [info?.name, info?.population]);

  const handleLoadMore = async () => {
    setIsMoreNewsLoading(true);
    await onLoadMoreNews();
    setIsMoreNewsLoading(false);
  };

  // Theme configuration
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
      loadMoreBtn: "bg-white/5 border border-white/20 hover:bg-white/10 text-cyan-300 rounded-lg text-xs tracking-widest uppercase font-bold",
      notesInput: "bg-black/40 border border-white/20 text-white placeholder-gray-400 focus:border-cyan-400 rounded-lg",
      noteCard: "bg-black/40 border border-white/10 rounded-lg"
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
      loadMoreBtn: "bg-green-900/30 border border-green-400 hover:bg-green-400 hover:text-black text-green-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro",
      notesInput: "bg-black border border-green-400 text-green-300 placeholder-green-400/50 focus:bg-green-900/20 rounded-none font-retro",
      noteCard: "bg-black border border-green-400 rounded-none"
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
      loadMoreBtn: "bg-amber-900/30 border border-amber-400 hover:bg-amber-400 hover:text-black text-amber-300 rounded-none text-sm tracking-widest uppercase font-bold font-retro",
      notesInput: "bg-black border border-amber-400 text-amber-300 placeholder-amber-400/50 focus:bg-amber-900/20 rounded-none font-retro",
      noteCard: "bg-black border border-amber-400 rounded-none"
    }
  };

  const theme = themes[skin];
  const isRetro = skin !== 'modern';

  const titleSize = isRetro ? 'text-3xl' : 'text-2xl';
  const subtextSize = isRetro ? 'text-sm' : 'text-xs';
  const bodySize = isRetro ? 'text-lg' : 'text-sm';
  const smallTextSize = isRetro ? 'text-sm' : 'text-xs';
  const tabTextSize = isRetro ? 'text-sm' : 'text-xs';

  if (expandedImage && wikiImage) {
      return (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setExpandedImage(false)}>
              <div className="relative max-w-full max-h-full">
                  <img src={wikiImage} alt={info?.name} className={`max-w-full max-h-[90vh] object-contain ${isRetro ? 'grayscale contrast-125' : ''}`} />
                  <button className={`absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20`}>
                      <X size={24} />
                  </button>
              </div>
          </div>
      )
  }

  // Render Full Skeleton
  if (!info && isLoading) {
      return (
        <div className="absolute top-20 right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-140px)] flex flex-col animate-in slide-in-from-right-12 fade-in duration-500">
            <div className={`p-6 ${theme.container} ${isRetro ? 'animate-pulse' : ''}`}>
              {/* Skeleton content */}
              <div className={`h-8 w-3/4 ${isRetro ? 'bg-current opacity-40' : 'bg-white/20 rounded'} mb-4`}></div>
              <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
              <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
              <div className={`h-4 w-2/3 ${isRetro ? 'bg-current opacity-30' : 'bg-white/10 rounded'} mb-2`}></div>
            </div>
        </div>
      );
  }

  // If no info and not loading (e.g., initial state or cleared), don't render anything
  if (!info) return null;

  const showContentSkeleton = isLoading && (!info?.description || info.description === "");

  return (
    <div className="absolute top-20 right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-140px)] flex flex-col gap-3 animate-in slide-in-from-right-12 fade-in duration-500 pointer-events-none">
        
        {/* Main Info Box */}
        <div className={`${theme.container} flex flex-col shrink min-h-0 overflow-hidden pointer-events-auto`}>
          {/* Header */}
          <div className={`relative p-5 shrink-0 ${theme.header}`}>
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={onToggleFavorite} className={`p-1 transition-colors ${theme.actionBtn}`} title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}>
                <Pin size={20} className={isFavorite ? "fill-current" : ""} />
              </button>
              <button onClick={onClose} className={`p-1 transition-colors ${theme.closeBtn}`}>
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col gap-1 pr-12">
              <div className="flex items-center gap-2">
                 <h2 className={`${titleSize} font-bold ${theme.headerTitle}`}>{info.name}</h2>
                 <span className={`${smallTextSize} uppercase px-1.5 py-0.5 ${theme.tag}`}>{info.type}</span>
              </div>
              <p className={`${subtextSize} font-mono ${theme.subtext}`}>
                {info.coordinates?.lat ? info.coordinates.lat.toFixed(2) : '0.00'}° N, 
                {info.coordinates?.lng ? info.coordinates.lng.toFixed(2) : '0.00'}° E
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${isRetro ? 'border-current opacity-60' : 'border-white/10'}`}>
            <button onClick={() => setActiveTab('overview')} className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'overview' ? theme.tabActive : theme.tabInactive}`}>
              <Map size={14} /> Overview
            </button>
            <button onClick={() => setActiveTab('news')} className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'news' ? theme.tabActive : theme.tabInactive}`}>
              <Newspaper size={14} /> News
            </button>
            <button onClick={() => setActiveTab('notable')} className={`flex-1 py-2 ${tabTextSize} font-bold uppercase transition-colors flex items-center justify-center gap-1 ${activeTab === 'notable' ? theme.tabActive : theme.tabInactive}`}>
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
               </div>
            ) : (
                <>
                {activeTab === 'overview' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="relative group/desc">
                      <p className={`leading-relaxed ${bodySize} font-medium ${theme.bodyText} pr-8`}>
                      {info.description || "Description unavailable."}
                      </p>
                      <div className="absolute top-0 right-0 opacity-0 group-hover/desc:opacity-100 transition-opacity">
                        <CopyButton text={info.description || ""} skin={skin} />
                      </div>
                    </div>

                    {(isValidData(info.population) || isValidData(info.climate) || wikiImage) && (
                      <div className={`grid ${((isValidData(info.population) || wikiImage) && isValidData(info.climate)) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                        {isValidData(info.population) ? (
                          <div className={`p-3 ${theme.card}`}>
                              <div className={`flex items-center justify-between mb-1`}>
                                <div className={`flex items-center gap-2 ${theme.icon}`}>
                                    <Users size={16} />
                                    <span className={`${smallTextSize} font-bold uppercase`}>Population</span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyButton text={info.population || ""} skin={skin} />
                                </div>
                              </div>
                              <p className={`${isRetro ? 'text-lg' : 'text-sm'} font-bold font-mono`}>{info.population}</p>
                          </div>
                        ) : wikiImage ? (
                          <div 
                            className={`p-0 overflow-hidden relative h-28 ${theme.card} group cursor-pointer`}
                            onClick={() => setExpandedImage(true)}
                          >
                             <img src={wikiImage} alt={info.name} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isRetro ? 'grayscale contrast-125' : ''}`} />
                             <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center gap-1">
                                <ImageIcon size={12} className="text-white/80" />
                             </div>
                             <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-1 rounded-full text-white">
                                <ExternalLink size={12} />
                             </div>
                          </div>
                        ) : null}

                        {isValidData(info.climate) && (
                          <div className={`p-3 ${theme.card}`}>
                              <div className={`flex items-center justify-between mb-1`}>
                                <div className={`flex items-center gap-2 ${theme.icon}`}>
                                    <Thermometer size={16} />
                                    <span className={`${smallTextSize} font-bold uppercase`}>Climate</span>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CopyButton text={info.climate || ""} skin={skin} />
                                </div>
                              </div>
                              <p className={`${isRetro ? 'text-lg' : 'text-sm'} font-bold`}>{info.climate}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {info.funFacts && info.funFacts.length > 0 && (
                      <div className="relative group/facts">
                      <div className={`flex items-center justify-between mb-2 ${theme.icon}`}>
                          <div className="flex items-center gap-2">
                            <Info size={16} />
                            <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Quick Facts</span>
                          </div>
                          <div className="opacity-0 group-hover/facts:opacity-100 transition-opacity">
                            <CopyButton text={info.funFacts.join('\n')} skin={skin} />
                          </div>
                      </div>
                      <ul className="space-y-2">
                          {info.funFacts.map((fact, idx) => (
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
                    {isNewsFetching && !isMoreNewsLoading && info.news.length === 0 ? (
                       <div className="flex flex-col items-center justify-center py-8 opacity-50 animate-pulse">
                          <Loader2 size={24} className="animate-spin mb-2 text-current" />
                          <p className={smallTextSize}>Intercepting live signals...</p>
                       </div>
                    ) : info.news && info.news.length > 0 ? (
                       <>
                         {info.news.map((item, idx) => (
                            <div key={idx} className={`p-4 ${theme.card} flex flex-col gap-2 group/news`}>
                               <div className="flex justify-between items-start gap-2">
                                 <span className={`text-[10px] uppercase tracking-wider opacity-70 ${theme.subtext}`}>{item.source}</span>
                                 <a href={item.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/news:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded">
                                    <ExternalLink size={14} className={theme.icon} />
                                 </a>
                               </div>
                               <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${bodySize} font-bold leading-tight ${theme.headerTitle} hover:underline decoration-1 underline-offset-2`}>
                                 {item.headline}
                               </a>
                               {item.summary && (
                                  <p className={`${subtextSize} ${theme.bodyText} opacity-90 leading-relaxed`}>
                                    {item.summary}
                                  </p>
                               )}
                            </div>
                         ))}
                         <button 
                           onClick={handleLoadMore} 
                           disabled={isMoreNewsLoading}
                           className={`w-full py-3 mt-2 transition-colors ${theme.loadMoreBtn}`}
                         >
                           {isMoreNewsLoading ? "Scanning..." : "Load More Signals"}
                         </button>
                       </>
                    ) : (
                       <div className="text-center py-10 opacity-60">
                          <Newspaper size={32} className="mx-auto mb-2 opacity-50" />
                          <p className={theme.bodyText}>No recent transmissions found.</p>
                       </div>
                    )}
                  </div>
                )}

                {activeTab === 'notable' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {info.notable && info.notable.length > 0 ? (
                    info.notable.filter(item => item && item.name).map((item, idx) => (
                        <NotablePersonCard key={idx} item={item} theme={theme} skin={skin} bodySize={bodySize} subtextSize={subtextSize} />
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

        {/* My Notes Section - Always visible if info exists */}
        <div className={`pointer-events-auto shrink-0 transition-all duration-300 ${theme.container} ${!isNotesExpanded ? 'hover:brightness-110 cursor-pointer' : ''}`}>
             <div 
               className={`px-5 py-3 flex items-center justify-between cursor-pointer ${isNotesExpanded ? 'border-b ' + (isRetro ? 'border-green-400/50' : 'border-white/10') : ''}`}
               onClick={() => setIsNotesExpanded(!isNotesExpanded)}
             >
                <div className="flex items-center gap-2">
                    <StickyNote size={16} className={theme.icon} />
                    <span className={`font-bold uppercase ${isRetro ? 'text-lg' : 'text-sm'} ${theme.headerTitle}`}>My Notes</span>
                    {notes.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${isRetro ? 'bg-green-400 text-black' : 'bg-cyan-900 text-cyan-300'}`}>
                            {notes.length}
                        </span>
                    )}
                </div>
                {isNotesExpanded ? <ChevronDown size={18} className={theme.subtext} /> : <ChevronUp size={18} className={theme.subtext} />}
             </div>

             {isNotesExpanded && (
                 <div className="p-4 bg-opacity-50 animate-in slide-in-from-top-2 duration-300">
                     {/* Add Note Input */}
                     <form onSubmit={handleAddNote} className="mb-4 flex gap-2">
                         <input 
                            type="text" 
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add a personal note..."
                            className={`flex-1 px-3 py-2 outline-none text-sm transition-colors ${theme.notesInput}`}
                         />
                         <button 
                            type="submit"
                            disabled={!newNote.trim()}
                            className={`p-2 transition-colors disabled:opacity-50 ${theme.actionBtn}`}
                         >
                            <Plus size={18} />
                         </button>
                     </form>

                     {/* Notes List */}
                     <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                         {notes.length === 0 ? (
                             <p className={`text-center py-2 italic opacity-60 ${smallTextSize} ${theme.bodyText}`}>No notes yet.</p>
                         ) : (
                             notes.map((note) => (
                                 <div key={note.id} className={`p-3 group relative ${theme.noteCard}`}>
                                     {editingNoteId === note.id ? (
                                         <div className="flex flex-col gap-2">
                                             <textarea 
                                                value={editNoteText}
                                                onChange={(e) => setEditNoteText(e.target.value)}
                                                className={`w-full p-2 text-sm bg-transparent border-b ${isRetro ? 'border-green-400 text-green-300' : 'border-cyan-400 text-white'} outline-none resize-none`}
                                                rows={2}
                                                autoFocus
                                             />
                                             <div className="flex justify-end gap-2">
                                                 <button onClick={() => setEditingNoteId(null)} className="p-1 hover:text-red-400"><X size={14}/></button>
                                                 <button onClick={() => saveEdit(note.id)} className="p-1 hover:text-green-400"><Save size={14}/></button>
                                             </div>
                                         </div>
                                     ) : (
                                        <>
                                            <p className={`${bodySize} ${theme.bodyText} pr-6 break-words`}>{note.text}</p>
                                            <p className={`text-[10px] mt-1 opacity-50 ${theme.subtext}`}>
                                                {new Date(note.timestamp).toLocaleDateString()}
                                            </p>
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => startEditing(note)} className={`p-1 ${isRetro ? 'hover:text-green-200' : 'hover:text-cyan-200'}`}><Edit2 size={12} /></button>
                                                <button onClick={() => handleDeleteNote(note.id)} className={`p-1 hover:text-red-400`}><Trash2 size={12} /></button>
                                            </div>
                                        </>
                                     )}
                                 </div>
                             ))
                         )}
                     </div>
                 </div>
             )}
        </div>
    </div>
  );
};

export default InfoPanel;
