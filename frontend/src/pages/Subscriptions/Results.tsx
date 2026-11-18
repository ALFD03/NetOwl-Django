/** `/subscriptions/results/`. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SubscriptionResultsView } from '@/features/subscriptions/components/results/SubscriptionResultsView';
import type { SubscriptionClose } from '@/features/subscriptions/types';

interface SubscriptionsResultsProps {
  periodos?: SubscriptionClose[];
}

export default function SubscriptionsResults({ periodos = [] }: SubscriptionsResultsProps) {
  return (
    <AppLayout>
      <SubscriptionResultsView periodos={periodos} />
    </AppLayout>
  );
}
