/** `/crm/results/`. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { CrmResultsView } from '@/features/crm';
import type { CrmClose } from '@/features/crm/types';

interface CrmResultsProps {
  historico?: CrmClose[];
}

export default function CrmResults({ historico = [] }: CrmResultsProps) {
  return (
    <AppLayout>
      <CrmResultsView historico={historico} />
    </AppLayout>
  );
}
