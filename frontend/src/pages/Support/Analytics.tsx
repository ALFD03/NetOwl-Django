import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SupportHeader } from '@/components/Navigation/SupportHeader';

interface Props {
  analyticsData: any;
  periods: string[];
}

export default function SupportAnalytics({ analyticsData = {} }: Props) {
  const grupos = analyticsData.grupos || {};

  return (
    <AppLayout title="Análisis Jerárquico de Soporte Técnico">
      <SupportHeader activeTab="analytics" />

      <div className="space-y-6">
        {Object.keys(grupos).length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-surface-secondary border border-slate-800 rounded-xl">
            No hay datos de análisis disponibles para el periodo.
          </div>
        ) : (
          Object.entries(grupos).map(([grupoName, grupoObj]: [string, any]) => (
            <div
              key={grupoName}
              className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">{grupoName}</h3>
                <span className="text-xs bg-brand/20 text-brand px-3 py-1 rounded-full font-semibold">
                  {grupoObj.total_tickets_grupo || 0} Tickets
                </span>
              </div>

              {/* Razones de Falla */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Razones de Falla Principales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grupoObj.razones_falla?.map((rf: any, idx: number) => (
                    <div key={idx} className="p-3 bg-surface-tertiary rounded-lg flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300 truncate">{rf.nombre}</span>
                      <span className="font-bold text-brand ml-2">{rf.metricas?.total_tickets || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}