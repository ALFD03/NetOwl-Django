import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/** Filas por página de todas las tablas de la aplicación. */
export const ROWS_PER_PAGE = 20;

export interface PaginationState<T> {
  /** Índice desde 0, ya recortado al total. */
  page: number;
  totalPages: number;
  /** Las filas de la página abierta. */
  visible: T[];
  total: number;
  size: number;
  goTo: (page: number) => void;
}

/**
 * Corta `rows` en páginas de `pageSize`. Con `pageSize` 0 no pagina.
 *
 * La página se recorta al total en cada pintada y no con un efecto: tras una
 * recarga con menos filas (lo registrado sale de su lista, un filtro estrecha
 * la tabla) la que estaba abierta puede no existir ya, y así nunca se ve una
 * página vacía ni un instante.
 */
export function usePagination<T>(rows: T[], pageSize: number = ROWS_PER_PAGE): PaginationState<T> {
  const [page, setPage] = useState(0);
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const current = Math.min(page, pageCount - 1);
  return {
    page: current,
    totalPages: pageCount,
    visible: pageSize > 0 ? rows.slice(current * pageSize, (current + 1) * pageSize) : rows,
    total: rows.length,
    size: pageSize,
    goTo: setPage,
  };
}

const BUTTON =
  'rounded-lg border border-slate-700/50 p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

interface PaginationProps<T> {
  state: PaginationState<T>;
  /** Encima o debajo de la tabla. Toda tabla paginada lleva las dos, con el mismo `estado`. */
  position?: 'arriba' | 'abajo';
  className?: string;
}

/**
 * Qué filas se ven y los botones para moverse. Va **arriba y abajo** de cada
 * tabla paginada, compartiendo `estado`: con veinte filas, tener que bajar
 * hasta el pie para pasar de página era lo incomodo. No pinta nada cuando
 * todo cabe en una página.
 */
export function Pagination<T>({
  state,
  position: position = 'abajo',
  className = '',
}: PaginationProps<T>) {
  const { page, totalPages, total, size, goTo } = state;
  if (size <= 0 || total <= size) return null;
  const border = position === 'arriba' ? 'border-b' : 'border-t';
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${border} border-slate-800 bg-surface-secondary/50 px-3 py-2 ${className}`}
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {page * size + 1}–{Math.min((page + 1) * size, total)} de {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={BUTTON}
          disabled={page === 0}
          onClick={() => goTo(0)}
          title="Primera página"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
          title="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Página {page + 1} de {totalPages}
        </span>
        <button
          type="button"
          className={BUTTON}
          disabled={page >= totalPages - 1}
          onClick={() => goTo(page + 1)}
          title="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={page >= totalPages - 1}
          onClick={() => goTo(totalPages - 1)}
          title="Última página"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
