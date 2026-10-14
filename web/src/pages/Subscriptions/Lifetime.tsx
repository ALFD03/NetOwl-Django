/** Página Inertia `Subscriptions/Lifetime` (`/subscriptions/lifetime/`): cuánto duraron las bajas de un mes. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { LifetimeView } from '@/features/subscriptions/components/lifetime/LifetimeView';
import type { LifetimeMes } from '@/features/subscriptions/types';

interface SubscriptionsLifetimeProps {
  meses?: string[];
  periodo?: string | null;
  lifetime?: LifetimeMes | null;
}

export default function SubscriptionsLifetime({ meses = [], periodo = null, lifetime = null }: SubscriptionsLifetimeProps) {
  return (
    <AppLayout>
      <LifetimeView meses={meses} periodo={periodo} lifetime={lifetime} />
    </AppLayout>
  );
}
