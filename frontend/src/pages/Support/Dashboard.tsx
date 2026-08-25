import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportDashboardView } from '@/features/support/components/SupportDashboardView';
import type { SupportDashboardProps } from '@/features/support/types';

export default function SupportDashboard({ metrics = {} }: SupportDashboardProps) {
  return (
    <AppLayout title="Technical Support Dashboard">
      <ModuleHeader module="support" activeTab="dashboard" />
      <SupportDashboardView summary={metrics.resumen_global ?? {}} />
    </AppLayout>
  );
}
