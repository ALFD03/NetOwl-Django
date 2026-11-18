/**
 * El resumen de un grupo de trabajo: volúmenes, desenlaces, recorrido y tiempos.
 *
 * Lo que ATC escala a Soporte está dentro de las cifras de los dos grupos (ver
 * `services/support/analytics/escalamiento.py`): para ATC escalar es cerrar, así
 * que cuenta en sus tickets, creados y cerrados, no en resueltos; para Soporte
 * es un ticket que le entra el día del escalamiento.
 */

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  GitBranch,
  Hourglass,
  Layers,
  PieChart,
  Timer,
  Users,
} from 'lucide-react';

import { SankeyChart } from '@/shared/charts';
import type { SankeyEnlace, SankeyNode } from '@/shared/charts';
import { METRIC_COLOR } from '@/shared/constants/theme';
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
import { formatDuration } from '../../lib/flowFormat';
import { MEASURE_ICONS } from '../../lib/measureIcons';
import { QUE_ES_TIPO, timeParts, timeDonutData } from '../../lib/supportCharts';
import { CenteredRing } from './CenteredRing';
import {
  ASIGNACION,
  CLOSE_TOTAL,
  ESCALATION,
  HANDLING,
  TIME_MEASURE_META,
  distribution,
} from '../../lib/supportMetrics';
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

const pct = (v: number) => `${formatTwoDecimals(v)}%`;

/**
 * A distribution panel that refuses to draw on an empty sample.
 *
 * Unmeasurable durations are dropped rather than counted as zero, so a measure
 * can legitimately have no data at all — drawing the timeline anyway would show
 * a row of zeros that reads like a real, very fast distribution.
 */
function TimingPanel({
  measure,
  theme,
  icon,
  dist,
}: {
  measure: SupportTimeMeasure;
  theme: NeonTheme;
  icon: JSX.Element;
  dist: SupportTimeDistribution;
}) {
  const { label, caption } = TIME_MEASURE_META[measure];
  const subtitle = `${caption} · ${formatInteger(dist.sample)} medidos`;

  if (dist.sample === 0) {
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
      mediana={dist.median}
      promedio={dist.promedio}
      p75={dist.p75}
      max={dist.max}
      std={dist.std}
      pctExcedeProm={dist.pctExcedeProm}
    />
  );
}

/**
 * Qué pasó con el trabajo del grupo en el mes: de dónde salió lo que despachó
 * —lo creado en el mes y lo que venía de antes— y cómo terminó.
 *
 * Lo creado se reparte exacto entre lo que cerró dentro del mes y lo que no
 * («sin cerrar en el mes»), porque los tres desenlaces «del mes» son justo lo
 * nacido y cerrado en él. El arrastre sólo alimenta desenlaces: lo que entra de
 * meses anteriores y sigue abierto no está en la cohorte del mes.
 */
