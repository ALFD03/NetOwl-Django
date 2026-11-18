/** Lo instalado en los días promocionales del mes anterior que pudo cobrarse ya en él. */

import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Undo2, X } from 'lucide-react';

import { Button, DataTable, StatusMessage, type Column } from '@/shared/ui';
import { previousDay, formatDateValue, formatMonth, monthName } from '../lib/format';
import type { ReviewDecision, CommissionReport, CommissionSale } from '../types';
import { PaidOn, FirstInstallment } from './pieces';

interface PreviousPromoTableProps {
  report: CommissionReport;
  /** Las ventas del periodo instaladas en los días promocionales del mes anterior. */
  sales: CommissionSale[];
  editable: boolean;
  saving: boolean;
  /** Resuelve a `true` si se guardó: entonces se vacía la selección. */
  onDecide: (orders: string[], decision: '' | ReviewDecision) => Promise<boolean>;
}

/**
 * Lo instalado en los días promocionales del mes anterior toca en este periodo,
 * salvo que el cliente adelantara la primera mensualidad y se cobrara ya allí.
 * Aquí solo se ve eso: lo que pagó en su fecha toca aquí sin más, y lo que otra
 * regla ya resolvió (no pagada, excluida, decidida en Revisión) no se repite.
 *
 * - Con el periodo anterior **cerrado**, lo dice su cierre: se listan las que
 *   cobraron allí, y no hay nada que decidir.
 * - **Sin periodo anterior** (el primero del sistema) se cobró fuera de él: lo
 *   pagado hasta el corte de ese mes se confirma a mano, una a una, las
 *   marcadas con la casilla o todas las pendientes de una vez, y hasta que esté
 *   todo confirmado no se cierra.
 */
export function PreviousPromoTable({ report, sales, editable, saving, onDecide }: PreviousPromoTableProps) {
  const previous = report.previous ?? { period: '', status: null };
  const month = monthName(previous.period);
  const firstPeriod = previous.status === null;
  const previousEnd = previousDay(`${report.period}-01`);
  const rows = sales.filter((v) => v.review_promo);
  const toConfirm = rows.filter((v) => v.to_confirm).map((v) => v.order);
  const decidable = firstPeriod && editable;
  const [selection, setSelection] = useState<Set<string>>(new Set());
  // Lo seleccionado que sigue en la lista (tras una recarga puede no estar).
  const selected = rows.filter((v) => selection.has(v.order));
  const selectedDecided = selected.filter((v) => v.decision === 'ya_pagada' || v.decision === 'normal').length;

  const decideSelection = async (decision: '' | ReviewDecision) => {
    if (await onDecide(selected.map((v) => v.order), decision)) setSelection(new Set());
  };

  const situation = (v: CommissionSale): { text: string; tone: string } => {
    if (v.to_confirm) return { text: 'Por confirmar', tone: 'text-amber-400' };
    if (v.decision === 'normal') return { text: 'Toca aquí', tone: 'text-emerald-400' };
    return { text: `Cobrada en ${month}`, tone: 'text-slate-400' };
  };

  const columns: Column<CommissionSale>[] = [
    { header: 'Orden', accessor: 'order', sortKey: 'order', sticky: true },
    { header: 'Cliente', accessor: 'client', sortKey: 'client' },
    { header: 'Instalada', accessor: (row) => formatDateValue(row.since_date), sortKey: 'since_date' },
    { header: 'Primera mensualidad', accessor: (row) => <FirstInstallment sale={row} />, sortKey: 'invoice_payment' },
    { header: 'Pagada el', accessor: (row) => <PaidOn sale={row} />, sortKey: 'paid_date' },
    {
      header: 'Situación',
      accessor: (row) => {
        const s = situation(row);
        return <span className={s.tone} title={row.reason}>{s.text}</span>;
      },
      sortValue: (row) => situation(row).text,
      filterable: true,
      filterValue: (row) => situation(row).text,
    },
    { header: 'Medio', accessor: (row) => row.channel || '—', sortKey: 'channel', filterable: true, filterValue: (row) => row.channel || 'Sin medio' },
    ...(decidable ? [{
      header: 'Decisión',
      align: 'right',
      accessor: (row: CommissionSale) => {
        if (row.decision === 'ya_pagada' || row.decision === 'normal') {
          return (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide([row.order], '')}>
              Deshacer
            </Button>
          );
        }
        if (!row.to_confirm) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide([row.order], 'ya_pagada')}>
              Ya cobrada
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide([row.order], 'normal')}>
              Toca aquí
            </Button>
          </div>
        );
      },
    } satisfies Column<CommissionSale>] : []),
  ];

  return (
    <>
      <div className="space-y-3 border-b border-slate-800 p-4">
        <p className="max-w-4xl text-xs text-slate-400">
          Instalaciones del <strong className="text-slate-200">{formatDateValue(report.start)}</strong> al{' '}
          <strong className="text-slate-200">{formatDateValue(previousEnd)}</strong>, los días promocionales de {formatMonth(previous.period)}.
          {' '}Las que pagaron la primera mensualidad en su fecha tocan aquí y no se revisan; solo se ven las que la adelantaron y pudieron cobrarse ya en {month}.
          {firstPeriod
            ? <> {formatMonth(previous.period)} no tiene periodo en el sistema, así que se confirma aquí cuáles se cobraron: las pagadas hasta el <strong className="text-slate-200">{report.previous_cutoff ? formatDateValue(report.previous_cutoff) : '—'}</strong>.</>
            : previous.status === 'cerrado'
              ? <> Lo dice el cierre de {month}: estas se cobraron allí y no vuelven a contar.</>
              : null}
        </p>
        {previous.status === 'borrador' && (
          <StatusMessage
            status={{ type: 'warning', text: `El periodo ${previous.period} sigue en borrador: hasta que se cierre no se sabe qué se cobró allí, y este no se puede cerrar.` }}
            icon={<AlertTriangle />}
          />
        )}
        {decidable && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
            <span className="mr-auto text-[10px] font-black uppercase tracking-wider text-sky-300">
              {selected.length} seleccionada{selected.length === 1 ? '' : 's'}
              {selectedDecided > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">{selectedDecided} ya confirmada{selectedDecided === 1 ? '' : 's'}</span>}
            </span>
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('ya_pagada')}>
              Ya cobradas en {month} ({selected.length})
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('normal')}>
              Tocan aquí ({selected.length})
            </Button>
            {selectedDecided > 0 && (
              <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={saving} onClick={() => void decideSelection('')}>
                Deshacer
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setSelection(new Set())}>
              Quitar selección
            </Button>
          </div>
        )}
        {decidable && selected.length === 0 && toConfirm.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-amber-300">
              {toConfirm.length} por confirmar <span className="text-slate-400">· marca varias con la casilla para decidir solo esas</span>
            </span>
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide(toConfirm, 'ya_pagada')}>
              Todas ya cobradas en {month}
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={saving} onClick={() => void onDecide(toConfirm, 'normal')}>
              Todas tocan aquí
            </Button>
          </div>
        )}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage={`Nada que revisar: ninguna adelantó el pago en ${month}, o ya lo resolvió otra regla.`}
        selection={decidable ? { rowKey: (row) => row.order, selected: selection, onChange: setSelection } : undefined}
      />
    </>
  );
}
