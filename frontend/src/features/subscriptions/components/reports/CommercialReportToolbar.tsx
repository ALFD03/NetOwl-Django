/** La barra de los reportes comerciales: filtros, barra de días y nota de proyección. */

import { DayProgressBar } from '@/shared/ui';

import type { CommercialReportFilters } from '../../hooks/useCommercialReportFilters';
import type { FilterLevel } from '../../lib/metricFilter';
import { ProjectionNote } from './ProjectionNote';
import { SubscriptionReportFilters } from './SubscriptionReportFilters';

interface Props {
  filters: CommercialReportFilters;
  period: string;
  periods: string[];
  branches: string[];
  searchPlaceholder: string;
  /** Cómo se llaman, en este reporte, los dos niveles del filtro por métrica. */
  filterLevels: Record<FilterLevel, string>;
}

export function CommercialReportToolbar({
  filters: f,
  period,
  periods,
  branches,
  searchPlaceholder,
  filterLevels,
}: Props) {
  return (
    <>
      <SubscriptionReportFilters
        period={period}
        periods={periods}
        onPeriodChange={f.changePeriod}
        selectedTech={f.selectedTech}
        onTechChange={f.setSelectedTech}
        selectedBranch={f.selectedBranch}
        branches={branches}
        onBranchChange={f.setSelectedBranch}
        searchTerm={f.searchTerm}
        onSearchChange={f.setSearchTerm}
        searchPlaceholder={searchPlaceholder}
        metricFilter={f.metricFilter}
        onMetricFilterChange={f.setMetricFilter}
        filterLevels={filterLevels}
        projectionAvailable={Boolean(f.projection)}
      />
      {f.availableDays.length > 0 && (
        <div className="mb-8">
          <DayProgressBar
            availableDays={f.availableDays}
            monthPeriod={f.monthPeriod}
            daysInMonth={f.totalDays}
            selectedDay={f.effectiveDay}
            onSelect={f.setSelectedDay}
          />
          <ProjectionNote projection={f.projection} />
        </div>
      )}
    </>
  );
}
