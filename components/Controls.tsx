
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ZoomIn, ZoomOut, Loader2, Star, X, Palette, Settings, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { SkinType } from '../types';
import { isCelestialBodySupported, detectCelestialBody } from '../services/celestialCapabilities';
import { narrationService } from '../services/narrationService';
import { generateContextualChips, ContextualChip } from '../services/followUpService';

interface ControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSearch: (query: string, isExplicitChip?: boolean) => void;
  onTraceRoute: (text: string) => void;
  isSearching: boolean;
  searchError?: string | null;
  onClearError?: () => void;
  skin: SkinType;
  showFavorites: boolean;
  onToggleShowFavorites: () => void;
  paused: boolean;
  isTraceModalOpen: boolean;
  onToggleTraceModal: (isOpen: boolean) => void;
  isZoomLocked?: boolean;
  onToggleZoomLock?: () => void;
  isNarrationEnabled?: boolean;
  onToggleNarration?: () => void;
  isNarrationAvailable?: boolean;
  showNews?: boolean;
  onCycleSkin?: () => void;
  isScanningArea?: boolean;
  scanningStatusText?: string | null;
  activeWaypointTitle?: string | null;
  activeLocationContext?: { name: string; entityType?: string; description?: string; notable?: any[]; news?: any[]; followUps?: any[] } | null;
  onCancelScan?: () => void;
  isSettingsOpen?: boolean;
  onToggleSettings?: () => void;
  onOpenSettingsTab?: (tab: 'providers' | 'general' | 'appearance' | 'audio') => void;
  isOSMDisplayed?: boolean;
  isOSMActive?: boolean;
}

// Custom Icon for Trace Route
const TraceRouteIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="12" r="3" />
        <path d="M9 12h6" strokeDasharray="2 2" />
    </svg>
);

// Significantly expanded data for suggestions
const historicalEvents = [
  "the Battle of Hastings", "Woodstock", "the first Olympics",
  "the signing of the Magna Carta", "the fall of the Berlin Wall", "the eruption of Vesuvius",
  "the Wright Brothers' flight", "the sinking of the Titanic", "the Boston Tea Party",
  "the Battle of Waterloo", "the discovery of penicillin", "the invention of the telephone",
  "the Great Fire of London", "the Storming of the Bastille", "the Rosetta Stone discovery",
  "the Battle of Thermopylae", "the completion of the Transcontinental Railroad",
  "the Tunguska event", "the Charge of the Light Brigade", "the founding of Rome",
  "the first powered flight", "the Gold Rush", "the construction of the Panama Canal",
  "the drafting of the Declaration of Independence", "the Battle of Gettysburg",
  "the assassination of Archduke Franz Ferdinand", "the Manhattan Project", "the Space Race",
  "the Velvet Revolution", "the Meiji Restoration", "the unification of Germany",
  "the Louisiana Purchase", "the Battle of Midway", "the signing of the Treaty of Versailles",
  "the launch of Sputnik", "the first ascent of Everest", "the invention of the printing press",
  "the Salem Witch Trials", "the Battle of Stalingrad", "the demolition of the Babri Masjid",
  "the Chernobyl disaster", "the opening of the Suez Canal", "the Battle of Trafalgar",
  "the Boston Massacre", "the Defenestration of Prague", "the Gunpowder Plot", "the Great Depression",
  "the Irish Potato Famine", "the Klondike Gold Rush", "the Lewis and Clark Expedition",
  "the Battle of Marathon", "the Mongol conquests", "the Norman Conquest", "the Opium Wars",
  "the Pearl Harbor attack", "the Protestant Reformation", "the Renaissance", "the Russian Revolution",
  "the Spanish Armada", "the Trail of Tears", "the Underground Railroad", "the Viking Age",
  "the War of 1812", "the Yalta Conference"
];

const pointsOfInterest = [
  "the Eiffel Tower", "Mount Everest", "the Great Barrier Reef", "Machu Picchu",
  "the Grand Canyon", "the Taj Mahal", "Stonehenge", "the Pyramids of Giza",
  "the Colosseum", "Petra", "Angkor Wat", "the Statue of Liberty", "the Burj Khalifa",
  "Mount Fuji", "Victoria Falls", "the Acropolis", "Chichen Itza", "the Louvre",
  "the Golden Gate Bridge", "Niagara Falls", "the Galapagos Islands", "Serengeti National Park",
  "the Amazon Rainforest", "the Vatican City", "the Great Wall of China", "Christ the Redeemer",
  "the Sydney Opera House", "Table Mountain", "Iguazu Falls", "the Dead Sea", "Cappadocia",
  "Santorini", "Banff National Park", "Yellowstone", "Yosemite", "Uluru", "Mount Kilimanjaro",
  "Lake Baikal", "the Alhambra", "Neuschwanstein Castle", "Mont Saint-Michel", "Hagia Sophia",
  "the Forbidden City", "Easter Island", "Antelope Canyon", "Salar de Uyuni",
  "the Blue Lagoon", "the Cliffs of Moher", "the Giants Causeway", "the Matterhorn",
  "Mount Rushmore", "the Parthenon", "Pompeii", "the Sphinx", "St. Basil's Cathedral",
  "Times Square", "the Tower of London", "Venice Canals", "Versailles", "Wembley Stadium",
  "the White House", "Windsor Castle", "Zion National Park"
];

