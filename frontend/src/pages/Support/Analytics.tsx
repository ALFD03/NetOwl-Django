import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportAnalyticsView } from '@/features/support/components/SupportAnalyticsView';
import type { SupportAnalyticsProps } from '@/features/support/types';

export default function SupportAnalytics({ analyticsData = {} }: SupportAnalyticsProps) {
  return (
    <AppLayout title="Análisis Jerárquico de Soporte Técnico">
      <ModuleHeader module="support" activeTab="analytics" />
      <SupportAnalyticsView groups={analyticsData.grupos ?? {}} />
    </AppLayout>
  );
}
