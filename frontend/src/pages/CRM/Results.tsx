import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';

interface Props {
  totals: any;
  tiempoInstalacion: any;
  tiempoPorEtapa: any;
  efectividad: any[];
}

export default function CrmResults({ totals = {}, tiempoInstalacion = {}, efectividad = [] }: Props) {
  return (
    <AppLayout title="CRM Results & Resumen General">
      <CrmHeader activeTab="results" />

      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl mb-6">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Resultados de Efectividad por Etapa</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Etapa del Proceso</th>
                <th className="p-3.5 text-right">Total Salidas</th>
                <th className="p-3.5 text-right">Exitosos</th>
                <th className="p-3.5 text-right">Fallidos</th>
                <th className="p-3.5 text-right">% Efectividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {efectividad.map((row: any) => (
                <tr key={row.etapa} className="hover:bg-surface-hover transition-colors">
                  <td className="p-3.5 font-bold text-white">{row.etapa}</td>
                  <td className="p-3.5 text-right">{row.total_salidas}</td>
                  <td className="p-3.5 text-right text-emerald-400 font-semibold">{row.exitosos}</td>
                  <td className="p-3.5 text-right text-rose-400 font-semibold">{row.fallidos}</td>
                  <td className="p-3.5 text-right text-brand font-bold">{row.efectividad_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}