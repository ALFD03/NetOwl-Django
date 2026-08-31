import { useState } from 'react';
import { Activity, Table as TableIcon } from 'lucide-react';

import { DataTable, Modal, NeonContainer, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel } from '@/shared/utils/formatters';
import { CrmPeriodDetail } from './CrmPeriodDetail';
import { CrmPeriodDimensions } from './CrmPeriodDimensions';
import type { CrmCierre } from '../types';

interface CrmResultsViewProps {
  historico: CrmCierre[];
}

const COLUMNS: Column<CrmCierre>[] = [
  {
    header: 'Periodo',
    accessor: (r) => (
      <span className="sticky left-0 z-10 block min-w-[120px] bg-surface-secondary pr-4 font-bold text-white">
        {formatPeriodoLabel(r.periodo_reporte)}
      </span>
    ),
    sortKey: 'periodo_reporte',
  },
  { header: 'Oportunidades', accessor: (r) => formatInteger(r.total_oportunidades), align: 'right', sortKey: 'total_oportunidades' },
  { header: 'Ganados', accessor: (r) => <span className="font-semibold text-emerald-400">+{formatInteger(r.ganados)}</span>, align: 'right', sortKey: 'ganados' },
  { header: '% Instalación', accessor: (r) => <span className="font-bold text-emerald-400">{r.pct_instalacion}%</span>, align: 'right', sortKey: 'pct_instalacion' },
  { header: 'Perdidos', accessor: (r) => <span className="font-semibold text-rose-400">-{formatInteger(r.perdidos)}</span>, align: 'right', sortKey: 'perdidos' },
  { header: '% Pérdida', accessor: (r) => <span className="font-bold text-rose-400">{r.pct_perdida}%</span>, align: 'right', sortKey: 'pct_perdida' },
  { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{formatInteger(r.pendientes)}</span>, align: 'right', sortKey: 'pendientes' },
  { header: '% Pendientes', accessor: (r) => <span className="text-sky-400">{r.pct_pendientes}%</span>, align: 'right', sortKey: 'pct_pendientes' },
  { header: 'Devueltos E8', accessor: (r) => <span className="text-amber-400">{formatInteger(r.count_devueltos_e8)}</span>, align: 'right', sortKey: 'count_devueltos_e8' },
  { header: '% Devueltos E8', accessor: (r) => <span className="font-bold text-amber-400">{r.pct_devueltos_e8}%</span>, align: 'right', sortKey: 'pct_devueltos_e8' },
  { header: 'Lead Time Inst. (h)', accessor: (r) => `${r.horas_promedio_inst} h`, align: 'right', sortKey: 'horas_promedio_inst' },
  { header: 'Tiempo Pérdida (h)', accessor: (r) => `${r.horas_promedio_perd} h`, align: 'right', sortKey: 'horas_promedio_perd' },
];

export function CrmResultsView({ historico }: CrmResultsViewProps) {
  const [selectedRow, setSelectedRow] = useState<CrmCierre | null>(null);

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
            data={historico}
            searchable
            searchPlaceholder="Buscar por periodo..."
            onRowClick={setSelectedRow}
          />
        </div>
      </NeonContainer>

      <Modal
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title={`Auditoría de Periodo: ${selectedRow ? formatPeriodoLabel(selectedRow.periodo_reporte) : ''}`}
        subtitle="Conversión del embudo, efectividad por etapa, tiempos y desglose dimensional"
        theme="blue"
        icon={<Activity className="h-5 w-5 text-brand" />}
        size="wide"
      >
        {selectedRow && (
          <div className="space-y-6">
            <CrmPeriodDetail row={selectedRow} />
            <CrmPeriodDimensions period={selectedRow.periodo_reporte} />
          </div>
        )}
      </Modal>
    </>
  );
}
