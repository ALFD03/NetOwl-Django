/** Página Inertia `Support/Results` (`/support/results/`). */

import { useEffect } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { SupportResultsView } from '@/features/support';
import type { SupportResultsProps } from '@/features/support/types';

export default function SupportResults(props: SupportResultsProps) {
  // Analytics enlaza a `#detalle`; el scroll vive en <main>, así que el
  // navegador no salta solo al ancla.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <AppLayout>
      <SupportResultsView {...props} />
    </AppLayout>
  );
}
