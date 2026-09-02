import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportAnalyticsFilters, SupportAnalyticsView, useSupportAnalytics } from '@/features/support';
import type { SupportAnalyticsProps, SupportDimension } from '@/features/support/types';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const { periods = [], selectedPeriod = '' } = props;
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const data = useSupportAnalytics(props, selectedGroup, dimension);

  /** The period is the only server-side filter; group and dimension are local. */
  const reload = (period: string) =>
    router.get('/support/analytics/', { period }, { preserveState: true });

  return (
    <AppLayout
      title="Análisis de Soporte Técnico por Periodo"
      toolbar={
        <>
          <ModuleHeader module="support" activeTab="analytics" />
          <SupportAnalyticsFilters
            periods={periods}
            selectedPeriod={selectedPeriod || data.periodo}
            onPeriodChange={reload}
            groups={data.groupOptions}
            selectedGroup={data.activeGroupName}
            onGroupChange={setSelectedGroup}
            selectedDimension={dimension}
            onDimensionChange={setDimension}
          />
        </>
      }
    >
      <SupportAnalyticsView data={data} dimension={dimension} />
    </AppLayout>
  );
}
