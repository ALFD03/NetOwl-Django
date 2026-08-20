import React from 'react';

interface Props {
  etapaName: string;
  pct: number;
  exitosos: number;
  fallidos: number;
  total: number;
}

export const MetricHealthCard: React.FC<Props> = ({ etapaName, pct, exitosos, fallidos, total }) => {
  const isGood = pct >= 80;
  const isMid = pct >= 60 && pct < 80;
  const pulseColor = isGood ? 'bg-emerald-400' : isMid ? 'bg-amber-400' : 'bg-rose-400';
  const textColor = isGood ? 'text-emerald-400' : isMid ? 'text-amber-400' : 'text-rose-400';

  const pctExito = total > 0 ? Math.round((exitosos / total) * 100) : 0;
  const pctFallo = total > 0 ? Math.round((fallidos / total) * 100) : 0;

  return (
    <div className="bg-[#0b1326] border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-inner relative overflow-hidden group hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black text-white uppercase tracking-wider truncate" title={etapaName}>
          {etapaName.replace('etapa_', '').replace('_', ' ')}
        </span>
        <span className="relative flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColor}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pulseColor}`} />
        </span>
      </div>

      <div className="my-1">
        <div className={`text-3xl font-black tracking-tight ${textColor}`}>{pct}%</div>
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block -mt-0.5">Tasa de Conversión</span>
      </div>

      <div className="space-y-2 pt-2.5 border-t border-slate-800/80">
        <div>
          <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
            <span>Exitosos ({exitosos})</span>
            <span className="text-emerald-400">{pctExito}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctExito}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
            <span>Caídas ({fallidos})</span>
            <span className="text-rose-400">{pctFallo}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pctFallo}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricHealthCard;
