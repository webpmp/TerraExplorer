
import React, { useState, useEffect } from 'react';
import { Search, ZoomIn, ZoomOut, Loader2, Star, AlertTriangle, X } from 'lucide-react';
import { SkinType } from '../types';

interface ControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSearch: (query: string) => void;
  isSearching: boolean;
  searchError?: string | null;
  skin: SkinType;
  showFavorites: boolean;
  onToggleShowFavorites: () => void;
}

// Significantly expanded data for suggestions
const historicalEvents = [
  "the moon landing", "the Battle of Hastings", "Woodstock", "the first Olympics",
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
  
  if (r < 0.35) {
    const evt = historicalEvents[Math.floor(Math.random() * historicalEvents.length)];
    return `Where did ${evt} take place?`;
  }
  
  if (r < 0.5) {
    const poi = pointsOfInterest[Math.floor(Math.random() * pointsOfInterest.length)];
    return `Where is ${poi}?`;
  }
  
  if (r < 0.65) {
    const ship = shipwrecks[Math.floor(Math.random() * shipwrecks.length)];
    return `Where was ${ship} found?`;
  }
  
  if (r < 0.8) {
    const place = places[Math.floor(Math.random() * places.length)];
    return `Find ${place}...`;
  }
  
  const poi = pointsOfInterest[Math.floor(Math.random() * pointsOfInterest.length)];
  return `Show me ${poi}...`;
};

