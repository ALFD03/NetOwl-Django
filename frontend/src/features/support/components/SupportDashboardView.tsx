/**
 * Portada de soporte: el promedio de todos los periodos evaluados.
 *
 * Va por secciones con un índice arriba: volumen y cierre, tiempos, los tickets
 * abiertos ahora y las tendencias por grupo. Los abiertos tienen su propio
 * permiso y, sin él, no aparecen.
 *
 * El total de la empresa es la suma de los grupos: lo que ATC escala cuenta una
 * vez como cierre de ATC y otra como ticket de Soporte (ver
 * `services/support/analytics/escalamiento.py`).
 */

import {
  READONLY_TABLE,
  READONLY_TABLE_BODY,
  READONLY_TABLE_HEAD_STICKY,
} from '@/shared/ui/data/tableClasses';
import { Fragment } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart2,
  CheckCircle2,
  Clock,
  FolderOpen,
  Hourglass,
  Layers,
  Timer,
  Users,
  XCircle,
} from 'lucide-react';

import { LineChart } from '@/shared/charts';
import {
  EmptyState,
  EquidistantTimeline,
  MetricCard,
  Modal,
  NeonContainer,
  ProgressBar,
  Pagination,
  SparklineCard,
  METRIC_CHART,
  usePagination } from '@/shared/ui';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/usePermissions';
import {
  formatInteger,
  formatOneDecimal,
  formatPeriodLabel } from '@/shared/utils';
import {
  ASSIGNMENT,
  CLOSE_TOTAL,
  ESCALATION,
  TIME_MEASURE_META,
  distribution,
} from '../lib/supportMetrics';
import { MEASURE_ICONS } from '../lib/measureIcons';
import { SUPPORT_TIME_MEASURES, type SupportDashboardProps } from '../types';
import type { useSupportDashboard } from '../hooks/useSupportDashboard';
import { OpenTicketsPanel } from './flow/OpenTicketsPanel';
import { Section, SectionsNav, type SectionDef } from './Section';
import { CloseSources } from './CloseSources';

/**
 * El accesorio `trend` de `MetricCard` está fijo a porcentajes y lee «sube» como
 * bueno; ninguna de las dos cosas vale para horas hasta el cierre, así que la
 * diferencia se escribe con palabras.
 */
function mttrGapLabel(deltaHours: number): string {
  if (deltaHours === 0) return 'En línea con el promedio global';
  const faster = deltaHours < 0;
  return `${Math.abs(deltaHours)} h ${faster ? 'más rápido' : 'más lento'} que el promedio global`;
}

interface SupportDashboardViewProps {
  data: ReturnType<typeof useSupportDashboard>;
  open?: SupportDashboardProps['open'];
}

