/** La tabla de pagos de un cargo, con el cumplimiento o el crecimiento editables. */

import { useState } from 'react';
import { AlertTriangle, Check, Pencil } from 'lucide-react';

import { DataTable, type Column } from '@/shared/ui';
import { formatoMonto, formatoPct } from '../lib/formato';
import type { CargoVentas, PagoComision } from '../types';

interface ValorEditableProps {
  valor: number | null;
  /** Lo que se ve cuando no hay valor escrito. */
  vacio: string;
  editable: boolean;
  onGuardar: (valor: number | null) => void;
}

/**
 * Un porcentaje que se escribe en la propia fila. Vacío lo borra: el
 * cumplimiento vuelve a "sin definir" y el crecimiento al calculado.
 */
function ValorEditable({ valor, vacio, editable, onGuardar }: ValorEditableProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));

  if (!editando) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className={valor === null ? 'text-amber-400' : ''}>{valor === null ? vacio : formatoPct(valor)}</span>
        {editable && (
          <button
            type="button"
            title="Editar"
            className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
            onClick={(e) => {
              e.stopPropagation();
              setTexto(valor === null ? '' : String(valor));
              setEditando(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  const guardar = () => {
    setEditando(false);
    const nuevo = texto.trim() === '' ? null : Number(texto);
    if (nuevo !== valor && (nuevo === null || Number.isFinite(nuevo))) onGuardar(nuevo);
  };

  return (
    <span className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        step="any"
        autoFocus
        className="w-20 rounded border border-slate-700 bg-surface-tertiary px-2 py-1 text-right text-xs text-white"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar();
          if (e.key === 'Escape') setEditando(false);
        }}
      />
      <button type="button" title="Guardar" className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10" onClick={guardar}>
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

interface PagosTablaProps {
  cargo: CargoVentas;
  pagos: PagoComision[];
  /** Si se pueden escribir cumplimientos y crecimientos (borrador y permiso de gestión). */
  editable: boolean;
  onCumplimiento: (personaId: number, valor: number | null) => void;
  onCrecimiento: (personaId: number, valor: number | null) => void;
  onVerVentas: (pago: PagoComision) => void;
}

/**
 * Las columnas cambian con el cargo porque cada uno cobra por cosas distintas:
 * el asesor por tramo, el supervisor y el coordinador de oficina por equipo y
 * cumplimiento, el coordinador de UN por equipo y crecimiento. La PYME es de
 * cualquiera que la venda.
 */
export function PagosTabla({ cargo, pagos, editable, onCumplimiento, onCrecimiento, onVerVentas }: PagosTablaProps) {
  const avisos: Column<PagoComision> = {
    header: '',
    accessor: (row) => (row.avisos.length ? (
      <span title={row.avisos.join('\n')} className="text-amber-400">
        <AlertTriangle className="h-4 w-4" />
      </span>
    ) : null),
  };
  const persona: Column<PagoComision>[] = [
    { header: 'Persona', accessor: 'nombre', sortKey: 'nombre', sticky: true },
    { header: 'Medio', accessor: 'medio', sortKey: 'medio' },
  ];
  const pyme: Column<PagoComision>[] = [
    { header: 'PYME', accessor: 'ventas_pyme', align: 'right', sortKey: 'ventas_pyme' },
    { header: 'Monto PYME', accessor: (row) => formatoMonto(row.monto_pyme), align: 'right', sortKey: 'monto_pyme' },
  ];
  const neto: Column<PagoComision> = {
    header: 'A pagar',
    accessor: (row) => <strong className="text-white">{formatoMonto(row.neto)}</strong>,
    align: 'right',
    sortKey: 'neto',
  };

  let columnas: Column<PagoComision>[];
  if (cargo === 'asesor') {
    columnas = [
      ...persona,
      { header: 'Ventas', accessor: 'ventas_propias', align: 'right', sortKey: 'ventas_propias' },
      {
        header: 'Tramo',
        accessor: (row) => `desde ${row.detalle.tramo_desde ?? 0} · ${formatoMonto(row.detalle.monto_por_venta)} c/u`,
      },
      { header: 'Pagadas', accessor: (row) => row.detalle.ventas_pagadas ?? 0, align: 'right' },
      { header: 'Residencial', accessor: (row) => formatoMonto(row.monto_propias), align: 'right', sortKey: 'monto_propias' },
      ...pyme,
      neto,
      avisos,
    ];
  } else if (cargo === 'coord_un') {
    columnas = [
      ...persona,
      { header: 'Unidades', accessor: (row) => row.unidades.join(', ') || '—' },
      {
        header: 'Crecimiento',
        align: 'right',
        accessor: (row) => (
          <ValorEditable
            key={`${row.persona_id}-${row.crecimiento_pct}`}
            valor={row.crecimiento_pct}
            vacio="desconocido"
            editable={editable}
            onGuardar={(valor) => onCrecimiento(row.persona_id, valor)}
          />
        ),
      },
      { header: 'Equipo', accessor: 'ventas_equipo', align: 'right', sortKey: 'ventas_equipo' },
      { header: 'Por venta', accessor: (row) => formatoMonto(row.detalle.monto_por_venta_equipo), align: 'right' },
      { header: 'Propias', accessor: 'ventas_propias', align: 'right', sortKey: 'ventas_propias' },
      { header: 'Bruto', accessor: (row) => formatoMonto(row.bruto), align: 'right', sortKey: 'bruto' },
      ...pyme,
      neto,
      avisos,
    ];
  } else {
    columnas = [
      ...persona,
      { header: 'Equipo', accessor: 'ventas_equipo', align: 'right', sortKey: 'ventas_equipo' },
      { header: 'Propias', accessor: 'ventas_propias', align: 'right', sortKey: 'ventas_propias' },
      { header: 'Bruto', accessor: (row) => formatoMonto(row.bruto), align: 'right', sortKey: 'bruto' },
      {
        header: 'Cumplimiento',
        align: 'right',
        accessor: (row) => (
          <ValorEditable
            key={`${row.persona_id}-${row.cumplimiento_pct}`}
            valor={row.cumplimiento_pct}
            vacio="sin definir"
            editable={editable}
            onGuardar={(valor) => onCumplimiento(row.persona_id, valor)}
          />
        ),
      },
      ...pyme,
      neto,
      avisos,
    ];
  }

  return (
    <DataTable
      columns={columnas}
      data={pagos}
      searchable
      searchPlaceholder="Buscar persona..."
      emptyMessage="Nadie con este cargo cobra en el periodo."
      onRowClick={onVerVentas}
    />
  );
}
