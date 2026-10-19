/** Las ventas que las facturas no resuelven, y lo que se decidió con cada una. */

import { Ban, CheckCircle2, Undo2 } from 'lucide-react';

import { Button, DataTable, type Column } from '@/shared/ui';
import { formatoFecha } from '../lib/formato';
import { PrimeraMensualidad } from './piezas';
import type { VentaComision } from '../types';

interface RevisionTablaProps {
  ventas: VentaComision[];
  editable: boolean;
  guardando: boolean;
  onDecidir: (ordenes: string[], decision: '' | 'contar' | 'no_contar') => void;
}

/**
 * Llegan aquí las que la primera mensualidad no resuelve: todas sus
 * mensualidades están canceladas (¿exoneración?), no tiene ninguna, o pasó a
 * plan gratuito con la mensualidad pagada. Se decide a mano: **contarla** en este periodo o **no contarla**,
 * y la decisión manda aunque cambien los datos, hasta que se deshace. Una
 * venta solo es candidata en el periodo en que se instaló, así que no
 * contarla es que no se paga.
 *
 * Un mes puede traer cientos, así que las pendientes también se deciden en
 * bloque; lo filtrado en la tabla no cuenta, el bloque son todas.
 */
export function RevisionTabla({ ventas, editable, guardando, onDecidir }: RevisionTablaProps) {
  const pendientes = ventas.filter((v) => !v.decision).map((v) => v.orden);

  const columnas: Column<VentaComision>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: 'cliente', sortKey: 'cliente' },
    { header: 'Instalada', accessor: (row) => formatoFecha(row.fecha_inicio), sortKey: 'fecha_inicio' },
    { header: 'Plan', accessor: 'producto', sortKey: 'producto' },
    {
      header: 'Estado actual',
      accessor: (row) => (
        <span className="flex flex-col leading-tight">
          <span>{row.estado || '—'}</span>
          {row.cancelada_el && <span className="text-xs text-slate-500">desde {formatoFecha(row.cancelada_el)}</span>}
        </span>
      ),
      sortKey: 'estado',
      filterable: true,
      filterValue: (row) => row.estado || 'Sin estado',
    },
    { header: 'Estado de la factura', accessor: (row) => row.estado_factura || '—', sortKey: 'estado_factura', filterable: true, filterValue: (row) => row.estado_factura || 'Sin estado' },
    // Se ordena por el estado del pago, que es lo que se lee de un vistazo.
    { header: 'Primera mensualidad', accessor: (row) => <PrimeraMensualidad venta={row} />, sortKey: 'factura_pago' },
    {
      header: 'Por qué',
      accessor: (row) => <span className="text-slate-300">{row.motivo_analisis}</span>,
      sortKey: 'motivo_analisis',
      filterable: true,
      filterValue: (row) => row.motivo_analisis,
    },
    { header: 'Medio', accessor: (row) => row.medio || '—', sortKey: 'medio' },
    {
      header: 'Situación',
      accessor: (row) => {
        if (row.decision === 'contar') return 'Se cuenta en este periodo';
        if (row.decision === 'no_contar') return 'No se cuenta';
        return <span className="text-amber-400">Por decidir</span>;
      },
      sortKey: 'decision',
      filterable: true,
      filterValue: (row) => (row.decision === 'contar' ? 'Se cuenta' : row.decision === 'no_contar' ? 'No se cuenta' : 'Por decidir'),
    },
    {
      header: 'Decisión',
      align: 'right',
      sortKey: 'decision',
      accessor: (row) => {
        if (!editable) return null;
        if (row.decision) {
          return (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir([row.orden], '')}>
              Deshacer
            </Button>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir([row.orden], 'contar')}>
              Contar
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Ban className="h-4 w-4" />}
              disabled={guardando}
              onClick={() => onDecidir([row.orden], 'no_contar')}
            >
              No contar
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {editable && pendientes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 p-4">
          <span className="mr-auto text-xs text-slate-400">{pendientes.length} por decidir</span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => onDecidir(pendientes, 'contar')}>
            Contar todas
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Ban className="h-4 w-4" />}
            disabled={guardando}
            onClick={() => onDecidir(pendientes, 'no_contar')}
          >
            No contar ninguna
          </Button>
        </div>
      )}
      <DataTable
        columns={columnas}
        data={ventas}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage="No hay ventas que revisar: las facturas lo resuelven todo."
      />
    </>
  );
}
