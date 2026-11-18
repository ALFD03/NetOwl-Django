/** Portada de CRM: tarjetas, tendencias y salud por etapa. */

import { READONLY_TABLE, READONLY_TABLE_BODY, READONLY_TABLE_HEAD_STICKY } from '@/shared/ui/data/tableClasses';
import {
  CheckCircle2, XCircle, Users, Activity,
  Clock, AlertTriangle, Layers, BarChart2, Timer,
} from 'lucide-react';
import {
  EquidistantTimeline,
  MetricCard,
  Modal,
  NeonContainer,
  Paginacion,
  ProgressBar,
  SparklineCard,
  METRIC_CHART,
  usePaginacion,
} from '@/shared/ui';
import { LineChart } from '@/shared/charts';
import { formatInteger, formatPeriodLabel } from '@/shared/utils';
import type { useCrmDashboard } from '../hooks/useCrmDashboard';

interface CrmDashboardViewProps {
  data: ReturnType<typeof useCrmDashboard>;
}

export function CrmDashboardView({ data }: CrmDashboardViewProps) {
  const {
    historico,
    stats,
    trendCards,
    healthCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  } = data;

  const chartColor = selectedTrend ? METRIC_CHART[selectedTrend.color].line : undefined;
  const pagination = usePaginacion(historico);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard label="Total Oportunidades" value={formatInteger(stats.total_opportunities)} color="slate" subValue="Promedio mensual" icon={<Users className="w-4 h-4 text-slate-300" />} />
        <MetricCard label="Tasa Instalados" value={`${stats.pct_installation}%`} color="green" subValue="Ganados / Creados" icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
        <MetricCard label="Tasa Pérdida" value={`${stats.pct_lost}%`} color="red" subValue="Perdidos / Creados" icon={<XCircle className="w-4 h-4 text-rose-400" />} />
        <MetricCard label="Tasa Pendiente" value={`${stats.pct_pending}%`} color="blue" subValue="Pipeline activo" icon={<Clock className="w-4 h-4 text-sky-400" />} />
        <MetricCard label="Devueltos E8" value={`${stats.pct_returned_e8}%`} color="yellow" subValue="Riesgo mensual de devolución" icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <EquidistantTimeline
          title="Distribución Tiempo de Instalación"
          icon={<CheckCircle2 className="w-5 h-5" />}
          theme="green"
          min={stats.hours_min_inst}
          p25={stats.hours_p25_inst}
          mediana={stats.hours_median_inst}
          promedio={stats.hours_avg_inst}
          p75={stats.hours_p75_inst}
          max={stats.hours_max_inst}
          std={stats.hours_std_inst}
          pctExcedeProm={stats.pct_over_avg_inst}
        />
        <EquidistantTimeline
          title="Distribución Tiempo para Pérdida"
          icon={<XCircle className="w-5 h-5" />}
          theme="red"
          min={stats.hours_min_lost}
          p25={stats.hours_p25_lost}
          mediana={stats.hours_median_lost}
          promedio={stats.hours_avg_lost}
          p75={stats.hours_p75_lost}
          max={stats.hours_max_lost}
          std={stats.hours_std_lost}
          pctExcedeProm={stats.pct_over_avg_lost}
        />
        <div className="lg:col-span-2">
          <EquidistantTimeline
            title="Distribución Tiempo de Cierre"
            subtitle="Instalados + perdidos"
            icon={<Timer className="w-5 h-5" />}
            theme="purple"
            min={stats.hours_min_close}
            p25={stats.hours_p25_close}
            mediana={stats.hours_median_close}
            promedio={stats.hours_avg_close}
            p75={stats.hours_p75_close}
            max={stats.hours_max_close}
            std={stats.hours_std_close}
            pctExcedeProm={stats.pct_over_avg_close}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeonContainer
          theme="blue"
          title="Matriz de Tendencias por Periodo"
          subtitle="Click en cualquier tarjeta para ver el gráfico de volumen"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
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
          title="Efectividad por Etapa (Health Cards)"
          subtitle="Rendimiento del Embudo"
          icon={<Layers className="w-5 h-5" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
            {healthCards.map((card) => (
              <MetricCard
                key={card.id}
                label={card.label}
                value={`${card.pct}%`}
                caption="Tasa de Conversión"
                color={card.color}
                indicator
              >
                <ProgressBar label={`Exitosos (${card.successCount})`} percent={card.successPct} valueLabel={`${card.successPct}%`} color="green" />
                <ProgressBar label={`Caídas (${card.failCount})`} percent={card.failPct} valueLabel={`${card.failPct}%`} color="red" />
              </MetricCard>
            ))}
          </div>
        </NeonContainer>
      </div>

      <Modal
        isOpen={!!selectedTrend}
        onClose={() => setSelectedTrend(null)}
        title={`Evolución Histórica: ${selectedTrend?.title || ''}`}
        subtitle={`Volumen mensual de ${selectedTrend?.unitLabel || ''}`}
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
              <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Desglose Numérico por Periodo
                </span>
                <span className="text-xs font-bold text-brand font-mono">
                  {historico.length} periodos evaluados
                </span>
              </div>
              <Paginacion estado={pagination} posicion="arriba" />
              <div className="max-h-60 overflow-auto custom-scrollbar">
                <table className={READONLY_TABLE}>
                  <thead className={READONLY_TABLE_HEAD_STICKY}>
                    <tr>
                      <th className="p-4">Periodo</th>
                      <th className="p-4 text-right">Total Oportunidades</th>
                      <th className="p-4 text-right">{selectedTrend.unitLabel}</th>
                      <th className="p-4 text-right">Tasa del Periodo (%)</th>
                    </tr>
                  </thead>
                  <tbody className={READONLY_TABLE_BODY}>
                    {pagination.visibles.map((row, idx) => {
                      const countVal = Number(row[selectedTrend.countKey]) || 0;
                      const rateVal = Number(row[selectedTrend.rateKey]) || 0;
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-bold text-white">{formatPeriodLabel(String(row.report_period))}</td>
                          <td className="p-4 text-right text-slate-400 font-mono">{formatInteger(row.total_opportunities)}</td>
                          <td className="p-4 text-right font-black font-mono text-white">{formatInteger(countVal)}</td>
                          <td className="p-4 text-right font-black font-mono" style={{ color: chartColor }}>{rateVal}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Paginacion estado={pagination} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
