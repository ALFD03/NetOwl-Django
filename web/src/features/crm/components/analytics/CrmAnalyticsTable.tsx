import { Table as TableIcon } from 'lucide-react';

import { DataTable, NeonContainer } from '@/shared/ui';
import { CRM_DIMENSION_LABELS } from '@/shared/constants/labels';
import { formatPeriodoLabel } from '@/shared/utils';
import type { CrmDimensionValue } from '../../types';
import { CRM_ANALYTICS_COLUMNS } from './crmAnalyticsColumns';

interface Props {
  rows: CrmDimensionValue[];
  /** Key of the dimension the rows belong to, e.g. `sucursal`. */
  dimension: string;
  /** Period the rows were measured in, shown in the subtitle. */
  period?: string;
}

/**
 * Full numeric backing for the charts above: every value of the selected
 * dimension with every measure, unaggregated and unfiltered.
 */
export function CrmAnalyticsTable({ rows, dimension, period }: Props) {
  const label =
    CRM_DIMENSION_LABELS[dimension as keyof typeof CRM_DIMENSION_LABELS] ?? dimension;

  return (
    <NeonContainer
      theme="slate"
      title={`Detalle por ${label}`}
      subtitle={
        period
          ? `${rows.length} registros · Periodo ${formatPeriodoLabel(period)} · Valores sin ponderar`
          : `${rows.length} registros · Valores sin ponderar`
      }
      icon={<TableIcon className="h-5 w-5" />}
      noPadding
    >
      <div className="h-[550px]">
        <DataTable
          columns={CRM_ANALYTICS_COLUMNS}
          data={rows}
          searchable
          searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
          emptyMessage="No hay dimensiones para el periodo seleccionado."
        />
      </div>
    </NeonContainer>
  );
}
