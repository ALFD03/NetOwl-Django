import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { MetricCard } from '@/components/UI/MetricCard';
import { Modal } from '@/components/UI/Modal';
import { Line, Doughnut } from 'react-chartjs-2';
import { 
  CheckCircle2, XCircle, Users, Activity, 
  Clock, AlertTriangle, Layers, TrendingUp, TrendingDown,
  Maximize2
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

  // Mini SVG Ring
  const MiniExceedRing = ({ label, pct, color }: { label: string; pct: number; color: string }) => {
    const radius = 10;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;

    return (
      <div className="flex items-center gap-2.5 bg-[#0b1326] border border-slate-800 px-3 py-1.5 rounded-2xl shadow-inner">
        <div className="w-6 h-6 relative flex items-center justify-center flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r={radius} className="stroke-slate-800" strokeWidth="2.5" fill="transparent" />
            <circle
              cx="12"
              cy="12"
              r={radius}
              stroke={color}
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
        </div>
        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase block leading-none">{label}</span>
          <span className="text-xs font-black font-mono mt-0.5 block leading-none" style={{ color }}>{pct}%</span>
        </div>
      </div>
    );
  };

  // Timeline Equidistante
  const EquidistantTimeline = ({
    title,
    icon,
    theme = 'green',
    min,
    p25,
    mediana,
    promedio,
    p75,
    max,
    std,
    pctExcedeProm,
    pctExcedeMed,
  }: any) => {
    const isGreen = theme === 'green';

    const nodes = [
      { key: 'min', label: 'Min', val: min, textCol: 'text-slate-400', dotBg: 'bg-slate-500' },
      { key: 'p25', label: 'P25', val: p25, textCol: 'text-sky-400', dotBg: 'bg-sky-400' },
      { key: 'std_min', label: '-1σ', val: Number(Math.max(0, promedio - std).toFixed(1)), textCol: 'text-purple-400', dotBg: 'bg-purple-400' },
      { key: 'med', label: 'Mediana', val: mediana, textCol: 'text-amber-400', dotBg: 'bg-amber-400 ring-4 ring-amber-400/20' },
      { key: 'prom', label: 'Promedio', val: promedio, textCol: isGreen ? 'text-emerald-400' : 'text-rose-400', dotBg: isGreen ? 'bg-emerald-400 ring-4 ring-emerald-400/20' : 'bg-rose-400 ring-4 ring-rose-400/20' },
      { key: 'std_plus', label: '+1σ', val: Number((promedio + std).toFixed(1)), textCol: 'text-purple-400', dotBg: 'bg-purple-400' },
      { key: 'p75', label: 'P75', val: p75, textCol: 'text-sky-400', dotBg: 'bg-sky-400' },
      { key: 'max', label: 'Max', val: max, textCol: 'text-slate-400', dotBg: 'bg-slate-500' },
    ];

    return (
      <NeonContainer
        theme={theme}
        title={title}
        subtitle={`Desviación Estándar (σ): ${std} h`}
        icon={icon}
        headerAction={
          <div className="flex items-center gap-2">
            <MiniExceedRing label="Excede Prom" pct={pctExcedeProm} color="#38bdf8" />
            <MiniExceedRing label="Excede Med" pct={pctExcedeMed} color="#f59e0b" />
          </div>
        }
      >
        <div className="py-4 px-2">
          <div className="relative flex items-center justify-between">
            <div className="absolute left-3 right-3 h-1.5 bg-slate-800 rounded-full z-0" />
            {nodes.map((node) => (
              <div key={node.key} className="relative z-10 flex flex-col items-center">
                <span className={`text-[10px] font-black uppercase tracking-tight mb-2 ${node.textCol}`}>{node.label}</span>
                <div className={`w-3.5 h-3.5 rounded-full border-2 border-[#0b1326] transition-transform hover:scale-125 ${node.dotBg}`} />
                <span className="text-xs font-black text-white font-mono mt-2">{node.val}<span className="text-[9px] text-slate-500 font-normal ml-0.5">h</span></span>
              </div>
            ))}
          </div>
        </div>
      </NeonContainer>
    );
  };

  // Sparkline Card
  const SparklineCard = ({ title, currentVal, rateKey, countKey, unitLabel, color, bgColor }: any) => {
    const labels = historico.map((h: any) => formatPeriodoLabel(h.periodo_reporte));
    const values = historico.map((h: any) => Number(h[rateKey]) || 0);

    const firstVal = values[0] || 0;
    const lastVal = values[values.length - 1] || 0;
    const diff = Number((lastVal - firstVal).toFixed(1));
    const isUp = diff >= 0;

    const chartData = {
      labels,
      datasets: [
        {
          data: values,
          borderColor: color,
          backgroundColor: bgColor,
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
          tension: 0.4,
        },
      ],
    };

    const chartOptions: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: '#0b1326',
          titleColor: '#fff',
          bodyColor: color,
          borderColor: '#334155',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 8,
          callbacks: { label: (ctx: any) => ` ${title}: ${ctx.raw}%` },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: Math.max(...values, 10) * 1.15 },
      },
    };

    return (
      <div 
        onClick={() => setSelectedTrend({ title, rateKey, countKey, unitLabel, color, bgColor })}
        className="bg-[#0b1326] border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-inner group hover:border-brand/60 hover:bg-white/[0.02] cursor-pointer transition-all relative overflow-hidden"
      >
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand" />
        </div>

        <div className="flex items-center justify-between mb-1 pr-4">
          <span className="text-xs font-black text-white uppercase tracking-wider truncate">
            {title}
          </span>
          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
          }`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {diff > 0 ? `+${diff}%` : `${diff}%`}
          </span>
        </div>

        <div className="my-1">
          <span className="text-3xl font-black tracking-tight" style={{ color }}>
            {currentVal}%
          </span>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block -mt-0.5">
            Promedio Global (Click para totales)
          </span>
        </div>

        <div className="h-14 w-full mt-2">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    );
  };

  // Health Card
  const MetricHealthCard = ({ etapaName, pct, exitosos, fallidos, total }: any) => {
    const isGood = pct >= 80;
    const isMid = pct >= 60 && pct < 80;
    const pulseColor = isGood ? 'bg-emerald-400' : isMid ? 'bg-amber-400' : 'bg-rose-400';
    const textColor = isGood ? 'text-emerald-400' : isMid ? 'text-amber-400' : 'text-rose-400';

    const pctExito = total > 0 ? Math.round((exitosos / total) * 100) : 0;
    const pctFallo = total > 0 ? Math.round((fallidos / total) * 100) : 0;

    return (
      <div className="bg-[#0b1326] border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shadow-inner relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-black text-white uppercase tracking-wider truncate" title={etapaName}>
            {etapaName.replace('etapa_', '').replace('_', ' ')}
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pulseColor}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pulseColor}`} />
          </span>
        </div>

        <div className="my-1">
          <div className={`text-3xl font-black tracking-tight ${textColor}`}>
            {pct}%
          </div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block -mt-0.5">
            Tasa de Conversión
          </span>
        </div>

        <div className="space-y-2 pt-2.5 border-t border-slate-800/80">
          <div>
            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
              <span>Exitosos ({exitosos})</span>
              <span className="text-emerald-400">{pctExito}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctExito}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
              <span>Caídas ({fallidos})</span>
              <span className="text-rose-400">{pctFallo}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pctFallo}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Modal Data
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
          backgroundColor: selectedTrend.bgColor.replace('0.1', '0.2'),
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
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} oportunidades` 
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
          subtitle="Click en cualquier tarjeta para ver totales"
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
            />

            <SparklineCard
              title="Tasa Pérdida"
              currentVal={statsGlobales.pct_perdida}
              rateKey="pct_perdida"
              countKey="perdidos"
              unitLabel="Oportunidades Perdidas"
              color="#f43f5e"
              bgColor="rgba(244, 63, 94, 0.1)"
            />

            <SparklineCard
              title="Tasa Pendientes"
              currentVal={statsGlobales.pct_pendientes}
              rateKey="pct_pendientes"
              countKey="pendientes"
              unitLabel="Oportunidades en Curso"
              color="#38bdf8"
              bgColor="rgba(56, 189, 248, 0.1)"
            />

            <SparklineCard
              title="Prospectos Devueltos (E8)"
              currentVal={statsGlobales.pct_devueltos_e8}
              rateKey="pct_devueltos_e8"
              countKey="count_devueltos_e8"
              unitLabel="Devueltos a Etapa 8"
              color="#f59e0b"
              bgColor="rgba(245, 158, 11, 0.1)"
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

      {/* MODAL DETALLADO CON TOTALES REALES */}
      <Modal
        isOpen={!!selectedTrend}
        onClose={() => setSelectedTrend(null)}
        title={`Historial de Volumen: Total de ${selectedTrend?.unitLabel || ''}`}
        size="xl"
      >
        {selectedTrend && modalChartData && (
          <div className="space-y-6">
            <div className="bg-[#0b1326] p-6 rounded-3xl border border-slate-800 shadow-inner">
              <div className="h-72">
                <Line data={modalChartData} options={modalChartOptions} />
              </div>
            </div>

            <div className="bg-[#0b1326] border border-slate-800 rounded-3xl overflow-hidden shadow-inner">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Desglose Absoluto y Porcentual
                </span>
                <span className="text-xs font-bold text-brand font-mono">
                  {historico.length} periodos evaluados
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/50 text-slate-400 uppercase font-black sticky top-0 backdrop-blur-sm">
                    <tr>
                      <th className="p-3.5">Periodo</th>
                      <th className="p-3.5 text-right">Total Creados</th>
                      <th className="p-3.5 text-right">Total {selectedTrend.unitLabel}</th>
                      <th className="p-3.5 text-right">Tasa del Periodo (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historico.map((h: any, idx: number) => {
                      const countVal = Number(h[selectedTrend.countKey]) || 0;
                      const rateVal = Number(h[selectedTrend.rateKey]) || 0;
                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="p-3.5 font-bold text-white">
                            {formatPeriodoLabel(h.periodo_reporte)}
                          </td>
                          <td className="p-3.5 text-right text-slate-400 font-mono">
                            {h.total_oportunidades?.toLocaleString() || 0}
                          </td>
                          <td className="p-3.5 text-right font-black font-mono text-white">
                            {countVal.toLocaleString()}
                          </td>
                          <td className="p-3.5 text-right font-black font-mono" style={{ color: selectedTrend.color }}>
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