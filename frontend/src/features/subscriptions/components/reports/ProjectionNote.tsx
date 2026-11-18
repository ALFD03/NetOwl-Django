/** La base de la proyección al cierre, dicha una vez junto a la barra de días. */

import { Gauge } from 'lucide-react';

import type { Projection } from '@/shared/lib/projection';

export function ProjectionNote({ projection }: { projection: Projection | null }) {
  if (!projection) return null;
  const { day, elapsedDays, monthDays } = projection;
  const closed = elapsedDays === monthDays;

  return (
    <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-400">
      <Gauge className="h-3.5 w-3.5 text-cyan-400" />
      {closed
        ? `Corte del día ${day}: el mes ya cubre sus ${monthDays} días laborables, así que la proyección es lo instalado.`
        : `Proyección al cierre: lo instalado hasta el día ${day} entre ${elapsedDays} de ${monthDays} días laborables (lunes a sábado), al mismo ritmo hasta fin de mes.`}
    </p>
  );
}
