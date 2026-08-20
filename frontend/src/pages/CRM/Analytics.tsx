import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { DataTable, Column } from '@/components/UI/DataTable';
import { router } from '@inertiajs/react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { 
  Calendar, Users, Building2, Megaphone, CheckCircle2, 
  XCircle, Clock, AlertTriangle, Zap, Trophy, TrendingUp,
  Activity, Layers, PieChart, BarChart3, Table as TableIcon
} from 'lucide-react';
import { formatPeriodoLabel, PALETTE } from '@/utils/formatters';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { handleHover } from '@/components/Charts/chartOptions';
import ChartDataLabels from 'chartjs-plugin-datalabels';

interface Props {
  dimensionsData: any[];
  periods: string[];
  selectedPeriod: string;
  selectedDimension: string;
}

export default function CrmAnalytics({
  dimensionsData = [],
  periods = [],
  selectedPeriod = '',
  selectedDimension = 'sucursal',
}: Props) {
  const [hoveredInst, setHoveredInst] = useState<{ name: string; val: string } | null>(null);
  const [hoveredPerd, setHoveredPerd] = useState<{ name: string; val: string } | null>(null);

  const dimOptions = [
    { key: 'sucursal', label: 'Sucursal', icon: Building2 },
    { key: 'vendedor', label: 'Vendedor', icon: Users },
    { key: 'campana', label: 'Campaña', icon: Megaphone },
  ];

  const handlePeriodChange = (p: string) => {
    router.get('/crm/analytics/', { period: p, dimension: selectedDimension }, { preserveState: true });
  };

  const handleDimChange = (d: string) => {
    router.get('/crm/analytics/', { period: selectedPeriod, dimension: d }, { preserveState: true });
  };

  // --- 1. AGREGACIÓN DE RESUMEN TOTAL DEL PERIODO ---
  const totalsPeriodo = useMemo(() => {
    let totOp = 0;
    let totGan = 0;
    let totPerd = 0;
    let totPend = 0;
    let totE8 = 0;

    dimensionsData.forEach((row: any) => {
      const m = row.metricas || {};
      totOp += Number(m.total_oportunidades) || 0;
      totGan += Number(m.ganados) || 0;
      totPerd += Number(m.perdidos) || 0;
      totPend += Number(m.pendientes) || 0;
      totE8 += Number(m.count_devueltos_e8) || 0;
    });

    const pctInst = totOp > 0 ? Number(((totGan / totOp) * 100).toFixed(2)) : 0;
    const pctPerd = totOp > 0 ? Number(((totPerd / totOp) * 100).toFixed(2)) : 0;
    const pctPend = totOp > 0 ? Number(((totPend / totOp) * 100).toFixed(2)) : 0;
    const pctE8 = totOp > 0 ? Number(((totE8 / totOp) * 100).toFixed(2)) : 0;

    const avgInst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_promedio_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const medInst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_mediana_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const p25Inst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_p25_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const p75Inst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_p75_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const minInst = dimensionsData.length > 0
      ? Math.min(...dimensionsData.map((r) => Number(r.metricas?.horas_min_inst) || 0))
      : 0;
    const maxInst = dimensionsData.length > 0
      ? Math.max(...dimensionsData.map((r) => Number(r.metricas?.horas_max_inst) || 0))
      : 0;
    const stdInst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_std_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const pctExcedePromInst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.pct_excede_prom_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const pctExcedeMedInst = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.pct_excede_med_inst) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;

    const avgPerd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_promedio_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const medPerd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_mediana_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const p25Perd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_p25_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const p75Perd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_p75_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const minPerd = dimensionsData.length > 0
      ? Math.min(...dimensionsData.map((r) => Number(r.metricas?.horas_min_perd) || 0))
      : 0;
    const maxPerd = dimensionsData.length > 0
      ? Math.max(...dimensionsData.map((r) => Number(r.metricas?.horas_max_perd) || 0))
      : 0;
    const stdPerd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.horas_std_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const pctExcedePromPerd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.pct_excede_prom_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;
    const pctExcedeMedPerd = dimensionsData.length > 0
      ? Number((dimensionsData.reduce((acc, r) => acc + (Number(r.metricas?.pct_excede_med_perd) || 0), 0) / dimensionsData.length).toFixed(1))
      : 0;

    return {
      totOp,
      totGan,
      totPerd,
      totPend,
      totE8,
      pctInst,
      pctPerd,
      pctPend,
      pctE8,
      inst: { avg: avgInst, med: medInst, p25: p25Inst, p75: p75Inst, min: minInst, max: maxInst, std: stdInst, exProm: pctExcedePromInst, exMed: pctExcedeMedInst },
      perd: { avg: avgPerd, med: medPerd, p25: p25Perd, p75: p75Perd, min: minPerd, max: maxPerd, std: stdPerd, exProm: pctExcedePromPerd, exMed: pctExcedeMedPerd },
    };
  }, [dimensionsData]);

  // --- 2. RESUMEN DE LÍDERES (FILA 3) ---
  const podioLideres = useMemo(() => {
    if (dimensionsData.length === 0) return null;

    const validRows = dimensionsData.filter((r) => (Number(r.metricas?.total_oportunidades) || 0) > 0);
    if (validRows.length === 0) return null;

    const totOpGlobal = totalsPeriodo.totOp || 1;
    const totGanGlobal = totalsPeriodo.totGan || 1;

    // 1. Mejor Tasa de Cierre
    const bestRate = [...validRows].sort((a, b) => (Number(b.metricas?.pct_instalacion) || 0) - (Number(a.metricas?.pct_instalacion) || 0))[0];

    // 2. Mayor Volumen de Instalados
    const maxWon = [...validRows].sort((a, b) => (Number(b.metricas?.ganados) || 0) - (Number(a.metricas?.ganados) || 0))[0];
    const maxWonSharePct = maxWon ? Number(((Number(maxWon.metricas?.ganados || 0) / totGanGlobal) * 100).toFixed(2)) : 0;

    // 3. Mayor Volumen de Oportunidades
    const maxLeads = [...validRows].sort((a, b) => (Number(b.metricas?.total_oportunidades) || 0) - (Number(a.metricas?.total_oportunidades) || 0))[0];
    const maxLeadsSharePct = maxLeads ? Number(((Number(maxLeads.metricas?.total_oportunidades || 0) / totOpGlobal) * 100).toFixed(2)) : 0;

    // 4. Despliegue Más Rápido (con ganados > 0)
    const rowsWithWon = validRows.filter((r) => (Number(r.metricas?.ganados) || 0) > 0 && (Number(r.metricas?.horas_promedio_inst) || 0) > 0);
    const fastest = rowsWithWon.length > 0 ? [...rowsWithWon].sort((a, b) => (Number(a.metricas?.horas_promedio_inst) || 0) - (Number(b.metricas?.horas_promedio_inst) || 0))[0] : null;

    // 5. Más Pérdidas
    const maxLost = [...validRows].sort((a, b) => (Number(b.metricas?.perdidos) || 0) - (Number(a.metricas?.perdidos) || 0))[0];

    // 6. Mayor Devueltos E8
    const maxE8 = [...validRows].sort((a, b) => (Number(b.metricas?.count_devueltos_e8) || 0) - (Number(a.metricas?.count_devueltos_e8) || 0))[0];

    return { bestRate, maxWon, maxWonSharePct, maxLeads, maxLeadsSharePct, fastest, maxLost, maxE8 };
  }, [dimensionsData, totalsPeriodo]);

  // --- 3. GRÁFICAS DE DONA (FILA 5: > 4.5% + DATALABELS + TEXTO CENTRAL) ---
  const { donutInstalaciones, donutPerdidas } = useMemo(() => {
    const totG = totalsPeriodo.totGan || 1;
    const totP = totalsPeriodo.totPerd || 1;

    // Instalaciones
    const instItems = dimensionsData.map((d: any) => {
      const gan = Number(d.metricas?.ganados) || 0;
      const share = (gan / totG) * 100;
      return { label: d.valor, share, original: Number(share.toFixed(2)) };
    }).sort((a, b) => b.share - a.share);

    const instMajors = instItems.filter((i) => i.share > 4.5);
    const instOthers = instItems.filter((i) => i.share <= 4.5).reduce((acc, i) => acc + i.share, 0);

    const donutInstalaciones = {
      labels: [...instMajors.map((m) => m.label), ...(instOthers > 0 ? ['Otros (≤ 4.5%)'] : [])],
      datasets: [
        {
          data: [...instMajors.map((m) => Number(m.share.toFixed(2))), ...(instOthers > 0 ? [Number(instOthers.toFixed(2))] : [])],
          backgroundColor: PALETTE.slice(0, instMajors.length + 1),
          borderWidth: 2,
          borderColor: '#0f1a36',
        },
      ],
      _raw: [...instItems, { label: 'Otros (≤ 4.5%)', original: Number(instOthers.toFixed(2)) }],
    };

    // Pérdidas
    const perdItems = dimensionsData.map((d: any) => {
      const perd = Number(d.metricas?.perdidos) || 0;
      const share = (perd / totP) * 100;
      return { label: d.valor, share, original: Number(share.toFixed(2)) };
    }).sort((a, b) => b.share - a.share);

    const perdMajors = perdItems.filter((i) => i.share > 4.5);
    const perdOthers = perdItems.filter((i) => i.share <= 4.5).reduce((acc, i) => acc + i.share, 0);

    const donutPerdidas = {
      labels: [...perdMajors.map((m) => m.label), ...(perdOthers > 0 ? ['Otros (≤ 4.5%)'] : [])],
      datasets: [
        {
          data: [...perdMajors.map((m) => Number(m.share.toFixed(2))), ...(perdOthers > 0 ? [Number(perdOthers.toFixed(2))] : [])],
          backgroundColor: PALETTE.slice(0, perdMajors.length + 1),
          borderWidth: 2,
          borderColor: '#0f1a36',
        },
      ],
      _raw: [...perdItems, { label: 'Otros (≤ 4.5%)', original: Number(perdOthers.toFixed(2)) }],
    };

    return { donutInstalaciones, donutPerdidas };
  }, [dimensionsData, totalsPeriodo]);

  const instDonutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      customCenterText: {
        title: hoveredInst ? hoveredInst.name : 'Total Ganados',
        value: hoveredInst ? hoveredInst.val : `${totalsPeriodo.totGan.toLocaleString()}`,
        color: '#10b981',
      },
      onHover: handleHover(setHoveredInst, donutInstalaciones, '%'),
      plugins: {
        legend: { position: 'right' as const, labels: { color: '#cbd5e1', font: { size: 10 }, usePointStyle: true } },
        tooltip: { enabled: false },
        datalabels: {
          display: true,
          color: '#ffffff',
          font: { weight: 'bold' as const, size: 9 },
          formatter: (val: number) => (val >= 4.5 ? `${val}%` : ''),
        },
      },
    };
  }, [hoveredInst, donutInstalaciones, totalsPeriodo]);

  const perdDonutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      customCenterText: {
        title: hoveredPerd ? hoveredPerd.name : 'Total Perdidos',
        value: hoveredPerd ? hoveredPerd.val : `${totalsPeriodo.totPerd.toLocaleString()}`,
        color: '#f43f5e',
      },
      onHover: handleHover(setHoveredPerd, donutPerdidas, '%'),
      plugins: {
        legend: { position: 'right' as const, labels: { color: '#cbd5e1', font: { size: 10 }, usePointStyle: true } },
        tooltip: { enabled: false },
        datalabels: {
          display: true,
          color: '#ffffff',
          font: { weight: 'bold' as const, size: 9 },
          formatter: (val: number) => (val >= 4.5 ? `${val}%` : ''),
        },
      },
    };
  }, [hoveredPerd, donutPerdidas, totalsPeriodo]);

  // --- 4. GRÁFICAS DE BARRAS DE MOTIVOS (FILA 6) ---
  const { barMotivosPerdida, barMotivosE8 } = useMemo(() => {
    const motivosPerdMap: Record<string, number> = {};
    const motivosE8Map: Record<string, number> = {};

    dimensionsData.forEach((row: any) => {
      const m = row.metricas || {};
      (m.distribucion_perdidos || []).forEach((dp: any) => {
        motivosPerdMap[dp.motivo] = (motivosPerdMap[dp.motivo] || 0) + (Number(dp.total) || 0);
      });
      (m.distribucion_e8 || []).forEach((de8: any) => {
        motivosE8Map[de8.motivo] = (motivosE8Map[de8.motivo] || 0) + (Number(de8.total) || 0);
      });
    });

    const sortedPerd = Object.entries(motivosPerdMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const sortedE8 = Object.entries(motivosE8Map).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const barMotivosPerdida = {
      labels: sortedPerd.map((s) => s[0]),
      datasets: [
        {
          label: 'Total Perdidos',
          data: sortedPerd.map((s) => s[1]),
          backgroundColor: '#f43f5e',
          borderRadius: 8,
        },
      ],
    };

    const barMotivosE8 = {
      labels: sortedE8.map((s) => s[0]),
      datasets: [
        {
          label: 'Total Devueltos',
          data: sortedE8.map((s) => s[1]),
          backgroundColor: '#f59e0b',
          borderRadius: 8,
        },
      ],
    };

    return { barMotivosPerdida, barMotivosE8 };
  }, [dimensionsData]);

  // --- 5. MINI DONUT SVG PARA CABECERA ---
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

  // --- 6. TIMELINE EQUIDISTANTE CON NEONCONTAINER ---
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

  // --- 7. COLUMNAS DE LA TABLA MAESTRA ---
  const tableColumns: Column<any>[] = [
    {
      header: selectedDimension.toUpperCase(),
      accessor: (r) => <span className="font-bold text-white sticky left-0 bg-[#0f1a36] z-10 pr-4 min-w-[150px] block">{r.valor}</span>,
      sortKey: 'valor',
    },
    { header: 'Oportunidades', accessor: (r) => r.metricas?.total_oportunidades?.toLocaleString() || 0, align: 'right', sortKey: 'total_oportunidades' },
    { header: 'Ganados', accessor: (r) => <span className="text-emerald-400 font-semibold">{r.metricas?.ganados?.toLocaleString() || 0}</span>, align: 'right', sortKey: 'ganados' },
    { header: '% Instalación', accessor: (r) => <span className="text-emerald-400 font-bold">{r.metricas?.pct_instalacion || 0}%</span>, align: 'right', sortKey: 'pct_instalacion' },
    { header: 'Perdidos', accessor: (r) => <span className="text-rose-400 font-semibold">{r.metricas?.perdidos?.toLocaleString() || 0}</span>, align: 'right', sortKey: 'perdidos' },
    { header: '% Pérdida', accessor: (r) => <span className="text-rose-400 font-bold">{r.metricas?.pct_perdida || 0}%</span>, align: 'right', sortKey: 'pct_perdida' },
    { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{r.metricas?.pendientes?.toLocaleString() || 0}</span>, align: 'right', sortKey: 'pendientes' },
    { header: '% Pendientes', accessor: (r) => <span className="text-sky-400">{r.metricas?.pct_pendientes || 0}%</span>, align: 'right', sortKey: 'pct_pendientes' },
    { header: 'Devueltos E8', accessor: (r) => <span className="text-amber-400">{r.metricas?.count_devueltos_e8 || 0}</span>, align: 'right', sortKey: 'count_devueltos_e8' },
    { header: '% Devueltos E8', accessor: (r) => <span className="text-amber-400">{r.metricas?.pct_devueltos_e8 || 0}%</span>, align: 'right', sortKey: 'pct_devueltos_e8' },
    { header: 'Lead Time Inst. (h)', accessor: (r) => `${r.metricas?.horas_promedio_inst || 0} h`, align: 'right', sortKey: 'horas_promedio_inst' },
    { header: 'Tiempo Pérdida (h)', accessor: (r) => `${r.metricas?.horas_promedio_perd || 0} h`, align: 'right', sortKey: 'horas_promedio_perd' },
  ];

  const flattenedTableData = useMemo(() => {
    return dimensionsData.map((d: any) => ({
      valor: d.valor,
      total_oportunidades: Number(d.metricas?.total_oportunidades) || 0,
      ganados: Number(d.metricas?.ganados) || 0,
      pct_instalacion: Number(d.metricas?.pct_instalacion) || 0,
      perdidos: Number(d.metricas?.perdidos) || 0,
      pct_perdida: Number(d.metricas?.pct_perdida) || 0,
      pendientes: Number(d.metricas?.pendientes) || 0,
      pct_pendientes: Number(d.metricas?.pct_pendientes) || 0,
      count_devueltos_e8: Number(d.metricas?.count_devueltos_e8) || 0,
      pct_devueltos_e8: Number(d.metricas?.pct_devueltos_e8) || 0,
      horas_promedio_inst: Number(d.metricas?.horas_promedio_inst) || 0,
      horas_promedio_perd: Number(d.metricas?.horas_promedio_perd) || 0,
      metricas: d.metricas,
    }));
  }, [dimensionsData]);

  return (
    <AppLayout title="CRM Analytics Dimensional">
      <CrmHeader activeTab="analytics" />

      {/* ==========================================
          FILA 1: SELECTOR DE PERIODO Y FILTRO DE DIMENSIÓN
          ========================================== */}
      <div className="bg-surface-secondary border border-slate-800 rounded-3xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-2 bg-[#0f1a36] border border-slate-700/50 rounded-2xl px-4 py-2">
          <Calendar className="w-4 h-4 text-brand" />
          <span className="text-[10px] font-black uppercase text-slate-400">Mes Evaluado</span>
          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
          >
            {periods.map((p) => (
              <option key={p} value={p} className="bg-[#0f1a36]">
                {formatPeriodoLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 bg-[#0f1a36] p-1.5 rounded-2xl border border-slate-800">
          {dimOptions.map((opt) => {
            const Icon = opt.icon;
            const isActive = selectedDimension === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => handleDimChange(opt.key)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-105'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          FILA 2: RESUMEN DE CARDS DEL PERIODO
          ========================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard
          label="Total Oportunidades"
          value={totalsPeriodo.totOp.toLocaleString()}
          color="slate"
          subValue={formatPeriodoLabel(selectedPeriod)}
          icon={<Users className="w-4 h-4 text-slate-300" />}
        />

        <MetricCard
          label="Tasa Instalados"
          value={`${totalsPeriodo.pctInst}%`}
          color="green"
          subValue={`${totalsPeriodo.totGan.toLocaleString()} ganados`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />

        <MetricCard
          label="Tasa Pérdida"
          value={`${totalsPeriodo.pctPerd}%`}
          color="red"
          subValue={`${totalsPeriodo.totPerd.toLocaleString()} perdidos`}
          icon={<XCircle className="w-4 h-4 text-rose-400" />}
        />

        <MetricCard
          label="Tasa Pendiente"
          value={`${totalsPeriodo.pctPend}%`}
          color="blue"
          subValue={`${totalsPeriodo.totPend.toLocaleString()} en curso`}
          icon={<Clock className="w-4 h-4 text-sky-400" />}
        />

        <MetricCard
          label="Devueltos E8"
          value={`${totalsPeriodo.pctE8}%`}
          color="yellow"
          subValue={`${totalsPeriodo.totE8.toLocaleString()} devueltos`}
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* ==========================================
          FILA 3: RESUMEN DE LÍDERES
          ========================================== */}
      {podioLideres && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
          {/* 1. Mejor Tasa */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-surface-secondary to-[#0b1326] border border-emerald-500/40 shadow-xl shadow-emerald-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <span className="text-[9px] font-black uppercase">Mejor Tasa Cierre</span>
              <Trophy className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.bestRate?.valor}>
              {podioLideres.bestRate?.valor}
            </span>
            <span className="text-lg font-black text-emerald-400 mt-1 font-mono">
              {podioLideres.bestRate?.metricas?.pct_instalacion}%
            </span>
          </div>

          {/* 2. Más Instalados (Share % sobre total ganado) */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-sky-950/40 via-surface-secondary to-[#0b1326] border border-sky-500/40 shadow-xl shadow-sky-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-sky-400 mb-1">
              <span className="text-[9px] font-black uppercase">Más Instalados</span>
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.maxWon?.valor}>
              {podioLideres.maxWon?.valor}
            </span>
            <span className="text-lg font-black text-sky-400 mt-1 font-mono">
              {podioLideres.maxWonSharePct}% <span className="text-[10px] text-slate-400 font-normal">({podioLideres.maxWon?.metricas?.ganados})</span>
            </span>
          </div>

          {/* 3. Más Oportunidades (Share % sobre total de oportunidades) */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-sky-950/40 via-surface-secondary to-[#0b1326] border border-sky-500/40 shadow-xl shadow-sky-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-sky-400 mb-1">
              <span className="text-[9px] font-black uppercase">Más Oportunidades</span>
              <Users className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.maxLeads?.valor}>
              {podioLideres.maxLeads?.valor}
            </span>
            <span className="text-lg font-black text-sky-400 mt-1 font-mono">
              {podioLideres.maxLeadsSharePct}% <span className="text-[10px] text-slate-400 font-normal">({podioLideres.maxLeads?.metricas?.total_oportunidades})</span>
            </span>
          </div>

          {/* 4. Despliegue Más Rápido */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-950/40 via-surface-secondary to-[#0b1326] border border-purple-500/40 shadow-xl shadow-purple-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-purple-400 mb-1">
              <span className="text-[9px] font-black uppercase">Más Rápido (SLA)</span>
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.fastest?.valor || 'N/A'}>
              {podioLideres.fastest?.valor || 'N/A'}
            </span>
            <span className="text-lg font-black text-purple-400 mt-1 font-mono">
              {podioLideres.fastest?.metricas?.horas_promedio_inst || 0} h
            </span>
          </div>

          {/* 5. Más Pérdidas */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-rose-950/40 via-surface-secondary to-[#0b1326] border border-rose-500/40 shadow-xl shadow-rose-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-400 mb-1">
              <span className="text-[9px] font-black uppercase">Más Pérdidas</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.maxLost?.valor}>
              {podioLideres.maxLost?.valor}
            </span>
            <span className="text-lg font-black text-rose-400 mt-1 font-mono">
              {podioLideres.maxLost?.metricas?.pct_perdida}% <span className="text-[10px] text-slate-400 font-normal">({podioLideres.maxLost?.metricas?.perdidos})</span>
            </span>
          </div>

          {/* 6. Mayor Devueltos E8 */}
          <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-950/40 via-surface-secondary to-[#0b1326] border border-amber-500/40 shadow-xl shadow-amber-950/30 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-400 mb-1">
              <span className="text-[9px] font-black uppercase">Más Devueltos E8</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-white truncate" title={podioLideres.maxE8?.valor}>
              {podioLideres.maxE8?.valor}
            </span>
            <span className="text-lg font-black text-amber-400 mt-1 font-mono">
              {podioLideres.maxE8?.metricas?.pct_devueltos_e8}% <span className="text-[10px] text-slate-400 font-normal">({podioLideres.maxE8?.metricas?.count_devueltos_e8})</span>
            </span>
          </div>
        </div>
      )}

      {/* ==========================================
          FILA 4: LÍNEAS DE TIEMPO DE DISTRIBUCIÓN
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <EquidistantTimeline
          title={`Distribución Tiempo Instalación (${selectedDimension.toUpperCase()})`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          theme="green"
          min={totalsPeriodo.inst.min}
          p25={totalsPeriodo.inst.p25}
          mediana={totalsPeriodo.inst.med}
          promedio={totalsPeriodo.inst.avg}
          p75={totalsPeriodo.inst.p75}
          max={totalsPeriodo.inst.max}
          std={totalsPeriodo.inst.std}
          pctExcedeProm={totalsPeriodo.inst.exProm}
          pctExcedeMed={totalsPeriodo.inst.exMed}
        />

        <EquidistantTimeline
          title={`Distribución Tiempo Pérdida (${selectedDimension.toUpperCase()})`}
          icon={<XCircle className="w-5 h-5" />}
          theme="red"
          min={totalsPeriodo.perd.min}
          p25={totalsPeriodo.perd.p25}
          mediana={totalsPeriodo.perd.med}
          promedio={totalsPeriodo.perd.avg}
          p75={totalsPeriodo.perd.p75}
          max={totalsPeriodo.perd.max}
          std={totalsPeriodo.perd.std}
          pctExcedeProm={totalsPeriodo.perd.exProm}
          pctExcedeMed={totalsPeriodo.perd.exMed}
        />
      </div>

      {/* ==========================================
          FILA 5: GRÁFICAS DE DONA (> 4.5%) CON NEONCONTAINER
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <NeonContainer
          theme="green"
          title={`Distribución % de Instalaciones por ${selectedDimension.toUpperCase()}`}
          subtitle="Pasa el cursor para ver el detalle de cada segmento (> 4.5%)"
          icon={<PieChart className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Doughnut
              data={donutInstalaciones}
              options={instDonutOptions}
              plugins={[centerTextPlugin, ChartDataLabels]}
            />
          </div>
        </NeonContainer>

        <NeonContainer
          theme="red"
          title={`Distribución % de Pérdidas por ${selectedDimension.toUpperCase()}`}
          subtitle="Pasa el cursor para ver el detalle de cada segmento (> 4.5%)"
          icon={<PieChart className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Doughnut
              data={donutPerdidas}
              options={perdDonutOptions}
              plugins={[centerTextPlugin, ChartDataLabels]}
            />
          </div>
        </NeonContainer>
      </div>

      {/* ==========================================
          FILA 6: GRÁFICAS DE BARRAS DE MOTIVOS CON NEONCONTAINER
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <NeonContainer
          theme="red"
          title="Top Motivos de Pérdida"
          subtitle="Frecuencia acumulada en el periodo"
          icon={<BarChart3 className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Bar
              data={barMotivosPerdida}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  datalabels: { display: false },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 9 }, maxRotation: 20 } },
                  y: { grid: { color: 'rgba(51, 65, 85, 0.25)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                },
              }}
            />
          </div>
        </NeonContainer>

        <NeonContainer
          theme="yellow"
          title="Top Motivos de Devolución (Etapa 8)"
          subtitle="Frecuencia acumulada en el periodo"
          icon={<BarChart3 className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Bar
              data={barMotivosE8}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  datalabels: { display: false },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 9 }, maxRotation: 20 } },
                  y: { grid: { color: 'rgba(51, 65, 85, 0.25)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                },
              }}
            />
          </div>
        </NeonContainer>
      </div>

      {/* ==========================================
          FILA 7: TABLA MAESTRA CON NEONCONTAINER
          ========================================== */}
      <NeonContainer
        theme="slate"
        title={`Tabla Maestra de ${selectedDimension.toUpperCase()} (${formatPeriodoLabel(selectedPeriod)})`}
        subtitle="Haz clic en cualquier cabecera para ordenar ascendentemente o descendentemente"
        icon={<TableIcon className="w-5 h-5" />}
        noPadding={true}
      >
        <div className="h-[450px]">
          <DataTable
            columns={tableColumns}
            data={flattenedTableData}
            searchable={true}
            searchPlaceholder={`Buscar en ${selectedDimension}...`}
          />
        </div>
      </NeonContainer>
    </AppLayout>
  );
}