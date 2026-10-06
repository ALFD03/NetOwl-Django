/** Página Inertia `Subscriptions/Results` (`/subscriptions/results/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SubscriptionResultsView } from '@/features/subscriptions/components/results/SubscriptionResultsView';
import type { SubscriptionCierre } from '@/features/subscriptions/types';

interface SubscriptionsResultsProps {
  periodos?: SubscriptionCierre[];
}

export default function SubscriptionsResults({ periodos = [] }: SubscriptionsResultsProps) {
  return (
    <AppLayout>
      <SubscriptionResultsView periodos={periodos} />
    </AppLayout>
  );
}
