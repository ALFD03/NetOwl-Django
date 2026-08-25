import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { LifetimeView } from '@/features/subscriptions/components/lifetime/LifetimeView';
import type { LifetimeData, LifetimeDimensionInfo } from '@/features/subscriptions/types';

interface SubscriptionsLifetimeProps {
  lifecycle?: LifetimeData;
  dimensiones?: Record<string, Record<string, LifetimeDimensionInfo>>;
}

export default function SubscriptionsLifetime({ lifecycle, dimensiones }: SubscriptionsLifetimeProps) {
  return (
    <AppLayout title="Life Time Cycle (Supervivencia)">
      <ModuleHeader module="subscriptions" activeTab="lifetime" />
      <LifetimeView lifecycle={lifecycle} dimensiones={dimensiones} />
    </AppLayout>
  );
}
