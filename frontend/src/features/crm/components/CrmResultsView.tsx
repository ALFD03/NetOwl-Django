/** Tabla de cierres de CRM, con detalle al pulsar una fila. */

import { useState } from 'react';
import { Activity, Table as TableIcon } from 'lucide-react';

import { DataTable, Modal, NeonContainer, StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodLabel } from '@/shared/utils/formatters';
import { CrmPeriodDetail } from './CrmPeriodDetail';
import { CrmPeriodDimensions } from './CrmPeriodDimensions';
import type { CrmClose } from '../types';

interface CrmResultsViewProps {
  history: CrmClose[];
}

const COLUMNS: Column<CrmClose>[] = [
  {
    header: 'Periodo',
    accessor: (r) => (
      <StickyLabel minWidth="120px">{formatPeriodLabel(r.report_period)}</StickyLabel>
    ),
    sortKey: 'report_period',
    sticky: true,
  },
  { header: 'Oportunidades', accessor: (r) => formatInteger(r.total_opportunities), align: 'right', sortKey: 'total_opportunities' },
  { header: 'Ganados', accessor: (r) => <span className="font-semibold text-emerald-400">+{formatInteger(r.won)}</span>, align: 'right', sortKey: 'won' },
  { header: '% Instalación', accessor: (r) => <span className="font-bold text-emerald-400">{r.pct_installation}%</span>, align: 'right', sortKey: 'pct_installation' },
  { header: 'Perdidos', accessor: (r) => <span className="font-semibold text-rose-400">-{formatInteger(r.lost)}</span>, align: 'right', sortKey: 'lost' },
  { header: '% Pérdida', accessor: (r) => <span className="font-bold text-rose-400">{r.pct_lost}%</span>, align: 'right', sortKey: 'pct_lost' },
  { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{formatInteger(r.pending)}</span>, align: 'right', sortKey: 'pending' },
  { header: '% Pendientes', accessor: (r) => <span className="text-sky-400">{r.pct_pending}%</span>, align: 'right', sortKey: 'pct_pending' },
  { header: 'Devueltos E8', accessor: (r) => <span className="text-amber-400">{formatInteger(r.count_returned_e8)}</span>, align: 'right', sortKey: 'count_returned_e8' },
  { header: '% Devueltos E8', accessor: (r) => <span className="font-bold text-amber-400">{r.pct_returned_e8}%</span>, align: 'right', sortKey: 'pct_returned_e8' },
  { header: 'Lead Time Inst. (h)', accessor: (r) => `${r.hours_avg_inst} h`, align: 'right', sortKey: 'hours_avg_inst' },
  { header: 'Tiempo Pérdida (h)', accessor: (r) => `${r.hours_avg_lost} h`, align: 'right', sortKey: 'hours_avg_lost' },
];

export function CrmResultsView({ history }: CrmResultsViewProps) {
  const [selectedRow, setSelectedRow] = useState<CrmClose | null>(null);

  return (
    <>
      <NeonContainer
        theme="slate"
        title="Historial de Cierres y Cohortes Mensuales de CRM"
        subtitle="Haz clic en cualquier periodo para inspeccionar el embudo, los SLAs y el desglose por dimensión"
        icon={<TableIcon className="h-5 w-5" />}
        noPadding
      >
        <div className="h-[550px]">
          <DataTable
            columns={COLUMNS}
            data={history}
            searchable
            searchPlaceholder="Buscar por periodo..."
            onRowClick={setSelectedRow}
          />
        </div>
      </NeonContainer>

      <Modal
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title={`Auditoría de Periodo: ${selectedRow ? formatPeriodLabel(selectedRow.report_period) : ''}`}
        subtitle="Conversión del embudo, efectividad por etapa, tiempos y desglose dimensional"
        theme="blue"
        icon={<Activity className="h-5 w-5 text-brand" />}
        size="wide"
      >
        {selectedRow && (
          <div className="space-y-6">
            <CrmPeriodDetail row={selectedRow} />
            <CrmPeriodDimensions period={selectedRow.report_period} />
          </div>
        )}
      </Modal>
    </>
  );
}
