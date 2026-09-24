/** Las tarjetas de KPI del periodo, agrupadas por familia. */

import { formatTwoDecimals } from '@/shared/utils/formatters/number';
import type { ReactNode } from 'react';
import { DollarSign, Gift, RefreshCw, TrendingDown, TrendingUp, Target, UserPlus, Landmark, Scale } from 'lucide-react';
import { MetricCard } from '@/shared/ui';
import type { Periodo } from '@/shared/types/domain';
import { useObjetivos } from '../../hooks/useObjetivos';
import {
  cumplimientoDelPeriodo, formatObjetivo, tonoChurn, tonoCrecimiento, tonoCumplimiento,
} from '../../lib/objetivos';

interface Props {
  data: Periodo;
  /**
   * El periodo elegido. Va aparte de `data` porque con un día seleccionado
   * `data` es el bloque global de ese corte, que no trae `periodo_reporte`; el
   * objetivo es el del mes igualmente.
   */
  periodo: string;
}

export function AnalyticsMetrics({ data, periodo }: Props) {
  const objetivos = useObjetivos();
  const objetivo = objetivos.general(periodo);
  const { semaforo } = objetivos;
  const {
    metaIngresos, metaVentas, metaCierre, cumplimientoIngresos, cumplimientoVentas, cumplimientoCierre,
  } = cumplimientoDelPeriodo(data, objetivo);

  const tonoIngresos = tonoCumplimiento(cumplimientoIngresos, semaforo);
  const tonoVentas = tonoCumplimiento(cumplimientoVentas, semaforo);
  const tonoCierre = tonoCumplimiento(cumplimientoCierre, semaforo);
  const base = `Meta basada en el ${formatObjetivo(objetivo.crecimiento)}`;

  return (
    <div className="space-y-8 mb-10">
      <MetricGroup title="Grupo Pérdida" icon={<TrendingDown className="w-4 h-4" />} tone="text-rose-400" columns='md:grid-cols-2 lg:grid-cols-5'>
        <MetricCard label="Churn Neto" value={`${(data.churn_neto_pct || 0).toFixed(2)} %`} color={tonoChurn(data.churn_neto_pct || 0, semaforo)} />
        <MetricCard
          label="Churn Bruto"
          value={`${(data.churn_bruto_pct || 0).toFixed(2)} %`}
          subValue={`Objetivo ${formatObjetivo(objetivo.churn)}`}
          color={tonoChurn(data.churn_bruto_pct || 0, semaforo)}
        />
        <MetricCard label="Bajas" value={`${(data.bajas || 0)}`} color="red" />
        <MetricCard label="Corte Impago" value={data.corte_impagado || 0} color="yellow" />
        <MetricCard label="% Suspensiones" value={`${(data.porcentaje_suspensiones || 0).toFixed(2)} %`} color="yellow" />
      </MetricGroup>

      <MetricGroup title="Grupo Ingresos" icon={<TrendingUp className="w-4 h-4" />} tone="text-emerald-400">
        <MetricCard label="Nuevos" value={data.nuevos_mes || 0} color="green" />
        <MetricCard label="Adiciones Netas" value={data.adiciones_netas || 0} color="blue" />
        <MetricCard label="Adiciones Brutas" value={data.adiciones_brutas || 0} color="blue" />
        <MetricCard
          label="Crecimiento"
          value={`${(data.crecimiento || 0).toFixed(2)} %`}
          subValue={`Objetivo ${formatObjetivo(objetivo.crecimiento)}`}
          color={tonoCrecimiento(data.crecimiento || 0, semaforo)}
        />
      </MetricGroup>

      <MetricGroup title="Grupo de Objetivos" icon={<Target className="w-4 h-4" />} tone="text-amber-400" columns='md:grid-cols-3'>
        <MetricCard label="Meta Ingresos" subValue={base} icon={<UserPlus className="w-4 h-4" color={tonoIngresos} />} value={metaIngresos.toFixed(0)} color={tonoIngresos} />
        <MetricCard label="Meta Ventas" subValue={base} icon={<Landmark className="w-4 h-4" color={tonoVentas} />} value={metaVentas.toFixed(0)} color={tonoVentas} />
        <MetricCard label="Meta Cierre" subValue={base} icon={<Scale className="w-4 h-4" color={tonoCierre} />} value={metaCierre.toFixed(0)} color={tonoCierre} />
        <MetricCard label="Cumplimiento Ingresos" subValue={base} icon={<UserPlus className="w-4 h-4" color={tonoIngresos} />} value={`${cumplimientoIngresos.toFixed(2)} %`} color={tonoIngresos} />
        <MetricCard label="Cumplimiento Ventas" subValue={base} icon={<Landmark className="w-4 h-4" color={tonoVentas} />} value={`${cumplimientoVentas.toFixed(2)} %`} color={tonoVentas} />
        <MetricCard label="Cumplimiento Cierre" subValue={base} icon={<Scale className="w-4 h-4" color={tonoCierre} />} value={`${cumplimientoCierre.toFixed(2)} %`} color={tonoCierre} />
      </MetricGroup>

      <MetricGroup title="Grupo Retención" icon={<RefreshCw className="w-4 h-4" />} tone="text-blue-400" columns='md:grid-cols-2 lg:grid-cols-3'>
        <MetricCard label="Reactivaciones" value={data.reactivaciones || 0} color="blue" />
        <MetricCard label="Recuperaciones" value={data.react_4_P || 0} color="green" />
        <MetricCard label="React. Ingreso" value={data.react_val || 0} color="blue" subValue="Peso en crecimiento" />
        <MetricCard label="Winback" value={`${(data.tasa_winback_pct || 0).toFixed(2)} %`} color="green" />
        <MetricCard label="Indice Reemplazo" value={`${(data.indice_reemplazo_react_pct || 0).toFixed(2)} %`} color="yellow" />
        <MetricCard
          label="Clientes Gratuitos"
          value={data.clientes_gratuitos || 0}
          color="purple"
          subValue={`${data.gratuitos_nuevos || 0} archivados en el periodo`}
          icon={<Gift className="w-4 h-4 text-purple-400" />}
        />
      </MetricGroup>

      <MetricGroup title="Grupo Financiero" icon={<DollarSign className="w-4 h-4" />} tone="text-amber-400" columns="md:grid-cols-2">
        <MetricCard label="ARPU" value={`$ ${data.arpu || 0}`} color="yellow" />
        <MetricCard label="Total Billing" value={`$ ${formatTwoDecimals(data.total_billing)}`} color="green" />
      </MetricGroup>
    </div>
  );
}

interface MetricGroupProps {
  title: string;
  icon: ReactNode;
  tone: string;
  columns?: string;
  children: ReactNode;
}

function MetricGroup({ title, icon, tone, columns = 'md:grid-cols-2 lg:grid-cols-4', children }: MetricGroupProps) {
  return (
    <div>
      <h3 className={`text-xs font-bold ${tone} uppercase tracking-widest mb-3 flex items-center gap-2`}>
        {icon} {title}
      </h3>
      <div className={`grid grid-cols-1 ${columns} gap-4`}>{children}</div>
    </div>
  );
}
