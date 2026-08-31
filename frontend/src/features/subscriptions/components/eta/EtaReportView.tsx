import {
  Activity, Building2, Database, Gauge, LayoutGrid, MapPin, Tv, Users, Wifi, Zap,
} from 'lucide-react';

import { EmptyState, LoadingState, MetricCard, SectionHeading, StatGroup } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel } from '@/shared/utils/formatters';
import { EtaSpeedTable } from './EtaSpeedTable';
import type { EtaMetrics, SubscriptionEtaReportResponse } from '../../types';

interface EtaReportViewProps {
  data: SubscriptionEtaReportResponse;
  loading: boolean;
  period: string;
  /** Rendered as the call to action on the unmapped-elements state. */
  configLink: React.ReactNode;
}

/** The seven regulatory cross-tabs required for the internet service report. */
function internetBreakdowns(metrics: EtaMetrics | undefined) {
  return {
    simple: [
      { id: 'tecnologia', title: '1. Por Tecnología', icon: <Activity className="h-4 w-4" />, stats: metrics?.por_tecnologia },
      { id: 'persona', title: '2. Por Tipo Persona', icon: <Users className="h-4 w-4" />, stats: metrics?.por_persona },
      { id: 'estado', title: '3. Por Estado', icon: <MapPin className="h-4 w-4" />, stats: metrics?.por_estado },
      { id: 'tec-persona', title: '4. Tecnología | Persona', icon: <Zap className="h-4 w-4" />, stats: metrics?.por_tecnologia_persona },
    ],
    complex: [
      { id: 'estado-tec', title: '5. Estado | Tecnología', icon: <LayoutGrid className="h-4 w-4" />, stats: metrics?.por_estado_tecnologia },
      { id: 'estado-persona', title: '6. Estado | Persona', icon: <Building2 className="h-4 w-4" />, stats: metrics?.por_estado_persona },
      { id: 'matriz', title: '7. Matriz: Estado | Tec | Persona', icon: <Database className="h-4 w-4" />, stats: metrics?.por_estado_tecnologia_persona },
    ],
  };
}

export function EtaReportView({ data, loading, period, configLink }: EtaReportViewProps) {
  if (loading) {
    return <LoadingState message="Calculando matrices regulatorias..." />;
  }

  if (data.status === 'unmapped_elements') {
    const pending = (data.unmapped_plans?.length ?? 0) + (data.unmapped_subs?.length ?? 0);
    return (
      <EmptyState
        title="Clasificación Requerida"
        description={`Se han detectado ${pending} servicios nuevos o corporativos sin categoría regulatoria para ${formatPeriodoLabel(period)}.`}
        icon={<Database />}
        tone="warning"
        size="lg"
        bordered
        action={configLink}
        className="mx-auto max-w-4xl"
      />
    );
  }

  if (data.status !== 'success') {
    return (
      <EmptyState
        title="Información no disponible"
        description={`No se encontró un cierre de activos para ${formatPeriodoLabel(period)}. Asegúrate de haber ejecutado el análisis mensual.`}
        icon={<Database />}
        size="lg"
        bordered
      />
    );
  }

  const internet = internetBreakdowns(data.net_metrics);

  return (
    <div className="space-y-10 pb-20">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Muestra Internet" value={formatInteger(data.net_metrics?.total)} color="blue" subValue="Conexiones fijas" icon={<Wifi className="h-4 w-4 text-sky-400" />} />
        <MetricCard label="Transporte de Datos" value={formatInteger(data.transporte_metrics)} color="yellow" subValue="Circuitos L2 / P2P" icon={<Activity className="h-4 w-4 text-amber-400" />} />
        <MetricCard label="Muestra TV" value={formatInteger(data.tv_metrics?.total)} color="green" subValue="Suscripciones" icon={<Tv className="h-4 w-4 text-emerald-400" />} />
        <MetricCard label="Universo Total" value={formatInteger(data.total_muestreado)} color="slate" subValue="Cierre auditado" icon={<Database className="h-4 w-4 text-slate-300" />} />
        <MetricCard label="Especializados" value={formatInteger(data.individual_configs?.length)} color="purple" subValue="Maestro guardado" icon={<Zap className="h-4 w-4 text-purple-400" />} />
      </div>

      <section className="space-y-6">
        <SectionHeading
          title="Servicio de Internet"
          subtitle="Cruces de variables para reporte nacional"
          icon={<Wifi />}
          accent="blue"
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {internet.simple.map((group) => (
            <StatGroup key={group.id} title={group.title} icon={group.icon} stats={group.stats} theme="blue" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {internet.complex.map((group) => (
            <StatGroup key={group.id} title={group.title} icon={group.icon} stats={group.stats} theme="cyan" />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="space-y-6">
          <SectionHeading title="Servicio de TV" icon={<Tv />} accent="green" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <StatGroup title="1. Por Estado" icon={<MapPin className="h-4 w-4" />} stats={data.tv_metrics?.por_estado} theme="green" />
            <StatGroup title="2. Por Tipo Persona" icon={<Users className="h-4 w-4" />} stats={data.tv_metrics?.por_persona} theme="green" />
          </div>
          <StatGroup title="3. Estado | Persona" icon={<LayoutGrid className="h-4 w-4" />} stats={data.tv_metrics?.por_estado_persona} theme="green" />
        </section>

        <section className="space-y-6">
          <SectionHeading title="Penetración Velocidades" icon={<Gauge />} accent="yellow" />
          <EtaSpeedTable speedMetrics={(data.speed_metrics ?? {}) as Record<string, Record<string, number>>} />
        </section>
      </div>
    </div>
  );
}
