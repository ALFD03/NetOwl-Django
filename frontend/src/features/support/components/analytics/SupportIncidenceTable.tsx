import { Radio } from 'lucide-react';

import { DataTable, EmptyState, NeonContainer } from '@/shared/ui';
import type { SupportZoneRow } from '../../types';
import { SUPPORT_ZONE_COLUMNS } from './supportBreakdownColumns';

interface Props {
  rows: SupportZoneRow[];
}

/**
 * Tickets per 100 active subscribers, by zone.
 *
 * Deliberately outside the group drill-down: incidence describes the zone's
 * customers, so its numerator counts every group's tickets. The denominator is
 * the subscriptions module's active count for the same period, not a live
 * headcount, so the rate can be compared across months.
 */
export function SupportIncidenceTable({ rows }: Props) {
  const sinPoblacion = rows.filter((row) => row.sinPoblacion).length;

  return (
    <NeonContainer
      theme="yellow"
      title="Incidencia por Zona"
      subtitle={
        sinPoblacion > 0
          ? `${rows.length} zonas · todos los grupos · ${sinPoblacion} sin suscriptores activos registrados`
          : `${rows.length} zonas · todos los grupos · tickets por cada 100 suscriptores activos`
      }
      icon={<Radio className="h-5 w-5" />}
      noPadding
    >
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No hay tickets con zona asignada en el periodo." icon={<Radio />} />
        </div>
      ) : (
        <div className="h-[460px]">
          <DataTable
            columns={SUPPORT_ZONE_COLUMNS}
            data={rows}
            searchable
            searchPlaceholder="Buscar zona o site..."
          />
        </div>
      )}
    </NeonContainer>
  );
}
