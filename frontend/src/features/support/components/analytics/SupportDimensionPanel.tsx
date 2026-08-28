import { MapPin, MousePointerClick } from 'lucide-react';

import { DataTable, EmptyState, MetricCard, NeonContainer, StatTile } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils';
import { SUPPORT_DIMENSION_LABELS } from '../../lib/supportMetrics';
import type { SupportDimension, SupportDimensionRow } from '../../types';
import { SUPPORT_DIMENSION_COLUMNS } from './supportColumns';

interface Props {
  dimension: SupportDimension;
  rows: SupportDimensionRow[];
  onSelect: (valor: string) => void;
}

/**
 * The values of the selected first-level axis inside the group.
 *
 * Clicking a row opens its tipo / razón / solución breakdown, which the backend
 * computes on request rather than storing — see `fetchSupportBreakdown`.
 */
export function SupportDimensionPanel({ dimension, rows, onSelect }: Props) {
  const label = SUPPORT_DIMENSION_LABELS[dimension];
  const top = rows.slice(0, 4);

  return (
    <NeonContainer
      theme="purple"
      title={`Desglose por ${label}`}
      subtitle={`${rows.length} valores · click en una fila para ver su tipo, razón y solución`}
      icon={<MapPin className="h-5 w-5" />}
      headerAction={
        <span className="flex items-center gap-2 rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand">
          <MousePointerClick className="h-3.5 w-3.5" />
          Drill-down
        </span>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title={`El grupo no registra ninguna ${label.toLowerCase()} en el periodo.`}
          description="Vuelve a ejecutar el análisis del mes si esperabas ver datos aquí."
          icon={<MapPin />}
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((row) => (
              <MetricCard
                label={row.nombre}
                value={`${formatTwoDecimals(row.pctDelPadre)}%`}
                subValue={`${formatInteger(row.total_tickets)}`}
                color="blue"
              />
            ))}
          </div>

          <div className="h-[480px]">
            <DataTable
              columns={SUPPORT_DIMENSION_COLUMNS}
              data={rows}
              searchable
              searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
              onRowClick={(row) => onSelect(row.nombre)}
            />
          </div>
        </>
      )}
    </NeonContainer>
  );
}
