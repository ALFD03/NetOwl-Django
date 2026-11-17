import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/** Filas por página de todas las tablas de la aplicación. */
export const FILAS_POR_PAGINA = 20;

export interface EstadoPaginacion<T> {
  /** Índice desde 0, ya recortado al total. */
  pagina: number;
  totalPaginas: number;
  /** Las filas de la página abierta. */
  visibles: T[];
  total: number;
  tamano: number;
  irA: (pagina: number) => void;
}

/**
 * Corta `filas` en páginas de `tamano`. Con `tamano` 0 no pagina.
 *
 * La página se recorta al total en cada pintada y no con un efecto: tras una
 * recarga con menos filas (lo registrado sale de su lista, un filtro estrecha
 * la tabla) la que estaba abierta puede no existir ya, y así nunca se ve una
 * página vacía ni un instante.
 */
export function usePaginacion<T>(filas: T[], tamano: number = FILAS_POR_PAGINA): EstadoPaginacion<T> {
  const [pagina, setPagina] = useState(0);
  const totalPaginas = tamano > 0 ? Math.max(1, Math.ceil(filas.length / tamano)) : 1;
  const actual = Math.min(pagina, totalPaginas - 1);
  return {
    pagina: actual,
    totalPaginas,
    visibles: tamano > 0 ? filas.slice(actual * tamano, (actual + 1) * tamano) : filas,
    total: filas.length,
    tamano,
    irA: setPagina,
  };
}

const BOTON =
  'rounded-lg border border-slate-700/50 p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

interface PaginacionProps<T> {
  estado: EstadoPaginacion<T>;
  /** Encima o debajo de la tabla. Toda tabla paginada lleva las dos, con el mismo `estado`. */
  posicion?: 'arriba' | 'abajo';
  className?: string;
}

/**
 * Qué filas se ven y los botones para moverse. Va **arriba y abajo** de cada
 * tabla paginada, compartiendo `estado`: con veinte filas, tener que bajar
 * hasta el pie para pasar de página era lo incomodo. No pinta nada cuando
 * todo cabe en una página.
 */
export function Paginacion<T>({ estado, posicion = 'abajo', className = '' }: PaginacionProps<T>) {
  const { pagina, totalPaginas, total, tamano, irA } = estado;
  if (tamano <= 0 || total <= tamano) return null;
  const borde = posicion === 'arriba' ? 'border-b' : 'border-t';
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${borde} border-slate-800 bg-surface-secondary/50 px-3 py-2 ${className}`}
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {pagina * tamano + 1}–{Math.min((pagina + 1) * tamano, total)} de {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={BOTON} disabled={pagina === 0} onClick={() => irA(0)} title="Primera página">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" className={BOTON} disabled={pagina === 0} onClick={() => irA(pagina - 1)} title="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Página {pagina + 1} de {totalPaginas}
        </span>
        <button
          type="button"
          className={BOTON}
          disabled={pagina >= totalPaginas - 1}
          onClick={() => irA(pagina + 1)}
          title="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={BOTON}
          disabled={pagina >= totalPaginas - 1}
          onClick={() => irA(totalPaginas - 1)}
          title="Última página"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
