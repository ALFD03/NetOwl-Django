/**
 * Página Inertia `Subscriptions/SalesReport` (`/subscriptions/sales-report/`).
 *
 * Agrupa por Site → Tecnología → Nodos. El día seleccionado se reagrupa en
 * cliente con `buildSalesSites`, sobre los props que ya llegaron.
 */

import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DayProgressBar } from '@/shared/ui';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { useObjetivos } from '@/features/subscriptions/hooks/useObjetivos';
import { buildSalesSites, type ZonasConfig } from '@/features/subscriptions/lib/dayReports';
import type { DayMetrics } from '@/shared/types/domain';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { SalesReportView } from '@/features/subscriptions/components/reports/SalesReportView';
import { useSalesReportData, type SalesReportSite } from '@/features/subscriptions/hooks/useSalesReportData';

interface SalesReportProps {
  reportData?: { data?: SalesReportSite[]; periods?: string[]; period?: string; dia?: number | null };
  dayMetrics?: DayMetrics;
  zonasConfig?: ZonasConfig;
}

export default function SalesReport({ reportData = {}, dayMetrics, zonasConfig }: SalesReportProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');
  const [selectedDay, setSelectedDay] = useState(reportData.dia ?? 0);
  const { availableDays, totalDays, effectiveDay, dayData } = useDayMetrics(dayMetrics, selectedDay);

  const currentPeriod = reportData.period ?? '';

  // El mes entero ya viaja en los props: elegir un dia solo reagrupa en memoria,
  // sin pedir nada al servidor. Sin dias calculados se usa el cierre del mes.
  const sites = useMemo(
    () => (dayData ? buildSalesSites(dayData.dimensiones, zonasConfig) : reportData.data ?? []),
    [dayData, zonasConfig, reportData.data],
  );

  // Los objetivos vienen en los props; `zonasConfig` dice a qué coordinador,
  // site y estado pertenece cada zona, que es por donde se heredan.
  const objetivos = useObjetivos(zonasConfig?.zonas);

  const { branchList, filteredData } = useSalesReportData({
    sites,
    searchTerm,
    selectedBranch,
    selectedTech,
    period: currentPeriod,
    objetivos,
  });

  const changePeriod = (period: string) => {
    setSelectedDay(0);
    router.get('/subscriptions/sales-report/', { period }, {
      preserveState: true,
      preserveScroll: true,
      only: ['reportData', 'dayMetrics'],
    });
  };

  return (
    <AppLayout
      title="Reporte Regional de Ventas"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="sales" />
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
          />
          {availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={availableDays}
                periodoMes={dayMetrics?.periodo_mes}
                daysInMonth={totalDays}
                selectedDay={effectiveDay}
                onSelect={setSelectedDay}
              />
            </div>
          )}
        </>
      }
    >
      <SalesReportView
        sites={filteredData}
        period={currentPeriod}
        diaSeleccionado={Boolean(dayData)}
      />
    </AppLayout>
  );
}
