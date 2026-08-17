import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SupportHeader } from '@/components/Navigation/SupportHeader';
import { MetricCard } from '@/components/UI/MetricCard';

interface Props {
  metrics: any;
}

export default function SupportDashboard({ metrics = {} }: Props) {
  const globalRes = metrics.resumen_global || {};

  return (
    <AppLayout title="Technical Support Dashboard">
      <SupportHeader activeTab="dashboard" />

      {/* Tarjetas KPI de Soporte Técnico */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="% Resueltos"
          value={`${globalRes.pct_resueltos || 0}%`}
          color="green"
          subValue="Promedio mensual"
        />
        <MetricCard
          label="Tiempo Medio (MTTR)"
          value={`${globalRes.tiempo_medio_cierre_horas || 0} h`}
          color="blue"
          subValue={`Mediana: ${globalRes.tiempo_mediana_cierre_horas || 0} h`}
        />
        <MetricCard
          label="% Cancelados"
          value={`${globalRes.pct_cancelados || 0}%`}
          color="red"
          subValue="Sin resolución"
        />
        <MetricCard
          label="% Rezagados"
          value={`${globalRes.pct_rezagados || 0}%`}
          color="yellow"
          subValue="Fuera de periodo"
        />
      </div>

      {/* Probabilidades de Exceder Tiempos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase">Probabilidad Exceder Promedio</span>
          <p className="text-3xl font-extrabold text-blue-400 mt-2">
            {globalRes.pct_excede_promedio_cierre || 0}%
          </p>
          <p className="text-xs text-slate-500 mt-1">Tickets que tardan más que la media</p>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase">Probabilidad Exceder Mediana</span>
          <p className="text-3xl font-extrabold text-amber-400 mt-2">
            {globalRes.pct_excede_mediana_cierre || 0}%
          </p>
          <p className="text-xs text-slate-500 mt-1">Tickets que tardan más que la mediana</p>
        </div>
      </div>
    </AppLayout>
  );
}