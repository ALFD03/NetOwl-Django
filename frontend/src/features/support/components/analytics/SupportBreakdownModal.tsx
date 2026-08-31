import { useState } from 'react';
import { AlertOctagon, Layers, Loader2, Wrench } from 'lucide-react';

import { DataTable, EmptyState, MetricCard, Modal, StatTile, StatusMessage, ToggleGroup } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils';
import { SUPPORT_DESGLOSE_LABELS, SUPPORT_DIMENSION_LABELS } from '../../lib/supportMetrics';
import { SUPPORT_DESGLOSES, type SupportDesglose, type SupportDimension } from '../../types';
import type { SupportBreakdownState } from '../../hooks/useSupportAnalytics';
import { SUPPORT_DIMENSION_COLUMNS } from './supportColumns';

const TAB_ICONS: Record<SupportDesglose, JSX.Element> = {
  tipo_solicitud: <Layers className="h-4 w-4" />,
  razon_falla: <AlertOctagon className="h-4 w-4" />,
  solucion_falla: <Wrench className="h-4 w-4" />,
};

interface Props {
  dimension: SupportDimension;
  breakdown: SupportBreakdownState;
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
export function SupportBreakdownModal({ dimension, breakdown, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SupportDesglose>('razon_falla');

  const { valor, loading, error, stats, desgloses } = breakdown;
  const rows = desgloses[activeTab];

  return (
    <Modal
      isOpen={valor !== null}
      onClose={onClose}
      title={valor ?? ''}
      subtitle={`${SUPPORT_DIMENSION_LABELS[dimension]} · desglose por ${SUPPORT_DESGLOSE_LABELS[activeTab].toLowerCase()}`}
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
            <MetricCard label="Creados" value={formatInteger(stats.tickets_creados)} color="slate" />
            <MetricCard label="Cerrados" value={formatInteger(stats.tickets_cerrados)} color="purple" />
            <MetricCard label="% Resueltos" value={`${formatTwoDecimals(stats.pct_resueltos)}%`} caption="de los cerrados" color="green" />
            <MetricCard label="% Rezagados" value={`${formatTwoDecimals(stats.pct_rezagados)}%`} caption="de los creados" color="yellow" />
            <MetricCard label="Cierre Total" value={`${formatOneDecimal(stats.tiempo_medio_cierre_creado_cerrados_horas)} h`} caption="creación → cierre" color="blue" />
            <MetricCard label="Asignación" value={`${formatOneDecimal(stats.tiempo_medio_asignacion_horas)} h`} caption="creación → asignación" color="slate" />
          </div>

          <ToggleGroup
            className="flex-wrap"
            options={SUPPORT_DESGLOSES.map((key) => ({
              key,
              label: SUPPORT_DESGLOSE_LABELS[key],
              icon: TAB_ICONS[key],
            }))}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as SupportDesglose)}
          />

          {rows.length === 0 ? (
            <EmptyState
              title={`Sin ${SUPPORT_DESGLOSE_LABELS[activeTab].toLowerCase()} registrada para este valor.`}
              icon={TAB_ICONS[activeTab]}
            />
          ) : (
            <div className="h-[420px]">
              <DataTable
                columns={SUPPORT_DIMENSION_COLUMNS}
                data={rows}
                searchable
                searchPlaceholder={`Buscar ${SUPPORT_DESGLOSE_LABELS[activeTab].toLowerCase()}...`}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
