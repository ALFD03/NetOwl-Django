/** El libro de Excel del informe de comisiones: una hoja de pagos y una de ventas. */

import { downloadSheetsAsExcel, type ExcelColumn } from '@/shared/lib/excel';
import { CLASIFICACION } from './formato';
import type { CargoVentas, PagoComision, VentaComision } from '../types';

const MONTO = '#,##0.00';

/** Descarga los pagos y el detalle venta a venta del periodo. */
export async function exportarInforme(
  periodo: string,
  pagos: PagoComision[],
  ventas: VentaComision[],
  etiquetaCargo: (cargo: CargoVentas) => string,
): Promise<void> {
  const columnasPagos: ExcelColumn<PagoComision>[] = [
    { header: 'Persona', value: (p) => p.nombre, width: 30 },
    { header: 'Cargo', value: (p) => etiquetaCargo(p.cargo), width: 26 },
    { header: 'Medio', value: (p) => p.medio, width: 24 },
    { header: 'Ventas propias', value: (p) => p.ventas_propias, format: '#,##0' },
    { header: 'Ventas de equipo', value: (p) => p.ventas_equipo, format: '#,##0' },
    { header: 'Ventas PYME', value: (p) => p.ventas_pyme, format: '#,##0' },
    { header: 'Monto propias', value: (p) => p.monto_propias, format: MONTO },
    { header: 'Monto equipo', value: (p) => p.monto_equipo, format: MONTO },
    { header: 'Bruto', value: (p) => p.bruto, format: MONTO },
    { header: 'Cumplimiento %', value: (p) => p.factor_pct, format: '0.00' },
    { header: 'Crecimiento %', value: (p) => p.crecimiento_pct, format: '0.00' },
    { header: 'Monto PYME', value: (p) => p.monto_pyme, format: MONTO },
    { header: 'A pagar', value: (p) => p.neto, format: MONTO },
    { header: 'Avisos', value: (p) => p.avisos.join(' · '), width: 50 },
  ];
  const columnasVentas: ExcelColumn<VentaComision>[] = [
    { header: 'Orden', value: (v) => v.orden, width: 16 },
    { header: 'Cliente', value: (v) => v.cliente, width: 30 },
    { header: 'Instalada', value: (v) => v.fecha_inicio, width: 12 },
    { header: 'Sucursal', value: (v) => v.sucursal },
    { header: 'Zona', value: (v) => v.zona },
    { header: 'Plan', value: (v) => v.producto, width: 28 },
    { header: 'Tipo', value: (v) => (v.pyme ? 'PYME' : 'Residencial') },
    { header: 'Precio', value: (v) => v.precio, format: MONTO },
    { header: 'Estado', value: (v) => v.estado },
    { header: 'Estado de la factura', value: (v) => v.estado_factura, width: 22 },
    { header: 'Clasificación', value: (v) => CLASIFICACION[v.clasificacion].label },
    { header: 'Motivo', value: (v) => v.motivo, width: 40 },
    { header: 'Medio', value: (v) => v.medio, width: 24 },
    { header: 'Medio/Supervisor', value: (v) => v.medio_supervisor, width: 24 },
    { header: 'Vendedor', value: (v) => v.vendedor, width: 30 },
    { header: 'Coordinador de UN', value: (v) => v.coord_un, width: 24 },
    { header: 'Avisos', value: (v) => v.avisos.join(' · '), width: 50 },
  ];

  await downloadSheetsAsExcel(
    [
      { sheetName: 'Pagos', rows: pagos, columns: columnasPagos },
      { sheetName: 'Ventas', rows: ventas, columns: columnasVentas },
    ],
    `Comisiones ${periodo}`,
  );
}
