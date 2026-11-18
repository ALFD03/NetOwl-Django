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
  guardando: boolean;
  /** Resuelve a `true` si se guardó: entonces se vacía la selección. */
  onDecidir: (ordenes: string[], decision: '' | ReviewDecision) => Promise<boolean>;
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
export function PreviousPromoTable({ report, sales, editable, guardando, onDecidir }: PreviousPromoTableProps) {
  const anterior = report.previous ?? { period: '', status: null };
  const mes = monthName(anterior.period);
  const firstPeriod = anterior.status === null;
  const previousEnd = previousDay(`${report.period}-01`);
  const filas = sales.filter((v) => v.review_promo);
  const toConfirm = filas.filter((v) => v.to_confirm).map((v) => v.order);
  const decidible = firstPeriod && editable;
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  // Lo seleccionado que sigue en la lista (tras una recarga puede no estar).
  const elegidas = filas.filter((v) => seleccion.has(v.order));
  const elegidasDecididas = elegidas.filter((v) => v.decision === 'ya_pagada' || v.decision === 'normal').length;

  const decidirSeleccion = async (decision: '' | ReviewDecision) => {
    if (await onDecidir(elegidas.map((v) => v.order), decision)) setSeleccion(new Set());
  };

  const situation = (v: CommissionSale): { texto: string; tono: string } => {
    if (v.to_confirm) return { texto: 'Por confirmar', tono: 'text-amber-400' };
    if (v.decision === 'normal') return { texto: 'Toca aquí', tono: 'text-emerald-400' };
    return { texto: `Cobrada en ${mes}`, tono: 'text-slate-400' };
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
        return <span className={s.tono} title={row.reason}>{s.texto}</span>;
      },
      sortValue: (row) => situation(row).texto,
      filterable: true,
      filterValue: (row) => situation(row).texto,
    },
    { header: 'Medio', accessor: (row) => row.channel || '—', sortKey: 'channel', filterable: true, filterValue: (row) => row.channel || 'Sin medio' },
    ...(decidible ? [{
      header: 'Decisión',
      align: 'right',
      accessor: (row: CommissionSale) => {
        if (row.decision === 'ya_pagada' || row.decision === 'normal') {
          return (
            <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir([row.order], '')}>
              Deshacer
            </Button>
          );
        }
        if (!row.to_confirm) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir([row.order], 'ya_pagada')}>
              Ya cobrada
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir([row.order], 'normal')}>
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
          <strong className="text-slate-200">{formatDateValue(previousEnd)}</strong>, los días promocionales de {formatMonth(anterior.period)}.
          {' '}Las que pagaron la primera mensualidad en su fecha tocan aquí y no se revisan; solo se ven las que la adelantaron y pudieron cobrarse ya en {mes}.
          {firstPeriod
            ? <> {formatMonth(anterior.period)} no tiene periodo en el sistema, así que se confirma aquí cuáles se cobraron: las pagadas hasta el <strong className="text-slate-200">{report.previous_cutoff ? formatDateValue(report.previous_cutoff) : '—'}</strong>.</>
            : anterior.status === 'cerrado'
              ? <> Lo dice el cierre de {mes}: estas se cobraron allí y no vuelven a contar.</>
              : null}
        </p>
        {anterior.status === 'borrador' && (
          <StatusMessage
            status={{ type: 'warning', text: `El periodo ${anterior.period} sigue en borrador: hasta que se cierre no se sabe qué se cobró allí, y este no se puede cerrar.` }}
            icon={<AlertTriangle />}
          />
        )}
        {decidible && elegidas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
            <span className="mr-auto text-[10px] font-black uppercase tracking-wider text-sky-300">
              {elegidas.length} seleccionada{elegidas.length === 1 ? '' : 's'}
              {elegidasDecididas > 0 && <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">{elegidasDecididas} ya confirmada{elegidasDecididas === 1 ? '' : 's'}</span>}
            </span>
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('ya_pagada')}>
              Ya cobradas en {mes} ({elegidas.length})
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('normal')}>
              Tocan aquí ({elegidas.length})
            </Button>
            {elegidasDecididas > 0 && (
              <Button size="sm" variant="outline" icon={<Undo2 className="h-4 w-4" />} disabled={guardando} onClick={() => void decidirSeleccion('')}>
                Deshacer
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setSeleccion(new Set())}>
              Quitar selección
            </Button>
          </div>
        )}
        {decidible && elegidas.length === 0 && toConfirm.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-amber-300">
              {toConfirm.length} por confirmar <span className="text-slate-400">· marca varias con la casilla para decidir solo esas</span>
            </span>
            <Button size="sm" variant="outline" icon={<Ban className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir(toConfirm, 'ya_pagada')}>
              Todas ya cobradas en {mes}
            </Button>
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} disabled={guardando} onClick={() => void onDecidir(toConfirm, 'normal')}>
              Todas tocan aquí
            </Button>
          </div>
        )}
      </div>
      <DataTable
        columns={columns}
        data={filas}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage={`Nada que revisar: ninguna adelantó el pago en ${mes}, o ya lo resolvió otra regla.`}
        selection={decidible ? { rowKey: (row) => row.order, selected: seleccion, onChange: setSeleccion } : undefined}
      />
    </>
  );
}
