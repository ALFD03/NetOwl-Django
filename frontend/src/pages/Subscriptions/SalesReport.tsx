/**
 * Página `/subscriptions/sales-report/`.
 *
 * Agrupa por Site → Tecnología → Nodos. El día seleccionado se reagrupa en
 * cliente con `buildSalesSites`, sobre los props que ya llegaron.
 */

import { useMemo, useState } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DayProgressBar } from '@/shared/ui';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { useTargets } from '@/features/subscriptions/hooks/useTargets';
import { buildSalesSites, type ZonesConfig } from '@/features/subscriptions/lib/dayReports';
import { EMPTY_METRIC_FILTER, type MetricFilter } from '@/features/subscriptions/lib/metricFilter';
import type { DayMetrics } from '@/shared/types/domain';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { SalesReportView } from '@/features/subscriptions/components/reports/SalesReportView';
import type { OfficeCoordinator } from '@/features/subscriptions/components/reports/OfficeCoordinatorBadges';
import { ProjectionNote } from '@/features/subscriptions/components/reports/ProjectionNote';
import { useSalesReportData, type SalesReportSite } from '@/features/subscriptions/hooks/useSalesReportData';
import { useVisit } from '@/shared/page/PageData';

interface SalesReportProps {
  reportData?: { data?: SalesReportSite[]; periods?: string[]; period?: string; dia?: number | null };
  dayMetrics?: DayMetrics;
  zonasConfig?: ZonesConfig;
  /** Las coordinadoras de oficina de cada site, con sus ventas por día y su objetivo. */
  coordinadorasOficina?: OfficeCoordinator[];
}

export default function SalesReport({
  reportData = {}, dayMetrics, zonasConfig, coordinadorasOficina = [],
}: SalesReportProps) {
  const visit = useVisit();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');
  const [selectedDay, setSelectedDay] = useState(reportData.dia ?? 0);
  const [filtroMetrica, setMetricFilter] = useState<MetricFilter>(EMPTY_METRIC_FILTER);
  const { availableDays, totalDays, effectiveDay, dayData, proyeccion } = useDayMetrics(dayMetrics, selectedDay);

  const currentPeriod = reportData.period ?? '';

  // El mes entero ya viaja en los props: elegir un dia solo reagrupa en memoria,
  // sin pedir nada al servidor. Sin dias calculados se usa el cierre del mes.
  const sites = useMemo(
    () => (dayData ? buildSalesSites(dayData.dimensiones, zonasConfig) : reportData.data ?? []),
    [dayData, zonasConfig, reportData.data],
  );

  // Los objetivos vienen en los props; `zonasConfig` dice a qué coordinador,
  // site y estado pertenece cada zona, que es por donde se heredan.
  const objetivos = useTargets(zonasConfig?.zonas);

  const { branchList, filteredData } = useSalesReportData({
    sites,
    searchTerm,
    selectedBranch,
    selectedTech,
    period: currentPeriod,
    objetivos,
    metricFilter: filtroMetrica,
    projection: proyeccion,
  });

  const changePeriod = (period: string) => {
    setSelectedDay(0);
    visit({ period });
  };

  return (
    <AppLayout
      toolbar={
        <>
          <SubscriptionReportFilters
            period={currentPeriod}
            periods={reportData.periods ?? []}
            onPeriodChange={changePeriod}
            selectedTech={selectedTech}
            onTechChange={setSelectedTech}
            selectedBranch={selectedBranch}
            branches={branchList}
            onBranchChange={setSelectedBranch}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar por Sede o Zona..."
            metricFilter={filtroMetrica}
            onMetricFilterChange={setMetricFilter}
            filterLevels={{ zona: 'Zonas', grupo: 'Sites' }}
            projectionAvailable={Boolean(proyeccion)}
          />
          {availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={availableDays}
                monthPeriod={dayMetrics?.periodo_mes}
                daysInMonth={totalDays}
                selectedDay={effectiveDay}
                onSelect={setSelectedDay}
              />
              <ProjectionNote projection={proyeccion} />
            </div>
          )}
        </>
      }
    >
      <SalesReportView
        sites={filteredData}
        period={currentPeriod}
        diaSeleccionado={Boolean(dayData)}
        projection={proyeccion}
        coordinadoras={coordinadorasOficina}
        // Sin días calculados se pinta el cierre del mes, y sus ventas son las del mes entero.
        cutoffDay={dayData ? effectiveDay : null}
      />
    </AppLayout>
  );
}
