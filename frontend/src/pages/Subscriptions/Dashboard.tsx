import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { DashboardMetrics } from '@/features/subscriptions/components/dashboard/DashboardMetrics';
import { DashboardCharts } from '@/features/subscriptions/components/dashboard/DashboardCharts';
import { useSubscriptionDashboard } from '@/features/subscriptions/hooks/useSubscriptionDashboard';
import type { SubscriptionDashboardProps } from '@/features/subscriptions/types';

export default function SubscriptionsDashboard(props: SubscriptionDashboardProps) {
  const data = useSubscriptionDashboard(props);

  return (
    <AppLayout title="Subscriptions Analytics">
      <ModuleHeader module="subscriptions" activeTab="dashboard" />
      <DashboardMetrics data={data} />
      <DashboardCharts data={data} />
    </AppLayout>
  );
}
