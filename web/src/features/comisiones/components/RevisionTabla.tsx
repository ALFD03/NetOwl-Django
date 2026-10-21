/** Las ventas que las facturas no resuelven, y lo que se decidió con cada una. */

import { useState } from 'react';
import { Ban, CheckCircle2, Undo2, X } from 'lucide-react';

import { Button, DataTable, type Column } from '@/shared/ui';
import { formatoFecha } from '../lib/formato';
import { PrimeraMensualidad } from './piezas';
import type { VentaComision } from '../types';

interface RevisionTablaProps {
  ventas: VentaComision[];
  editable: boolean;
  guardando: boolean;
  /** Resuelve a `true` si se guardó: entonces se vacía la selección. */
  onDecidir: (ordenes: string[], decision: '' | 'contar' | 'no_contar') => Promise<boolean>;
}

/**
 * Llegan aquí las que la primera mensualidad no resuelve: todas sus
 * mensualidades están canceladas (¿exoneración?), no tiene ninguna, o pasó a
 * plan gratuito con la mensualidad pagada. Se decide a mano: **contarla** en este periodo o **no contarla**,
 * y la decisión manda aunque cambien los datos, hasta que se deshace. Una
 * venta solo es candidata en el periodo en que se instaló, así que no
 * contarla es que no se paga.
 *
 * Un mes puede traer cientos, así que también se deciden en bloque: las
 * marcadas con la casilla (la de la cabecera toma todas las filtradas), o sin
 * marcar ninguna, todas las pendientes —lo filtrado en la tabla no cuenta—.
 * Marcar una ya decidida y elegir la otra opción cambia su decisión.
 */
export function RevisionTabla({ ventas, editable, guardando, onDecidir }: RevisionTablaProps) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const pendientes = ventas.filter((v) => !v.decision).map((v) => v.orden);
  // Lo seleccionado que sigue en la lista (tras una recarga puede no estar).
  const elegidas = ventas.filter((v) => seleccion.has(v.orden));
  const elegidasDecididas = elegidas.filter((v) => v.decision).length;

  const decidirSeleccion = async (decision: '' | 'contar' | 'no_contar') => {
    if (await onDecidir(elegidas.map((v) => v.orden), decision)) setSeleccion(new Set());
  };

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
      sortValue: (row) => (row.decision === 'contar' ? 'Se cuenta' : row.decision === 'no_contar' ? 'No se cuenta' : 'Por decidir'),
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
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir([row.orden], '')}>
              Deshacer
            </Button>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir([row.orden], 'contar')}>
              Contar
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Ban className="h-4 w-4" />}
              disabled={guardando}
              onClick={() => void onDecidir([row.orden], 'no_contar')}
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
      {editable && elegidas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
          <span className="mr-auto text-[10px] font-black uppercase tracking-wider text-sky-300">
            {elegidas.length} seleccionada{elegidas.length === 1 ? '' : 's'}
            {elegidasDecididas > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">{elegidasDecididas} ya decidida{elegidasDecididas === 1 ? '' : 's'}</span>}
          </span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('contar')}>
            Contar {elegidas.length}
          </Button>
          <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('no_contar')}>
            No contar {elegidas.length}
          </Button>
          {elegidasDecididas > 0 && (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('')}>
              Deshacer decisión
            </Button>
          )}
          <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}
      {editable && elegidas.length === 0 && pendientes.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 p-4">
          <span className="mr-auto text-xs text-slate-400">
            {pendientes.length} por decidir · marca varias con la casilla para decidir solo esas
          </span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir(pendientes, 'contar')}>
            Contar todas
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Ban className="h-4 w-4" />}
            disabled={guardando}
            onClick={() => void onDecidir(pendientes, 'no_contar')}
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
        selection={editable ? { rowKey: (row) => row.orden, selected: seleccion, onChange: setSeleccion } : undefined}
      />
    </>
  );
}
