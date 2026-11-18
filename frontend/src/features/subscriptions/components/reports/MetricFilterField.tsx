/** El filtro por métrica de los reportes comerciales: métrica, operador, valor y nivel. */

import { SlidersHorizontal, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { FilterField, SelectMenu } from '@/shared/ui';
import {
  EMPTY_METRIC_FILTER,
  FILTER_METRICS,
  FILTER_OPERATORS,
  FILTER_VALUE_PATTERN,
  type MetricFilter,
  type FilterMetric,
  type FilterLevel,
  type FilterOperator,
} from '../../lib/metricFilter';

/** Los selectores van pegados dentro de la cápsula, separados por una línea. */
const SELECTOR_CLASS =
  'flex min-w-0 cursor-pointer items-center justify-between gap-2 border-r border-slate-700/50 py-2.5 pl-3 pr-2 text-xs font-bold text-white outline-none hover:bg-white/5';

interface Props {
  filtro: MetricFilter;
  onChange: (filtro: MetricFilter) => void;
  /** Cómo se llama cada nivel en este reporte: «Zonas» y «Sites», o «Zonas» y «Coordinadores». */
  niveles: Record<FilterLevel, string>;
  /** Hay un día de corte del que proyectar; sin él la proyección no filtra. */
  projectionAvailable: boolean;
}

/**
 * «Ver solo las zonas (o los sites, o los coordinadores) cuyo crecimiento,
 * churn o proyección cumpla X». La proyección es el cumplimiento de ventas
 * proyectado al cierre, en % del objetivo, y solo existe con un día elegido en
 * la barra: sin él el campo se deshabilita en vez de filtrar contra nada.
 */
export function MetricFilterField({ filtro, onChange, niveles, projectionAvailable: proyeccionDisponible }: Props) {
  const set = (change: Partial<MetricFilter>) => onChange({ ...filtro, ...change });
  const withoutProjection = filtro.metrica === 'proyeccion' && !proyeccionDisponible;

  return (
    <FilterField
      label="Métrica"
      icon={<SlidersHorizontal className="h-4 w-4 text-brand" />}
      title={withoutProjection
        ? 'La proyección necesita un día de corte: elige uno en la barra de días.'
        : 'Muestra solo lo que cumple la condición. Proyección = cumplimiento de ventas proyectado al cierre (% del objetivo).'}
    >
      <SelectMenu
        aria-label="Métrica a filtrar"
        value={filtro.metrica}
        options={FILTER_METRICS}
        onChange={(v) => set({ metrica: v as FilterMetric })}
        panelWidth={170}
        className={cn(SELECTOR_CLASS, 'flex-1 sm:min-w-[130px] sm:flex-none')}
      />
      <SelectMenu
        aria-label="Operador"
        value={filtro.operador}
        options={FILTER_OPERATORS.map((op) => ({ value: op, label: op }))}
        onChange={(v) => set({ operador: v as FilterOperator })}
        panelWidth={90}
        className={cn(SELECTOR_CLASS, 'w-16 shrink-0 font-mono')}
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label="Valor del filtro"
        value={filtro.value}
        disabled={withoutProjection}
        placeholder={withoutProjection ? 'Elige un día' : 'Valor %'}
        onChange={(event) => {
          if (FILTER_VALUE_PATTERN.test(event.target.value)) set({ value: event.target.value });
        }}
        className="w-20 min-w-0 shrink-0 border-r border-slate-700/50 bg-transparent px-3 py-2.5 text-xs font-bold text-white placeholder-slate-500 outline-none disabled:opacity-50 sm:w-24"
      />
      <SelectMenu
        aria-label="Aplicar el filtro a"
        value={filtro.level}
        options={[
          { value: 'zona', label: niveles.zona },
          { value: 'grupo', label: niveles.grupo },
        ]}
        onChange={(v) => set({ level: v as FilterLevel })}
        panelWidth={170}
        className={cn(SELECTOR_CLASS, 'flex-1 border-r-0 sm:min-w-[120px] sm:flex-none')}
      />
      {filtro.value && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_METRIC_FILTER)}
          title="Quitar el filtro por métrica"
          aria-label="Quitar el filtro por métrica"
          className="shrink-0 border-l border-slate-700/50 px-3 py-2.5 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </FilterField>
  );
}
