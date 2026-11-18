/**
 * Página `/subscriptions/business-units/`.
 *
 * Agrupa por coordinador. Ojo: calcula `complianceRate` **sin recortar a 100**,
 * a diferencia del Sales Report; es una discrepancia intencionada (ver
 * `features/subscriptions/lib/commercial.ts`).
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { BusinessUnitsView } from '@/features/subscriptions/components/reports/BusinessUnitsView';
import { CommercialReportToolbar } from '@/features/subscriptions/components/reports/CommercialReportToolbar';
import { useBusinessUnitsPage, type BusinessUnitsProps } from '@/features/subscriptions/hooks/useBusinessUnitsPage';

export default function BusinessUnits(props: BusinessUnitsProps) {
  const { filters, period, periods, branchList, filteredData, dynamicFtthSummary } = useBusinessUnitsPage(props);

  return (
    <AppLayout
      toolbar={
        <CommercialReportToolbar
          filters={filters}
          period={period}
          periods={periods}
          branches={branchList}
          searchPlaceholder="Buscar Coordinador o Zona..."
          filterLevels={{ zone: 'Zonas', group: 'Coordinadores' }}
        />
      }
    >
      <BusinessUnitsView
        groups={filteredData}
        ftthSummary={dynamicFtthSummary}
        showFtthSummary={filters.selectedTech !== 'RF'}
        period={period}
        selectedDay={Boolean(filters.dayData)}
        projection={filters.projection}
      />
    </AppLayout>
  );
}