function MonthPath({ groupName, stats }: { groupName: string; stats: SupportStats }) {
  const ofMonth = {
    resueltos: stats.tickets_resolved_in_period,
    cancelados: stats.tickets_cancelled_in_period,
    escalados: stats.tickets_escalated_in_period,
  };
  const arrastre = {
    resueltos: stats.tickets_resolved_carryover,
    cancelados: stats.tickets_cancelled_carryover,
    escalados: stats.tickets_escalated_carryover,
  };
  const notClosed = Math.max(
    0,
    stats.tickets_created - ofMonth.resueltos - ofMonth.cancelados - ofMonth.escalados,
  );
  const recibidos = stats.tickets_received_escalated;

  const origenes: SankeyNode[] = [
    {
      id: 'creados',
      label: 'Creados en el mes',
      color: METRIC_COLOR.blue,
      caption: recibidos > 0 ? `${formatInteger(recibidos)} llegaron de ATC` : undefined,
    },
    { id: 'arrastre', label: 'De meses anteriores', color: METRIC_COLOR.purple },
  ];
  const destinos: SankeyNode[] = [
    { id: 'resueltos', label: 'Resueltos', color: METRIC_COLOR.green },
    { id: 'cancelados', label: 'Cancelados', color: METRIC_COLOR.red },
    { id: 'escalados', label: 'Escalados a Soporte', color: METRIC_COLOR.yellow },
    { id: 'abiertos', label: 'Sin cerrar en el mes', color: METRIC_COLOR.slate },
  ];
  const enlaces: SankeyEnlace[] = [
    { origen: 'creados', destino: 'resueltos', valor: ofMonth.resueltos },
    { origen: 'creados', destino: 'cancelados', valor: ofMonth.cancelados },
    { origen: 'creados', destino: 'escalados', valor: ofMonth.escalados },
    { origen: 'creados', destino: 'abiertos', valor: notClosed },
    { origen: 'arrastre', destino: 'resueltos', valor: arrastre.resueltos },
    { origen: 'arrastre', destino: 'cancelados', valor: arrastre.cancelados },
    { origen: 'arrastre', destino: 'escalados', valor: arrastre.escalados },
  ];

  const vacio = enlaces.every((e) => e.valor <= 0);

  return (
    <NeonContainer
      theme="blue"
      title="Recorrido del mes"
      subtitle={`Lo que entró a ${groupName} y lo que venía de antes, hasta cómo terminó. Pasa el ratón por una banda para ver su cifra.`}
      icon={<GitBranch className="h-5 w-5" />}
    >
      {vacio ? (
        <EmptyState title="El grupo no tiene tickets en el corte." icon={<GitBranch />} />
      ) : (
        <SankeyChart origenes={origenes} targets={destinos} enlaces={enlaces} formatValue={formatInteger} />
      )}
    </NeonContainer>
  );
}

/**
 * En qué se le va el tiempo al grupo: cola, pausa y gestión de lo que cerró,
 * de los logs de etapa. Al lado, el tiempo hasta escalar, que es lo que ATC
 * tarda en decidir que un ticket no es suyo.
 */
function WhereTimeGoes({ stats }: { stats: SupportStats }) {
  const { parts, total } = timeParts(stats);
  const escalar = distribution(stats, ESCALATION);
  const muestra = stats.composition_sample;

  return (
    <NeonContainer
      theme="purple"
      title="En qué se va el tiempo"
      subtitle={
        muestra > 0
          ? `Horas promedio por tipo de etapa de lo cerrado en el mes · ${formatInteger(muestra)} tickets con logs de etapa`
          : 'Sale de los logs de etapa del mes'
      }
      icon={<PieChart className="h-5 w-5" />}
    >
      {muestra === 0 ? (
        <EmptyState
          title="Sin logs de etapa para lo cerrado en este corte."
          description="Carga los «Registros de tiempo» del mes en Importaciones › Soporte técnico y vuelve a ejecutar el análisis."
          icon={<PieChart />}
          size="md"
        />
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <CenteredRing
            data={timeDonutData(parts)}
            center={{ title: 'Promedio', value: formatDuration(total) }}
            onHover={(i) => ({
              title: parts[i]?.label ?? '',
              value: `${formatDuration(parts[i]?.hours ?? 0)} · ${parts[i]?.pct ?? 0}%`,
            })}
            className="mx-auto aspect-square w-full max-w-[20rem]"
          />

          <div className="space-y-3">
            {parts.map((p) => (
              <div key={p.type} className="flex items-center gap-3">
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-white">{p.label}</span>
                    <span className="font-mono text-sm font-black text-white">
                      {formatDuration(p.hours)}
                      <span className="ml-2 text-xs font-semibold text-slate-400">{p.pct}%</span>
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">{QUE_ES_TIPO[p.type]}</p>
                </div>
              </div>
            ))}

            {escalar.sample > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4">
                <StatTile
                  label="Promedio para escalar"
                  value={formatDuration(escalar.promedio)}
                  caption={`${formatInteger(escalar.sample)} escalados · mediana ${formatDuration(escalar.median)}`}
                  tone="yellow"
                  variant="boxed"
                  mono
                />
                <StatTile
                  label="Tardan más que el promedio"
                  value={pct(escalar.pctExcedeProm)}
                  caption={`de los escalados pasan de ${formatDuration(escalar.promedio)}`}
                  tone="yellow"
                  variant="boxed"
                  mono
                />
              </div>
            )}
          </div>
        </div>
      )}
    </NeonContainer>
  );
}

