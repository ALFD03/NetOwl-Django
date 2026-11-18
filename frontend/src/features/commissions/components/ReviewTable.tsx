/** Las ventas que las facturas no resuelven, y lo que se decidió con cada una. */

import { useState } from 'react';
import { Ban, CheckCircle2, Undo2, X } from 'lucide-react';

import { Button, DataTable, type Column } from '@/shared/ui';
import { formatDateValue } from '../lib/format';
import { FirstInstallment } from './pieces';
import type { CommissionSale } from '../types';

interface ReviewTableProps {
  sales: CommissionSale[];
  editable: boolean;
  saving: boolean;
  /** Resuelve a `true` si se guardó: entonces se vacía la selección. */
  onDecide: (orders: string[], decision: '' | 'contar' | 'no_contar') => Promise<boolean>;
}

/**
 * Llegan aquí las que la primera mensualidad no resuelve: pasó a plan
 * gratuito con la mensualidad pagada, o todas sus mensualidades se cancelaron
 * a menos de 20 días de emitidas (o no se sabe cuándo). Se decide a mano: **contarla** en este periodo o **no contarla**,
 * y la decisión manda aunque cambien los datos, hasta que se deshace. Una
 * venta solo es candidata en el periodo en que se instaló, así que no
 * contarla es que no se paga.
 *
 * Un mes puede traer cientos, así que también se deciden en bloque: las
 * marcadas con la casilla (la de la cabecera toma todas las filtradas), o sin
 * marcar ninguna, todas las pendientes —lo filtrado en la tabla no cuenta—.
 * Marcar una ya decidida y elegir la otra opción cambia su decisión.
 */
export function ReviewTable({ sales, editable, saving, onDecide }: ReviewTableProps) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const pending = sales.filter((v) => !v.decision).map((v) => v.order);
  // Lo seleccionado que sigue en la lista (tras una recarga puede no estar).
  const selected = sales.filter((v) => selection.has(v.order));
  const selectedDecided = selected.filter((v) => v.decision).length;

  const decideSelection = async (decision: '' | 'contar' | 'no_contar') => {
    if (await onDecide(selected.map((v) => v.order), decision)) setSelection(new Set());
  };

  const columns: Column<CommissionSale>[] = [
    { header: 'Orden', accessor: 'order', sortKey: 'order', sticky: true },
    { header: 'Cliente', accessor: 'client', sortKey: 'client' },
    { header: 'Instalada', accessor: (row) => formatDateValue(row.since_date), sortKey: 'since_date' },
    { header: 'Plan', accessor: 'product', sortKey: 'product' },
    {
      header: 'Estado actual',
      accessor: (row) => (
        <span className="flex flex-col leading-tight">
          <span>{row.status || '—'}</span>
          {row.cancelled_on && <span className="text-xs text-slate-500">desde {formatDateValue(row.cancelled_on)}</span>}
        </span>
      ),
      sortKey: 'status',
      filterable: true,
      filterValue: (row) => row.status || 'Sin estado',
    },
    { header: 'Estado de la factura', accessor: (row) => row.billing_status || '—', sortKey: 'billing_status', filterable: true, filterValue: (row) => row.billing_status || 'Sin estado' },
    // Se ordena por el estado del pago, que es lo que se lee de un vistazo.
    { header: 'Primera mensualidad', accessor: (row) => <FirstInstallment sale={row} />, sortKey: 'invoice_payment' },
    {
      header: 'Por qué',
      accessor: (row) => <span className="text-slate-300">{row.analysis_reason}</span>,
      sortKey: 'analysis_reason',
      filterable: true,
      filterValue: (row) => row.analysis_reason,
    },
    { header: 'Medio', accessor: (row) => row.channel || '—', sortKey: 'channel' },
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
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide([row.order], '')}>
              Deshacer
            </Button>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide([row.order], 'contar')}>
              Contar
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Ban className="h-4 w-4" />}
              disabled={saving}
              onClick={() => void onDecide([row.order], 'no_contar')}
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
      {editable && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
          <span className="mr-auto text-[10px] font-black uppercase tracking-wider text-sky-300">
            {selected.length} seleccionada{selected.length === 1 ? '' : 's'}
            {selectedDecided > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">{selectedDecided} ya decidida{selectedDecided === 1 ? '' : 's'}</span>}
          </span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('contar')}>
            Contar {selected.length}
          </Button>
          <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('no_contar')}>
            No contar {selected.length}
          </Button>
          {selectedDecided > 0 && (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('')}>
              Deshacer decisión
            </Button>
          )}
          <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setSelection(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}
      {editable && selected.length === 0 && pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-800 p-4">
          <span className="mr-auto text-xs text-slate-400">
            {pending.length} por decidir · marca varias con la casilla para decidir solo esas
          </span>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide(pending, 'contar')}>
            Contar todas
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Ban className="h-4 w-4" />}
            disabled={saving}
            onClick={() => void onDecide(pending, 'no_contar')}
          >
            No contar ninguna
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={sales}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage="No hay ventas que revisar: las facturas lo resuelven todo."
        selection={editable ? { rowKey: (row) => row.order, selected: selection, onChange: setSelection } : undefined}
      />
    </>
  );
}
