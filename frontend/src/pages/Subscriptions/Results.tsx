import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Modal } from '@/components/UI/Modal';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { CompactMetric } from '@/components/UI';
import axios from 'axios';
import { 
  LayoutGrid, MapPin, Building2, Package, Star, 
  TrendingUp, TrendingDown, RefreshCw, Zap, Table as TableIcon, Info, Activity
} from 'lucide-react';
import { ToggleGroup } from '@/components/UI';

interface CierreResult {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  crecimiento: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  corte_impagado: number;
  porcentaje_suspensiones: number;
  total_inactivos: number;
  reactivaciones: number;
  react_6_churn: number;
  react_8_30days: number;
  react_4_paused: number;
  react_4_P: number;
  react_4_H: number;
  tasa_winback_pct: number;
  total_billing: number;
  arpu: number;
  react_val: number;
  tasa_aporte_react_pct: number;
  indice_reemplazo_react_pct: number;
  adiciones_netas: number;
  adiciones_brutas: number;
}

interface DimensionRow extends Omit<CierreResult, 'periodo_reporte' | 'nuevos_mes'> {
  valor: string;
  nuevos: number;
}

import { formatInteger as f0, formatTwoDecimals as f2 } from '@/components/UI/formatters';

// `CompactMetric` moved to shared UI components