export function SupportDashboardView({ data, open = null }: SupportDashboardViewProps) {
  const { can } = usePermissions();
  const showOpen = can(PERMISSIONS.VIEW_SUPPORT_OPEN);

  const {
    evaluatedPeriods,
    history,
    stats,
    trendCards,
    groupCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  } = data;

  const chartColor = selectedTrend ? METRIC_CHART[selectedTrend.color].line : undefined;
  const periodsLabel = `${evaluatedPeriods} periodos evaluados`;
  const pagination = usePagination(history);

  const closeTotal = distribution(stats, CLOSE_TOTAL);
  const assignment = distribution(stats, ASSIGNMENT);
  const escalation = distribution(stats, ESCALATION);

  const sections: SectionDef[] = [
    { id: 'volumen', title: 'Volumen y cierre', icon: <Layers /> },
    { id: 'tiempos', title: 'Tiempos', icon: <Timer /> },
    ...(showOpen ? [{ id: 'abiertos', title: 'Abiertos ahora', icon: <FolderOpen /> }] : []),
    { id: 'tendencias', title: 'Tendencias y grupos', icon: <Activity /> },
  ];

  return (
    <div className="space-y-10">
      <SectionsNav sections={sections} />

      <Section
        id="volumen"
        title="Volumen y cierre"
        description="Cuánto entra y cuánto se despacha en un mes típico, y de dónde vienen los cierres."
        scope={periodsLabel}
        icon={<Layers />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Creados / Mes"
            value={formatInteger(stats.tickets_created)}
            color="slate"
            subValue="Suma de los grupos: un escalado entra en ATC y en Soporte"
            icon={<Users className="h-4 w-4 text-slate-300" />}
          />
          <MetricCard
            label="Cerrados / Mes"
            value={formatInteger(stats.tickets_closed)}
            color="blue"
            subValue="Resueltos, cancelados y escalados por ATC"
            icon={<Layers className="h-4 w-4 text-sky-400" />}
          />
          <MetricCard
            label="% Resueltos"
            value={`${stats.pct_resolved}%`}
            color="green"
            subValue="Sobre los cerrados del mes"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          />
          <MetricCard
            label="% Cancelados"
            value={`${stats.pct_cancelled}%`}
            color="red"
            subValue="Sobre los cerrados del mes"
            icon={<XCircle className="h-4 w-4 text-rose-400" />}
          />
          <MetricCard
            label="% Escalados a Soporte"
            value={`${stats.pct_escalated}%`}
            color="yellow"
            subValue={`${formatInteger(stats.tickets_escalated)} / mes · ATC los da por cerrados`}
            icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}
          />
          <MetricCard
            label="% Rezagados"
            value={`${stats.pct_lagging}%`}
            color="yellow"
            subValue="Creados que no cerraron en su mes"
            icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          />
        </div>

        <CloseSources stats={stats} />
      </Section>

      <Section
        id="tiempos"
        title="Tiempos"
        description="El promedio de cada medida de tiempo y la distribución del cierre total, de la asignación y de lo que ATC tarda en escalar."
        scope={periodsLabel}
        icon={<Timer />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          {SUPPORT_TIME_MEASURES.map((measure) => {
            const goal = TIME_MEASURE_META[measure];

            return (
              <MetricCard
                key={measure}
                label={goal.label}
                value={`${stats[`time_mean_${measure}_hours`]} h`}
                color={goal.color}
                subValue={`${goal.caption} · ${formatInteger(stats[`sample_${measure}`])} medidos`}
                icon={MEASURE_ICONS[goal.color]}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <EquidistantTimeline
            title="Distribución Cierre Total"
            subtitle={`Creación → cierre · ${formatInteger(closeTotal.sample)} tickets medidos`}
            icon={<Clock className="h-5 w-5" />}
            theme="blue"
            min={closeTotal.min}
            p25={closeTotal.p25}
            median={closeTotal.median}
            average={closeTotal.average}
            p75={closeTotal.p75}
            max={closeTotal.max}
            std={closeTotal.std}
            pctAboveAvg={closeTotal.pctAboveAvg}
          />

          <EquidistantTimeline
            title="Distribución Asignación"
            subtitle={`Creación → asignación · ${formatInteger(assignment.sample)} tickets medidos`}
            icon={<Hourglass className="h-5 w-5" />}
            theme="slate"
            min={assignment.min}
            p25={assignment.p25}
            median={assignment.median}
            average={assignment.average}
            p75={assignment.p75}
            max={assignment.max}
            std={assignment.std}
            pctAboveAvg={assignment.pctAboveAvg}
          />

          {escalation.sample > 0 && (
            <div className="xl:col-span-2">
              <EquidistantTimeline
                title="Distribución Hasta Escalar"
                subtitle={`Creación → paso a Soporte · ${formatInteger(escalation.sample)} escalados medidos`}
                icon={<ArrowRightLeft className="h-5 w-5" />}
                theme="yellow"
                min={escalation.min}
                p25={escalation.p25}
                median={escalation.median}
                average={escalation.average}
                p75={escalation.p75}
                max={escalation.max}
                std={escalation.std}
                pctAboveAvg={escalation.pctAboveAvg}
              />
            </div>
          )}
        </div>
      </Section>

      {showOpen && (
        <Section
          id="abiertos"
          title="Tickets abiertos ahora"
          description="Cuánto llevan abiertos desde su creación y cuánto en la etapa en que están, con el reloj en la hora de Caracas y los logs del último análisis."
          scope="Hoy"
          icon={<FolderOpen />}
        >
          <OpenTicketsPanel open={open} />
        </Section>
      )}

      <Section
        id="tendencias"
        title="Tendencias y grupos de trabajo"
        description="Cada tasa y cada tiempo mes a mes —pulsa una tarjeta para ver el histórico completo— y el rendimiento de cada grupo."
        scope={periodsLabel}
        icon={<Activity />}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NeonContainer
            theme="blue"
            title="Matriz de Tendencias por Periodo"
            subtitle="Click en cualquier tarjeta para ver el histórico completo"
            icon={<Activity className="h-5 w-5" />}
          >
            <div className="grid h-full flex-1 grid-cols-1 items-center gap-3.5 sm:grid-cols-2">
              {trendCards.map((card) => (
                <SparklineCard
                  key={card.id}
                  title={card.title}
                  value={card.value}
                  color={card.color}
                  labels={card.labels}
                  values={card.values}
                  onClick={() => setSelectedTrend(card)}
                />
              ))}
            </div>
          </NeonContainer>

          <NeonContainer
            theme="green"
            title="Rendimiento por Grupo de Trabajo"
            subtitle="Promedio de todos los periodos, ordenado por volumen"
            icon={<Users className="h-5 w-5" />}
          >
            {groupCards.length === 0 ? (
              <EmptyState title="Sin métricas por grupo de trabajo." icon={<Users />} />
            ) : (
              <div className="grid h-full flex-1 grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2">
                {groupCards.map((card) => (
                  <Fragment key={card.id}>
                    <MetricCard
                      label={card.label}
                      value={`${card.pctResolved}%`}
                      caption={`${formatInteger(card.totalTickets)} tickets/mes · ${card.sharePct}% del total`}
                      color={card.color}
                      indicator
                    >
                      <ProgressBar
                        label="Resueltos"
                        percent={card.pctResolved}
                        valueLabel={`${card.pctResolved}%`}
                        color="green"
                      />
                      <ProgressBar
                        label="Cancelados"
                        percent={card.pctCancelled}
                        valueLabel={`${card.pctCancelled}%`}
                        color="red"
                      />
                      {card.pctEscalated > 0 && (
                        <ProgressBar
                          label="Escalados a Soporte"
                          percent={card.pctEscalated}
                          valueLabel={`${card.pctEscalated}%`}
                          color="yellow"
                        />
                      )}
                      <ProgressBar
                        label="Rezagados"
                        percent={card.pctLagging}
                        valueLabel={`${card.pctLagging}%`}
                        color="yellow"
                      />
                    </MetricCard>

                    <MetricCard
                      label={`${card.label} · Cierre Total`}
                      value={`${card.mttr} h`}
                      caption={`Mediana ${card.mttrMedian} h · asignación ${formatOneDecimal(card.wait)} h`}
                      subValue={mttrGapLabel(card.mttrDelta)}
                      color={card.mttrColor}
                      icon={<Clock className="h-4 w-4 text-sky-400" />}
                    >
                      <ProgressBar
                        label="Excede el promedio"
                        percent={card.pctAboveAvg}
                        valueLabel={`${card.pctAboveAvg}%`}
                        color="blue"
                      />
                    </MetricCard>
                  </Fragment>
                ))}
              </div>
            )}
          </NeonContainer>
        </div>
      </Section>

      <Modal
        isOpen={!!selectedTrend}
        onClose={() => setSelectedTrend(null)}
        title={`Evolución Histórica: ${selectedTrend?.title || ''}`}
        subtitle={selectedTrend?.unitLabel}
        theme={selectedTrend?.color || 'blue'}
        icon={<BarChart2 className="h-5 w-5 text-brand" />}
        size="xl"
      >
        {selectedTrend && modalChartData && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-surface-primary p-6 shadow-inner">
              <LineChart data={modalChartData} options={modalChartOptions} />
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-surface-primary shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Desglose Numérico por Periodo
                </span>
                <span className="font-mono text-xs font-bold text-brand">{periodsLabel}</span>
              </div>
              <Pagination state={pagination} position="arriba" />
              <div className="custom-scrollbar max-h-60 overflow-auto">
                <table className={READONLY_TABLE}>
                  <thead className={READONLY_TABLE_HEAD_STICKY}>
                    <tr>
                      <th className="p-4">Periodo</th>
                      <th className="p-4 text-right">Creados</th>
                      <th className="p-4 text-right">Cerrados</th>
                      <th className="p-4 text-right">{selectedTrend.unitLabel}</th>
                      <th className="p-4 text-right">
                        {selectedTrend.unit === 'horas'
                          ? 'Horas del Periodo'
                          : 'Tasa del Periodo (%)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className={READONLY_TABLE_BODY}>
                    {pagination.visible.map((row) => {
                      const countVal = Number(row[selectedTrend.countKey]) || 0;
                      const rateVal = Number(row[selectedTrend.rateKey]) || 0;

                      return (
                        <tr
                          key={row.report_period}
                          className="transition-colors hover:bg-white/5"
                        >
                          <td className="p-4 font-bold text-white">
                            {formatPeriodLabel(String(row.report_period))}
                          </td>
                          <td className="p-4 text-right font-mono text-slate-400">
                            {formatInteger(row.tickets_created)}
                          </td>
                          <td className="p-4 text-right font-mono text-slate-400">
                            {formatInteger(row.tickets_closed)}
                          </td>
                          <td className="p-4 text-right font-mono font-black text-white">
                            {formatInteger(countVal)}
                          </td>
                          <td
                            className="p-4 text-right font-mono font-black"
                            style={{ color: chartColor }}
                          >
                            {selectedTrend.unit === 'horas' ? `${rateVal} h` : `${rateVal}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination state={pagination} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
