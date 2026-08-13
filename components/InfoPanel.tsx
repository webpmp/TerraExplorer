
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ENTITY_SCHEMAS } from '../entitySchema';
import { LocationInfo, SkinType, isValidCoordinates, LocationType } from '../types';
import { 
  X, Users, Thermometer, Info, Newspaper, Crown, Map, Pin, ExternalLink, Loader2,
  BookOpen, Rocket, Trophy, Music, FlaskConical, Palette, Clapperboard, Image as ImageIcon,
  Copy, Check, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Save, StickyNote, ChevronLeft, ChevronRight,
  MapPin, Route as RouteIcon
} from 'lucide-react';


const normalizeDisplayText = (value: any): string => {
  let str = '';
  if (typeof value === 'string') {
    str = value;
  } else if (value && typeof value === 'object') {
    if (typeof value.text === 'string') str = value.text;
    else if (typeof value.summary === 'string') str = value.summary;
    else if (typeof value.title === 'string') str = value.title;
    else if (typeof value.name === 'string') str = value.name;
    else if (typeof value.description === 'string') str = value.description;
  }
  
  if (!str) return '';

  return str.replace(/^#{1,6}\s+/gm, '').trim();
};

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
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

interface Note {
  id: string;
  text: string;
  timestamp: number;
}

// Helper to validate data availability
const isValidData = (val: string | null | undefined, isDescription: boolean = false) => {
  if (val === null || val === undefined) return false;
  const v = val.toString().toLowerCase().trim();
  if (v === '' || v === 'undefined' || v === 'null') return false;
  
  if (isDescription) {
    if (v === 'n/a' || v === 'not applicable' || v === 'not available' || v === 'unknown') return false;
    return true;
  }
  
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
  routeNav,
  isError,
  errorMessage,
  onRetry
}: InfoPanelProps) => {
  const info = React.useMemo(() => {
    if (!rawInfo) return null;

    const wp = rawInfo.waypoint || {};
    
    // 1. Name
    const name = wp.name || rawInfo.name || "Unknown Location";

    // 2. Description fallback
    // Priority: rawInfo.description > wp.description > wp.significance > routeContext
    const extractText = (val: any): string => {
       if (!val) return "";
       if (typeof val === "string") return normalizeDisplayText(val);
       if (typeof val === "object") {
           let text = "";
           const h = val.heading || val.heading1 || val.title;
           const t = val.text || val.text1 || val.description || val.summary || val.value || val.body;
           
           if (h) {
               text += `${normalizeDisplayText(h)}\n\n`;
           }
           if (t) {
               text += normalizeDisplayText(t);
           } else {
               // Fallback: concatenate string values, explicitly excluding other metadata sections
               const excludedKeys = ['notable', 'notableFacts', 'notable_facts', 'climate', 'population', 'news', 'contextNotes', 'entities', 'historicalPeriod'];
               const vals = Object.entries(val)
                 .filter(([k, v]) => typeof v === 'string' && !excludedKeys.includes(k) && !k.toLowerCase().includes('notable'))
                 .map(([k, v]) => normalizeDisplayText(v));
               if (vals.length > 0 && !h) {
                   text += vals.join('\n\n');
               }
           }
           return text.trim();
       }
       return normalizeDisplayText(String(val));
    };

    const geographicDesc = extractText(rawInfo.description) || null;
    const historicalDesc = extractText(wp.description) || null;
    const routeContextText = rawInfo.routeContext?.text || null;
    
    let combinedDescParts: string[] = [];
    let descSource = "combined";

    const rawDesc = geographicDesc || historicalDesc || routeContextText;
    if (rawDesc) {
      let cleanDesc = rawDesc;
      if (/^#+\s+description/i.test(cleanDesc.trim())) {
        cleanDesc = cleanDesc.replace(/^#+\s+description/i, '').trim();
      }
      combinedDescParts.push(cleanDesc);
    }

    if (wp.significance) {
      combinedDescParts.push(`## Significance\n\n${wp.significance}`);
    }

    if ((rawInfo as any).historicalBackground) {
      combinedDescParts.push(`## Historical Background\n\n${(rawInfo as any).historicalBackground}`);
    } else if (wp.historicalRegion) {
      combinedDescParts.push(`## Historical Region\n\n${wp.historicalRegion}`);
    }
    
    let desc = combinedDescParts.join('\n\n');

    // 3. Context Notes
    const contextNotes: any[] = [];
    let contextNotesSource = "None";
    
    const normalizeContextNotes = (notes: any) => {
        if (!notes) return [];
        if (Array.isArray(notes)) {
            return notes.map(n => (typeof n === 'object' && n.text) ? n.text : String(n));
        }
        return [typeof notes === 'object' && notes.text ? notes.text : String(notes)];
    };

    if (rawInfo.contextNotes) {
      contextNotes.push(...normalizeContextNotes(rawInfo.contextNotes));
      contextNotesSource = "rawInfo.contextNotes";
    } else if (wp.contextNotes) {
      contextNotes.push(...normalizeContextNotes(wp.contextNotes));
      contextNotesSource = "wp.contextNotes";
    }

    // 3b. Significance
    const significance = rawInfo.significance || wp.significance || null;

    // 4. Coordinates
    const coordinates = wp.coordinates || rawInfo.coordinates;
    
    // 5. Population and Climate
    let population = null;
    if (rawInfo.population) {
        let currentText = "";
        let historicalText = "";
        let timeframe = "";
        
        if (typeof rawInfo.population === "string" || typeof rawInfo.population === "number") {
            currentText = String(rawInfo.population);
        } else if (typeof rawInfo.population === "object") {
            if (rawInfo.population.current) {
                if (typeof rawInfo.population.current === "object") {
                    currentText = rawInfo.population.current.formattedValue || rawInfo.population.current.value || String(rawInfo.population.current.value || "");
                } else {
                    currentText = String(rawInfo.population.current);
                }
            }
            if (rawInfo.population.historical) {
                if (typeof rawInfo.population.historical === "object") {
                    historicalText = rawInfo.population.historical.formattedValue || rawInfo.population.historical.value || String(rawInfo.population.historical.value || "");
                    timeframe = rawInfo.population.historical.timeframe || "";
                } else {
                    historicalText = String(rawInfo.population.historical);
                }
            }
            if (!currentText && rawInfo.population.value) {
                currentText = String(rawInfo.population.value);
            }
        }
        
        if (currentText === "[object Object]") currentText = "";
        if (historicalText === "[object Object]") historicalText = "";
        
        if (currentText || historicalText) {
            population = {
                current: currentText ? { formattedValue: currentText } : null,
                historical: historicalText ? { formattedValue: historicalText, timeframe } : null
            };
        }
    }
    const populationSource = population ? "Enriched Geographic Metadata (rawInfo.population)" : "None";
    
    let climate = null;
    if (rawInfo.climate) {
        if (rawInfo.climate.name && rawInfo.climate.description) {
            climate = rawInfo.climate; // Legacy format
        } else if (typeof rawInfo.climate === 'object' && rawInfo.climate.value) {
            climate = { name: rawInfo.climate.value, description: rawInfo.climate.description || "" };
        } else {
            climate = { name: String(rawInfo.climate), description: "" };
        }
    }
    const climateSource = climate ? "Enriched Geographic Metadata (rawInfo.climate)" : "None";

    // console.log("=== INFOPANEL FIELD TRACING ===");
    // console.log("Description Source:", descSource);
    // console.log("Context Notes Source:", contextNotesSource);
    // console.log("Population Source:", populationSource);

    // 6. Safe Arrays
    let news: any[] = [];
    if (Array.isArray(rawInfo.news)) {
      news = rawInfo.news;
    } else if (rawInfo.news && typeof rawInfo.news === 'object') {
      news = [rawInfo.news];
    } else if (typeof rawInfo.news === 'string') {
      news = [{ title: "Latest News", summary: rawInfo.news }];
    }
    
    news = news.map(n => ({
       title: n.title || n.headline || "News Update",
       summary: n.summary || n.description || n.snippet || "",
       url: n.url || n.link || "#",
       source: n.source || n.publisher || "News Source"
    }));

    let notable: any[] = [];
    if (Array.isArray(rawInfo.notable)) {
        notable = rawInfo.notable.map((n: any) => {
            if (typeof n === 'string') {
                const splitIndex = n.indexOf(':');
                if (splitIndex !== -1 && splitIndex < 50) {
                    return { title: n.substring(0, splitIndex).trim(), summary: n.substring(splitIndex + 1).trim() };
                }
                return { title: n, summary: "" };
            }
            if (typeof n === 'object') {
                if (n.name && !n.title && !n.summary) {
                    const splitIndex = n.name.indexOf(':');
                    if (splitIndex !== -1 && splitIndex < 50) {
                        return { title: n.name.substring(0, splitIndex).trim(), summary: n.name.substring(splitIndex + 1).trim() };
                    }
                    return { title: n.name, summary: "" };
                }
            }
            return n;
        });
    } else if (rawInfo.notable && typeof rawInfo.notable === 'object') {
        notable = [rawInfo.notable];
    } else if (typeof rawInfo.notable === 'string') {
        notable = [{ title: rawInfo.notable, summary: "" }];
    }

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
      notable,
      relatedEntities
    };
  }, [rawInfo]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'news' | 'entities'>('overview');
  const [isMoreNewsLoading, setIsMoreNewsLoading] = useState(false);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState(false);

  const [showFavoriteDialog, setShowFavoriteDialog] = useState(false);
  const [favoriteNameInput, setFavoriteNameInput] = useState("");

  const [notes, setNotes] = useState<Note[]>([]);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  
  const locationInitializedRef = useRef<string | null>(null);

  useEffect(() => {
    setWikiImage(null);
    setActiveTab('overview');
    setShowFavoriteDialog(false);
  }, [info?.name]);

  useEffect(() => {
    if (!info) {
        setNotes([]);
        return;
    }

    const locationKey = `notes_${info.name}_${(info.coordinates?.lat || 0).toFixed(4)}_${(info.coordinates?.lng || 0).toFixed(4)}`;
    
    const isNewLocation = locationInitializedRef.current !== locationKey;
    
    if (isNewLocation) {
        locationInitializedRef.current = locationKey;
        const savedNotes = localStorage.getItem(locationKey);
        if (savedNotes) {
            try {
                const parsed = JSON.parse(savedNotes);
                setNotes(parsed);
                if (parsed.length > 0) setIsNotesExpanded(true);
                else setIsNotesExpanded(false);
            } catch (e) {
                setNotes([]);
                setIsNotesExpanded(false);
            }
        } else if (info.defaultNote) {
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

  const handleFavoriteClick = () => {
    if (showFavoriteDialog) {
        setShowFavoriteDialog(false);
        return;
    }
    
    if (isFavorite && currentFavoriteName) {
        setFavoriteNameInput(currentFavoriteName);
    } else {
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

  useEffect(() => {
    const hasPopulation = isValidData(info?.population);
    
    if (info?.name && !hasPopulation) {
      const fetchImage = async () => {
        try {
          const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(info.imageSearchTerm || info.name)}&gsrlimit=1&prop=pageimages&format=json&pithumbsize=400&origin=*`);
          const data = await res.json();
          const pages = data.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            if (pageId !== "-1" && pages[pageId]?.thumbnail?.source) {
                const url = pages[pageId].thumbnail.source;
                setWikiImage(url);
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

  const themes = {
    'modern': {
      container: "bg-black/75 backdrop-blur-md border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      panelBg: "bg-transparent",
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
      panelBg: "bg-transparent",
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
      panelBg: "bg-transparent",
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
      panelBg: "bg-transparent",
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

  const titleSize = isRetro ? 'text-2xl' : 'text-2xl';
  const subtextSize = isRetro ? 'text-sm' : 'text-xs';
  const bodySize = isRetro ? 'text-lg' : 'text-sm';
  const smallTextSize = isRetro ? 'text-sm' : 'text-xs';
  const tabTextSize = isRetro ? 'text-xl' : 'text-xs';
  const tabIconSize = isRetro ? 18 : 14;

  const renderNoteText = (text: string) => {
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



  const schema = ENTITY_SCHEMAS[info?.entityType || 'city'] || ENTITY_SCHEMAS['city'];

  interface SectionRenderer {
    render: () => React.ReactNode;
    copyText?: () => string;
  }

  const getCleanDescriptionLines = (info: any) => {
      if (!info || !info.description) return [];
      const lines = info.description.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      
      const nameParts = (info.name || '').split(' ').filter((p: string) => p.length > 0);
      if (lines.length > 0) {
          const firstLineClean = lines[0].replace(/^#+\s/, '');
          if (nameParts.some((part: string) => firstLineClean.toLowerCase().includes(part.toLowerCase()))) {
              lines.shift();
          }
      }
      
      if (lines.length > 0) {
          const firstLineClean = lines[0].replace(/^#+\s/, '').toLowerCase();
          if (firstLineClean === 'overview' || firstLineClean === 'description') {
              lines.shift();
          }
      }
      
      return lines;
  };

  const SECTION_RENDERERS: Record<string, SectionRenderer> = {
    overview: {
      copyText: () => {
        if (!info) return '';
        const lines = getCleanDescriptionLines(info);
        const cleanText = lines.map(line => line.replace(/^#{1,3}\s/, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1')).join('\n');
        let txt = `${cleanText}\n`;
        if (Array.isArray(info.notable) && info.notable.length > 0) {
            txt += `\nNotable Facts\n`;
            txt += info.notable.map((n: any) => `- ${normalizeDisplayText(n.title)}${n.summary ? `: ${normalizeDisplayText(n.summary)}` : ''}`).join('\n');
        }
        return txt.trim();
      },
      render: () => (
      <div className="space-y-5">
          {info.routeContext && (
              <div className="mb-2">
                   <h3 className={`text-sm font-bold uppercase tracking-widest mb-1 ${isRetro ? 'text-current' : isParchment ? 'text-[#8b5a2b]' : 'text-cyan-400'}`}>
                      {info.routeContext.title}
                  </h3>
                  <p className={`leading-relaxed ${bodySize} font-normal ${theme.bodyText} mb-4 border-b ${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-4`}>
                      {info.routeContext.text}
                  </p>
              </div>
          )}
          {(info.description || (Array.isArray(info.notable) && info.notable.length > 0)) && (
            <div className="relative group/desc">
              <div className="absolute top-0 -right-2 opacity-0 group-hover/desc:opacity-100 transition-opacity z-10">
                <CopyButton text={fullCopyText} skin={skin} className={`p-1.5 transition-colors ${theme.actionBtn}`} />
              </div>
              <div className={`leading-relaxed ${bodySize} font-normal ${theme.bodyText} pr-8 space-y-4`}>
                {(() => {
                    const lines = getCleanDescriptionLines(info);
                    
                    const blocks: React.ReactNode[] = [];
                    let currentList: string[] = [];
                    
                    const flushList = (keyPrefix: number) => {
                        if (currentList.length > 0) {
                            blocks.push(
                                <ul key={`list-${keyPrefix}`} className="list-disc pl-5 space-y-1">
                                    {currentList.map((b, bIdx) => (
                                        <li key={bIdx}>{b}</li>
                                    ))}
                                </ul>
                            );
                            currentList = [];
                        }
                    };

                    lines.forEach((line: string, i: number) => {
                        let text = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1'); 
                        
                        if (text.match(/^[-*]\s/)) {
                            currentList.push(text.replace(/^[-*]\s/, ''));
                            return;
                        }
                        
                        flushList(i);
                        
                        const isMarkdownHeading = text.startsWith('## ') || text.startsWith('# ');
                        const cleanedText = text.replace(/^#{1,3}\s/, '');
                        const isHeuristicHeading = cleanedText.split(' ').length <= 8 && cleanedText.length < 60 && !cleanedText.match(/[.!?:;]$/) && !cleanedText.match(/^[a-z]/) && lines[i+1] && !lines[i+1].match(/^[-*]\s/);
                        
                        if (isMarkdownHeading || isHeuristicHeading) {
                            blocks.push(
                                <h3 key={`h-${i}`} 
                                    className={`mt-4 mb-2 ${isParchment ? 'text-[#8b5a2b] font-bold text-lg' : 'font-bold'}`}>
                                    {cleanedText}
                                </h3>
                            );
                        } else {
                            const isFirstParagraph = !blocks.some(b => (b as any).type === 'p');
                            if (isParchment && isFirstParagraph && cleanedText.length > 0) {
                                blocks.push(
                                    <p key={`p-${i}`} className="clear-both">
                                        <span 
                                            className="float-left text-5xl mr-2 font-bold text-[#8b5a2b] leading-[0.75] pt-1" 
                                            style={{ fontFamily: '"IM Fell Double Pica", serif' }}
                                        >
                                            {cleanedText.charAt(0)}
                                        </span>
                                        {cleanedText.slice(1)}
                                    </p>
                                );
                            } else {
                                blocks.push(<p key={`p-${i}`}>{cleanedText}</p>);
                            }
                        }
                    });
                    
                    flushList(lines.length);
                    
                    if (Array.isArray(info.notable) && info.notable.length > 0) {
                        blocks.push(
                            <h3 key={`h-notable`} 
                                className={`mt-6 mb-2 ${isParchment ? 'text-[#8b5a2b] font-bold text-lg' : 'font-bold'}`}>
                                Notable Facts
                            </h3>
                        );
                        blocks.push(
                            <ul key={`list-notable`} className="list-disc pl-5 space-y-3">
                              {info.notable.map((n: any, i: number) => (
                                <li key={`notable-${i}`} className={`font-normal ${bodySize} ${theme.bodyText} opacity-90 leading-relaxed`}>
                                  {n.title}
                                  {n.summary && <span className="block mt-1 opacity-80 text-sm">{n.summary}</span>}
                                  {n.wikipediaUrl && (
                                    <a href={n.wikipediaUrl} target="_blank" rel="noopener noreferrer" className={`text-xs flex items-center gap-1 mt-1 hover:opacity-80 transition-opacity ${theme.actionText || 'text-blue-400'}`}>
                                      Learn more →
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                        );
                    }
                    
                    return blocks;
                })()}
              </div>
            </div>
          )}
      </div>
      )
    },
    historicalContext: {
      render: () => (
      (info.waypoint?.canonicalName || (info.waypoint?.alternateNames && info.waypoint.alternateNames.length > 0)) ? (
        <div className={`p-3 ${theme.card}`}>
            <div className="flex items-center gap-2 mb-2 text-current opacity-80">
                <Info size={16} />
                <span className={`${smallTextSize} font-bold uppercase`}>Historical Identity</span>
            </div>
            {info.waypoint?.canonicalName && (
               <div className="mb-2">
                   <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Canonical Name</span>
                   <p className={`${isRetro ? 'text-base' : 'text-sm'} font-bold`}>{info.waypoint.canonicalName}</p>
               </div>
            )}
            {info.waypoint?.alternateNames && info.waypoint.alternateNames.length > 0 && (
               <div>
                   <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Known As</span>
                   <div className="flex flex-wrap gap-1">
                     {info.waypoint.alternateNames.map((alt: string, i: number) => (
                        <span key={i} className={`px-2 py-0.5 text-[10px] rounded border ${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}`}>{alt}</span>
                     ))}
                   </div>
               </div>
            )}
        </div>
      ) : null
      )
    },
    historicalPeriod: {
      render: () => (
      info.historicalPeriod ? (
        <div className={`p-3 ${theme.card}`}>
            <div className="flex items-center gap-2 mb-1 text-current opacity-80">
                <Crown size={16} />
                <span className={`${smallTextSize} font-bold uppercase`}>Historical Period</span>
            </div>
            <p className={`${isRetro ? 'text-base' : 'text-sm'} font-normal`}>{info.historicalPeriod}</p>
        </div>
      ) : null
      )
    },
    keyFigures: {
      render: () => (
      info.entities && info.entities.length > 0 ? (
        <div className="relative group/facts">
          <div className={`flex items-center justify-between mb-2 ${theme.icon}`}>
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>Key Entities</span>
              </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.entities.map((e: any, i: number) => {
               const text = normalizeDisplayText(e);
               if (!text) return null;
               return <span key={i} className={`px-2 py-1 text-xs rounded-full border ${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}`}>{text}</span>
            })}
          </div>
        </div>
      ) : null
      )
    },

    modernContext: {
      copyText: () => {
         if (!info) return '';
         let txt = '';
         if (info.population) {
             txt += `Population\n`;
             if (info.population.historical) {
                 txt += `Historical: ${info.population.historical.formattedValue}`;
                 if (info.population.historical.timeframe && info.population.historical.timeframe !== "Unknown") {
                     txt += ` (${info.population.historical.timeframe})`;
                 }
                 txt += `\n`;
             }
             if (info.population.current) {
                 txt += `Modern: ${info.population.current.formattedValue}\n`;
             }
             txt += `\n`;
         }
         if (info.climate) {
             txt += `Climate\n${info.climate.name}\n${info.climate.description || ''}\n\n`;
         }
         return txt.trim();
      },
      render: () => (
      (info.population || info.climate || wikiImage) ? (
        <div className={`grid ${((info.population || wikiImage) && info.climate) ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
          {info.population ? (
            <div className={`p-3 ${theme.card}`}>
                <div className={`flex items-center justify-between mb-2`}>
                  <div className={`flex items-center gap-2 ${theme.icon}`}>
                      <Users size={16} />
                      <span className={`${smallTextSize} font-bold uppercase`}>Population</span>
                  </div>
                </div>
                {info.population.historical && (
                  <div className="mb-2">
                    <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Historical</span>
                    <p className={`${isRetro ? 'text-base' : 'text-sm'} font-normal font-mono`}>{info.population.historical.formattedValue}</p>
                    {info.population.historical.timeframe && info.population.historical.timeframe !== "Unknown" && (
                      <p className="text-xs opacity-70 font-mono mt-0.5">{info.population.historical.timeframe}</p>
                    )}
                  </div>
                )}
                {info.population.current && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Modern</span>
                    <p className={`${isRetro ? 'text-base' : 'text-sm'} font-normal font-mono`}>{info.population.current.formattedValue}</p>
                  </div>
                )}
            </div>
           ) : wikiImage ? (
            <div 
              className={`p-0 overflow-hidden relative h-28 ${theme.card} group cursor-pointer`}
              onClick={() => setExpandedImage(true)}
            >
               <img src={wikiImage} alt={info.name} className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isRetro ? 'grayscale contrast-125' : ''}`} />
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-4 flex items-end gap-2">
                  <ImageIcon size={14} className="text-white/80 shrink-0" />
                  {info.imageCaption && (
                    <span className="text-white/90 text-xs truncate font-medium">
                      {info.imageCaption}
                    </span>
                  )}
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
                <p className={`${isRetro ? 'text-base' : 'text-sm'} font-normal leading-tight`}>{info.climate.name}</p>
                {info.climate.description && (
                  <p className="text-xs opacity-90 mt-2 font-normal leading-relaxed">{info.climate.description}</p>
                )}
            </div>
          )}
        </div>
      ) : null
      )
    },
    liveNews: {
      copyText: () => {
         if (!info || !info.news || info.news.length === 0) return '';
         let txt = `News\n`;
         info.news.forEach((item: any) => {
             txt += `- ${normalizeDisplayText(item.title)}\n`;
         });
         return txt.trim();
      },
      render: () => {
      if (!info.news || info.news.length === 0) {
         return null;
      }
      
      return (
      <div className="space-y-4">
        <div className={`flex items-center gap-2 mb-2 ${theme.icon}`}>
            <Newspaper size={16} />
            <span className={`${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase`}>News</span>
        </div>
        <>
          {info.news.map((item: any, idx: number) => (
             <div key={idx} className={`p-4 ${theme.card} flex flex-col gap-2 group/news`}>
                <div className="flex justify-between items-start gap-2">
                  <span className={`text-[10px] uppercase tracking-wider opacity-70 ${theme.subtext}`}>{item.source}</span>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/news:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded">
                     <ExternalLink size={14} className={theme.icon} />
                  </a>
                </div>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${bodySize} font-normal leading-tight ${theme.headerTitle} hover:underline decoration-1 underline-offset-2`}>
                  {normalizeDisplayText(item.title)}
                </a>
                {normalizeDisplayText(item.summary) && (
                   <p className={`${subtextSize} ${theme.bodyText} opacity-90 leading-relaxed`}>
                     {normalizeDisplayText(item.summary)}
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
      </div>
      );
      }
    },
    relatedPlaces: {
      render: () => {
      if (!info.relatedEntities || info.relatedEntities.length === 0) return null;
      return (
        <div className="space-y-4">
            <div className={`flex items-center gap-2 mb-2 ${theme.icon} border-b ${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-2`}>
                <MapPin size={20} />
                <span className={`${isRetro ? 'text-base' : 'text-sm'} font-bold uppercase tracking-wider`}>Related Places</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {info.relatedEntities.map((place: any, i: number) => {
                 const text = normalizeDisplayText(place);
                 if (!text) return null;
                 return <span key={i} className={`px-2 py-1 text-xs rounded-full border ${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}`}>{text}</span>
              })}
            </div>
        </div>
      );
      }
    }
  };

  const fullCopyText = useMemo(() => {
      if (!info) return '';
      let txt = `${info.name || 'Location'}\n\n`;
      schema.ui.sections.forEach((section: any) => {
          const renderer = SECTION_RENDERERS[section.id];
          if (renderer && renderer.copyText) {
              const copyData = renderer.copyText();
              if (copyData) txt += copyData + '\n\n';
          }
      });
      return txt.trim();
  }, [info, schema]);

  if (!info) return null;

  const showContentSkeleton = isLoading && (!info?.description);
  const contextItems = info.contextNotes;

  return (
    <>
      {expandedImage && wikiImage && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 pointer-events-auto" onClick={() => setExpandedImage(false)}>
              <div className="relative max-w-full max-h-[85vh] flex flex-col items-center">
                  <img src={wikiImage} alt={info?.name} className={`max-w-full max-h-full object-contain ${isRetro ? 'grayscale contrast-125' : (isParchment ? 'sepia brightness-90 contrast-110' : '')}`} />
                  {info?.imageCaption && (
                      <div className="mt-4 text-white/90 text-sm md:text-base max-w-2xl text-center bg-black/50 px-4 py-2 rounded">
                          {info.imageCaption}
                      </div>
                  )}
                  <button className={`absolute -top-4 -right-4 p-2 bg-black text-white rounded-full hover:bg-white/20`} onClick={(e) => { e.stopPropagation(); setExpandedImage(false); }}>
                      <X size={24} />
                  </button>
              </div>
          </div>
      )}
      <div className="absolute top-[282px] right-8 z-20 w-80 md:w-96 max-h-[calc(100vh-342px)] flex flex-col gap-3 animate-in slide-in-from-right-12 fade-in duration-500 pointer-events-none">
        {/* Main Info Box */}
        <div className={`${theme.container} flex flex-col shrink min-h-0 overflow-hidden pointer-events-auto`}>
          {/* Header */}
          <div className={`relative p-5 shrink-0 flex flex-col items-center ${skin === 'modern' ? 'border-b border-white/10' : ''} ${theme.header}`}>
            {/* 1. Close X button */}
            <button onClick={onClose} className={`absolute top-3 right-3 p-1 z-50 pointer-events-auto transition-colors ${theme.closeBtn}`} aria-label="Close panel">
              <X size={20} />
            </button>
            
            {/* 2. Save Location and Copy text buttons */}
            <div className="flex justify-center w-full -mt-[10px] mb-[26px] relative z-10 gap-2">
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
                 <span className={`${smallTextSize} uppercase px-2 py-0.5 ${theme.tag}`}>
                   {info.entityType ? info.entityType.replace(/_/g, ' ').toUpperCase() : (info.type === 'Point of Interest' ? 'POINT OF INTEREST' : info.type.toUpperCase())}
                 </span>
                 {info.locationString && (
                   <div className={`mt-1 text-sm font-medium ${isRetro ? 'text-current opacity-90' : isParchment ? 'text-[#5a3e1b]' : 'text-slate-300'}`}>
                     Location: {info.locationString}
                   </div>
                 )}
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
          <div className={`flex-1 overflow-y-auto ${theme.panelBg} relative pointer-events-auto`}>
            {isError ? (
               <div className="p-6 flex flex-col items-center justify-center h-48 text-center space-y-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 ${isRetro ? 'bg-red-900/40 text-red-400' : 'bg-red-500/20 text-red-400'}`}>
                      <X size={20} />
                  </div>
                  <p className={`font-medium ${theme.headerTitle}`}>{errorMessage || "Unable to retrieve location details"}</p>
                  {onRetry && (
                     <button onClick={onRetry} className={`px-4 py-1.5 mt-2 text-xs uppercase tracking-wider font-bold rounded transition-colors bg-white/10 hover:bg-white/20 ${theme.bodyText}`}>
                        Retry
                     </button>
                  )}
               </div>
            ) : showContentSkeleton ? (
               <div className="p-6 space-y-8 animate-pulse">
                  {/* skeleton content */}
                  <div className="space-y-3">
                    <div className={`h-4 ${isRetro ? 'bg-green-500/20' : 'bg-white/10'} rounded w-3/4`}></div>
                    <div className={`h-4 ${isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                    <div className={`h-4 w-[90%] ${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded`}></div>
                 </div>
               </div>
            ) : (
                <div className="p-5 space-y-8 animate-in fade-in duration-300">
                    {schema.ui.sections.map((section: any) => {
                        const renderer = SECTION_RENDERERS[section.id];
                        if (renderer && renderer.render) return <React.Fragment key={section.id}>{renderer.render()}</React.Fragment>;
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
    </>
  );
};

export default InfoPanel;
