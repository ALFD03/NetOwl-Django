import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { ImportsHeader } from '@/components/Navigation/ImportsHeader';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Modal } from '@/components/UI/Modal';
import { Terminal, Clock, FileText } from 'lucide-react';

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
    { header: 'Fecha y Hora', accessor: 'timestamp', sortKey: 'timestamp' },
    { header: 'Usuario', accessor: (r) => <span className="font-semibold text-white">{r.username}</span>, sortKey: 'username' },
    { header: 'Módulo', accessor: (r) => <span className="text-brand font-bold">{r.module_display}</span>, sortKey: 'module_display' },
    { header: 'Archivo / Evento', accessor: 'file_name', sortKey: 'file_name' },
    { header: 'Filas', accessor: (r) => r.rows_processed.toLocaleString(), align: 'right', sortKey: 'rows_processed' },
    {
      header: 'Estado',
      accessor: (r) => (
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
            r.status === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
          }`}
        >
          {r.status_display}
        </span>
      ),
      align: 'center',
      sortKey: 'status',
    },
  ];

  return (
    <AppLayout title="Historial de Importaciones y Cálculos">
      <ImportsHeader activeTab="history" />

      <NeonContainer
        theme="slate"
        title="Registro de Auditoría de Operaciones"
        subtitle="Haz clic en cualquier fila para ver el log de ejecución detallado"
        icon={<Clock className="w-5 h-5" />}
        noPadding={true}
      >
        <div className="h-[550px]">
          <DataTable
            columns={columns}
            data={history}
            searchable
            searchPlaceholder="Buscar por archivo, usuario o módulo..."
            onRowClick={(row) => setSelectedLog(row)}
          />
        </div>
      </NeonContainer>

      {/* MODAL DE CONSOLA / LOG */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`Detalle de Operación: ${selectedLog?.file_name || ''}`}
        subtitle={`${selectedLog?.username || 'Sistema'} | ${selectedLog?.timestamp || ''}`}
        theme={selectedLog?.status === 'success' ? 'green' : 'red'}
        icon={<Terminal className="w-5 h-5" />}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-[#0b1326] border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mensaje de Salida</span>
              <p className="font-bold text-white text-sm">{selectedLog.message}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Traza / Consola de Ejecución</span>
              <div className="bg-black/90 border border-slate-800 rounded-2xl p-4 font-mono text-emerald-400 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs shadow-inner custom-scrollbar">
                {selectedLog.details || 'Sin traza de consola adicional.'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}