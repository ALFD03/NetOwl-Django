/** Las ventas agregadas a mano a un periodo, y el formulario para agregar más. */

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, DataTable, TextField, type Column } from '@/shared/ui';
import { CLASSIFICATION, formatDateValue } from '../lib/format';
import type { ManualSale } from '../types';

interface ManualSalesPanelProps {
  manual_sales: ManualSale[];
  editable: boolean;
  saving: boolean;
  onAdd: (orders: string[], note: string) => Promise<boolean>;
  onRemove: (order: string) => void;
}

/**
 * Para lo que las reglas no recogen y hay que pagar igual: una venta agregada a
 * mano cuenta en el periodo se instalara cuando se instalara y digan lo que
 * digan sus facturas. Quién cobra sale de la propia suscripción, así que la
 * orden tiene que estar en suscripciones; y no se puede agregar si ya se pagó
 * en otro periodo cerrado. La nota es obligatoria: queda con la venta.
 */
export function ManualSalesPanel({ manual_sales, editable, saving, onAdd, onRemove }: ManualSalesPanelProps) {
  const [orders, setOrders] = useState('');
  const [note, setNote] = useState('');
  const list = orders.split(/[\s,;]+/).map((other) => other.trim()).filter(Boolean);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (await onAdd(list, note.trim())) {
      setOrders('');
      setNote('');
    }
  };

  const columns: Column<ManualSale>[] = [
    { header: 'Orden', accessor: 'order', sortKey: 'order', sticky: true },
    { header: 'Cliente', accessor: (row) => row.sale?.client || '—' },
    { header: 'Instalada', accessor: (row) => (row.sale ? formatDateValue(row.sale.since_date) : '—') },
    {
      header: 'Situación',
      accessor: (row) => (row.sale
        ? <span className={CLASSIFICATION[row.sale.classification].tone} title={row.sale.reason}>{CLASSIFICATION[row.sale.classification].label}</span>
        : <span className="text-rose-400">Ya no está en suscripciones</span>),
      sortValue: (row) => (row.sale ? CLASSIFICATION[row.sale.classification].label : 'Ya no está en suscripciones'),
    },
    { header: 'Medio', accessor: (row) => row.sale?.channel || '—' },
    { header: 'Por qué', accessor: (row) => <span className="text-slate-300">{row.note}</span> },
    {
      header: 'Agregada',
      accessor: (row) => (
        <span className="flex flex-col leading-tight">
          <span>{row.added_by || '—'}</span>
          <span className="text-xs text-slate-500">{formatDateValue(row.added_at)}</span>
        </span>
      ),
      sortKey: 'added_at',
    },
    {
      header: '',
      align: 'right',
      accessor: (row) => (editable ? (
        <Button size="sm" variant="outline" icon={<Trash2 className="h-4 w-4" />} disabled={saving} onClick={() => onRemove(row.order)}>
          Quitar
        </Button>
      ) : null),
    },
  ];

  return (
    <>
      <div className="space-y-3 border-b border-slate-800 p-4">
        <p className="max-w-4xl text-xs text-slate-400">
          Una venta agregada a mano cuenta en este periodo se instalara cuando se instalara y digan lo que digan sus facturas.
          Cobran las personas de la suscripción (medio, supervisor y vendedor). No se puede agregar una venta que ya se pagó en
          otro periodo cerrado.
        </p>
        {editable && (
          <form onSubmit={(e) => void send(e)} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <TextField
              label="Órdenes"
              placeholder="SUB123456, SUB123457"
              value={orders}
              onChange={(e) => setOrders(e.target.value)}
            />
            <TextField
              label="Por qué se agrega"
              placeholder="Obligatorio: queda con la venta"
              value={note}
              maxLength={255}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" icon={<Plus className="h-4 w-4" />} isLoading={saving} disabled={!list.length || !note.trim()}>
              Agregar{list.length > 1 ? ` ${list.length}` : ''}
            </Button>
          </form>
        )}
      </div>
      <DataTable
        columns={columns}
        data={manual_sales}
        searchable
        searchPlaceholder="Buscar orden..."
        emptyMessage="No hay ventas agregadas a mano en este periodo."
      />
    </>
  );
}
