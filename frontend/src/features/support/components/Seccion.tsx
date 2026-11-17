/**
 * Las secciones de las páginas largas de soporte (Dashboard y Analytics).
 *
 * Cada una lleva su cabecera con **qué alcance tiene**: en Analytics conviven
 * bloques que siguen al grupo y al día con otros que son del mes entero y de toda
 * la empresa, y sin decirlo se leerían como si respondieran al mismo filtro. El
 * índice de arriba salta a cada una, porque la página ya no cabe en una pantalla.
 */

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface SeccionDef {
  id: string;
  titulo: string;
  icon?: ReactNode;
}

/** El índice de la página: un botón por sección, que la lleva arriba. */
export function SeccionesNav({
  secciones,
  className,
}: {
  secciones: SeccionDef[];
  className?: string;
}) {
  if (secciones.length < 2) return null;
  const ir = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <nav aria-label="Secciones de la página" className={cn('flex flex-wrap gap-2', className)}>
      {secciones.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => ir(s.id)}
          className="flex items-center gap-2 rounded-full border border-slate-700 bg-surface-secondary px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-brand/60 hover:text-white [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          {s.icon}
          {s.titulo}
        </button>
      ))}
    </nav>
  );
}

interface SeccionProps {
  id: string;
  titulo: string;
  descripcion?: string;
  /** A qué responde lo de dentro: «sigue al grupo y al día», «todo el mes»… */
  alcance?: string;
  icon?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Seccion({
  id,
  titulo,
  descripcion,
  alcance,
  icon,
  accion,
  children,
  className,
}: SeccionProps) {
  return (
    <section id={id} className={cn('scroll-mt-6 space-y-4', className)}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-brand">
            {icon}
            {titulo}
          </h2>
          {descripcion && <p className="mt-1 max-w-3xl text-xs text-slate-400">{descripcion}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {alcance && (
            <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand">
              {alcance}
            </span>
          )}
          {accion}
        </div>
      </header>
      {children}
    </section>
  );
}
