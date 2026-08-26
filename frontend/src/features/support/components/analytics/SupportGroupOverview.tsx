import { AlertTriangle, CheckCircle2, Clock, Hourglass, Layers, PieChart, Timer, Users, XCircle } from 'lucide-react';

import {
  EmptyState,
  EquidistantTimeline,
  MetricCard,
  NeonContainer,
  ProgressBar,
  StatTile,
  type NeonTheme,
} from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils/formatters';
import type { SupportGroupStats, SupportTimeDistribution } from '../../types';

interface Props {
  groupName: string;
  stats: SupportGroupStats;
}

/**
 * A distribution panel that refuses to draw on an empty sample.
 *
 * Unmeasurable durations are now dropped rather than counted as zero, so a
 * measure can legitimately have no data at all — drawing the timeline anyway
 * would show a row of zeros that reads like a real, very fast distribution.
 */
function TimingPanel({
  title,
  subtitle,
  theme,
  icon,
  dist,
}: {
  title: string;
  subtitle: string;
  theme: NeonTheme;
  icon: JSX.Element;
  dist: SupportTimeDistribution;
}) {
  if (dist.muestra === 0) {
    return (
      <NeonContainer theme="slate" title={title} subtitle={subtitle} icon={icon}>
        <EmptyState
          title="Ningún ticket del grupo tiene las dos fechas necesarias."
          description="La duración solo se calcula cuando ambas marcas de tiempo existen y son coherentes."
          icon={icon}
        />
      </NeonContainer>
    );
  }

  return (
    <EquidistantTimeline
      title={title}
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
      pctExcedeMed={dist.pctExcedeMed}
    />
  );
}

/**
 * The selected group at a glance: outcome rates, the two closure clocks and the
 * volume split that the breakdowns below are shares of.
 */
export function SupportGroupOverview({ groupName, stats }: Props) {
  const { cierre, cierreTotal, primeraRespuesta } = stats;

  // La espera en cola es exactamente lo que separa a los dos relojes de cierre.
  const espera = Number((cierreTotal.promedio - cierre.promedio).toFixed(2));
  const share = (value: number) =>
    stats.totalTickets > 0 ? Math.round((value / stats.totalTickets) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Tickets del Grupo"
          value={formatInteger(stats.totalTickets)}
          caption={`${formatTwoDecimals(stats.sharePct)}% del periodo`}
          color="slate"
          icon={<Users className="h-4 w-4 text-slate-300" />}
        />
        <MetricCard
          label="Resueltos"
          value={`${formatTwoDecimals(stats.pctResueltos)}%`}
          caption={`${formatInteger(stats.resueltos)} tickets`}
          color="green"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        />
        <MetricCard
          label="Cancelados"
          value={`${formatTwoDecimals(stats.pctCancelados)}%`}
          caption={`${formatInteger(stats.cancelados)} tickets`}
          color="red"
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
        />
        <MetricCard
          label="Rezagados"
          value={`${formatTwoDecimals(stats.pctRezagados)}%`}
          caption={`${formatInteger(stats.rezagados)} tickets`}
          color="yellow"
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
        />
        <MetricCard
          label="Cierre desde Asignación"
          value={`${formatOneDecimal(cierre.promedio)} h`}
          caption={`Mediana ${formatOneDecimal(cierre.mediana)} h · ${formatInteger(cierre.muestra)} medidos`}
          subValue="Gestión del técnico"
          color="blue"
          icon={<Clock className="h-4 w-4 text-sky-400" />}
        />
        <MetricCard
          label="Cierre desde Creación"
          value={`${formatOneDecimal(cierreTotal.promedio)} h`}
          caption={`Mediana ${formatOneDecimal(cierreTotal.mediana)} h · ${formatInteger(cierreTotal.muestra)} medidos`}
          subValue={`${formatOneDecimal(espera)} h de espera en cola`}
          color="purple"
          icon={<Hourglass className="h-4 w-4 text-purple-400" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimingPanel
          title="Cierre desde la Asignación"
          subtitle="Cierre − primera asignación"
          theme="blue"
          icon={<Clock className="h-5 w-5" />}
          dist={cierre}
        />
        <TimingPanel
          title="Cierre desde la Creación"
          subtitle="Cierre − creación · proceso completo"
          theme="purple"
          icon={<Hourglass className="h-5 w-5" />}
          dist={cierreTotal}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimingPanel
          title="Primera Respuesta"
          subtitle="Primera asignación − creación · solo tickets asignados"
          theme="green"
          icon={<Timer className="h-5 w-5" />}
          dist={primeraRespuesta}
        />

        <NeonContainer
          theme="slate"
          title="Composición del Volumen"
          subtitle={`${groupName} · cohorte de tickets creados en el periodo`}
          icon={<PieChart className="h-5 w-5" />}
          headerAction={
            <span className="flex items-center gap-1.5 rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand">
              <Layers className="h-3.5 w-3.5" />
              {formatInteger(stats.totalTickets)} creados
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Resueltos" value={formatInteger(stats.resueltos)} tone="green" variant="boxed" mono />
            <StatTile label="Cancelados" value={formatInteger(stats.cancelados)} tone="red" variant="boxed" mono />
            <StatTile label="Rezagados" value={formatInteger(stats.rezagados)} tone="yellow" variant="boxed" mono />
          </div>

          <div className="mt-4 space-y-3">
            <ProgressBar label="Resueltos en el mes" percent={share(stats.resueltos)} valueLabel={`${share(stats.resueltos)}%`} color="green" />
            <ProgressBar label="Cancelados en el mes" percent={share(stats.cancelados)} valueLabel={`${share(stats.cancelados)}%`} color="red" />
            <ProgressBar label="Cerrados fuera del mes o abiertos" percent={share(stats.rezagados)} valueLabel={`${share(stats.rezagados)}%`} color="yellow" />
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
            Las tres categorías reparten exactamente los tickets creados en el periodo, así que
            los porcentajes suman 100%.
          </p>
        </NeonContainer>
      </div>
    </>
  );
}
