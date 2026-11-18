/** Tabla de cierres por periodo, con detalle al pulsar una fila. */

import { useMemo, useState } from 'react';
import { Activity, Table as TableIcon } from 'lucide-react';

import { DataTable, Modal, NeonContainer, ToggleGroup } from '@/shared/ui';
import { DIMENSION_CONFIG } from '@/shared/constants/labels';
import { formatInteger } from '@/shared/utils/formatters';
import { ChurnExportButton } from '../reports/ChurnExportButton';
import { SubscriptionPeriodDetail } from './SubscriptionPeriodDetail';
import { buildDimensionColumns, buildPeriodColumns, withComplianceData } from './subscriptionResultsColumns';
import { useTargets } from '../../hooks/useTargets';
import { useSubscriptionResults } from '../../hooks/useSubscriptionResults';
import type { SubscriptionClose } from '../../types';

interface SubscriptionResultsViewProps {
  periodos: SubscriptionClose[];
}

const DIMENSION_OPTIONS = Object.entries(DIMENSION_CONFIG).map(([key, config]) => ({
  key,
  label: config.label,
  icon: config.icon,
}));

export function SubscriptionResultsView({ periodos }: SubscriptionResultsViewProps) {
  const [selectedRow, setSelectedRow] = useState<SubscriptionClose | null>(null);
  const [activeDimension, setActiveDimension] = useState('zona');
  const { data: details, loading } = useSubscriptionResults(selectedRow?.report_period ?? null);
  const objetivos = useTargets();
  const columns = useMemo(() => buildPeriodColumns(objetivos.thresholds), [objetivos]);
  const dimensionColumns = useMemo(() => buildDimensionColumns(objetivos.thresholds), [objetivos]);
  const filas = useMemo(() => withComplianceData(periodos, objetivos), [periodos, objetivos]);

  const activeLabel = DIMENSION_CONFIG[activeDimension]?.label ?? activeDimension;

  return (
    <>
      <NeonContainer
        theme="slate"
        title="Historial de Cierres de Suscripciones"
        subtitle="Haz clic en cualquier periodo para ver el desglose dimensional"
        icon={<TableIcon className="h-5 w-5" />}
        noPadding
      >
        <div className="h-[550px]">
          <DataTable columns={columns} data={filas} searchable onRowClick={setSelectedRow} />
        </div>
      </NeonContainer>

      <Modal
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title={`Detalle de Periodo: ${selectedRow?.report_period ?? ''}`}
        size="wide"
      >
        {selectedRow && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                {formatInteger(selectedRow.churned)} bajas en el periodo
              </p>
              <ChurnExportButton
                period={selectedRow.report_period}
                scope="del periodo"
                label="Exportar bajas del periodo"
              />
            </div>

            <SubscriptionPeriodDetail row={selectedRow} />

            <div className="rounded-3xl border border-slate-800 bg-surface-primary p-4 shadow-inner">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-brand" />
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Desglose Dimensional
                  </h4>
                </div>
                <div className="rounded-xl border border-slate-800 bg-surface-tertiary p-1">
                  <ToggleGroup
                    options={DIMENSION_OPTIONS}
                    activeKey={activeDimension}
                    onChange={setActiveDimension}
                  />
                </div>
              </div>

              <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800">
                <DataTable
                  columns={dimensionColumns}
                  data={details?.dimensions[activeDimension] ?? []}
                  isLoading={loading}
                  searchable
                  searchPlaceholder={`Buscar en ${activeLabel}...`}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
