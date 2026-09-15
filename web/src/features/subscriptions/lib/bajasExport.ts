/**
 * Las columnas de la hoja de bajas y el nombre con que se descarga.
 *
 * Viven aparte del botón porque las tres páginas exportan exactamente la misma
 * ficha y solo cambian el recorte: el periodo entero en Results, un site o una
 * zona en Ventas, un coordinador o una zona en Unidades de Negocio.
 */

import type { ExcelColumn } from '@/shared/lib/excel';
import type { BajaDetalle } from '@/shared/types/subscriptions';

export const BAJAS_COLUMNS: ExcelColumn<BajaDetalle>[] = [
  { header: 'Orden', value: (b) => b.orden, width: 18 },
  { header: 'Cliente', value: (b) => b.cliente, width: 34 },
  { header: 'Cédula / RIF', value: (b) => b.cedula, width: 16 },
  { header: 'Sucursal', value: (b) => b.sucursal, width: 18 },
  { header: 'Zona', value: (b) => b.zona, width: 22 },
  { header: 'Campaña', value: (b) => b.campanna, width: 22 },
  { header: 'Producto', value: (b) => b.producto, width: 30 },
  { header: 'Tipo de Servicio', value: (b) => b.tipo_servicio, width: 20 },
  // Número, no texto: la hoja tiene que poder sumar la facturación perdida.
  { header: 'Subtotal', value: (b) => b.subtotal, format: '#,##0.00', width: 14 },
  { header: 'Fecha de Inicio', value: (b) => b.fecha_inicio, width: 18 },
  { header: 'Estado de la Suscripción', value: (b) => b.estado_suscripcion, width: 24 },
  { header: 'Teléfono 1', value: (b) => b.phone1, width: 16 },
  { header: 'Teléfono 2', value: (b) => b.phone2, width: 16 },
];

/**
 * Nombre del archivo: qué se exportó y de qué cierre.
 *
 * `downloadRowsAsExcel` ya lo sanea, así que aquí solo se compone.
 */
export const bajasFileName = (period: string, alcance: string): string =>
  `Bajas ${alcance} ${period}`.replace(/\s+/g, ' ').trim();

/**
 * Los nodos `"Zona - Sucursal"` de un grupo, para acotar la exportación.
 *
 * Se manda lo que el grupo tiene **en pantalla**, ya recortado por los filtros
 * de tecnología, sucursal y búsqueda, en vez de que el backend vuelva a agrupar
 * el catálogo por su cuenta.
 *
 * Es el par completo y no solo la zona: una zona puede estar repartida entre
 * varias sucursales —Los Parques tiene NETCOM y NYC— y cada par es una fila
 * distinta del reporte. Filtrando por la zona sola, exportar una de ellas traía
 * las bajas de las dos.
 */
export const nodosDeGrupo = (
  nodos: { zona?: string; sucursal?: string; zona_sucursal?: string }[] | undefined,
): string[] => [
  ...new Set(
    (nodos ?? [])
      .map((nodo) => (
        nodo.zona_sucursal
        ?? [nodo.zona ?? '', nodo.sucursal ?? 'Sin Sucursal'].join(' - ')
      ).trim())
      .filter(Boolean),
  ),
];
