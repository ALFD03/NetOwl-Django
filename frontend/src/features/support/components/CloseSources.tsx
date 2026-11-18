/** De lo cerrado en el mes, cuánto nació en él y cuánto venía arrastrado. */

import { Layers } from 'lucide-react';

import { NeonContainer, ProgressBar, StatTile } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils';
import type { useSupportDashboard } from '../hooks/useSupportDashboard';

export function CloseSources({
  stats,
}: {
  stats: ReturnType<typeof useSupportDashboard>['stats'];
}) {
  return (
    <NeonContainer
      theme="slate"
      title="Origen de los Cierres"
      subtitle="De lo cerrado en el mes, cuánto nació en él y cuánto venía arrastrado · escalar a Soporte es cerrar para ATC"
      icon={<Layers className="h-5 w-5" />}
    >
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Resueltos del mes"
            value={`${formatTwoDecimals(stats.pct_resolved_in_period)}%`}
            caption={`${formatInteger(stats.tickets_resolved_in_period)} tickets`}
            tone="green"
            variant="boxed"
            mono
          />
          <StatTile
            label="Resueltos arrastre"
            value={`${formatTwoDecimals(stats.pct_resolved_carryover)}%`}
            caption={`${formatInteger(stats.tickets_resolved_carryover)} tickets`}
            tone="purple"
            variant="boxed"
            mono
          />
          <StatTile
            label="Cancelados del mes"
            value={`${formatTwoDecimals(stats.pct_cancelled_in_period)}%`}
            caption={`${formatInteger(stats.tickets_cancelled_in_period)} tickets`}
            tone="red"
            variant="boxed"
            mono
          />
          <StatTile
            label="Cancelados arrastre"
            value={`${formatTwoDecimals(stats.pct_cancelled_carryover)}%`}
            caption={`${formatInteger(stats.tickets_cancelled_carryover)} tickets`}
            tone="purple"
            variant="boxed"
            mono
          />
          <StatTile
            label="Escalados del mes"
            value={`${formatTwoDecimals(stats.pct_escalated_in_period)}%`}
            caption={`${formatInteger(stats.tickets_escalated_in_period)} tickets`}
            tone="yellow"
            variant="boxed"
            mono
          />
          <StatTile
            label="Escalados arrastre"
            value={`${formatTwoDecimals(stats.pct_escalated_carryover)}%`}
            caption={`${formatInteger(stats.tickets_escalated_carryover)} tickets`}
            tone="slate"
            variant="boxed"
            mono
          />
        </div>

        {/* Los seis sumandos comparten denominador —los cerrados del mes, con lo
              que ATC escaló—, así que las barras se leen unas contra otras y
              suman 100 %. */}
        <div className="space-y-3">
          <ProgressBar
            label="Resueltos del mes"
            percent={stats.pct_resolved_in_period}
            valueLabel={`${formatTwoDecimals(stats.pct_resolved_in_period)}%`}
            color="green"
          />
          <ProgressBar
            label="Resueltos de meses anteriores"
            percent={stats.pct_resolved_carryover}
            valueLabel={`${formatTwoDecimals(stats.pct_resolved_carryover)}%`}
            color="purple"
          />
          <ProgressBar
            label="Cancelados del mes"
            percent={stats.pct_cancelled_in_period}
            valueLabel={`${formatTwoDecimals(stats.pct_cancelled_in_period)}%`}
            color="red"
          />
          <ProgressBar
            label="Cancelados de meses anteriores"
            percent={stats.pct_cancelled_carryover}
            valueLabel={`${formatTwoDecimals(stats.pct_cancelled_carryover)}%`}
            color="yellow"
          />
          <ProgressBar
            label="Escalados a Soporte del mes"
            percent={stats.pct_escalated_in_period}
            valueLabel={`${formatTwoDecimals(stats.pct_escalated_in_period)}%`}
            color="yellow"
          />
          <ProgressBar
            label="Escalados de meses anteriores"
            percent={stats.pct_escalated_carryover}
            valueLabel={`${formatTwoDecimals(stats.pct_escalated_carryover)}%`}
            color="slate"
          />
        </div>
      </div>
    </NeonContainer>
  );
}
