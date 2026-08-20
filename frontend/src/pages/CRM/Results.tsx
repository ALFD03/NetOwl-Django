import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Modal } from '@/components/UI/Modal';
import { formatPeriodoLabel } from '@/utils/formatters';
import { 
  Table as TableIcon, CheckCircle2, XCircle, Clock, 
  AlertTriangle, Users, Zap, TrendingUp, TrendingDown, Activity
} from 'lucide-react';

interface CrmCierre {
  periodo_reporte: string;
  total_oportunidades: number;
  ganados: number;
  perdidos: number;
  pendientes: number;
  pct_instalacion: number;
  pct_perdida: number;
  pct_pendientes: number;
  count_devueltos_e8: number;
  pct_devueltos_e8: number;
  horas_promedio_inst: number;
  horas_mediana_inst: number;
  horas_p25_inst: number;
  horas_p75_inst: number;
  horas_min_inst: number;
  horas_max_inst: number;
  horas_std_inst: number;
  pct_excede_prom_inst: number;
  pct_excede_med_inst: number;
  horas_promedio_perd: number;
  horas_mediana_perd: number;
  horas_p25_perd: number;
  horas_p75_perd: number;
  horas_min_perd: number;
  horas_max_perd: number;
  horas_std_perd: number;
  pct_excede_prom_perd: number;
  pct_excede_med_perd: number;
}

interface Props {
  historico: CrmCierre[];
}

const f0 = (val: any) => Math.floor(Number(val || 0)).toLocaleString('en-US');
const f1 = (val: any) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const CompactMetric = ({ label, value, color = 'blue' }: any) => {
  const colors: any = {
    blue: 'text-sky-400 bg-sky-950/40 border-sky-500/30',
    green: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
    red: 'text-rose-400 bg-rose-950/40 border-rose-500/30',
    yellow: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
    purple: 'text-purple-400 bg-purple-950/40 border-purple-500/30',
    slate: 'text-slate-300 bg-slate-900/60 border-slate-700/50',
  };
  return (
    <div className={`p-2.5 rounded-2xl border ${colors[color]} flex flex-col justify-between`}>
      <p className="text-[9px] uppercase font-black opacity-80 mb-1 leading-none">{label}</p>
      <p className="text-sm font-black tracking-tight leading-none font-mono">{value}</p>
    </div>
  );
};

