import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { router } from '@inertiajs/react';
import { formatPeriodoLabel } from '@/utils/formatters';
import { Filter, Calendar, Users, Building2, Megaphone } from 'lucide-react';

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

  return (
    <AppLayout title="CRM Analytics Dimensional">
      <CrmHeader activeTab="analytics" />

      {/* BARRA DE FILTROS */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        {/* Selector de Mes */}
        <div className="flex items-center gap-2 bg-[#0f1a36] border border-slate-700/50 rounded-xl px-4 py-2">
          <Calendar className="w-4 h-4 text-brand" />
          <span className="text-[10px] font-black uppercase text-slate-400">Periodo</span>
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

        {/* Selector de Dimensión */}
        <div className="flex gap-2 bg-[#0f1a36] p-1 rounded-xl border border-slate-800">
          {dimOptions.map((opt) => {
            const Icon = opt.icon;
            const isActive = selectedDimension === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => handleDimChange(opt.key)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-brand text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TABLA DIMENSIONAL */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Rendimiento por {selectedDimension.toUpperCase()} ({formatPeriodoLabel(selectedPeriod)})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Criterio / Valor</th>
                <th className="p-3.5 text-right">Oportunidades</th>
                <th className="p-3.5 text-right">Ganados</th>
                <th className="p-3.5 text-right">% Instalación</th>
                <th className="p-3.5 text-right">Perdidos</th>
                <th className="p-3.5 text-right">% Pérdida</th>
                <th className="p-3.5 text-right">Pendientes</th>
                <th className="p-3.5 text-right">Devueltos E8</th>
                <th className="p-3.5 text-right">Lead Time Inst.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dimensionsData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No hay datos calculados para este periodo y dimensión.
                  </td>
                </tr>
              ) : (
                dimensionsData.map((row: any, idx: number) => {
                  const m = row.metricas || {};
                  return (
                    <tr key={idx} className="hover:bg-surface-hover transition-colors">
                      <td className="p-3.5 font-bold text-white">{row.valor}</td>
                      <td className="p-3.5 text-right font-medium">{m.total_oportunidades || 0}</td>
                      <td className="p-3.5 text-right text-emerald-400 font-semibold">{m.ganados || 0}</td>
                      <td className="p-3.5 text-right text-emerald-400 font-bold">{m.pct_instalacion || 0}%</td>
                      <td className="p-3.5 text-right text-rose-400 font-semibold">{m.perdidos || 0}</td>
                      <td className="p-3.5 text-right text-rose-400 font-bold">{m.pct_perdida || 0}%</td>
                      <td className="p-3.5 text-right text-sky-400">{m.pendientes || 0}</td>
                      <td className="p-3.5 text-right text-amber-400">{m.count_devueltos_e8 || 0}</td>
                      <td className="p-3.5 text-right font-mono text-slate-300">{m.horas_promedio_inst || 0} h</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}