/**
 * The selected group at a glance.
 *
 * Only the headline clocks get a full distribution panel — one per formula,
 * plus the time to escalate when the group escalates. The resolved / cancelled
 * variants stay as means in the card row.
 */
export function SupportGroupOverview({ groupName, stats, sharePct }: Props) {
  const escala = stats.tickets_escalated > 0 || stats.sample_escalation > 0;
  const recibe = stats.tickets_received_escalated > 0;
  const medidas = SUPPORT_TIME_MEASURES.filter((m) => m !== ESCALATION || escala);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Tickets del Grupo"
          value={formatInteger(stats.total_tickets)}
          caption={escala ? `${pct(sharePct)} del periodo · incluye los escalados` : `${pct(sharePct)} del periodo`}
          color="slate"
          icon={<Users className="h-4 w-4 text-slate-300" />}
        />
        <MetricCard
          label="Creados"
          value={formatInteger(stats.tickets_created)}
          caption={recibe ? `entraron en el mes · ${formatInteger(stats.tickets_received_escalated)} llegaron de ATC` : 'entraron en el mes'}
          color="slate"
          icon={<Users className="h-4 w-4 text-slate-300" />}
        />
        <MetricCard
          label="Cerrados"
          value={formatInteger(stats.tickets_closed)}
          caption={escala ? 'resueltos + cancelados + escalados' : 'se despacharon en el mes'}
          color="blue"
          icon={<Layers className="h-4 w-4 text-sky-400" />}
        />
        <MetricCard
          label="% Resueltos"
          value={pct(stats.pct_resolved)}
          caption={`${formatInteger(stats.tickets_resolved)} de los cerrados`}
          color="green"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        />
        {recibe && !escala ? (
          <MetricCard
            label="% Llegados de ATC"
            value={pct(stats.pct_received_escalated)}
            caption={`${formatInteger(stats.tickets_received_escalated)} de los creados`}
            color="yellow"
            icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}
          />
        ) : (
          <MetricCard
            label="% Escalados a Soporte"
            value={pct(stats.pct_escalated)}
            caption={`${formatInteger(stats.tickets_escalated)} de los cerrados`}
            color="yellow"
            icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}
          />
        )}
        <MetricCard
          label="% Rezagados"
          value={pct(stats.pct_lagging)}
          caption={escala ? `${formatInteger(stats.tickets_lagging)} sin cerrar ni escalar en su mes` : `${formatInteger(stats.tickets_lagging)} de los creados`}
          color="yellow"
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
        />
      </div>

      <NeonContainer
        theme="slate"
        title={`Composición de ${groupName}`}
        subtitle={
          escala
            ? 'Los sumandos se leen sobre los cerrados del mes y suman el 100 % · escalar a Soporte cuenta como cerrar'
            : 'Los sumandos se leen sobre los cerrados del mes y suman el 100 %'
        }
        icon={<Layers className="h-5 w-5" />}
      >
        <div className={`mb-5 grid grid-cols-2 gap-3 ${escala ? 'lg:grid-cols-3 2xl:grid-cols-6' : 'lg:grid-cols-4'}`}>
          <MetricCard label="Resueltos del mes" subValue={`${formatInteger(stats.tickets_resolved_in_period)} creados y resueltos en el mes`} value={pct(stats.pct_resolved_in_period)} color="green" />
          <MetricCard label="Resueltos arrastre" subValue={`${formatInteger(stats.tickets_resolved_carryover)} de meses anteriores`} value={pct(stats.pct_resolved_carryover)} color="purple" />
          <MetricCard label="Cancelados del mes" subValue={formatInteger(stats.tickets_cancelled_in_period)} value={pct(stats.pct_cancelled_in_period)} color="red" />
          <MetricCard label="Cancelados arrastre" subValue={formatInteger(stats.tickets_cancelled_carryover)} value={pct(stats.pct_cancelled_carryover)} color="yellow" />
          {escala && (
            <>
              <MetricCard label="Escalados del mes" subValue={`${formatInteger(stats.tickets_escalated_in_period)} creados y escalados en el mes`} value={pct(stats.pct_escalated_in_period)} color="yellow" />
              <MetricCard label="Escalados arrastre" subValue={`${formatInteger(stats.tickets_escalated_carryover)} de meses anteriores`} value={pct(stats.pct_escalated_carryover)} color="slate" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
          <ProgressBar label="Resueltos del mes" percent={stats.pct_resolved_in_period} valueLabel={pct(stats.pct_resolved_in_period)} color="green" />
          <ProgressBar label="Resueltos de meses anteriores" percent={stats.pct_resolved_carryover} valueLabel={pct(stats.pct_resolved_carryover)} color="purple" />
          <ProgressBar label="Cancelados del mes" percent={stats.pct_cancelled_in_period} valueLabel={pct(stats.pct_cancelled_in_period)} color="red" />
          <ProgressBar label="Cancelados de meses anteriores" percent={stats.pct_cancelled_carryover} valueLabel={pct(stats.pct_cancelled_carryover)} color="yellow" />
          {escala && (
            <>
              <ProgressBar label="Escalados a Soporte del mes" percent={stats.pct_escalated_in_period} valueLabel={pct(stats.pct_escalated_in_period)} color="yellow" />
              <ProgressBar label="Escalados de meses anteriores" percent={stats.pct_escalated_carryover} valueLabel={pct(stats.pct_escalated_carryover)} color="slate" />
            </>
          )}
        </div>
      </NeonContainer>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <MonthPath groupName={groupName} stats={stats} />
        <WhereTimeGoes stats={stats} />
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${medidas.length > 7 ? '2xl:grid-cols-8' : '2xl:grid-cols-7'}`}>
        {medidas.map((medida) => {
          const meta = TIME_MEASURE_META[medida];
          const muestraMedida = stats[`sample_${medida}`];

          return (
            <MetricCard
              key={medida}
              label={meta.label}
              value={formatDuration(stats[`time_mean_${medida}_hours`])}
              color={meta.color}
              subValue={
                muestraMedida > 0
                  ? `promedio de ${formatInteger(muestraMedida)} · mediana ${formatDuration(stats[`time_median_${medida}_hours`])}`
                  : 'sin tickets medidos'
              }
              icon={MEASURE_ICONS[meta.color]}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimingPanel measure={CLOSE_TOTAL} theme="blue" icon={<Clock className="h-5 w-5" />} dist={distribution(stats, CLOSE_TOTAL)} />
        <TimingPanel measure={HANDLING} theme="purple" icon={<Timer className="h-5 w-5" />} dist={distribution(stats, HANDLING)} />
        <div className={escala ? '' : 'lg:col-span-2'}>
          <TimingPanel measure={ASIGNACION} theme="slate" icon={<Hourglass className="h-5 w-5" />} dist={distribution(stats, ASIGNACION)} />
        </div>
        {escala && (
          <TimingPanel measure={ESCALATION} theme="yellow" icon={<ArrowRightLeft className="h-5 w-5" />} dist={distribution(stats, ESCALATION)} />
        )}
      </div>
    </>
  );
}
