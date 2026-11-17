/** El detalle de un cierre: todas sus cifras, agrupadas. */

import { RefreshCw, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react';

import { CompactMetric, MetricGroup } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useObjetivos } from '../../hooks/useObjetivos';
import {
  cumplimientoDelPeriodo, formatObjetivo, tonoChurn, tonoCrecimiento, tonoCumplimiento,
} from '../../lib/objetivos';
import type { SubscriptionCierre } from '../../types';

interface SubscriptionPeriodDetailProps {
  row: SubscriptionCierre;
}

const int = formatInteger;
const pct = (value: number) => `${formatTwoDecimals(value)}%`;
const money = (value: number) => `$${formatTwoDecimals(value)}`;

/** The four-quadrant executive summary for one closed subscription period. */
export function SubscriptionPeriodDetail({ row }: SubscriptionPeriodDetailProps) {
  const objetivos = useObjetivos();
  const objetivo = objetivos.general(row.periodo_reporte);
  const { semaforo } = objetivos;
  const {
    metaIngresos, metaVentas, metaCierre, cumplimientoIngresos, cumplimientoVentas, cumplimientoCierre,
  } = cumplimientoDelPeriodo(row, objetivo);
  const tonoIngresos = tonoCumplimiento(cumplimientoIngresos, semaforo);
  const tonoVentas = tonoCumplimiento(cumplimientoVentas, semaforo);
  const tonoCierre = tonoCumplimiento(cumplimientoCierre, semaforo);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      <MetricGroup title="Crecimiento e Ingresos" tone="green" icon={<TrendingUp className="h-3.5 w-3.5" />}>
        <CompactMetric label="Base Inicio" value={int(row.activos_inicio)} color="slate" />
        <CompactMetric label="Base Cierre" value={int(row.activos_final)} color="slate" />
        <CompactMetric label="Nuevos Mes" value={int(row.nuevos_mes)} color="green" />
        <CompactMetric label="Crecimiento %" value={pct(row.crecimiento)} color={tonoCrecimiento(row.crecimiento, semaforo)} />
        <CompactMetric label="Adic. Netas" value={int(row.adiciones_netas)} color="green" />
        <CompactMetric label="Adic. Brutas" value={int(row.adiciones_brutas)} color="green" />
      </MetricGroup>

      <MetricGroup title="Pérdida (Churn)" tone="red" icon={<TrendingDown className="h-3.5 w-3.5" />}>
        <CompactMetric label="Bajas Totales" value={int(row.bajas)} color="red" />
        <CompactMetric label="Churn Neto %" value={pct(row.churn_neto_pct)} color={tonoChurn(row.churn_neto_pct, semaforo)} />
        <CompactMetric label="Churn Bruto %" value={pct(row.churn_bruto_pct)} color={tonoChurn(row.churn_bruto_pct, semaforo)} />
        <CompactMetric label="Corte Impago" value={int(row.corte_impagado)} color="red" />
        <CompactMetric label="Suspensiones %" value={pct(row.porcentaje_suspensiones)} color="red" />
        <CompactMetric label="Total Inactivos" value={int(row.total_inactivos)} color="slate" />
        <CompactMetric label="Gratuitos" value={int(row.clientes_gratuitos)} color="purple" />
      </MetricGroup>

      <MetricGroup
        title={`Objetivos (${formatObjetivo(objetivo.crecimiento)} / churn ${formatObjetivo(objetivo.churn)})`}
        tone="blue"
        icon={<Target className="h-3.5 w-3.5" />}
        columns={3}
      >
        <CompactMetric label="Meta de Ingresos" value={int(metaIngresos)} color={tonoIngresos} />
        <CompactMetric label="Meta de Ventas" value={int(metaVentas)} color={tonoVentas} />
        <CompactMetric label="Meta de Cierre" value={int(metaCierre)} color={tonoCierre} />

        <CompactMetric label="Cumplimiento de Ingresos" value={pct(cumplimientoIngresos)} color={tonoIngresos} />
        <CompactMetric label="Cumplimiento de Ventas" value={pct(cumplimientoVentas)} color={tonoVentas} />
        <CompactMetric label="Cumplimiento de Cierre" value={pct(cumplimientoCierre)} color={tonoCierre} />
      </MetricGroup>


      <MetricGroup title="Recuperación" tone="purple" icon={<RefreshCw className="h-3.5 w-3.5" />} columns={3}>
        <div className="col-span-3 grid grid-cols-2 gap-1.5">
          <CompactMetric label="React. Totales" value={int(row.reactivaciones)} color="purple" />
          <CompactMetric label="React. Ingreso" value={int(row.react_val)} color="purple" />
        </div>
        <CompactMetric label="Canceladas" value={int(row.react_6_churn)} color="purple" />
        <CompactMetric label="30 Dias" value={int(row.react_8_30days)} color="purple" />
        <CompactMetric label="En pausa" value={int(row.react_4_paused)} color="purple" />
        <CompactMetric label="Recupera" value={int(row.react_4_P)} color="purple" />
        <CompactMetric label="De otros Periodos" value={int(row.react_4_H)} color="purple" />
        <CompactMetric label="Tasa recup. %" value={pct(row.tasa_winback_pct)} color="purple" />
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
