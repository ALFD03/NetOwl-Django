/**
 * Página `/subscriptions/sales-report/`.
 *
 * Agrupa por Site → Tecnología → Nodos.
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { CommercialReportToolbar } from '@/features/subscriptions/components/reports/CommercialReportToolbar';
import { SalesReportView } from '@/features/subscriptions/components/reports/SalesReportView';
import { useSalesReportPage, type SalesReportProps } from '@/features/subscriptions/hooks/useSalesReportPage';

export default function SalesReport(props: SalesReportProps) {
  const { filters, period, periods, branchList, filteredData } = useSalesReportPage(props);

  return (
    <AppLayout
      toolbar={
        <CommercialReportToolbar
          filters={filters}
          period={period}
          periods={periods}
          branches={branchList}
          searchPlaceholder="Buscar por Sede o Zona..."
          filterLevels={{ zone: 'Zonas', group: 'Sites' }}
        />
      }
    >
      <SalesReportView
        sites={filteredData}
        period={period}
        selectedDay={Boolean(filters.dayData)}
        projection={filters.projection}
        coordinatorOffices={props.officeCoordinators ?? []}
        // Sin días calculados se pinta el cierre del mes, y sus ventas son las del mes entero.
        cutoffDay={filters.dayData ? filters.effectiveDay : null}
      />
    </AppLayout>
  );
}
