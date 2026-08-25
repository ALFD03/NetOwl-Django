import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { SalesReportView } from '@/features/subscriptions/components/reports/SalesReportView';
import { useSalesReportData, type SalesReportSite } from '@/features/subscriptions/hooks/useSalesReportData';

interface SalesReportProps {
  reportData?: { data?: SalesReportSite[]; periods?: string[]; period?: string };
}

export default function SalesReport({ reportData = {} }: SalesReportProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');

  const currentPeriod = reportData.period ?? '';
  const { branchList, filteredData } = useSalesReportData({
    sites: reportData.data ?? [],
    searchTerm,
    selectedBranch,
    selectedTech,
  });

  return (
    <AppLayout title="Reporte Regional de Ventas">
      <ModuleHeader module="subscriptions" activeTab="sales" />

      <SubscriptionReportFilters
        period={currentPeriod}
        periods={reportData.periods ?? []}
        onPeriodChange={(period) => router.get('/subscriptions/sales-report/', { period }, { preserveState: true })}
        selectedTech={selectedTech}
        onTechChange={setSelectedTech}
        selectedBranch={selectedBranch}
        branches={branchList}
        onBranchChange={setSelectedBranch}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por Sede o Zona..."
      />

      <SalesReportView sites={filteredData} period={currentPeriod} />
    </AppLayout>
  );
}
