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
  /** Clamp completion to [0, 100]. See `calcComercial`. */
  clampCompletion?: boolean;
  /** Instalaciones del grupo, de las que sale la proyección. */
  nuevos?: number;
  /** Los días laborables del corte; sin ellos no hay celda de proyección. */
  proyeccion?: Proyeccion | null;
}


/**
 * The seven headline figures that open every commercial report section.
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
  clampCompletion = false,
  nuevos = 0,
  proyeccion = null,
}: CommercialSummaryStripProps) {
  const { semaforo } = useObjetivosConfig();
  const metrics = calcComercial(activosInicio, activosFinal, meta.metaCrecimiento, {
    clamp: clampCompletion,
    nuevos,
    proyeccion,
  });

  const completionColor = tonoCumplimiento(metrics.tasaCumplimiento, semaforo);
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
      columns={celdaProyeccion.length ? 9 : 8}
      mono={mono}
      items={[
        { id: 'lead', label: leadLabel, value: leadValue, tone: 'brand' },
        { id: 'inicio', label: 'Base Inicio', value: formatInteger(activosInicio) },
        { id: 'objetivo', label: `Objetivo (${formatObjetivo(meta.crecimientoPct)})`, value: `+${formatInteger(metrics.objetivo)}` },
        { id: 'esperado', label: 'Cierre Esperado', value: formatInteger(metrics.cierreEsperado) },
        { id: 'bajas', label: 'Bajas', value: formatInteger(bajas), tone: 'red' },
        {
          id: 'cumplimiento',
          label: 'Cumplimiento',
          value: `${formatTwoDecimals(metrics.tasaCumplimiento)}%`,
          tone: completionColor,
          divided: true,
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
