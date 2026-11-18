/** `/subscriptions/results/`. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SubscriptionResultsView } from '@/features/subscriptions/components/results/SubscriptionResultsView';
import type { SubscriptionClose } from '@/features/subscriptions/types';

interface SubscriptionsResultsProps {
  closings?: SubscriptionClose[];
}

export default function SubscriptionsResults({ closings = [] }: SubscriptionsResultsProps) {
  return (
    <AppLayout>
      <SubscriptionResultsView periodos={closings} />
    </AppLayout>
  );
}
