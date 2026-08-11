import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { Building2 } from 'lucide-react';

interface Props {
  reportData: any;
}

export default function SalesReport({ reportData = {} }: Props) {
  const sites = reportData.data || [];

  return (
    <AppLayout title="Reporte Regional de Ventas">
      <SubHeader activeTab="sales" />

      <div className="space-y-6">
        {sites.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-surface-secondary border border-slate-800 rounded-xl">
            No hay datos de ventas disponibles para el periodo seleccionado.
          </div>
        ) : (
          sites.map((siteGroup: any) => (
            <div
              key={siteGroup.site}
              className="bg-surface-secondary border border-slate-800 border-l-4 border-l-brand rounded-xl overflow-hidden shadow-xl p-5"
            >
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                <Building2 className="w-5 h-5 text-brand" />
                <h3 className="text-base font-bold text-white">{siteGroup.site}</h3>
                <span className="ml-auto text-xs bg-brand/20 text-brand px-2.5 py-1 rounded-full font-semibold">
                  {siteGroup.totals?.activos_final || 0} Activos
                </span>
              </div>

              {/* Tecnologías dentro del Site */}
              <div className="space-y-4">
                {siteGroup.technologies?.map((tech: any) => (
                  <div key={tech.technology} className="bg-surface-tertiary rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-300">
                      <span>Tecnología: {tech.technology}</span>
                      <span className="text-emerald-400">
                        Crecimiento: {tech.totals?.crecimiento || 0}%
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="text-slate-400 uppercase border-b border-slate-700">
                          <tr>
                            <th className="pb-2">Nodo / Zona</th>
                            <th className="pb-2 text-right">Inicio</th>
                            <th className="pb-2 text-right">Cierre</th>
                            <th className="pb-2 text-right">Nuevos</th>
                            <th className="pb-2 text-right">Bajas</th>
                            <th className="pb-2 text-right">Churn Neto %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {tech.nodes?.map((node: any, idx: number) => (
                            <tr key={idx} className="hover:bg-surface-hover/50">
                              <td className="py-2 font-medium text-white">{node.zona_sucursal}</td>
                              <td className="py-2 text-right">{node.activos_inicio}</td>
                              <td className="py-2 text-right font-bold text-white">{node.activos_final}</td>
                              <td className="py-2 text-right text-emerald-400">+{node.nuevos}</td>
                              <td className="py-2 text-right text-rose-400">-{node.bajas}</td>
                              <td className="py-2 text-right font-semibold text-brand">{node.churn_neto_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}