import React from 'react';
import { Line } from 'react-chartjs-2';
import { Maximize2, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  title: string;
  currentVal: number | string;
  rateKey: string;
  countKey: string;
  unitLabel: string;
  color: string;
  bgColor: string;
  theme?: string;
  historico: any[];
  onSelect?: (payload: any) => void;
}

export const SparklineCard: React.FC<Props> = ({
  title,
  currentVal,
  rateKey,
  countKey,
  unitLabel,
  color,
  bgColor,
  theme,
  historico = [],
  onSelect,
}) => {
  const labels = historico.map((h: any) => h.periodo_reporte);
  const values = historico.map((h: any) => Number(h[rateKey]) || 0);

  const firstVal = values[0] || 0;
  const lastVal = values[values.length - 1] || 0;
  const diff = Number((lastVal - firstVal).toFixed(1));
  const isUp = diff >= 0;

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        borderColor: color,
        backgroundColor: bgColor,
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        tension: 0.4,
      },
    ],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, datalabels: { display: false } },
    scales: { x: { display: false }, y: { display: false, min: 0, max: Math.max(...values, 10) * 1.15 } },
  };

  return (
    <div
      onClick={() => onSelect?.({ title, rateKey, countKey, unitLabel, color, bgColor, theme })}
      className="bg-[#0b1326] border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-inner group hover:border-brand/60 hover:bg-white/[0.02] cursor-pointer transition-all relative overflow-hidden"
    >
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand" />
      </div>

      <div className="flex items-center justify-between mb-1 pr-4">
        <span className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</span>
        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {diff > 0 ? `+${diff}%` : `${diff}%`}
        </span>
      </div>

      <div className="my-1">
        <span className="text-3xl font-black tracking-tight" style={{ color }}>{currentVal}%</span>
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block -mt-0.5">Promedio Global</span>
      </div>

      <div className="h-14 w-full mt-2">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default SparklineCard;
