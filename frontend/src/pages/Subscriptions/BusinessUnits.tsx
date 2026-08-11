import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { UserCheck } from 'lucide-react';

interface Props {
  buData: any;
}

export default function BusinessUnits({ buData = {} }: Props) {
  const groups = buData.data || [];

  return (
    <AppLayout title="Business Units (Por Coordinador)">
      <SubHeader activeTab="business_units" />

      <div className="space-y-6">
        {groups.map((group: any) => (
          <div
            key={group.coordinador}
            className="bg-surface-secondary border border-slate-800 border-l-4 border-l-emerald-500 rounded-xl p-5 shadow-xl"
          >
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">{group.coordinador}</h3>
              <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-semibold">
                {group.totals?.activos_final || 0} Activos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Zona / Sucursal</th>
                    <th className="p-3 text-right">Inicio</th>
                    <th className="p-3 text-right">Cierre</th>
                    <th className="p-3 text-right">Nuevos</th>
                    <th className="p-3 text-right">Bajas</th>
                    <th className="p-3 text-right">Churn Neto %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {group.nodes?.map((node: any, idx: number) => (
                    <tr key={idx} className="hover:bg-surface-hover transition-colors">
                      <td className="p-3 font-medium text-white">{node.zona_sucursal}</td>
                      <td className="p-3 text-right">{node.activos_inicio}</td>
                      <td className="p-3 text-right font-bold text-white">{node.activos_final}</td>
                      <td className="p-3 text-right text-emerald-400">+{node.nuevos}</td>
                      <td className="p-3 text-right text-rose-400">-{node.bajas}</td>
                      <td className="p-3 text-right font-semibold text-brand">{node.churn_neto_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}