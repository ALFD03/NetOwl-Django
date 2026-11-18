/** Results de soporte: el historial de cierres y el detalle de un mes en tablas. */

import { History, Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatPeriodLabel, formatTwoDecimals } from '@/shared/utils';
import type { SupportHistoricoRow, SupportResultsProps } from '../types';
import { Seccion, SeccionesNav } from './Seccion';
import { SupportMonthDetail } from './SupportMonthDetail';

const dec = formatTwoDecimals;
const hrs = formatOneDecimal;

const COLUMNS: Column<SupportHistoricoRow>[] = [
  { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodLabel(r.report_period)}</span>, sortKey: 'report_period' },
  { header: 'Creados', accessor: (r) => formatInteger(r.tickets_created), align: 'right', sortKey: 'tickets_created' },
  { header: 'Cerrados', accessor: (r) => <span className="text-sky-400">{formatInteger(r.tickets_closed)}</span>, align: 'right', sortKey: 'tickets_closed' },

  { header: '% Resueltos', accessor: (r) => <span className="font-semibold text-emerald-400">{dec(r.pct_resolved)}%</span>, align: 'right', sortKey: 'pct_resolved' },
  { header: '% Resueltos del Mes', accessor: (r) => <span className="text-emerald-400">{dec(r.pct_resolved_in_period)}%</span>, align: 'right', sortKey: 'pct_resolved_in_period' },
  { header: '% Resueltos Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_resolved_carryover)}%</span>, align: 'right', sortKey: 'pct_resolved_carryover' },

  { header: '% Cancelados', accessor: (r) => <span className="font-semibold text-rose-400">{dec(r.pct_cancelled)}%</span>, align: 'right', sortKey: 'pct_cancelled' },
  { header: '% Cancelados del Mes', accessor: (r) => <span className="text-rose-400">{dec(r.pct_cancelled_in_period)}%</span>, align: 'right', sortKey: 'pct_cancelled_in_period' },
  { header: '% Cancelados Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_cancelled_carryover)}%</span>, align: 'right', sortKey: 'pct_cancelled_carryover' },

  { header: 'Escalados', accessor: (r) => <span className="text-amber-300">{formatInteger(r.tickets_escalated)}</span>, align: 'right', sortKey: 'tickets_escalated' },
  { header: '% Escalados', accessor: (r) => <span className="font-semibold text-amber-300">{dec(r.pct_escalated)}%</span>, align: 'right', sortKey: 'pct_escalated' },

  { header: '% Rezagados', accessor: (r) => <span className="font-semibold text-amber-400">{dec(r.pct_lagging)}%</span>, align: 'right', sortKey: 'pct_lagging' },

  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.time_mean_close_created_closed_hours), align: 'right', sortKey: 'time_mean_close_created_closed_hours' },
  { header: 'Cierre Total Mediana (h)', accessor: (r) => hrs(r.time_median_close_created_closed_hours), align: 'right', sortKey: 'time_median_close_created_closed_hours' },
  { header: 'Gestión (h)', accessor: (r) => hrs(r.time_mean_close_assigned_closed_hours), align: 'right', sortKey: 'time_mean_close_assigned_closed_hours' },
  { header: 'Asignación (h)', accessor: (r) => hrs(r.time_mean_assignment_hours), align: 'right', sortKey: 'time_mean_assignment_hours' },
  { header: 'Hasta Escalar (h)', accessor: (r) => hrs(r.time_mean_escalation_hours), align: 'right', sortKey: 'time_mean_escalation_hours' },
  { header: 'Hasta Escalar Mediana (h)', accessor: (r) => hrs(r.time_median_escalation_hours), align: 'right', sortKey: 'time_median_escalation_hours' },
];

type Props = SupportResultsProps;

/**
 * Dos secciones: el historial (un bloque por mes, de toda la empresa) y el
 * detalle de un mes por grupo, que es la versión en tablas de Analytics.
 */
export function SupportResultsView({ history = [], analyticsData, periods = [], selectedPeriod = '' }: Props) {
  return (
    <div className="space-y-10">
      <SeccionesNav
        sections={[
          { id: 'historial', title: 'Historial de cierres', icon: <History /> },
          { id: 'detalle', title: 'Detalle del mes', icon: <TableIcon /> },
        ]}
      />

      <Seccion
        id="historial"
        title="Historial de cierres"
        description="Un bloque por periodo, de toda la empresa: la suma de los grupos, así que un ticket escalado cuenta en ATC y en Soporte."
        icon={<History />}
      >
        <NeonContainer
          theme="slate"
          title="Historial de Cierres de Soporte Técnico"
          subtitle="Los cierres se leen sobre lo cerrado en el mes —escalar cuenta como cerrar para ATC— y el rezago sobre lo creado"
          icon={<TableIcon className="h-5 w-5" />}
          noPadding
        >
          <div className="h-[550px]">
            <DataTable
              columns={COLUMNS}
              data={history}
              searchable
              searchPlaceholder="Buscar por periodo..."
            />
          </div>
        </NeonContainer>
      </Seccion>

      <Seccion
        id="detalle"
        title="Detalle del mes"
        description="Cada valor de la dimensión elegida con todas sus columnas, la incidencia de cada zona y el desglose de un valor al pulsarlo. Es el cierre del mes; los cortes por día están en Analytics."
        icon={<TableIcon />}
      >
        <SupportMonthDetail analyticsData={analyticsData} periods={periods} selectedPeriod={selectedPeriod} />
      </Seccion>
    </div>
  );
}
