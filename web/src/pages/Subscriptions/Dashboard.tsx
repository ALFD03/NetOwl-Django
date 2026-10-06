/**
 * Página Inertia `Subscriptions/Dashboard`, que renderiza `subscriptions.views.dashboard` (`/subscriptions/`).
 *
 * Las páginas son un contrato con Django: la vista nombra el componente por su
 * ruta bajo `pages/`, así que **renombrar o mover este fichero rompe la vista en
 * tiempo de ejecución**, sin error de compilación.
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { DashboardMetrics } from '@/features/subscriptions/components/dashboard/DashboardMetrics';
import { DashboardCharts } from '@/features/subscriptions/components/dashboard/DashboardCharts';
import { useSubscriptionDashboard } from '@/features/subscriptions/hooks/useSubscriptionDashboard';
import type { SubscriptionDashboardProps } from '@/features/subscriptions/types';

export default function SubscriptionsDashboard(props: SubscriptionDashboardProps) {
  const data = useSubscriptionDashboard(props);

  return (
    <AppLayout>
      <DashboardMetrics data={data} />
      <DashboardCharts data={data} />
    </AppLayout>
  );
}
