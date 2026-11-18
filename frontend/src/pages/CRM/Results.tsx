/** `/crm/results/`. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { CrmResultsView } from '@/features/crm';
import type { CrmClose } from '@/features/crm/types';

interface CrmResultsProps {
  history?: CrmClose[];
}

export default function CrmResults({ history = [] }: CrmResultsProps) {
  return (
    <AppLayout>
      <CrmResultsView history={history} />
    </AppLayout>
  );
}
