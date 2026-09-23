/** La franja de cifras de cabecera de un grupo de nodos. */

import { SummaryStrip } from '@/shared/ui';
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
}: CommercialSummaryStripProps) {
  const { semaforo } = useObjetivosConfig();
  const metrics = calcComercial(activosInicio, activosFinal, meta.metaCrecimiento, { clamp: clampCompletion });

  const completionColor = tonoCumplimiento(metrics.tasaCumplimiento, semaforo);
  const growthColor = tonoCrecimiento(crecimiento, meta.crecimientoPct, semaforo);
  const churnColor = tonoChurn(churnRate, meta.churnPct, semaforo);

  return (
    <SummaryStrip
      columns={8}
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
      ]}
    />
  );
}
