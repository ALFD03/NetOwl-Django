import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { Filter } from 'lucide-react';

interface Props {
  dimensionTotals: any[];
}

export default function CrmAnalytics({ dimensionTotals = [] }: Props) {
  const [selectedDim, setSelectedDim] = useState<string>('sucursal');

  const dimLabels: Record<string, string> = {
    sucursal: 'Sucursal',
    vendedor: 'Vendedor',
    equipo_ventas: 'Equipo de Ventas',
    campana: 'Campaña',
    municipio: 'Municipio',
  };

  const filteredData = dimensionTotals.filter((d) => d.dimension === selectedDim);

  return (
    <AppLayout title="CRM Analytics Dimensional">
      <CrmHeader activeTab="analytics" />

      {/* Filtro por Dimensión */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Filter className="w-4 h-4 text-brand" />
          <span>Dimensión de Análisis CRM:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(dimLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedDim(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedDim === key
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'bg-surface-tertiary text-slate-400 hover:text-white hover:bg-surface-hover border border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla Desglosada */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">
            Resultados por {dimLabels[selectedDim] || selectedDim}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Valor / Criterio</th>
                <th className="p-3.5 text-right">Total Clientes</th>
                <th className="p-3.5 text-right">Ganados</th>
                <th className="p-3.5 text-right">Perdidos</th>
                <th className="p-3.5 text-right">Devueltos (E8)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    No hay datos disponibles para esta dimensión.
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-surface-hover transition-colors">
                    <td className="p-3.5 font-bold text-white">{item.valor}</td>
                    <td className="p-3.5 text-right font-medium">{item.data?.total_clientes || 0}</td>
                    <td className="p-3.5 text-right text-emerald-400 font-semibold">{item.data?.ganados || 0}</td>
                    <td className="p-3.5 text-right text-rose-400 font-semibold">{item.data?.perdidos || 0}</td>
                    <td className="p-3.5 text-right text-amber-400 font-semibold">{item.data?.etapa_8_count || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}