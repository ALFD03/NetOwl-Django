/** Página Inertia `Support/Results` (`/support/results/`). */

import { AppLayout } from '@/shared/layout/AppLayout';
import { SupportResultsView } from '@/features/support';
import type { SupportResultsProps } from '@/features/support/types';

export default function SupportResults({ historico = [] }: SupportResultsProps) {
  return (
    <AppLayout>
      <SupportResultsView historico={historico} />
    </AppLayout>
  );
}
