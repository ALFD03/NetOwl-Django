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
  Paginacion,
  SparklineCard,
  StatTile,
  METRIC_CHART,
  usePaginacion,
} from '@/shared/ui';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/usePermissions';
import {
  formatInteger,
  formatOneDecimal,
  formatPeriodoLabel,
  formatTwoDecimals,
} from '@/shared/utils';
import {
  ASIGNACION,
  CIERRE_TOTAL,
  ESCALAMIENTO,
  TIME_MEASURE_META,
  distribution,
} from '../lib/supportMetrics';
import { MEASURE_ICONS } from '../lib/measureIcons';
import { SUPPORT_TIME_MEASURES, type SupportDashboardProps } from '../types';
import type { useSupportDashboard } from '../hooks/useSupportDashboard';
import { TicketsAbiertosPanel } from './flujo/TicketsAbiertosPanel';
import { Seccion, SeccionesNav, type SeccionDef } from './Seccion';

/**
 * `MetricCard`'s `trend` accessory is hardcoded to percentages and reads "up" as
 * good — neither holds for hours-to-close, so the gap is spelled out instead.
 */
function mttrGapLabel(deltaHoras: number): string {
  if (deltaHoras === 0) return 'En línea con el promedio global';
  const faster = deltaHoras < 0;
  return `${Math.abs(deltaHoras)} h ${faster ? 'más rápido' : 'más lento'} que el promedio global`;
}

/** De lo cerrado en el mes, cuánto nació en él y cuánto venía arrastrado. */
function OrigenCierres({ stats }: { stats: ReturnType<typeof useSupportDashboard>['stats'] }) {
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
            value={`${formatTwoDecimals(stats.pct_resueltos_periodo)}%`}
            caption={`${formatInteger(stats.tickets_resueltos_periodo)} tickets`}
            tone="green"
            variant="boxed"
            mono
          />
          <StatTile
            label="Resueltos arrastre"
            value={`${formatTwoDecimals(stats.pct_resueltos_arrastre)}%`}
            caption={`${formatInteger(stats.tickets_resueltos_arrastre)} tickets`}
            tone="purple"
            variant="boxed"
            mono
          />
          <StatTile
            label="Cancelados del mes"
            value={`${formatTwoDecimals(stats.pct_cancelados_periodo)}%`}
            caption={`${formatInteger(stats.tickets_cancelados_periodo)} tickets`}
            tone="red"
            variant="boxed"
            mono
          />
          <StatTile
            label="Cancelados arrastre"
            value={`${formatTwoDecimals(stats.pct_cancelados_arrastre)}%`}
            caption={`${formatInteger(stats.tickets_cancelados_arrastre)} tickets`}
            tone="purple"
            variant="boxed"
            mono
          />
          <StatTile
            label="Escalados del mes"
            value={`${formatTwoDecimals(stats.pct_escalados_periodo)}%`}
            caption={`${formatInteger(stats.tickets_escalados_periodo)} tickets`}
            tone="yellow"
            variant="boxed"
            mono
          />
          <StatTile
            label="Escalados arrastre"
            value={`${formatTwoDecimals(stats.pct_escalados_arrastre)}%`}
            caption={`${formatInteger(stats.tickets_escalados_arrastre)} tickets`}
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
            percent={stats.pct_resueltos_periodo}
            valueLabel={`${formatTwoDecimals(stats.pct_resueltos_periodo)}%`}
            color="green"
          />
          <ProgressBar
            label="Resueltos de meses anteriores"
            percent={stats.pct_resueltos_arrastre}
            valueLabel={`${formatTwoDecimals(stats.pct_resueltos_arrastre)}%`}
            color="purple"
          />
          <ProgressBar
            label="Cancelados del mes"
            percent={stats.pct_cancelados_periodo}
            valueLabel={`${formatTwoDecimals(stats.pct_cancelados_periodo)}%`}
            color="red"
          />
          <ProgressBar
            label="Cancelados de meses anteriores"
            percent={stats.pct_cancelados_arrastre}
            valueLabel={`${formatTwoDecimals(stats.pct_cancelados_arrastre)}%`}
            color="yellow"
          />
          <ProgressBar
            label="Escalados a Soporte del mes"
            percent={stats.pct_escalados_periodo}
            valueLabel={`${formatTwoDecimals(stats.pct_escalados_periodo)}%`}
            color="yellow"
          />
          <ProgressBar
            label="Escalados de meses anteriores"
            percent={stats.pct_escalados_arrastre}
            valueLabel={`${formatTwoDecimals(stats.pct_escalados_arrastre)}%`}
            color="slate"
          />
        </div>
      </div>
    </NeonContainer>
  );
}

