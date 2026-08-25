import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { ImportHistoryView } from '@/features/imports/components/ImportHistoryView';
import type { ImportHistoryItem } from '@/features/imports/types';

interface ImportHistoryProps {
  history?: ImportHistoryItem[];
}

export default function ImportHistory({ history = [] }: ImportHistoryProps) {
  return (
    <AppLayout title="Historial de Importaciones y Cálculos">
      <ModuleHeader module="imports" activeTab="history" />
      <ImportHistoryView history={history} />
    </AppLayout>
  );
}
