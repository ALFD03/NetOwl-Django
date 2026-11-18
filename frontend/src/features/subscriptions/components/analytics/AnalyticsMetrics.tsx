/** Las tarjetas de KPI del periodo, agrupadas por familia. */

import { formatTwoDecimals } from '@/shared/utils/formatters/number';
import type { ReactNode } from 'react';
import { DollarSign, Gift, RefreshCw, TrendingDown, TrendingUp, Target, UserPlus, Landmark, Scale } from 'lucide-react';
import { MetricCard } from '@/shared/ui';
import type { Period } from '@/shared/types/domain';
import { useTargets } from '../../hooks/useTargets';
import {
  periodCompliance, formatTarget, churnTone, growthTone, complianceTone,
} from '../../lib/targets';

interface Props {
  data: Period;
  /**
   * El periodo elegido. Va aparte de `data` porque con un día seleccionado
   * `data` es el bloque global de ese corte, que no trae `periodo_reporte`; el
   * objetivo es el del mes igualmente.
   */
  period: string;
}

export function AnalyticsMetrics({ data, period }: Props) {
  const targets = useTargets();
  const target = targets.general(period);
  const { thresholds } = targets;
  const {
    inflowsGoal, salesGoal, closeGoal, revenueCompliance: inflowsCompliance, salesCompliance, closeCompliance,
  } = periodCompliance(data, target);

  const inflowsTone = complianceTone(inflowsCompliance, thresholds);
  const salesTone = complianceTone(salesCompliance, thresholds);
  const closeTone = complianceTone(closeCompliance, thresholds);
  const base = `Meta basada en el ${formatTarget(target.growth)}`;

  return (
    <div className="space-y-8 mb-10">
      <MetricGroup title="Grupo Pérdida" icon={<TrendingDown className="w-4 h-4" />} tone="text-rose-400" columns='md:grid-cols-2 lg:grid-cols-5'>
        <MetricCard label="Churn Neto" value={`${(data.net_churn_pct || 0).toFixed(2)} %`} color={churnTone(data.net_churn_pct || 0, thresholds)} />
        <MetricCard
          label="Churn Bruto"
          value={`${(data.gross_churn_pct || 0).toFixed(2)} %`}
          subValue={`Objetivo ${formatTarget(target.churn)}`}
          color={churnTone(data.gross_churn_pct || 0, thresholds)}
        />
        <MetricCard label="Bajas" value={`${(data.churned || 0)}`} color="red" />
        <MetricCard label="Corte Impago" value={data.unpaid_cuts || 0} color="yellow" />
        <MetricCard label="% Suspensiones" value={`${(data.suspension_pct || 0).toFixed(2)} %`} color="yellow" />
      </MetricGroup>

      <MetricGroup title="Grupo Ingresos" icon={<TrendingUp className="w-4 h-4" />} tone="text-emerald-400">
        <MetricCard label="Nuevos" value={data.new_in_month || 0} color="green" />
        <MetricCard label="Adiciones Netas" value={data.net_adds || 0} color="blue" />
        <MetricCard label="Adiciones Brutas" value={data.gross_adds || 0} color="blue" />
        <MetricCard
          label="Crecimiento"
          value={`${(data.growth || 0).toFixed(2)} %`}
          subValue={`Objetivo ${formatTarget(target.growth)}`}
          color={growthTone(data.growth || 0, thresholds)}
        />
      </MetricGroup>

      <MetricGroup title="Grupo de Objetivos" icon={<Target className="w-4 h-4" />} tone="text-amber-400" columns='md:grid-cols-3'>
        <MetricCard label="Meta Ingresos" subValue={base} icon={<UserPlus className="w-4 h-4" color={inflowsTone} />} value={inflowsGoal.toFixed(0)} color={inflowsTone} />
        <MetricCard label="Meta Ventas" subValue={base} icon={<Landmark className="w-4 h-4" color={salesTone} />} value={salesGoal.toFixed(0)} color={salesTone} />
        <MetricCard label="Meta Cierre" subValue={base} icon={<Scale className="w-4 h-4" color={closeTone} />} value={closeGoal.toFixed(0)} color={closeTone} />
        <MetricCard label="Cumplimiento Ingresos" subValue={base} icon={<UserPlus className="w-4 h-4" color={inflowsTone} />} value={`${inflowsCompliance.toFixed(2)} %`} color={inflowsTone} />
        <MetricCard label="Cumplimiento Ventas" subValue={base} icon={<Landmark className="w-4 h-4" color={salesTone} />} value={`${salesCompliance.toFixed(2)} %`} color={salesTone} />
        <MetricCard label="Cumplimiento Cierre" subValue={base} icon={<Scale className="w-4 h-4" color={closeTone} />} value={`${closeCompliance.toFixed(2)} %`} color={closeTone} />
      </MetricGroup>

      <MetricGroup title="Grupo Retención" icon={<RefreshCw className="w-4 h-4" />} tone="text-blue-400" columns='md:grid-cols-2 lg:grid-cols-3'>
        <MetricCard label="Reactivaciones" value={data.reactivations || 0} color="blue" />
        <MetricCard label="Recuperaciones" value={data.react_4_P || 0} color="green" />
        <MetricCard label="React. Ingreso" value={data.react_val || 0} color="blue" subValue="Peso en crecimiento" />
        <MetricCard label="Tasa de recuperación" value={`${(data.winback_rate_pct || 0).toFixed(2)} %`} color="green" />
        <MetricCard label="Indice Reemplazo" value={`${(data.react_replacement_pct || 0).toFixed(2)} %`} color="yellow" />
        <MetricCard
          label="Clientes Gratuitos"
          value={data.free_clients || 0}
          color="purple"
          subValue={`${data.free_new || 0} archivados en el periodo`}
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
