import { Calendar } from 'lucide-react';
import { DIMENSION_LABELS } from '@/shared/constants/labels';
import { formatPeriodoLabel } from '@/shared/utils';

export type DimensionKey = keyof typeof DIMENSION_LABELS;

interface Props {
  periods: string[];
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  selectedDimension: DimensionKey;
  onDimensionChange: (dimension: DimensionKey) => void;
}

export function AnalyticsFilters({
  periods,
  selectedPeriod,
  onPeriodChange,
  selectedDimension,
  onDimensionChange,
}: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-0 shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
          <Calendar className="w-4 h-4 text-brand" />
          <span className="text-[11px] uppercase font-bold tracking-wider">Periodo</span>
        </div>
        <select
          value={selectedPeriod}
          onChange={(event) => onPeriodChange(event.target.value)}
          className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-sm font-semibold text-white cursor-pointer outline-none hover:bg-white/5"
        >
          {periods.map((period) => (
            <option key={period} value={period} className="bg-surface-secondary text-white">
              {formatPeriodoLabel(period)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center p-1.5 shadow-2xl rounded-2xl border border-slate-700/50 bg-surface-secondary">
        <div className="px-3 text-[10px] uppercase font-black text-slate-500 border-r border-slate-800 mr-1">
          Gráficos por
        </div>
        <div className="flex gap-1">
          {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onDimensionChange(key as DimensionKey)}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                selectedDimension === key
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
