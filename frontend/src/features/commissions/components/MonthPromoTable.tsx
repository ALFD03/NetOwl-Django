/** Lo instalado en los días promocionales del mes: quién adelantó el pago y cuenta ya en este periodo. */

import { AlertTriangle } from 'lucide-react';

import { DataTable, StatusMessage, type Column } from '@/shared/ui';
import { formatDateValue, formatMonth, nextMonth, monthName } from '../lib/format';
import type { CommissionReport, CommissionSale } from '../types';
import { PaidOn, FirstInstallment } from './pieces';

/**
 * Lo instalado desde el inicio de los días promocionales hasta el fin del mes
 * paga su primera mensualidad un mes más tarde, así que su comisión toca en el
 * periodo siguiente. Si el cliente la adelantó y estaba pagada el día del
 * corte, se paga ya en este y no vuelve a contar en el siguiente.
 */
export function MonthPromoTable({ report, sales }: { report: CommissionReport; sales: CommissionSale[] }) {
  const next = monthName(nextMonth(report.period));
  const advanced = sales.filter((v) => v.is_advanced).length;
  const situation = (v: CommissionSale) => (v.is_advanced ? 'Adelantó: cuenta aquí' : `Pasa a ${next}`);

  const columns: Column<CommissionSale>[] = [
    { header: 'Orden', accessor: 'order', sortKey: 'order', sticky: true },
    { header: 'Cliente', accessor: 'client', sortKey: 'client' },
    { header: 'Instalada', accessor: (row) => formatDateValue(row.since_date), sortKey: 'since_date' },
    { header: 'Plan', accessor: 'product', sortKey: 'product' },
    { header: 'Primera mensualidad', accessor: (row) => <FirstInstallment sale={row} />, sortKey: 'invoice_payment' },
    { header: 'Pagada el', accessor: (row) => <PaidOn sale={row} />, sortKey: 'paid_date' },
    {
      header: 'Situación',
      accessor: (row) => <span className={row.is_advanced ? 'text-emerald-400' : 'text-sky-400'} title={row.reason}>{situation(row)}</span>,
      sortValue: situation,
      filterable: true,
      filterValue: situation,
    },
    { header: 'Medio', accessor: (row) => row.channel || '—', sortKey: 'channel', filterable: true, filterValue: (row) => row.channel || 'Sin medio' },
    { header: 'Supervisor', accessor: (row) => row.supervisor_channel || '—', filterable: true, filterValue: (row) => row.supervisor_channel || 'Sin supervisor' },
  ];

  // Las que cuentan, primero: son las que se vienen a mirar.
  const rows = [...sales].sort((a, b) => Number(Boolean(b.is_advanced)) - Number(Boolean(a.is_advanced)));

  return (
    <>
      <div className="space-y-3 border-b border-slate-800 p-4">
        <p className="max-w-4xl text-xs text-slate-400">
          Instalaciones del <strong className="text-slate-200">{formatDateValue(report.promo_start)}</strong> al{' '}
          <strong className="text-slate-200">{formatDateValue(report.end)}</strong>, los días promocionales de {formatMonth(report.period)}.
          {' '}Su comisión toca en {next}, salvo que el cliente adelantara la primera mensualidad: pagada hasta el{' '}
          <strong className="text-slate-200">{report.advance_cutoff ? formatDateValue(report.advance_cutoff) : '—'}</strong>{' '}
          cuenta aquí y ya no en {next}.{' '}
          <span className="text-slate-500">
            {sales.length} instaladas · <strong className="text-emerald-300">{advanced}</strong> adelantaron · {sales.length - advanced} pasan a {next}
          </span>
        </p>
        {report.invoices_with_paid_date === false && (
          <StatusMessage
            status={{
              type: 'warning',
              text: 'El export de facturas cargado no trae «Fecha del último pago»: el pago se fecha por «Última actualización el» o, si tampoco está, por «Creado el», que es solo una aproximación. Vuelve a importar las facturas con esas columnas.',
            }}
            icon={<AlertTriangle />}
          />
        )}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage="No hay instalaciones en los días promocionales de este mes."
      />
    </>
  );
}
