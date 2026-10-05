/** La proyección de las instalaciones al cierre, dentro del bloque del día de Analytics. */

import { promedioDiario, proyectar, type Proyeccion } from '@/shared/lib/proyeccion';
import { SummaryStrip, type SummaryStripItem, type StatTileTone } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';

interface Props {
  /** Instalaciones acumuladas del mes hasta el corte (`nuevos_mes`). */
  instalaciones: number;
  proyeccion: Proyeccion;
  /**
   * El cumplimiento de ventas que darían las instalaciones proyectadas, ya
   * calculado por el reporte (que decide si se recorta a 100). Sin él, la
   * franja no habla del objetivo: Analytics no resuelve metas.
   */
  cumplimiento?: { valor: number; objetivo: number; tono: StatTileTone } | null;
}

/**
 * Lo instalado hasta el corte, su promedio por día laborable y adónde lleva al
 * cierre si el resto del mes sigue al mismo ritmo (ver `shared/lib/proyeccion`).
 */
export function ProyeccionCierre({ instalaciones, proyeccion, cumplimiento = null }: Props) {
  const { dia, diasTranscurridos, diasMes } = proyeccion;
  const celdaCumplimiento: SummaryStripItem[] = cumplimiento ? [{
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
          value: formatTwoDecimals(promedioDiario(instalaciones, proyeccion)),
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
        ...celdaCumplimiento,
      ]}
    />
  );
}
