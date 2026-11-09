/** Results de soporte: el historial de cierres y el detalle de un mes en tablas. */

import { History, Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatPeriodoLabel, formatTwoDecimals } from '@/shared/utils';
import type { SupportHistoricoRow, SupportResultsProps } from '../types';
import { Seccion, SeccionesNav } from './Seccion';
import { SupportDetalleMes } from './SupportDetalleMes';

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

  { header: 'Escalados', accessor: (r) => <span className="text-amber-300">{formatInteger(r.tickets_escalados)}</span>, align: 'right', sortKey: 'tickets_escalados' },
  { header: '% Escalados', accessor: (r) => <span className="font-semibold text-amber-300">{dec(r.pct_escalados)}%</span>, align: 'right', sortKey: 'pct_escalados' },

  { header: '% Rezagados', accessor: (r) => <span className="font-semibold text-amber-400">{dec(r.pct_rezagados)}%</span>, align: 'right', sortKey: 'pct_rezagados' },

  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_creado_cerrados_horas' },
  { header: 'Cierre Total Mediana (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_creado_cerrados_horas' },
  { header: 'Gestión (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_asignado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_asignado_cerrados_horas' },
  { header: 'Asignación (h)', accessor: (r) => hrs(r.tiempo_medio_asignacion_horas), align: 'right', sortKey: 'tiempo_medio_asignacion_horas' },
  { header: 'Hasta Escalar (h)', accessor: (r) => hrs(r.tiempo_medio_escalamiento_horas), align: 'right', sortKey: 'tiempo_medio_escalamiento_horas' },
  { header: 'Hasta Escalar Mediana (h)', accessor: (r) => hrs(r.tiempo_mediana_escalamiento_horas), align: 'right', sortKey: 'tiempo_mediana_escalamiento_horas' },
];

type Props = SupportResultsProps;

/**
 * Dos secciones: el historial (un bloque por mes, de toda la empresa) y el
 * detalle de un mes por grupo, que es la versión en tablas de Analytics.
 */
export function SupportResultsView({ historico = [], analyticsData, periods = [], selectedPeriod = '' }: Props) {
  return (
    <div className="space-y-10">
      <SeccionesNav
        secciones={[
          { id: 'historial', titulo: 'Historial de cierres', icon: <History /> },
          { id: 'detalle', titulo: 'Detalle del mes', icon: <TableIcon /> },
        ]}
      />

      <Seccion
        id="historial"
        titulo="Historial de cierres"
        descripcion="Un bloque por periodo, de toda la empresa: la suma de los grupos, así que un ticket escalado cuenta en ATC y en Soporte."
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
              data={historico}
              searchable
              searchPlaceholder="Buscar por periodo..."
            />
          </div>
        </NeonContainer>
      </Seccion>

      <Seccion
        id="detalle"
        titulo="Detalle del mes"
        descripcion="Cada valor de la dimensión elegida con todas sus columnas, la incidencia de cada zona y el desglose de un valor al pulsarlo. Es el cierre del mes; los cortes por día están en Analytics."
        icon={<TableIcon />}
      >
        <SupportDetalleMes analyticsData={analyticsData} periods={periods} selectedPeriod={selectedPeriod} />
      </Seccion>
    </div>
  );
}
