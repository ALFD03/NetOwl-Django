import { Fragment } from 'react';
import {
  Activity, AlertTriangle, BarChart2, CheckCircle2,
  Clock, Layers, Timer, Users, XCircle,
} from 'lucide-react';

import { LineChart } from '@/shared/charts';
import {
  EmptyState,
  EquidistantTimeline,
  MetricCard,
  Modal,
  NeonContainer,
  ProgressBar,
  SparklineCard,
  StatTile,
  METRIC_CHART,
} from '@/shared/ui';
import { formatInteger, formatPeriodoLabel } from '@/shared/utils';
import type { SupportTimeMeasure } from '../types';
import type { useSupportDashboard } from '../hooks/useSupportDashboard';

/**
 * `MetricCard`'s `trend` accessory is hardcoded to percentages and reads "up" as
 * good — neither holds for hours-to-close, so the gap is spelled out instead.
 */
function mttrGapLabel(deltaHoras: number): string {
  if (deltaHoras === 0) return 'En línea con el promedio global';
  const faster = deltaHoras < 0;
  return `${Math.abs(deltaHoras)} h ${faster ? 'más rápido' : 'más lento'} que el promedio global`;
}

/**
 * The six time variants, in the order the dashboard shows them: the whole
 * process first, the technician's slice second, and within each pair success
 * before global. `muestra` rides along in the caption because the variants do
 * not measure the same number of tickets — the ones built on Odoo's
 * `duracion_total_horas` cover the entire cohort, the ones measured from the
 * first assignment cannot cover what was never assigned.
 */
const TIME_CARDS: Array<{
  label: string;
  medida: SupportTimeMeasure;
  caption: string;
  color: 'blue' | 'purple';
}> = [
  { label: 'MTTR — Éxito Total', medida: 'cierre_total', caption: 'Creación → cierre · resueltos', color: 'blue' },
  { label: 'MTTR — Éxito', medida: 'cierre', caption: 'Asignación → cierre · resueltos', color: 'blue' },
  { label: '1ª Respuesta — Éxito', medida: 'primera_respuesta', caption: 'Creación → asignación · resueltos', color: 'blue' },
  { label: 'MTTR — Global Total', medida: 'cierre_total_global', caption: 'Creación → cierre · + cancelados', color: 'purple' },
  { label: 'MTTR — Global', medida: 'cierre_global', caption: 'Asignación → cierre · + cancelados', color: 'purple' },
  { label: '1ª Respuesta — Global', medida: 'primera_respuesta_global', caption: 'Creación → asignación · + cancelados', color: 'purple' },
];

interface SupportDashboardViewProps {
  data: ReturnType<typeof useSupportDashboard>;
}

