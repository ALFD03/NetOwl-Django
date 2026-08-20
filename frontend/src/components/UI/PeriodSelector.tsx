import React from 'react';
import { formatPeriodoLabel } from '@/utils/formatters';

interface Props {
  label?: string;
  icon?: React.ReactNode;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  className?: string;
}

export const PeriodSelector: React.FC<Props> = ({ label = 'Mes', icon, value, options, onChange, className = '' }) => {
  return (
    <div className={`flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
        {icon}
        <span className="text-[10px] uppercase font-black tracking-wider">{label}</span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white cursor-pointer outline-none hover:bg-white/5">
        {options.map((p) => (
          <option key={p} value={p} className="bg-[#0f1a36]">{formatPeriodoLabel(p)}</option>
        ))}
      </select>
    </div>
  );
};

export default PeriodSelector;
