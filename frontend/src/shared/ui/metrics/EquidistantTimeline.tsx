import React from 'react';
import { NeonContainer } from '../surfaces/NeonContainer';
import { MiniExceedRing } from './MiniExceedRing';
import type { NeonTheme } from '../theme/types';

interface Props {
  title: string;
  icon?: React.ReactNode;
  theme?: NeonTheme;
  /** Omit when the source only stores quartiles — the node is then dropped. */
  min?: number;
  p25: number;
  mediana: number;
  promedio: number;
  p75: number;
  /** Omit when the source only stores quartiles — the node is then dropped. */
  max?: number;
  std: number;
  pctExcedeProm: number;
}

export function EquidistantTimeline({
  title,
  icon,
  theme = 'green',
  min,
  p25,
  mediana,
  promedio,
  p75,
  max,
  std,
  pctExcedeProm,
}: Props) {
  const isGreen = theme === 'green';

  const nodes = [
    ...(min != null ? [{ key: 'min', label: 'Min', val: min, textCol: 'text-slate-400', dotBg: 'bg-slate-500' }] : []),
    { key: 'p25', label: 'P25', val: p25, textCol: 'text-sky-400', dotBg: 'bg-sky-400' },
    { key: 'med', label: 'Mediana', val: mediana, textCol: 'text-amber-400', dotBg: 'bg-amber-400 ring-4 ring-amber-400/20' },
    { key: 'prom', label: 'Promedio', val: promedio, textCol: isGreen ? 'text-emerald-400' : 'text-rose-400', dotBg: isGreen ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-rose-400 ring-4 ring-rose-400/20' },
    { key: 'std_plus', label: '+1σ', val: Number((promedio + std).toFixed(1)), textCol: 'text-purple-400', dotBg: 'bg-purple-400' },
    { key: 'p75', label: 'P75', val: p75, textCol: 'text-sky-400', dotBg: 'bg-sky-400' },
    ...(max != null ? [{ key: 'max', label: 'Max', val: max, textCol: 'text-slate-400', dotBg: 'bg-slate-500' }] : []),
  ];

  return (
    <NeonContainer
      theme={theme}
      title={title}
      subtitle={`Desviación Estándar (σ): ${std} h`}
      icon={icon}
      headerAction={(
        <MiniExceedRing label="Excede Prom" pct={pctExcedeProm} color="#38bdf8" />
      )}
    >
      <div className="py-4 px-2 h-full">
        <div className="relative flex items-center justify-between h-full">
          <div className="absolute left-3 right-3 h-1.5 bg-slate-800 rounded-full z-0" />
          {nodes.map((node) => (
            <div key={node.key} className="relative z-10 flex flex-col items-center">
              <span className={`text-[10px] font-black uppercase tracking-tight mb-2 ${node.textCol}`}>{node.label}</span>
              <div className={`w-3.5 h-3.5 rounded-full border-2 border-surface-primary transition-transform hover:scale-125 ${node.dotBg}`} />
              <span className="text-xs font-black text-white font-mono mt-2">{node.val}<span className="text-[9px] text-slate-500 font-normal ml-0.5">h</span></span>
            </div>
          ))}
        </div>
      </div>
    </NeonContainer>
  );
}
