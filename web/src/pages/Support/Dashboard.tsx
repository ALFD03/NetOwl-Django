/**
 * Página Inertia `Support/Dashboard` (`/support/dashboard/`).
 *
 * Además del promedio de los periodos trae, si la cuenta los puede ver, los
 * tickets abiertos ahora (de los logs de etapa).
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SupportDashboardView, useSupportDashboard } from '@/features/support';
import type { SupportDashboardProps } from '@/features/support/types';

export default function SupportDashboard(props: SupportDashboardProps) {
  const data = useSupportDashboard(props);

  return (
    <AppLayout>
      <SupportDashboardView data={data} abiertos={props.abiertos} />
    </AppLayout>
  );
}
