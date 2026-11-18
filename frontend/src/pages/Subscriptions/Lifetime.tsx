/** `/subscriptions/lifetime/`: cuánto duraron las bajas de un mes. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { LifetimeView } from '@/features/subscriptions/components/lifetime/LifetimeView';
import type { LifetimeMonth } from '@/features/subscriptions/types';

interface SubscriptionsLifetimeProps {
  months?: string[];
  period?: string | null;
  lifetime?: LifetimeMonth | null;
}

export default function SubscriptionsLifetime({ months = [], period = null, lifetime = null }: SubscriptionsLifetimeProps) {
  return (
    <AppLayout>
      <LifetimeView months={months} period={period} lifetime={lifetime} />
    </AppLayout>
  );
}
