import { CheckCircle2, Clock, TrendingDown, TrendingUp, XCircle, Zap } from 'lucide-react';

import { CompactMetric, MetricGroup, StatTile } from '@/shared/ui';
import { formatInteger, formatOneDecimal } from '@/shared/utils/formatters';
import type { CrmCierre } from '../types';

interface CrmPeriodDetailProps {
  row: CrmCierre;
}

/** Body of the Results modal: the executive summary for one closed cohort. */
export function CrmPeriodDetail({ row }: CrmPeriodDetailProps) {
  const leakage = Number((Number(row.pct_perdida) + Number(row.pct_devueltos_e8)).toFixed(1));
  const totalClosed = Number(row.ganados) + Number(row.perdidos);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricGroup title="Conversión de Clientes" tone="green" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          <CompactMetric label="Oportunidades" value={formatInteger(row.total_oportunidades)} color="slate" />
          <CompactMetric label="Ganados" value={`+${formatInteger(row.ganados)}`} color="green" />
          <CompactMetric label="Tasa Instalación" value={`${row.pct_instalacion}%`} color="green" />
          <CompactMetric label="Pendientes" value={formatInteger(row.pendientes)} color="blue" />
          <CompactMetric label="Tasa Pendiente" value={`${row.pct_pendientes}%`} color="blue" />
          <CompactMetric label="Efectividad Global" value={`${row.pct_instalacion}%`} color="green" />
        </MetricGroup>

        <MetricGroup title="Pérdida y Devoluciones" tone="red" icon={<TrendingDown className="h-3.5 w-3.5" />}>
          <CompactMetric label="Perdidos" value={`-${formatInteger(row.perdidos)}`} color="red" />
          <CompactMetric label="Tasa Pérdida" value={`${row.pct_perdida}%`} color="red" />
          <CompactMetric label="Devueltos E8" value={formatInteger(row.count_devueltos_e8)} color="yellow" />
          <CompactMetric label="Tasa Devueltos" value={`${row.pct_devueltos_e8}%`} color="yellow" />
          <CompactMetric label="Fuga / Caída" value={`${leakage}%`} color="red" />
          <CompactMetric label="Cierres Totales" value={formatInteger(totalClosed)} color="slate" />
        </MetricGroup>

        <MetricGroup title="SLA Instalación (Horas)" tone="blue" icon={<Zap className="h-3.5 w-3.5" />}>
          <CompactMetric label="Promedio (μ)" value={`${formatOneDecimal(row.horas_promedio_inst)} h`} color="blue" />
          <CompactMetric label="Mediana (P50)" value={`${formatOneDecimal(row.horas_mediana_inst)} h`} color="yellow" />
          <CompactMetric label="P25" value={`${formatOneDecimal(row.horas_p25_inst)} h`} color="blue" />
          <CompactMetric label="P75" value={`${formatOneDecimal(row.horas_p75_inst)} h`} color="blue" />
          <CompactMetric label="Min / Max" value={`${formatInteger(row.horas_min_inst)} / ${formatInteger(row.horas_max_inst)}h`} color="slate" />
          <CompactMetric label="Desv. Std (σ)" value={`${formatOneDecimal(row.horas_std_inst)} h`} color="purple" />
        </MetricGroup>

        <MetricGroup title="SLA Pérdida (Horas)" tone="yellow" icon={<Clock className="h-3.5 w-3.5" />}>
          <CompactMetric label="Promedio (μ)" value={`${formatOneDecimal(row.horas_promedio_perd)} h`} color="red" />
          <CompactMetric label="Mediana (P50)" value={`${formatOneDecimal(row.horas_mediana_perd)} h`} color="yellow" />
          <CompactMetric label="P25" value={`${formatOneDecimal(row.horas_p25_perd)} h`} color="red" />
          <CompactMetric label="P75" value={`${formatOneDecimal(row.horas_p75_perd)} h`} color="red" />
          <CompactMetric label="Min / Max" value={`${formatInteger(row.horas_min_perd)} / ${formatInteger(row.horas_max_perd)}h`} color="slate" />
          <CompactMetric label="Desv. Std (σ)" value={`${formatOneDecimal(row.horas_std_perd)} h`} color="purple" />
        </MetricGroup>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-surface-primary p-5 shadow-inner">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Balance de Lead Time del Periodo
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs font-bold">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Excede Promedio Inst: {row.pct_excede_prom_inst}%
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <XCircle className="h-3.5 w-3.5" /> Excede Promedio Pérdida: {row.pct_excede_prom_perd}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatTile
            label="Tiempo Típico de Instalación (Mediana)"
            value={`${row.horas_mediana_inst} horas`}
            tone="green"
            mono
            variant="boxed"
            className="bg-surface-tertiary/30"
          />
          <StatTile
            label="Tiempo Típico a Pérdida (Mediana)"
            value={`${row.horas_mediana_perd} horas`}
            tone="red"
            mono
            variant="boxed"
            className="bg-surface-tertiary/30"
          />
        </div>
      </div>
    </div>
  );
}