export function SupportDashboardView({ data }: SupportDashboardViewProps) {
  const {
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
  const periodsLabel = `${historico.length} periodos evaluados`;

  /** Volume shares are read against the closed universe, matching the backend. */
  const universo = stats.tickets_resueltos + stats.tickets_cancelados + stats.tickets_rezagados;
  const share = (value: number) => (universo > 0 ? Math.round((value / universo) * 100) : 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Tickets / Mes" value={formatInteger(stats.total_tickets)} color="slate" subValue="Promedio de todos los periodos" icon={<Users className="w-4 h-4 text-slate-300" />} />
        <MetricCard label="% Resueltos" value={`${stats.pct_resueltos}%`} color="green" subValue="Promedio de cierre exitoso" icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
        <MetricCard label="% Cancelados" value={`${stats.pct_cancelados}%`} subValue="Promedio de cierre fallido" color="red" icon={<XCircle className="w-4 h-4 text-rose-400" />} />
        <MetricCard label="% Rezagados" value={`${stats.pct_rezagados}%`} color="yellow" subValue="Promedio de tickets no cerrados" icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {TIME_CARDS.map(({ label, medida, caption, color }) => (
          <MetricCard
            key={medida}
            label={label}
            value={`${stats[`tiempo_medio_${medida}_horas`]} h`}
            color={color}
            subValue={`${caption} · ${formatInteger(stats[`muestra_${medida}`])} medidos`}
            icon={
              medida.startsWith('primera_respuesta')
                ? <Timer className={`w-4 h-4 ${color === 'blue' ? 'text-sky-400' : 'text-purple-400'}`} />
                : <Clock className={`w-4 h-4 ${color === 'blue' ? 'text-sky-400' : 'text-purple-400'}`} />
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <EquidistantTimeline
          title="Distribución Tiempo de Cierre"
          icon={<Clock className="w-5 h-5" />}
          theme="blue"
          p25={stats.tiempo_p25_cierre_horas}
          min={stats.tiempo_min_cierre_horas}
          mediana={stats.tiempo_mediana_cierre_horas}
          promedio={stats.tiempo_medio_cierre_horas}
          p75={stats.tiempo_p75_cierre_horas}
          max={stats.tiempo_max_cierre_horas}
          std={stats.tiempo_std_cierre_horas}
          pctExcedeProm={stats.pct_excede_promedio_cierre}
        />

        <NeonContainer
          theme="slate"
          title="Composición del Volumen Mensual"
          subtitle="Reparto promedio del universo cerrado"
          icon={<Layers className="w-5 h-5" />}
          headerAction={
            <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand">
              {periodsLabel}
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatTile label="Resueltos" value={formatInteger(stats.tickets_resueltos)} caption="por mes" tone="green" variant="boxed" mono />
            <StatTile label="Cancelados" value={formatInteger(stats.tickets_cancelados)} caption="por mes" tone="red" variant="boxed" mono />
            <StatTile label="Rezagados" value={formatInteger(stats.tickets_rezagados)} caption="por mes" tone="yellow" variant="boxed" mono />
          </div>
          <div className="space-y-3">
            <ProgressBar label="Resueltos" percent={share(stats.tickets_resueltos)} valueLabel={`${share(stats.tickets_resueltos)}%`} color="green" />
            <ProgressBar label="Cancelados" percent={share(stats.tickets_cancelados)} valueLabel={`${share(stats.tickets_cancelados)}%`} color="red" />
            <ProgressBar label="Rezagados" percent={share(stats.tickets_rezagados)} valueLabel={`${share(stats.tickets_rezagados)}%`} color="yellow" />
          </div>
        </NeonContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeonContainer
          theme="blue"
          title="Matriz de Tendencias por Periodo"
          subtitle="Click en cualquier tarjeta para ver el histórico completo"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-center h-full">
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
          icon={<Users className="w-5 h-5" />}
        >
          {groupCards.length === 0 ? (
            <EmptyState title="Sin métricas por grupo de trabajo." icon={<Users />} />
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
            {groupCards.map((card) => (
              <Fragment key={card.id}>
                <MetricCard
                  label={card.label}
                  value={`${card.pctResueltos}%`}
                  caption={`${formatInteger(card.totalTickets)} tickets/mes · ${card.sharePct}% del total`}
                  color={card.color}
                  indicator
                >
                  <ProgressBar label="Resueltos" percent={card.pctResueltos} valueLabel={`${card.pctResueltos}%`} color="green" />
                  <ProgressBar label="Cancelados" percent={card.pctCancelados} valueLabel={`${card.pctCancelados}%`} color="red" />
                  <ProgressBar label="Rezagados" percent={card.pctRezagados} valueLabel={`${card.pctRezagados}%`} color="yellow" />
                </MetricCard>

                <MetricCard
                  label={`${card.label} · MTTR`}
                  value={`${card.mttr} h`}
                  caption={`Mediana ${card.mttrMediana} h · 1ª respuesta ${card.primeraRespuesta} h`}
                  subValue={mttrGapLabel(card.mttrDelta)}
                  color={card.mttrColor}
                  icon={<Clock className="w-4 h-4 text-sky-400" />}
                >
                  <ProgressBar label="Excede el promedio" percent={card.pctExcedeProm} valueLabel={`${card.pctExcedeProm}%`} color="blue" />
                </MetricCard>
              </Fragment>
            ))}
          </div>
          )}
        </NeonContainer>
      </div>

      <Modal
        isOpen={!!selectedTrend}
        onClose={() => setSelectedTrend(null)}
        title={`Evolución Histórica: ${selectedTrend?.title || ''}`}
        subtitle={selectedTrend?.unitLabel}
        theme={selectedTrend?.color || 'blue'}
        icon={<BarChart2 className="w-5 h-5 text-brand" />}
        size="xl"
      >
        {selectedTrend && modalChartData && (
          <div className="space-y-6">
            <div className="bg-surface-primary p-6 rounded-3xl border border-slate-800 shadow-inner">
              <LineChart data={modalChartData} options={modalChartOptions} />
            </div>

            <div className="bg-surface-primary border border-slate-800 rounded-3xl overflow-hidden shadow-inner">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Desglose Numérico por Periodo
                </span>
                <span className="text-xs font-bold text-brand font-mono">{periodsLabel}</span>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-black sticky top-0 backdrop-blur-sm border-b border-slate-800">
                    <tr>
                      <th className="p-4">Periodo</th>
                      <th className="p-4 text-right">Total Tickets</th>
                      <th className="p-4 text-right">{selectedTrend.unitLabel}</th>
                      <th className="p-4 text-right">
                        {selectedTrend.unit === 'horas' ? 'Horas del Periodo' : 'Tasa del Periodo (%)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historico.map((row, idx) => {
                      const countVal = Number(row[selectedTrend.countKey]) || 0;
                      const rateVal = Number(row[selectedTrend.rateKey]) || 0;
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-bold text-white">{formatPeriodoLabel(String(row.periodo_reporte))}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{formatInteger(row.total_tickets)}</td>
                          <td className="p-4 text-right font-black font-mono text-white">{countVal.toLocaleString()}</td>
                          <td className="p-4 text-right font-black font-mono" style={{ color: chartColor }}>
                            {selectedTrend.unit === 'horas' ? `${rateVal} h` : `${rateVal}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
