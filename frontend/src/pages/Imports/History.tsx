/** Página Inertia `Imports/History` (`/imports/history/`): el historial permanente. */

import { AppLayout } from '@/shared/layout/AppLayout';
import { ImportHistoryView } from '@/features/imports/components/ImportHistoryView';
import type { ImportHistoryItem } from '@/features/imports/types';

interface ImportHistoryProps {
  history?: ImportHistoryItem[];
}

export default function ImportHistory({ history = [] }: ImportHistoryProps) {
  return (
    <AppLayout>
      <ImportHistoryView history={history} />
    </AppLayout>
  );
}
