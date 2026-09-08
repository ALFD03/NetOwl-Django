import type { FC } from 'react';

interface MiniExceedRingProps {
  label: string;
  pct: number;
  color: string;
}

export const MiniExceedRing: FC<MiniExceedRingProps> = ({ label, pct, color }) => {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;

  return (
    <div className="flex items-center gap-2.5 bg-surface-primary border border-slate-800 px-3 py-1.5 rounded-2xl shadow-inner">
      <div className="w-6 h-6 relative flex items-center justify-center flex-shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r={radius} className="stroke-slate-800" strokeWidth="2.5" fill="transparent" />
          <circle
            cx="12"
            cy="12"
            r={radius}
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
      </div>
      <div>
        <span className="text-[9px] font-bold text-slate-400 uppercase block leading-none">{label}</span>
        <span className="text-xs font-black font-mono mt-0.5 block leading-none" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
};
