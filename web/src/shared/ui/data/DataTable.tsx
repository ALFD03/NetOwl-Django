import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, Filter, FilterX } from 'lucide-react';

import { FilterField, FILTER_TRIGGER_CLASS, SearchInput, SelectMenu } from '../inputs';
import { FILAS_POR_PAGINA, Paginacion, usePaginacion } from './Paginacion';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: 'left' | 'center' | 'right';
  className?: string;
  sortKey?: keyof T; // Campo real de la data para ordenar
  /**
   * Por qué se ordena cuando la celda no es un campo de la fila sino algo
   * calculado (una situación que sale de varios campos): sin esto, la columna
   * no se puede ordenar, o se ordena por un campo crudo que no es lo que se lee.
   * Manda sobre `sortKey`.
   */
  sortValue?: (row: T) => string | number;
  /**
   * Anade un desplegable de filtro para esta columna.
   *
   * Las opciones **salen de los datos**, no de una lista fija: un catalogo gana
   * valores con el tiempo y una lista escrita a mano se queda corta sin que
   * nadie se entere. Solo tiene sentido en columnas de pocos valores distintos
   * —tecnologia, estado, site—; para buscar texto libre esta el buscador.
   */
  filterable?: boolean;
  /**
   * De donde sale el valor por el que se filtra.
   *
   * Por defecto se lee `sortKey` (o el `accessor`, si es un campo). Hace falta
   * darlo cuando la celda se pinta con una funcion y el dato crudo no sirve
   * como etiqueta: un booleano que se muestra como «Si»/«—» se filtraria por
   * `true`/`false`, que no es lo que lee quien abre el desplegable.
   */
  filterValue?: (row: T) => string;
  /**
   * Fija la columna al borde izquierdo al hacer scroll horizontal. Para la
   * etiqueta de la fila (el valor de la dimensión, el nombre): en un teléfono
   * la tabla se lee deslizando, y sin ella las cifras pierden a quién son.
   */
  sticky?: boolean;
}

/** Celda fijada: opaca, porque por debajo pasan las demás columnas. */
const STICKY_TD = 'sticky left-0 z-10 bg-surface-secondary';
const STICKY_TH = 'sticky left-0 z-30 bg-surface-tertiary';

/** Valor del desplegable que no filtra nada. */
const TODOS = '__todos__';

/**
 * Selección de filas con casillas, controlada desde fuera: quien usa la tabla
 * es quien sabe qué hacer con lo elegido.
 */
export interface DataTableSelection<T> {
  /** Lo que identifica a una fila de forma estable entre recargas. */
  rowKey: (row: T) => string;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Filas por página; 0 la enseña entera. */
  pageSize?: number;
  /**
   * Clases del área que hace scroll, normalmente una altura máxima. Con ella
   * el scroll queda dentro de la tabla: la barra de filtros y la cabecera se
   * quedan a la vista mientras se recorren las filas.
   */
  scrollClassName?: string;
  selection?: DataTableSelection<T>;
}

