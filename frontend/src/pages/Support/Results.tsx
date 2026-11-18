/** `/support/results/`. Analytics enlaza a su `#detalle`. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { useScrollToHash } from '@/shared/hooks/useScrollToHash';
import { SupportResultsView } from '@/features/support';
import type { SupportResultsProps } from '@/features/support/types';

export default function SupportResults(props: SupportResultsProps) {
  useScrollToHash();

  return (
    <AppLayout>
      <SupportResultsView {...props} />
    </AppLayout>
  );
}
