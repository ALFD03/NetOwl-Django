/** Página Inertia `Support/Dashboard` (`/support/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SupportDashboardView, useSupportDashboard } from '@/features/support';
import type { SupportDashboardProps } from '@/features/support/types';

export default function SupportDashboard(props: SupportDashboardProps) {
  const data = useSupportDashboard(props);

  return (
    <AppLayout>
      <SupportDashboardView data={data} />
    </AppLayout>
  );
}
