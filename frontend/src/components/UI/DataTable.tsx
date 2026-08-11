import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor?: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  isLoading = false,
  emptyMessage = 'No hay registros disponibles.',
  keyExtractor,
  onRowClick,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = searchable
    ? data.filter((row) =>
        Object.values(row as any).some((val) =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : data;

  const alignMap = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {searchable && (
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-300">
          <thead className="bg-surface-tertiary text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-800">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`p-4 ${alignMap[col.align || 'left']} ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-brand" />
                    <span>Cargando datos...</span>
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIdx) => {
                const rowKey = keyExtractor
                  ? keyExtractor(row)
                  : (row as any).id || (row as any).periodo_reporte || rowIdx;

                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-surface-hover' : 'hover:bg-surface-hover/50'
                    }`}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={`p-4 ${alignMap[col.align || 'left']} ${col.className || ''}`}
                      >
                        {typeof col.accessor === 'function'
                          ? col.accessor(row)
                          : (row[col.accessor] as React.ReactNode)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}