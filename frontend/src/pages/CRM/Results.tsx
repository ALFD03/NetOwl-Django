import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { CrmResultsView } from '@/features/crm';
import type { CrmCierre } from '@/features/crm/types';

interface CrmResultsProps {
  historico?: CrmCierre[];
}

export default function CrmResults({ historico = [] }: CrmResultsProps) {
  return (
    <AppLayout title="Historial de Cierres CRM">
      <ModuleHeader module="crm" activeTab="results" />
      <CrmResultsView historico={historico} />
    </AppLayout>
  );
}
