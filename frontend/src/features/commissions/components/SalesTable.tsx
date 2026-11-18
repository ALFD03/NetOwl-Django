/** El detalle venta a venta de un periodo. */

import { AlertTriangle } from 'lucide-react';

import { DataTable, type Column } from '@/shared/ui';
import { CLASSIFICATION, formatDateValue, formatAmount } from '../lib/format';
import type { CommissionSale } from '../types';
import { FirstInstallment } from './pieces';

/** Las ventas con su clasificación, su motivo y las personas que cobran por ellas. */
export function SalesTable({ ventas }: { ventas: CommissionSale[] }) {
  const columns: Column<CommissionSale>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: 'cliente', sortKey: 'cliente' },
    { header: 'Instalada', accessor: (row) => formatDateValue(row.fecha_inicio), sortKey: 'fecha_inicio' },
    { header: 'Plan', accessor: 'producto', sortKey: 'producto', filterable: true },
    {
      header: 'Tipo',
      accessor: (row) => (row.pyme ? 'PYME' : 'Residencial'),
      filterable: true,
      filterValue: (row) => (row.pyme ? 'PYME' : 'Residencial'),
    },
    { header: 'Precio', accessor: (row) => formatAmount(row.precio), align: 'right', sortKey: 'precio' },
    {
      header: 'Estado actual',
      accessor: (row) => (row.cancelada_el ? `${row.estado} · ${formatDateValue(row.cancelada_el)}` : row.estado),
      sortKey: 'estado',
      filterable: true,
      filterValue: (row) => row.estado || 'Sin estado',
    },
    { header: 'Factura', accessor: (row) => row.estado_factura || '—', filterable: true, filterValue: (row) => row.estado_factura || 'Sin estado' },
    {
      header: 'Primera mensualidad',
      accessor: (row) => <FirstInstallment venta={row} />,
      filterable: true,
      filterValue: (row) => (row.factura_numero ? row.factura_pago || row.factura_estado || 'Sin estado' : 'Sin factura'),
    },
    {
      header: 'Clasificación',
      accessor: (row) => <span className={CLASSIFICATION[row.clasificacion].tone} title={row.motivo}>{CLASSIFICATION[row.clasificacion].label}</span>,
      filterable: true,
      filterValue: (row) => CLASSIFICATION[row.clasificacion].label,
    },
    { header: 'Medio', accessor: (row) => row.medio || '—', sortKey: 'medio', filterable: true, filterValue: (row) => row.medio || 'Sin medio' },
    { header: 'Supervisor', accessor: (row) => row.medio_supervisor || '—', filterable: true, filterValue: (row) => row.medio_supervisor || 'Sin supervisor' },
    { header: 'Vendedor', accessor: (row) => row.vendedor || '—', filterable: true, filterValue: (row) => row.vendedor || 'Sin vendedor' },
    { header: 'Unidades', accessor: (row) => row.unidades.join(', ') || '—', filterable: true, filterValue: (row) => row.unidades.join(', ') || 'Sin unidad' },
    {
      header: '',
      accessor: (row) => (row.avisos.length ? (
        <span title={row.avisos.join('\n')} className="text-amber-400"><AlertTriangle className="h-4 w-4" /></span>
      ) : null),
    },
  ];

  return <DataTable columns={columns} data={ventas} searchable searchPlaceholder="Buscar orden, cliente o medio..." />;
}
