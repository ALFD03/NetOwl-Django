/** La proyección de las instalaciones al cierre, dentro del bloque del día de Analytics. */

import { dailyAverage, proyectar, type Proyeccion } from '@/shared/lib/projection';
import { SummaryStrip, type SummaryStripItem, type StatTileTone } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';

interface Props {
  /** Instalaciones acumuladas del mes hasta el corte (`nuevos_mes`). */
  instalaciones: number;
  projection: Proyeccion;
  /**
   * El cumplimiento de ventas que darían las instalaciones proyectadas, ya
   * calculado por quien llama (que decide si se recorta a 100). Sin él, la
   * franja no habla del objetivo.
   */
  cumplimiento?: { valor: number; objetivo: number; tono: StatTileTone } | null;
}

/**
 * Lo instalado hasta el corte, su promedio por día laborable y adónde lleva al
 * cierre si el resto del mes sigue al mismo ritmo (ver `shared/lib/projection`).
 */
export function CloseProjection({ instalaciones, projection: proyeccion, cumplimiento = null }: Props) {
  const { dia, elapsedDays: diasTranscurridos, monthDays: diasMes } = proyeccion;
  const complianceCell: SummaryStripItem[] = cumplimiento ? [{
    id: 'cumplimiento',
    label: 'Cumpl. Ventas Proyectado',
    value: `${formatTwoDecimals(cumplimiento.valor)}%`,
    caption: `Sobre un objetivo de +${formatInteger(cumplimiento.objetivo)}`,
    tone: cumplimiento.tono,
  }] : [];

  return (
    <SummaryStrip
      columns={cumplimiento ? 5 : 4}
      mono
      items={[
        {
          id: 'instaladas',
          label: `Instalaciones al día ${dia}`,
          value: formatInteger(instalaciones),
          tone: 'green',
        },
        {
          id: 'laborables',
          label: 'Días laborables',
          value: `${diasTranscurridos} de ${diasMes}`,
          caption: 'Lunes a sábado',
        },
        {
          id: 'promedio',
          label: 'Promedio diario',
          value: formatTwoDecimals(dailyAverage(instalaciones, proyeccion)),
          caption: 'Por día laborable',
        },
        {
          id: 'proyeccion',
          label: 'Proyección al cierre',
          value: formatInteger(proyectar(instalaciones, proyeccion)),
          caption: 'Al mismo ritmo hasta fin de mes',
          tone: 'brand',
          divided: true,
        },
        ...complianceCell,
      ]}
    />
  );
}