/** La casilla de la cabecera, que además sabe pintarse a medias. */
function CasillaTodas({ estado, onChange }: { estado: 'todas' | 'algunas' | 'ninguna'; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === 'algunas';
  }, [estado]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={estado === 'todas'}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer accent-brand"
      title="Seleccionar todas las filas filtradas"
      aria-label="Seleccionar todas las filas filtradas"
    />
  );
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  isLoading = false,
  emptyMessage = 'No hay registros disponibles.',
  onRowClick,
  pageSize = FILAS_POR_PAGINA,
  scrollClassName = '',
  selection,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  // Se identifica la columna por su cabecera, como los filtros: una columna con
  // `sortValue` no tiene un campo de la fila que la nombre.
  const [sortConfig, setSortConfig] = useState<{ header: string; direction: 'asc' | 'desc' } | null>(null);
  // Un filtro por columna, indexado por su cabecera: es lo unico que identifica
  // a una columna de forma estable sin obligar a darle un id a mano.
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Cambiar lo que se busca o se filtra vuelve a la primera pagina y vacia la
  // seleccion: lo seleccionado tiene que estar a la vista, o una accion en
  // bloque tocaria filas que el filtro ya escondio.
  const alCambiarVista = () => {
    paginacion.irA(0);
    if (selection && selection.selected.size > 0) selection.onChange(new Set());
  };
  const buscar = (termino: string) => {
    setSearchTerm(termino);
    alCambiarVista();
  };
  const filtrar = (siguiente: Record<string, string>) => {
    setFilters(siguiente);
    alCambiarVista();
  };

  const filterColumns = useMemo(
    () => columns.filter((col) =>
      col.filterable && (col.filterValue || col.sortKey || typeof col.accessor === 'string')),
    [columns],
  );

  const valorFiltro = (col: Column<T>, row: T): string => {
    if (col.filterValue) return col.filterValue(row);
    const key = col.sortKey ?? (col.accessor as keyof T);
    return String((row as Record<string, unknown>)[String(key)] ?? '').trim();
  };

  // Las opciones se calculan sobre los datos completos y no sobre los ya
  // filtrados: si se estrecharan entre ellas, elegir un valor vaciaria los
  // desplegables de al lado y no habria forma de cambiar de idea.
  const filterOptions = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    filterColumns.forEach((col) => {
      const valores = new Set<string>();
      data.forEach((row) => {
        const valor = valorFiltro(col, row);
        if (valor) valores.add(valor);
      });
      mapa[col.header] = [...valores].sort((a, b) => a.localeCompare(b, 'es'));
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `valorFiltro` se recrea en cada render y solo lee de `col`.
  }, [data, filterColumns]);

  const filtrosActivos = Object.values(filters).filter(Boolean).length;

  // Lógica de Ordenamiento y Filtrado combinada
  const processedData = useMemo(() => {
    let filtered = [...data];

    // 1. Filtrar por columna
    filterColumns.forEach((col) => {
      const elegido = filters[col.header];
      if (!elegido || elegido === TODOS) return;
      filtered = filtered.filter((row) => valorFiltro(col, row) === elegido);
    });

    // 2. Buscar
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((row) =>
        Object.values(row as Record<string, unknown>).some((val) =>
          String(val ?? '').toLowerCase().includes(lowerSearch)
        )
      );
    }

    // 3. Ordenar
    const columnaOrden = sortConfig ? columns.find((col) => col.header === sortConfig.header) : undefined;
    if (sortConfig && columnaOrden) {
      const valorOrden = (row: T): unknown => {
        if (columnaOrden.sortValue) return columnaOrden.sortValue(row);
        const key = columnaOrden.sortKey ?? (columnaOrden.accessor as keyof T);
        return row[key];
      };
      filtered.sort((a: T, b: T) => {
        const aVal = valorOrden(a);
        const bVal = valorOrden(b);

        if (aVal === bVal) return 0;
        // Coerce to string/number for comparison
        const aComp = (typeof aVal === 'number' ? aVal : String(aVal ?? ''));
        const bComp = (typeof bVal === 'number' ? bVal : String(bVal ?? ''));

        if (aComp < bComp) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aComp > bComp) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `valorFiltro` se recrea en cada render y solo lee de `col`.
  }, [data, searchTerm, sortConfig, filters, filterColumns, columns]);

  const paginacion = usePaginacion(processedData, pageSize);

  const ordenable = (col: Column<T>) => Boolean(col.sortValue || col.sortKey || typeof col.accessor === 'string');
  const handleSort = (col: Column<T>) => {
    if (!ordenable(col)) return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.header === col.header && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ header: col.header, direction });
    paginacion.irA(0);
  };

  // La casilla de la cabecera actua sobre todas las filas filtradas, no solo
  // las de la pagina: filtrar y seleccionar todo es la forma de elegir en bloque.
  const clavesFiltradas = selection ? processedData.map(selection.rowKey) : [];
  const elegidasFiltradas = selection ? clavesFiltradas.filter((k) => selection.selected.has(k)).length : 0;
  const estadoTodas = elegidasFiltradas === 0
    ? 'ninguna'
    : elegidasFiltradas === clavesFiltradas.length ? 'todas' : 'algunas';
  const alternarTodas = () => {
    if (!selection) return;
    selection.onChange(estadoTodas === 'todas' ? new Set() : new Set(clavesFiltradas));
  };
  const alternarFila = (row: T) => {
    if (!selection) return;
    const clave = selection.rowKey(row);
    const siguiente = new Set(selection.selected);
    if (siguiente.has(clave)) siguiente.delete(clave);
    else siguiente.add(clave);
    selection.onChange(siguiente);
  };
  const totalColumnas = columns.length + (selection ? 1 : 0);

  const alignMap = { left: 'text-left', center: 'text-center', right: 'text-right' };

  return (
    <div className="flex flex-col h-full">
      {(searchable || filterColumns.length > 0) && (
        /* Misma forma que los filtros de Ventas y Unidades de Negocio: cada uno
           es una `FilterField`, con su cabecera diciendo qué se filtra. */
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-surface-secondary/50 p-3">
          {filterColumns.map((col) => (
            <FilterField
              key={col.header}
              label={col.header}
              icon={<Filter className="h-4 w-4 text-brand" />}
              title={`Filtrar la tabla por ${col.header.toLowerCase()}`}
            >
              <SelectMenu
                aria-label={`Filtrar por ${col.header}`}
                className={FILTER_TRIGGER_CLASS}
                panelWidth={220}
                value={filters[col.header] ?? TODOS}
                options={[
                  { value: TODOS, label: 'Todos' },
                  ...(filterOptions[col.header] ?? []).map((valor) => ({ value: valor, label: valor })),
                ]}
                onChange={(valor) =>
                  filtrar({ ...filters, [col.header]: valor === TODOS ? '' : valor })
                }
              />
            </FilterField>
          ))}

          {searchable && (
            <FilterField grow icon={<Search className="h-4 w-4" />}>
              <SearchInput
                value={searchTerm}
                placeholder={searchPlaceholder}
                onChange={buscar}
                className="w-full bg-transparent px-0"
              />
            </FilterField>
          )}

          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={() => filtrar({})}
              className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-surface-secondary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 shadow-2xl transition-colors hover:text-white"
              title="Quitar todos los filtros"
            >
              <FilterX className="h-4 w-4" /> Limpiar
            </button>
          )}

          {/* Cuántas filas quedan a la vista. Sin esto, un filtro que deja la
              tabla corta se confunde con una tabla que trae pocos datos. */}
          {(filtrosActivos > 0 || searchTerm) && (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {processedData.length} de {data.length}
            </span>
          )}
        </div>
      )}

      <Paginacion estado={paginacion} posicion="arriba" />

      <div className={`overflow-x-auto overflow-y-auto flex-1 custom-scrollbar ${scrollClassName}`}>
        <table className="w-full text-sm text-slate-300 border-collapse">
          <thead className="bg-surface-tertiary/80 sticky top-0 z-20 backdrop-blur-md">
            <tr>
              {selection && (
                <th className="w-10 border-b border-slate-800 p-3 text-center">
                  <CasillaTodas estado={estadoTodas} onChange={alternarTodas} />
                </th>
              )}
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(col)}
                  className={`p-3 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800 transition-colors 
                    ${ordenable(col) ? 'cursor-pointer hover:text-white hover:bg-slate-700/50' : ''} 
                    ${alignMap[col.align || 'left']} ${col.sticky ? STICKY_TH : ''} ${col.className || ''}`}
                >
                  <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    <span>{col.header}</span>
                    {ordenable(col) && (
                      <span className="text-slate-600">
                        {sortConfig?.header === col.header ? (
                          sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-brand" /> : <ChevronDown className="w-3 h-3 text-brand" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={totalColumnas} className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></td></tr>
            ) : processedData.length === 0 ? (
              <tr><td colSpan={totalColumnas} className="p-10 text-center text-slate-500">{emptyMessage}</td></tr>
            ) : (
              paginacion.visibles.map((row, rowIdx) => (
                <tr
                  key={selection ? selection.rowKey(row) : rowIdx}
                  onClick={() => onRowClick?.(row)}
                  className={`group transition-colors ${onRowClick ? 'cursor-pointer hover:bg-white/5' : 'hover:bg-white/2'}`}
                >
                  {selection && (
                    <td className="w-10 p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selection.selected.has(selection.rowKey(row))}
                        onChange={() => alternarFila(row)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer accent-brand"
                        aria-label="Seleccionar fila"
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={`p-3 text-xs ${alignMap[col.align || 'left']} ${col.sticky ? STICKY_TD : ''} ${col.className || ''}`}>
                      {typeof col.accessor === 'function' ? col.accessor(row) : String((row as Record<string, unknown>)[String(col.accessor)])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginacion estado={paginacion} />
    </div>
  );
}