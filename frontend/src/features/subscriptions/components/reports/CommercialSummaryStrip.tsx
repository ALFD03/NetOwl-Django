/** La franja de cifras de cabecera de un grupo de nodos. */

import type { Proyeccion } from '@/shared/lib/proyeccion';
import { SummaryStrip, type SummaryStripItem } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useObjetivosConfig } from '../../hooks/useObjetivos';
import { calcComercial } from '../../lib/commercial';
import {
  formatObjetivo, tonoChurn, tonoCrecimiento, tonoCumplimiento, type Meta,
} from '../../lib/objetivos';

export interface CommercialSummaryStripProps {
  /** First cell — the technology for Sales Report, the status for Business Units. */
  leadLabel: string;
  leadValue: string;
  activosInicio: number;
  activosFinal: number;
  crecimiento: number;
  churnRate: number;
  bajas: number;
  /** Meta del grupo, resuelta por el hook del reporte desde su nivel. */
  meta: Meta;
  mono?: boolean;
  /** Instalaciones del grupo, de las que sale la proyección. */
  nuevos?: number;
  /** Los días laborables del corte; sin ellos no hay celda de proyección. */
  proyeccion?: Proyeccion | null;
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
  activosInicio,
  activosFinal,
  crecimiento,
  churnRate,
  bajas,
  meta,
  mono = false,
  nuevos = 0,
  proyeccion = null,
}: CommercialSummaryStripProps) {
  const { semaforo } = useObjetivosConfig();
  const metrics = calcComercial(activosInicio, activosFinal, meta, {
    nuevos,
    proyeccion,
  });

  const completionColor = tonoCumplimiento(metrics.tasaCumplimiento, semaforo);
  const ventasColor = tonoCumplimiento(metrics.cumplimientoVentas, semaforo);
  const growthColor = tonoCrecimiento(crecimiento, semaforo);
  const churnColor = tonoChurn(churnRate, semaforo);

  const celdaProyeccion: SummaryStripItem[] = metrics.instalacionesProyectadas === null ? [] : [{
    id: 'proyeccion',
    label: 'Proyección Inst.',
    value: formatInteger(metrics.instalacionesProyectadas),
    caption: metrics.cumplimientoVentasProyectado === null
      ? undefined
      : `${formatTwoDecimals(metrics.cumplimientoVentasProyectado)}% del objetivo`,
    tone: metrics.cumplimientoVentasProyectado === null
      ? 'white'
      : tonoCumplimiento(metrics.cumplimientoVentasProyectado, semaforo),
  }];

  return (
    <SummaryStrip
      columns={celdaProyeccion.length ? 11 : 10}
      mono={mono}
      items={[
        { id: 'lead', label: leadLabel, value: leadValue, tone: 'brand' },
        { id: 'inicio', label: 'Base Inicio', value: formatInteger(activosInicio) },
        metrics.sinObjetivo
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo', caption: 'Todas sus zonas están sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatObjetivo(meta.crecimientoPct)})`,
            value: `+${formatInteger(metrics.objetivo)}`,
            // Las zonas sin objetivo no entran en este resumen: se dice cuántas quedaron fuera.
            caption: meta.zonasSinObjetivo
              ? `${meta.zonasSinObjetivo} ${meta.zonasSinObjetivo === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'esperado', label: 'Cierre Esperado', value: formatInteger(metrics.cierreEsperado) },
        { id: 'bajas', label: 'Bajas', value: formatInteger(bajas), tone: 'red' },
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(nuevos) },
        {
          // Cumplimiento de ingreso: el crecimiento neto contra la meta.
          id: 'cumplimiento',
          label: '% Ingresos',
          value: metrics.sinObjetivo ? '—' : `${formatTwoDecimals(metrics.tasaCumplimiento)}%`,
          tone: metrics.sinObjetivo ? 'white' : completionColor,
          divided: true,
        },
        {
          // Cumplimiento de ventas: las instalaciones contra la misma meta.
          id: 'cumplimiento_ventas',
          label: '% Ventas',
          value: metrics.sinObjetivo ? '—' : `${formatTwoDecimals(metrics.cumplimientoVentas)}%`,
          tone: metrics.sinObjetivo ? 'white' : ventasColor,
        },
        {
          id: 'crecimiento',
          label: 'Crecimiento',
          value: `${formatTwoDecimals(crecimiento)}%`,
          tone: growthColor,
        },
        {
          id: 'churn',
          label: `Churn (obj. ${formatObjetivo(meta.churnPct)})`,
          value: `${formatTwoDecimals(churnRate)}%`,
          tone: churnColor,
        },
        ...celdaProyeccion,
      ]}
    />
  );
}

export interface ResumenSencilloProps {
  activosInicio: number;
  activosFinal: number;
  nuevos: number;
  meta: Meta;
  /** Los días laborables del corte; sin ellos la proyección sale «—». */
  proyeccion?: Proyeccion | null;
  className?: string;
}

/**
 * El resumen sencillo de un site entero, todas sus tecnologías juntas:
 * instalaciones, objetivo, los dos cumplimientos y la proyección. Las zonas sin
 * objetivo ya vienen fuera de las cifras (`nodosMedidos`).
 *
 * Su «% Ventas» es el mismo número con que Comisiones paga a supervisores y
 * coordinadoras de oficina (`subscriptions/analytics/cumplimiento_sites.py`).
 */
export function ResumenSencillo({
  activosInicio, activosFinal, nuevos, meta, proyeccion = null, className,
}: ResumenSencilloProps) {
  const { semaforo } = useObjetivosConfig();
  const m = calcComercial(activosInicio, activosFinal, meta, { nuevos, proyeccion });
  const pct = (valor: number) => (m.sinObjetivo ? '—' : `${formatTwoDecimals(valor)}%`);
  const tono = (valor: number) => (m.sinObjetivo ? 'white' as const : tonoCumplimiento(valor, semaforo));

  return (
    <SummaryStrip
      columns={5}
      mono
      className={className}
      items={[
        { id: 'nuevos', label: 'Instalaciones', value: formatInteger(nuevos), tone: 'brand' },
        m.sinObjetivo
          ? { id: 'objetivo', label: 'Objetivo', value: 'Sin objetivo' }
          : {
            id: 'objetivo',
            label: `Objetivo (${formatObjetivo(meta.crecimientoPct)})`,
            value: `+${formatInteger(m.objetivo)}`,
            caption: meta.zonasSinObjetivo
              ? `${meta.zonasSinObjetivo} ${meta.zonasSinObjetivo === 1 ? 'zona' : 'zonas'} sin objetivo fuera`
              : undefined,
          },
        { id: 'ingresos', label: '% Ingresos', value: pct(m.tasaCumplimiento), tone: tono(m.tasaCumplimiento) },
        { id: 'ventas', label: '% Ventas', value: pct(m.cumplimientoVentas), tone: tono(m.cumplimientoVentas) },
        {
          id: 'proyeccion',
          label: 'Proyección',
          value: m.instalacionesProyectadas === null ? '—' : formatInteger(m.instalacionesProyectadas),
          caption: m.cumplimientoVentasProyectado === null
            ? (m.instalacionesProyectadas === null ? 'Sin corte del que proyectar' : undefined)
            : `${formatTwoDecimals(m.cumplimientoVentasProyectado)}% del objetivo`,
          tone: m.cumplimientoVentasProyectado === null ? 'white' : tonoCumplimiento(m.cumplimientoVentasProyectado, semaforo),
        },
      ]}
    />
  );
}
