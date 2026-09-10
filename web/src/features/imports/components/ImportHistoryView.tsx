import { useState } from 'react';
import { Clock, Terminal } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { ConsoleOutput, DataTable, Modal, NeonContainer, StatTile, type Column } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import type { ImportHistoryItem } from '../types';

const COLUMNS: Column<ImportHistoryItem>[] = [
  { header: 'Fecha y Hora', accessor: 'timestamp', sortKey: 'timestamp' },
  { header: 'Usuario', accessor: (r) => <span className="font-semibold text-white">{r.username}</span>, sortKey: 'username' },
  { header: 'Módulo', accessor: (r) => <span className="font-bold text-brand">{r.module_display}</span>, sortKey: 'module_display' },
  { header: 'Archivo / Evento', accessor: 'file_name', sortKey: 'file_name' },
  { header: 'Filas', accessor: (r) => formatInteger(r.rows_processed), align: 'right', sortKey: 'rows_processed' },
  {
    header: 'Estado',
    accessor: (r) => (
      <span
        className={cn(
          'rounded-full border px-3 py-1 text-[10px] font-black uppercase',
          r.status === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
        )}
      >
        {r.status_display}
      </span>
    ),
    align: 'center',
    sortKey: 'status',
  },
];

export function ImportHistoryView({ history }: { history: ImportHistoryItem[] }) {
  const [selectedLog, setSelectedLog] = useState<ImportHistoryItem | null>(null);

  return (
    <>
      <NeonContainer
        theme="slate"
        title="Registro de Auditoría de Operaciones"
        subtitle="Haz clic en cualquier fila para ver el log de ejecución detallado"
        icon={<Clock className="h-5 w-5" />}
        noPadding
      >
        <div className="h-[550px]">
          <DataTable
            columns={COLUMNS}
            data={history}
            searchable
            searchPlaceholder="Buscar por archivo, usuario o módulo..."
            onRowClick={setSelectedLog}
          />
        </div>
      </NeonContainer>

      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Detalle de Operación: ${selectedLog?.file_name ?? ''}`}
        subtitle={`${selectedLog?.username ?? 'Sistema'} | ${selectedLog?.timestamp ?? ''}`}
        theme={selectedLog?.status === 'success' ? 'green' : 'red'}
        icon={<Terminal className="h-5 w-5" />}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            <StatTile
              label="Mensaje de Salida"
              value={selectedLog.message}
              variant="boxed"
              size="sm"
            />
            <ConsoleOutput
              title="Traza / Consola de Ejecución"
              output={selectedLog.details}
              emptyText="Sin traza de consola adicional."
              maxHeight="max-h-72"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
