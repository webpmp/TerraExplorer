
import React, { useState, useEffect } from 'react';
import { X, MapPin, Route as RouteIcon, Eye, EyeOff, Trash2, Navigation, Edit, Plus, Save, ChevronUp, ChevronDown } from 'lucide-react';
import { FavoriteLocation, SkinType, Waypoint } from '../types';

interface FavoritesPanelProps {
  favorites: FavoriteLocation[];
  onClose: () => void;
  visibleFavoriteIds: string[];
  activeRouteId: string | null;
  onToggleVisibility: (fav: FavoriteLocation) => void;
  onDelete: (id: string) => void;
  onUpdate: (fav: FavoriteLocation) => void;
  onFlyTo: (fav: FavoriteLocation) => void;
  skin: SkinType;
  dimmed?: boolean;
}

const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  favorites,
  onClose,
  visibleFavoriteIds,
  activeRouteId,
  onToggleVisibility,
  onDelete,
  onUpdate,
  onFlyTo,
  skin,
  dimmed = false
}) => {
  const [editingRoute, setEditingRoute] = useState<FavoriteLocation | null>(null);
  const isRetro = skin !== 'modern';

  const themes = {
    'modern': {
      container: "bg-black/80 backdrop-blur-xl border border-cyan-400/30 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-white font-sans",
      header: "bg-gradient-to-r from-blue-900 to-cyan-900",
      headerTitle: "brand-font text-white",
      item: "bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg transition-colors",
      itemActive: "bg-cyan-900/40 border-cyan-500/50",
      text: "text-gray-200",
      textActive: "text-cyan-300",
      icon: "text-cyan-400",
      actionBtn: "hover:bg-white/20 text-gray-400 hover:text-white rounded p-1.5 transition-colors",
      deleteBtn: "hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded p-1.5 transition-colors",
      closeBtn: "hover:bg-white/20 text-white rounded-full p-1",
      emptyState: "text-gray-500",
      modal: "bg-black/95 backdrop-blur-xl border border-cyan-400/30 rounded-xl text-white shadow-2xl",
      input: "bg-white/5 border border-white/20 text-white rounded p-2 text-sm focus:border-cyan-400 outline-none"
    },
    'retro-green': {
      container: "bg-black border-2 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.2)] text-green-300 font-retro tracking-widest",
      header: "bg-green-900/30 border-b-2 border-green-400",
      headerTitle: "text-green-300 uppercase",
      item: "bg-black border border-green-400/30 hover:bg-green-900/20 rounded-none",
      itemActive: "bg-green-900/40 border-green-400",
      text: "text-green-300",
      textActive: "text-green-300 font-bold",
      icon: "text-green-300",
      actionBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none p-1.5",
      deleteBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none p-1.5",
      closeBtn: "hover:bg-green-400 hover:text-black text-green-300 rounded-none p-1",
      emptyState: "text-green-400/50",
      modal: "bg-black border-2 border-green-400 text-green-300 font-retro shadow-none rounded-none",
      input: "bg-black border border-green-400 text-green-300 rounded-none p-2 text-sm focus:bg-green-900/20 outline-none font-retro"
    },
    'retro-amber': {
      container: "bg-black border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)] text-amber-300 font-retro tracking-widest",
      header: "bg-amber-900/30 border-b-2 border-amber-400",
      headerTitle: "text-amber-300 uppercase",
      item: "bg-black border border-amber-400/30 hover:bg-amber-900/20 rounded-none",
      itemActive: "bg-amber-900/40 border-amber-400",
      text: "text-amber-300",
      textActive: "text-amber-300 font-bold",
      icon: "text-amber-300",
      actionBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none p-1.5",
      deleteBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none p-1.5",
      closeBtn: "hover:bg-amber-400 hover:text-black text-amber-300 rounded-none p-1",
      emptyState: "text-amber-400/50",
      modal: "bg-black border-2 border-amber-400 text-amber-300 font-retro shadow-none rounded-none",
      input: "bg-black border border-amber-400 text-amber-300 rounded-none p-2 text-sm focus:bg-amber-900/20 outline-none font-retro"
    }
  };

  const theme = themes[skin];

  // Separate favorites by type
  const locationFavs = favorites.filter(f => f.type !== 'route');
  const routeFavs = favorites.filter(f => f.type === 'route');

  const handleEditClick = (fav: FavoriteLocation) => {
    // Deep clone to avoid mutating state directly
    setEditingRoute(JSON.parse(JSON.stringify(fav)));
  };

  const saveEditedRoute = () => {
    if (editingRoute) {
      onUpdate(editingRoute);
      setEditingRoute(null);
    }
  };

  const updateWaypoint = (index: number, field: keyof Waypoint, value: any) => {
    if (!editingRoute || !editingRoute.waypoints) return;
    const newWaypoints = [...editingRoute.waypoints];
    newWaypoints[index] = { ...newWaypoints[index], [field]: value };
    setEditingRoute({ ...editingRoute, waypoints: newWaypoints });
  };

  const removeWaypoint = (index: number) => {
    if (!editingRoute || !editingRoute.waypoints) return;
    const newWaypoints = editingRoute.waypoints.filter((_, i) => i !== index);
    setEditingRoute({ ...editingRoute, waypoints: newWaypoints });
  };

  const addWaypoint = () => {
    if (!editingRoute) return;
    const newWp: Waypoint = {
        id: `wp-new-${Date.now()}`,
        name: "New Location",
        lat: 0,
        lng: 0,
        context: "Added manually"
    };
    const currentWps = editingRoute.waypoints || [];
    setEditingRoute({ ...editingRoute, waypoints: [...currentWps, newWp] });
  };

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
      if (!editingRoute || !editingRoute.waypoints) return;
      const wps = [...editingRoute.waypoints];
      if (direction === 'up' && index > 0) {
          [wps[index], wps[index-1]] = [wps[index-1], wps[index]];
      } else if (direction === 'down' && index < wps.length - 1) {
           [wps[index], wps[index+1]] = [wps[index+1], wps[index]];
      }
      setEditingRoute({ ...editingRoute, waypoints: wps });
  };

  const renderItem = (fav: FavoriteLocation) => {
    const isRoute = fav.type === 'route';
    const isVisible = isRoute 
      ? activeRouteId === fav.id 
      : visibleFavoriteIds.includes(fav.id);
    
    return (
      <div key={fav.id} className={`flex items-center gap-3 p-3 mb-2 ${theme.item} ${isVisible ? theme.itemActive : ''}`}>
        <div className={`shrink-0 ${theme.icon}`}>
           {isRoute ? <RouteIcon size={18} /> : <MapPin size={18} />}
        </div>
        
        <div className="flex-1 min-w-0 cursor-pointer group" onClick={() => onFlyTo(fav)}>
            <p className={`truncate text-sm ${isVisible ? theme.textActive : theme.text} group-hover:underline decoration-1 underline-offset-2`}>
                {fav.name}
            </p>
            {isRoute && fav.waypoints && (
                <p className="text-[10px] opacity-60 truncate">
                    {fav.waypoints.length} waypoints • {fav.waypoints[0]?.name}
                </p>
            )}
            {!isRoute && (
                <p className="text-[10px] opacity-60 truncate">
                    {fav.lat.toFixed(2)}, {fav.lng.toFixed(2)}
                </p>
            )}
        </div>

        <div className="flex items-center gap-1">
             <button 
               onClick={(e) => { e.stopPropagation(); onToggleVisibility(fav); }}
               className={theme.actionBtn}
               title={isVisible ? "Hide from globe" : "Show on globe"}
             >
                {isVisible ? <Eye size={16} className={skin === 'modern' ? 'text-cyan-400' : ''} /> : <EyeOff size={16} />}
             </button>
             
             {isRoute && (
                <button
                    onClick={(e) => { e.stopPropagation(); handleEditClick(fav); }}
                    className={theme.actionBtn}
                    title="Edit Route"
                >
                    <Edit size={16} />
                </button>
             )}

             <button 
               onClick={(e) => { e.stopPropagation(); onFlyTo(fav); }}
               className={`${theme.actionBtn} md:hidden`} // Show fly-to explicitly on mobile
             >
                <Navigation size={16} />
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); onDelete(fav.id); }}
               className={theme.deleteBtn}
               title="Remove favorite"
             >
                <Trash2 size={16} />
             </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`absolute top-[106px] left-8 z-30 w-72 md:w-80 max-h-[calc(100vh-170px)] flex flex-col animate-in slide-in-from-left-8 fade-in duration-300 transition-opacity duration-300 ${dimmed ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
          <div className={`${theme.container} flex flex-col shrink min-h-0 overflow-hidden`}>
              <div className={`p-4 flex items-center justify-between shrink-0 ${theme.header}`}>
                  <h2 className={`text-lg font-bold ${theme.headerTitle}`}>SAVED LOCATIONS</h2>
                  <button onClick={onClose} className={theme.closeBtn}>
                      <X size={18} />
                  </button>
              </div>

              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                  {favorites.length === 0 ? (
                      <div className={`text-center py-8 ${theme.emptyState}`}>
                          <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No saved locations yet.</p>
                          <p className="text-xs opacity-60 mt-1">Star locations or trace routes to save them here.</p>
                      </div>
                  ) : (
                      <>
                          {routeFavs.length > 0 && (
                              <div className="mb-6">
                                  <h3 className={`text-xs font-bold uppercase mb-2 opacity-70 ${theme.text}`}>Routes</h3>
                                  {routeFavs.map(renderItem)}
                              </div>
                          )}
                          
                          {locationFavs.length > 0 && (
                              <div>
                                  <h3 className={`text-xs font-bold uppercase mb-2 opacity-70 ${theme.text}`}>Points of Interest</h3>
                                  {locationFavs.map(renderItem)}
                              </div>
                          )}
                      </>
                  )}
              </div>
              
              <div className={`p-3 text-[10px] opacity-50 text-center border-t ${isRetro ? 'border-current' : 'border-white/10'}`}>
                  {activeRouteId ? "Route Active" : "No Active Route"} • {visibleFavoriteIds.length} POIs Visible
              </div>
          </div>
      </div>

      {/* Route Editor Modal */}
      {editingRoute && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col ${theme.modal}`}>
               <div className={`p-4 flex items-center justify-between border-b ${isRetro ? 'border-current' : 'border-white/10'}`}>
                   <h3 className={`text-xl font-bold uppercase ${theme.headerTitle}`}>Edit Route</h3>
                   <button onClick={() => setEditingRoute(null)} className={theme.closeBtn}><X size={20} /></button>
               </div>
               
               <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                   <div className="mb-6">
                       <label className={`block text-xs uppercase font-bold mb-2 opacity-70 ${theme.text}`}>Route Name</label>
                       <input 
                          type="text" 
                          value={editingRoute.name} 
                          onChange={(e) => setEditingRoute({ ...editingRoute, name: e.target.value })}
                          className={`w-full ${theme.input} text-lg font-bold`}
                       />
                   </div>

                   <div className="flex items-center justify-between mb-2">
                       <label className={`block text-xs uppercase font-bold opacity-70 ${theme.text}`}>Waypoints ({editingRoute.waypoints?.length || 0})</label>
                       <button onClick={addWaypoint} className={`flex items-center gap-1 text-xs px-2 py-1 ${theme.actionBtn} bg-white/5`}>
                           <Plus size={14} /> Add Location
                       </button>
                   </div>
                   
                   <div className="space-y-3">
                       {editingRoute.waypoints?.map((wp, idx) => (
                           <div key={idx} className={`p-3 flex gap-3 items-start ${isRetro ? 'border border-current' : 'bg-white/5 rounded-lg border border-white/5'}`}>
                               <div className="flex flex-col gap-1 pt-1">
                                   <button onClick={() => moveWaypoint(idx, 'up')} disabled={idx === 0} className="disabled:opacity-20 hover:text-cyan-400">
                                       <ChevronUp size={16} />
                                   </button>
                                   <div className="text-center text-xs font-mono opacity-50">{idx + 1}</div>
                                   <button onClick={() => moveWaypoint(idx, 'down')} disabled={idx === (editingRoute.waypoints?.length || 0) - 1} className="disabled:opacity-20 hover:text-cyan-400">
                                       <ChevronDown size={16} />
                                   </button>
                               </div>
                               
                               <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                   <div>
                                       <label className="text-[10px] uppercase opacity-50 block mb-1">Name</label>
                                       <input 
                                           type="text" 
                                           value={wp.name} 
                                           onChange={(e) => updateWaypoint(idx, 'name', e.target.value)}
                                           className={`w-full ${theme.input}`}
                                       />
                                   </div>
                                   <div>
                                       <label className="text-[10px] uppercase opacity-50 block mb-1">Context / Description</label>
                                       <input 
                                           type="text" 
                                           value={wp.context || ""} 
                                           onChange={(e) => updateWaypoint(idx, 'context', e.target.value)}
                                           className={`w-full ${theme.input}`}
                                       />
                                   </div>
                                   <div className="flex gap-2">
                                       <div className="flex-1">
                                           <label className="text-[10px] uppercase opacity-50 block mb-1">Lat</label>
                                           <input 
                                               type="number" 
                                               value={wp.lat} 
                                               onChange={(e) => updateWaypoint(idx, 'lat', parseFloat(e.target.value))}
                                               className={`w-full ${theme.input}`}
                                               step="0.0001"
                                           />
                                       </div>
                                       <div className="flex-1">
                                           <label className="text-[10px] uppercase opacity-50 block mb-1">Lng</label>
                                           <input 
                                               type="number" 
                                               value={wp.lng} 
                                               onChange={(e) => updateWaypoint(idx, 'lng', parseFloat(e.target.value))}
                                               className={`w-full ${theme.input}`}
                                               step="0.0001"
                                           />
                                       </div>
                                   </div>
                               </div>

                               <button onClick={() => removeWaypoint(idx)} className={`self-start mt-6 ${theme.deleteBtn}`}>
                                   <Trash2 size={16} />
                               </button>
                           </div>
                       ))}
                       
                       {(!editingRoute.waypoints || editingRoute.waypoints.length === 0) && (
                           <div className="text-center py-8 opacity-50 border border-dashed border-white/20">
                               No locations in this route. Add one to get started.
                           </div>
                       )}
                   </div>
               </div>

               <div className={`p-4 border-t flex justify-end gap-3 ${isRetro ? 'border-current' : 'border-white/10 bg-white/5'}`}>
                   <button onClick={() => setEditingRoute(null)} className="px-4 py-2 text-sm opacity-70 hover:opacity-100">Cancel</button>
                   <button 
                       onClick={saveEditedRoute} 
                       className={`px-6 py-2 font-bold uppercase flex items-center gap-2 ${isRetro ? 'bg-green-400 text-black hover:opacity-90' : 'bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-lg shadow-cyan-900/50'}`}
                   >
                       <Save size={16} /> Save Changes
                   </button>
               </div>
            </div>
         </div>
      )}
    </>
  );
};

export default FavoritesPanel;
