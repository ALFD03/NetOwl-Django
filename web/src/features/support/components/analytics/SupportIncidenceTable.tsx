import { Radio } from 'lucide-react';

import { DataTable, EmptyState, NeonContainer } from '@/shared/ui';
import type { SupportZoneRow } from '../../types';
import { SUPPORT_ZONE_COLUMNS } from './supportColumns';

interface Props {
  rows: SupportZoneRow[];
  /** The work group the rows are scoped to, named in the subtitle. */
  groupName: string;
}

/**
 * Tickets per 100 active subscribers, by zone, for the selected work group.
 *
 * Only the numerator follows the group: subscribers are never split by support
 * group, so the denominator stays the zone's whole active base — the
 * subscriptions module's count for the same period, not a live headcount, so
 * the rate stays comparable across months. Each group's rates therefore add up
 * to the zone's total incidence.
 */
export function SupportIncidenceTable({ rows, groupName }: Props) {
  const sinPoblacion = rows.filter((row) => row.sinPoblacion).length;

  return (
    <NeonContainer
      theme="yellow"
      title="Incidencia por Zona"
      subtitle={
        sinPoblacion > 0
          ? `${rows.length} zonas · ${groupName} · ${sinPoblacion} sin suscriptores activos registrados`
          : `${rows.length} zonas · ${groupName} · tickets por cada 100 suscriptores activos de la zona`
      }
      icon={<Radio className="h-5 w-5" />}
      noPadding
    >
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={`${groupName} no tiene tickets con zona asignada en el periodo.`}
            icon={<Radio />}
          />
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
