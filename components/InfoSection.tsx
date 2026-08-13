import React from 'react';

interface InfoSectionProps {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  skin: 'modern' | 'retro-green' | 'retro-amber' | 'parchment';
}

export const InfoSection: React.FC<InfoSectionProps> = ({ title, icon, subtitle, children, skin }) => {
  const isRetro = skin.startsWith('retro');
  const isParchment = skin === 'parchment';
  
  const theme = {
    card: isRetro ? 'border-current' : isParchment ? 'border-[#8b5a2b] bg-[#d2b48c]/30' : 'border-white/10 bg-black/40',
    icon: isRetro ? 'text-current' : isParchment ? 'text-[#8b5a2b]' : 'text-cyan-400',
    subtext: isRetro ? 'text-current opacity-70' : isParchment ? 'text-[#3e2723]/70' : 'text-white/50'
  };

  const titleSize = isRetro ? 'text-sm' : 'text-xs';

  return (
    <div className={`p-4 rounded-lg border mb-4 ${theme.card}`}>
      <div className={`flex items-center gap-2 mb-3 ${theme.icon}`}>
        {icon}
        <span className={`${titleSize} font-bold uppercase tracking-widest`}>{title}</span>
      </div>
      
      {subtitle && (
        <div className={`mb-3 text-[10px] uppercase tracking-wider ${theme.subtext}`}>
          {subtitle}
        </div>
      )}
      
      <div>
        {children}
      </div>
    </div>
  );
};
