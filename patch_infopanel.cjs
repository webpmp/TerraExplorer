const fs = require('fs');

let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// 1. Add import
content = content.replace("import { LocationInfo", "import { ENTITY_SCHEMAS } from '../entitySchema';\nimport { LocationInfo");

// 2. Add schema parsing and SECTION_RENDERERS inside the component
const renderersCode = `
  const schema = ENTITY_SCHEMAS[info?.entityType || 'city'] || ENTITY_SCHEMAS['city'];

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    overview: () => (
      <div className="space-y-5">
          {info.routeContext && (
              <div className="mb-2">
                   <h3 className={\`text-sm font-bold uppercase tracking-widest mb-1 \${isRetro ? 'text-current' : isParchment ? 'text-[#8b5a2b]' : 'text-cyan-400'}\`}>
                      {info.routeContext.title}
                  </h3>
                  <p className={\`leading-relaxed \${bodySize} font-medium \${theme.bodyText} mb-4 border-b \${isRetro ? 'border-current/30' : isParchment ? 'border-[#8b5a2b]/30' : 'border-white/10'} pb-4\`}>
                      {info.routeContext.text}
                  </p>
              </div>
          )}
          <div className="relative group/desc">
            <p className={\`leading-relaxed \${bodySize} font-medium \${theme.bodyText} pr-8\`}>
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
        <div className={\`p-3 \${theme.card}\`}>
            <div className="flex items-center gap-2 mb-1 text-current opacity-80">
                <Crown size={16} />
                <span className={\`\${smallTextSize} font-bold uppercase\`}>Historical Period</span>
            </div>
            <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold\`}>{info.historicalPeriod}</p>
        </div>
      ) : null
    ),
    keyFigures: () => (
      info.entities && info.entities.length > 0 ? (
        <div className="relative group/facts">
          <div className={\`flex items-center justify-between mb-2 \${theme.icon}\`}>
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span className={\`\${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase\`}>Key Entities</span>
              </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.entities.map((e: string, i: number) => (
               <span key={i} className={\`px-2 py-1 text-xs rounded-full border \${isRetro ? 'border-current text-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c] text-[#3e2723]' : 'border-cyan-500/30 bg-cyan-900/30 text-cyan-300'}\`}>{e}</span>
            ))}
          </div>
        </div>
      ) : null
    ),
    importantEvents: () => (
      info.highlights && info.highlights.length > 0 ? (
        <div className="relative group/facts">
          <div className={\`flex items-center justify-between mb-2 \${theme.icon}\`}>
              <div className="flex items-center gap-2">
                <Info size={16} />
                <span className={\`\${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase\`}>Highlights</span>
              </div>
          </div>
          <ul className="space-y-2">
              {info.highlights.map((fact: any, idx: number) => (
              <li key={idx} className={\`flex gap-3 \${bodySize} \${theme.bodyText}\`}>
                  <span className={\`block w-1.5 h-1.5 mt-2 flex-shrink-0 \${theme.listDot}\`} />
                  {fact}
              </li>
              ))}
          </ul>
        </div>
      ) : null
    ),
    modernContext: () => (
      (isValidData(info.population) || isValidData(info.climate) || wikiImage) ? (
        <div className={\`grid \${((isValidData(info.population) || wikiImage) && isValidData(info.climate)) ? 'grid-cols-2' : 'grid-cols-1'} gap-3\`}>
          {isValidData(info.population) ? (
            <div className={\`p-3 \${theme.card}\`}>
                <div className={\`flex items-center justify-between mb-1\`}>
                  <div className={\`flex items-center gap-2 \${theme.icon}\`}>
                      <Users size={16} />
                      <span className={\`\${smallTextSize} font-bold uppercase\`}>Population</span>
                  </div>
                </div>
                <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono\`}>{info.population}</p>
            </div>
          ) : wikiImage ? (
            <div 
              className={\`p-0 overflow-hidden relative h-28 \${theme.card} group cursor-pointer\`}
              onClick={() => setExpandedImage(true)}
            >
               <img src={wikiImage} alt={info.name} className={\`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 \${isRetro ? 'grayscale contrast-125' : ''}\`} />
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex items-center gap-1">
                  <ImageIcon size={12} className="text-white/80" />
               </div>
            </div>
          ) : null}

          {isValidData(info.climate) && (
            <div className={\`p-3 \${theme.card}\`}>
                <div className={\`flex items-center justify-between mb-1\`}>
                  <div className={\`flex items-center gap-2 \${theme.icon}\`}>
                      <Thermometer size={16} />
                      <span className={\`\${smallTextSize} font-bold uppercase\`}>Climate</span>
                  </div>
                </div>
                <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold\`}>{info.climate}</p>
            </div>
          )}
        </div>
      ) : null
    ),
    notableFigures: () => (
      <div className="space-y-4">
          <div className={\`flex items-center gap-2 mb-2 \${theme.icon}\`}>
              <Crown size={16} />
              <span className={\`\${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase\`}>Notable Figures</span>
          </div>
          {info.notable && info.notable.length > 0 ? (
          info.notable.map((item: any, idx: number) => {
              if (typeof item === 'string') {
                  return (
                      <div key={idx} className={\`p-3 \${theme.card} flex items-start gap-3\`}>
                          <span className={\`block w-1.5 h-1.5 mt-2 flex-shrink-0 \${theme.listDot}\`} />
                          <span className={\`\${bodySize} \${theme.bodyText}\`}>{item}</span>
                      </div>
                  );
              }
              if (item && typeof item === 'object' && item.name) {
                  return <NotablePersonCard key={idx} item={item} theme={theme} skin={skin} bodySize={bodySize} subtextSize={subtextSize} />;
              }
              return null;
          })
          ) : (
          <p className={\`\${bodySize} italic \${theme.bodyText}\`}>No notable figures found for {info.name}.</p>
          )}
      </div>
    ),
    liveNews: () => (
      <div className="space-y-4">
        <div className={\`flex items-center gap-2 mb-2 \${theme.icon}\`}>
            <Newspaper size={16} />
            <span className={\`\${isRetro ? 'text-sm' : 'text-xs'} font-bold uppercase\`}>Live News</span>
        </div>
        {isNewsFetching && !isMoreNewsLoading && info.news.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-8 opacity-50 animate-pulse">
              <Loader2 size={24} className="animate-spin mb-2 text-current" />
              <p className={smallTextSize}>Updating news...</p>
           </div>
        ) : info.news && info.news.length > 0 ? (
           <>
             {info.news.map((item: any, idx: number) => (
                <div key={idx} className={\`p-4 \${theme.card} flex flex-col gap-2 group/news\`}>
                   <div className="flex justify-between items-start gap-2">
                     <span className={\`text-[10px] uppercase tracking-wider opacity-70 \${theme.subtext}\`}>{item.source}</span>
                     <a href={item.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/news:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded">
                        <ExternalLink size={14} className={theme.icon} />
                     </a>
                   </div>
                   <a href={item.url} target="_blank" rel="noopener noreferrer" className={\`\${bodySize} font-bold leading-tight \${theme.headerTitle} hover:underline decoration-1 underline-offset-2\`}>
                     {item.headline}
                   </a>
                   {item.summary && (
                      <p className={\`\${subtextSize} \${theme.bodyText} opacity-90 leading-relaxed\`}>
                        {item.summary}
                      </p>
                   )}
                </div>
             ))}
             <button 
               onClick={handleLoadMore} 
               disabled={isMoreNewsLoading}
               className={\`w-full py-3 mt-2 transition-colors \${theme.loadMoreBtn}\`}
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
                   <p className={\`\${smallTextSize} mt-2\`}>This waypoint represents a historical location and is not eligible for live news retrieval.</p>
                 </>
              ) : (
                 <p className={theme.bodyText}>No recent transmissions found.</p>
              )}
           </div>
        )}
      </div>
    )
  };
`;
content = content.replace("  if (!info) return null;", renderersCode + "\n\n  if (!info) return null;");

// 3. Replace the Tabs and content body
const tabsStart = content.indexOf('{/* Tabs */}');
const myNotesStart = content.indexOf('{/* My Notes Section */}');

if (tabsStart > -1 && myNotesStart > -1) {
    const scrollableContent = `
          {/* Scrollable Content */}
          <div className="p-5 overflow-y-auto custom-scrollbar flex-1 relative">
            {showContentSkeleton ? (
               <div className="space-y-6 animate-pulse mt-2">
                 <div className="space-y-3">
                    <div className={\`h-4 w-full \${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded\`}></div>
                    <div className={\`h-4 w-[90%] \${isRetro ? 'bg-current opacity-30' : isParchment ? 'bg-[#8b5a2b]/20' : 'bg-white/10'} rounded\`}></div>
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
        
        `;
    content = content.substring(0, tabsStart) + scrollableContent + content.substring(myNotesStart);
}

fs.writeFileSync('components/InfoPanel.tsx', content, 'utf-8');
console.log("Patched InfoPanel.tsx");
