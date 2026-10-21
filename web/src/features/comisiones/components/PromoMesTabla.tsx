/** Lo instalado en los días promocionales del mes: quién adelantó el pago y cuenta ya en este periodo. */

import { AlertTriangle } from 'lucide-react';

import { DataTable, StatusMessage, type Column } from '@/shared/ui';
import { formatoFecha, formatoMes, mesSiguiente, nombreMes } from '../lib/formato';
import type { InformeComision, VentaComision } from '../types';
import { PagadaEl, PrimeraMensualidad } from './piezas';

/**
 * Lo instalado desde el inicio de los días promocionales hasta el fin del mes
 * paga su primera mensualidad un mes más tarde, así que su comisión toca en el
 * periodo siguiente. Si el cliente la adelantó y estaba pagada el día del
 * corte, se paga ya en este y no vuelve a contar en el siguiente.
 */
export function PromoMesTabla({ informe, ventas }: { informe: InformeComision; ventas: VentaComision[] }) {
  const siguiente = nombreMes(mesSiguiente(informe.periodo));
  const adelantadas = ventas.filter((v) => v.adelantada).length;
  const situacion = (v: VentaComision) => (v.adelantada ? 'Adelantó: cuenta aquí' : `Pasa a ${siguiente}`);

  const columnas: Column<VentaComision>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', sticky: true },
    { header: 'Cliente', accessor: 'cliente', sortKey: 'cliente' },
    { header: 'Instalada', accessor: (row) => formatoFecha(row.fecha_inicio), sortKey: 'fecha_inicio' },
    { header: 'Plan', accessor: 'producto', sortKey: 'producto' },
    { header: 'Primera mensualidad', accessor: (row) => <PrimeraMensualidad venta={row} />, sortKey: 'factura_pago' },
    { header: 'Pagada el', accessor: (row) => <PagadaEl venta={row} />, sortKey: 'pago_fecha' },
    {
      header: 'Situación',
      accessor: (row) => <span className={row.adelantada ? 'text-emerald-400' : 'text-sky-400'} title={row.motivo}>{situacion(row)}</span>,
      sortValue: situacion,
      filterable: true,
      filterValue: situacion,
    },
    { header: 'Medio', accessor: (row) => row.medio || '—', sortKey: 'medio', filterable: true, filterValue: (row) => row.medio || 'Sin medio' },
    { header: 'Supervisor', accessor: (row) => row.medio_supervisor || '—', filterable: true, filterValue: (row) => row.medio_supervisor || 'Sin supervisor' },
  ];

  // Las que cuentan, primero: son las que se vienen a mirar.
  const filas = [...ventas].sort((a, b) => Number(Boolean(b.adelantada)) - Number(Boolean(a.adelantada)));

  return (
    <>
      <div className="space-y-3 border-b border-slate-800 p-4">
        <p className="max-w-4xl text-xs text-slate-400">
          Instalaciones del <strong className="text-slate-200">{formatoFecha(informe.inicio_promo)}</strong> al{' '}
          <strong className="text-slate-200">{formatoFecha(informe.fin)}</strong>, los días promocionales de {formatoMes(informe.periodo)}.
          {' '}Su comisión toca en {siguiente}, salvo que el cliente adelantara la primera mensualidad: pagada hasta el{' '}
          <strong className="text-slate-200">{informe.corte_adelantos ? formatoFecha(informe.corte_adelantos) : '—'}</strong>{' '}
          cuenta aquí y ya no en {siguiente}.{' '}
          <span className="text-slate-500">
            {ventas.length} instaladas · <strong className="text-emerald-300">{adelantadas}</strong> adelantaron · {ventas.length - adelantadas} pasan a {siguiente}
          </span>
        </p>
        {informe.facturas_con_fecha_pago === false && (
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
        columns={columnas}
        data={filas}
        searchable
        searchPlaceholder="Buscar orden o cliente..."
        emptyMessage="No hay instalaciones en los días promocionales de este mes."
      />
    </>
  );
}
