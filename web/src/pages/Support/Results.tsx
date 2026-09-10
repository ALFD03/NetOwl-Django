import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportResultsView } from '@/features/support';
import type { SupportResultsProps } from '@/features/support/types';

export default function SupportResults({ historico = [] }: SupportResultsProps) {
  return (
    <AppLayout title="Historial de Cierres de Soporte Técnico" toolbar={<ModuleHeader module="support" activeTab="results" />}>
      <SupportResultsView historico={historico} />
    </AppLayout>
  );
}
