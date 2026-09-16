/** La cápsula con la que se presenta todo filtro: cabecera etiquetada + control. */

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

interface FilterFieldProps {
  /** Texto de la cabecera. Sin él, la cabecera queda solo con el icono. */
  label?: string;
  icon?: ReactNode;
  /** El control: un `SelectMenu`, un `SearchInput`, un campo propio. */
  children: ReactNode;
  /** Ocupa el espacio sobrante de la fila. Para el buscador. */
  grow?: boolean;
  className?: string;
  /** Texto del `title`, para explicar qué acota el filtro. */
  title?: string;
}

/**
 * La forma que tienen los filtros en toda la aplicación.
 *
 * Es la de los reportes comerciales —Ventas y Unidades de Negocio—, que es
 * donde se fijó: una cápsula con una cabecera oscura que dice **qué** se está
 * filtrando y, pegado a ella, el control que dice **por qué valor**. Separar
 * las dos cosas es lo que hace legible una fila de cinco filtros; un
 * desplegable suelto obliga a abrirlo para saber de qué es.
 *
 * Vivía copiado en cuatro sitios: aquí en `PeriodSelector` y tres veces en
 * `SubscriptionReportFilters`. Copiado, cada sitio nuevo lo reinterpretaba un
 * poco peor, así que la forma es este componente y no una convención.
 *
 * El control va como hijo en vez de estar cableado dentro: por la cápsula pasan
 * un selector, un buscador y un campo numérico, y los tres tienen que verse
 * igual por fuera.
 */
export function FilterField({ label, icon, children, grow = false, className, title }: FilterFieldProps) {
  return (
    <div
      title={title}
      className={cn(
        'group flex items-center overflow-hidden rounded-2xl border border-slate-700/50 bg-surface-secondary shadow-2xl',
        grow && 'min-w-[280px] flex-1',
        className,
      )}
    >
      {(icon || label) && (
        <div className="flex shrink-0 items-center gap-2 border-r border-slate-700/50 bg-slate-800/50 px-4 py-2.5 text-slate-400 transition-colors group-focus-within:text-brand">
          {icon}
          {label && <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Clases del disparador de un `SelectMenu` dentro de una `FilterField`.
 *
 * Se exporta en lugar de aplicarse sola porque `SelectMenu` recibe las suyas
 * por `className` y la cápsula no envuelve al botón, lo acompaña.
 */
export const FILTER_TRIGGER_CLASS =
  'flex min-w-[130px] cursor-pointer items-center justify-between gap-2 py-2.5 pl-4 pr-3 text-xs font-bold text-white outline-none hover:bg-white/5';
