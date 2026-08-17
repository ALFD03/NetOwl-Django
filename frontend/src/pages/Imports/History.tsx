import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Modal } from '@/components/UI/Modal';

interface HistoryItem {
  id: number;
  timestamp: string;
  username: string;
  module_display: string;
  file_name: string;
  rows_processed: number;
  status_display: string;
  status: string;
  message: string;
  details: string;
}

interface Props {
  history: HistoryItem[];
}

export default function ImportHistory({ history = [] }: Props) {
  const [selectedLog, setSelectedLog] = useState<HistoryItem | null>(null);

  const columns: Column<HistoryItem>[] = [
    { header: 'Fecha y Hora', accessor: 'timestamp' },
    { header: 'Usuario', accessor: (r) => <span className="font-semibold text-white">{r.username}</span> },
    { header: 'Módulo', accessor: (r) => <span className="text-brand font-medium">{r.module_display}</span> },
    { header: 'Archivo', accessor: 'file_name' },
    { header: 'Filas', accessor: (r) => r.rows_processed.toLocaleString(), align: 'right' },
    {
      header: 'Estado',
      accessor: (r) => (
        <span
          className={`px-2 py-1 rounded-full text-[10px] font-bold ${
            r.status === 'success'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/20 text-rose-400'
          }`}
        >
          {r.status_display}
        </span>
      ),
      align: 'center',
    },
  ];

  return (
    <AppLayout title="Historial de Importaciones">
      <ImportsHeader activeTab="history" />

      <DataTable
        columns={columns}
        data={history}
        searchable
        searchPlaceholder="Buscar por archivo, usuario o módulo..."
        onRowClick={(row) => setSelectedLog(row)}
      />

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`Detalle de Ejecución: ${selectedLog?.file_name || ''}`}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <p className="font-bold text-white">{selectedLog.message}</p>
            <div className="bg-black/80 border border-slate-800 rounded-lg p-4 font-mono text-emerald-400 max-h-60 overflow-y-auto whitespace-pre-wrap">
              {selectedLog.details || 'Sin detalles adicionales de consola.'}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}