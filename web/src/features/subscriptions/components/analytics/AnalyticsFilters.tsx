/** Filtros de Analytics: periodo y dimensión. Ambos se resuelven en cliente. */

import { Calendar } from 'lucide-react';
import { DIMENSION_LABELS } from '@/shared/constants/labels';
import { PeriodSelector } from '@/shared/ui';

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
      {/* Reimplementaba a mano lo que ya hace PeriodSelector. */}
      <PeriodSelector
        label="Periodo"
        icon={<Calendar className="h-4 w-4 text-brand" />}
        value={selectedPeriod}
        options={periods}
        onChange={onPeriodChange}
      />

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
