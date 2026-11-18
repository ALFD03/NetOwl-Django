/**
 * Página `/subscriptions/business-units/`.
 *
 * Agrupa por coordinador. Ojo: calcula `complianceRate` **sin recortar a 100**,
 * a diferencia del Sales Report; es una discrepancia intencionada (ver
 * `features/subscriptions/lib/commercial.ts`).
 *
 * Quien no ve todas las unidades recibe `buData.alcance` y solo los datos de
 * las suyas (`restringir_unidades` en el servidor). Al reagrupar un día, una
 * zona RF visible puede colgar de otro coordinador, así que los grupos se
 * vuelven a recortar aquí con el alcance.
 */

import { useMemo, useState } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DayProgressBar } from '@/shared/ui';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { useTargets } from '@/features/subscriptions/hooks/useTargets';
import { buildBusinessUnitGroups, type ZonesConfig } from '@/features/subscriptions/lib/dayReports';
import { EMPTY_METRIC_FILTER, type MetricFilter } from '@/features/subscriptions/lib/metricFilter';
import type { DayMetrics } from '@/shared/types/domain';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { BusinessUnitsView } from '@/features/subscriptions/components/reports/BusinessUnitsView';
import { ProjectionNote } from '@/features/subscriptions/components/reports/ProjectionNote';
import {
  useBusinessUnitsData, type BusinessUnitGroup, type FtthNodeTotals,
} from '@/features/subscriptions/hooks/useBusinessUnitsData';
import { useVisit } from '@/shared/page/PageData';

interface BusinessUnitsProps {
  buData?: {
    data?: BusinessUnitGroup[];
    periods?: string[];
    period?: string;
    dia?: number | null;
    /** Solo para quien no ve todas las unidades. */
    alcance?: { coordinadores: string[]; rf: boolean };
    ftth_consolidado?: { cierre: FtthNodeTotals; dias: Record<string, FtthNodeTotals> };
  };
  dayMetrics?: DayMetrics;
  zonasConfig?: ZonesConfig;
}

export default function BusinessUnits({ buData = {}, dayMetrics, zonasConfig }: BusinessUnitsProps) {
  const visit = useVisit();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');
  const [selectedDay, setSelectedDay] = useState(buData.dia ?? 0);
  const [filtroMetrica, setMetricFilter] = useState<MetricFilter>(EMPTY_METRIC_FILTER);
  const { availableDays, totalDays, effectiveDay, dayData, proyeccion } = useDayMetrics(dayMetrics, selectedDay);

  // Mismo criterio que en Ventas: el dia se resuelve en cliente sobre el mes
  // que ya esta en los props; el cierre del mes es el respaldo.
  const { alcance, ftth_consolidado: ftthConsolidado } = buData;
  const groups = useMemo(() => {
    const todos = dayData ? buildBusinessUnitGroups(dayData.dimensiones, zonasConfig) : buData.data ?? [];
    if (!alcance) return todos;
    return todos.filter((group) => (group.is_rf ? alcance.rf : alcance.coordinadores.includes(group.coordinador)));
  }, [dayData, zonasConfig, buData.data, alcance]);
  const ftthFijo = ftthConsolidado
    ? (dayData ? ftthConsolidado.dias[String(effectiveDay)] : ftthConsolidado.cierre) ?? null
    : null;

  // Los objetivos vienen en los props; `zonasConfig` dice a qué coordinador,
  // site y estado pertenece cada zona, que es por donde se heredan.
  const objetivos = useTargets(zonasConfig?.zonas);

  const { branchList, filteredData, dynamicFtthSummary } = useBusinessUnitsData({
    groups,
    searchTerm,
    selectedBranch,
    selectedTech,
    period: buData.period ?? '',
    objetivos,
    projection: proyeccion,
    metricFilter: filtroMetrica,
    ftthFijo,
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
            period={buData.period ?? ''}
            periods={buData.periods ?? []}
            onPeriodChange={changePeriod}
            selectedTech={selectedTech}
            onTechChange={setSelectedTech}
            selectedBranch={selectedBranch}
            branches={branchList}
            onBranchChange={setSelectedBranch}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar Coordinador o Zona..."
            metricFilter={filtroMetrica}
            onMetricFilterChange={setMetricFilter}
            filterLevels={{ zona: 'Zonas', grupo: 'Coordinadores' }}
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
      <BusinessUnitsView
        groups={filteredData}
        ftthSummary={dynamicFtthSummary}
        showFtthSummary={selectedTech !== 'RF'}
        period={buData.period ?? ''}
        diaSeleccionado={Boolean(dayData)}
        projection={proyeccion}
      />
    </AppLayout>
  );
}
