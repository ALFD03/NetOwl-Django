/** Tabla de cierres de soporte. */

import { Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatPeriodoLabel, formatTwoDecimals } from '@/shared/utils';
import type { SupportHistoricoRow } from '../types';

const dec = formatTwoDecimals;
const hrs = formatOneDecimal;

const COLUMNS: Column<SupportHistoricoRow>[] = [
  { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodoLabel(r.periodo_reporte)}</span>, sortKey: 'periodo_reporte' },
  { header: 'Creados', accessor: (r) => formatInteger(r.tickets_creados), align: 'right', sortKey: 'tickets_creados' },
  { header: 'Cerrados', accessor: (r) => <span className="text-sky-400">{formatInteger(r.tickets_cerrados)}</span>, align: 'right', sortKey: 'tickets_cerrados' },

  { header: '% Resueltos', accessor: (r) => <span className="font-semibold text-emerald-400">{dec(r.pct_resueltos)}%</span>, align: 'right', sortKey: 'pct_resueltos' },
  { header: '% Resueltos del Mes', accessor: (r) => <span className="text-emerald-400">{dec(r.pct_resueltos_periodo)}%</span>, align: 'right', sortKey: 'pct_resueltos_periodo' },
  { header: '% Resueltos Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_resueltos_arrastre)}%</span>, align: 'right', sortKey: 'pct_resueltos_arrastre' },

  { header: '% Cancelados', accessor: (r) => <span className="font-semibold text-rose-400">{dec(r.pct_cancelados)}%</span>, align: 'right', sortKey: 'pct_cancelados' },
  { header: '% Cancelados del Mes', accessor: (r) => <span className="text-rose-400">{dec(r.pct_cancelados_periodo)}%</span>, align: 'right', sortKey: 'pct_cancelados_periodo' },
  { header: '% Cancelados Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_cancelados_arrastre)}%</span>, align: 'right', sortKey: 'pct_cancelados_arrastre' },

  { header: '% Rezagados', accessor: (r) => <span className="font-semibold text-amber-400">{dec(r.pct_rezagados)}%</span>, align: 'right', sortKey: 'pct_rezagados' },

  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_creado_cerrados_horas' },
  { header: 'Cierre Total Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_creado_cerrados_horas' },
  { header: 'Gestión (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_asignado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_asignado_cerrados_horas' },
  { header: 'Asignación (h)', accessor: (r) => hrs(r.tiempo_medio_asignacion_horas), align: 'right', sortKey: 'tiempo_medio_asignacion_horas' },
];

interface Props {
  historico: SupportHistoricoRow[];
}

export function SupportResultsView({ historico }: Props) {
  return (
    <NeonContainer
      theme="slate"
      title="Historial de Cierres de Soporte Técnico"
      subtitle="Un bloque por periodo: los cierres se leen sobre lo cerrado en el mes y el rezago sobre lo creado"
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
