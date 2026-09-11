/** Página Inertia `Subscriptions/Results` (`/subscriptions/results/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SubscriptionResultsView } from '@/features/subscriptions/components/results/SubscriptionResultsView';
import type { SubscriptionCierre } from '@/features/subscriptions/types';

interface SubscriptionsResultsProps {
  periodos?: SubscriptionCierre[];
}

export default function SubscriptionsResults({ periodos = [] }: SubscriptionsResultsProps) {
  return (
    <AppLayout title="Subscriptions Results" toolbar={<ModuleHeader module="subscriptions" activeTab="results" />}>
      <SubscriptionResultsView periodos={periodos} />
    </AppLayout>
  );
}
