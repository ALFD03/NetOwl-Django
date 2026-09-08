import React, { useState, useMemo } from 'react';
import { Search, Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: 'left' | 'center' | 'right';
  className?: string;
  sortKey?: keyof T; // Campo real de la data para ordenar
}

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

  // Lógica de Ordenamiento y Filtrado combinada
  const processedData = useMemo(() => {
    let filtered = [...data];

    // 1. Filtrar
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((row) =>
        Object.values(row as Record<string, unknown>).some((val) =>
          String(val ?? '').toLowerCase().includes(lowerSearch)
        )
      );
    }

    // 2. Ordenar
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
  }, [data, searchTerm, sortConfig]);

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
      {searchable && (
        <div className="p-3 border-b border-slate-800 bg-surface-secondary/50">
          <div className="relative max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:border-brand outline-none transition-all"
            />
          </div>
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