const Controls: React.FC<ControlsProps> = ({ 
  onZoomIn, 
  onZoomOut, 
  onSearch, 
  isSearching, 
  searchError,
  skin, 
  showFavorites, 
  onToggleShowFavorites 
}) => {
  const [query, setQuery] = useState("");
  const [placeholder, setPlaceholder] = useState("Search location...");
  const [isFocused, setIsFocused] = useState(false);

  // Initialize placeholder on mount
  useEffect(() => {
    setPlaceholder(generateSuggestion());
  }, []);

  // Dynamic Suggestion Logic - Pauses when focused
  useEffect(() => {
    if (isFocused) return;

    const interval = setInterval(() => {
      setPlaceholder(generateSuggestion());
    }, 8000); // Change every 8 seconds

    return () => clearInterval(interval);
  }, [isFocused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    } else if (placeholder !== "Search location..." && placeholder !== "SEARCH LOCATION...") {
      // Use the suggested tip as the search query if the input is empty
      // Remove trailing ellipsis for a cleaner query
      const cleanQuery = placeholder.replace(/\.\.\.$/, "");
      setQuery(cleanQuery);
      onSearch(cleanQuery);
    }
  };

  const themes = {
    'modern': {
      // Base button: neutral hover to avoid clashing with active states
      btn: "bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 rounded-full",
      // Zoom Active (Cyan)
      btnActive: "bg-cyan-900/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.5)] hover:bg-cyan-800",
      // Favorite Active (Yellow/Gold for high contrast Star)
      favActive: "bg-yellow-500/20 border-yellow-400 text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)] hover:bg-yellow-500/30",
      
      inputWrapper: "bg-black/80 backdrop-blur-xl border border-white/20 rounded-full shadow-2xl focus-within:border-cyan-500/70",
      inputIcon: "text-gray-300",
      inputField: "text-white placeholder-gray-400 font-mono text-sm",
      submitBtn: "bg-white/10 text-cyan-400 hover:bg-white/20 hover:text-cyan-300 rounded-full",
      resetBtn: "text-gray-400 hover:text-white mr-2 p-1 rounded-full hover:bg-white/10 transition-colors",
      glow: "absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur opacity-20 group-hover:opacity-40",
      error: "bg-red-900/80 border border-red-500 text-white text-sm px-4 py-2 rounded-lg backdrop-blur-md flex items-center gap-2",
      copyright: "text-white/40 font-sans"
    },
    'retro-green': {
      btn: "bg-black border border-green-400 text-green-300 hover:bg-green-400 hover:text-black rounded-none font-retro",
      btnActive: "bg-green-400 text-black",
      // Favorite Active: Black bg, Green text/icon, Green border/glow
      favActive: "bg-black text-green-400 border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.6)] hover:bg-black hover:text-green-400",
      
      inputWrapper: "bg-black border-2 border-green-400 rounded-none shadow-none",
      inputIcon: "text-green-300",
      inputField: "text-green-300 placeholder-green-400/50 font-retro tracking-wider uppercase text-lg",
      submitBtn: "bg-green-900/40 text-green-300 border-l border-green-400 hover:bg-green-400 hover:text-black rounded-none font-retro uppercase",
      resetBtn: "text-green-300 hover:text-green-100 mr-2 p-1",
      glow: "hidden",
      error: "bg-black border border-green-400 text-green-300 font-retro px-4 py-2 uppercase blinking",
      copyright: "text-green-400/60 font-retro uppercase tracking-widest"
    },
    'retro-amber': {
      btn: "bg-black border border-amber-400 text-amber-300 hover:bg-amber-400 hover:text-black rounded-none font-retro",
      btnActive: "bg-amber-400 text-black",
      // Favorite Active: Black bg, Amber text/icon, Amber border/glow
      favActive: "bg-black text-amber-400 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] hover:bg-black hover:text-amber-400",
      
      inputWrapper: "bg-black border-2 border-amber-400 rounded-none shadow-none",
      inputIcon: "text-amber-300",
      inputField: "text-amber-300 placeholder-amber-400/50 font-retro tracking-wider uppercase text-lg",
      submitBtn: "bg-amber-900/40 text-amber-300 border-l border-amber-400 hover:bg-amber-400 hover:text-black rounded-none font-retro uppercase",
      resetBtn: "text-amber-300 hover:text-amber-100 mr-2 p-1",
      glow: "hidden",
      error: "bg-black border border-amber-400 text-amber-300 font-retro px-4 py-2 uppercase blinking",
      copyright: "text-amber-400/60 font-retro uppercase tracking-widest"
    }
  };

  const theme = themes[skin];
  
  // Format placeholder for retro skins, clear on focus
  const displayPlaceholder = isFocused ? "" : (skin === 'modern' ? placeholder : placeholder.toUpperCase());

  return (
    <div className="absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-4 pointer-events-none px-4">
      {/* Error Message */}
      {searchError && (
        <div className={`pointer-events-auto animate-bounce ${theme.error}`}>
          <AlertTriangle size={16} />
          {searchError}
        </div>
      )}

      {/* Zoom & View Controls */}
      <div className="flex gap-2 pointer-events-auto">
        <button 
          onClick={onToggleShowFavorites}
          className={`p-3 transition-all active:scale-95 ${theme.btn} ${showFavorites ? theme.favActive : ''}`}
          aria-label="Toggle Favorites"
          title="Show/Hide Favorites"
        >
          <Star size={20} className={showFavorites ? "fill-current" : ""} />
        </button>
        <div className="w-px bg-white/20 mx-1 self-stretch"></div>
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
      </div>

      {/* Search Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg pointer-events-auto relative group">
        <div className={theme.glow}></div>
        <div className={`relative flex items-center overflow-hidden transition-all ${theme.inputWrapper}`}>
          <Search className={`ml-4 ${theme.inputIcon}`} size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={displayPlaceholder}
            className={`w-full bg-transparent border-none px-4 py-4 focus:ring-0 outline-none ${theme.inputField}`}
          />
          
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className={theme.resetBtn}
              aria-label="Clear Search"
            >
              <X size={16} />
            </button>
          )}

          <button 
            type="submit"
            disabled={isSearching}
            className={`mr-2 px-4 py-2 transition-colors disabled:opacity-50 ${theme.submitBtn}`}
          >
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : "SEARCH"}
          </button>
        </div>
      </form>
      
      {/* Copyright Text */}
      <div className={`text-[10px] md:text-xs text-center -mt-1 ${theme.copyright}`}>
        TerraExplorer by Chris Adkins
      </div>
    </div>
  );
};

export default Controls;