export default function SubscriptionsResults({ periodos = [] }: { periodos: CierreResult[] }) {
  const [selectedRow, setSelectedRow] = useState<CierreResult | null>(null);
  const [details, setDetails] = useState<{ dimensions: Record<string, DimensionRow[]> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('zona');

  const dimLabels: any = {
    zona: { label: 'Zonas', icon: MapPin },
    sucursal: { label: 'Sucursales', icon: Building2 },
    municipio: { label: 'Municipios', icon: LayoutGrid },
    producto: { label: 'Productos', icon: Package },
    campanna: { label: 'Campañas', icon: Star },
  };

  useEffect(() => {
    if (selectedRow) {
      setLoading(true);
      axios.get(`/subscriptions/api/results/${selectedRow.periodo_reporte}/`)
        .then(res => { setDetails(res.data); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setDetails(null);
    }
  }, [selectedRow]);

  const mainColumns: Column<CierreResult>[] = [
    { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{r.periodo_reporte}</span>, sortKey: 'periodo_reporte' },
    { header: 'Inicio', accessor: (r) => f0(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
    { header: 'Final', accessor: (r) => f0(r.activos_final), align: 'right', sortKey: 'activos_final' },
    { header: 'Instalaciones', accessor: (r) => <span className="text-emerald-400 font-semibold">+{f0(r.nuevos_mes)}</span>, align: 'right', sortKey: 'nuevos_mes' },
    { header: 'Bajas', accessor: (r) => <span className="text-rose-400 font-semibold">-{f0(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
    { header: 'Churn Rate', accessor: (r) => <span className="text-rose-400 font-bold">{f2(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
    { header: 'Crecimiento', accessor: (r) => <span className="text-emerald-400 font-bold">{f2(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },
  ];

  const dimColumns: Column<DimensionRow>[] = [
    { 
      header: 'Etiqueta', 
      accessor: (r) => <span className="font-bold text-white sticky left-0 bg-[#0f1a36] z-10 pr-4 min-w-[160px] block">{r.valor}</span>,
      sortKey: 'valor' 
    },
    { header: 'Base Ini', accessor: (r) => f0(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
    { header: 'Base Fin', accessor: (r) => f0(r.activos_final), align: 'right', sortKey: 'activos_final' },
    { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{f0(r.nuevos)}</span>, align: 'right', sortKey: 'nuevos' },
    { header: 'Adic. Net', accessor: (r) => <span className="text-emerald-500">{f0(r.adiciones_netas)}</span>, align: 'right', sortKey: 'adiciones_netas' },
    { header: 'Adic. Bru', accessor: (r) => <span className="text-emerald-500">{f0(r.adiciones_brutas)}</span>, align: 'right', sortKey: 'adiciones_brutas' },
    { header: 'Crec %', accessor: (r) => <span className="text-emerald-400">{f2(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },
    { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{f0(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
    { header: 'C. Neto %', accessor: (r) => <span className="text-rose-400 font-bold">{f2(r.churn_neto_pct)}%</span>, align: 'right', sortKey: 'churn_neto_pct' },
    { header: 'C. Bruto %', accessor: (r) => <span className="text-rose-400">{f2(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
    { header: 'Corte Imp', accessor: (r) => f0(r.corte_impagado), align: 'right', sortKey: 'corte_impagado' },
    { header: 'Susp %', accessor: (r) => `${f2(r.porcentaje_suspensiones)}%`, align: 'right', sortKey: 'porcentaje_suspensiones' },
    { header: 'Inactivos', accessor: (r) => f0(r.total_inactivos), align: 'right', sortKey: 'total_inactivos' },
    { header: 'React Tot', accessor: (r) => f0(r.reactivaciones), align: 'right', sortKey: 'reactivaciones' },
    { header: 'React Val', accessor: (r) => f0(r.react_val), align: 'right', sortKey: 'react_val' },
    { header: 'W. Churn', accessor: (r) => f0(r.react_6_churn), align: 'right', sortKey: 'react_6_churn' },
    { header: 'W. 30d', accessor: (r) => f0(r.react_8_30days), align: 'right', sortKey: 'react_8_30days' },
    { header: 'W. Pausa', accessor: (r) => f0(r.react_4_paused), align: 'right', sortKey: 'react_4_paused' },
    { header: 'R. 4P', accessor: (r) => f0(r.react_4_P), align: 'right', sortKey: 'react_4_P' },
    { header: 'R. 4H', accessor: (r) => f0(r.react_4_H), align: 'right', sortKey: 'react_4_H' },
    { header: 'Winback %', accessor: (r) => <span className="text-blue-400">{f2(r.tasa_winback_pct)}%</span>, align: 'right', sortKey: 'tasa_winback_pct' },
    { header: 'Aporte R%', accessor: (r) => `${f2(r.tasa_aporte_react_pct)}%`, align: 'right', sortKey: 'tasa_aporte_react_pct' },
    { header: 'Reempl %', accessor: (r) => `${f2(r.indice_reemplazo_react_pct)}%`, align: 'right', sortKey: 'indice_reemplazo_react_pct' },
    { header: 'ARPU', accessor: (r) => <span className="text-amber-400">${f2(r.arpu)}</span>, align: 'right', sortKey: 'arpu' },
    { header: 'Billing', accessor: (r) => <span className="text-blue-400">${f2(r.total_billing)}</span>, align: 'right', sortKey: 'total_billing' },
  ];

  return (
    <AppLayout title="Subscriptions Results">
      <SubHeader activeTab="results" />

      <NeonContainer
        theme="slate"
        title="Historial de Cierres de Suscripciones"
        subtitle="Haz clic en cualquier periodo para ver el desglose dimensional"
        icon={<TableIcon className="w-5 h-5" />}
        noPadding={true}
      >
        <div className="h-[550px]">
          <DataTable columns={mainColumns} data={periodos} searchable onRowClick={setSelectedRow} />
        </div>
      </NeonContainer>

      {/* MODAL DETALLADO DE CIERRE */}
      <Modal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Detalle de Periodo: ${selectedRow?.periodo_reporte || ''}`}
        size="wide"
      >
        {selectedRow && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Crecimiento */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Crecimiento e Ingresos</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Base Inicio" value={f0(selectedRow.activos_inicio)} color="slate" />
                  <CompactMetric label="Base Cierre" value={f0(selectedRow.activos_final)} color="slate" />
                  <CompactMetric label="Nuevos Mes" value={f0(selectedRow.nuevos_mes)} color="green" />
                  <CompactMetric label="Crecimiento %" value={`${f2(selectedRow.crecimiento)}%`} color="green" />
                  <CompactMetric label="Adic. Netas" value={f0(selectedRow.adiciones_netas)} color="green" />
                  <CompactMetric label="Adic. Brutas" value={f0(selectedRow.adiciones_brutas)} color="green" />
                </div>
              </div>

              {/* Pérdida */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-rose-500/30 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 border-b border-slate-800 pb-2 mb-2">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Pérdida (Churn)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactMetric label="Bajas Totales" value={f0(selectedRow.bajas)} color="red" />
                  <CompactMetric label="Churn Neto %" value={`${f2(selectedRow.churn_neto_pct)}%`} color="red" />
                  <CompactMetric label="Churn Bruto %" value={`${f2(selectedRow.churn_bruto_pct)}%`} color="red" />
                  <CompactMetric label="Corte Impago" value={f0(selectedRow.corte_impagado)} color="red" />
                  <CompactMetric label="Suspensiones %" value={`${f2(selectedRow.porcentaje_suspensiones)}%`} color="red" />
                  <CompactMetric label="Total Inactivos" value={f0(selectedRow.total_inactivos)} color="slate" />
                </div>
              </div>

              {/* Recuperación */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-sky-500/30 space-y-2">
                <div className="flex items-center gap-2 text-sky-400 border-b border-slate-800 pb-2 mb-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Recuperación (Winback)</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="col-span-3 grid grid-cols-2 gap-1.5">
                    <CompactMetric label="React. Totales" value={f0(selectedRow.reactivaciones)} color="blue" />
                    <CompactMetric label="React. Ingreso" value={f0(selectedRow.react_val)} color="blue" />
                  </div>
                  <CompactMetric label="W. Churn" value={f0(selectedRow.react_6_churn)} color="blue" />
                  <CompactMetric label="W. 30d" value={f0(selectedRow.react_8_30days)} color="blue" />
                  <CompactMetric label="W. Pausa" value={f0(selectedRow.react_4_paused)} color="blue" />
                  <CompactMetric label="R. 4P" value={f0(selectedRow.react_4_P)} color="blue" />
                  <CompactMetric label="R. 4H" value={f0(selectedRow.react_4_H)} color="blue" />
                  <CompactMetric label="Winback %" value={`${f2(selectedRow.tasa_winback_pct)}%`} color="blue" />
                </div>
              </div>

              {/* Financiero */}
              <div className="p-4 rounded-3xl bg-[#0b1326] border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-2 mb-2">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Finanzas y Eficiencia</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <CompactMetric label="Aporte R. %" value={`${f2(selectedRow.tasa_aporte_react_pct)}%`} color="yellow" />
                    <CompactMetric label="Reemplazo %" value={`${f2(selectedRow.indice_reemplazo_react_pct)}%`} color="yellow" />
                  </div>
                  <CompactMetric label="ARPU Promedio" value={`$${f2(selectedRow.arpu)}`} color="yellow" />
                  <CompactMetric label="Facturación Total" value={`$${f2(selectedRow.total_billing)}`} color="green" />
                </div>
              </div>
            </div>

            {/* TABLA DIMENSIONAL DEL MODAL */}
            <div className="bg-[#0b1326] rounded-3xl border border-slate-800 p-4 shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand" />
                  <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-widest">Desglose Dimensional</h4>
                </div>
                <div className="flex gap-1 bg-surface-tertiary p-1 rounded-xl border border-slate-800">
                  <ToggleGroup
                    options={Object.entries(dimLabels).map(([k, v]: any) => ({ key: k, label: v.label, icon: v.icon }))}
                    activeKey={activeTab}
                    onChange={setActiveTab}
                  />
                </div>
              </div>

              <div className="h-[420px] rounded-2xl overflow-hidden border border-slate-800">
                <DataTable
                  columns={dimColumns}
                  data={details?.dimensions[activeTab] || []}
                  isLoading={loading}
                  searchable={true}
                  searchPlaceholder={`Buscar en ${dimLabels[activeTab].label}...`}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}