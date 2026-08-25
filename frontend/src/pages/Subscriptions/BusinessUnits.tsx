import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SubscriptionReportFilters } from '@/features/subscriptions/components/reports/SubscriptionReportFilters';
import { BusinessUnitsView } from '@/features/subscriptions/components/reports/BusinessUnitsView';
import { useBusinessUnitsData, type BusinessUnitGroup } from '@/features/subscriptions/hooks/useBusinessUnitsData';

interface BusinessUnitsProps {
  buData?: { data?: BusinessUnitGroup[]; periods?: string[]; period?: string };
}

export default function BusinessUnits({ buData = {} }: BusinessUnitsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<'ALL' | 'FTTH' | 'RF'>('ALL');

  const { branchList, filteredData, dynamicFtthSummary } = useBusinessUnitsData({
    groups: buData.data ?? [],
    searchTerm,
    selectedBranch,
    selectedTech,
  });

  return (
    <AppLayout title="Business Units">
      <ModuleHeader module="subscriptions" activeTab="business_units" />

      <SubscriptionReportFilters
        period={buData.period ?? ''}
        periods={buData.periods ?? []}
        onPeriodChange={(period) => router.get('/subscriptions/business-units/', { period }, { preserveState: true })}
        selectedTech={selectedTech}
        onTechChange={setSelectedTech}
        selectedBranch={selectedBranch}
        branches={branchList}
        onBranchChange={setSelectedBranch}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar Coordinador o Zona..."
      />

      <BusinessUnitsView
        groups={filteredData}
        ftthSummary={dynamicFtthSummary}
        showFtthSummary={selectedTech !== 'RF'}
      />
    </AppLayout>
  );
}
