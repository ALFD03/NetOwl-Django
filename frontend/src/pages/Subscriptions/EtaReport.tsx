import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';

interface Props {
  etaData: any;
}

export default function EtaReport({ etaData = {} }: Props) {
  const netMetrics = etaData.net_metrics || {};
  const tvMetrics = etaData.tv_metrics || {};

  return (
    <AppLayout title="Reporte Regulatorio ETA">
      <SubHeader activeTab="eta" />

      {/* Tarjetas KPI Regulatorias */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Total Muestreado Internet"
          value={netMetrics.total || 0}
          color="blue"
          subValue="Conexiones de datos"
        />
        <MetricCard
          label="Total Suscriptores TV"
          value={tvMetrics.total || 0}
          color="green"
          subValue="Servicios de televisión"
        />
        <MetricCard
          label="Periodo Reportado"
          value={etaData.periodo || 'N/A'}
          color="yellow"
          subValue={etaData.esta_bloqueado ? 'Mes Bloqueado' : 'Mes Activo'}
        />
      </div>

      {/* Resumen por Tecnología */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4">Desglose por Tecnología (Internet)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {Object.entries(netMetrics.por_tecnologia || {}).map(([tech, count]) => (
            <div key={tech} className="p-4 bg-surface-tertiary rounded-lg flex items-center justify-between">
              <span className="font-semibold text-slate-300">{tech}</span>
              <span className="text-base font-bold text-brand">{String(count)}</span>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}