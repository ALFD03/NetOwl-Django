/** Filtros de los reportes comerciales: periodo, tecnología, sucursal, métrica y búsqueda. */

import { Calendar, Filter, Search, Wifi } from 'lucide-react';
import {
  FilterField, FILTER_TRIGGER_CLASS, PeriodSelector, SearchInput, SelectMenu,
} from '@/shared/ui';
import type { FiltroMetrica, NivelFiltro } from '../../lib/filtroMetrica';
import { FiltroMetricaField } from './FiltroMetricaField';

type Technology = 'ALL' | 'FTTH' | 'RF';

interface Props {
  period: string;
  periods: string[];
  onPeriodChange: (period: string) => void;
  selectedTech: Technology;
  onTechChange: (technology: Technology) => void;
  selectedBranch: string;
  branches: string[];
  onBranchChange: (branch: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filtroMetrica: FiltroMetrica;
  onFiltroMetricaChange: (filtro: FiltroMetrica) => void;
  /** Cómo se llaman en este reporte los dos niveles a los que se aplica el filtro por métrica. */
  nivelesFiltro: Record<NivelFiltro, string>;
  /** Hay un día de corte: sin él no se puede filtrar por proyección. */
  proyeccionDisponible: boolean;
}

/**
 * La fila de filtros de Ventas y Unidades de Negocio.
 *
 * Es donde se fijó la forma que siguen los filtros de toda la aplicación: cada
 * uno es una `FilterField` —cabecera etiquetada con su icono, y pegado el
 * control—. La cápsula estaba copiada aquí tres veces; ahora es el componente
 * compartido, y esta pantalla lo consume como cualquier otra.
 */
export function SubscriptionReportFilters({
  period,
  periods,
  onPeriodChange,
  selectedTech,
  onTechChange,
  selectedBranch,
  branches,
  onBranchChange,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  filtroMetrica,
  onFiltroMetricaChange,
  nivelesFiltro,
  proyeccionDisponible,
}: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <PeriodSelector
        label="Mes"
        icon={<Calendar className="w-4 h-4 text-brand" />}
        value={period}
        options={periods}
        onChange={onPeriodChange}
      />

      <FilterField label="Servicio" icon={<Wifi className="w-4 h-4 text-brand" />}>
        <SelectMenu
          aria-label="Servicio"
          value={selectedTech}
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'FTTH', label: 'FTTH (Fibra)' },
            { value: 'RF', label: 'RF (Radio)' },
          ]}
          onChange={(v) => onTechChange(v as Technology)}
          panelWidth={180}
          className={FILTER_TRIGGER_CLASS}
        />
      </FilterField>

      <FilterField label="Sucursal" icon={<Filter className="w-4 h-4 text-emerald-500" />}>
        <SelectMenu
          aria-label="Sucursal"
          value={selectedBranch}
          options={[
            { value: 'ALL', label: 'Todas' },
            ...branches.map((branch) => ({ value: branch, label: branch })),
          ]}
          onChange={onBranchChange}
          panelWidth={200}
          className={FILTER_TRIGGER_CLASS}
        />
      </FilterField>

      <FiltroMetricaField
        filtro={filtroMetrica}
        onChange={onFiltroMetricaChange}
        niveles={nivelesFiltro}
        proyeccionDisponible={proyeccionDisponible}
      />

      <FilterField grow icon={<Search className="w-4 h-4" />}>
        <SearchInput
          value={searchTerm}
          placeholder={searchPlaceholder}
          onChange={onSearchChange}
          className="w-full bg-transparent px-0"
        />
      </FilterField>
    </div>
  );
}
