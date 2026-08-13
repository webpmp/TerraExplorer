const fs = require('fs');

let content = fs.readFileSync('components/InfoPanel.tsx', 'utf-8');

// 1. Fix line 788 TS error
content = content.replace(
  'const showContentSkeleton = isLoading && (!info?.metadata?.description?.text || info.metadata.description.text === "");',
  'const showContentSkeleton = isLoading && (!entity?.metadata?.description?.text || entity.metadata.description.text === "");'
);

// 2. Fix info.subject (line 771)
content = content.replace(
  "info.subject.identity.entityType === 'historical_region'",
  "entity.subject.identity.entityType === 'historical_region'"
);
content = content.replace(
  "info.subject.identity.entityType === 'route'",
  "entity.subject.identity.entityType === 'route'"
);

// 3. Fix population
const oldPopulation = `          {info.population ? (
            <div className={\`flex flex-col gap-2 p-3 rounded-lg \${skin === 'modern' ? 'bg-black/20' : 'bg-[#e8dec0] border border-[#d4c39c] shadow-inner'} transition-colors\`}>
              <div className="flex items-center gap-2 mb-1">
                <Users size={isRetro ? 20 : 16} className={\`\${isRetro ? 'opacity-100' : 'opacity-70'} text-[var(--accent)]\`} />
                <h4 className={\`\${isRetro ? 'text-lg font-bold' : 'text-xs uppercase tracking-wider font-semibold opacity-80'}\`}>Population</h4>
              </div>
              <div className="flex flex-col gap-3">
                {info.population.historical && (
                  <div>
                    <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono\`}>{info.population.historical.formattedValue}</p>
                    {info.population.historical.timeframe && info.population.historical.timeframe !== "Unknown" && (
                      <p className="text-xs opacity-70 font-mono mt-0.5">{info.population.historical.timeframe}</p>
                    )}
                  </div>
                )}
                {info.population.current && (
                  <div className={\`\${info.population.historical ? 'border-t border-white/10 pt-2 mt-1' : ''}\`}>
                    <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono\`}>{info.population.current.formattedValue}</p>
                    <p className="text-xs opacity-70 font-mono mt-0.5">Modern Estimate</p>
                  </div>
                )}
              </div>
            </div>
          ) : (null)}`;

const newPopulation = `          {info.population && info.population.value ? (
            <div className={\`flex flex-col gap-2 p-3 rounded-lg \${skin === 'modern' ? 'bg-black/20' : 'bg-[#e8dec0] border border-[#d4c39c] shadow-inner'} transition-colors\`}>
              <div className="flex items-center gap-2 mb-1">
                <Users size={isRetro ? 20 : 16} className={\`\${isRetro ? 'opacity-100' : 'opacity-70'} text-[var(--accent)]\`} />
                <h4 className={\`\${isRetro ? 'text-lg font-bold' : 'text-xs uppercase tracking-wider font-semibold opacity-80'}\`}>Population</h4>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold font-mono\`}>{info.population.value.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ) : (null)}`;

content = content.replace(oldPopulation, newPopulation);

// 4. Fix climate
const oldClimate = `          {info.climate && (
            <div className={\`flex flex-col gap-2 p-3 rounded-lg \${skin === 'modern' ? 'bg-black/20' : 'bg-[#e8dec0] border border-[#d4c39c] shadow-inner'} transition-colors\`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <CloudRain size={isRetro ? 20 : 16} className={\`\${isRetro ? 'opacity-100' : 'opacity-70'} text-[var(--accent)]\`} />
                  <h4 className={\`\${isRetro ? 'text-lg font-bold' : 'text-xs uppercase tracking-wider font-semibold opacity-80'}\`}>Climate</h4>
                </div>
              </div>
              <div>
                <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold\`}>{info.climate.name}</p>
                {info.climate.koppenCode && (
                   <p className="text-xs opacity-70 font-mono mt-0.5">Köppen: {info.climate.koppenCode}</p>
                )}
              </div>
            </div>
          )}`;

const newClimate = `          {info.climate && (
            <div className={\`flex flex-col gap-2 p-3 rounded-lg \${skin === 'modern' ? 'bg-black/20' : 'bg-[#e8dec0] border border-[#d4c39c] shadow-inner'} transition-colors\`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <CloudRain size={isRetro ? 20 : 16} className={\`\${isRetro ? 'opacity-100' : 'opacity-70'} text-[var(--accent)]\`} />
                  <h4 className={\`\${isRetro ? 'text-lg font-bold' : 'text-xs uppercase tracking-wider font-semibold opacity-80'}\`}>Climate</h4>
                </div>
              </div>
              <div>
                <p className={\`\${isRetro ? 'text-base' : 'text-sm'} font-bold\`}>{info.climate.value}</p>
                <p className="text-xs opacity-70 mt-1 leading-relaxed">{info.climate.description}</p>
              </div>
            </div>
          )}`;

content = content.replace(oldClimate, newClimate);

// 5. Fix isCoreLoading
content = content.replace(/isCoreLoading/g, 'isLoading');

fs.writeFileSync('components/InfoPanel.tsx', content);