const shipwrecks = [
  "the Titanic", "Shackleton's Endurance", "the Vasa", "the Antikythera wreck",
  "the Mary Rose", "the USS Arizona", "the Bismarck", "the Santa Maria", "the HMS Erebus",
  "the HMS Terror", "the Queen Anne's Revenge", "the Whydah Gally", "the Atocha",
  "the SS Thistlegorm", "the Yongala", "the Andrea Doria", "the Lusitania", "the Edmund Fitzgerald",
  "the USS Indianapolis", "the Batavia", "the Gribshunden", "the San José galleon",
  "the SS Republic", "the HMS Victory", "the SS Central America", "the Nuestra Señora de Atocha",
  "the 1715 Treasure Fleet", "the RMS Empress of Ireland", "the SS United States", "the MV Wilhelm Gustloff",
  "the HMS Hood", "the IJN Yamato", "the USS Monitor", "the CSS Hunley"
];

const places = [
  "Tokyo", "Cairo", "Reykjavik", "New York", "Paris", "Sydney", "Rio de Janeiro",
  "Cape Town", "Moscow", "Beijing", "Mumbai", "Istanbul", "London", "Rome",
  "Buenos Aires", "Singapore", "Dubai", "Toronto", "Seoul", "Bangkok", "Mexico City",
  "Lima", "Nairobi", "Casablanca", "Athens", "Berlin", "Amsterdam", "Stockholm",
  "Copenhagen", "Oslo", "Helsinki", "Wellington", "Auckland", "Kyoto", "Osaka",
  "Shanghai", "Hong Kong", "Jakarta", "Manila", "Hanoi", "Kathmandu", "Lhasa",
  "Ulaanbaatar", "Tehran", "Baghdad", "Jerusalem", "Damascus", "Beirut",
  "Marrakesh", "Prague", "Vienna", "Budapest", "Lisbon", "Madrid", "Barcelona",
  "Vancouver", "Montreal", "Chicago", "Los Angeles", "San Francisco", "Seattle",
  "Miami", "New Orleans", "Havana", "Bogota", "Santiago", "Sao Paulo", "Brasilia",
  "Lagos", "Johannesburg", "Addis Ababa", "Kuala Lumpur", "Taipei", "Ho Chi Minh City"
];

const generateSuggestion = () => {
  const r = Math.random();
  // 20% chance for generic, 80% chance for specific creative prompts
  if (r < 0.2) return "Search location...";

  let candidate = "Search location...";
  if (r < 0.35) {
    const evt = historicalEvents[Math.floor(Math.random() * historicalEvents.length)];
    candidate = `Where did ${evt} take place?`;
  } else if (r < 0.5) {
    const poi = pointsOfInterest[Math.floor(Math.random() * pointsOfInterest.length)];
    candidate = `Where is ${poi}?`;
  } else if (r < 0.65) {
    const ship = shipwrecks[Math.floor(Math.random() * shipwrecks.length)];
    candidate = `Where was ${ship} found?`;
  } else if (r < 0.8) {
    const place = places[Math.floor(Math.random() * places.length)];
    candidate = `Find ${place}...`;
  } else {
    const poi = pointsOfInterest[Math.floor(Math.random() * pointsOfInterest.length)];
    candidate = `Show me ${poi}...`;
  }

  // Filter out any suggestion that does not resolve to a supported Earth celestial body
  const body = detectCelestialBody({ query: candidate });
  if (!isCelestialBodySupported(body)) {
    return "Search location...";
  }

  return candidate;
};

