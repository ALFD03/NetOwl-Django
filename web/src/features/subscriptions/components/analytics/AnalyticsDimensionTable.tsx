import { Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer } from '@/shared/ui';
import { DIMENSION_LABELS } from '@/shared/constants/labels';
import type { DimensionVal } from '@/shared/types/domain';
import { ANALYTICS_DIMENSION_COLUMNS } from './analyticsDimensionColumns';

export interface AnalyticsDimensionTableProps {
  rows: DimensionVal[];
  /** Key of the dimension the rows belong to, e.g. `zona`. */
  dimension: string;
  /** Period the rows were measured in, shown in the subtitle. */
  period?: string;
}

/**
 * Full numeric backing for the charts above: every dimension value of the
 * selected period with every measure, unaggregated and unfiltered.
 */
export function AnalyticsDimensionTable({ rows, dimension, period }: AnalyticsDimensionTableProps) {
  const label = DIMENSION_LABELS[dimension as keyof typeof DIMENSION_LABELS] ?? dimension;

  return (
    <NeonContainer
      theme="slate"
      title={`Detalle por ${label}`}
      subtitle={
        period
          ? `${rows.length} registros · Periodo ${period} · Valores sin ponderar`
          : `${rows.length} registros · Valores sin ponderar`
      }
      icon={<TableIcon className="h-5 w-5" />}
      noPadding
    >
      <div className="h-[550px]">
        <DataTable
          columns={ANALYTICS_DIMENSION_COLUMNS}
          data={rows}
          searchable
          searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
          emptyMessage="No hay dimensiones para el periodo seleccionado."
        />
      </div>
    </NeonContainer>
  );
}