export default function CrmResults({ historico = [] }: Props) {
  const [selectedRow, setSelectedRow] = useState<CrmCierre | null>(null);

  const columns: Column<CrmCierre>[] = [
    { 
      header: 'Periodo', 
      accessor: (r) => <span className="font-bold text-white sticky left-0 bg-[#0f1a36] z-10 pr-4 min-w-[120px] block">{formatPeriodoLabel(r.periodo_reporte)}</span>,
      sortKey: 'periodo_reporte' 
    },
    { header: 'Oportunidades', accessor: (r) => f0(r.total_oportunidades), align: 'right', sortKey: 'total_oportunidades' },
    { header: 'Ganados', accessor: (r) => <span className="text-emerald-400 font-semibold">+{f0(r.ganados)}</span>, align: 'right', sortKey: 'ganados' },
    { header: '% Instalación', accessor: (r) => <span className="text-emerald-400 font-bold">{r.pct_instalacion}%</span>, align: 'right', sortKey: 'pct_instalacion' },
    { header: 'Perdidos', accessor: (r) => <span className="text-rose-400 font-semibold">-{f0(r.perdidos)}</span>, align: 'right', sortKey: 'perdidos' },
    { header: '% Pérdida', accessor: (r) => <span className="text-rose-400 font-bold">{r.pct_perdida}%</span>, align: 'right', sortKey: 'pct_perdida' },
    { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{f0(r.pendientes)}</span>, align: 'right', sortKey: 'pendientes' },
    { header: '% Pendientes', accessor: (r) => <span className="text-sky-400">{r.pct_pendientes}%</span>, align: 'right', sortKey: 'pct_pendientes' },
    { header: 'Devueltos E8', accessor: (r) => <span className="text-amber-400">{f0(r.count_devueltos_e8)}</span>, align: 'right', sortKey: 'count_devueltos_e8' },
    { header: '% Devueltos E8', accessor: (r) => <span className="text-amber-400 font-bold">{r.pct_devueltos_e8}%</span>, align: 'right', sortKey: 'pct_devueltos_e8' },
    { header: 'Lead Time Inst. (h)', accessor: (r) => `${r.horas_promedio_inst} h`, align: 'right', sortKey: 'horas_promedio_inst' },
    { header: 'Tiempo Pérdida (h)', accessor: (r) => `${r.horas_promedio_perd} h`, align: 'right', sortKey: 'horas_promedio_perd' },
  ];

  return (
    <AppLayout title="Historial de Cierres CRM">
      <CrmHeader activeTab="results" />

      {/* CONTENEDOR PRINCIPAL */}
      <NeonContainer
        theme="slate"
        title="Historial de Cierres y Cohortes Mensuales de CRM"
        subtitle="Haz clic en cualquier periodo para inspeccionar el resumen ejecutivo y los SLAs"
        icon={<TableIcon className="w-5 h-5" />}
        noPadding={true}
      >
        <div className="h-[550px]">
          <DataTable
            columns={columns}
            data={historico}
            searchable={true}
            searchPlaceholder="Buscar por periodo..."
            onRowClick={(row) => setSelectedRow(row)}
          />
        </div>
      </NeonContainer>

      {/* MODAL DETALLADO DEL CIERRE MENSUAL */}
      <Modal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Auditoría de Periodo: ${selectedRow ? formatPeriodoLabel(selectedRow.periodo_reporte) : ''}`}
        subtitle="Resumen de conversión, caídas y análisis de distribución de tiempos"
        theme="blue"
        icon={<Activity className="w-5 h-5 text-brand" />}
        size="wide"
      >
        {selectedRow && (
          <div className="space-y-6">
            
            {/* 4 BLOQUES ANALÍTICOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* 1. Conversión e Instalación */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Conversión de Clientes</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Oportunidades" value={f0(selectedRow.total_oportunidades)} color="slate" />
                  <CompactMetric label="Ganados" value={`+${f0(selectedRow.ganados)}`} color="green" />
                  <CompactMetric label="Tasa Instalación" value={`${selectedRow.pct_instalacion}%`} color="green" />
                  <CompactMetric label="Pendientes" value={f0(selectedRow.pendientes)} color="blue" />
                  <CompactMetric label="Tasa Pendiente" value={`${selectedRow.pct_pendientes}%`} color="blue" />
                  <CompactMetric label="Efectividad Global" value={`${selectedRow.pct_instalacion}%`} color="green" />
                </div>
              </div>

              {/* 2. Pérdidas y Etapa 8 */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-rose-500/30 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 border-b border-slate-800 pb-2 mb-2">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Pérdida y Devoluciones</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Perdidos" value={`-${f0(selectedRow.perdidos)}`} color="red" />
                  <CompactMetric label="Tasa Pérdida" value={`${selectedRow.pct_perdida}%`} color="red" />
                  <CompactMetric label="Devueltos E8" value={f0(selectedRow.count_devueltos_e8)} color="yellow" />
                  <CompactMetric label="Tasa Devueltos" value={`${selectedRow.pct_devueltos_e8}%`} color="yellow" />
                  <CompactMetric label="Fuga / Caída" value={`${Number((Number(selectedRow.pct_perdida) + Number(selectedRow.pct_devueltos_e8)).toFixed(1))}%`} color="red" />
                  <CompactMetric label="Cierres Totales" value={f0(Number(selectedRow.ganados) + Number(selectedRow.perdidos))} color="slate" />
                </div>
              </div>

              {/* 3. SLA de Instalación (Ganados) */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-sky-500/30 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 border-b border-slate-800 pb-2 mb-2">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">SLA Instalación (Horas)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Promedio (μ)" value={`${f1(selectedRow.horas_promedio_inst)} h`} color="blue" />
                  <CompactMetric label="Mediana (P50)" value={`${f1(selectedRow.horas_mediana_inst)} h`} color="yellow" />
                  <CompactMetric label="P25" value={`${f1(selectedRow.horas_p25_inst)} h`} color="blue" />
                  <CompactMetric label="P75" value={`${f1(selectedRow.horas_p75_inst)} h`} color="blue" />
                  <CompactMetric label="Min / Max" value={`${f0(selectedRow.horas_min_inst)} / ${f0(selectedRow.horas_max_inst)}h`} color="slate" />
                  <CompactMetric label="Desv. Std (σ)" value={`${f1(selectedRow.horas_std_inst)} h`} color="purple" />
                </div>
              </div>

              {/* 4. SLA de Pérdida (Perdidos) */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-2 mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">SLA Pérdida (Horas)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Promedio (μ)" value={`${f1(selectedRow.horas_promedio_perd)} h`} color="red" />
                  <CompactMetric label="Mediana (P50)" value={`${f1(selectedRow.horas_mediana_perd)} h`} color="yellow" />
                  <CompactMetric label="P25" value={`${f1(selectedRow.horas_p25_perd)} h`} color="red" />
                  <CompactMetric label="P75" value={`${f1(selectedRow.horas_p75_perd)} h`} color="red" />
                  <CompactMetric label="Min / Max" value={`${f0(selectedRow.horas_min_perd)} / ${f0(selectedRow.horas_max_perd)}h`} color="slate" />
                  <CompactMetric label="Desv. Std (σ)" value={`${f1(selectedRow.horas_std_perd)} h`} color="purple" />
                </div>
              </div>

            </div>

            {/* PISTA COMPARATIVA DE TIEMPOS */}
            <div className="p-5 rounded-3xl bg-[#0b1326] border border-slate-800 shadow-inner">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-brand" />
                  <span className="text-xs font-black text-white uppercase tracking-wider">
                    Balance de Lead Time del Periodo
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold font-mono">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Excede Promedio Inst: {selectedRow.pct_excede_prom_inst}%
                  </span>
                  <span className="text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Excede Promedio Pérdida: {selectedRow.pct_excede_prom_perd}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-surface-tertiary/30 rounded-2xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-bold">Tiempo Típico de Instalación (Mediana):</span>
                  <span className="text-emerald-400 font-black text-sm font-mono">{selectedRow.horas_mediana_inst} horas</span>
                </div>
                <div className="p-3 bg-surface-tertiary/30 rounded-2xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-bold">Tiempo Típico a Pérdida (Mediana):</span>
                  <span className="text-rose-400 font-black text-sm font-mono">{selectedRow.horas_mediana_perd} horas</span>
                </div>
              </div>
            </div>

          </div>
        )}
      </Modal>

    </AppLayout>
  );
}