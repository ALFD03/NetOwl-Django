/** El detalle venta a venta de un periodo. */

import { AlertTriangle } from 'lucide-react';

import { DataTable, type Column } from '@/shared/ui';
import { CLASIFICACION, formatoFecha, formatoMonto } from '../lib/formato';
import type { VentaComision } from '../types';

/** Las ventas con su clasificación, su motivo y las personas que cobran por ellas. */
export function VentasTabla({ ventas }: { ventas: VentaComision[] }) {
  const columnas: Column<VentaComision>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: 'cliente', sortKey: 'cliente' },
    { header: 'Instalada', accessor: (row) => formatoFecha(row.fecha_inicio), sortKey: 'fecha_inicio' },
    { header: 'Plan', accessor: 'producto', sortKey: 'producto', filterable: true },
    {
      header: 'Tipo',
      accessor: (row) => (row.pyme ? 'PYME' : 'Residencial'),
      filterable: true,
      filterValue: (row) => (row.pyme ? 'PYME' : 'Residencial'),
    },
    { header: 'Precio', accessor: (row) => formatoMonto(row.precio), align: 'right', sortKey: 'precio' },
    { header: 'Estado', accessor: 'estado', filterable: true },
    { header: 'Factura', accessor: (row) => row.estado_factura || '—', filterable: true, filterValue: (row) => row.estado_factura || 'Sin estado' },
    {
      header: 'Clasificación',
      accessor: (row) => <span className={CLASIFICACION[row.clasificacion].tone} title={row.motivo}>{CLASIFICACION[row.clasificacion].label}</span>,
      filterable: true,
      filterValue: (row) => CLASIFICACION[row.clasificacion].label,
    },
    { header: 'Medio', accessor: (row) => row.medio || '—', sortKey: 'medio', filterable: true, filterValue: (row) => row.medio || 'Sin medio' },
    { header: 'Supervisor', accessor: (row) => row.medio_supervisor || '—', filterable: true, filterValue: (row) => row.medio_supervisor || 'Sin supervisor' },
    { header: 'Vendedor', accessor: (row) => row.vendedor || '—', filterable: true, filterValue: (row) => row.vendedor || 'Sin vendedor' },
    { header: 'Coord. UN', accessor: (row) => row.coord_un || '—', filterable: true, filterValue: (row) => row.coord_un || 'Sin coordinador' },
    {
      header: '',
      accessor: (row) => (row.avisos.length ? (
        <span title={row.avisos.join('\n')} className="text-amber-400"><AlertTriangle className="h-4 w-4" /></span>
      ) : null),
    },
  ];

  return <DataTable columns={columnas} data={ventas} searchable searchPlaceholder="Buscar orden, cliente o medio..." />;
}
