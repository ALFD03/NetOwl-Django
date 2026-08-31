import { RefreshCw, TrendingDown, TrendingUp, Zap } from 'lucide-react';

import { CompactMetric, MetricGroup } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import type { SubscriptionCierre } from '../../types';

interface SubscriptionPeriodDetailProps {
  row: SubscriptionCierre;
}

const int = formatInteger;
const pct = (value: number) => `${formatTwoDecimals(value)}%`;
const money = (value: number) => `$${formatTwoDecimals(value)}`;

/** The four-quadrant executive summary for one closed subscription period. */
export function SubscriptionPeriodDetail({ row }: SubscriptionPeriodDetailProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricGroup title="Crecimiento e Ingresos" tone="green" icon={<TrendingUp className="h-3.5 w-3.5" />}>
        <CompactMetric label="Base Inicio" value={int(row.activos_inicio)} color="slate" />
        <CompactMetric label="Base Cierre" value={int(row.activos_final)} color="slate" />
        <CompactMetric label="Nuevos Mes" value={int(row.nuevos_mes)} color="green" />
        <CompactMetric label="Crecimiento %" value={pct(row.crecimiento)} color="green" />
        <CompactMetric label="Adic. Netas" value={int(row.adiciones_netas)} color="green" />
        <CompactMetric label="Adic. Brutas" value={int(row.adiciones_brutas)} color="green" />
      </MetricGroup>

      <MetricGroup title="Pérdida (Churn)" tone="red" icon={<TrendingDown className="h-3.5 w-3.5" />}>
        <CompactMetric label="Bajas Totales" value={int(row.bajas)} color="red" />
        <CompactMetric label="Churn Neto %" value={pct(row.churn_neto_pct)} color="red" />
        <CompactMetric label="Churn Bruto %" value={pct(row.churn_bruto_pct)} color="red" />
        <CompactMetric label="Corte Impago" value={int(row.corte_impagado)} color="red" />
        <CompactMetric label="Suspensiones %" value={pct(row.porcentaje_suspensiones)} color="red" />
        <CompactMetric label="Total Inactivos" value={int(row.total_inactivos)} color="slate" />
        <CompactMetric label="Gratuitos" value={int(row.clientes_gratuitos)} color="purple" />
      </MetricGroup>

      <MetricGroup title="Recuperación (Winback)" tone="blue" icon={<RefreshCw className="h-3.5 w-3.5" />} columns={3}>
        <div className="col-span-3 grid grid-cols-2 gap-1.5">
          <CompactMetric label="React. Totales" value={int(row.reactivaciones)} color="blue" />
          <CompactMetric label="React. Ingreso" value={int(row.react_val)} color="blue" />
        </div>
        <CompactMetric label="W. Churn" value={int(row.react_6_churn)} color="blue" />
        <CompactMetric label="W. 30d" value={int(row.react_8_30days)} color="blue" />
        <CompactMetric label="W. Pausa" value={int(row.react_4_paused)} color="blue" />
        <CompactMetric label="R. 4P" value={int(row.react_4_P)} color="blue" />
        <CompactMetric label="R. 4H" value={int(row.react_4_H)} color="blue" />
        <CompactMetric label="Winback %" value={pct(row.tasa_winback_pct)} color="blue" />
      </MetricGroup>

      <MetricGroup title="Finanzas y Eficiencia" tone="yellow" icon={<Zap className="h-3.5 w-3.5" />} columns={1}>
        <div className="grid grid-cols-2 gap-2">
          <CompactMetric label="Aporte R. %" value={pct(row.tasa_aporte_react_pct)} color="yellow" />
          <CompactMetric label="Reemplazo %" value={pct(row.indice_reemplazo_react_pct)} color="yellow" />
        </div>
        <CompactMetric label="ARPU Promedio" value={money(row.arpu)} color="yellow" />
        <CompactMetric label="Facturación Total" value={money(row.total_billing)} color="green" />
      </MetricGroup>
    </div>
  );
}
