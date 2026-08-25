import { Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel } from '@/shared/utils/formatters';
import type { SupportCierre } from '../types';

const COLUMNS: Column<SupportCierre>[] = [
  { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodoLabel(r.periodo_reporte)}</span>, sortKey: 'periodo_reporte' },
  { header: 'Creados', accessor: (r) => formatInteger(r.total_tickets), align: 'right', sortKey: 'total_tickets' },
  { header: '% Resueltos', accessor: (r) => <span className="font-semibold text-emerald-400">{r.pct_resueltos}%</span>, align: 'right', sortKey: 'pct_resueltos' },
  { header: '% Cancelados', accessor: (r) => <span className="font-semibold text-rose-400">{r.pct_cancelados}%</span>, align: 'right', sortKey: 'pct_cancelados' },
  { header: '% Rezagados', accessor: (r) => <span className="font-semibold text-amber-400">{r.pct_rezagados}%</span>, align: 'right', sortKey: 'pct_rezagados' },
  { header: 'MTTR Promedio (h)', accessor: (r) => `${r.tiempo_medio_cierre_horas} h`, align: 'right', sortKey: 'tiempo_medio_cierre_horas' },
  { header: 'Mediana (h)', accessor: (r) => `${r.tiempo_mediana_cierre_horas} h`, align: 'right', sortKey: 'tiempo_mediana_cierre_horas' },
];

export function SupportResultsView({ historico }: { historico: SupportCierre[] }) {
  return (
    <NeonContainer
      theme="slate"
      title="Historial de Cierres de Soporte Técnico"
      subtitle="Volumen y tiempos de resolución por periodo"
      icon={<TableIcon className="h-5 w-5" />}
      noPadding
    >
      <div className="h-[550px]">
        <DataTable
          columns={COLUMNS}
          data={historico}
          searchable
          searchPlaceholder="Buscar por periodo..."
        />
      </div>
    </NeonContainer>
  );
}
