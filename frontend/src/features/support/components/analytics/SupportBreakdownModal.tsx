/** El drill-down de un valor: sus tipos, razones y soluciones. */

import { useState } from 'react';
import { AlertOctagon, Layers, Loader2, Wrench } from 'lucide-react';

import { DataTable, EmptyState, ExcelExportButton, MetricCard, Modal, StatusMessage, ToggleGroup } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils';
import { SUPPORT_DIMENSION_EXCEL_COLUMNS, supportExportFileName } from '../../lib/supportExport';
import { SUPPORT_BREAKDOWN_LABELS, SUPPORT_DIMENSION_LABELS } from '../../lib/supportMetrics';
import { SUPPORT_BREAKDOWNS, type SupportBreakdown, type SupportDimension } from '../../types';
import type { SupportBreakdownState } from '../../hooks/useSupportAnalytics';
import { SUPPORT_DIMENSION_COLUMNS } from './supportColumns';

const TAB_ICONS: Record<SupportBreakdown, JSX.Element> = {
  tipo_solicitud: <Layers className="h-4 w-4" />,
  razon_falla: <AlertOctagon className="h-4 w-4" />,
  solucion_falla: <Wrench className="h-4 w-4" />,
};

interface Props {
  dimension: SupportDimension;
  breakdown: SupportBreakdownState;
  /** Sólo para nombrar el archivo exportado. */
  groupName: string;
  period: string;
  onClose: () => void;
}

/**
 * The tipo / razón / solución breakdown of one dimension value.
 *
 * It arrives from the server on open instead of coming down with the page: the
 * cross of every zone, branch and technician against the ~160 reasons and
 * solutions is far too large to persist or to ship up front, and it is only
 * ever read one cell at a time.
 */
export function SupportBreakdownModal({ dimension, breakdown, groupName, period, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SupportBreakdown>('razon_falla');

  const { value, loading, error, stats, breakdowns } = breakdown;
  const rows = breakdowns[activeTab];

  return (
    <Modal
      isOpen={value !== null}
      onClose={onClose}
      title={value ?? ''}
      subtitle={`${SUPPORT_DIMENSION_LABELS[dimension]} · desglose por ${SUPPORT_BREAKDOWN_LABELS[activeTab].toLowerCase()}`}
      theme="purple"
      icon={TAB_ICONS[activeTab]}
      size="wide"
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Calculando el desglose…</span>
        </div>
      ) : error ? (
        <StatusMessage status={{ type: 'error', text: error }} icon={<AlertOctagon />} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <MetricCard label="Creados" value={formatInteger(stats.tickets_created)} color="slate" />
            <MetricCard label="Cerrados" value={formatInteger(stats.tickets_closed)} color="purple" />
            <MetricCard label="% Resueltos" value={`${formatTwoDecimals(stats.pct_resolved)}%`} caption="de los cerrados" color="green" />
            {stats.tickets_escalated > 0 && (
              <MetricCard label="% Escalados" value={`${formatTwoDecimals(stats.pct_escalated)}%`} caption="de los cerrados, a Soporte" color="yellow" />
            )}
            <MetricCard label="% Rezagados" value={`${formatTwoDecimals(stats.pct_lagging)}%`} caption="de los creados" color="yellow" />
            <MetricCard label="Cierre Total" value={`${formatOneDecimal(stats.time_mean_close_created_closed_hours)} h`} caption="creación → cierre" color="blue" />
            <MetricCard label="Asignación" value={`${formatOneDecimal(stats.time_mean_assignment_hours)} h`} caption="creación → asignación" color="slate" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              options={SUPPORT_BREAKDOWNS.map((key) => ({
                key,
                label: SUPPORT_BREAKDOWN_LABELS[key],
                icon: TAB_ICONS[key],
              }))}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as SupportBreakdown)}
            />

            {/* Se exporta la pestaña abierta, no las tres: es el cuadro que se
                está leyendo, y las otras dos son otro corte del mismo valor. */}
            <ExcelExportButton
              rows={rows}
              columns={SUPPORT_DIMENSION_EXCEL_COLUMNS}
              fileName={supportExportFileName([
                SUPPORT_BREAKDOWN_LABELS[activeTab],
                value ?? '',
                groupName,
                period,
              ])}
              sheetName={SUPPORT_BREAKDOWN_LABELS[activeTab]}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={`Sin ${SUPPORT_BREAKDOWN_LABELS[activeTab].toLowerCase()} registrada para este valor.`}
              icon={TAB_ICONS[activeTab]}
            />
          ) : (
            <div className="h-[420px]">
              <DataTable
                columns={SUPPORT_DIMENSION_COLUMNS}
                data={rows}
                searchable
                searchPlaceholder={`Buscar ${SUPPORT_BREAKDOWN_LABELS[activeTab].toLowerCase()}...`}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