const Controls: React.FC<ControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onSearch,
  onTraceRoute,
  isSearching,
  searchError,
  onClearError,
  skin,
  showFavorites,
  onToggleShowFavorites,
  paused,
  isTraceModalOpen,
  onToggleTraceModal,
  isZoomLocked,
  onToggleZoomLock,
  isNarrationEnabled = true,
  onToggleNarration,
  isNarrationAvailable = true,
  showNews = true,
  onCycleSkin,
  isScanningArea = false,
  scanningStatusText = null,
  activeWaypointTitle = null,
  activeLocationContext = null,
  onCancelScan,
  isSettingsOpen = false,
  onToggleSettings,
  onOpenSettingsTab,
  isOSMDisplayed,
  isOSMActive
}) => {
  const isOSM = isOSMDisplayed ?? isOSMActive ?? false;
  const [query, setQuery] = useState("");
  const [placeholder, setPlaceholder] = useState("Search location...");
  const [isFocused, setIsFocused] = useState(false);
  const [traceText, setTraceText] = useState("");
  const prevPausedRef = useRef(paused);

  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = chipsContainerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScrollLeft = scrollWidth - clientWidth;
    const tolerance = 2;
    setCanScrollLeft(scrollLeft > tolerance);
    setCanScrollRight(maxScrollLeft - scrollLeft > tolerance);
  }, []);

  const handleScrollLeft = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = chipsContainerRef.current;
    if (!container) return;

    const chipElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="contextual-chip-"]')
    );
    if (chipElements.length === 0) return;

    const baseOffset = chipElements[0].offsetLeft;
    const currentScrollLeft = container.scrollLeft;
    const tolerance = 4;

    // Find previous chip (last chip whose start position is strictly before current scroll position)
    let targetLeft = 0;
    for (let i = chipElements.length - 1; i >= 0; i--) {
      const chipStart = chipElements[i].offsetLeft - baseOffset;
      if (chipStart < currentScrollLeft - tolerance) {
        targetLeft = chipStart;
        break;
      }
    }

    targetLeft = Math.max(0, targetLeft);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      container.scrollLeft = targetLeft;
    }
  }, []);

  const handleScrollRight = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = chipsContainerRef.current;
    if (!container) return;

    const chipElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="contextual-chip-"]')
    );
    if (chipElements.length === 0) return;

    const baseOffset = chipElements[0].offsetLeft;
    const currentScrollLeft = container.scrollLeft;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const tolerance = 4;

    // Find next chip (first chip whose start position is strictly after current scroll position)
    let targetLeft = maxScrollLeft;
    for (let i = 0; i < chipElements.length; i++) {
      const chipStart = chipElements[i].offsetLeft - baseOffset;
      if (chipStart > currentScrollLeft + tolerance) {
        targetLeft = chipStart;
        break;
      }
    }

    targetLeft = Math.min(maxScrollLeft, targetLeft);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    } else {
      container.scrollLeft = targetLeft;
    }
  }, []);

  // Initialize placeholder on mount
  useEffect(() => {
    setPlaceholder(generateSuggestion());
  }, []);

  // Handle immediate refresh when unpausing
  useEffect(() => {
    if (prevPausedRef.current && !paused && !isFocused) {
       // If we were paused and now we are not, refresh immediately
       setPlaceholder(generateSuggestion());
    }
    prevPausedRef.current = paused;
  }, [paused, isFocused]);

  // Dynamic Suggestion Logic - Pauses when focused or explicitly paused by parent
  useEffect(() => {
    if (isFocused || paused) return;

    const interval = setInterval(() => {
      setPlaceholder(generateSuggestion());
    }, 8000); // Change every 8 seconds
    return () => clearInterval(interval);
  }, [isFocused, paused]);

  // Handle query setting when scanning area state changes with ellipsis animation and ALL CAPS formatting
  useEffect(() => {
    if (!scanningStatusText) {
      setQuery("");
      return;
    }

    const isTerminalState = (text: string) => {
      const upper = text.toUpperCase();
      return upper.includes("COMPLETE") ||
             upper.includes("NO INFORMATION FOUND") ||
             upper.includes("FAILED") ||
             upper.includes("CANCELLED") ||
             upper.includes("TOO LONG") ||
             upper.includes("CANNOT BE ACCESSED") ||
             upper.includes("TOO MUCH ACTIVITY");
    };

    if (isTerminalState(scanningStatusText)) {
      setQuery(scanningStatusText.toUpperCase());
      return;
    }

    // For active/processing states, capitalize and cycle trailing ellipsis
    const baseText = scanningStatusText.replace(/\.*$/, "").toUpperCase();
    let count = 1;
    setQuery(`${baseText}.`);

    const interval = setInterval(() => {
      count = (count % 3) + 1;
      setQuery(`${baseText}${".".repeat(count)}`);
    }, 400); // 400ms cadence

    return () => clearInterval(interval);
  }, [scanningStatusText]);

    const isScanStatusQuery = (q: string) => {
    const upper = q.trim().toUpperCase();
    return upper.startsWith("STARTING SCAN") ||
           upper.startsWith("LOCATING AREA") ||
           upper.startsWith("EXPANDING SEARCH") ||
           upper.startsWith("CHECKING AREA") ||
           upper.startsWith("REVIEWING RESULTS") ||
           upper.startsWith("FINALIZING RESULTS") ||
           upper.startsWith("LOCATING ") ||
           upper.startsWith("TRACING ROUTE") ||
           upper.startsWith("FINDING WAYPOINTS") ||
           upper.includes("WAYPOINTS FOUND") ||
           upper.startsWith("PREPARING WAYPOINT") ||
           upper.startsWith("PREPARING NARRATION") ||
           upper.startsWith("RESEARCHING FOLLOW-UP") ||
           upper === "SCAN CANCELLED" ||
           upper === "SCAN FAILED";
  };

  const handleCancelClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setQuery("");
    if (onCancelScan) {
      onCancelScan();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    narrationService.prime();
    if (scanningStatusText || isScanStatusQuery(query)) {
      handleCancelClick();
      return;
    }
    if (query.trim()) {
      console.log(`[SearchNarration] SEARCH_SUBMITTED query="${query.trim()}"`);
      onSearch(query);
    } else {
      const effectiveCandidate = (activeWaypointTitle && !scanningStatusText) ? activeWaypointTitle : placeholder;
      if (effectiveCandidate && effectiveCandidate !== "Search location..." && effectiveCandidate !== "SEARCH LOCATION...") {
        const cleanQuery = effectiveCandidate.replace(/\.\.\.$/, "");
        if (!isScanStatusQuery(cleanQuery)) {
          console.log(`[SearchNarration] SEARCH_SUBMITTED query="${cleanQuery}"`);
          setQuery(cleanQuery);
          onSearch(cleanQuery);
        }
      }
    }
  };

  const handleTraceSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      narrationService.prime();
      if (traceText.trim()) {
          onTraceRoute(traceText);
          onToggleTraceModal(false);
          setTraceText("");
      }
  };

  const themes = {
    'modern': {
      // Base button: neutral hover to avoid clashing with active states (darker hover when OSM is displayed for contrast against light map tiles)
      btn: isOSM
        ? "bg-black/60 backdrop-blur-md border border-white/20 text-white modern-osm-hover rounded-full"
        : "bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 rounded-full",
      // Zoom Active (Cyan)
      btnActive: "bg-cyan-900/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.5)] hover:bg-cyan-800",
      // Favorite Active (Yellow/Gold for high contrast Star)
      favActive: "bg-black/60 border-yellow-400 text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]",

      inputWrapper: "bg-black/80 backdrop-blur-xl border border-white/20 rounded-full shadow-2xl focus-within:border-cyan-500/70",
      inputIcon: "text-gray-300",
      inputField: "text-white placeholder-gray-400 font-mono text-sm",
      submitBtn: "bg-white/10 text-cyan-400 hover:bg-white/20 hover:text-cyan-300 rounded-full",
      resetBtn: "text-gray-400 hover:text-white mr-2 p-1 rounded-full hover:bg-white/10 transition-colors",
      glow: "absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur opacity-20 group-hover:opacity-40",
      statusRow: "bg-black/80 backdrop-blur-md border border-white/15 text-white/90 rounded-full shadow-lg",
      statusText: "text-gray-200 font-sans",
      statusDismiss: "text-white/40 hover:text-white transition-colors p-0.5 rounded-full",
      copyright: "text-gray-500 font-sans",
      modal: "bg-black/80 backdrop-blur-md border border-cyan-400/30 text-white rounded-xl shadow-2xl",
      chip: isOSM
        ? "px-3 py-1 bg-black/75 hover:bg-black/90 text-white border border-white/20 rounded-full text-xs font-mono transition-all shadow-md active:scale-95 cursor-pointer backdrop-blur-md"
        : "px-3 py-1 bg-black/60 hover:bg-white/20 text-white border border-white/20 rounded-full text-xs font-mono transition-all shadow-md active:scale-95 cursor-pointer backdrop-blur-md"
    },
    'retro-green': {
      btn: "bg-black border border-green-400 text-green-300 hover:bg-green-400 hover:text-black rounded-none font-retro",
      btnActive: "bg-green-400 text-black",
      // Favorite Active: Black bg, Green text/icon, Green border/glow
      favActive: "bg-black text-green-400 border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.6)] hover:bg-black hover:text-green-400",

      inputWrapper: "bg-black border-2 border-green-400 rounded-none shadow-none",
      inputIcon: "text-green-300",
      inputField: "text-green-300 placeholder-green-400/50 font-retro tracking-wider uppercase text-lg",
      submitBtn: "bg-green-900/40 text-green-300 hover:bg-green-400 hover:text-black rounded-none font-retro uppercase",
      resetBtn: "text-green-300 hover:text-green-100 mr-2 p-1",
      glow: "hidden",
      statusRow: "bg-black border border-green-400 text-green-300 font-retro uppercase tracking-wider rounded-none",
      statusText: "text-green-300 font-retro",
      statusDismiss: "text-green-400/70 hover:text-green-200 transition-colors p-0.5",
      copyright: "text-green-400/60 font-retro uppercase tracking-widest",
      modal: "bg-black/85 backdrop-blur-sm border-2 border-green-400 text-green-300 font-retro shadow-[0_0_20px_rgba(74,222,128,0.2)] rounded-none",
      chip: "px-3 py-1 bg-black hover:bg-green-400 hover:text-black text-green-300 border border-green-400 rounded-none text-xs font-retro uppercase tracking-wider transition-colors active:scale-95 cursor-pointer"
    },
    'retro-amber': {
      btn: "bg-black border border-amber-400 text-amber-300 hover:bg-amber-400 hover:text-black rounded-none font-retro",
      btnActive: "bg-amber-400 text-black",
      // Favorite Active: Black bg, Amber text/icon, Amber border/glow
      favActive: "bg-black text-amber-400 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] hover:bg-black hover:text-amber-400",

      inputWrapper: "bg-black border-2 border-amber-400 rounded-none shadow-none",
      inputIcon: "text-amber-300",
      inputField: "text-amber-300 placeholder-amber-400/50 font-retro tracking-wider uppercase text-lg",
      submitBtn: "bg-amber-900/40 text-amber-300 hover:bg-amber-400 hover:text-black rounded-none font-retro uppercase",
      resetBtn: "text-amber-300 hover:text-amber-100 mr-2 p-1",
      glow: "hidden",
      statusRow: "bg-black border border-amber-400 text-amber-300 font-retro uppercase tracking-wider rounded-none",
      statusText: "text-amber-300 font-retro",
      statusDismiss: "text-amber-400/70 hover:text-amber-200 transition-colors p-0.5",
      copyright: "text-amber-400/60 font-retro uppercase tracking-widest",
      modal: "bg-black/85 backdrop-blur-sm border-2 border-amber-400 text-amber-300 font-retro shadow-[0_0_20px_rgba(251,191,36,0.2)] rounded-none",
      chip: "px-3 py-1 bg-black hover:bg-amber-400 hover:text-black text-amber-300 border border-amber-400 rounded-none text-xs font-retro uppercase tracking-wider transition-colors active:scale-95 cursor-pointer"
    },
    'parchment': {
      btn: "bg-[#f4ead5] border border-[#8b5a2b] text-[#5c3a21] hover:bg-[#e8d5b5] hover:text-[#3e2723] rounded shadow-[2px_2px_4px_rgba(0,0,0,0.2)] font-sans",
      btnActive: "bg-[#d2b48c] text-[#3e2723] border-[#5c3a21] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.3)]",
      favActive: "bg-[#e8d5b5] text-[#b8860b] border-[#b8860b] shadow-[0_0_10px_rgba(184,134,11,0.3)] hover:bg-[#d2b48c] hover:text-[#8b6508]",

      inputWrapper: "backdrop-blur-md border-0 rounded-none shadow-none",
      inputIcon: "text-[#8b5a2b]",
      inputField: "text-[#522B07] placeholder-[#522B07] font-mono text-sm",
      submitBtn: "text-[#5c3a21] hover:text-[#3e2723] bg-transparent hover:bg-transparent rounded-none font-sans font-bold uppercase tracking-wider text-sm",
      resetBtn: "text-[#8b5a2b] hover:text-[#3e2723] mr-2 p-1",
      glow: "hidden",
      statusRow: "text-[#5c3a21] font-sans shadow-sm",
      statusText: "text-[#522B07] font-sans",
      statusDismiss: "text-[#8b5a2b]/70 hover:text-[#3e2723] transition-colors p-0.5",
      copyright: "text-white/50 font-sans",
      modal: "text-[#3e2723] font-sans shadow-[0_4px_20px_rgba(0,0,0,0.4)]",
      chip: "px-1.5 py-0.5 text-[#f4ead5] underline underline-offset-2 decoration-[#f4ead5]/70 hover:text-white hover:decoration-white text-xs font-sans transition-colors active:scale-95 cursor-pointer"
    }
  };

  const showSearchGlow = !!scanningStatusText || isSearching;

  const glowClass = !showSearchGlow ? "" : (
     skin === 'modern' ? 'active-search-glow-modern' :
     skin === 'retro-green' ? 'active-search-glow-green' :
     skin === 'retro-amber' ? 'active-search-glow-amber' :
     'active-search-glow-parchment'
  );

  const theme = themes[skin];

  const handleInputFocus = () => {
    setIsFocused(true);
    if (searchError && onClearError) {
       onClearError();
    }
  };

  // Gradient edge-fade mask for Modern theme contextual chips to avoid abrupt clipping
  const getModernChipsMaskStyle = (): React.CSSProperties => {
    if (skin !== 'modern') return {};
    const fadeDistance = '10px';
    if (canScrollLeft && canScrollRight) {
      const mask = `linear-gradient(to right, transparent 0px, black ${fadeDistance}, black calc(100% - ${fadeDistance}), transparent 100%)`;
      return {
        maskImage: mask,
        WebkitMaskImage: mask
      };
    }
    if (canScrollLeft) {
      const mask = `linear-gradient(to right, transparent 0px, black ${fadeDistance}, black 100%)`;
      return {
        maskImage: mask,
        WebkitMaskImage: mask
      };
    }
    if (canScrollRight) {
      const mask = `linear-gradient(to right, black 0px, black calc(100% - ${fadeDistance}), transparent 100%)`;
      return {
        maskImage: mask,
        WebkitMaskImage: mask
      };
    }
    return {};
  };

  const chips = activeLocationContext ? generateContextualChips(activeLocationContext, showNews) : [];

  useEffect(() => {
    updateScrollIndicators();
    const el = chipsContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    window.addEventListener('resize', updateScrollIndicators);
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [chips, updateScrollIndicators]);

  const handleChipClick = (chip: ContextualChip) => {
    if (chip.type === 'news' && chip.url) {
      window.open(chip.url, '_blank', 'noopener,noreferrer');
      return;
    }
    narrationService.prime();
    setQuery("");
    onSearch(chip.query || chip.label, true);
  };

  // Format placeholder for retro skins, clear on focus.
  // When an active location context is present, display "Ask about {name}..."
  // When an active waypoint title is provided (during route navigation) and no active user search/focus is happening, display it.
  const activePlaceholderText = (activeLocationContext && !scanningStatusText)
    ? `Ask about ${activeLocationContext.name}...`
    : (activeWaypointTitle && !scanningStatusText)
    ? activeWaypointTitle
    : placeholder;
  const displayPlaceholder = isFocused ? "" : (skin === 'modern' || skin === 'parchment' ? activePlaceholderText : activePlaceholderText.toUpperCase());

  return (
    <div className="absolute bottom-2.5 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none px-4">
      <style>{`
        @keyframes search-orbit {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -1000;
          }
        }
        @keyframes search-pulse-glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(34, 211, 238, 0.2);
            border-color: rgba(34, 211, 238, 0.3);
          }
          50% {
            box-shadow: 0 0 15px rgba(34, 211, 238, 0.6);
            border-color: rgba(34, 211, 238, 0.8);
          }
        }
        @keyframes search-pulse-glow-retro-green {
          0%, 100% {
            box-shadow: 0 0 5px rgba(74, 222, 128, 0.2);
            border-color: rgba(74, 222, 128, 0.4);
          }
          50% {
            box-shadow: 0 0 15px rgba(74, 222, 128, 0.7);
            border-color: rgba(74, 222, 128, 0.9);
          }
        }
        @keyframes search-pulse-glow-retro-amber {
          0%, 100% {
            box-shadow: 0 0 5px rgba(251, 191, 36, 0.2);
            border-color: rgba(251, 191, 36, 0.4);
          }
          50% {
            box-shadow: 0 0 15px rgba(251, 191, 36, 0.7);
            border-color: rgba(251, 191, 36, 0.9);
          }
        }
        @keyframes search-pulse-glow-parchment {
          0%, 100% {
            box-shadow: 0 0 2px rgba(200, 170, 120, 0.20), 0 0 5px rgba(120, 95, 65, 0.08);
            opacity: 0.45;
          }
          30% {
            box-shadow: 0 0 3px rgba(200, 170, 120, 0.30), 0 0 7px rgba(120, 95, 65, 0.12);
            opacity: 0.65;
          }
          60% {
            box-shadow: 0 0 6px rgba(210, 180, 130, 0.55), 0 0 12px rgba(120, 95, 65, 0.18);
            opacity: 0.95;
          }
        }
        .active-search-glow-modern {
          animation: search-pulse-glow 2s infinite ease-in-out;
          background-color: rgba(0, 0, 0, 0.85) !important;
        }
        .active-search-glow-green {
          animation: search-pulse-glow-retro-green 2s infinite ease-in-out;
          background-color: rgba(0, 20, 0, 0.2) !important;
        }
        .active-search-glow-amber {
          animation: search-pulse-glow-retro-amber 2s infinite ease-in-out;
          background-color: rgba(20, 10, 0, 0.2) !important;
        }
        .active-search-glow-parchment {
          animation: search-pulse-glow-parchment 2s infinite ease-in-out;
        }
        .orbiting-dot {
          stroke-dasharray: 20 980;
          animation: search-orbit 3s linear infinite;
        }
        .modern-osm-hover:hover {
          background-color: rgba(0, 0, 0, 0.25);
        }
        .no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>


      {/* Trace Route Modal */}
      {isTraceModalOpen && (
          <div
            onClick={() => onToggleTraceModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
          >
              <div
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-lg p-6 flex flex-col gap-4 ${skin === 'parchment' ? '[isolation:isolate]' : 'overflow-hidden'} ${theme.modal}`}
              >
                  {skin === 'parchment' && (
                    <div className="parchment-background" aria-hidden="true" />
                  )}
                  <div className="relative z-[1] flex flex-col gap-4">
                    <button
                      onClick={() => onToggleTraceModal(false)}
                      className={`absolute top-0 right-0 p-1 ${
                        skin === 'parchment'
                          ? 'transition-colors hover:bg-[#d2b48c]/50 hover:text-[#3e2723] text-[#3e2723] rounded'
                          : 'hover:opacity-70'
                      }`}
                    >
                        <X size={20} />
                    </button>
                    <h2 className={`font-bold uppercase ${skin === 'parchment' ? 'text-[#3e2723] text-lg tracking-wider brand-font' : 'text-xl tracking-wide'}`}>Trace Route</h2>
                    <p className={`text-sm ${skin === 'parchment' ? 'text-[#3e2723]/70' : 'opacity-70'}`}>Paste an article, URL, or text block. The system will identify locations and create a connected journey.</p>
                    <form onSubmit={handleTraceSubmit} className="flex flex-col gap-4">
                        <textarea
                          value={traceText}
                          onChange={(e) => setTraceText(e.target.value)}
                          placeholder="Paste text here..."
                          className={`w-full h-32 p-3 text-sm transition-colors outline-none resize-none ${
                            skin === 'modern'
                              ? 'bg-transparent border border-white/20 rounded-lg focus:border-opacity-100'
                              : skin === 'parchment'
                              ? 'bg-[#e6d5b8] text-[#3e2723] border border-[#8b5a2b]/30 rounded-lg placeholder-[#3e2723]/60 focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]'
                              : 'bg-transparent border border-current rounded-none focus:border-opacity-100'
                          }`}
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!traceText.trim()}
                          className={`font-bold uppercase tracking-wider text-sm transition-all ${
                            skin === 'parchment'
                              ? 'px-3 py-2 rounded-lg border whitespace-nowrap transition-colors border-[#8b5a2b]/30 hover:bg-[#e6d5b8] text-[#3e2723]'
                              : `${theme.btn} py-3`
                          } ${!traceText.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
                        >
                            Generate Route
                        </button>
                    </form>
                  </div>
              </div>
          </div>
      )}

      {/* Zoom & View Controls */}
      <div className="flex gap-2 pointer-events-auto">
        <button
          onClick={() => onToggleTraceModal(!isTraceModalOpen)}
          className={`p-3 transition-all active:scale-95 ${theme.btn} ${isTraceModalOpen ? theme.favActive : ''}`}
          aria-label="Trace Route"
          title="Trace Route from Text"
        >
           <TraceRouteIcon />
        </button>
        <button
          onClick={onToggleShowFavorites}
          className={`p-3 transition-all active:scale-95 ${theme.btn} ${showFavorites ? theme.favActive : ''}`}
          aria-label="Toggle Favorites"
          title="Show/Hide Favorites"
        >
          <Star size={20} className={showFavorites ? "fill-current" : ""} />
        </button>
        <div className={`w-px mx-1 self-stretch ${
          skin === 'parchment'
            ? (isOSM ? 'bg-[#8b5a2b]/30' : 'bg-white/20')
            : skin === 'modern'
            ? (isOSM ? 'bg-black/60' : 'bg-white/20')
            : 'bg-white/20'
        }`}></div>
        <button
          onClick={onZoomOut}
          className={`p-3 transition-all active:scale-95 ${theme.btn}`}
          aria-label="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>
        <button
          onClick={onZoomIn}
          className={`p-3 transition-all active:scale-95 ${theme.btn}`}
          aria-label="Zoom In"
        >
          <ZoomIn size={20} />
        </button>
        <button
          onClick={onToggleNarration}
          disabled={!isNarrationAvailable}
          className={`p-3 transition-all active:scale-95 ${theme.btn} ${
            isNarrationEnabled ? theme.favActive : ''
          } ${!isNarrationAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
          aria-label={!isNarrationAvailable ? "Narration unavailable" : isNarrationEnabled ? "Narration On" : "Narration Off"}
          title={!isNarrationAvailable ? "Narration unavailable" : isNarrationEnabled ? "Narration On" : "Narration Off"}
          data-testid="narration-toolbar-toggle"
        >
          {isNarrationEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>


        {onCycleSkin && (
          <>
            <div className={`w-px mx-1 self-stretch ${
              skin === 'parchment'
                ? (isOSM ? 'bg-[#8b5a2b]/30' : 'bg-white/20')
                : skin === 'modern'
                ? (isOSM ? 'bg-black/60' : 'bg-white/20')
                : skin === 'retro-green'
                ? 'bg-green-400/30'
                : skin === 'retro-amber'
                ? 'bg-amber-400/30'
                : 'bg-white/20'
            }`}></div>
            <button
              onClick={onCycleSkin}
              className={`p-3 transition-all active:scale-95 ${theme.btn}`}
              aria-label="Switch Theme"
              title="Switch Theme"
            >
              <Palette size={20} />
            </button>
          </>
        )}

        {onToggleSettings && (
            <button
              onClick={onToggleSettings}
              className={`p-3 transition-all active:scale-95 ${theme.btn} ${isSettingsOpen ? theme.favActive : ''}`}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={20} />
            </button>
        )}
      </div>

      {/* Contextual Question & News Chips (Positioned between toolbar and search field) */}
      {chips.length > 0 && (!scanningStatusText || scanningStatusText.toUpperCase().includes("RESEARCHING FOLLOW-UP")) && (
        <div className="flex items-center w-full max-w-[532px] pointer-events-auto z-20">
          {canScrollLeft && (
            <button
              type="button"
              onClick={handleScrollLeft}
              className={`shrink-0 flex items-center justify-center p-1 mr-1.5 select-none cursor-pointer transition-opacity hover:opacity-80 active:scale-95 touch-manipulation ${
                skin === 'retro-green'
                  ? 'text-green-400 font-retro text-xs font-bold drop-shadow-[0_0_4px_rgba(74,222,128,0.8)]'
                  : skin === 'retro-amber'
                  ? 'text-amber-400 font-retro text-xs font-bold drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]'
                  : skin === 'parchment'
                  ? 'text-[#f4ead5] font-sans text-xs font-bold'
                  : 'bg-black/60 rounded-full text-cyan-400/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
              }`}
              data-testid="chips-scroll-left-indicator"
              aria-label="Scroll follow-up questions left"
              title="Previous questions"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
          )}
          <div
            ref={chipsContainerRef}
            style={getModernChipsMaskStyle()}
            className="flex-1 min-w-0 overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-bottom-1 duration-200"
            data-testid="contextual-chips-container"
          >
            <div className="flex items-center justify-start gap-1.5 flex-nowrap w-max px-2 min-w-full">
              {chips.map((chip, idx) => (
                <button
                  key={chip.id || idx}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleChipClick(chip);
                  }}
                  className={`${theme.chip} whitespace-nowrap shrink-0`}
                  data-testid={`contextual-chip-${idx}`}
                >
                  {skin === 'retro-green' || skin === 'retro-amber' ? chip.label.toUpperCase() : chip.label}
                </button>
              ))}
            </div>
          </div>
          {canScrollRight && (
            <button
              type="button"
              onClick={handleScrollRight}
              className={`shrink-0 flex items-center justify-center p-1 ml-1.5 select-none cursor-pointer transition-opacity hover:opacity-80 active:scale-95 touch-manipulation ${
                skin === 'retro-green'
                  ? 'text-green-400 font-retro text-xs font-bold drop-shadow-[0_0_4px_rgba(74,222,128,0.8)]'
                  : skin === 'retro-amber'
                  ? 'text-amber-400 font-retro text-xs font-bold drop-shadow-[0_0_4px_rgba(251,191,36,0.8)]'
                  : skin === 'parchment'
                  ? 'text-[#f4ead5] font-sans text-xs font-bold'
                  : 'bg-black/60 rounded-full text-cyan-400/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
              }`}
              data-testid="chips-scroll-right-indicator"
              aria-label="Scroll follow-up questions right"
              title="More questions"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {/* Search Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-[532px] pointer-events-auto relative group">
        <div className={theme.glow}></div>
        {skin === 'parchment' ? (
          <div className="relative w-full [isolation:isolate]">
            {/* Outer wrapper: renders glow with no clipping, z-0, extending beyond input boundaries */}
            {showSearchGlow && (
              <div className="absolute inset-[-3px] z-0 pointer-events-none active-search-glow-parchment" />
            )}
            {/* Inner container: parchment background behind crisp content */}
            <div className={`relative flex items-center transition-all ${skin === 'parchment' ? '[isolation:isolate]' : 'overflow-hidden'} ${theme.inputWrapper}`}>
              <div className="parchment-background" aria-hidden="true" />
              <div className="relative z-[1] flex items-center w-full">
                <Search className={`ml-4 shrink-0 ${theme.inputIcon}`} size={20} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    if (searchError && onClearError) onClearError();
                    setQuery(e.target.value);
                  }}
                  onFocus={handleInputFocus}
                  onBlur={() => setIsFocused(false)}
                  placeholder={displayPlaceholder}
                  disabled={!!scanningStatusText}
                  className={`w-full bg-transparent border-none px-4 py-4 focus:ring-0 outline-none ${theme.inputField}`}
                />

                {query && !scanningStatusText && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      if (searchError && onClearError) onClearError();
                    }}
                    className={theme.resetBtn}
                    aria-label="Clear Search"
                  >
                    <X size={16} />
                  </button>
                )}

                <button
                  type={scanningStatusText ? "button" : "submit"}
                  onClick={scanningStatusText ? handleCancelClick : undefined}
                  disabled={isSearching && !scanningStatusText}
                  className={`mr-2 px-4 py-2 transition-colors disabled:opacity-50 ${theme.submitBtn}`}
                >
                  {scanningStatusText ? "CANCEL" : isSearching ? <Loader2 size={18} className="animate-spin" /> : "EXPLORE"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`relative flex items-center transition-all ${theme.inputWrapper} ${glowClass}`}>
            <Search className={`ml-4 ${theme.inputIcon}`} size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                if (searchError && onClearError) onClearError();
                setQuery(e.target.value);
              }}
              onFocus={handleInputFocus}
              onBlur={() => setIsFocused(false)}
              placeholder={displayPlaceholder}
              disabled={!!scanningStatusText}
              className={`w-full bg-transparent border-none px-4 py-4 focus:ring-0 outline-none ${theme.inputField}`}
            />

            {query && !scanningStatusText && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  if (searchError && onClearError) onClearError();
                }}
                className={theme.resetBtn}
                aria-label="Clear Search"
              >
                <X size={16} />
              </button>
            )}

            <button
              type={scanningStatusText ? "button" : "submit"}
              onClick={scanningStatusText ? handleCancelClick : undefined}
              disabled={isSearching && !scanningStatusText}
              className={`mr-2 px-4 py-2 transition-colors disabled:opacity-50 ${theme.submitBtn}`}
            >
              {scanningStatusText ? "CANCEL" : isSearching ? <Loader2 size={18} className="animate-spin" /> : "EXPLORE"}
            </button>
          </div>
        )}
      </form>

      {/* Search Error / Status Message */}
      {searchError && (() => {
        const hasGuidance = searchError.includes('Settings > Providers') || searchError.includes('Settings &gt; Providers');
        const mainMessage = hasGuidance
          ? searchError.replace(/\s*\(?Settings\s*(>|&gt;)\s*Providers\)?\s*$/i, '').trim()
          : searchError;
        const handleOpenProviders = () => {
          if (onOpenSettingsTab) {
            onOpenSettingsTab('providers');
          } else if (onToggleSettings) {
            onToggleSettings();
          }
        };

        return (
          <div
            className={`relative w-full max-w-[532px] pointer-events-auto flex items-start justify-between px-3.5 py-2 -mt-2.5 text-xs transition-all animate-in fade-in duration-200 ${skin === 'parchment' ? '[isolation:isolate]' : ''} ${theme.statusRow}`}
            role="status"
            aria-live="polite"
          >
            {skin === 'parchment' && (
              <div className="parchment-background" aria-hidden="true" />
            )}
            <div className="relative z-[1] flex items-start justify-between w-full min-w-0 gap-2">
              <span className={`break-words whitespace-normal leading-relaxed text-xs ${theme.statusText} flex flex-wrap items-center gap-x-1.5`}>
                <span>{mainMessage}</span>
                {hasGuidance && (
                  <span className="opacity-90 inline-flex items-center">
                    (
                    {onOpenSettingsTab || onToggleSettings ? (
                      <button
                        type="button"
                        onClick={handleOpenProviders}
                        className="underline hover:opacity-100 transition-opacity font-semibold cursor-pointer"
                      >
                        Settings &gt; Providers
                      </button>
                    ) : (
                      <span>Settings &gt; Providers</span>
                    )}
                    )
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={onClearError}
                className={`ml-2 shrink-0 mt-0.5 ${theme.statusDismiss}`}
                aria-label="Dismiss error"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Copyright & Map Attribution Text */}
      <div className={`text-[10px] md:text-xs text-center -mt-1 ${theme.copyright}`}>
        © {new Date().getFullYear()} TerraExplorer by Chris Adkins • All Rights Reserved<br />
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 pointer-events-auto">OpenStreetMap contributors</a>
        {' '}• ©{' '}
        <a href="https://carto.com/attribution/" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 pointer-events-auto">CARTO</a>
      </div>
    </div>
  );
};

export default Controls;
