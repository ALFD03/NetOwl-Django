/** Las ventas agregadas a mano a un periodo, y el formulario para agregar más. */

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, DataTable, TextField, type Column } from '@/shared/ui';
import { CLASSIFICATION, formatDateValue } from '../lib/format';
import type { ManualSale } from '../types';

interface ManualSalesPanelProps {
  manuales: ManualSale[];
  editable: boolean;
  guardando: boolean;
  onAgregar: (ordenes: string[], nota: string) => Promise<boolean>;
  onQuitar: (orden: string) => void;
}

/**
 * Para lo que las reglas no recogen y hay que pagar igual: una venta agregada a
 * mano cuenta en el periodo se instalara cuando se instalara y digan lo que
 * digan sus facturas. Quién cobra sale de la propia suscripción, así que la
 * orden tiene que estar en suscripciones; y no se puede agregar si ya se pagó
 * en otro periodo cerrado. La nota es obligatoria: queda con la venta.
 */
export function ManualSalesPanel({ manuales, editable, guardando, onAgregar, onQuitar }: ManualSalesPanelProps) {
  const [ordenes, setOrders] = useState('');
  const [nota, setNote] = useState('');
  const lista = ordenes.split(/[\s,;]+/).map((other) => other.trim()).filter(Boolean);

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (await onAgregar(lista, nota.trim())) {
      setOrders('');
      setNote('');
    }
  };

  const columns: Column<ManualSale>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: (row) => row.venta?.cliente || '—' },
    { header: 'Instalada', accessor: (row) => (row.venta ? formatDateValue(row.venta.fecha_inicio) : '—') },
    {
      header: 'Situación',
      accessor: (row) => (row.venta
        ? <span className={CLASSIFICATION[row.venta.clasificacion].tone} title={row.venta.motivo}>{CLASSIFICATION[row.venta.clasificacion].label}</span>
        : <span className="text-rose-400">Ya no está en suscripciones</span>),
      sortValue: (row) => (row.venta ? CLASSIFICATION[row.venta.clasificacion].label : 'Ya no está en suscripciones'),
    },
    { header: 'Medio', accessor: (row) => row.venta?.medio || '—' },
    { header: 'Por qué', accessor: (row) => <span className="text-slate-300">{row.nota}</span> },
    {
      header: 'Agregada',
      accessor: (row) => (
        <span className="flex flex-col leading-tight">
          <span>{row.agregado_por || '—'}</span>
          <span className="text-xs text-slate-500">{formatDateValue(row.agregado_en)}</span>
        </span>
      ),
      sortKey: 'agregado_en',
    },
    {
      header: '',
      align: 'right',
      accessor: (row) => (editable ? (
        <Button size="sm" variant="outline" icon={<Trash2 className="h-4 w-4" />} disabled={guardando} onClick={() => onQuitar(row.orden)}>
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
          <form onSubmit={(e) => void enviar(e)} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <TextField
              label="Órdenes"
              placeholder="SUB123456, SUB123457"
              value={ordenes}
              onChange={(e) => setOrders(e.target.value)}
            />
            <TextField
              label="Por qué se agrega"
              placeholder="Obligatorio: queda con la venta"
              value={nota}
              maxLength={255}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" icon={<Plus className="h-4 w-4" />} isLoading={guardando} disabled={!lista.length || !nota.trim()}>
              Agregar{lista.length > 1 ? ` ${lista.length}` : ''}
            </Button>
          </form>
        )}
      </div>
      <DataTable
        columns={columns}
        data={manuales}
        searchable
        searchPlaceholder="Buscar orden..."
        emptyMessage="No hay ventas agregadas a mano en este periodo."
      />
    </>
  );
}
