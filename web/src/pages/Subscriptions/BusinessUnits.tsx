import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DayProgressBar } from '@/shared/ui';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { buildBusinessUnitGroups, type ZonasConfig } from '@/features/subscriptions/lib/dayReports';
import type { DayMetrics } from '@/shared/types/domain';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { BusinessUnitsView } from '@/features/subscriptions/components/reports/BusinessUnitsView';
import { useBusinessUnitsData, type BusinessUnitGroup } from '@/features/subscriptions/hooks/useBusinessUnitsData';

interface BusinessUnitsProps {
  buData?: { data?: BusinessUnitGroup[]; periods?: string[]; period?: string; dia?: number | null };
  dayMetrics?: DayMetrics;
  zonasConfig?: ZonasConfig;
}

export default function BusinessUnits({ buData = {}, dayMetrics, zonasConfig }: BusinessUnitsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');
  const [selectedDay, setSelectedDay] = useState(buData.dia ?? 0);
  const { availableDays, totalDays, effectiveDay, dayData } = useDayMetrics(dayMetrics, selectedDay);

  // Mismo criterio que en Ventas: el dia se resuelve en cliente sobre el mes
  // que ya esta en los props; el cierre del mes es el respaldo.
  const groups = useMemo(
    () => (dayData ? buildBusinessUnitGroups(dayData.dimensiones, zonasConfig) : buData.data ?? []),
    [dayData, zonasConfig, buData.data],
  );

  const { branchList, filteredData, dynamicFtthSummary } = useBusinessUnitsData({
    groups,
    searchTerm,
    selectedBranch,
    selectedTech,
  });

  const changePeriod = (period: string) => {
    setSelectedDay(0);
    router.get('/subscriptions/business-units/', { period }, {
      preserveState: true,
      preserveScroll: true,
      only: ['buData', 'dayMetrics'],
    });
  };

  return (
    <AppLayout
      title="Business Units"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="business_units" />
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
      <BusinessUnitsView
        groups={filteredData}
        ftthSummary={dynamicFtthSummary}
        showFtthSummary={selectedTech !== 'RF'}
      />
    </AppLayout>
  );
}
