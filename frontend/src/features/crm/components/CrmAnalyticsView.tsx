import { useMemo } from 'react';
import { Activity, CheckCircle2, Clock3, TrendingDown, TrendingUp, XCircle } from 'lucide-react';

import { BarChart, LineChart } from '@/shared/charts';
import { EmptyState, MetricCard, NeonContainer, ProgressBar, StatTile } from '@/shared/ui';
import { formatInteger, formatPercentage } from '@/shared/utils/formatters';
import type { useCrmDashboard } from '../hooks/useCrmDashboard';

interface CrmAnalyticsViewProps {
  data: ReturnType<typeof useCrmDashboard>;
}

const CHART_HEIGHT = 'h-[360px]';

export function CrmAnalyticsView({ data }: CrmAnalyticsViewProps) {
  const { historico, stats, trendCards, healthCards } = data;

  const labels = useMemo(
    () => historico.map((row) => String(row.periodo_reporte ?? '')),
    [historico],
  );

  const trendChart = useMemo(() => ({
    labels,
    datasets: trendCards.map((card) => ({
      label: card.title,
      data: card.values,
      borderWidth: 2,
      tension: 0.35,
      fill: false,
    })),
  }), [labels, trendCards]);

  const stageChart = useMemo(() => ({
    labels: healthCards.map((card) => card.label),
    datasets: [{ label: 'Efectividad', data: healthCards.map((card) => card.pct), borderWidth: 1 }],
  }), [healthCards]);

  const processTimes = useMemo(() => [
    { label: 'Inst. promedio', value: stats.horas_promedio_inst },
    { label: 'Inst. mediana', value: stats.horas_mediana_inst },
    { label: 'Inst. P75', value: stats.horas_p75_inst },
    { label: 'Inst. máx.', value: stats.horas_max_inst },
    { label: 'Pérd. promedio', value: stats.horas_promedio_perd },
    { label: 'Pérd. mediana', value: stats.horas_mediana_perd },
    { label: 'Pérd. P75', value: stats.horas_p75_perd },
    { label: 'Pérd. máx.', value: stats.horas_max_perd },
  ], [stats]);

  const hasTrends = trendCards.length > 0 && labels.length > 0;
  const hasHealth = healthCards.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Oportunidades promedio"
          value={formatInteger(stats.total_oportunidades)}
          subValue="Promedio del histórico"
          color="slate"
          icon={<Activity className="h-4 w-4 text-slate-300" />}
        />
        <MetricCard
          label="Instalación"
          value={`${formatPercentage(stats.pct_instalacion)}%`}
          subValue="Ganados / oportunidades"
          color="green"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        />
        <MetricCard
          label="Pérdida"
          value={`${formatPercentage(stats.pct_perdida)}%`}
          subValue="Oportunidades perdidas"
          color="red"
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
        />
        <MetricCard
          label="Pendientes"
          value={`${formatPercentage(stats.pct_pendientes)}%`}
          subValue="Pipeline activo"
          color="blue"
          icon={<Clock3 className="h-4 w-4 text-sky-400" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <NeonContainer
          title="Evolución de indicadores"
          subtitle="Tendencias del histórico CRM"
          icon={<TrendingUp className="h-5 w-5" />}
          theme="blue"
          className="xl:col-span-2"
        >
          {hasTrends ? (
            <LineChart data={trendChart} className={`${CHART_HEIGHT} w-full`} />
          ) : (
            <EmptyState title="No hay datos históricos disponibles." className={CHART_HEIGHT} />
          )}
        </NeonContainer>

        <NeonContainer
          title="Efectividad por etapa"
          subtitle="Resultado de las salidas del proceso"
          icon={<Activity className="h-5 w-5" />}
          theme="green"
        >
          {hasHealth ? (
            <BarChart data={stageChart} className={`${CHART_HEIGHT} w-full`} />
          ) : (
            <EmptyState title="No hay datos de efectividad." className={CHART_HEIGHT} />
          )}
        </NeonContainer>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NeonContainer
          title="Indicadores de tendencia"
          subtitle="Promedio y comportamiento histórico"
          icon={<TrendingUp className="h-5 w-5" />}
          theme="slate"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {trendCards.map((card) => (
              <StatTile
                key={card.id}
                label={card.title}
                value={card.value}
                caption={card.unitLabel}
                variant="boxed"
                size="lg"
              />
            ))}
          </div>
        </NeonContainer>

        <NeonContainer
          title="Eficiencia del pipeline"
          subtitle="Éxitos y fallos por etapa"
          icon={<TrendingDown className="h-5 w-5" />}
          theme="slate"
        >
          <div className="space-y-3">
            {healthCards.map((card) => (
              <div key={card.id} className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-bold capitalize text-white">{card.label}</span>
                  <span className="text-sm font-black text-white">{formatPercentage(card.pct)}%</span>
                </div>
                <ProgressBar label="Efectividad" percent={card.pct} color="green" />
                <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                  <span>Éxitos: {formatInteger(card.successCount)}</span>
                  <span>Fallos: {formatInteger(card.failCount)}</span>
                </div>
              </div>
            ))}
            {!hasHealth && <EmptyState title="No hay datos de efectividad." />}
          </div>
        </NeonContainer>
      </div>

      <NeonContainer
        title="Tiempos del proceso"
        subtitle="Distribución promedio del ciclo CRM"
        icon={<Clock3 className="h-5 w-5" />}
        theme="slate"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          {processTimes.map(({ label, value }) => (
            <StatTile
              key={label}
              label={label}
              value={`${Number(value).toFixed(1)} h`}
              variant="boxed"
              size="md"
              className="p-3"
            />
          ))}
        </div>
      </NeonContainer>
    </div>
  );
}
