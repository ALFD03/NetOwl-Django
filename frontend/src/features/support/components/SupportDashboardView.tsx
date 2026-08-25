import { MetricCard } from '@/shared/ui';
import type { SupportGlobalSummary } from '../types';

interface SupportDashboardViewProps {
  summary: SupportGlobalSummary;
}

export function SupportDashboardView({ summary }: SupportDashboardViewProps) {
  const {
    pct_resueltos = 0,
    tiempo_medio_cierre_horas = 0,
    tiempo_mediana_cierre_horas = 0,
    pct_cancelados = 0,
    pct_rezagados = 0,
    pct_excede_promedio_cierre = 0,
    pct_excede_mediana_cierre = 0,
  } = summary;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="% Resueltos" value={`${pct_resueltos}%`} color="green" subValue="Promedio mensual" />
        <MetricCard
          label="Tiempo Medio (MTTR)"
          value={`${tiempo_medio_cierre_horas} h`}
          color="blue"
          subValue={`Mediana: ${tiempo_mediana_cierre_horas} h`}
        />
        <MetricCard label="% Cancelados" value={`${pct_cancelados}%`} color="red" subValue="Sin resolución" />
        <MetricCard label="% Rezagados" value={`${pct_rezagados}%`} color="yellow" subValue="Fuera de periodo" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard
          label="Probabilidad Exceder Promedio"
          value={`${pct_excede_promedio_cierre}%`}
          color="blue"
          subValue="Tickets que tardan más que la media"
        />
        <MetricCard
          label="Probabilidad Exceder Mediana"
          value={`${pct_excede_mediana_cierre}%`}
          color="yellow"
          subValue="Tickets que tardan más que la mediana"
        />
      </div>
    </>
  );
}