interface SupportDashboardViewProps {
  data: ReturnType<typeof useSupportDashboard>;
  abiertos?: SupportDashboardProps['abiertos'];
}

export function SupportDashboardView({ data, abiertos = null }: SupportDashboardViewProps) {
  const { can } = usePermissions();
  const verAbiertos = can(PERMISSIONS.VIEW_SUPPORT_ABIERTOS);

  const {
    periodosEvaluados,
    historico,
    stats,
    trendCards,
    groupCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  } = data;

  const chartColor = selectedTrend ? METRIC_CHART[selectedTrend.color].line : undefined;
  const periodsLabel = `${periodosEvaluados} periodos evaluados`;
  const paginacion = usePaginacion(historico);

  const cierreTotal = distribution(stats, CIERRE_TOTAL);
  const asignacion = distribution(stats, ASIGNACION);
  const escalamiento = distribution(stats, ESCALAMIENTO);

  const secciones: SeccionDef[] = [
    { id: 'volumen', titulo: 'Volumen y cierre', icon: <Layers /> },
    { id: 'tiempos', titulo: 'Tiempos', icon: <Timer /> },
    ...(verAbiertos ? [{ id: 'abiertos', titulo: 'Abiertos ahora', icon: <FolderOpen /> }] : []),
    { id: 'tendencias', titulo: 'Tendencias y grupos', icon: <Activity /> },
  ];

  return (
    <div className="space-y-10">
      <SeccionesNav secciones={secciones} />

      <Seccion
        id="volumen"
        titulo="Volumen y cierre"
        descripcion="Cuánto entra y cuánto se despacha en un mes típico, y de dónde vienen los cierres."
        alcance={periodsLabel}
        icon={<Layers />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Creados / Mes"
            value={formatInteger(stats.tickets_creados)}
            color="slate"
            subValue="Suma de los grupos: un escalado entra en ATC y en Soporte"
            icon={<Users className="h-4 w-4 text-slate-300" />}
          />
          <MetricCard
            label="Cerrados / Mes"
            value={formatInteger(stats.tickets_cerrados)}
            color="blue"
            subValue="Resueltos, cancelados y escalados por ATC"
            icon={<Layers className="h-4 w-4 text-sky-400" />}
          />
          <MetricCard
            label="% Resueltos"
            value={`${stats.pct_resueltos}%`}
            color="green"
            subValue="Sobre los cerrados del mes"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          />
          <MetricCard
            label="% Cancelados"
            value={`${stats.pct_cancelados}%`}
            color="red"
            subValue="Sobre los cerrados del mes"
            icon={<XCircle className="h-4 w-4 text-rose-400" />}
          />
          <MetricCard
            label="% Escalados a Soporte"
            value={`${stats.pct_escalados}%`}
            color="yellow"
            subValue={`${formatInteger(stats.tickets_escalados)} / mes · ATC los da por cerrados`}
            icon={<ArrowRightLeft className="h-4 w-4 text-amber-400" />}
          />
          <MetricCard
            label="% Rezagados"
            value={`${stats.pct_rezagados}%`}
            color="yellow"
            subValue="Creados que no cerraron en su mes"
            icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          />
        </div>

        <OrigenCierres stats={stats} />
      </Seccion>

      <Seccion
        id="tiempos"
        titulo="Tiempos"
        descripcion="El promedio de cada medida de tiempo y la distribución del cierre total, de la asignación y de lo que ATC tarda en escalar."
        alcance={periodsLabel}
        icon={<Timer />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          {SUPPORT_TIME_MEASURES.map((medida) => {
            const meta = TIME_MEASURE_META[medida];

            return (
              <MetricCard
                key={medida}
                label={meta.label}
                value={`${stats[`tiempo_medio_${medida}_horas`]} h`}
                color={meta.color}
                subValue={`${meta.caption} · ${formatInteger(stats[`muestra_${medida}`])} medidos`}
                icon={MEASURE_ICONS[meta.color]}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <EquidistantTimeline
            title="Distribución Cierre Total"
            subtitle={`Creación → cierre · ${formatInteger(cierreTotal.muestra)} tickets medidos`}
            icon={<Clock className="h-5 w-5" />}
            theme="blue"
            min={cierreTotal.min}
            p25={cierreTotal.p25}
            mediana={cierreTotal.mediana}
            promedio={cierreTotal.promedio}
            p75={cierreTotal.p75}
            max={cierreTotal.max}
            std={cierreTotal.std}
            pctExcedeProm={cierreTotal.pctExcedeProm}
          />

          <EquidistantTimeline
            title="Distribución Asignación"
            subtitle={`Creación → asignación · ${formatInteger(asignacion.muestra)} tickets medidos`}
            icon={<Hourglass className="h-5 w-5" />}
            theme="slate"
            min={asignacion.min}
            p25={asignacion.p25}
            mediana={asignacion.mediana}
            promedio={asignacion.promedio}
            p75={asignacion.p75}
            max={asignacion.max}
            std={asignacion.std}
            pctExcedeProm={asignacion.pctExcedeProm}
          />

          {escalamiento.muestra > 0 && (
            <div className="xl:col-span-2">
              <EquidistantTimeline
                title="Distribución Hasta Escalar"
                subtitle={`Creación → paso a Soporte · ${formatInteger(escalamiento.muestra)} escalados medidos`}
                icon={<ArrowRightLeft className="h-5 w-5" />}
                theme="yellow"
                min={escalamiento.min}
                p25={escalamiento.p25}
                mediana={escalamiento.mediana}
                promedio={escalamiento.promedio}
                p75={escalamiento.p75}
                max={escalamiento.max}
                std={escalamiento.std}
                pctExcedeProm={escalamiento.pctExcedeProm}
              />
            </div>
          )}
        </div>
      </Seccion>

      {verAbiertos && (
        <Seccion
          id="abiertos"
          titulo="Tickets abiertos ahora"
          descripcion="Cuánto llevan abiertos desde su creación y cuánto en la etapa en que están, con el reloj en la hora de Caracas y los logs del último análisis."
          alcance="Hoy"
          icon={<FolderOpen />}
        >
          <TicketsAbiertosPanel abiertos={abiertos} />
        </Seccion>
      )}

      <Seccion
        id="tendencias"
        titulo="Tendencias y grupos de trabajo"
        descripcion="Cada tasa y cada tiempo mes a mes —pulsa una tarjeta para ver el histórico completo— y el rendimiento de cada grupo."
        alcance={periodsLabel}
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
                      value={`${card.pctResueltos}%`}
                      caption={`${formatInteger(card.totalTickets)} tickets/mes · ${card.sharePct}% del total`}
                      color={card.color}
                      indicator
                    >
                      <ProgressBar
                        label="Resueltos"
                        percent={card.pctResueltos}
                        valueLabel={`${card.pctResueltos}%`}
                        color="green"
                      />
                      <ProgressBar
                        label="Cancelados"
                        percent={card.pctCancelados}
                        valueLabel={`${card.pctCancelados}%`}
                        color="red"
                      />
                      {card.pctEscalados > 0 && (
                        <ProgressBar
                          label="Escalados a Soporte"
                          percent={card.pctEscalados}
                          valueLabel={`${card.pctEscalados}%`}
                          color="yellow"
                        />
                      )}
                      <ProgressBar
                        label="Rezagados"
                        percent={card.pctRezagados}
                        valueLabel={`${card.pctRezagados}%`}
                        color="yellow"
                      />
                    </MetricCard>

                    <MetricCard
                      label={`${card.label} · Cierre Total`}
                      value={`${card.mttr} h`}
                      caption={`Mediana ${card.mttrMediana} h · asignación ${formatOneDecimal(card.espera)} h`}
                      subValue={mttrGapLabel(card.mttrDelta)}
                      color={card.mttrColor}
                      icon={<Clock className="h-4 w-4 text-sky-400" />}
                    >
                      <ProgressBar
                        label="Excede el promedio"
                        percent={card.pctExcedeProm}
                        valueLabel={`${card.pctExcedeProm}%`}
                        color="blue"
                      />
                    </MetricCard>
                  </Fragment>
                ))}
              </div>
            )}
          </NeonContainer>
        </div>
      </Seccion>

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
              <Paginacion estado={paginacion} posicion="arriba" />
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
                    {paginacion.visibles.map((row) => {
                      const countVal = Number(row[selectedTrend.countKey]) || 0;
                      const rateVal = Number(row[selectedTrend.rateKey]) || 0;

                      return (
                        <tr
                          key={row.periodo_reporte}
                          className="transition-colors hover:bg-white/5"
                        >
                          <td className="p-4 font-bold text-white">
                            {formatPeriodoLabel(String(row.periodo_reporte))}
                          </td>
                          <td className="p-4 text-right font-mono text-slate-400">
                            {formatInteger(row.tickets_creados)}
                          </td>
                          <td className="p-4 text-right font-mono text-slate-400">
                            {formatInteger(row.tickets_cerrados)}
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
              <Paginacion estado={paginacion} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
