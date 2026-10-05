/**
 * El objetivo de un grupo del reporte (un site, un coordinador, el bloque RF),
 * a la vista junto a su botón de exportar bajas.
 *
 * Solo se enseña: los objetivos se editan en el catálogo. La meta es la del
 * grupo, resuelta desde su nivel por el hook del reporte (ver
 * `lib/objetivos.ts`): el objetivo de una zona o de un nodo no la mueve.
 */

import { Target } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatInteger } from '@/shared/utils/formatters';
import { formatObjetivo, type Meta } from '../../lib/objetivos';

export function ObjetivoGrupo({ meta, className }: { meta?: Meta; className?: string }) {
  if (!meta) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5',
        className,
      )}
      title="Objetivo del grupo. Se edita en Catálogos → Objetivos."
    >
      <Target className="h-4 w-4 flex-shrink-0 text-sky-400" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Objetivo</span>
        <span className="text-sm font-black text-sky-300">{formatObjetivo(meta.crecimientoPct)}</span>
        <span className="text-[10px] font-bold text-slate-400">+{formatInteger(meta.metaCrecimiento)}</span>
      </div>
      <span className="h-4 w-px bg-slate-700" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Churn máx.</span>
        <span className="text-sm font-black text-rose-300">{formatObjetivo(meta.churnPct)}</span>
      </div>
    </div>
  );
}
