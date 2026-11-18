/** `/subscriptions/lifetime/`: cuánto duraron las bajas de un mes. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { LifetimeView } from '@/features/subscriptions/components/lifetime/LifetimeView';
import type { LifetimeMonth } from '@/features/subscriptions/types';

interface SubscriptionsLifetimeProps {
  meses?: string[];
  periodo?: string | null;
  lifetime?: LifetimeMonth | null;
}

export default function SubscriptionsLifetime({ meses = [], periodo = null, lifetime = null }: SubscriptionsLifetimeProps) {
  return (
    <AppLayout>
      <LifetimeView meses={meses} periodo={periodo} lifetime={lifetime} />
    </AppLayout>
  );
}
