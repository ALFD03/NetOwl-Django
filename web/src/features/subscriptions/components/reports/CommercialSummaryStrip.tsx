/** La franja de cifras de cabecera de un grupo de nodos. */

import { SummaryStrip } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { calcComercial } from '../../lib/commercial';

export interface CommercialSummaryStripProps {
  /** First cell — the technology for Sales Report, the status for Business Units. */
  leadLabel: string;
  leadValue: string;
  activosInicio: number;
  activosFinal: number;
  crecimiento: number;
  churnRate: number;
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
  mono = false,
  clampCompletion = false,
}: CommercialSummaryStripProps) {
  const metrics = calcComercial(activosInicio, activosFinal, { clamp: clampCompletion });

  const completionColor =
    metrics.tasaCumplimiento >= 100 ? 'green' : metrics.tasaCumplimiento >= 60 ? 'yellow' : 'red';
  const growthColor = crecimiento >= 4 ? 'green' : crecimiento >= 0 ? 'yellow' : 'red';
  const churnColor = churnRate <= 3 ? 'green' : churnRate <= 4 ? 'yellow' : 'red';

  return (
    <SummaryStrip
      columns={7}
      mono={mono}
      items={[
        { id: 'lead', label: leadLabel, value: leadValue, tone: 'brand' },
        { id: 'inicio', label: 'Base Inicio', value: formatInteger(activosInicio) },
        { id: 'objetivo', label: 'Objetivo (6%)', value: `+${formatInteger(metrics.objetivo)}` },
        { id: 'esperado', label: 'Cierre Esperado', value: formatInteger(metrics.cierreEsperado) },
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
          label: 'Churn Rate',
          value: `${formatTwoDecimals(churnRate)}%`,
          tone: churnColor,
        },
      ]}
    />
  );
}
