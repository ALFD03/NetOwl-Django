/** La base de la proyección al cierre, dicha una vez junto a la barra de días. */

import { Gauge } from 'lucide-react';

import type { Proyeccion } from '@/shared/lib/projection';

export function ProjectionNote({ projection: proyeccion }: { projection: Proyeccion | null }) {
  if (!proyeccion) return null;
  const { dia, elapsedDays: diasTranscurridos, monthDays: diasMes } = proyeccion;
  const closed = diasTranscurridos === diasMes;

  return (
    <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-400">
      <Gauge className="h-3.5 w-3.5 text-cyan-400" />
      {closed
        ? `Corte del día ${dia}: el mes ya cubre sus ${diasMes} días laborables, así que la proyección es lo instalado.`
        : `Proyección al cierre: lo instalado hasta el día ${dia} entre ${diasTranscurridos} de ${diasMes} días laborables (lunes a sábado), al mismo ritmo hasta fin de mes.`}
    </p>
  );
}
