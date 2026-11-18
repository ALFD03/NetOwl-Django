/** La franja de cifras de cabecera de un grupo de nodos. */

import type { Proyeccion } from '@/shared/lib/projection';
import { SummaryStrip, type SummaryStripItem } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useTargetsConfig } from '../../hooks/useTargets';
import { calcCommercial } from '../../lib/commercial';
import {
  formatTarget, tonoChurn, tonoCrecimiento, complianceTone, type Meta,
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
  meta: Meta;
  mono?: boolean;
  /** Instalaciones del grupo, de las que sale la proyección. */
  new_subs?: number;
  /** Los días laborables del corte; sin ellos no hay celda de proyección. */
  projection?: Proyeccion | null;
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
  activeAtStart: activosInicio,
  activeAtEnd: activosFinal,
  growth,
  churnRate,
  churned,
  meta,
  mono = false,
  new_subs: nuevos = 0,
  projection: proyeccion = null,
}: CommercialSummaryStripProps) {
  const { thresholds } = useTargetsConfig();
  const metrics = calcCommercial(activosInicio, activosFinal, meta, {
    new_subs: nuevos,
    projection: proyeccion,
  });

  const completionColor = complianceTone(metrics.complianceRate, thresholds);
  const salesColor = complianceTone(metrics.salesCompliance, thresholds);
  const growthColor = tonoCrecimiento(growth, thresholds);
  const churnColor = tonoChurn(churnRate, thresholds);

  const celdaProyeccion: SummaryStripItem[] = metrics.instalacionesProyectadas === null ? [] : [{
    id: 'proyeccion',
    label: 'Proyección Inst.',
    value: formatInteger(metrics.instalacionesProyectadas),
    caption: metrics.projectedSalesCompliance === null
      ? undefined
      : `${formatTwoDecimals(metrics.projectedSalesCompliance)}% del objetivo`,
    tone: metrics.projectedSalesCompliance === null
      ? 'white'
      : complianceTone(metrics.projectedSalesCompliance, thresholds),
  }];

  return (
    <SummaryStrip
      columns={celdaProyeccion.length ? 11 : 10}
      mono={mono}
      items={[
        { id: 'lead', label: leadLabel, value: leadValue, tone: 'brand' },
        { id: 'inicio', label: 'Base Inicio', value: formatInteger(activosInicio) },
        metrics.withoutTarget
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo', caption: 'Todas sus zonas están sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatTarget(meta.growthPct)})`,
            value: `+${formatInteger(metrics.target)}`,
            // Las zonas sin objetivo no entran en este resumen: se dice cuántas quedaron fuera.
            caption: meta.zonesWithoutTarget
              ? `${meta.zonesWithoutTarget} ${meta.zonesWithoutTarget === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'esperado', label: 'Cierre Esperado', value: formatInteger(metrics.expectedClose) },
        { id: 'bajas', label: 'Bajas', value: formatInteger(churned), tone: 'red' },
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(nuevos) },
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
          label: `Churn (obj. ${formatTarget(meta.churnPct)})`,
          value: `${formatTwoDecimals(churnRate)}%`,
          tone: churnColor,
        },
        ...celdaProyeccion,
      ]}
    />
  );
}

export interface SimpleSummaryProps {
  activeAtStart: number;
  activeAtEnd: number;
  new_subs: number;
  meta: Meta;
  /** Los días laborables del corte; sin ellos la proyección sale «—». */
  projection?: Proyeccion | null;
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
  activeAtStart: activosInicio, activeAtEnd: activosFinal, new_subs: nuevos, meta, projection: proyeccion = null, className,
}: SimpleSummaryProps) {
  const { thresholds } = useTargetsConfig();
  const m = calcCommercial(activosInicio, activosFinal, meta, { new_subs: nuevos, projection: proyeccion });
  const pct = (valor: number) => (m.withoutTarget ? '—' : `${formatTwoDecimals(valor)}%`);
  const tono = (valor: number) => (m.withoutTarget ? 'white' as const : complianceTone(valor, thresholds));

  return (
    <SummaryStrip
      columns={5}
      mono
      className={className}
      items={[
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(nuevos), tone: 'brand' },
        m.withoutTarget
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatTarget(meta.growthPct)})`,
            value: `+${formatInteger(m.target)}`,
            caption: meta.zonesWithoutTarget
              ? `${meta.zonesWithoutTarget} ${meta.zonesWithoutTarget === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'ingresos', label: '% Ingresos', value: pct(m.complianceRate), tone: tono(m.complianceRate) },
        { id: 'ventas', label: '% Ventas', value: pct(m.salesCompliance), tone: tono(m.salesCompliance) },
        {
          id: 'proyeccion',
          label: 'Proyección',
          value: m.instalacionesProyectadas === null ? '—' : formatInteger(m.instalacionesProyectadas),
          caption: m.projectedSalesCompliance === null
            ? (m.instalacionesProyectadas === null ? 'Sin corte del que proyectar' : undefined)
            : `${formatTwoDecimals(m.projectedSalesCompliance)}% del objetivo`,
          tone: m.projectedSalesCompliance === null ? 'white' : complianceTone(m.projectedSalesCompliance, thresholds),
        },
      ]}
    />
  );
}
