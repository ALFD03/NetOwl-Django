import { Layers } from 'lucide-react';

import { EmptyState, NeonContainer, StatTile } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import type { SupportGroup } from '../types';

interface SupportAnalyticsViewProps {
  groups: Record<string, SupportGroup>;
}

export function SupportAnalyticsView({ groups }: SupportAnalyticsViewProps) {
  const entries = Object.entries(groups);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No hay datos de análisis disponibles para el periodo."
        icon={<Layers />}
        bordered
      />
    );
  }

  return (
    <div className="space-y-6">
      {entries.map(([groupName, group]) => (
        <NeonContainer
          key={groupName}
          theme="slate"
          title={groupName}
          icon={<Layers className="h-5 w-5" />}
          headerAction={
            <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand">
              {formatInteger(group.total_tickets_grupo)} Tickets
            </span>
          }
        >
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Razones de Falla Principales
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.razones_falla?.map((reason, idx) => (
              <StatTile
                key={idx}
                label={reason.nombre}
                value={formatInteger(reason.metricas?.total_tickets)}
                tone="brand"
                variant="boxed"
                mono
                className="p-3"
              />
            ))}
          </div>
        </NeonContainer>
      ))}
    </div>
  );
}
