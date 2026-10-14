/** Página Inertia `CRM/Dashboard` (`/crm/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { CrmDashboardView, useCrmDashboard } from '@/features/crm';
import type { CrmDashboardProps } from '@/features/crm/types';

export default function CrmDashboard(props: CrmDashboardProps) {
  const data = useCrmDashboard(props);

  return (
    <AppLayout>
      <CrmDashboardView data={data} />
    </AppLayout>
  );
}
