import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportAnalyticsFilters, SupportAnalyticsView, useSupportAnalytics } from '@/features/support';
import type { SupportAnalyticsProps } from '@/features/support/types';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const { periods = [], selectedPeriod = '' } = props;
  const [selectedGroup, setSelectedGroup] = useState('');

  const data = useSupportAnalytics(props, selectedGroup);

  return (
    <AppLayout title="Análisis Jerárquico de Soporte Técnico">
      <ModuleHeader module="support" activeTab="analytics" />

      <SupportAnalyticsFilters
        periods={periods}
        selectedPeriod={selectedPeriod}
        onPeriodChange={(period) => router.get('/support/analytics/', { period }, { preserveState: true })}
        groups={data.groupOptions}
        selectedGroup={data.activeGroupName}
        onGroupChange={setSelectedGroup}
      />

      <SupportAnalyticsView data={data} />
    </AppLayout>
  );
}
