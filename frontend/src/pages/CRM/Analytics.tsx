import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { CrmAnalyticsView, useCrmDashboard } from '@/features/crm';
import type { CrmDashboardProps } from '@/features/crm/types';

export default function CrmAnalytics(props: CrmDashboardProps) {
  const data = useCrmDashboard(props);

  return (
    <AppLayout title="CRM Analytics">
      <ModuleHeader module="crm" activeTab="analytics" />
      <CrmAnalyticsView data={data} />
    </AppLayout>
  );
}
