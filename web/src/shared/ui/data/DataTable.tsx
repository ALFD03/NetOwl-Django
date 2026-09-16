import React, { useState, useMemo } from 'react';
import { Search, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, Filter, FilterX } from 'lucide-react';

import { FilterField, FILTER_TRIGGER_CLASS, SearchInput, SelectMenu } from '../inputs';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: 'left' | 'center' | 'right';
  className?: string;
  sortKey?: keyof T; // Campo real de la data para ordenar
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
}

/** Valor del desplegable que no filtra nada. */
const TODOS = '__todos__';

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  isLoading = false,
  emptyMessage = 'No hay registros disponibles.',
  onRowClick,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'asc' | 'desc' } | null>(null);
  // Un filtro por columna, indexado por su cabecera: es lo unico que identifica
  // a una columna de forma estable sin obligar a darle un id a mano.
  const [filters, setFilters] = useState<Record<string, string>>({});

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
    if (sortConfig) {
      filtered.sort((a: T, b: T) => {
        const aVal = a[sortConfig.key] as unknown;
        const bVal = b[sortConfig.key] as unknown;

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
  }, [data, searchTerm, sortConfig, filters, filterColumns]);

  const handleSort = (key?: keyof T) => {
    if (!key) return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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
                  setFilters((previos) => ({ ...previos, [col.header]: valor === TODOS ? '' : valor }))
                }
              />
            </FilterField>
          ))}

          {searchable && (
            <FilterField grow icon={<Search className="h-4 w-4" />}>
              <SearchInput
                value={searchTerm}
                placeholder={searchPlaceholder}
                onChange={setSearchTerm}
                className="w-full bg-transparent px-0"
              />
            </FilterField>
          )}

          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={() => setFilters({})}
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

      <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-slate-300 border-collapse">
          <thead className="bg-surface-tertiary/80 sticky top-0 z-20 backdrop-blur-md">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(col.sortKey || (typeof col.accessor === 'string' ? col.accessor : undefined))}
                  className={`p-3 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800 transition-colors 
                    ${col.sortKey || typeof col.accessor === 'string' ? 'cursor-pointer hover:text-white hover:bg-slate-700/50' : ''} 
                    ${alignMap[col.align || 'left']} ${col.className || ''}`}
                >
                  <div className={`flex items-center gap-2 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    <span>{col.header}</span>
                    {(col.sortKey || typeof col.accessor === 'string') && (
                      <span className="text-slate-600">
                        {sortConfig?.key === (col.sortKey || col.accessor) ? (
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
              <tr><td colSpan={columns.length} className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></td></tr>
            ) : processedData.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-10 text-center text-slate-500">{emptyMessage}</td></tr>
            ) : (
              processedData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => onRowClick?.(row)}
                  className={`group transition-colors ${onRowClick ? 'cursor-pointer hover:bg-white/5' : 'hover:bg-white/2'}`}
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={`p-3 text-xs ${alignMap[col.align || 'left']} ${col.className || ''}`}>
                      {typeof col.accessor === 'function' ? col.accessor(row) : String((row as Record<string, unknown>)[String(col.accessor)])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}