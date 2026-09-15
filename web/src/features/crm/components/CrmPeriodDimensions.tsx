/** Las filas dimensionales de un periodo, cargadas al abrir su detalle. */

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';

import { DataTable, ToggleGroup } from '@/shared/ui';
import { CRM_DIMENSION_LABELS, type CrmDimensionKey } from '@/shared/constants/labels';
import { CRM_ANALYTICS_COLUMNS } from './analytics/crmAnalyticsColumns';
import { useCrmPeriodDimensions } from '../hooks/useCrmPeriodDimensions';
import { selectCrmDimension } from '../lib/crmDimensions';

interface CrmPeriodDimensionsProps {
  /** Period to break down, or `null` while no modal is open. */
  period: string | null;
}

const DIMENSION_OPTIONS = Object.entries(CRM_DIMENSION_LABELS).map(([key, label]) => ({ key, label }));

/**
 * Dimensional breakdown of the period shown in the Results modal: the same
 * measures as the cohort above, sliced by branch, campaign or seller.
 */
export function CrmPeriodDimensions({ period }: CrmPeriodDimensionsProps) {
  const [dimension, setDimension] = useState<CrmDimensionKey>('sucursal');
  const { rows, loading } = useCrmPeriodDimensions(period);

  const values = useMemo(() => selectCrmDimension(rows, dimension), [rows, dimension]);
  const label = CRM_DIMENSION_LABELS[dimension];

  return (
    <div className="rounded-3xl border border-slate-800 bg-surface-primary p-4 shadow-inner">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand" />
          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            Desglose Dimensional
          </h4>
          <span className="text-[10px] font-bold uppercase text-slate-600">
            {loading ? 'Cargando…' : `${values.length} registros`}
          </span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-surface-tertiary p-1">
          <ToggleGroup
            options={DIMENSION_OPTIONS}
            activeKey={dimension}
            onChange={(key) => setDimension(key as CrmDimensionKey)}
          />
        </div>
      </div>

      <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800">
        <DataTable
          columns={CRM_ANALYTICS_COLUMNS}
          data={values}
          isLoading={loading}
          searchable
          searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
          emptyMessage="El periodo no tiene dimensiones registradas."
        />
      </div>
    </div>
  );
}
