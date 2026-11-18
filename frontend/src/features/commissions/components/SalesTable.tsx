/** El detalle venta a venta de un periodo. */

import { AlertTriangle } from 'lucide-react';

import { DataTable, type Column } from '@/shared/ui';
import { CLASSIFICATION, formatDateValue, formatAmount } from '../lib/format';
import type { CommissionSale } from '../types';
import { FirstInstallment } from './pieces';

/** Las ventas con su clasificación, su motivo y las personas que cobran por ellas. */
export function SalesTable({ sales }: { sales: CommissionSale[] }) {
  const columns: Column<CommissionSale>[] = [
    { header: 'Orden', accessor: 'order', sortKey: 'order', sticky: true },
    { header: 'Cliente', accessor: 'client', sortKey: 'client' },
    { header: 'Instalada', accessor: (row) => formatDateValue(row.since_date), sortKey: 'since_date' },
    { header: 'Plan', accessor: 'product', sortKey: 'product', filterable: true },
    {
      header: 'Tipo',
      accessor: (row) => (row.sme ? 'PYME' : 'Residencial'),
      filterable: true,
      filterValue: (row) => (row.sme ? 'PYME' : 'Residencial'),
    },
    { header: 'Precio', accessor: (row) => formatAmount(row.price), align: 'right', sortKey: 'price' },
    {
      header: 'Estado actual',
      accessor: (row) => (row.cancelled_on ? `${row.status} · ${formatDateValue(row.cancelled_on)}` : row.status),
      sortKey: 'status',
      filterable: true,
      filterValue: (row) => row.status || 'Sin estado',
    },
    { header: 'Factura', accessor: (row) => row.billing_status || '—', filterable: true, filterValue: (row) => row.billing_status || 'Sin estado' },
    {
      header: 'Primera mensualidad',
      accessor: (row) => <FirstInstallment sale={row} />,
      filterable: true,
      filterValue: (row) => (row.invoice_number ? row.invoice_payment || row.invoice_status || 'Sin estado' : 'Sin factura'),
    },
    {
      header: 'Clasificación',
      accessor: (row) => <span className={CLASSIFICATION[row.classification].tone} title={row.reason}>{CLASSIFICATION[row.classification].label}</span>,
      filterable: true,
      filterValue: (row) => CLASSIFICATION[row.classification].label,
    },
    { header: 'Medio', accessor: (row) => row.channel || '—', sortKey: 'channel', filterable: true, filterValue: (row) => row.channel || 'Sin medio' },
    { header: 'Supervisor', accessor: (row) => row.supervisor_channel || '—', filterable: true, filterValue: (row) => row.supervisor_channel || 'Sin supervisor' },
    { header: 'Vendedor', accessor: (row) => row.seller || '—', filterable: true, filterValue: (row) => row.seller || 'Sin vendedor' },
    { header: 'Unidades', accessor: (row) => row.units.join(', ') || '—', filterable: true, filterValue: (row) => row.units.join(', ') || 'Sin unidad' },
    {
      header: '',
      accessor: (row) => (row.warnings.length ? (
        <span title={row.warnings.join('\n')} className="text-amber-400"><AlertTriangle className="h-4 w-4" /></span>
      ) : null),
    },
  ];

  return <DataTable columns={columns} data={sales} searchable searchPlaceholder="Buscar orden, cliente o medio..." />;
}
