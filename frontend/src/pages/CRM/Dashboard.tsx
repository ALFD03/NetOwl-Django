import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { NeonContainer, MetricCard, Modal } from '@/components/UI';
import { MiniExceedRing, SparklineCard, MetricHealthCard, EquidistantTimeline } from '@/components/UI';
import { Line, Doughnut } from 'react-chartjs-2';
import { 
  CheckCircle2, XCircle, Users, Activity, 
  Clock, AlertTriangle, Layers, TrendingUp, TrendingDown,
  Maximize2, BarChart2, Zap
} from 'lucide-react';
import { formatPeriodoLabel } from '@/utils/formatters';

interface Props {
  metrics: any;
  periods: string[];
}

export default function CrmDashboard({ metrics = {} }: Props) {
  const historico = useMemo(() => metrics.historico_tendencias || [], [metrics]);
  const efectividad = useMemo(() => metrics.efectividad || [], [metrics]);

  const [selectedTrend, setSelectedTrend] = useState<{
    title: string;
    rateKey: string;
    countKey: string;
    unitLabel: string;
    color: string;
    bgColor: string;
    theme: 'green' | 'red' | 'blue' | 'yellow';
  } | null>(null);

  // 1. PROMEDIO DE PROMEDIOS SIMPLE
  const statsGlobales = useMemo(() => {
    const n = historico.length;
    if (n === 0) {
      return {
        total_oportunidades: 0,
        pct_instalacion: 0,
        pct_perdida: 0,
        pct_pendientes: 0,
        pct_devueltos_e8: 0,
        horas_promedio_inst: 0,
        horas_mediana_inst: 0,
        horas_p25_inst: 0,
        horas_p75_inst: 0,
        horas_min_inst: 0,
        horas_max_inst: 0,
        horas_std_inst: 0,
        pct_excede_prom_inst: 0,
        pct_excede_med_inst: 0,
        horas_promedio_perd: 0,
        horas_mediana_perd: 0,
        horas_p25_perd: 0,
        horas_p75_perd: 0,
        horas_min_perd: 0,
        horas_max_perd: 0,
        horas_std_perd: 0,
        pct_excede_prom_perd: 0,
        pct_excede_med_perd: 0,
      };
    }

    const sum = (key: string) => historico.reduce((acc: number, h: any) => acc + (Number(h[key]) || 0), 0);

    return {
      total_oportunidades: Math.round(sum('total_oportunidades') / n),
      pct_instalacion: Number((sum('pct_instalacion') / n).toFixed(2)),
      pct_perdida: Number((sum('pct_perdida') / n).toFixed(2)),
      pct_pendientes: Number((sum('pct_pendientes') / n).toFixed(2)),
      pct_devueltos_e8: Number((sum('pct_devueltos_e8') / n).toFixed(2)),

      horas_promedio_inst: Number((sum('horas_promedio_inst') / n).toFixed(2)),
      horas_mediana_inst: Number((sum('horas_mediana_inst') / n).toFixed(2)),
      horas_p25_inst: Number((sum('horas_p25_inst') / n).toFixed(2)),
      horas_p75_inst: Number((sum('horas_p75_inst') / n).toFixed(2)),
      horas_min_inst: Number((sum('horas_min_inst') / n).toFixed(2)),
      horas_max_inst: Number((sum('horas_max_inst') / n).toFixed(2)),
      horas_std_inst: Number((sum('horas_std_inst') / n).toFixed(2)),
      pct_excede_prom_inst: Number((sum('pct_excede_prom_inst') / n).toFixed(2)),
      pct_excede_med_inst: Number((sum('pct_excede_med_inst') / n).toFixed(2)),

      horas_promedio_perd: Number((sum('horas_promedio_perd') / n).toFixed(2)),
      horas_mediana_perd: Number((sum('horas_mediana_perd') / n).toFixed(2)),
      horas_p25_perd: Number((sum('horas_p25_perd') / n).toFixed(2)),
      horas_p75_perd: Number((sum('horas_p75_perd') / n).toFixed(2)),
      horas_min_perd: Number((sum('horas_min_perd') / n).toFixed(2)),
      horas_max_perd: Number((sum('horas_max_perd') / n).toFixed(2)),
      horas_std_perd: Number((sum('horas_std_perd') / n).toFixed(2)),
      pct_excede_prom_perd: Number((sum('pct_excede_prom_perd') / n).toFixed(2)),
      pct_excede_med_perd: Number((sum('pct_excede_med_perd') / n).toFixed(2)),
    };
  }, [historico]);

  

  // 6. DATOS DEL MODAL (GRAFICA TOTALES ABSOLUTOS)
  const modalChartData = useMemo(() => {
    if (!selectedTrend) return null;

    const labels = historico.map((h: any) => formatPeriodoLabel(h.periodo_reporte));
    const counts = historico.map((h: any) => Number(h[selectedTrend.countKey]) || 0);

    return {
      labels,
      datasets: [
        {
          label: `Total ${selectedTrend.unitLabel}`,
          data: counts,
          borderColor: selectedTrend.color,
          backgroundColor: selectedTrend.bgColor.replace('0.1', '0.25'),
          fill: true,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: selectedTrend.color,
          pointBorderColor: '#0b1326',
          pointBorderWidth: 2,
          pointHoverRadius: 8,
          tension: 0.35,
        },
      ],
    };
  }, [selectedTrend, historico]);

  const modalChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        backgroundColor: '#0b1326',
        titleColor: '#fff',
        bodyColor: selectedTrend?.color || '#fff',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        callbacks: { 
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} casos` 
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.25)' },
        ticks: { color: '#94a3b8', font: { size: 11, weight: 'bold' } },
      },
      y: {
        min: 0,
        grid: { color: 'rgba(51, 65, 85, 0.25)' },
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v: any) => v.toLocaleString() },
      },
    },
  };

  return (
    <AppLayout title="CRM Analytics Dashboard">
      <CrmHeader activeTab="dashboard" />

      {/* 1. FILA DE 5 CARDS VIBRANTES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard
          label="Total Oportunidades"
          value={statsGlobales.total_oportunidades.toLocaleString()}
          color="slate"
          subValue="Promedio mensual"
          icon={<Users className="w-4 h-4 text-slate-300" />}
        />

        <MetricCard
          label="Tasa Instalados"
          value={`${statsGlobales.pct_instalacion}%`}
          color="green"
          subValue="Ganados / Creados"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />

        <MetricCard
          label="Tasa Pérdida"
          value={`${statsGlobales.pct_perdida}%`}
          color="red"
          subValue="Perdidos / Creados"
          icon={<XCircle className="w-4 h-4 text-rose-400" />}
        />

        <MetricCard
          label="Tasa Pendiente"
          value={`${statsGlobales.pct_pendientes}%`}
          color="blue"
          subValue="Pipeline activo"
          icon={<Clock className="w-4 h-4 text-sky-400" />}
        />

        <MetricCard
          label="Devueltos E8"
          value={`${statsGlobales.pct_devueltos_e8}%`}
          color="yellow"
          subValue="Entradas a Etapa 8"
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* 2. FILA DE TIMELINES CON NEONCONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <EquidistantTimeline
          title="Distribución Tiempo de Instalación"
          icon={<CheckCircle2 className="w-5 h-5" />}
          theme="green"
          min={statsGlobales.horas_min_inst}
          p25={statsGlobales.horas_p25_inst}
          mediana={statsGlobales.horas_mediana_inst}
          promedio={statsGlobales.horas_promedio_inst}
          p75={statsGlobales.horas_p75_inst}
          max={statsGlobales.horas_max_inst}
          std={statsGlobales.horas_std_inst}
          pctExcedeProm={statsGlobales.pct_excede_prom_inst}
          pctExcedeMed={statsGlobales.pct_excede_med_inst}
        />

        <EquidistantTimeline
          title="Distribución Tiempo para Pérdida"
          icon={<XCircle className="w-5 h-5" />}
          theme="red"
          min={statsGlobales.horas_min_perd}
          p25={statsGlobales.horas_p25_perd}
          mediana={statsGlobales.horas_mediana_perd}
          promedio={statsGlobales.horas_promedio_perd}
          p75={statsGlobales.horas_p75_perd}
          max={statsGlobales.horas_max_perd}
          std={statsGlobales.horas_std_perd}
          pctExcedeProm={statsGlobales.pct_excede_prom_perd}
          pctExcedeMed={statsGlobales.pct_excede_med_perd}
        />
      </div>

      {/* 3. FILA SIMÉTRICA 2X2 CON NEONCONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LADO IZQUIERDO: MATRIZ DE TENDENCIAS EN NEONCONTAINER AZUL */}
        <NeonContainer
          theme="blue"
          title="Matriz de Tendencias por Periodo"
          subtitle="Click en cualquier tarjeta para ver el gráfico de volumen"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
            <SparklineCard
              title="Tasa Instalación"
              currentVal={statsGlobales.pct_instalacion}
              rateKey="pct_instalacion"
              countKey="ganados"
              unitLabel="Ganados / Instalados"
              color="#10b981"
              bgColor="rgba(16, 185, 129, 0.1)"
              theme="green"
              historico={historico}
              onSelect={(p) => setSelectedTrend({ title: p.title, rateKey: p.rateKey, countKey: p.countKey, unitLabel: p.unitLabel, color: p.color, bgColor: p.bgColor, theme: p.theme })}
            />

            <SparklineCard
              title="Tasa Pérdida"
              currentVal={statsGlobales.pct_perdida}
              rateKey="pct_perdida"
              countKey="perdidos"
              unitLabel="Oportunidades Perdidas"
              color="#f43f5e"
              bgColor="rgba(244, 63, 94, 0.1)"
              theme="red"
              historico={historico}
              onSelect={(p) => setSelectedTrend({ title: p.title, rateKey: p.rateKey, countKey: p.countKey, unitLabel: p.unitLabel, color: p.color, bgColor: p.bgColor, theme: p.theme })}
            />

            <SparklineCard
              title="Tasa Pendientes"
              currentVal={statsGlobales.pct_pendientes}
              rateKey="pct_pendientes"
              countKey="pendientes"
              unitLabel="Oportunidades en Curso"
              color="#38bdf8"
              bgColor="rgba(56, 189, 248, 0.1)"
              theme="blue"
              historico={historico}
              onSelect={(p) => setSelectedTrend({ title: p.title, rateKey: p.rateKey, countKey: p.countKey, unitLabel: p.unitLabel, color: p.color, bgColor: p.bgColor, theme: p.theme })}
            />

            <SparklineCard
              title="Prospectos Devueltos (E8)"
              currentVal={statsGlobales.pct_devueltos_e8}
              rateKey="pct_devueltos_e8"
              countKey="count_devueltos_e8"
              unitLabel="Devueltos a Etapa 8"
              color="#f59e0b"
              bgColor="rgba(245, 158, 11, 0.1)"
              theme="yellow"
              historico={historico}
              onSelect={(p) => setSelectedTrend({ title: p.title, rateKey: p.rateKey, countKey: p.countKey, unitLabel: p.unitLabel, color: p.color, bgColor: p.bgColor, theme: p.theme })}
            />
          </div>
        </NeonContainer>

        {/* LADO DERECHO: HEALTH CARDS EN NEONCONTAINER VERDE */}
        <NeonContainer
          theme="green"
          title="Efectividad por Etapa (Health Cards)"
          subtitle="Rendimiento del Embudo"
          icon={<Layers className="w-5 h-5" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1 items-stretch">
            {efectividad.map((ef: any) => (
              <MetricHealthCard
                key={ef.etapa}
                etapaName={ef.etapa}
                pct={ef.efectividad_pct}
                exitosos={ef.exitosos}
                fallidos={ef.fallidos}
                total={ef.total_salidas}
              />
            ))}
          </div>
        </NeonContainer>

      </div>

      {/* MODAL DETALLADO ACTUALIZADO CON TEMA NEON */}
      <Modal
        isOpen={!!selectedTrend}
        onClose={() => setSelectedTrend(null)}
        title={`Evolución Histórica: ${selectedTrend?.title || ''}`}
        subtitle={`Volumen mensual de ${selectedTrend?.unitLabel || ''}`}
        theme={selectedTrend?.theme || 'blue'}
        icon={<BarChart2 className="w-5 h-5 text-brand" />}
        size="xl"
      >
        {selectedTrend && modalChartData && (
          <div className="space-y-6">
            {/* Gráfico Ampliado dentro de contenedor estilizado */}
            <div className="bg-[#0b1326] p-6 rounded-3xl border border-slate-800 shadow-inner">
              <div className="h-72 w-full">
                <Line data={modalChartData} options={modalChartOptions} />
              </div>
            </div>

            {/* Tabla Detallada */}
            <div className="bg-[#0b1326] border border-slate-800 rounded-3xl overflow-hidden shadow-inner">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Desglose Numérico por Periodo
                </span>
                <span className="text-xs font-bold text-brand font-mono">
                  {historico.length} periodos evaluados
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase font-black sticky top-0 backdrop-blur-sm border-b border-slate-800">
                    <tr>
                      <th className="p-4">Periodo</th>
                      <th className="p-4 text-right">Total Oportunidades</th>
                      <th className="p-4 text-right">{selectedTrend.unitLabel}</th>
                      <th className="p-4 text-right">Tasa del Periodo (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historico.map((h: any, idx: number) => {
                      const countVal = Number(h[selectedTrend.countKey]) || 0;
                      const rateVal = Number(h[selectedTrend.rateKey]) || 0;
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-bold text-white">
                            {formatPeriodoLabel(h.periodo_reporte)}
                          </td>
                          <td className="p-4 text-right text-slate-400 font-mono">
                            {h.total_oportunidades?.toLocaleString() || 0}
                          </td>
                          <td className="p-4 text-right font-black font-mono text-white">
                            {countVal.toLocaleString()}
                          </td>
                          <td className="p-4 text-right font-black font-mono" style={{ color: selectedTrend.color }}>
                            {rateVal}%
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

    </AppLayout>
  );
}