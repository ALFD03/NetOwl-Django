/** La franja de cifras de cabecera de un grupo de nodos. */

import type { Projection } from '@/shared/lib/projection';
import { SummaryStrip, type SummaryStripItem } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useTargetsConfig } from '../../hooks/useTargets';
import { calcCommercial } from '../../lib/commercial';
import {
  formatTarget, churnTone, growthTone, complianceTone, type Goal,
} from '../../lib/targets';

export interface CommercialSummaryStripProps {
  /** First cell — the technology for Sales Report, the status for Business Units. */
  leadLabel: string;
  leadValue: string;
  activeAtStart: number;
  activeAtEnd: number;
  growth: number;
  churnRate: number;
  churned: number;
  /** Meta del grupo, resuelta por el hook del reporte desde su nivel. */
  goal: Goal;
  mono?: boolean;
  /** Instalaciones del grupo, de las que sale la proyección. */
  new_subs?: number;
  /** Los días laborables del corte; sin ellos no hay celda de proyección. */
  projection?: Projection | null;
}


/**
 * The headline figures that open every commercial report section: base,
 * objective, expected close, churns, installations, both completions (ingresos
 * and ventas), growth, churn and, with a day cut, the projection.
 *
 * Shared by `SalesReport` (per technology) and `BusinessUnits` (per coordinator).
 */
export function CommercialSummaryStrip({
  leadLabel,
  leadValue,
  activeAtStart: startActive,
  activeAtEnd: endActive,
  growth,
  churnRate,
  churned,
  goal,
  mono = false,
  new_subs: newSubs = 0,
  projection: projection = null,
}: CommercialSummaryStripProps) {
  const { thresholds } = useTargetsConfig();
  const metrics = calcCommercial(startActive, endActive, goal, {
    new_subs: newSubs,
    projection,
  });

  const completionColor = complianceTone(metrics.complianceRate, thresholds);
  const salesColor = complianceTone(metrics.salesCompliance, thresholds);
  const growthColor = growthTone(growth, thresholds);
  const churnColor = churnTone(churnRate, thresholds);

  const projectionCell: SummaryStripItem[] = metrics.projectedInstalls === null ? [] : [{
    id: 'proyeccion',
    label: 'Proyección Inst.',
    value: formatInteger(metrics.projectedInstalls),
    caption: metrics.projectedSalesCompliance === null
      ? undefined
      : `${formatTwoDecimals(metrics.projectedSalesCompliance)}% del objetivo`,
    tone: metrics.projectedSalesCompliance === null
      ? 'white'
      : complianceTone(metrics.projectedSalesCompliance, thresholds),
  }];

  return (
    <SummaryStrip
      columns={projectionCell.length ? 11 : 10}
      mono={mono}
      items={[
        { id: 'lead', label: leadLabel, value: leadValue, tone: 'brand' },
        { id: 'inicio', label: 'Base Inicio', value: formatInteger(startActive) },
        metrics.withoutTarget
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo', caption: 'Todas sus zonas están sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatTarget(goal.growthPct)})`,
            value: `+${formatInteger(metrics.target)}`,
            // Las zonas sin objetivo no entran en este resumen: se dice cuántas quedaron fuera.
            caption: goal.zonesWithoutTarget
              ? `${goal.zonesWithoutTarget} ${goal.zonesWithoutTarget === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'esperado', label: 'Cierre Esperado', value: formatInteger(metrics.expectedClose) },
        { id: 'bajas', label: 'Bajas', value: formatInteger(churned), tone: 'red' },
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(newSubs) },
        {
          // Cumplimiento de ingreso: el crecimiento neto contra la meta.
          id: 'cumplimiento',
          label: '% Ingresos',
          value: metrics.withoutTarget ? '—' : `${formatTwoDecimals(metrics.complianceRate)}%`,
          tone: metrics.withoutTarget ? 'white' : completionColor,
          divided: true,
        },
        {
          // Cumplimiento de ventas: las instalaciones contra la misma meta.
          id: 'cumplimiento_ventas',
          label: '% Ventas',
          value: metrics.withoutTarget ? '—' : `${formatTwoDecimals(metrics.salesCompliance)}%`,
          tone: metrics.withoutTarget ? 'white' : salesColor,
        },
        {
          id: 'crecimiento',
          label: 'Crecimiento',
          value: `${formatTwoDecimals(growth)}%`,
          tone: growthColor,
        },
        {
          id: 'churn',
          label: `Churn (obj. ${formatTarget(goal.churnPct)})`,
          value: `${formatTwoDecimals(churnRate)}%`,
          tone: churnColor,
        },
        ...projectionCell,
      ]}
    />
  );
}

export interface SimpleSummaryProps {
  activeAtStart: number;
  activeAtEnd: number;
  new_subs: number;
  goal: Goal;
  /** Los días laborables del corte; sin ellos la proyección sale «—». */
  projection?: Projection | null;
  className?: string;
}

/**
 * El resumen sencillo de un site entero, todas sus tecnologías juntas:
 * instalaciones, objetivo, los dos cumplimientos y la proyección. Las zonas sin
 * objetivo ya vienen fuera de las cifras (`measuredNodes`).
 *
 * Su «% Ventas» es el mismo número con que Comisiones paga a supervisores y
 * coordinadoras de oficina (`subscriptions/analytics/cumplimiento_sites.py`).
 */
export function SimpleSummary({
  activeAtStart: startActive, activeAtEnd: endActive, new_subs: newSubs, goal, projection: projection = null, className,
}: SimpleSummaryProps) {
  const { thresholds } = useTargetsConfig();
  const m = calcCommercial(startActive, endActive, goal, { new_subs: newSubs, projection });
  const pct = (value: number) => (m.withoutTarget ? '—' : `${formatTwoDecimals(value)}%`);
  const tone = (value: number) => (m.withoutTarget ? 'white' as const : complianceTone(value, thresholds));

  return (
    <SummaryStrip
      columns={5}
      mono
      className={className}
      items={[
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(newSubs), tone: 'brand' },
        m.withoutTarget
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatTarget(goal.growthPct)})`,
            value: `+${formatInteger(m.target)}`,
            caption: goal.zonesWithoutTarget
              ? `${goal.zonesWithoutTarget} ${goal.zonesWithoutTarget === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'ingresos', label: '% Ingresos', value: pct(m.complianceRate), tone: tone(m.complianceRate) },
        { id: 'ventas', label: '% Ventas', value: pct(m.salesCompliance), tone: tone(m.salesCompliance) },
        {
          id: 'proyeccion',
          label: 'Proyección',
          value: m.projectedInstalls === null ? '—' : formatInteger(m.projectedInstalls),
          caption: m.projectedSalesCompliance === null
            ? (m.projectedInstalls === null ? 'Sin corte del que proyectar' : undefined)
            : `${formatTwoDecimals(m.projectedSalesCompliance)}% del objetivo`,
          tone: m.projectedSalesCompliance === null ? 'white' : complianceTone(m.projectedSalesCompliance, thresholds),
        },
      ]}
    />
  );
}
