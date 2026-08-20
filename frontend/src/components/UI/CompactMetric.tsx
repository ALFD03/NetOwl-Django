import React from 'react';

interface Props {
  label: string;
  value: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
}

export const CompactMetric: React.FC<Props> = ({ label, value, color = 'blue' }) => {
  const colors: Record<string, string> = {
    blue: 'text-sky-400 bg-sky-950/40 border-sky-500/30',
    green: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
    red: 'text-rose-400 bg-rose-950/40 border-rose-500/30',
    yellow: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
    purple: 'text-purple-400 bg-purple-950/40 border-purple-500/30',
    slate: 'text-slate-300 bg-slate-900/60 border-slate-700/50',
  };

  return (
    <div className={`p-2.5 rounded-2xl border ${colors[color]} flex flex-col justify-between`}>
      <p className="text-[9px] uppercase font-black opacity-80 mb-1 leading-none">{label}</p>
      <p className="text-sm font-black tracking-tight leading-none font-mono">{value}</p>
    </div>
  );
};

export default CompactMetric;
