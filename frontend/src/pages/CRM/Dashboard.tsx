import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { CrmDashboardView, useCrmDashboard } from '@/features/crm';
import type { CrmDashboardProps } from '@/features/crm/types';

export default function CrmDashboard(props: CrmDashboardProps) {
  const data = useCrmDashboard(props);

  return (
    <AppLayout title="CRM Analytics Dashboard" toolbar={<ModuleHeader module="crm" activeTab="dashboard" />}>
      <CrmDashboardView data={data} />
    </AppLayout>
  );
}
