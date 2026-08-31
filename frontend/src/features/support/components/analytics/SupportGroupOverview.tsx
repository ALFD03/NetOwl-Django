import { AlertTriangle, CheckCircle2, Clock, Hourglass, Layers, Timer, Users, XCircle } from 'lucide-react';

import {
  EmptyState,
  EquidistantTimeline,
  MetricCard,
  NeonContainer,
  ProgressBar,
  StatTile,
  type NeonTheme,
} from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils';
import {
  ASIGNACION,
  CIERRE_TOTAL,
  GESTION,
  TIME_MEASURE_META,
  distribution,
} from '../../lib/supportMetrics';
import { MEASURE_ICONS } from '../../lib/measureIcons';
import {
  SUPPORT_TIME_MEASURES,
  type SupportStats,
  type SupportTimeDistribution,
  type SupportTimeMeasure,
} from '../../types';

interface Props {
  groupName: string;
  stats: SupportStats;
  sharePct: number;
}

/**
 * A distribution panel that refuses to draw on an empty sample.
 *
 * Unmeasurable durations are dropped rather than counted as zero, so a measure
 * can legitimately have no data at all — drawing the timeline anyway would show
 * a row of zeros that reads like a real, very fast distribution.
 */
function TimingPanel({
  medida,
  theme,
  icon,
  dist,
}: {
  medida: SupportTimeMeasure;
  theme: NeonTheme;
  icon: JSX.Element;
  dist: SupportTimeDistribution;
}) {
  const { label, caption } = TIME_MEASURE_META[medida];
  const subtitle = `${caption} · ${formatInteger(dist.muestra)} medidos`;

  if (dist.muestra === 0) {
    return (
      <NeonContainer theme="slate" title={label} subtitle={subtitle} icon={icon}>
        <EmptyState
          title="Ningún ticket del grupo tiene las dos fechas necesarias."
          description="La duración sólo se calcula cuando ambas marcas de tiempo existen y son coherentes."
          icon={icon}
        />
      </NeonContainer>
    );
  }

  return (
    <EquidistantTimeline
      title={label}
      subtitle={subtitle}
      icon={icon}
      theme={theme}
      min={dist.min}
      p25={dist.p25}
      mediana={dist.mediana}
      promedio={dist.promedio}
      p75={dist.p75}
      max={dist.max}
      std={dist.std}
      pctExcedeProm={dist.pctExcedeProm}
    />
  );
}


/**
 * The selected group at a glance.
 *
 * Only the three headline clocks get a full distribution panel — one per
 * formula. The resolved / cancelled variants stay as means in the card row
 * above: seven timelines on one screen is a wall, and the split only matters
 * once the headline figure has raised a question.
 */
export function SupportGroupOverview({ groupName, stats, sharePct }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Tickets del Grupo" value={formatInteger(stats.total_tickets)} caption={`${formatTwoDecimals(sharePct)}% del periodo`} color="slate" icon={<Users className="h-4 w-4 text-slate-300" />} />
        <MetricCard label="Creados" value={formatInteger(stats.tickets_creados)} caption="entraron en el mes" color="slate" icon={<Users className="h-4 w-4 text-slate-300" />} />
        <MetricCard label="Cerrados" value={formatInteger(stats.tickets_cerrados)} caption="se despacharon en el mes" color="blue" icon={<Layers className="h-4 w-4 text-sky-400" />} />
        <MetricCard label="% Resueltos" value={`${stats.pct_resueltos}%`} caption={`${formatInteger(stats.tickets_resueltos)} de los cerrados`} color="green" icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
        <MetricCard label="% Rezagados" value={`${stats.pct_rezagados}%`} caption={`${formatInteger(stats.tickets_rezagados)} de los creados`} color="yellow" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} />
      </div>

      <NeonContainer
        theme="slate"
        title={`Composición de ${groupName}`}
        subtitle="Los cuatro sumandos se leen sobre los cerrados del mes y suman el 100 %"
        icon={<Layers className="h-5 w-5" />}
      >
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Resueltos del mes" subValue={`${formatInteger(stats.tickets_resueltos_periodo)} Tickets Cerrados en Etapa Resuelto`} value={`${formatTwoDecimals(stats.pct_resueltos_periodo)}%`} color="green" />
          <MetricCard label="Resueltos arrastre" subValue={`${formatInteger(stats.tickets_resueltos_arrastre)} Tickets Cerrados en Etapa Cancelados`} value={`${formatTwoDecimals(stats.pct_resueltos_arrastre)}%`} color="purple" />
          <MetricCard label="Cancelados del mes" subValue={formatInteger(stats.tickets_cancelados_periodo)} value={`${formatTwoDecimals(stats.pct_cancelados_periodo)}%`} color="red" />
          <MetricCard label="Cancelados arrastre" subValue={formatInteger(stats.tickets_cancelados_arrastre)} value={`${formatTwoDecimals(stats.pct_cancelados_arrastre)}%`} color="yellow" />
        </div>

        <div className="space-y-3">
          <ProgressBar label="Resueltos del mes" percent={stats.pct_resueltos_periodo} valueLabel={`${formatTwoDecimals(stats.pct_resueltos_periodo)}%`} color="green" />
          <ProgressBar label="Resueltos de meses anteriores" percent={stats.pct_resueltos_arrastre} valueLabel={`${formatTwoDecimals(stats.pct_resueltos_arrastre)}%`} color="purple" />
          <ProgressBar label="Cancelados del mes" percent={stats.pct_cancelados_periodo} valueLabel={`${formatTwoDecimals(stats.pct_cancelados_periodo)}%`} color="red" />
          <ProgressBar label="Cancelados de meses anteriores" percent={stats.pct_cancelados_arrastre} valueLabel={`${formatTwoDecimals(stats.pct_cancelados_arrastre)}%`} color="yellow" />
        </div>
      </NeonContainer>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {SUPPORT_TIME_MEASURES.map((medida) => {
          const meta = TIME_MEASURE_META[medida];

          return (
            <MetricCard
              key={medida}
              label={meta.label}
              value={`${stats[`tiempo_medio_${medida}_horas`]} h`}
              color={meta.color}
              subValue={`${formatInteger(stats[`muestra_${medida}`])} medidos`}
              icon={MEASURE_ICONS[meta.color]}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimingPanel medida={CIERRE_TOTAL} theme="blue" icon={<Clock className="h-5 w-5" />} dist={distribution(stats, CIERRE_TOTAL)} />
        <TimingPanel medida={GESTION} theme="purple" icon={<Timer className="h-5 w-5" />} dist={distribution(stats, GESTION)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
        <TimingPanel medida={ASIGNACION} theme="slate" icon={<Hourglass className="h-5 w-5" />} dist={distribution(stats, ASIGNACION)} />
      </div>
    </>
  );
}
