import React from 'react';
import { NeonContainer, NeonTheme } from './NeonContainer';

interface Props {
  title: string;
  icon?: React.ReactNode;
  stats?: Record<string, any>;
  theme?: NeonTheme;
  className?: string;
}

const f0 = (val: any) => {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return Math.floor(num).toLocaleString('en-US');
};

export const StatGroup: React.FC<Props> = ({ title, icon, stats = {}, theme = 'blue', className = '' }) => {
  return (
    <NeonContainer theme={theme} title={title} icon={icon as any} className={`h-full ${className}`}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
        {Object.entries(stats || {}).length > 0 ? (
          Object.entries(stats).map(([label, val]: any) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-800/60 last:border-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase truncate pr-4" title={label}>{label}</span>
              <span className="text-xs font-black text-white font-mono">{f0(val)}</span>
            </div>
          ))
        ) : (
          <div className="text-[10px] text-slate-600 italic py-6 text-center">Sin registros</div>
        )}
      </div>
    </NeonContainer>
  );
};

export default StatGroup;
