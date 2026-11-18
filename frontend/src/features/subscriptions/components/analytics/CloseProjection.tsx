/** La proyección de las instalaciones al cierre, dentro del bloque del día de Analytics. */

import { dailyAverage, project, type Projection } from '@/shared/lib/projection';
import { SummaryStrip, type SummaryStripItem, type StatTileTone } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';

interface Props {
  /** Instalaciones acumuladas del mes hasta el corte (`nuevos_mes`). */
  installs: number;
  projection: Projection;
  /**
   * El cumplimiento de ventas que darían las instalaciones proyectadas, ya
   * calculado por quien llama (que decide si se recorta a 100). Sin él, la
   * franja no habla del objetivo.
   */
  compliance?: { value: number; target: number; tone: StatTileTone } | null;
}

/**
 * Lo instalado hasta el corte, su promedio por día laborable y adónde lleva al
 * cierre si el resto del mes sigue al mismo ritmo (ver `shared/lib/projection`).
 */
export function CloseProjection({ installs, projection, compliance: compliance = null }: Props) {
  const { day, elapsedDays, monthDays } = projection;
  const complianceCell: SummaryStripItem[] = compliance ? [{
    id: 'cumplimiento',
    label: 'Cumpl. Ventas Proyectado',
    value: `${formatTwoDecimals(compliance.value)}%`,
    caption: `Sobre un objetivo de +${formatInteger(compliance.target)}`,
    tone: compliance.tone,
  }] : [];

  return (
    <SummaryStrip
      columns={compliance ? 5 : 4}
      mono
      items={[
        {
          id: 'instaladas',
          label: `Instalaciones al día ${day}`,
          value: formatInteger(installs),
          tone: 'green',
        },
        {
          id: 'laborables',
          label: 'Días laborables',
          value: `${elapsedDays} de ${monthDays}`,
          caption: 'Lunes a sábado',
        },
        {
          id: 'promedio',
          label: 'Promedio diario',
          value: formatTwoDecimals(dailyAverage(installs, projection)),
          caption: 'Por día laborable',
        },
        {
          id: 'proyeccion',
          label: 'Proyección al cierre',
          value: formatInteger(project(installs, projection)),
          caption: 'Al mismo ritmo hasta fin de mes',
          tone: 'brand',
          divided: true,
        },
        ...complianceCell,
      ]}
    />
  );
}
