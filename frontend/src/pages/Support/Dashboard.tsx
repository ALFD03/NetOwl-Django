import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportDashboardView, useSupportDashboard } from '@/features/support';
import type { SupportDashboardProps } from '@/features/support/types';

export default function SupportDashboard(props: SupportDashboardProps) {
  const data = useSupportDashboard(props);

  return (
    <AppLayout title="Technical Support Dashboard">
      <ModuleHeader module="support" activeTab="dashboard" />
      <SupportDashboardView data={data} />
    </AppLayout>
  );
}
