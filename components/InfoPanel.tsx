
import React, { useState, useEffect, useRef } from 'react';
import { ENTITY_SCHEMAS } from '../entitySchema';
import { LocationInfo, SkinType, isValidCoordinates, LocationType } from '../types';
import { 
  X, Users, Thermometer, Info, Newspaper, Crown, Map, Pin, ExternalLink, Loader2,
  BookOpen, Rocket, Trophy, Music, FlaskConical, Palette, Clapperboard, Image as ImageIcon,
  Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Save, StickyNote, ChevronLeft, ChevronRight,
  MapPin, Route as RouteIcon
} from 'lucide-react';

interface InfoPanelProps {
  info: any; // Raw input (can be LocationInfo or waypoint wrapper)
  onClose: () => void;
  isLoading: boolean;
  isNewsFetching: boolean;
  skin: SkinType;
  isFavorite: boolean;
  onSaveFavorite: (name: string) => void;
  onRemoveFavorite: () => void;
  currentFavoriteName?: string;
  onLoadMoreNews: () => Promise<void>;
  routeNav?: {
    current: number;
    total: number;
    onNext: () => void;
    onPrev: () => void;
  };
}

interface Note {
  id: string;
  text: string;
  timestamp: number;
}

// Helper to validate data availability
const isValidData = (val: string | null | undefined) => {
  if (val === null || val === undefined) return false;
  const v = val.toString().toLowerCase().trim();
  if (v === '' || v === 'undefined' || v === 'null') return false;
  
  // Check for keywords appearing within the string (substring match)
  if (v.includes('n/a') || v.includes('not applicable') || v.includes('not available') || v.includes('unknown') || v.includes('varies') || v.includes('historical')) {
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

// Helper to safely convert mixed array elements to plain strings (useful for Copy buttons)
const getSafeTextString = (item: any): string => {
  if (item === null || item === undefined) return "";
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  
  if (typeof item === 'object') {
    if (item.name && item.significance) {
      return `${item.name}: ${item.significance}`;
    }
    if (item.name) return String(item.name);
    if (item.text) return String(item.text);
    if (item.description) return String(item.description);
    
    try {
      const values = Object.values(item).filter(v => typeof v === 'string');
      if (values.length > 0) return values.join(': ');
      return JSON.stringify(item);
    } catch {
      return "Invalid data";
    }
  }
  return String(item);
};

// Helper to safely render mixed array elements (strings or structured objects)
const renderSafeText = (item: any): React.ReactNode => {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  
  if (typeof item === 'object') {
    if (item.name && item.significance) {
      return (
        <span className="block">
          <span className="font-bold">{item.name}</span>: {item.significance}
        </span>
      );
    }
    if (item.name) return String(item.name);
    if (item.text) return String(item.text);
    if (item.description) return String(item.description);
    
    try {
      const values = Object.values(item).filter(v => typeof v === 'string');
      if (values.length > 0) return values.join(': ');
      return JSON.stringify(item);
    } catch {
      return "Invalid data";
    }
  }
  return String(item);
};

  const CopyButton: React.FC<{ text: string; className?: string; skin: SkinType }> = ({ text, className = "", skin }) => {
  const [copied, setCopied] = useState(false);
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  const isParchment = skin === 'parchment';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const themeClass = isRetro 
    ? "hover:text-black hover:bg-current border border-transparent hover:border-current rounded-none" 
    : isParchment
    ? "hover:bg-[#d2b48c]/50 hover:text-[#3e2723] border border-transparent rounded-sm"
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


const InfoPanel: React.FC<InfoPanelProps> = ({ 
  info: rawInfo, 
  onClose, 
  isLoading, 
  isNewsFetching, 
  skin, 
  isFavorite, 
  onSaveFavorite, 
  onRemoveFavorite, 
  currentFavoriteName, 
  onLoadMoreNews, 
  routeNav 
}: InfoPanelProps) => {
  const info = React.useMemo(() => {
    console.log("=== INFOPANEL BOUNDARY: Before Normalization ===");
    console.log("rawInfo keys:", rawInfo ? Object.keys(rawInfo) : "null");

    if (!rawInfo) return null;

    const wp = rawInfo.waypoint || {};
    
    // 1. Name
    const name = wp.name || rawInfo.name || "Unknown Location";

    // 2. Description fallback
    // Priority: rawInfo.description > wp.description > wp.significance > routeContext
    const geographicDesc = rawInfo.description && rawInfo.description !== "Information unavailable." ? rawInfo.description : null;
    const historicalDesc = wp.description || null;
    const routeContextText = rawInfo.routeContext?.text || null;
    
    let desc = "Detailed description unavailable.";
    let descSource = "Fallback";
    
    if (geographicDesc) {
      desc = geographicDesc;
      descSource = "rawInfo.description";
    } else if (historicalDesc) {
      desc = historicalDesc;
      descSource = "wp.description";
    } else if (wp.significance) {
      desc = wp.significance;
      descSource = "wp.significance";
    } else if (routeContextText) {
      desc = routeContextText;
      descSource = "rawInfo.routeContext.text";
    }

    // 3. Context Notes
    const contextNotes: any[] = [];
    let contextNotesSource = "None";
    
    if (rawInfo.contextNotes && Array.isArray(rawInfo.contextNotes) && rawInfo.contextNotes.length > 0) {
      contextNotes.push(...rawInfo.contextNotes);
      contextNotesSource = "rawInfo.contextNotes";
    } else if (wp.contextNotes && Array.isArray(wp.contextNotes) && wp.contextNotes.length > 0) {
      contextNotes.push(...wp.contextNotes);
      contextNotesSource = "wp.contextNotes";
    }

    // 3b. Significance
    const significance = rawInfo.significance || wp.significance || null;

    // 4. Coordinates
    const coordinates = wp.coordinates || rawInfo.coordinates;
    
    // 5. Population and Climate
    const population = rawInfo.population || null;
    const populationSource = population ? "Enriched Geographic Metadata (rawInfo.population)" : "None";
    
    const climate = rawInfo.climate || null;
    const climateSource = climate ? "Enriched Geographic Metadata (rawInfo.climate)" : "None";

    console.log("=== INFOPANEL FIELD TRACING ===");
    console.log("Description Source:", descSource);
    console.log("Context Notes Source:", contextNotesSource);
    console.log("Population Source:", populationSource);
    console.log("Climate Source:", climateSource);
    console.log("News Source:", rawInfo.news ? "rawInfo.news" : "None");
    console.log("News Type:", Array.isArray(rawInfo.news) ? 'array' : typeof rawInfo.news);
    console.log("News Count:", Array.isArray(rawInfo.news) ? rawInfo.news.length : (rawInfo.news ? 1 : 0));
    console.log("News Renderable:", true);
    console.log("===============================");

    console.log("=== INFOPANEL BOUNDARY: After Normalization ===");
    console.log("Name:", name);
    console.log("Description:", desc);
    console.log("Coordinates:", coordinates);
    console.log("Normalized keys:", Object.keys({
      ...rawInfo,
      name,
      description: desc,
      contextNotes,
      coordinates
    }));
    console.log("=================================================");

    // 6. Safe Arrays
    let news: any[] = [];
    if (Array.isArray(rawInfo.news)) {
      news = rawInfo.news;
    } else if (rawInfo.news && typeof rawInfo.news === 'object') {
      news = [rawInfo.news];
    } else if (typeof rawInfo.news === 'string') {
      news = [{ title: "Latest News", summary: rawInfo.news }];
    }
    
    // Fallback normalizer for news items
    news = news.map(n => ({
       title: n.title || n.headline || "News Update",
       summary: n.summary || n.description || "",
       url: n.url || n.link || "#",
       source: n.source || n.publisher || "News Source"
    }));

    const relatedEntities = (rawInfo.relatedEntities && rawInfo.relatedEntities.length > 0) ? rawInfo.relatedEntities : [];
    
    return {
      ...rawInfo,
      name,
      type: wp.type || rawInfo.type || LocationType.POI,
      entityType: wp.entityType || rawInfo.entityType,
      description: desc,
      population,
      climate,
      contextNotes,
      significance,
      coordinates: wp.coordinates || rawInfo.coordinates || { lat: 0, lng: 0 },
      boundary: rawInfo.boundary,
      news,
      relatedEntities
    };
  }, [rawInfo]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'entities'>('overview');
  const [isMoreNewsLoading, setIsMoreNewsLoading] = useState(false);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState(false);

  // Favorite Dialog State
  const [showFavoriteDialog, setShowFavoriteDialog] = useState(false);
  const [favoriteNameInput, setFavoriteNameInput] = useState("");

  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  
  // Ref to track if we've initialized the expanded state for the current location
  const locationInitializedRef = useRef<string | null>(null);

  // Clean up wiki image and reset tab when location changes
  useEffect(() => {
    setWikiImage(null);
    setActiveTab('overview');
    setShowFavoriteDialog(false);
  }, [info?.name]);

  // Load Notes
  useEffect(() => {
    if (!info) {
        setNotes([]);
        return;
    }

    const locationKey = `notes_${info.name}_${(info.coordinates?.lat || 0).toFixed(4)}_${(info.coordinates?.lng || 0).toFixed(4)}`;
    
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
        } else if (info.defaultNote) {
            // Initialize with default note
            const defNote: Note = {
                id: `default-${Date.now()}`,
                text: info.defaultNote,
                timestamp: Date.now()
            };
            const initialNotes = [defNote];
            setNotes(initialNotes);
            setIsNotesExpanded(true);
            localStorage.setItem(locationKey, JSON.stringify(initialNotes));
        } else {
            setNotes([]);
            setIsNotesExpanded(false);
        }
    }
  }, [info]);

  // Save Notes Helper
  const saveNotesToStorage = (updatedNotes: Note[]) => {
    if (!info) return;
    const locationKey = `notes_${info.name}_${(info.coordinates?.lat || 0).toFixed(4)}_${(info.coordinates?.lng || 0).toFixed(4)}`;
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

  const cancelEdit = (id: string) => {
    const note = notes.find(n => n.id === id);
    if (note && note.text.trim() === "") {
       handleDeleteNote(id);
    }
    setEditingNoteId(null);
    setEditNoteText("");
  };

  const saveEdit = (id: string) => {
    if (editNoteText.trim() === "") {
       handleDeleteNote(id);
    } else {
       const updated = notes.map(n => n.id === id ? { ...n, text: editNoteText } : n);
       saveNotesToStorage(updated);
    }
    setEditingNoteId(null);
    setEditNoteText("");
  };

  const handleInitialAddNote = () => {
    const emptyNote = notes.find(n => n.text.trim() === '');
    if (emptyNote) {
        setIsNotesExpanded(true);
        setEditingNoteId(emptyNote.id);
        setEditNoteText('');
        return;
    }
    const newEmptyNote: Note = {
        id: Date.now().toString(),
        text: '',
        timestamp: Date.now()
    };
    const updated = [...notes, newEmptyNote];
    saveNotesToStorage(updated);
    setIsNotesExpanded(true);
    setEditingNoteId(newEmptyNote.id);
    setEditNoteText('');
  };

  const hasNotes = notes && notes.length > 0;

  // Handle Favorite Click
  const handleFavoriteClick = () => {
    if (showFavoriteDialog) {
        setShowFavoriteDialog(false);
        return;
    }
    
    // Initial name suggestion
    if (isFavorite && currentFavoriteName) {
        setFavoriteNameInput(currentFavoriteName);
    } else {
        // For route: Use route title or just info name
        // info.name usually has the waypoint name. 
        if (routeNav && info?.routeContext?.title) {
            setFavoriteNameInput(info.routeContext.title);
        } else {
            setFavoriteNameInput(info?.name || "");
        }
    }
    setShowFavoriteDialog(true);
  };

  const submitFavorite = (e: React.FormEvent) => {
    e.preventDefault();
    if (favoriteNameInput.trim()) {
        onSaveFavorite(favoriteNameInput.trim());
        setShowFavoriteDialog(false);
    }
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
      container: "bg-black/75 backdrop-blur-md border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
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
      noteCard: "bg-black/40 border border-white/10 rounded-lg",
      navBtn: "bg-white/10 hover:bg-white/20 text-white border border-white/10",
      popover: "bg-slate-900 border border-cyan-500/50 rounded-lg shadow-xl"
    },
    'retro-green': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      header: "bg-green-900/30",
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
      noteCard: "bg-black border border-green-400 rounded-none",
      navBtn: "bg-black border border-green-400 hover:bg-green-400 hover:text-black text-green-300",
      popover: "bg-black border-2 border-green-400 rounded-none shadow-[0_0_10px_rgba(74,222,128,0.4)]"
    },
    'retro-amber': {
      container: "bg-black/85 backdrop-blur-sm border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      header: "bg-amber-900/30",
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
      noteCard: "bg-black border border-amber-400 rounded-none",
      navBtn: "bg-black border border-amber-400 hover:bg-amber-400 hover:text-black text-amber-300",
      popover: "bg-black border-2 border-amber-400 rounded-none shadow-[0_0_10px_rgba(251,191,36,0.4)]"
    },
    'parchment': {
      container: "bg-[#f4ead5] border border-[#8b5a2b] shadow-[4px_4px_10px_rgba(0,0,0,0.3)] text-[#3e2723] font-sans",
      header: "bg-[#e8d5b5]/30",
      headerTitle: "text-[#8b5a2b] font-bold uppercase tracking-wider brand-font",
      tag: "text-[#3e2723] bg-[#d2b48c] border border-[#8b5a2b] rounded-sm font-bold shadow-sm",
      subtext: "text-[#8b5a2b]",
      bodyText: "text-[#5c3a21]",
      card: "bg-[#f4ead5] border border-[#8b5a2b]/60 shadow-[inset_1px_1px_4px_rgba(255,255,255,0.4)] rounded-sm hover:bg-[#e8d5b5] transition-colors block relative group",
      icon: "text-[#8b5a2b]",
      tabActive: "text-[#3e2723] border border-[#8b5a2b] border-b-transparent",
      tabInactive: "text-[#8b5a2b] border border-transparent border-b-[#8b5a2b] hover:bg-[#e8d5b5]/50 hover:text-[#5c3a21]",
      listDot: "bg-[#8b5a2b] rounded-sm",
      closeBtn: "hover:bg-[#d2b48c]/50 hover:text-[#5c3a21] text-[#8b5a2b] border border-transparent rounded",
      actionBtn: "hover:bg-[#d2b48c]/50 hover:text-[#5c3a21] text-[#8b5a2b] border border-transparent rounded",
      loadMoreBtn: "bg-[#e8d5b5]/50 border border-[#8b5a2b] hover:bg-[#d2b48c] text-[#5c3a21] rounded-sm text-sm tracking-widest uppercase font-bold",
      notesInput: "bg-[#f4ead5] border border-[#8b5a2b] text-[#522B07] placeholder-[#522B07] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.1)] rounded-sm focus:border-[#5c3a21] caret-[#522B07]",
      noteCard: "bg-[#f4ead5] border border-[#8b5a2b]/50 rounded-sm shadow-[inset_1px_1px_2px_rgba(255,255,255,0.4)]",
      navBtn: "bg-[#e8d5b5] border border-[#8b5a2b]/40 hover:bg-[#d2b48c] hover:text-[#3e2723] text-[#5c3a21]",
      popover: "bg-[#f4ead5] border-2 border-[#8b5a2b] rounded-sm shadow-[0_4px_15px_rgba(0,0,0,0.4)]"
    }
  };

  const theme = themes[skin];
  const isRetro = skin === 'retro-green' || skin === 'retro-amber';
  const isParchment = skin === 'parchment';

  // Reduced font size for retro to avoid wrapping issues (matches modern size 2xl instead of 3xl)
  const titleSize = isRetro ? 'text-2xl' : 'text-2xl';
  const subtextSize = isRetro ? 'text-sm' : 'text-xs';
  const bodySize = isRetro ? 'text-lg' : 'text-sm';
  const smallTextSize = isRetro ? 'text-sm' : 'text-xs';
  const tabTextSize = isRetro ? 'text-xl' : 'text-xs';
  const tabIconSize = isRetro ? 18 : 14;

  const renderNoteText = (text: string) => {
    // Detect URLs starting with http:// or https://
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, i) => {
      if (part.match(/^https?:\/\//)) {
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={`underline decoration-1 underline-offset-2 break-all ${isRetro ? 'hover:text-current font-bold' : isParchment ? 'text-[#8b5a2b] hover:text-[#5c3a21] font-bold' : 'text-cyan-400 hover:text-cyan-300'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (expandedImage && wikiImage) {
      return (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setExpandedImage(false)}>
              <div className="relative max-w-full max-h-full">
                  <img src={wikiImage} alt={info?.name} className={`max-w-full max-h-[90vh] object-contain ${isRetro ? 'grayscale contrast-125' : (isParchment ? 'sepia brightness-90 contrast-110' : '')}`} />
                  <button className={`absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20`}>
                      <X size={24} />
                  </button>
              </div>
          </div>
      )
  }

  // Removed Full Skeleton for Sidebar during initial load

  // If no info, don't render anything (Wait until data is resolved before showing sidebar)

  const schema = ENTITY_SCHEMAS[info?.entityType || 'city'] || ENTITY_SCHEMAS['city'];

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    overview: () => (
      <div className="space-y-5">
          {info.routeContext && (
              <div className="mb-2">
                   <h3 className={`text-sm font-bold uppercase tracking-widest mb-1 ${isRetro ? 'text-current' : isParchment ? 'text-[#8b5a2b]' : 'text-cyan-400'}`}>
                      {info.routeContext.title}
                  </h3>
                  <p className={`leading-relaxed ${bodySize} font-medium ${theme.bodyText} mb-4 border-b ${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-4`}>
                      {info.routeContext.text}
                  </p>
              </div>
          )}
          <div className="relative group/desc">
            <p className={`leading-relaxed ${bodySize} font-medium ${theme.bodyText} pr-8`}>
            {info.description || "Description unavailable."}
            </p>
            <div className="absolute top-0 right-0 opacity-0 group-hover/desc:opacity-100 transition-opacity">
              <CopyButton text={info.description || ""} skin={skin} />
            </div>
          </div>
      </div>
    ),
    historicalContext: () => null,
    historicalPeriod: () => (
      info.historicalPeriod ? (
        <div className={`p-3 ${theme.card}`}>
            <div className="flex items-center gap-2 mb-1 text-current opacity-80">
                <Crown size={16} />
                <span className={`${smallTextSize} font-bold uppercase`}>Historical Period</span>
            </div>
            <p className={`${isRetro ? 'text-base' : 'text-sm'} font-bold`}>{info.historicalPeriod}</p>
        </div>
      ) : null
    ),
    keyFigures: () => (
      info.entities && info.entities.length > 0 ? (
        <div className="relative group/facts">
          <div className={`flex items-center justify-between mb-2 ${theme.icon}`}>
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Key Entities</span>
              </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.entities.map((e: string, i: number) => (
               <span key={i} className={`px-2 py-1 text-xs rounded-full border ${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}`}>{e}</span>
            ))}
          </div>
        </div>
      ) : null
    ),
    importantEvents: () => (
      info.contextNotes && info.contextNotes.length > 0 ? (
        <div className="relative group/facts">
          <div className={`flex items-center justify-between mb-2 ${theme.icon}`}>
              <div className="flex items-center gap-2">
                <Info size={16} />
                <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Context Notes</span>
              </div>
          </div>
          <ul className="space-y-2">
              {info.contextNotes.map((fact: any, idx: number) => (
              <li key={idx} className={`flex gap-3 ${bodySize} ${theme.bodyText}`}>
                  <span className={`block w-1.5 h-1.5 mt-2 flex-shrink-0 ${theme.listDot}`} />
                  {fact}
              </li>
              ))}
          </ul>
        </div>
      ) : null
    ),
    modernContext: () => (
      (info.population || info.climate || wikiImage) ? (
        <div className={`grid ${((info.population || wikiImage) && info.climate) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
          {info.population ? (
            <div className={`p-3 ${theme.card}`}>
                <div className={`flex items-center justify-between mb-2`}>
                  <div className={`flex items-center gap-2 ${theme.icon}`}>
                      <Users size={16} />
                      <span className={`${smallTextSize} font-bold uppercase`}>Population Context</span>
                  </div>
                </div>
                {info.population.historical && (
                  <div className="mb-2">
                    <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Historical</span>
                    <p className={`${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono`}>{info.population.historical.formattedValue}</p>
                    {info.population.historical.timeframe && info.population.historical.timeframe !== "Unknown" && (
                      <p className="text-xs opacity-70 font-mono mt-0.5">{info.population.historical.timeframe}</p>
                    )}
                  </div>
                )}
                {info.population.current && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Modern</span>
                    <p className={`${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono`}>{info.population.current.formattedValue}</p>
                  </div>
                )}
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
            </div>
          ) : null}

          {info.climate && (
            <div className={`p-3 ${theme.card}`}>
                <div className={`flex items-center justify-between mb-2`}>
                  <div className={`flex items-center gap-2 ${theme.icon}`}>
                      <Thermometer size={16} />
                      <span className={`${smallTextSize} font-bold uppercase`}>Climate</span>
                  </div>
                </div>
                <p className={`${isRetro ? 'text-base' : 'text-sm'} font-bold leading-tight`}>{info.climate.name}</p>
                {info.climate.koppenCode && (
                  <p className="text-xs opacity-70 mt-1 font-mono">Köppen: {info.climate.koppenCode}</p>
                )}
            </div>
          )}
        </div>
      ) : null
    ),
    relatedEntities: () => {
      if (!info.relatedEntities || info.relatedEntities.length === 0) {
        return null;
      }

      // Group entities by type
      const groups = info.relatedEntities.reduce((acc: any, entity: any) => {
        const typeLabel = entity.type ? entity.type.charAt(0).toUpperCase() + entity.type.slice(1) + 's' : 'Other';
        if (!acc[typeLabel]) acc[typeLabel] = [];
        acc[typeLabel].push(entity);
        return acc;
      }, {});

      return (
        <div className="space-y-6">
            <div className={`flex items-center gap-2 mb-2 ${theme.icon} border-b ${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-2`}>
                <Crown size={20} />
                <span className={`${isRetro ? 'text-base' : 'text-sm'} font-bold uppercase tracking-wider`}>Notable</span>
            </div>
            {Object.keys(groups).map((type: string) => (
               <div key={type} className="space-y-3">
                 <h4 className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase opacity-80 ${theme.headerTitle}`}>{type}</h4>
                 <div className="grid gap-2">
                   {groups[type].map((item: any, idx: number) => (
                       <div key={idx} className={`p-3 ${theme.card} flex items-center gap-3 relative group/notable`}>
                           <span className={`block w-1.5 h-1.5 flex-shrink-0 ${theme.listDot}`} />
                           <span className={`${bodySize} font-bold ${theme.headerTitle}`}>{item.name}</span>
                           <div className="absolute top-1/2 -translate-y-1/2 right-2 opacity-0 group-hover/notable:opacity-100 transition-opacity">
                              <CopyButton text={item.name} skin={skin} />
                           </div>
                       </div>
                   ))}
                 </div>
               </div>
            ))}
        </div>
      );
    },
    liveNews: () => (
      <div className="space-y-4">
        <div className={`flex items-center gap-2 mb-2 ${theme.icon}`}>
            <Newspaper size={16} />
            <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Live News</span>
        </div>
        {isNewsFetching && !isMoreNewsLoading && info.news.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-8 opacity-50 animate-pulse">
              <Loader2 size={24} className="animate-spin mb-2 text-current" />
              <p className={smallTextSize}>Updating news...</p>
           </div>
        ) : info.news && info.news.length > 0 ? (
           <>
             {info.news.map((item: any, idx: number) => (
                <div key={idx} className={`p-4 ${theme.card} flex flex-col gap-2 group/news`}>
                   <div className="flex justify-between items-start gap-2">
                     <span className={`text-[10px] uppercase tracking-wider opacity-70 ${theme.subtext}`}>{item.source}</span>
                     <a href={item.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/news:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded">
                        <ExternalLink size={14} className={theme.icon} />
                     </a>
                   </div>
                   <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${bodySize} font-bold leading-tight ${theme.headerTitle} hover:underline decoration-1 underline-offset-2`}>
                     {item.title}
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
               {isMoreNewsLoading ? "Scanning..." : "Load More News"}
             </button>
           </>
        ) : (
           <div className="text-center py-10 opacity-60">
              <Newspaper size={32} className="mx-auto mb-2 opacity-50" />
              {info.entityType === 'historical_waypoint' ? (
                 <>
                   <p className={theme.bodyText}>No current news available.</p>
                   <p className={`${smallTextSize} mt-2`}>This waypoint represents a historical location and is not eligible for live news retrieval.</p>
                 </>
              ) : (
                 <p className={theme.bodyText}>No recent transmissions found.</p>
              )}
           </div>
        )}
      </div>
    )
  };


  if (!info) return null;

  const showContentSkeleton = isLoading && (!info?.description || info.description === "");

  return (
    <div className="absolute top-[282px] right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-342px)] flex flex-col gap-3 animate-in slide-in-from-right-12 fade-in duration-500 pointer-events-none">
        
        {/* Main Info Box */}
        <div className={`${theme.container} flex flex-col shrink min-h-0 overflow-hidden pointer-events-auto`}>
          {/* Header */}
          <div className={`relative p-5 shrink-0 flex flex-col items-center ${skin === 'modern' ? 'border-b border-white/10' : ''} ${theme.header}`}>
            {/* 1. Close X button */}
            <button onClick={onClose} className={`absolute top-3 right-3 p-1 z-50 pointer-events-auto transition-colors ${theme.closeBtn}`} aria-label="Close panel">
              <X size={20} />
            </button>
            
            {/* 2. Save Location icon button */}
            <div className="flex justify-center w-full -mt-[10px] mb-[26px] relative z-10">
              <button 
                onClick={handleFavoriteClick} 
                className={`p-2 transition-colors ${theme.actionBtn}`} 
                title={isFavorite ? "Edit Favorite" : (routeNav ? "Save Route" : "Save Location")}
              >
                <Pin size={24} className={isFavorite ? "fill-current" : ""} />
              </button>
              
              {/* Favorite Dialog Popover */}
              {showFavoriteDialog && (
                 <div className={`absolute top-full mt-2 w-64 p-3 z-50 flex flex-col gap-3 left-1/2 -translate-x-1/2 ${theme.popover}`}>
                    <h3 className={`text-xs text-left font-bold uppercase opacity-80 ${isRetro ? 'text-current' : 'text-white'}`}>
                      {isFavorite ? 'Edit Favorite' : (routeNav ? 'Save Route' : 'Save Location')}
                    </h3>
                    <form onSubmit={submitFavorite} className="flex flex-col gap-2">
                       <input 
                         type="text" 
                         value={favoriteNameInput}
                         onChange={(e) => setFavoriteNameInput(e.target.value)}
                         placeholder="Enter name..."
                         className={`w-full p-2 text-sm bg-transparent border outline-none ${theme.notesInput}`}
                         autoFocus
                       />
                       <div className="flex gap-2 justify-end">
                          {isFavorite && (
                              <button 
                                type="button" 
                                onClick={() => { onRemoveFavorite(); setShowFavoriteDialog(false); }}
                                className="p-1.5 hover:text-red-400 transition-colors"
                                title="Remove"
                              >
                                  <Trash2 size={16} />
                              </button>
                          )}
                          <button 
                            type="button" 
                            onClick={() => setShowFavoriteDialog(false)}
                            className="px-2 py-1 text-xs opacity-70 hover:opacity-100 hover:bg-white/10 rounded"
                          >
                              Cancel
                          </button>
                          <button 
                            type="submit"
                            disabled={!favoriteNameInput.trim()}
                            className={`px-3 py-1 text-xs font-bold uppercase transition-colors disabled:opacity-50 ${isRetro ? 'bg-current text-black hover:opacity-80' : 'bg-cyan-600 hover:bg-cyan-500 text-white rounded'}`}
                          >
                              Save
                          </button>
                       </div>
                    </form>
                 </div>
              )}
            </div>
            
            {/* 3. Location title */}
            <div className="flex flex-col gap-2 items-center text-center">
              <div className="flex flex-col items-center justify-center gap-1">
                 <h2 className={`${titleSize} font-bold text-center ${theme.headerTitle}`}>
                   {routeNav ? `${routeNav.current}. ` : ''}{info.name}
                 </h2>
                 <span className={`${smallTextSize} uppercase px-2 py-0.5 ${theme.tag}`}>{info.type}</span>
              </div>
              <p className={`${subtextSize} font-mono ${theme.subtext}`}>
                {isValidCoordinates(info.coordinates)
                  ? `${info.coordinates.lat >= 0 ? info.coordinates.lat.toFixed(2) + '° N' : Math.abs(info.coordinates.lat).toFixed(2) + '° S'}, ${info.coordinates.lng >= 0 ? info.coordinates.lng.toFixed(2) + '° E' : Math.abs(info.coordinates.lng).toFixed(2) + '° W'}`
                  : 'Coordinates unavailable'}
              </p>
            </div>
          </div>

          {/* Route Navigation */}
          {routeNav && (
             <div className={`p-3 border-b flex items-center justify-between ${isRetro ? 'border-current opacity-80' : isParchment ? 'border-[#8b5a2b]/30 bg-[#e8d5b5]/20' : 'border-white/10 bg-white/5'}`}>
                <button onClick={routeNav.onPrev} className={`p-1.5 rounded-full ${theme.navBtn}`}>
                    <ChevronLeft size={16} />
                </button>
                <div className="flex flex-col items-center">
                   <span className={`text-xs font-bold uppercase tracking-widest ${theme.subtext}`}>
                       Waypoint {routeNav.current} of {routeNav.total}
                   </span>
                </div>
                <button onClick={routeNav.onNext} className={`p-1.5 rounded-full ${theme.navBtn}`}>
                    <ChevronRight size={16} />
                </button>
            </div>
          )}

          
          {/* Scrollable Content */}
          <div className="p-5 overflow-y-auto custom-scrollbar flex-1 relative">
            {showContentSkeleton ? (
               <div className="space-y-6 animate-pulse mt-2">
                 <div className="space-y-3">
                    <div className={`h-4 w-full ${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                    <div className={`h-4 w-[90%] ${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                 </div>
               </div>
            ) : (
                <div className="space-y-8 animate-in fade-in duration-300">
                    {schema.ui.sections.map((section: any) => {
                        const renderer = SECTION_RENDERERS[section.id];
                        if (renderer) return <React.Fragment key={section.id}>{renderer()}</React.Fragment>;
                        return null;
                    })}
                </div>
            )}
          </div>
        </div>
        
        {/* My Notes Section */}
        {hasNotes ? (
          <div className={`pointer-events-auto shrink-0 transition-all duration-300 ${theme.container} ${!isNotesExpanded ? 'hover:brightness-110 cursor-pointer' : ''}`}>
               <div 
                 className={`px-5 py-3 flex items-center justify-between cursor-pointer ${isNotesExpanded ? 'border-b ' + (isRetro ? 'border-green-400/50' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10') : ''}`}
                 onClick={() => setIsNotesExpanded(!isNotesExpanded)}
               >
                  <div className="flex items-center gap-2">
                      <StickyNote size={16} className={theme.icon} />
                      <span className={`font-bold uppercase ${isRetro ? 'text-lg' : 'text-sm'} ${theme.headerTitle}`}>My Notes</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${isRetro ? 'bg-green-400 text-black' : isParchment ? 'bg-[#d2b48c] text-[#3e2723] border border-[#8b5a2b]' : 'bg-cyan-900 text-cyan-300'}`}>
                          {notes.length}
                      </span>
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
                         {notes.map((note) => (
                             <div key={note.id} className={`p-3 group relative ${theme.noteCard}`}>
                                 {editingNoteId === note.id ? (
                                     <div className="flex flex-col gap-2">
                                         <textarea 
                                            value={editNoteText}
                                            onChange={(e) => setEditNoteText(e.target.value)}
                                            className={`w-full p-2 text-sm bg-transparent border-b ${isRetro ? 'border-green-400 text-green-300' : isParchment ? 'border-[#8b5a2b] text-[#522B07] caret-[#522B07]' : 'border-cyan-400 text-white'} outline-none resize-none`}
                                            rows={2}
                                            autoFocus
                                         />
                                         <div className="flex justify-end gap-2">
                                             <button onClick={() => cancelEdit(note.id)} className="p-1 hover:text-red-400"><X size={14}/></button>
                                             <button onClick={() => saveEdit(note.id)} className="p-1 hover:text-green-400"><Save size={14}/></button>
                                         </div>
                                     </div>
                                 ) : (
                                    <>
                                        <p className={`${bodySize} ${theme.bodyText} pr-6 break-words whitespace-pre-wrap`}>
                                            {renderNoteText(note.text)}
                                        </p>
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
                         ))}
                       </div>
                   </div>
               )}
          </div>
        ) : (
          <div className={`p-4 shrink-0 flex justify-center items-center pointer-events-auto transition-all ${theme.container}`}>
             <button
                onClick={handleInitialAddNote}
                className={`flex w-full justify-center items-center gap-2 px-6 py-3 font-bold uppercase tracking-wider text-sm transition-colors ${theme.actionBtn} hover:brightness-110`}
             >
                <StickyNote size={16} />
                Add Note
             </button>
          </div>
        )}
    </div>
  );
};

export default InfoPanel;
