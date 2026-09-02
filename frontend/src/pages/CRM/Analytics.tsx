import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { CrmAnalyticsFilters, CrmAnalyticsView, useCrmAnalytics } from '@/features/crm';
import type { CrmAnalyticsProps } from '@/features/crm/types';
import type { CrmDimensionKey } from '@/shared/constants/labels';

export default function CrmAnalytics(props: CrmAnalyticsProps) {
  const { periods = [], selectedPeriod = '' } = props;
  const [selectedDimension, setSelectedDimension] = useState<CrmDimensionKey>('sucursal');

  const { rows, globalData, healthCards, rankingCards } = useCrmAnalytics(props, selectedDimension);

  return (
    <AppLayout
      title="CRM Analytics"
      toolbar={
        <>
          <ModuleHeader module="crm" activeTab="analytics" />
          <CrmAnalyticsFilters
            periods={periods}
            selectedPeriod={selectedPeriod}
            onPeriodChange={(period) => router.get('/crm/analytics/', { period }, { preserveState: true })}
            selectedDimension={selectedDimension}
            onDimensionChange={setSelectedDimension}
          />
        </>
      }
    >
      <CrmAnalyticsView
        globalData={globalData}
        rows={rows}
        healthCards={healthCards}
        rankingCards={rankingCards}
        selectedDimension={selectedDimension}
        selectedPeriod={selectedPeriod}
      />
    </AppLayout>
  );
}
