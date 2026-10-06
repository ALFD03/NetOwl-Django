/** Página Inertia `CRM/Results` (`/crm/results/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { CrmResultsView } from '@/features/crm';
import type { CrmCierre } from '@/features/crm/types';

interface CrmResultsProps {
  historico?: CrmCierre[];
}

export default function CrmResults({ historico = [] }: CrmResultsProps) {
  return (
    <AppLayout>
      <CrmResultsView historico={historico} />
    </AppLayout>
  );
}
